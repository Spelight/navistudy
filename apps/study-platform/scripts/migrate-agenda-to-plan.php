<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI only.\n");
    exit(2);
}

$dataDir = $argv[1] ?? getenv('NAVISTUDY_DATA_DIR') ?: dirname(__DIR__) . '/var';
$agendaPath = rtrim($dataDir, '/\\') . DIRECTORY_SEPARATOR . 'agenda.sqlite3';
$planPath = rtrim($dataDir, '/\\') . DIRECTORY_SEPARATOR . 'plan.sqlite3';
$temporaryPath = $planPath . '.migrate-' . bin2hex(random_bytes(4));
if (!is_file($agendaPath)) {
    fwrite(STDOUT, "No agenda.sqlite3 found; nothing to migrate.\n");
    exit(0);
}
if (is_file($planPath)) {
    fwrite(STDERR, "Refusing to overwrite existing plan.sqlite3.\n");
    exit(1);
}

try {
    $source = new PDO('sqlite:' . $agendaPath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $target = new PDO('sqlite:' . $temporaryPath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $target->exec((string) file_get_contents(dirname(__DIR__) . '/migrations/002_product.sql'));
    $read = $source->query('SELECT user_id,revision,schema_version,document_json,updated_at FROM documents');
    $write = $target->prepare('INSERT INTO documents(user_id,revision,schema_version,document_json,size_bytes,updated_at) VALUES(?,?,?,?,?,?)');
    $snapshot = $target->prepare('INSERT INTO snapshots(user_id,revision,schema_version,document_json,created_at) VALUES(?,?,?,?,?)');
    $count = 0;
    $skipped = 0;

    $target->beginTransaction();
    foreach ($read->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $old = json_decode((string) $row['document_json'], true, 128, JSON_THROW_ON_ERROR);
        $degree = is_array($old['degreePlan'] ?? null) ? $old['degreePlan'] : [];
        if (!$degree || !is_array($degree['student'] ?? null) || !is_array($degree['audit'] ?? null)) {
            $skipped++;
            continue;
        }
        $document = [
            'schemaVersion' => 1,
            'student' => $degree['student'] ?? $old['student'] ?? null,
            'plan' => $degree['plan'] ?? $degree['curriculum'] ?? null,
            'requirements' => $degree['requirements'] ?? [],
            'coursePool' => $degree['coursePool'] ?? [],
            'languageTracks' => $degree['languageTracks'] ?? [],
            'courses' => $degree['courses'] ?? $old['courses'] ?? [],
            'manualCorrections' => $degree['manualCorrections'] ?? $old['manualCorrections'] ?? [],
            'audit' => $degree['audit'] ?? null,
            'recommendations' => $degree['recommendations'] ?? [],
            'importedAt' => $degree['importedAt'] ?? null,
            'updatedAt' => (int) ($degree['updatedAt'] ?? $old['updatedAt'] ?? ((int) $row['updated_at'] * 1000)),
            'source' => $degree['source'] ?? null,
            '_sync' => ['tombstones' => [], 'entityUpdatedAt' => []],
        ];
        $json = json_encode($document, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $revision = max(1, (int) $row['revision']);
        $write->execute([$row['user_id'], $revision, 1, $json, strlen($json), (int) $row['updated_at']]);
        $snapshot->execute([$row['user_id'], $revision, 1, $json, time()]);
        $count++;
    }
    $target->commit();
    $target = null;
    if (!rename($temporaryPath, $planPath)) {
        throw new RuntimeException("Cannot publish {$planPath}");
    }
    fwrite(STDOUT, "Migrated {$count} NaviPlan document(s); skipped {$skipped} unusable Agenda document(s).\n");
} catch (Throwable $error) {
    @unlink($temporaryPath);
    throw $error;
}
