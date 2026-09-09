<?php
declare(strict_types=1);

use NaviStudy\ApiException;
use NaviStudy\AuthService;
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
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$host = strtolower(explode(':', $_SERVER['HTTP_HOST'] ?? '')[0]);
$cookieContext = match (true) {
    str_starts_with($requestPath, '/words/navistudy-api/') => 'words',
    str_starts_with($requestPath, '/mt/navistudy-api/') => 'mt',
    $host === 'words.dxir.net.cn' => 'words',
    $host === 'mt.dxir.net.cn' => 'mt',
    default => 'study',
};
$cookies = authCookieProfile($cookieContext, $requestPath);
$path = $requestPath;
foreach (['/words/navistudy-api', '/mt/navistudy-api', '/navistudy-api'] as $prefix) {
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
    if ($path === '/api/v1/account' && $method === 'GET') {
        $identity = $auth->authenticate(null, true, $cookies['access'], $cookies['allowSso']);
        Http::ok(['account'=>$auth->publicUser($identity['id']),'csrfToken'=>$identity['csrf_token']]);
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
        $tokenContext = ($body['clientId'] ?? '') === 'words-web' ? 'words' : (($body['clientId'] ?? '') === 'mt-web' ? 'mt' : $cookieContext);
        setAuthCookies($result, $config, authCookieProfile($tokenContext, $requestPath), false);
        unset($result['accessToken'], $result['refreshToken'], $result['ssoToken']);
        Http::ok($result);
    }
    if (preg_match('#^/api/v1/sync/(words|mt)$#', $path, $match)) {
        $product = $match[1];
        $identity = $auth->authenticate($product . ':' . ($method === 'GET' ? 'read' : 'write'), false, $cookies['access'], $cookies['allowSso']);
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
