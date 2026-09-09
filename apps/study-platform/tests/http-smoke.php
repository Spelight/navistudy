<?php
declare(strict_types=1);

$base = rtrim($argv[1] ?? 'http://127.0.0.1:18787', '/');
$origin = $argv[2] ?? $base;
$cookies = [];

function check(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function callApi(string $method, string $path, ?array $body = null, array $headers = [], ?array &$cookies = null): array
{
    global $base;
    $requestHeaders = ['Accept: application/json'];
    if ($body !== null) $requestHeaders[] = 'Content-Type: application/json';
    foreach ($headers as $name => $value) $requestHeaders[] = $name . ': ' . $value;
    if ($cookies) {
        $pairs = [];
        foreach ($cookies as $name => $value) $pairs[] = $name . '=' . $value;
        $requestHeaders[] = 'Cookie: ' . implode('; ', $pairs);
    }
    $context = stream_context_create(['http' => [
        'method' => $method,
        'header' => implode("\r\n", $requestHeaders),
        'content' => $body === null ? '' : json_encode($body, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        'ignore_errors' => true,
        'follow_location' => 0,
        'timeout' => 10,
    ]]);
    $raw = file_get_contents($base . $path, false, $context);
    $responseHeaders = $http_response_header ?? [];
    preg_match('/\s(\d{3})\s/', $responseHeaders[0] ?? '', $statusMatch);
    $status = (int) ($statusMatch[1] ?? 0);
    foreach ($responseHeaders as $header) {
        if ($cookies !== null && preg_match('/^Set-Cookie:\s*([^=;]+)=([^;]*)/i', $header, $match)) {
            if ($match[2] === '' || $match[2] === 'deleted') unset($cookies[$match[1]]);
            else $cookies[$match[1]] = $match[2];
        }
    }
    $json = json_decode($raw === false ? '' : $raw, true);
    return ['status' => $status, 'headers' => $responseHeaders, 'body' => is_array($json) ? $json : [], 'raw' => $raw];
}

function errorCode(array $response): string
{
    return (string) ($response['body']['error']['code'] ?? '');
}

$username = 'http_' . bin2hex(random_bytes(5));
$password = '安全测试密码-2026-' . bin2hex(random_bytes(3));

$health = callApi('GET', '/healthz');
check($health['status'] === 200 && ($health['body']['status'] ?? '') === 'healthy', 'Health check failed.');

$blocked = callApi('POST', '/api/v1/auth/register', [
    'username' => $username . '_blocked', 'password' => $password, 'deviceId' => 'http-browser',
    'deviceName' => 'HTTP Test', 'clientId' => 'study-web', 'transport' => 'browser',
], ['Origin' => 'https://invalid.example']);
check($blocked['status'] === 403 && errorCode($blocked) === 'invalid_origin', 'Untrusted Origin was not rejected.');

$registered = callApi('POST', '/api/v1/auth/register', [
    'username' => $username, 'password' => $password, 'deviceId' => 'http-browser',
    'deviceName' => 'HTTP Test', 'clientId' => 'study-web', 'transport' => 'browser',
], ['Origin' => $origin], $cookies);
check($registered['status'] === 201 && !empty($registered['body']['recoveryCode']), 'Browser registration failed.');
check(isset($cookies['navi_access'], $cookies['navi_refresh'], $cookies['navi_sso'], $cookies['navi_csrf']), 'Browser auth cookies are incomplete.');

$account = callApi('GET', '/api/v1/account', null, [], $cookies);
check($account['status'] === 200 && ($account['body']['account']['username'] ?? '') === $username, 'Account lookup failed.');

$verifier = rtrim(strtr(base64_encode(random_bytes(40)), '+/', '-_'), '=');
$challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
$redirect = 'http://127.0.0.1:8081/navistudy-callback.html';
$authorize = callApi('GET', '/oauth/authorize?' . http_build_query([
    'response_type' => 'code', 'client_id' => 'words-web', 'redirect_uri' => $redirect,
    'code_challenge' => $challenge, 'code_challenge_method' => 'S256', 'state' => 'http-state',
]), null, [], $cookies);
check($authorize['status'] === 302, 'PKCE authorization did not redirect.');
$location = '';
foreach ($authorize['headers'] as $header) if (stripos($header, 'Location:') === 0) $location = trim(substr($header, 9));
parse_str((string) parse_url($location, PHP_URL_QUERY), $redirectQuery);
check(!empty($redirectQuery['code']) && ($redirectQuery['state'] ?? '') === 'http-state', 'Authorization response is incomplete.');

$token = callApi('POST', '/oauth/token', [
    'code' => $redirectQuery['code'], 'clientId' => 'words-web', 'redirectUri' => $redirect,
    'codeVerifier' => $verifier, 'deviceId' => 'http-browser', 'deviceName' => 'HTTP Test',
], ['Origin' => $origin], $cookies);
check($token['status'] === 200, 'Authorization code exchange failed.');
$reusedCode = callApi('POST', '/oauth/token', [
    'code' => $redirectQuery['code'], 'clientId' => 'words-web', 'redirectUri' => $redirect,
    'codeVerifier' => $verifier, 'deviceId' => 'http-browser', 'deviceName' => 'HTTP Test',
], ['Origin' => $origin], $cookies);
check($reusedCode['status'] === 401 && errorCode($reusedCode) === 'invalid_authorization_code', 'Authorization code reuse was accepted.');

$synced = callApi('POST', '/api/v1/sync/words', [
    'deviceId' => 'http-browser', 'baseRevision' => 0, 'schemaVersion' => 1,
    'mutations' => [[
        'mutationId' => 'http-mutation-' . bin2hex(random_bytes(6)), 'type' => 'merge_snapshot',
        'data' => ['favs' => [['key' => 'http_word', 'w' => 'verify']], 'wrongbook' => []],
    ]],
], ['Origin' => $origin, 'X-CSRF-Token' => urldecode($cookies['navi_csrf'])], $cookies);
check($synced['status'] === 200 && ($synced['body']['document']['favs'][0]['key'] ?? '') === 'http_word', 'Words sync failed.');
$isolated = callApi('GET', '/api/v1/sync/mt', null, [], $cookies);
check($isolated['status'] === 403 && errorCode($isolated) === 'insufficient_scope', 'Words session accessed MT data.');

$native = callApi('POST', '/api/v1/auth/login', [
    'username' => $username, 'password' => $password, 'deviceId' => 'http-native',
    'deviceName' => 'HTTP Native Test', 'clientId' => 'navistudy-wechat', 'transport' => 'native',
], ['Origin' => $origin]);
check($native['status'] === 200 && !empty($native['body']['refreshToken']), 'Native login failed.');
$refresh = callApi('POST', '/api/v1/auth/refresh', ['refreshToken' => $native['body']['refreshToken']], ['Origin' => $origin]);
check($refresh['status'] === 200 && $refresh['body']['refreshToken'] !== $native['body']['refreshToken'], 'Refresh token did not rotate.');
$replay = callApi('POST', '/api/v1/auth/refresh', ['refreshToken' => $native['body']['refreshToken']], ['Origin' => $origin]);
check($replay['status'] === 401 && errorCode($replay) === 'refresh_token_reused', 'Refresh token reuse was not detected.');

$deletion = callApi('POST', '/api/v1/account/deletion', ['password' => $password], [
    'Origin' => $origin, 'X-CSRF-Token' => urldecode($cookies['navi_csrf']),
], $cookies);
check($deletion['status'] === 200 && !empty($deletion['body']['deletionAt']), 'Deletion request failed.');
$loginAgain = callApi('POST', '/api/v1/auth/login', [
    'username' => $username, 'password' => $password, 'deviceId' => 'http-browser',
    'deviceName' => 'HTTP Test', 'clientId' => 'study-web', 'transport' => 'browser',
], ['Origin' => $origin], $cookies);
check($loginAgain['status'] === 200, 'Pending-deletion account could not enter account center.');
$cancelled = callApi('DELETE', '/api/v1/account/deletion', [], [
    'Origin' => $origin, 'X-CSRF-Token' => urldecode($cookies['navi_csrf']),
], $cookies);
check($cancelled['status'] === 200, 'Deletion cancellation failed.');

fwrite(STDOUT, "http-smoke: OK\n");
