<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Methods: GET, OPTIONS');
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
    echo json_encode(['error' => 'origin denied'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'method not allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

$query = trim($_GET['q'] ?? '');
if ($query === '' || mb_strlen($query, 'UTF-8') > 180) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid query'], JSON_UNESCAPED_UNICODE);
    exit;
}

$direction = preg_match('/\p{Han}/u', $query) ? 'zh-en' : 'en-zh';
$cacheFile = __DIR__ . '/lookup.runtime.json';
$lockFile = __DIR__ . '/lookup.runtime.lock';
$cacheKey = sha1($direction . '|' . mb_strtolower($query, 'UTF-8'));
$ttl = 60 * 60 * 24 * 30;

function readJsonFile($file) {
    if (!file_exists($file)) return [];
    $raw = @file_get_contents($file);
    if ($raw === false || $raw === '') return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function writeJsonFileLocked($file, $lockFile, $data) {
    $fp = @fopen($lockFile, 'c');
    if (!$fp) return false;
    if (!flock($fp, LOCK_EX)) {
        fclose($fp);
        return false;
    }
    $ok = @file_put_contents($file, json_encode($data, JSON_UNESCAPED_UNICODE));
    flock($fp, LOCK_UN);
    fclose($fp);
    return $ok !== false;
}

function httpJson($url, $timeout = 7) {
    if (!function_exists('curl_init')) return null;
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_USERAGENT => 'DXIR-Words-Lookup/1.0',
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_HTTPHEADER => ['Accept: application/json']
    ]);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($body === false || $code < 200 || $code >= 300) return null;
    $data = json_decode($body, true);
    return is_array($data) ? $data : null;
}

function cleanCandidate($text) {
    $text = trim((string)$text);
    $text = preg_replace('/\s+/u', ' ', $text);
    return mb_substr($text, 0, 120, 'UTF-8');
}

function collectTranslations($payload) {
    $out = [];
    $primary = cleanCandidate($payload['responseData']['translatedText'] ?? '');
    if ($primary !== '') $out[] = $primary;
    foreach (($payload['matches'] ?? []) as $m) {
        $t = cleanCandidate($m['translation'] ?? '');
        if ($t !== '' && !in_array($t, $out, true)) $out[] = $t;
        if (count($out) >= 8) break;
    }
    return $out;
}

function firstEnglishTerm($text) {
    $text = html_entity_decode((string)$text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    if (preg_match('/[A-Za-z][A-Za-z\s\'-]*/', $text, $m)) {
        return strtolower(trim($m[0]));
    }
    return '';
}

function dictionaryEntry($word) {
    $word = strtolower(trim($word));
    if ($word === '' || !preg_match('/^[a-z][a-z\' -]{0,80}$/', $word)) return null;
    $url = 'https://api.dictionaryapi.dev/api/v2/entries/en/' . rawurlencode($word);
    $data = httpJson($url);
    if (is_array($data) && isset($data[0]) && is_array($data[0])) return $data[0];
    return null;
}

function translationOnlyEntry($word, $definition) {
    return [
        'word' => $word,
        'phonetics' => [],
        'meanings' => [[
            'partOfSpeech' => 'translation',
            'definitions' => [[
                'definition' => $definition,
                'example' => ''
            ]]
        ]],
        '_translationOnly' => true
    ];
}

$cache = readJsonFile($cacheFile);
if (isset($cache[$cacheKey]) && is_array($cache[$cacheKey])) {
    $hit = $cache[$cacheKey];
    if (time() - (int)($hit['saved_at'] ?? 0) < $ttl && isset($hit['result'])) {
        $hit['result']['cached'] = true;
        echo json_encode($hit['result'], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

$source = $direction === 'zh-en' ? 'zh-CN' : 'en';
$target = $direction === 'zh-en' ? 'en' : 'zh-CN';
$transUrl = 'https://api.mymemory.translated.net/get?q=' . rawurlencode($query) . '&langpair=' . rawurlencode($source . '|' . $target);
$transPayload = httpJson($transUrl);
$candidates = $transPayload ? collectTranslations($transPayload) : [];
$translated = $candidates[0] ?? '';

$dictWord = $direction === 'zh-en' ? firstEnglishTerm($translated) : strtolower($query);
$entry = dictionaryEntry($dictWord);
if (!$entry) {
    $fallbackWord = $direction === 'zh-en' ? ($dictWord ?: ($translated ?: $query)) : $query;
    $fallbackDef = $direction === 'zh-en' ? $query : ($translated ?: 'No dictionary result found.');
    $entry = translationOnlyEntry($fallbackWord, $fallbackDef);
}

$entry['_query'] = $query;
$entry['_direction'] = $direction;
$entry['_translatedText'] = $translated;
$entry['_candidates'] = $candidates;

$result = [
    'ok' => true,
    'query' => $query,
    'direction' => $direction,
    'translatedText' => $translated,
    'candidates' => $candidates,
    'entry' => $entry,
    'cached' => false,
    'sources' => ['dictionaryapi.dev', 'mymemory.translated.net']
];

$cache[$cacheKey] = ['saved_at' => time(), 'result' => $result];
if (count($cache) > 600) {
    uasort($cache, function($a, $b) {
        return (int)($b['saved_at'] ?? 0) <=> (int)($a['saved_at'] ?? 0);
    });
    $cache = array_slice($cache, 0, 500, true);
}
writeJsonFileLocked($cacheFile, $lockFile, $cache);

echo json_encode($result, JSON_UNESCAPED_UNICODE);
