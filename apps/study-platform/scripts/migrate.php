<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';
require_once dirname(__DIR__) . '/src/Database.php';

$config = NaviStudy\Config::load(dirname(__DIR__));
(new NaviStudy\Database($config))->migrateAll();
fwrite(STDOUT, "NaviStudy databases are ready in " . $config->get('dataDir') . PHP_EOL);

