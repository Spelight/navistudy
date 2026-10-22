<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, no-store');
header('X-Content-Type-Options: nosniff');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && $origin !== 'https://mt.example.test') {
    http_response_code(403);
    echo json_encode(['error' => 'origin not allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}
if ($origin !== '') {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

const DATA_FILE = '/var/lib/navistudy/mt-userdata.json';
const MAX_BODY_BYTES = 2097152;

function respond(array $payload, int $status = 200): never {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function sanitizeUser(mixed $value): string {
    $user = trim((string) ($value ?? ''));
    $clean = preg_replace('/[^a-zA-Z0-9\x{4e00}-\x{9fff}_\-]/u', '', $user) ?? '';
    return mb_strlen($clean) <= 40 ? $clean : '';
}

function emptyData(): array {
    return [
        'favorites' => [],
        'answers' => new stdClass(),
        'wrongbook' => new stdClass(),
        'mastered' => new stdClass(),
        'lastProgress' => null,
        'progressPositions' => new stdClass(),
        'studyEvents' => [],
        'sessions' => []
    ];
}

function normalizeData(mixed $value): array {
    $data = is_array($value) ? $value : [];
    $normalized = emptyData();
    foreach (['favorites', 'studyEvents', 'sessions'] as $key) {
        if (isset($data[$key]) && is_array($data[$key])) $normalized[$key] = array_values($data[$key]);
    }
    foreach (['answers', 'wrongbook', 'mastered', 'progressPositions'] as $key) {
        if (isset($data[$key]) && is_array($data[$key])) {
            $normalized[$key] = count($data[$key]) ? $data[$key] : new stdClass();
        }
    }
    if (isset($data['lastProgress']) && is_array($data['lastProgress'])) {
        $normalized['lastProgress'] = $data['lastProgress'];
    }
    return $normalized;
}

function readUsers(): array {
    if (!is_file(DATA_FILE)) return [];
    $decoded = json_decode((string) file_get_contents(DATA_FILE), true);
    return is_array($decoded) ? $decoded : [];
}

$action = $_GET['action'] ?? '';

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'load') {
    $user = sanitizeUser($_GET['user'] ?? '');
    if ($user === '') respond(['error' => 'invalid user'], 400);
    $users = readUsers();
    respond(isset($users[$user]['data']) ? normalizeData($users[$user]['data']) : emptyData());
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'save') {
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > MAX_BODY_BYTES) respond(['error' => 'payload too large'], 413);
    $body = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($body)) respond(['error' => 'bad body'], 400);
    $user = sanitizeUser($body['user'] ?? '');
    if ($user === '') respond(['error' => 'invalid user'], 400);
    if (!isset($body['data']) || !is_array($body['data'])) respond(['error' => 'invalid data'], 400);

    $directory = dirname(DATA_FILE);
    if (!is_dir($directory) || !is_writable($directory)) respond(['error' => 'storage unavailable'], 503);
    $lock = fopen(DATA_FILE . '.lock', 'c');
    if ($lock === false || !flock($lock, LOCK_EX)) respond(['error' => 'storage lock failed'], 503);

    $users = readUsers();
    $existing = isset($users[$user]['data']) ? normalizeData($users[$user]['data']) : emptyData();
    $incoming = normalizeData($body['data']);
    foreach (['lastProgress', 'progressPositions', 'studyEvents'] as $preservedKey) {
        if (!array_key_exists($preservedKey, $body['data'])) $incoming[$preservedKey] = $existing[$preservedKey];
    }
    $users[$user] = [
        'schemaVersion' => 1,
        'updatedAt' => gmdate('c'),
        'data' => $incoming
    ];
    $json = json_encode($users, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $temporary = DATA_FILE . '.tmp-' . bin2hex(random_bytes(6));
    $saved = $json !== false && file_put_contents($temporary, $json, LOCK_EX) !== false && rename($temporary, DATA_FILE);
    if (is_file($temporary)) unlink($temporary);
    flock($lock, LOCK_UN);
    fclose($lock);
    if (!$saved) respond(['error' => 'save failed'], 500);
    respond(['ok' => true, 'updatedAt' => $users[$user]['updatedAt']]);
}

respond(['error' => 'unknown action'], 400);
