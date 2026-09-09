<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';
require_once dirname(__DIR__) . '/src/Database.php';

$config = NaviStudy\Config::load(dirname(__DIR__));
$database = new NaviStudy\Database($config);
$passport = $database->passport();
$now = time();
$passport->beginTransaction();
try {
    $users = $passport->prepare("SELECT id FROM users WHERE status='pending_delete' AND deletion_at<=?");
    $users->execute([$now]);
    $ids = $users->fetchAll(PDO::FETCH_COLUMN);
    foreach ($ids as $id) {
        foreach (['words','mt'] as $product) {
            $pdo = $database->product($product);
            $pdo->beginTransaction();
            foreach (['snapshots','mutations','documents'] as $table) $pdo->prepare("DELETE FROM {$table} WHERE user_id=?")->execute([$id]);
            $pdo->commit();
        }
        $passport->prepare('DELETE FROM users WHERE id=?')->execute([$id]);
    }
    $passport->prepare('DELETE FROM access_tokens WHERE expires_at<? OR revoked_at<?')->execute([$now-86400,$now-2592000]);
    $passport->prepare('DELETE FROM oauth_codes WHERE expires_at<?')->execute([$now-86400]);
    $passport->prepare('DELETE FROM used_refresh_tokens WHERE used_at<?')->execute([$now-2592000]);
    $passport->prepare('DELETE FROM login_attempts WHERE first_at<?')->execute([$now-86400]);
    $passport->commit();
    fwrite(STDOUT, 'Deleted accounts: ' . count($ids) . PHP_EOL);
} catch (Throwable $error) {
    if ($passport->inTransaction()) $passport->rollBack();
    throw $error;
}

