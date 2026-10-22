<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI only\n");
    exit(2);
}

$source = $argv[1] ?? '/var/www/naviagenda-data/availability.json';
$target = $argv[2] ?? '/var/lib/navistudy/tools/availability.json';

function readStore(string $path): array {
    if (!is_file($path)) return ['sessions' => [], 'adminTokens' => [], 'servicePermissions' => []];
    $value = json_decode(file_get_contents($path) ?: '', true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($value)) throw new RuntimeException("Invalid Availability store: {$path}");
    return $value + ['sessions' => [], 'adminTokens' => [], 'servicePermissions' => []];
}

$old = readStore($source);
$current = readStore($target);
$oldCount = count($old['sessions'] ?? []);
$merged = $current;
$merged['sessions'] = array_replace($old['sessions'] ?? [], $current['sessions'] ?? []);
$merged['adminTokens'] = array_replace($old['adminTokens'] ?? [], $current['adminTokens'] ?? []);

$permissions = [];
foreach ([$old, $current] as $store) {
    foreach (['naviagenda', 'naviplan', 'navitools'] as $service) {
        foreach (($store['servicePermissions'][$service]['unrestrictedUsers'] ?? []) as $username => $enabled) {
            if ($enabled) $permissions[strtolower(trim((string)$username))] = true;
        }
    }
}
$merged['servicePermissions'] = ['navitools' => ['unrestrictedUsers' => $permissions]];

if (count($merged['sessions']) < $oldCount) throw new RuntimeException('Availability session count decreased during migration');
$directory = dirname($target);
if (!is_dir($directory) && !mkdir($directory, 0770, true) && !is_dir($directory)) throw new RuntimeException("Cannot create {$directory}");
$temporary = $target . '.migrate-' . bin2hex(random_bytes(4));
$json = json_encode($merged, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);
if (file_put_contents($temporary, $json, LOCK_EX) === false) throw new RuntimeException("Cannot write {$temporary}");
if (!rename($temporary, $target)) {
    @unlink($temporary);
    throw new RuntimeException("Cannot replace {$target}");
}
fwrite(STDOUT, 'Migrated ' . count($merged['sessions']) . " Availability questionnaire(s).\n");
