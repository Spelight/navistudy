<?php
declare(strict_types=1);

use NaviStudy\ApiException;
use NaviStudy\AdminService;
use NaviStudy\AuthService;
use NaviStudy\AnalyticsService;
use NaviStudy\Config;
use NaviStudy\Database;
use NaviStudy\Http;
use NaviStudy\LegacyImporter;
use NaviStudy\SyncService;

require_once dirname(__DIR__) . '/src/bootstrap.php';
require_once dirname(__DIR__) . '/src/Database.php';
require_once dirname(__DIR__) . '/src/AuthService.php';
require_once dirname(__DIR__) . '/src/SyncService.php';
require_once dirname(__DIR__) . '/src/LegacyImporter.php';
require_once dirname(__DIR__) . '/src/AdminService.php';

$requestId = Http::requestId();
$_SERVER['NAVISTUDY_REQUEST_ID'] = $requestId;
header('X-Request-Id: ' . $requestId);
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');

$config = Config::load(dirname(__DIR__));
$database = new Database($config);
$database->migrateAll();
$auth = new AuthService($config, $database);
$sync = new SyncService($config, $database);
$legacy = new LegacyImporter($config, $database);
$analytics = new AnalyticsService($config, $database);
$admin = new AdminService($config, $database, $analytics);
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$host = strtolower(explode(':', $_SERVER['HTTP_HOST'] ?? '')[0]);
$cookieContext = match (true) {
    str_starts_with($requestPath, '/words/navistudy-api/') => 'words',
    str_starts_with($requestPath, '/mt/navistudy-api/') => 'mt',
    str_starts_with($requestPath, '/reading/navistudy-api/') => 'reading',
    str_starts_with($requestPath, '/naviplan/navistudy-api/') => 'plan',
    $host === 'words.example.test' => 'words',
    $host === 'mt.example.test' => 'mt',
    default => 'study',
};
$cookies = authCookieProfile($cookieContext, $requestPath);
$path = $requestPath;
foreach (['/words/navistudy-api', '/mt/navistudy-api', '/reading/navistudy-api', '/naviplan/navistudy-api', '/navistudy-api'] as $prefix) {
    if ($path === $prefix || str_starts_with($path, $prefix . '/')) {
        $path = substr($path, strlen($prefix)) ?: '/';
        break;
    }
}

$origin = Http::header('Origin');
$originAllowed = $origin && in_array(rtrim($origin, '/'), $config->get('allowedOrigins'), true);
if ($originAllowed) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
    header('Vary: Origin');
}
if ($origin && !$originAllowed && !in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
    Http::fail(new ApiException('invalid_origin', '请求来源未获授权。', 403), $requestId);
}
if ($method === 'OPTIONS') {
    if (!$originAllowed) Http::fail(new ApiException('invalid_origin', '请求来源未获授权。', 403), $requestId);
    header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-CSRF-Token');
    http_response_code(204);
    exit;
}

try {
    if (!str_starts_with($path, '/api/') && !str_starts_with($path, '/oauth/')) {
        if ($path === '/healthz') Http::ok(['service'=>'navistudy-passport','status'=>'healthy']);
        $asset = __DIR__ . ($path === '/' ? '/index.html' : $path);
        if (is_file($asset)) { readfile($asset); exit; }
        readfile(__DIR__ . '/index.html');
        exit;
    }

    if ($path === '/api/v1/auth/register' && $method === 'POST') {
        $body = Http::jsonBody();
        $result = $auth->register($body);
        if (($body['transport'] ?? 'browser') === 'browser') {
            setAuthCookies($result, $config, $cookies, true);
            unset($result['accessToken'], $result['refreshToken'], $result['ssoToken']);
        }
        Http::ok($result, 201);
    }
    if ($path === '/api/v1/auth/login' && $method === 'POST') {
        $body = Http::jsonBody();
        $result = $auth->login($body);
        if (($body['transport'] ?? 'browser') === 'browser') {
            setAuthCookies($result, $config, $cookies, true);
            unset($result['accessToken'], $result['refreshToken'], $result['ssoToken']);
        }
        Http::ok($result);
    }
    if ($path === '/api/v1/auth/refresh' && $method === 'POST') {
        $body = Http::jsonBody();
        $token = (string) ($body['refreshToken'] ?? ($_COOKIE[$cookies['refresh']] ?? ''));
        $result = $auth->refresh($token);
        if (!isset($body['refreshToken'])) {
            setAuthCookies($result, $config, $cookies, false);
            unset($result['accessToken'], $result['refreshToken']);
        }
        Http::ok($result);
    }
    if ($path === '/api/v1/auth/recover' && $method === 'POST') Http::ok($auth->recover(Http::jsonBody()));
    if ($path === '/api/v1/auth/logout' && $method === 'POST') {
        $identity = $auth->authenticate(null, true, $cookies['access'], $cookies['allowSso']);
        $auth->requireCsrf($identity);
        $auth->logout($identity);
        clearAuthCookies($config, $cookies);
        Http::ok();
    }
    if ($path === '/api/v1/analytics/events' && $method === 'POST') {
        $identity = null;
        try {
            $identity = $auth->authenticate(null, true, $cookies['access'], $cookies['allowSso']);
        } catch (ApiException $error) {
            if ($error->errorCode !== 'authentication_required') throw $error;
        }
        Http::ok($analytics->record(Http::jsonBody(), $identity));
    }
    if ($path === '/api/v1/account' && $method === 'GET') {
        $identity = $auth->authenticate(null, true, $cookies['access'], $cookies['allowSso']);
        Http::ok([
            'account'=>$auth->publicUser($identity['id']),
            'csrfToken'=>$identity['csrf_token'],
            'serviceAccess'=>$admin->serviceAccessForUser($identity['id']),
        ]);
    }
    if ($path === '/api/v1/account/password' && $method === 'PATCH') {
        $identity = $auth->authenticate('account', false, $cookies['access'], $cookies['allowSso']);
        $auth->requireCsrf($identity);
        Http::ok($auth->changePassword($identity, Http::jsonBody()));
    }
    if ($path === '/api/v1/account/sessions' && $method === 'GET') {
        $identity = $auth->authenticate('account', true, $cookies['access'], $cookies['allowSso']);
        Http::ok(['sessions'=>$auth->sessions($identity['id']),'currentSessionId'=>$identity['session_id']]);
    }
    if (preg_match('#^/api/v1/account/sessions/([a-f0-9]{32})$#', $path, $match) && $method === 'DELETE') {
        $identity = $auth->authenticate('account', true, $cookies['access'], $cookies['allowSso']);
        $auth->requireCsrf($identity);
        $auth->revokeSession($identity['id'], $match[1]);
        Http::ok();
    }
    if ($path === '/api/v1/account/deletion' && $method === 'POST') {
        $identity = $auth->authenticate('account', false, $cookies['access'], $cookies['allowSso']);
        $auth->requireCsrf($identity);
        $deletionAt = $auth->requestDeletion($identity, (string) (Http::jsonBody()['password'] ?? ''));
            clearAuthCookies($config, $cookies);
        Http::ok(['deletionAt'=>$deletionAt]);
    }
    if ($path === '/api/v1/account/deletion' && $method === 'DELETE') {
        $identity = $auth->authenticate('account', true, $cookies['access'], $cookies['allowSso']);
        $auth->requireCsrf($identity);
        $auth->cancelDeletion($identity);
        Http::ok();
    }
    if ($path === '/api/v1/admin/services' && $method === 'GET') {
        $identity = requireServiceAdmin($auth, $cookies);
        Http::ok(['admin'=>$auth->publicUser($identity['id']),'users'=>serviceAdminUsers($database)]);
    }
    if (preg_match('#^/api/v1/admin/services/(?:navitools|naviplan)/users/([^/]+)/permissions$#', $path, $match) && $method === 'PATCH') {
        $identity = requireServiceAdmin($auth, $cookies);
        $auth->requireCsrf($identity);
        $username = rawurldecode($match[1]);
        $body = Http::jsonBody();
        Http::ok(updateNaviToolsPermission($username, !empty($body['unrestricted'])));
    }
    if ($path === '/api/v1/admin/overview' && $method === 'GET') {
        $admin->requireAdmin($auth, $cookies);
        Http::ok($admin->overview());
    }
    if ($path === '/api/v1/admin/analytics/overview' && $method === 'GET') {
        $admin->requireAdmin($auth, $cookies);
        Http::ok($analytics->overview(
            (int) ($_GET['days'] ?? 30),
            (string) ($_GET['platform'] ?? 'all'),
            (string) ($_GET['product'] ?? 'all'),
            isset($_GET['range']) ? (string) $_GET['range'] : null
        ));
    }
    if ($path === '/api/v1/admin/analytics/content' && $method === 'GET') {
        $admin->requireAdmin($auth, $cookies);
        Http::ok($analytics->content(
            (string) ($_GET['product'] ?? ''),
            (int) ($_GET['days'] ?? 30),
            (int) ($_GET['limit'] ?? 20),
            (string) ($_GET['platform'] ?? 'all'),
            isset($_GET['range']) ? (string) $_GET['range'] : null
        ));
    }
    if ($path === '/api/v1/admin/users' && $method === 'GET') {
        $admin->requireAdmin($auth, $cookies);
        Http::ok($admin->users($_GET));
    }
    if (preg_match('#^/api/v1/admin/users/([a-f0-9]{32})$#', $path, $match) && $method === 'GET') {
        $identity = $admin->requireAdmin($auth, $cookies);
        Http::ok($admin->user($match[1], (string) $identity['session_id']));
    }
    if (preg_match('#^/api/v1/admin/users/([a-f0-9]{32})/permissions$#', $path, $match) && $method === 'PATCH') {
        $identity = $admin->requireAdmin($auth, $cookies);
        $auth->requireCsrf($identity);
        Http::ok($admin->updatePermissions($identity, $match[1], Http::jsonBody()));
    }
    if (preg_match('#^/api/v1/admin/users/([a-f0-9]{32})/sessions/([a-f0-9]{32})$#', $path, $match) && $method === 'DELETE') {
        $identity = $admin->requireAdmin($auth, $cookies);
        $auth->requireCsrf($identity);
        Http::ok($admin->revokeSession($identity, $match[1], $match[2]));
    }
    if (preg_match('#^/api/v1/admin/users/([a-f0-9]{32})/sessions/revoke-all$#', $path, $match) && $method === 'POST') {
        $identity = $admin->requireAdmin($auth, $cookies);
        $auth->requireCsrf($identity);
        Http::ok($admin->revokeAllSessions($identity, $match[1]));
    }
    if ($path === '/api/v1/admin/audit' && $method === 'GET') {
        $admin->requireAdmin($auth, $cookies);
        Http::ok($admin->auditLog($_GET));
    }
    if ($path === '/oauth/authorize' && $method === 'GET') {
        try { $identity = $auth->authenticate(null, false, $cookies['access'], $cookies['allowSso']); }
        catch (ApiException $error) {
            if ($error->errorCode !== 'authentication_required') throw $error;
            $returnTo = ($_SERVER['REQUEST_URI'] ?? '/oauth/authorize');
            header('Location: /?login=1&returnTo=' . rawurlencode($returnTo), true, 302);
            exit;
        }
        header('Location: ' . $auth->createAuthorizationCode($identity, $_GET), true, 302);
        exit;
    }
    if ($path === '/oauth/token' && $method === 'POST') {
        $body = Http::jsonBody();
        $result = $auth->exchangeAuthorizationCode($body);
        $tokenContext = match ($body['clientId'] ?? '') {
            'words-web' => 'words',
            'mt-web' => 'mt',
            'reading-web' => 'reading',
            'plan-web' => 'plan',
            default => $cookieContext,
        };
        setAuthCookies($result, $config, authCookieProfile($tokenContext, $requestPath), false);
        unset($result['accessToken'], $result['refreshToken'], $result['ssoToken']);
        Http::ok($result);
    }
    if (preg_match('#^/api/v1/sync/(words|mt|reading|plan)$#', $path, $match)) {
        $product = $match[1];
        $identity = $auth->authenticate($product . ':' . ($method === 'GET' ? 'read' : 'write'), false, $cookies['access'], $cookies['allowSso']);
        $admin->requireServiceAccess($identity['id'], $product);
        if ($method === 'GET') Http::ok($sync->get($product, $identity['id']));
        if ($method === 'POST') {
            $auth->requireCsrf($identity);
            Http::ok($sync->sync($product, $identity['id'], Http::jsonBody()));
        }
    }
    if (preg_match('#^/api/v1/legacy/(words|mt)/([^/]+)$#', $path, $match) && $method === 'GET') {
        Http::ok(['product'=>$match[1],'document'=>$legacy->legacyRead($match[1], rawurldecode($match[2]))]);
    }
    throw new ApiException('route_not_found', '接口不存在。', 404);
} catch (ApiException $error) {
    Http::fail($error, $requestId);
} catch (Throwable $error) {
    error_log(sprintf('[navistudy] request=%s type=%s message=%s', $requestId, get_class($error), $error->getMessage()));
    Http::fail(new ApiException('internal_error', '服务暂时不可用，请稍后重试。', 500), $requestId);
}

function authCookieProfile(string $context, string $requestPath): array
{
    $productPath = str_starts_with($requestPath, '/' . $context . '/') ? '/' . $context . '/' : '/';
        return match ($context) {
            'words' => ['access'=>'navi_words_access','refresh'=>'navi_words_refresh','csrf'=>'navi_words_csrf','sso'=>'navi_sso','path'=>$productPath,'allowSso'=>false],
            'mt' => ['access'=>'navi_mt_access','refresh'=>'navi_mt_refresh','csrf'=>'navi_mt_csrf','sso'=>'navi_sso','path'=>$productPath,'allowSso'=>false],
            'reading' => ['access'=>'navi_reading_access','refresh'=>'navi_reading_refresh','csrf'=>'navi_reading_csrf','sso'=>'navi_sso','path'=>$productPath,'allowSso'=>false],
            'plan' => ['access'=>'navi_plan_access','refresh'=>'navi_plan_refresh','csrf'=>'navi_plan_csrf','sso'=>'navi_sso','path'=>$productPath,'allowSso'=>false],
            default => ['access'=>'navi_access','refresh'=>'navi_refresh','csrf'=>'navi_csrf','sso'=>'navi_sso','path'=>'/','allowSso'=>true],
        };
}

function setAuthCookies(array $tokens, Config $config, array $cookies, bool $includeSso): void
{
    $base = ['path'=>$cookies['path'],'secure'=>$config->get('cookieSecure'),'samesite'=>'Lax'];
    if (isset($tokens['accessToken'])) setcookie($cookies['access'], $tokens['accessToken'], ['expires'=>$tokens['accessExpiresAt'] ?? time()+900,'httponly'=>true] + $base);
    if (isset($tokens['refreshToken'])) setcookie($cookies['refresh'], $tokens['refreshToken'], ['expires'=>$tokens['refreshExpiresAt'] ?? time()+2592000,'httponly'=>true] + $base);
    if ($includeSso && $cookies['allowSso'] && isset($tokens['ssoToken']) && $tokens['ssoToken']) setcookie($cookies['sso'], $tokens['ssoToken'], ['expires'=>$tokens['ssoExpiresAt'],'path'=>'/','secure'=>$config->get('cookieSecure'),'httponly'=>true,'samesite'=>'Lax']);
    if (isset($tokens['csrfToken'])) setcookie($cookies['csrf'], $tokens['csrfToken'], ['expires'=>$tokens['refreshExpiresAt'] ?? time()+2592000,'httponly'=>false] + $base);
}

function clearAuthCookies(Config $config, array $cookies): void
{
    foreach ([[$cookies['access'],true],[$cookies['refresh'],true],[$cookies['csrf'],false]] as [$name,$httpOnly]) {
        setcookie($name, '', ['expires'=>1,'path'=>$cookies['path'],'secure'=>$config->get('cookieSecure'),'httponly'=>$httpOnly,'samesite'=>'Lax']);
    }
    if ($cookies['allowSso']) setcookie($cookies['sso'], '', ['expires'=>1,'path'=>'/','secure'=>$config->get('cookieSecure'),'httponly'=>true,'samesite'=>'Lax']);
}

function requireServiceAdmin(AuthService $auth, array $cookies): array
{
    $identity = $auth->authenticate('account', false, $cookies['access'], $cookies['allowSso']);
    if (strtolower((string) ($identity['username'] ?? '')) !== 'dxir') {
        throw new ApiException('admin_required', '只有 Dxir 可以访问服务管理后台。', 403);
    }
    return $identity;
}

function serviceAdminUsers(Database $database): array
{
    $passport = $database->passport();
    $users = [];
    foreach ($passport->query('SELECT id,username,username_key,status,created_at,updated_at FROM users ORDER BY created_at DESC')->fetchAll() as $row) {
        $users[$row['id']] = [
            'id' => $row['id'],
            'username' => $row['username'],
            'status' => $row['status'],
            'createdAt' => (int) $row['created_at'],
            'updatedAt' => (int) $row['updated_at'],
            'services' => [],
        ];
    }

    foreach (['words', 'mt', 'reading', 'plan'] as $product) {
        foreach (productDocuments($database, $product) as $userId => $doc) {
            if (!isset($users[$userId])) continue;
            $users[$userId]['services'][$product] = productStatus($product, $doc);
        }
    }

    $availability = naviToolsAvailabilityStatus();
    foreach ($users as &$user) {
        foreach (['words', 'mt', 'reading', 'plan'] as $product) {
            $user['services'][$product] ??= [
                'enabled' => false,
                'revision' => 0,
                'updatedAt' => null,
                'usage' => '暂无云端数据',
            ];
        }
        $key = strtolower($user['username']);
        $user['services']['availability'] = $availability[$key] ?? [
            'enabled' => false,
            'unrestricted' => $key === 'dxir',
            'activeSessionCount' => 0,
            'totalSessionCount' => 0,
            'responseCount' => 0,
            'usage' => $key === 'dxir' ? '不受问卷数量限制' : '0 / 3 个进行中问卷',
        ];
    }
    unset($user);

    return array_values($users);
}

function productDocuments(Database $database, string $product): array
{
    $docs = [];
    $stmt = $database->product($product)->query('SELECT user_id,revision,document_json,updated_at FROM documents');
    foreach ($stmt->fetchAll() as $row) {
        $docs[$row['user_id']] = [
            'revision' => (int) $row['revision'],
            'document' => json_decode((string) $row['document_json'], true) ?: [],
            'updatedAt' => (int) $row['updated_at'],
        ];
    }
    return $docs;
}

function productStatus(string $product, array $doc): array
{
    $data = $doc['document'];
    $usage = match ($product) {
        'words' => sprintf('%d 收藏 · %d 已掌握', count($data['favs'] ?? []), count($data['mastered'] ?? [])),
        'mt' => sprintf('%d 答题记录 · %d 错题', count($data['answers'] ?? []), count($data['wrongbook'] ?? [])),
        'reading' => sprintf('%d 书签 · %d 笔记', count($data['bookmarks'] ?? []), count($data['notes'] ?? [])),
        'plan' => sprintf('%d 门课程 · %d 项要求', count($data['courses'] ?? []), count($data['requirements'] ?? [])),
        default => '已开通',
    };
    return [
        'enabled' => true,
        'revision' => $doc['revision'],
        'updatedAt' => $doc['updatedAt'],
        'usage' => $usage,
    ];
}

function naviToolsAvailabilityFile(): string
{
    return getenv('NAVITOOLS_DATA_FILE') ?: ((getenv('NAVITOOLS_DATA_DIR') ?: '/var/lib/navistudy/tools') . '/availability.json');
}

function naviToolsAvailabilityStatus(): array
{
    $file = naviToolsAvailabilityFile();
    $decoded = is_file($file) ? json_decode((string) file_get_contents($file), true) : [];
    $sessions = is_array($decoded['sessions'] ?? null) ? $decoded['sessions'] : [];
    $legacyPermissions = is_array($decoded['servicePermissions']['naviagenda']['unrestrictedUsers'] ?? null)
        ? $decoded['servicePermissions']['naviagenda']['unrestrictedUsers']
        : [];
    $toolPermissions = is_array($decoded['servicePermissions']['navitools']['unrestrictedUsers'] ?? null)
        ? $decoded['servicePermissions']['navitools']['unrestrictedUsers']
        : [];
    $permissions = array_merge($legacyPermissions, $toolPermissions);
    $now = time();
    $users = [];
    foreach ($sessions as $session) {
        $username = trim((string) ($session['ownerUsername'] ?? 'legacy-admin'));
        $key = strtolower($username);
        $users[$key] ??= [
            'enabled' => true,
            'unrestricted' => $key === 'dxir' || !empty($permissions[$key]),
            'activeSessionCount' => 0,
            'totalSessionCount' => 0,
            'responseCount' => 0,
            'usage' => '',
        ];
        $users[$key]['totalSessionCount']++;
        $users[$key]['responseCount'] += count($session['responses'] ?? []);
        $closesAt = strtotime((string) ($session['closesAt'] ?? '')) ?: 0;
        if ($closesAt >= $now) $users[$key]['activeSessionCount']++;
    }
    foreach ($permissions as $key => $enabled) {
        if (!$enabled) continue;
        $key = strtolower((string) $key);
        $users[$key] ??= [
            'enabled' => true,
            'unrestricted' => true,
            'activeSessionCount' => 0,
            'totalSessionCount' => 0,
            'responseCount' => 0,
            'usage' => '',
        ];
        $users[$key]['unrestricted'] = true;
    }
    foreach ($users as $key => &$status) {
        $status['usage'] = $status['unrestricted']
            ? sprintf('%d 个进行中问卷 · 不受限制', $status['activeSessionCount'])
            : sprintf('%d / 3 个进行中问卷', $status['activeSessionCount']);
    }
    unset($status);
    $users['dxir'] ??= [
        'enabled' => true,
        'unrestricted' => true,
        'activeSessionCount' => 0,
        'totalSessionCount' => 0,
        'responseCount' => 0,
        'usage' => '不受问卷数量限制',
    ];
    return $users;
}

function updateNaviToolsPermission(string $username, bool $unrestricted): array
{
    $username = trim($username);
    if ($username === '') throw new ApiException('invalid_request', '用户名不能为空。', 400);
    if (strtolower($username) === 'dxir') throw new ApiException('invalid_request', 'Dxir 永远不受限制。', 400);
    $file = naviToolsAvailabilityFile();
    $dir = dirname($file);
    if (!is_dir($dir) && !mkdir($dir, 0770, true) && !is_dir($dir)) {
        throw new ApiException('storage_unavailable', '无法写入 NaviTools 权限文件。', 500);
    }
    $store = is_file($file) ? json_decode((string) file_get_contents($file), true) : [];
    if (!is_array($store)) $store = [];
    $store['sessions'] ??= [];
    $key = strtolower($username);
    $store['servicePermissions']['navitools']['unrestrictedUsers'][$key] = $unrestricted;
    unset($store['servicePermissions']['naviagenda'], $store['servicePermissions']['naviplan']);
    $tmp = $file . '.passport.tmp';
    file_put_contents($tmp, json_encode($store, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), LOCK_EX);
    rename($tmp, $file);
    $status = naviToolsAvailabilityStatus()[$key] ?? null;
    return ['username' => $username, 'service' => 'navitools.availability', 'status' => $status];
}
