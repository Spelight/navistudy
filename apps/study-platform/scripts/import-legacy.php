<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';
require_once dirname(__DIR__) . '/src/Database.php';
require_once dirname(__DIR__) . '/src/LegacyImporter.php';

if ($argc !== 4 || !in_array($argv[1], ['words','mt'], true)) {
    fwrite(STDERR, "Usage: php scripts/import-legacy.php <words|mt> <json-path> <read-until-ISO-date>\n");
    exit(2);
}
$until = strtotime($argv[3]);
if ($until === false) { fwrite(STDERR, "Invalid read-until date.\n"); exit(2); }
$config = NaviStudy\Config::load(dirname(__DIR__));
$result = (new NaviStudy\LegacyImporter($config, new NaviStudy\Database($config)))->importFile($argv[1], $argv[2], $until);
fwrite(STDOUT, json_encode($result, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . PHP_EOL);

