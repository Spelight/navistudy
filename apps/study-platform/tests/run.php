<?php
declare(strict_types=1);

$root = dirname(__DIR__);
$data = $root . '/test-output/' . bin2hex(random_bytes(4));
putenv('NAVISTUDY_DATA_DIR=' . $data);
putenv('NAVISTUDY_COOKIE_SECURE=0');
require_once $root . '/src/bootstrap.php';
require_once $root . '/src/Database.php';
require_once $root . '/src/LegacyImporter.php';
require_once $root . '/src/AuthService.php';
require_once $root . '/src/SyncService.php';

use NaviStudy\ApiException;
use NaviStudy\AuthService;
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

expectCode(fn() => $auth->register(['username'=>'ab','password'=>'这是一个足够长的密码','deviceId'=>'test-device','deviceName'=>'Test','clientId'=>'navistudy-wechat']), 'invalid_username');
expectCode(fn() => $auth->register(['username'=>'测试用户','password'=>'1234567890','deviceId'=>'test-device','deviceName'=>'Test','clientId'=>'navistudy-wechat']), 'weak_password');
expectCode(fn() => $auth->register(['username'=>'测试用户','password'=>'五字符啊','deviceId'=>'test-device','deviceName'=>'Test','clientId'=>'navistudy-wechat']), 'weak_password');
$sixCharacter = $auth->register(['username'=>'六位密码用户','password'=>'甲乙丙丁戊己','deviceId'=>'six-char-device','deviceName'=>'Test','clientId'=>'study-web']);
check($sixCharacter['account']['username'] === '六位密码用户', 'Six-character password should be accepted.');

$shortLegacy = $auth->register(['username'=>'xy','password'=>'短用户名的安全密码-2026','deviceId'=>'short-device','deviceName'=>'Legacy','clientId'=>'navistudy-wechat']);
check($shortLegacy['account']['username'] === 'xy', 'Legacy short username was not preserved.');
check($sync->get('words', $shortLegacy['account']['id'])['document']['favs'][0]['key'] === 'w_short', 'Short Words legacy claim failed.');
check($sync->get('mt', $shortLegacy['account']['id'])['document']['favorites'][0] === 'q-short', 'Short MT legacy claim failed.');

$numericLegacy = $auth->register(['username'=>'517','password'=>'纯数字旧账号安全密码-2026','deviceId'=>'numeric-device','deviceName'=>'Legacy','clientId'=>'words-android']);
check($numericLegacy['account']['username'] === '517', 'Numeric legacy username was not preserved.');
check($sync->get('words', $numericLegacy['account']['id'])['document']['favs'][0]['key'] === 'w_numeric', 'Numeric Words legacy claim failed.');

$registered = $auth->register(['username'=>'旧用户','password'=>'安全密码十个字符以上-2026','deviceId'=>'wechat-device','deviceName'=>'微信测试','clientId'=>'navistudy-wechat','transport'=>'native']);
check(strlen($registered['recoveryCode']) === 35, 'Recovery code must contain 128 bits formatted in four groups.');
check(str_starts_with($db->passport()->query("SELECT password_hash FROM users WHERE username='旧用户'")->fetchColumn(), '$argon2id$'), 'Password is not Argon2id.');
check($sync->get('words', $registered['account']['id'])['document']['favs'][0]['key'] === 'w_alpha', 'Words legacy claim failed.');
check($sync->get('mt', $registered['account']['id'])['document']['favorites'][0] === 'q-1', 'MT legacy claim failed.');

$refreshed = $auth->refresh($registered['refreshToken']);
check($refreshed['refreshToken'] !== $registered['refreshToken'], 'Refresh token did not rotate.');
expectCode(fn() => $auth->refresh($registered['refreshToken']), 'refresh_token_reused');

$wordsLogin = $auth->login(['username'=>'旧用户','password'=>'安全密码十个字符以上-2026','deviceId'=>'android-device','deviceName'=>'Android','clientId'=>'words-android','transport'=>'native']);
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $wordsLogin['accessToken'];
$identity = $auth->authenticate('words:write');
expectCode(fn() => $auth->authenticate('mt:read'), 'insufficient_scope');
$input = ['deviceId'=>'android-device','baseRevision'=>1,'schemaVersion'=>1,'mutations'=>[['mutationId'=>'mutation-test-0001','type'=>'merge_snapshot','data'=>['favs'=>[['key'=>'w_beta','w'=>'beta']],'wrongbook'=>['w_beta'=>['attempts'=>3]],'study_events'=>[['id'=>'event-1']]]]]];
$first = $sync->sync('words', $identity['id'], $input);
$second = $sync->sync('words', $identity['id'], $input);
check(in_array('mutation-test-0001', $second['deduplicated'], true), 'Mutation was not deduplicated.');
check(count($first['document']['favs']) === 2, 'Favorite union failed.');
check($first['document']['favs'][0]['key'] === 'w_alpha', 'Object favorite identity was not preserved.');
check($sync->get('mt', $identity['id'])['document']['favorites'] === ['q-1'], 'Words mutation crossed into MT.');

$deleted = $sync->sync('words', $identity['id'], [
    'deviceId'=>'android-device',
    'baseRevision'=>$first['revision'],
    'schemaVersion'=>1,
    'mutations'=>[['mutationId'=>'mutation-test-delete-0001','type'=>'entity_delete','collection'=>'favs','key'=>'w_alpha']],
]);
check(count($deleted['document']['favs']) === 1 && $deleted['document']['favs'][0]['key'] === 'w_beta', 'Object favorite tombstone failed.');

$newCode = $auth->recover(['username'=>'旧用户','recoveryCode'=>$registered['recoveryCode'],'newPassword'=>'更新后的安全密码-2026'])['recoveryCode'];
check($newCode !== $registered['recoveryCode'], 'Recovery code did not rotate.');
expectCode(fn() => $auth->login(['username'=>'旧用户','password'=>'安全密码十个字符以上-2026','deviceId'=>'old-pass','deviceName'=>'Old','clientId'=>'study-web']), 'invalid_credentials');

fwrite(STDOUT, "passport-and-sync: OK\n");
