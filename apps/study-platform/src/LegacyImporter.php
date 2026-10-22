<?php
declare(strict_types=1);

namespace NaviStudy;

use PDO;

final class LegacyImporter
{
    public function __construct(private Config $config, private Database $database) {}

    public function importFile(string $product, string $path, int $readUntil): array
    {
        if (!in_array($product, ['words','mt'], true)) throw new ApiException('invalid_product', '产品无效。');
        if (!is_file($path)) throw new \RuntimeException('Legacy file not found: ' . $path);
        $decoded = json_decode((string) file_get_contents($path), true, 256, JSON_THROW_ON_ERROR);
        if (!is_array($decoded)) throw new \RuntimeException('Legacy file must contain an object.');
        $pdo = $this->database->passport();
        $update = $pdo->prepare('UPDATE legacy_claims SET username=?,payload_json=?,source_hash=?,imported_at=?,read_until=? WHERE username_key=? AND product=? AND claimed_by IS NULL');
        $insert = $pdo->prepare('INSERT OR IGNORE INTO legacy_claims(username_key,product,username,payload_json,source_hash,imported_at,read_until) VALUES(?,?,?,?,?,?,?)');
        $count = 0;
        foreach ($decoded as $username => $entry) {
            if ((!is_string($username) && !is_int($username)) || trim((string) $username) === '' || !is_array($entry)) continue;
            $username = (string) $username;
            $payload = $product === 'mt' && isset($entry['data']) && is_array($entry['data']) ? $entry['data'] : $entry;
            $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
            $usernameKey = mb_strtolower(trim($username),'UTF-8');
            $sourceHash = hash('sha256',$json);
            $importedAt = time();
            $update->execute([$username,$json,$sourceHash,$importedAt,$readUntil,$usernameKey,$product]);
            if ($update->rowCount() > 0) {
                $count++;
                continue;
            }
            $insert->execute([$usernameKey,$product,$username,$json,$sourceHash,$importedAt,$readUntil]);
            $count += $insert->rowCount() > 0 ? 1 : 0;
        }
        return ['product'=>$product,'found'=>count($decoded),'imported'=>$count];
    }

    public function attachProductDatabases(PDO $passport): void
    {
        $this->database->product('words');
        $this->database->product('mt');
        $attached = array_column($passport->query('PRAGMA database_list')->fetchAll(), 'name');
        foreach (['words', 'mt'] as $product) {
            $alias = $product . '_claim';
            if (in_array($alias, $attached, true)) continue;
            $path = str_replace("'", "''", $this->config->get('dataDir') . '/' . $product . '.sqlite3');
            $passport->exec("ATTACH DATABASE '" . $path . "' AS " . $alias);
        }
    }

    public function claimAttached(PDO $passport, string $userId, string $usernameKey): array
    {
        $this->attachProductDatabases($passport);
        $claims = $passport->prepare('SELECT product,payload_json FROM legacy_claims WHERE username_key=? AND claimed_by IS NULL');
        $claims->execute([$usernameKey]);
        $claimedProducts = [];
        foreach ($claims->fetchAll() as $claim) {
            $payload = json_decode($claim['payload_json'], true, 128, JSON_THROW_ON_ERROR);
            $product = $claim['product'];
            $empty = $product === 'words'
                ? ['favs'=>[],'mastered'=>[],'last_progress'=>null,'progress_positions'=>[],'wrongbook'=>[],'custom_lists'=>[],'lookup_history'=>[],'srs_state'=>[],'daily_state'=>[],'study_events'=>[],'app_settings'=>[],'_sync'=>['tombstones'=>[],'entityUpdatedAt'=>[]]]
                : ['favorites'=>[],'answers'=>[],'wrongbook'=>[],'mastered'=>[],'lastProgress'=>null,'progressPositions'=>[],'studyEvents'=>[],'sessions'=>[],'_sync'=>['tombstones'=>[],'entityUpdatedAt'=>[]]];
            $document = array_replace($empty, $payload);
            $json = json_encode($document, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
            $alias = $product . '_claim';
            $stmt = $passport->prepare("INSERT OR IGNORE INTO {$alias}.documents(user_id,revision,schema_version,document_json,size_bytes,updated_at) VALUES(?,1,1,?,?,?)");
            $stmt->execute([$userId,$json,strlen($json),time()]);
            $snap = $passport->prepare("INSERT OR IGNORE INTO {$alias}.snapshots(user_id,revision,schema_version,document_json,created_at) VALUES(?,1,1,?,?)");
            $snap->execute([$userId,$json,time()]);
            $mark = $passport->prepare('UPDATE legacy_claims SET claimed_by=?,claimed_at=? WHERE username_key=? AND product=? AND claimed_by IS NULL');
            $mark->execute([$userId,time(),$usernameKey,$product]);
            if ($mark->rowCount() > 0) $claimedProducts[] = $product;
        }
        return array_values(array_unique($claimedProducts));
    }

    public function legacyRead(string $product, string $username): array
    {
        $stmt = $this->database->passport()->prepare('SELECT payload_json,claimed_by,read_until FROM legacy_claims WHERE username_key=? AND product=?');
        $stmt->execute([mb_strtolower(trim($username),'UTF-8'),$product]);
        $row = $stmt->fetch();
        if (!$row || $row['claimed_by']) throw new ApiException('legacy_record_unavailable', '旧记录已被认领或不存在。', 410);
        if ((int)$row['read_until'] < time()) throw new ApiException('legacy_read_expired', '旧版只读兼容期已结束。', 410);
        return json_decode($row['payload_json'], true, 128, JSON_THROW_ON_ERROR);
    }
}
