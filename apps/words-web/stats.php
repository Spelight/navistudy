<?php
header('Content-Type: application/json');
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

$keys = ['users', 'favs', 'cards', 'quiz'];
$baseFile = __DIR__ . '/stats.json';
$runtimeFile = __DIR__ . '/stats.runtime.json';
$lockFile = __DIR__ . '/stats.runtime.lock';

function emptyStats($keys) {
    return array_fill_keys($keys, 0);
}

function readJsonFileSafe($file, $keys) {
    if (!file_exists($file)) return emptyStats($keys);
    $raw = @file_get_contents($file);
    if ($raw === false) return emptyStats($keys);
    $data = json_decode($raw, true);
    if (!is_array($data)) $data = emptyStats($keys);
    foreach ($keys as $k) if (!isset($data[$k])) $data[$k] = 0;
    return $data;
}

function writableStatsFile($baseFile, $runtimeFile) {
    if (file_exists($baseFile) && is_writable($baseFile)) return $baseFile;
    if (!file_exists($runtimeFile)) {
        $seed = file_exists($baseFile) ? @file_get_contents($baseFile) : false;
        if ($seed !== false) {
            @file_put_contents($runtimeFile, $seed);
        } else {
            @file_put_contents($runtimeFile, json_encode(['users'=>0,'favs'=>0,'cards'=>0,'quiz'=>0]));
        }
    }
    return $runtimeFile;
}

$action = $_GET['action'] ?? '';

if ($action === 'get') {
    $src = file_exists($runtimeFile) ? $runtimeFile : $baseFile;
    echo json_encode(readJsonFileSafe($src, $keys));
    exit;
}

if ($action === 'hit') {
    $key = $_GET['key'] ?? '';
    if (!in_array($key, $keys, true)) {
        http_response_code(400);
        echo json_encode(['error' => 'invalid key']);
        exit;
    }

    $target = writableStatsFile($baseFile, $runtimeFile);
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

    $data = readJsonFileSafe($target, $keys);
    $data[$key]++;
    $ok = @file_put_contents($target, json_encode($data, JSON_UNESCAPED_UNICODE));

    flock($fp, LOCK_UN);
    fclose($fp);

    if ($ok === false) {
        http_response_code(500);
        echo json_encode(['error' => 'write failed']);
        exit;
    }

    echo json_encode(['key' => $key, 'value' => $data[$key], 'store' => basename($target)]);
    exit;
}

http_response_code(400);
echo json_encode(['error' => 'unknown action']);
