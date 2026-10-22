<?php
declare(strict_types=1);

date_default_timezone_set('Asia/Shanghai');
header('Content-Type: application/json; charset=utf-8');

$dataDir = getenv('NAVITOOLS_DATA_DIR') ?: '/var/lib/navistudy/tools';
$dataFile = $dataDir . '/availability.json';
$passportAccountUrl = getenv('NAVIPASSPORT_ACCOUNT_URL') ?: 'https://study.example.test/api/v1/account';
$defaultSessionLimit = 3;
$allowedOrigins = array_values(array_filter(array_map(
    static fn(string $value): string => rtrim(trim($value), '/'),
    explode(',', getenv('NAVITOOLS_ALLOWED_ORIGINS') ?: 'https://study.example.test,http://127.0.0.1:5173')
)));
$requestOrigin = rtrim(trim((string)($_SERVER['HTTP_ORIGIN'] ?? '')), '/');
if ($requestOrigin !== '' && !in_array($requestOrigin, $allowedOrigins, true)) {
    fail_json('invalid_origin', '请求来源未获授权。', 403);
}

if (!is_dir($dataDir)) {
    mkdir($dataDir, 0770, true);
}

function respond($value, int $status = 200): void {
    http_response_code($status);
    echo json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail_json(string $code, string $message, int $status): void {
    respond(['code' => $code, 'message' => $message], $status);
}

function read_json_body(): array {
    $raw = file_get_contents('php://input') ?: '';
    if ($raw === '') return [];
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) fail_json('invalid_json', 'Invalid JSON body', 400);
    return $decoded;
}

function default_periods(): array {
    return [
        ['id' => 'p1', 'label' => '1', 'start' => '08:00', 'end' => '08:45'],
        ['id' => 'p2', 'label' => '2', 'start' => '08:50', 'end' => '09:35'],
        ['id' => 'p3', 'label' => '3', 'start' => '10:00', 'end' => '10:45'],
        ['id' => 'p4', 'label' => '4', 'start' => '10:50', 'end' => '11:35'],
        ['id' => 'p5', 'label' => '5', 'start' => '13:30', 'end' => '14:15'],
        ['id' => 'p6', 'label' => '6', 'start' => '14:20', 'end' => '15:05'],
        ['id' => 'p7', 'label' => '7', 'start' => '15:30', 'end' => '16:15'],
        ['id' => 'p8', 'label' => '8', 'start' => '16:20', 'end' => '17:05'],
        ['id' => 'p9', 'label' => '9', 'start' => '18:30', 'end' => '19:15'],
        ['id' => 'p10', 'label' => '10', 'start' => '19:20', 'end' => '20:05'],
        ['id' => 'p11', 'label' => '11', 'start' => '20:20', 'end' => '21:05'],
        ['id' => 'p12', 'label' => '12', 'start' => '21:10', 'end' => '21:55'],
    ];
}

function weekday_label(DateTimeImmutable $date): string {
    return ["\u{5468}\u{65E5}", "\u{5468}\u{4E00}", "\u{5468}\u{4E8C}", "\u{5468}\u{4E09}", "\u{5468}\u{56DB}", "\u{5468}\u{4E94}", "\u{5468}\u{516D}"][(int)$date->format('w')];
}

function days_between(string $start, string $end): array {
    $startDate = new DateTimeImmutable($start);
    $endDate = new DateTimeImmutable($end);
    $days = [];
    for ($date = $startDate; $date <= $endDate; $date = $date->modify('+1 day')) {
        $days[] = [
            'id' => $date->format('Y-m-d'),
            'label' => weekday_label($date) . ' ' . $date->format('n/j'),
            'date' => $date->format('Y-m-d'),
        ];
    }
    return $days;
}

function validate_window(string $opensAt, string $closesAt, string $dateStart, string $dateEnd): void {
    $opens = new DateTimeImmutable($opensAt);
    $closes = new DateTimeImmutable($closesAt);
    $start = new DateTimeImmutable($dateStart);
    $end = new DateTimeImmutable($dateEnd);
    if ($closes < $opens) fail_json('invalid_request', 'Close time must be later than open time', 400);
    if ($end < $start) fail_json('invalid_request', 'Date range end must not be earlier than start', 400);
    if ((int)$start->diff($end)->format('%a') > 30) fail_json('invalid_request', 'Date range supports at most 31 days', 400);
}

function session_state(array $session): string {
    $now = new DateTimeImmutable('now');
    $opens = new DateTimeImmutable($session['opensAt']);
    $closes = new DateTimeImmutable($session['closesAt']);
    if ($now < $opens) return 'UPCOMING';
    if ($now > $closes) return 'CLOSED';
    return 'OPEN';
}

function session_view(array $session): array {
    $responses = $session['responses'] ?? [];
    $copy = $session;
    unset($copy['responses']);
    $copy['state'] = session_state($session);
    $copy['totalResponses'] = count($responses);
    $copy['ownerUsername'] = $session['ownerUsername'] ?? null;
    return $copy;
}

function load_store(string $file): array {
    if (!is_file($file)) return ['sessions' => [], 'adminTokens' => [], 'servicePermissions' => []];
    $decoded = json_decode(file_get_contents($file) ?: '', true);
    if (!is_array($decoded)) return ['sessions' => [], 'adminTokens' => [], 'servicePermissions' => []];
    $decoded['sessions'] = $decoded['sessions'] ?? [];
    $decoded['adminTokens'] = $decoded['adminTokens'] ?? [];
    $decoded['servicePermissions'] = $decoded['servicePermissions'] ?? [];
    $merged = array_merge(
        $decoded['servicePermissions']['naviagenda']['unrestrictedUsers'] ?? [],
        $decoded['servicePermissions']['naviplan']['unrestrictedUsers'] ?? [],
        $decoded['servicePermissions']['navitools']['unrestrictedUsers'] ?? [],
    );
    $decoded['servicePermissions']['navitools']['unrestrictedUsers'] = $merged;
    unset($decoded['servicePermissions']['naviagenda'], $decoded['servicePermissions']['naviplan']);
    return $decoded;
}

function purge_expired_sessions(array &$store): bool {
    $changed = false;
    $now = new DateTimeImmutable('now');
    foreach ($store['sessions'] as $id => $session) {
        try {
            $closes = new DateTimeImmutable($session['closesAt'] ?? 'now');
        } catch (Throwable $error) {
            $closes = $now;
        }
        if ($closes < $now) {
            unset($store['sessions'][$id]);
            $changed = true;
        }
    }
    return $changed;
}

function save_store(string $file, array $store): void {
    $tmp = $file . '.tmp-' . bin2hex(random_bytes(4));
    $json = json_encode($store, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);
    if (file_put_contents($tmp, $json, LOCK_EX) === false || !rename($tmp, $file)) {
        @unlink($tmp);
        fail_json('storage_unavailable', '数据暂时无法保存，请稍后重试。', 503);
    }
}

function bearer_token(): ?string {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (stripos($header, 'Bearer ') !== 0) return null;
    return trim(substr($header, 7));
}

function passport_account(string $accountUrl): array {
    $cookie = $_SERVER['HTTP_COOKIE'] ?? '';
    $bearer = bearer_token();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $origin = rtrim((string)($_SERVER['HTTP_ORIGIN'] ?? ''), '/');
    $allowedOrigins = $GLOBALS['allowedOrigins'] ?? [];
    if ($bearer === null && $method !== 'GET' && !in_array($origin, $allowedOrigins, true) && !getenv('NAVITOOLS_DEV_USER')) {
        fail_json('invalid_origin', '请求来源未获授权，请从 NaviTools 页面重试。', 403);
    }
    if ($cookie === '' && $bearer === null && getenv('NAVITOOLS_DEV_USER')) {
        return ['username' => getenv('NAVITOOLS_DEV_USER'), 'displayName' => getenv('NAVITOOLS_DEV_USER')];
    }
    $headers = "Accept: application/json\r\n";
    if ($cookie !== '') $headers .= "Cookie: " . $cookie . "\r\n";
    if ($bearer !== null) $headers .= "Authorization: Bearer " . $bearer . "\r\n";
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => $headers,
            'ignore_errors' => true,
            'timeout' => 4,
        ],
    ]);
    $raw = @file_get_contents($accountUrl, false, $context);
    if (!is_string($raw) || $raw === '') fail_json('passport_required', '请先登录 NaviPassport。', 401);
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) fail_json('passport_required', 'NaviPassport 登录状态不可用。', 401);
    $account = $decoded['account'] ?? $decoded['data']['account'] ?? $decoded['user'] ?? null;
    if (!is_array($account)) fail_json('passport_required', '请先登录 NaviPassport。', 401);
    $username = trim((string)($account['username'] ?? $account['name'] ?? $account['id'] ?? ''));
    if ($username === '') fail_json('passport_required', 'NaviPassport 账号缺少用户名。', 401);
    return [
        'username' => $username,
        'displayName' => $account['displayName'] ?? $account['nickname'] ?? $username,
        'id' => $account['id'] ?? null,
        'serviceAccess' => is_array($decoded['serviceAccess'] ?? null) ? $decoded['serviceAccess'] : [],
    ];
}

function permission_key(string $username): string {
    return strtolower(trim($username));
}

function is_unrestricted_user(array $store, string $username): bool {
    $key = permission_key($username);
    if ($key === 'dxir') return true;
    return !empty($store['servicePermissions']['navitools']['unrestrictedUsers'][$key]);
}

function can_manage_permissions(string $username): bool {
    return permission_key($username) === 'dxir';
}

function active_session_count(array $store, string $username): int {
    $key = permission_key($username);
    $count = 0;
    foreach ($store['sessions'] as $session) {
        if (permission_key($session['ownerUsername'] ?? '') === $key) $count++;
    }
    return $count;
}

function admin_profile(array $store, array $account, int $limit): array {
    $username = $account['username'];
    $toolsAccess = is_array($account['serviceAccess']['tools'] ?? null) ? $account['serviceAccess']['tools'] : [];
    if (array_key_exists('enabled', $toolsAccess) && !$toolsAccess['enabled']) {
        fail_json('service_disabled', '管理员已暂停该账号的 NaviTools 权限。', 403);
    }
    $unrestricted = array_key_exists('unrestricted', $toolsAccess)
        ? (bool) $toolsAccess['unrestricted']
        : is_unrestricted_user($store, $username);
    return [
        'username' => $username,
        'displayName' => $account['displayName'] ?? $username,
        'unrestricted' => $unrestricted,
        'canManagePermissions' => can_manage_permissions($username),
        'activeSessionCount' => active_session_count($store, $username),
        'sessionLimit' => $unrestricted ? null : $limit,
    ];
}

function require_admin(array $store, string $accountUrl, int $limit): array {
    $account = passport_account($accountUrl);
    return admin_profile($store, $account, $limit);
}

function require_session_owner(array $admin, array $session): void {
    if ($admin['canManagePermissions']) return;
    $owner = permission_key($session['ownerUsername'] ?? '');
    if ($owner === '' || $owner !== permission_key($admin['username'])) {
        fail_json('forbidden', '你只能管理自己创建的问卷。', 403);
    }
}

function uuidish(string $prefix): string {
    return $prefix . '-' . substr(bin2hex(random_bytes(8)), 0, 8);
}

function short_text($value, string $fallback, int $limit = 80): string {
    $text = trim(is_string($value) ? $value : $fallback);
    if ($text === '') $text = $fallback;
    return function_exists('mb_substr') ? mb_substr($text, 0, $limit) : substr($text, 0, $limit);
}

function valid_slots_for_session(array $session): array {
    $valid = [];
    foreach ($session['days'] as $day) {
        foreach ($session['periods'] as $period) {
            $valid[$day['id'] . '-' . $period['id']] = true;
        }
    }
    return $valid;
}

function response_view(string $token, array $response): array {
    return [
        'token' => $token,
        'respondentName' => $response['respondentName'] ?? null,
        'slots' => array_values($response['slots'] ?? []),
        'submittedAt' => $response['submittedAt'] ?? '',
    ];
}

function validate_response_payload(array $session, array $body): array {
    $valid = valid_slots_for_session($session);
    $slots = array_values(array_unique($body['slots'] ?? []));
    $respondentName = trim($body['respondentName'] ?? '');
    if (!empty($session['nameRequired']) && $respondentName === '') fail_json('invalid_request', 'Name is required', 400);
    if (!$slots) fail_json('invalid_request', 'Select at least one slot', 400);
    foreach ($slots as $slot) {
        if (empty($valid[$slot])) fail_json('invalid_request', 'Invalid timetable slot', 400);
    }
    return [$respondentName, $slots];
}

function user_statuses(array $store): array {
    $users = [];
    foreach ($store['sessions'] as $session) {
        $username = trim((string)($session['ownerUsername'] ?? 'legacy-admin'));
        $key = permission_key($username);
        if (empty($users[$key])) {
            $users[$key] = [
                'username' => $username,
                'displayName' => $session['ownerDisplayName'] ?? $username,
                'unrestricted' => is_unrestricted_user($store, $username),
                'activeSessionCount' => 0,
                'totalSessionCount' => 0,
                'responseCount' => 0,
            ];
        }
        $users[$key]['activeSessionCount']++;
        $users[$key]['totalSessionCount']++;
        $users[$key]['responseCount'] += count($session['responses'] ?? []);
    }
    $permissionUsers = $store['servicePermissions']['navitools']['unrestrictedUsers'] ?? [];
    foreach ($permissionUsers as $key => $enabled) {
        if (!$enabled) continue;
        if (empty($users[$key])) {
            $users[$key] = [
                'username' => $key,
                'displayName' => $key,
                'unrestricted' => true,
                'activeSessionCount' => 0,
                'totalSessionCount' => 0,
                'responseCount' => 0,
            ];
        } else {
            $users[$key]['unrestricted'] = true;
        }
    }
    if (empty($users['dxir'])) {
        $users['dxir'] = [
            'username' => 'Dxir',
            'displayName' => 'Dxir',
            'unrestricted' => true,
            'activeSessionCount' => 0,
            'totalSessionCount' => 0,
            'responseCount' => 0,
        ];
    }
    $list = array_values($users);
    usort($list, fn($a, $b) => strcmp(strtolower($a['username']), strtolower($b['username'])));
    return $list;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$prefixes = ['/tools/api/availability', '/navitools/api/availability'];
foreach ($prefixes as $prefix) {
    if (str_starts_with($path, $prefix)) {
        $path = substr($path, strlen($prefix));
        break;
    }
}
$path = '/' . trim($path, '/');
$parts = $path === '/' ? [] : explode('/', trim($path, '/'));

$storeLock = fopen($dataDir . '/availability.lock', 'c');
if ($storeLock === false || !flock($storeLock, LOCK_EX)) {
    fail_json('storage_unavailable', '问卷数据暂时无法读取，请稍后重试。', 503);
}
register_shutdown_function(static function () use ($storeLock): void {
    flock($storeLock, LOCK_UN);
    fclose($storeLock);
});

$store = load_store($dataFile);
if (purge_expired_sessions($store)) {
    save_store($dataFile, $store);
}

if ($method === 'GET' && $path === '/admin/me') {
    respond(require_admin($store, $passportAccountUrl, $defaultSessionLimit));
}

if ($method === 'GET' && $path === '/admin/users') {
    $admin = require_admin($store, $passportAccountUrl, $defaultSessionLimit);
    if (empty($admin['canManagePermissions'])) fail_json('forbidden', 'Only Dxir can manage service permissions', 403);
    respond(user_statuses($store));
}

if ($method === 'PATCH' && count($parts) === 4 && $parts[0] === 'admin' && $parts[1] === 'users' && $parts[3] === 'permissions') {
    $admin = require_admin($store, $passportAccountUrl, $defaultSessionLimit);
    if (empty($admin['canManagePermissions'])) fail_json('forbidden', 'Only Dxir can manage service permissions', 403);
    $username = trim(urldecode($parts[2]));
    if ($username === '') fail_json('invalid_request', 'Username is required', 400);
    if (permission_key($username) === 'dxir') fail_json('invalid_request', 'Dxir is always unrestricted', 400);
    $body = read_json_body();
    $key = permission_key($username);
    $store['servicePermissions']['navitools']['unrestrictedUsers'][$key] = !empty($body['unrestricted']);
    save_store($dataFile, $store);
    foreach (user_statuses($store) as $status) {
        if (permission_key($status['username']) === $key) respond($status);
    }
    respond([
        'username' => $username,
        'displayName' => $username,
        'unrestricted' => !empty($body['unrestricted']),
        'activeSessionCount' => 0,
        'totalSessionCount' => 0,
        'responseCount' => 0,
    ]);
}

if ($method === 'GET' && $path === '/sessions') {
    $admin = require_admin($store, $passportAccountUrl, $defaultSessionLimit);
    $owned = array_filter(array_values($store['sessions']), function ($session) use ($admin) {
        return !empty($admin['canManagePermissions']) || permission_key($session['ownerUsername'] ?? '') === permission_key($admin['username']);
    });
    $views = array_map('session_view', $owned);
    usort($views, fn($a, $b) => strcmp($b['opensAt'], $a['opensAt']));
    respond($views);
}

if ($method === 'POST' && $path === '/sessions') {
    $admin = require_admin($store, $passportAccountUrl, $defaultSessionLimit);
    if (empty($admin['unrestricted']) && active_session_count($store, $admin['username']) >= $defaultSessionLimit) {
        fail_json('quota_exceeded', '普通账号最多同时创建 3 个问卷。请删除旧问卷，或等待问卷到期自动删除。', 403);
    }
    $body = read_json_body();
    foreach (['opensAt', 'closesAt', 'dateStart', 'dateEnd'] as $key) {
        if (empty($body[$key])) fail_json('invalid_request', $key . ' is required', 400);
    }
    validate_window($body['opensAt'], $body['closesAt'], $body['dateStart'], $body['dateEnd']);
    $id = uuidish('availability');
    $session = [
        'id' => $id,
        'ownerUsername' => $admin['username'],
        'ownerDisplayName' => $admin['displayName'] ?? $admin['username'],
        'title' => short_text($body['title'] ?? null, 'Availability'),
        'termLabel' => short_text($body['termLabel'] ?? null, 'Plan'),
        'weekLabel' => short_text($body['weekLabel'] ?? null, 'Activity'),
        'nameRequired' => (bool)($body['nameRequired'] ?? false),
        'opensAt' => $body['opensAt'],
        'closesAt' => $body['closesAt'],
        'dateStart' => $body['dateStart'],
        'dateEnd' => $body['dateEnd'],
        'days' => days_between($body['dateStart'], $body['dateEnd']),
        'periods' => default_periods(),
        'responses' => [],
    ];
    $store['sessions'][$id] = $session;
    save_store($dataFile, $store);
    respond(session_view($session), 201);
}

if (count($parts) >= 2 && $parts[0] === 'sessions') {
    $id = $parts[1];
    if (empty($store['sessions'][$id])) fail_json('not_found', 'Session not found', 404);
    $session =& $store['sessions'][$id];

    if ($method === 'GET' && count($parts) === 2) {
        respond(session_view($session));
    }

    if ($method === 'PATCH' && count($parts) === 2) {
        $admin = require_admin($store, $passportAccountUrl, $defaultSessionLimit);
        require_session_owner($admin, $session);
        $body = read_json_body();
        $candidate = $session;
        foreach (['title', 'termLabel', 'weekLabel', 'nameRequired', 'opensAt', 'closesAt', 'dateStart', 'dateEnd'] as $key) {
            if (array_key_exists($key, $body)) $candidate[$key] = is_string($body[$key]) ? trim($body[$key]) : $body[$key];
        }
        $candidate['nameRequired'] = (bool)($candidate['nameRequired'] ?? false);
        validate_window($candidate['opensAt'], $candidate['closesAt'], $candidate['dateStart'], $candidate['dateEnd']);
        $candidate['days'] = days_between($candidate['dateStart'], $candidate['dateEnd']);
        $session = $candidate;
        save_store($dataFile, $store);
        respond(session_view($session));
    }

    if ($method === 'DELETE' && count($parts) === 2) {
        $admin = require_admin($store, $passportAccountUrl, $defaultSessionLimit);
        require_session_owner($admin, $session);
        unset($store['sessions'][$id]);
        save_store($dataFile, $store);
        respond(['deleted' => true, 'id' => $id]);
    }

    if ($method === 'POST' && count($parts) === 3 && $parts[2] === 'responses') {
        if (session_state($session) !== 'OPEN') {
            fail_json('invalid_request', session_state($session) === 'UPCOMING' ? 'Session is not open yet' : 'Session is closed', 400);
        }
        $body = read_json_body();
        [$respondentName, $slots] = validate_response_payload($session, $body);
        $token = trim($body['respondentToken'] ?? '') ?: uuidish('response');
        $session['responses'][$token] = [
            'respondentName' => $respondentName ?: null,
            'slots' => $slots,
            'submittedAt' => (new DateTimeImmutable('now'))->format('Y-m-d\TH:i:s'),
        ];
        save_store($dataFile, $store);
        respond([
            'responseToken' => $token,
            'totalResponses' => count($session['responses']),
            'slotCount' => count($slots),
            'submittedAt' => $session['responses'][$token]['submittedAt'],
        ]);
    }

    if ($method === 'GET' && count($parts) === 3 && $parts[2] === 'responses') {
        $admin = require_admin($store, $passportAccountUrl, $defaultSessionLimit);
        require_session_owner($admin, $session);
        $responses = [];
        foreach (($session['responses'] ?? []) as $token => $response) {
            $responses[] = response_view($token, $response);
        }
        usort($responses, fn($a, $b) => strcmp($b['submittedAt'], $a['submittedAt']));
        respond($responses);
    }

    if ($method === 'GET' && count($parts) === 4 && $parts[2] === 'responses') {
        $token = $parts[3];
        if (empty($session['responses'][$token])) fail_json('not_found', 'Response not found', 404);
        respond($session['responses'][$token]);
    }

    if ($method === 'PATCH' && count($parts) === 4 && $parts[2] === 'responses') {
        $admin = require_admin($store, $passportAccountUrl, $defaultSessionLimit);
        require_session_owner($admin, $session);
        $token = $parts[3];
        if (empty($session['responses'][$token])) fail_json('not_found', 'Response not found', 404);
        $body = read_json_body();
        [$respondentName, $slots] = validate_response_payload($session, $body);
        $session['responses'][$token] = [
            'respondentName' => $respondentName ?: null,
            'slots' => $slots,
            'submittedAt' => $session['responses'][$token]['submittedAt'] ?? (new DateTimeImmutable('now'))->format('Y-m-d\TH:i:s'),
        ];
        save_store($dataFile, $store);
        respond(response_view($token, $session['responses'][$token]));
    }

    if ($method === 'GET' && count($parts) === 3 && ($parts[2] === 'stats' || $parts[2] === 'public-stats')) {
        if ($parts[2] === 'stats') {
            $admin = require_admin($store, $passportAccountUrl, $defaultSessionLimit);
            require_session_owner($admin, $session);
        }
        $counts = [];
        $namesBySlot = [];
        $responseIndex = 0;
        foreach ($session['responses'] as $response) {
            $responseIndex++;
            $displayName = $response['respondentName'] ?: ('Unnamed ' . $responseIndex);
            foreach ($response['slots'] as $slot) {
                $counts[$slot] = ($counts[$slot] ?? 0) + 1;
                $namesBySlot[$slot] = $namesBySlot[$slot] ?? [];
                $namesBySlot[$slot][] = $displayName;
            }
        }
        $cells = [];
        $totalResponses = count($session['responses']);
        foreach ($session['days'] as $day) {
            foreach ($session['periods'] as $period) {
                $slot = $day['id'] . '-' . $period['id'];
                $names = $namesBySlot[$slot] ?? [];
                sort($names, SORT_NATURAL | SORT_FLAG_CASE);
                $count = $counts[$slot] ?? 0;
                $cells[] = [
                    'slotId' => $slot,
                    'count' => $count,
                    'names' => $names,
                    'allAvailable' => $totalResponses > 0 && $count === $totalResponses,
                ];
            }
        }
        respond([
            'session' => session_view($session),
            'cells' => $cells,
            'maxCount' => $counts ? max($counts) : 0,
        ]);
    }
}

fail_json('not_found', 'API not found', 404);
