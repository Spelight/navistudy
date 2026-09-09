<?php
declare(strict_types=1);

use NaviStudy\ApiException;
use NaviStudy\Config;
use NaviStudy\Database;
use NaviStudy\LegacyImporter;

require_once dirname(__DIR__) . '/src/bootstrap.php';
require_once dirname(__DIR__) . '/src/Database.php';
require_once dirname(__DIR__) . '/src/LegacyImporter.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$requestId = bin2hex(random_bytes(8));
$product = (string) ($_SERVER['NAVISTUDY_LEGACY_PRODUCT'] ?? '');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$host = strtolower(explode(':', (string) ($_SERVER['HTTP_HOST'] ?? ''))[0]);
$originHost = strtolower((string) parse_url($origin, PHP_URL_HOST));

function legacyRespond(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}

if (!in_array($product, ['words', 'mt'], true)) legacyRespond(['ok'=>false,'error'=>['code'=>'invalid_product','message'=>'产品配置无效。','requestId'=>$requestId]], 500);
if ($origin !== '' && $originHost !== $host) legacyRespond(['ok'=>false,'error'=>['code'=>'invalid_origin','message'=>'请求来源未获授权。','requestId'=>$requestId]], 403);
if ($origin !== '') {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') legacyRespond([], 204);

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET' || ($_GET['action'] ?? '') !== 'load') {
    legacyRespond(['ok'=>false,'error'=>[
        'code'=>'upgrade_required',
        'message'=>'匿名同步已停用，请升级并登录 Navi Passport。',
        'requestId'=>$requestId,
    ]], 410);
}

$username = trim((string) ($_GET['user'] ?? ''));
if ($username === '' || mb_strlen($username, 'UTF-8') > 40) {
    legacyRespond(['ok'=>false,'error'=>['code'=>'invalid_username','message'=>'用户名无效。','requestId'=>$requestId]], 400);
}

try {
    $config = Config::load(dirname(__DIR__));
    $document = (new LegacyImporter($config, new Database($config)))->legacyRead($product, $username);
    legacyRespond($document);
} catch (ApiException $error) {
    legacyRespond(['ok'=>false,'error'=>['code'=>$error->errorCode,'message'=>$error->getMessage(),'requestId'=>$requestId]], $error->status);
} catch (Throwable $error) {
    error_log(sprintf('[navistudy-legacy] request=%s type=%s', $requestId, get_class($error)));
    legacyRespond(['ok'=>false,'error'=>['code'=>'internal_error','message'=>'服务暂时不可用，请稍后重试。','requestId'=>$requestId]], 500);
}
