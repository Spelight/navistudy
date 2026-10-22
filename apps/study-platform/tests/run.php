<?php
declare(strict_types=1);
putenv('NAVISTUDY_ADMIN_USERNAME=Dxir');

$root = dirname(__DIR__);
$data = $root . '/test-output/' . bin2hex(random_bytes(4));
putenv('NAVISTUDY_DATA_DIR=' . $data);
putenv('NAVITOOLS_DATA_DIR=' . $data . '/tools');
putenv('NAVISTUDY_COOKIE_SECURE=0');
require_once $root . '/src/bootstrap.php';
require_once $root . '/src/Database.php';
require_once $root . '/src/LegacyImporter.php';
require_once $root . '/src/AuthService.php';
require_once $root . '/src/SyncService.php';
require_once $root . '/src/AdminService.php';
require_once $root . '/src/AnalyticsService.php';

use NaviStudy\ApiException;
use NaviStudy\AdminService;
use NaviStudy\AuthService;
use NaviStudy\AnalyticsService;
use NaviStudy\Config;
use NaviStudy\Database;
use NaviStudy\LegacyImporter;
use NaviStudy\SyncService;

function check(bool $value, string $message): void { if (!$value) throw new RuntimeException($message); }
function expectCode(callable $callback, string $code): void { try { $callback(); } catch (ApiException $error) { check($error->errorCode === $code, "Expected $code, got {$error->errorCode}"); return; } throw new RuntimeException("Expected $code"); }

$config = Config::load($root);
$db = new Database($config);
$db->migrateAll();
$legacy = new LegacyImporter($config, $db);
$legacy->importFile('words', __DIR__ . '/fixtures/legacy-words.json', time() + 2592000);
$legacy->importFile('mt', __DIR__ . '/fixtures/legacy-mt.json', time() + 2592000);
$auth = new AuthService($config, $db);
$sync = new SyncService($config, $db);
$analytics = new AnalyticsService($config, $db);
$adminService = new AdminService($config, $db, $analytics);

expectCode(fn() => $auth->login(['username'=>'旧用户','password'=>'任意密码','deviceId'=>'legacy-login','deviceName'=>'Legacy','clientId'=>'navistudy-wechat']), 'legacy_registration_required');
expectCode(fn() => $auth->login(['username'=>'不存在用户','password'=>'任意密码','deviceId'=>'missing-login','deviceName'=>'Missing','clientId'=>'navistudy-wechat']), 'invalid_credentials');
expectCode(fn() => $auth->register(['username'=>'ab','password'=>'这是一个足够长的密码','deviceId'=>'test-device','deviceName'=>'Test','clientId'=>'navistudy-wechat']), 'invalid_username');
expectCode(fn() => $auth->register(['username'=>'测试用户','password'=>'1234567890','deviceId'=>'test-device','deviceName'=>'Test','clientId'=>'navistudy-wechat']), 'weak_password');
expectCode(fn() => $auth->register(['username'=>'测试用户','password'=>'五字符啊','deviceId'=>'test-device','deviceName'=>'Test','clientId'=>'navistudy-wechat']), 'weak_password');
$sixCharacter = $auth->register(['username'=>'六位密码用户','password'=>'甲乙丙丁戊己','deviceId'=>'six-char-device','deviceName'=>'Test','clientId'=>'study-web']);
check($sixCharacter['account']['username'] === '六位密码用户', 'Six-character password should be accepted.');

$shortLegacy = $auth->register(['username'=>'xy','password'=>'短用户名的安全密码-2026','deviceId'=>'short-device','deviceName'=>'Legacy','clientId'=>'navistudy-wechat']);
check($shortLegacy['account']['username'] === 'xy', 'Legacy short username was not preserved.');
check($sync->get('words', $shortLegacy['account']['id'])['document']['favs'][0]['key'] === 'w_short', 'Short Words legacy claim failed.');
check($sync->get('mt', $shortLegacy['account']['id'])['document']['favorites'][0] === 'q-short', 'Short MT legacy claim failed.');

$numericLegacy = $auth->register(['username'=>'517','password'=>'纯数字旧账号安全密码-2026','deviceId'=>'numeric-device','deviceName'=>'Legacy','clientId'=>'words-web']);
check($numericLegacy['account']['username'] === '517', 'Numeric legacy username was not preserved.');
check($sync->get('words', $numericLegacy['account']['id'])['document']['favs'][0]['key'] === 'w_numeric', 'Numeric Words legacy claim failed.');

$registered = $auth->register(['username'=>'旧用户','password'=>'安全密码十个字符以上-2026','deviceId'=>'wechat-device','deviceName'=>'微信测试','clientId'=>'navistudy-wechat','transport'=>'native']);
check(strlen($registered['recoveryCode']) === 35, 'Recovery code must contain 128 bits formatted in four groups.');
check(in_array('words', $registered['claimedProducts'], true), 'Registration did not report the claimed Words record.');
check(in_array('mt', $registered['claimedProducts'], true), 'Registration did not report the claimed MT record.');
check(str_starts_with($db->passport()->query("SELECT password_hash FROM users WHERE username='旧用户'")->fetchColumn(), '$argon2id$'), 'Password is not Argon2id.');
check($sync->get('words', $registered['account']['id'])['document']['favs'][0]['key'] === 'w_alpha', 'Words legacy claim failed.');
check($sync->get('mt', $registered['account']['id'])['document']['favorites'][0] === 'q-1', 'MT legacy claim failed.');

$refreshed = $auth->refresh($registered['refreshToken']);
check($refreshed['refreshToken'] !== $registered['refreshToken'], 'Refresh token did not rotate.');
expectCode(fn() => $auth->refresh($registered['refreshToken']), 'refresh_token_reused');

$wordsLogin = $auth->login(['username'=>'旧用户','password'=>'安全密码十个字符以上-2026','deviceId'=>'words-native-device','deviceName'=>'Words Native Test','clientId'=>'words-web','transport'=>'native']);
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $wordsLogin['accessToken'];
$identity = $auth->authenticate('words:write');
expectCode(fn() => $auth->authenticate('mt:read'), 'insufficient_scope');
$input = ['deviceId'=>'words-native-device','baseRevision'=>1,'schemaVersion'=>1,'mutations'=>[['mutationId'=>'mutation-test-0001','type'=>'merge_snapshot','data'=>['favs'=>[['key'=>'w_beta','w'=>'beta']],'wrongbook'=>['w_beta'=>['attempts'=>3]],'study_events'=>[['id'=>'event-1']]]]]];
$first = $sync->sync('words', $identity['id'], $input);
$second = $sync->sync('words', $identity['id'], $input);
check(in_array('mutation-test-0001', $second['deduplicated'], true), 'Mutation was not deduplicated.');
check(count($first['document']['favs']) === 2, 'Favorite union failed.');
check($first['document']['favs'][0]['key'] === 'w_alpha', 'Object favorite identity was not preserved.');
check($sync->get('mt', $identity['id'])['document']['favorites'] === ['q-1'], 'Words mutation crossed into MT.');
check($sync->get('reading', $identity['id'])['document']['bookmarks'] === [], 'Words mutation crossed into Reading.');

$deleted = $sync->sync('words', $identity['id'], [
    'deviceId'=>'words-native-device',
    'baseRevision'=>$first['revision'],
    'schemaVersion'=>1,
    'mutations'=>[['mutationId'=>'mutation-test-delete-0001','type'=>'entity_delete','collection'=>'favs','key'=>'w_alpha']],
]);
check(count($deleted['document']['favs']) === 1 && $deleted['document']['favs'][0]['key'] === 'w_beta', 'Object favorite tombstone failed.');

$readingLogin = $auth->login(['username'=>'旧用户','password'=>'安全密码十个字符以上-2026','deviceId'=>'reading-native-device','deviceName'=>'Reading Test','clientId'=>'reading-web','transport'=>'native']);
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $readingLogin['accessToken'];
$readingIdentity = $auth->authenticate('reading:write');
$reading = $sync->sync('reading', $readingIdentity['id'], [
    'deviceId'=>'reading-native-device',
    'baseRevision'=>0,
    'schemaVersion'=>1,
    'mutations'=>[['mutationId'=>'reading-test-0001','type'=>'merge_snapshot','data'=>[
        'bookmarks'=>['1:3'], 'notes'=>['1:3'=>'重点段落'],
        'lastProgress'=>['unit'=>1,'paragraph'=>3,'updatedAt'=>1700000000000],
        'settings'=>['lang'=>'both','size'=>20], 'updatedAt'=>1700000000000,
    ]]],
]);
check($reading['document']['bookmarks'] === ['1:3'], 'Reading bookmark sync failed.');
check(($reading['document']['notes']['1:3'] ?? '') === '重点段落', 'Reading note sync failed.');
check($sync->get('words', $readingIdentity['id'])['document']['favs'][0]['key'] === 'w_beta', 'Reading mutation crossed into Words.');

$anonymousEvent = [
    'platform'=>'web', 'visitorId'=>'visitor-test-analytics-0001',
    'events'=>[[
        'eventId'=>'event-analytics-anon-0001', 'product'=>'words', 'name'=>'question_answered',
        'itemId'=>'w_alpha', 'value'=>0, 'occurredAt'=>time(),
        'metadata'=>['mode'=>'choice', 'body'=>'must-not-be-stored', 'nested'=>['blocked'=>true]],
    ]],
];
$anonymousResult = $analytics->record($anonymousEvent);
check($anonymousResult['accepted'] === 1, 'Anonymous analytics event was not accepted.');
check($analytics->record($anonymousEvent)['accepted'] === 0, 'Duplicate analytics event was not deduplicated.');
$anonymousRow = $db->analytics()->query("SELECT user_id,visitor_hash,metadata_json FROM analytics_events WHERE event_id='event-analytics-anon-0001'")->fetch();
check($anonymousRow['user_id'] === null && strlen((string) $anonymousRow['visitor_hash']) === 64, 'Anonymous analytics identity was not hashed.');
check(!str_contains((string) $anonymousRow['metadata_json'], 'must-not-be-stored'), 'Analytics metadata accepted arbitrary learning content.');

$analytics->record([
    'platform'=>'wechat',
    'events'=>[
        ['eventId'=>'event-analytics-favorite-0001','product'=>'words','name'=>'favorite_added','itemId'=>'w_alpha','occurredAt'=>time()],
        ['eventId'=>'event-analytics-bookmark-0001','product'=>'reading','name'=>'bookmark_added','itemId'=>'1:3','occurredAt'=>time()],
        ['eventId'=>'event-analytics-plan-0001','product'=>'plan','name'=>'plan_evaluate','itemId'=>'course-http','occurredAt'=>time()],
    ],
], ['id'=>$registered['account']['id']]);
$summary = $analytics->overview(30);
check($summary['summary']['users'] >= 2, 'Analytics overview did not count authenticated and anonymous actors.');
check($summary['products']['words']['favoriteAdds'] === 1, 'Words favorite analytics was not aggregated.');
check($analytics->content('reading', 30)['items'][0]['favoriteAdds'] === 1, 'Reading bookmark analytics was not aggregated.');
check(count($summary['trend']) === 30, 'Analytics trend did not fill the complete selected period.');
check(array_key_exists('web', $summary['platforms']) && array_key_exists('wechat', $summary['platforms']), 'Analytics overview did not split Web and WeChat sources.');
check(count($summary['events']) >= 3, 'Analytics event breakdown is incomplete.');
$wechatSummary = $analytics->overview(30, 'wechat', 'words');
check($wechatSummary['summary']['favoriteAdds'] === 1 && $wechatSummary['summary']['questions'] === 0, 'Analytics platform and product filters were not applied together.');
$webSummary = $analytics->overview(30, 'web', 'words');
check($webSummary['summary']['questions'] === 1 && $webSummary['summary']['wrongAnswers'] === 1, 'Web question analytics were not filtered correctly.');
$wordContent = $analytics->content('words', 30, 20, 'web');
check(($wordContent['items'][0]['correctRate'] ?? null) === 0.0, 'Content answer accuracy was not calculated.');
check(($wordContent['items'][0]['activeFavorites'] ?? 0) === 1, 'Content ranking did not include current favorite state.');
$analytics->record([
    'platform'=>'web', 'visitorId'=>'visitor-test-analytics-0001',
    'events'=>[[
        'eventId'=>'event-analytics-six-hours-old', 'product'=>'words', 'name'=>'question_answered',
        'itemId'=>'w_old', 'value'=>1, 'occurredAt'=>time() - (6 * 3600),
    ]],
]);
$recent4h = $analytics->overview(30, 'web', 'words', '4h');
check($recent4h['window']['key'] === '4h' && $recent4h['window']['bucket'] === 'hour', 'Four-hour analytics window was not hourly.');
check($recent4h['summary']['questions'] === 1, 'Four-hour analytics window included older events.');
$recent8h = $analytics->overview(30, 'web', 'words', '8h');
check($recent8h['summary']['questions'] === 2, 'Eight-hour analytics window did not include recent older events.');
$todaySummary = $analytics->overview(30, 'all', 'all', 'today');
check($todaySummary['window']['key'] === 'today' && $todaySummary['window']['bucket'] === 'hour', 'Today analytics window was not hourly.');
check(count($todaySummary['trend']) >= 1 && isset($todaySummary['trend'][0]['label']), 'Hourly analytics trend did not include labels.');
$recentContent = $analytics->content('words', 30, 20, 'web', '4h');
check(!in_array('w_old', array_column($recentContent['items'], 'itemKey'), true), 'Content ranking ignored the selected four-hour window.');
expectCode(fn() => $analytics->overview(30, 'android'), 'invalid_analytics_platform');
expectCode(fn() => $analytics->overview(30, 'all', 'oj'), 'invalid_product');
expectCode(fn() => $analytics->overview(30, 'all', 'all', '2h'), 'invalid_analytics_range');
$userAnalytics = $analytics->userSummary($registered['account']['id']);
check(($userAnalytics['favorites']['words'] ?? 0) === 1, 'Current Words favorite state was not stored.');
check(($userAnalytics['favorites']['reading'] ?? 0) === 1, 'Current Reading bookmark state was not stored.');
$analytics->record(['platform'=>'wechat','events'=>[[
    'eventId'=>'event-analytics-favorite-old-remove','product'=>'words','name'=>'favorite_removed','itemId'=>'w_alpha','occurredAt'=>time() - 60,
]]], ['id'=>$registered['account']['id']]);
$favoriteState = $db->analytics()->query("SELECT active FROM analytics_favorites WHERE product='words' AND item_key='w_alpha' AND actor_key='" . $registered['account']['id'] . "'")->fetchColumn();
check((int) $favoriteState === 1, 'An older favorite event replaced a newer current state.');
expectCode(fn() => $analytics->record([
    'platform'=>'web','visitorId'=>'visitor-test-rollback',
    'events'=>[
        ['eventId'=>'event-analytics-rollback-valid','product'=>'study','name'=>'page_view'],
        ['eventId'=>'event-analytics-rollback-invalid','product'=>'oj','name'=>'page_view'],
    ],
]), 'invalid_analytics_event');
check((int) $db->analytics()->query("SELECT COUNT(*) FROM analytics_events WHERE event_id='event-analytics-rollback-valid'")->fetchColumn() === 0, 'Invalid analytics batch was partially written.');
expectCode(fn() => $analytics->record(['platform'=>'web','visitorId'=>'visitor-test-invalid','events'=>[['eventId'=>'event-analytics-invalid-0001','product'=>'oj','name'=>'page_view']]]), 'invalid_analytics_event');

$owner = $auth->register(['username'=>'Dxir','password'=>'后台测试密码-2026','deviceId'=>'admin-device','deviceName'=>'Admin Test','clientId'=>'study-web']);
$adminIdentity = ['id'=>$owner['account']['id'], 'session_id'=>'admin-session-test'];
$adminService->updatePermissions($adminIdentity, $registered['account']['id'], ['services'=>['words'=>['enabled'=>false], 'tools'=>['enabled'=>false, 'unrestricted'=>true]]]);
expectCode(fn() => $adminService->requireServiceAccess($registered['account']['id'], 'words'), 'service_disabled');
expectCode(fn() => $adminService->requireServiceAccess($registered['account']['id'], 'tools'), 'service_disabled');
check($adminService->serviceAccessForUser($registered['account']['id'])['tools']['unrestricted'] === true, 'Tools unrestricted permission was not stored.');
$adminService->updatePermissions($adminIdentity, $registered['account']['id'], ['services'=>['words'=>['enabled'=>true], 'tools'=>['enabled'=>true, 'unrestricted'=>false]]]);
check($adminService->serviceAccessForUser($registered['account']['id'])['words']['enabled'] === true, 'Words permission was not restored.');
$detail = $adminService->user($registered['account']['id'], 'not-current');
check(count($detail['sessions']) > 0, 'Admin detail did not include login sessions.');
check(array_key_exists('lastIp', $detail['sessions'][0]), 'Admin session detail did not include IP observations.');
check(($detail['analytics']['favorites']['words'] ?? 0) === 1, 'Admin user detail did not include analytics summary.');

$newCode = $auth->recover(['username'=>'旧用户','recoveryCode'=>$registered['recoveryCode'],'newPassword'=>'更新后的安全密码-2026'])['recoveryCode'];
check($newCode !== $registered['recoveryCode'], 'Recovery code did not rotate.');
expectCode(fn() => $auth->login(['username'=>'旧用户','password'=>'安全密码十个字符以上-2026','deviceId'=>'old-pass','deviceName'=>'Old','clientId'=>'study-web']), 'invalid_credentials');

fwrite(STDOUT, "passport-and-sync: OK\n");
