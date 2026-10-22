<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-cache, no-store');

function requestOriginAllowed() {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin === '') return true;
    $originHost = parse_url($origin, PHP_URL_HOST);
    $host = $_SERVER['HTTP_HOST'] ?? '';
    $host = explode(':', $host)[0];
    if ($originHost && strcasecmp($originHost, $host) === 0) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        return true;
    }
    return false;
}

if (!requestOriginAllowed()) {
    http_response_code(403);
    echo json_encode(['error' => 'origin denied']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

$baseFile = __DIR__ . '/userdata.json';
$runtimeFile = __DIR__ . '/userdata.runtime.json';
$lockFile = __DIR__ . '/userdata.runtime.lock';

function sanitizeUser($u) {
    return preg_replace('/[^a-zA-Z0-9\x{4e00}-\x{9fff}_\-]/u', '', trim($u ?? ''));
}

function readData($file) {
    if (!file_exists($file)) return [];
    $raw = @file_get_contents($file);
    if ($raw === false) return [];
    $d = json_decode($raw, true);
    return is_array($d) ? $d : [];
}

function normalizeWrongbook($value) {
    if (!is_array($value) || count($value) === 0) return new stdClass();
    return $value;
}

function normalizeListArray($value) {
    if (!is_array($value)) return [];
    return array_values($value);
}

function writableUserFile($baseFile, $runtimeFile) {
    if (file_exists($baseFile) && is_writable($baseFile)) return $baseFile;
    if (!file_exists($runtimeFile)) {
        $seed = file_exists($baseFile) ? @file_get_contents($baseFile) : false;
        if ($seed !== false) @file_put_contents($runtimeFile, $seed);
        else @file_put_contents($runtimeFile, json_encode([], JSON_UNESCAPED_UNICODE));
    }
    return $runtimeFile;
}

function parseSaveBody() {
    $raw = file_get_contents('php://input');
    if (is_string($raw)) {
        $raw = preg_replace('/^\xEF\xBB\xBF/', '', $raw);
    }

    $body = json_decode($raw ?? '', true);
    if (is_string($body)) {
        $body2 = json_decode($body, true);
        if (is_array($body2)) return $body2;
    }
    if (is_array($body)) return $body;

    if (!empty($_POST)) return $_POST;

    $parsed = [];
    if (is_string($raw) && strlen($raw) > 0) {
        parse_str($raw, $parsed);
    }
    return is_array($parsed) ? $parsed : null;
}

$action = $_GET['action'] ?? '';

if ($action === 'load') {
    $user = sanitizeUser($_GET['user'] ?? '');
    if (!$user || mb_strlen($user) > 40) {
        echo json_encode(['error' => 'invalid user']);
        exit;
    }
    $src = file_exists($runtimeFile) ? $runtimeFile : $baseFile;
    $data = readData($src);
    $result = $data[$user] ?? [];
    if (!isset($result['favs']) || !is_array($result['favs'])) $result['favs'] = [];
    if (!array_key_exists('last_progress', $result)) $result['last_progress'] = null;
    $result['wrongbook'] = normalizeWrongbook($result['wrongbook'] ?? null);
    $result['custom_lists'] = normalizeListArray($result['custom_lists'] ?? []);
    $result['lookup_history'] = normalizeListArray($result['lookup_history'] ?? []);
    echo json_encode($result, JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'save') {
    $body = parseSaveBody();
    if (!is_array($body)) {
        http_response_code(400);
        echo json_encode(['error' => 'bad body']);
        exit;
    }

    $user = sanitizeUser($body['user'] ?? '');
    if (!$user || mb_strlen($user) > 40) {
        echo json_encode(['error' => 'invalid user']);
        exit;
    }

    $favs = isset($body['favs']) && is_array($body['favs']) ? $body['favs'] : [];
    $progress = isset($body['last_progress']) && is_array($body['last_progress']) ? $body['last_progress'] : null;
    $wrongbook = normalizeWrongbook($body['wrongbook'] ?? null);
    $customLists = normalizeListArray($body['custom_lists'] ?? []);
    $lookupHistory = normalizeListArray($body['lookup_history'] ?? []);

    $target = writableUserFile($baseFile, $runtimeFile);
    $fp = @fopen($lockFile, 'c');
    if (!$fp) {
        http_response_code(500);
        echo json_encode(['error' => 'lock open failed']);
        exit;
    }
    if (!flock($fp, LOCK_EX)) {
        fclose($fp);
        http_response_code(500);
        echo json_encode(['error' => 'lock failed']);
        exit;
    }

    $data = readData($target);
    $data[$user] = [
        'favs' => $favs,
        'last_progress' => $progress,
        'wrongbook' => $wrongbook,
        'custom_lists' => $customLists,
        'lookup_history' => $lookupHistory,
        'updated' => date('c')
    ];
    $ok = @file_put_contents($target, json_encode($data, JSON_UNESCAPED_UNICODE));

    flock($fp, LOCK_UN);
    fclose($fp);

    if ($ok === false) {
        http_response_code(500);
        echo json_encode(['error' => 'write failed']);
        exit;
    }

    echo json_encode(['ok' => true, 'store' => basename($target)]);
    exit;
}

http_response_code(400);
echo json_encode(['error' => 'unknown action']);
