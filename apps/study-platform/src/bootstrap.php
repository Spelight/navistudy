<?php
declare(strict_types=1);

require_once __DIR__ . '/Config.php';
require_once __DIR__ . '/Http.php';
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/AuthService.php';
require_once __DIR__ . '/SyncService.php';
require_once __DIR__ . '/LegacyImporter.php';
require_once __DIR__ . '/AdminService.php';
require_once __DIR__ . '/AnalyticsService.php';

use NaviStudy\Config;
use NaviStudy\Database;

$root = dirname(__DIR__);
$config = Config::load($root);
$database = new Database($config);

return [$config, $database];
