<?php
declare(strict_types=1);

namespace NaviStudy;

use PDO;

final class SyncService
{
    public function __construct(private Config $config, private Database $database) {}

    public function get(string $product, string $userId): array
    {
        $stmt = $this->database->product($product)->prepare('SELECT revision,schema_version,document_json,updated_at FROM documents WHERE user_id=?');
        $stmt->execute([$userId]);
        $row = $stmt->fetch();
        if (!$row) return ['product' => $product, 'revision' => 0, 'schemaVersion' => 1, 'document' => $this->emptyDocument($product), 'updatedAt' => null];
        return ['product' => $product, 'revision' => (int) $row['revision'], 'schemaVersion' => (int) $row['schema_version'], 'document' => json_decode($row['document_json'], true, 128, JSON_THROW_ON_ERROR), 'updatedAt' => (int) $row['updated_at']];
    }

    public function sync(string $product, string $userId, array $input): array
    {
        $deviceId = trim((string) ($input['deviceId'] ?? ''));
        $baseRevision = filter_var($input['baseRevision'] ?? null, FILTER_VALIDATE_INT);
        $schemaVersion = filter_var($input['schemaVersion'] ?? null, FILTER_VALIDATE_INT);
        $mutations = $input['mutations'] ?? null;
        if (!preg_match('/^[A-Za-z0-9._:-]{3,128}$/', $deviceId)) throw new ApiException('invalid_device', '设备标识无效。');
        if ($baseRevision === false || $baseRevision < 0) throw new ApiException('invalid_revision', '基础版本号无效。');
        if ($schemaVersion !== 1) throw new ApiException('unsupported_schema', '客户端数据版本不受支持，请升级应用。', 409);
        if (!is_array($mutations) || count($mutations) > $this->config->get('maxMutations')) throw new ApiException('invalid_mutations', '单次同步最多提交 500 项变更。');

        $pdo = $this->database->product($product);
        $pdo->beginTransaction();
        try {
            $current = $this->getForUpdate($pdo, $product, $userId);
            $document = $current['document'];
            $revision = $current['revision'];
            $applied = [];
            $deduplicated = [];
            foreach ($mutations as $mutation) {
                if (!is_array($mutation)) throw new ApiException('invalid_mutation', '同步变更格式无效。');
                $mutationId = (string) ($mutation['mutationId'] ?? '');
                if (!preg_match('/^[A-Za-z0-9._:-]{8,160}$/', $mutationId)) throw new ApiException('invalid_mutation_id', '同步变更缺少有效的唯一编号。');
                $payloadHash = hash('sha256', json_encode($mutation, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
                $seen = $pdo->prepare('SELECT payload_hash FROM mutations WHERE user_id=? AND mutation_id=?');
                $seen->execute([$userId, $mutationId]);
                if ($oldHash = $seen->fetchColumn()) {
                    if (!hash_equals((string) $oldHash, $payloadHash)) throw new ApiException('mutation_id_conflict', '同一变更编号对应了不同内容。', 409);
                    $deduplicated[] = $mutationId;
                    continue;
                }
                $document = $this->applyMutation($product, $document, $mutation, time());
                $revision++;
                $pdo->prepare('INSERT INTO mutations(user_id,mutation_id,device_id,base_revision,server_revision,payload_hash,created_at) VALUES(?,?,?,?,?,?,?)')->execute([$userId,$mutationId,$deviceId,$baseRevision,$revision,$payloadHash,time()]);
                $applied[] = $mutationId;
            }

            $json = json_encode($document, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
            if (strlen($json) > $this->config->get('quotaBytes')) throw new ApiException('quota_exceeded', '该产品的同步数据已超过 2 MiB。', 413);
            $now = time();
            $insert = $pdo->prepare('INSERT OR IGNORE INTO documents(user_id,revision,schema_version,document_json,size_bytes,updated_at) VALUES(?,?,?,?,?,?)');
            $insert->execute([$userId,$revision,$schemaVersion,$json,strlen($json),$now]);
            if ($insert->rowCount() === 0) {
                $pdo->prepare('UPDATE documents SET revision=?,schema_version=?,document_json=?,size_bytes=?,updated_at=? WHERE user_id=?')->execute([$revision,$schemaVersion,$json,strlen($json),$now,$userId]);
            }
            if ($applied) {
                $pdo->prepare('INSERT OR REPLACE INTO snapshots(user_id,revision,schema_version,document_json,created_at) VALUES(?,?,?,?,?)')->execute([$userId,$revision,$schemaVersion,$json,$now]);
                $pdo->prepare('DELETE FROM snapshots WHERE user_id=? AND revision NOT IN (SELECT revision FROM snapshots WHERE user_id=? ORDER BY revision DESC LIMIT ?)')->execute([$userId,$userId,$this->config->get('snapshotLimit')]);
            }
            $pdo->commit();
            return ['product'=>$product,'revision'=>$revision,'schemaVersion'=>$schemaVersion,'document'=>$document,'applied'=>$applied,'deduplicated'=>$deduplicated,'hadConcurrentChanges'=>$baseRevision !== $current['revision'],'updatedAt'=>$now];
        } catch (\Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
    }

    public function mergeLegacy(string $product, string $userId, array $legacy): void
    {
        $this->sync($product, $userId, [
            'deviceId' => 'legacy-import',
            'baseRevision' => 0,
            'schemaVersion' => 1,
            'mutations' => [[
                'mutationId' => 'legacy-' . substr(hash('sha256', json_encode($legacy)), 0, 32),
                'type' => 'merge_snapshot',
                'data' => $legacy,
            ]],
        ]);
    }

    private function getForUpdate(PDO $pdo, string $product, string $userId): array
    {
        $stmt = $pdo->prepare('SELECT revision,document_json FROM documents WHERE user_id=?');
        $stmt->execute([$userId]);
        $row = $stmt->fetch();
        return $row ? ['revision'=>(int)$row['revision'],'document'=>json_decode($row['document_json'], true, 128, JSON_THROW_ON_ERROR)] : ['revision'=>0,'document'=>$this->emptyDocument($product)];
    }

    private function emptyDocument(string $product): array
    {
        return $product === 'words' ? [
            'favs'=>[], 'mastered'=>[], 'last_progress'=>null, 'progress_positions'=>[], 'wrongbook'=>[], 'custom_lists'=>[], 'lookup_history'=>[],
            'srs_state'=>[], 'daily_state'=>[], 'study_events'=>[], 'app_settings'=>[], '_sync'=>['tombstones'=>[],'entityUpdatedAt'=>[]],
        ] : [
            'favorites'=>[], 'answers'=>[], 'wrongbook'=>[], 'mastered'=>[], 'lastProgress'=>null,
            'progressPositions'=>[], 'studyEvents'=>[], 'sessions'=>[], '_sync'=>['tombstones'=>[],'entityUpdatedAt'=>[]],
        ];
    }

    private function applyMutation(string $product, array $document, array $mutation, int $serverTime): array
    {
        $type = (string) ($mutation['type'] ?? '');
        if ($type === 'merge_snapshot') {
            $data = $mutation['data'] ?? null;
            if (!is_array($data)) throw new ApiException('invalid_mutation', '合并快照缺少数据。');
            return $this->mergeSnapshot($product, $document, $data);
        }

        $collection = (string) ($mutation['collection'] ?? '');
        $key = (string) ($mutation['key'] ?? '');
        if (!preg_match('/^[A-Za-z0-9._:-]{1,200}$/', $key)) throw new ApiException('invalid_entity_key', '同步实体编号无效。');
        $document['_sync'] ??= ['tombstones'=>[],'entityUpdatedAt'=>[]];
        $stamp = $serverTime * 1000;
        if ($type === 'entity_upsert') {
            if (!$this->allowedCollection($product, $collection)) throw new ApiException('invalid_collection', '同步集合无效。');
            $document[$collection] ??= [];
            if ($this->isSetCollection($product, $collection)) {
                $document[$collection] = $this->upsertListEntity($document[$collection], $key, $mutation['value'] ?? $key);
            } else {
                $document[$collection][$key] = $mutation['value'] ?? null;
            }
            $document['_sync']['entityUpdatedAt'][$collection][$key] = $stamp;
            unset($document['_sync']['tombstones'][$collection][$key]);
            return $document;
        }
        if ($type === 'entity_delete') {
            if (!$this->allowedCollection($product, $collection)) throw new ApiException('invalid_collection', '同步集合无效。');
            if (isset($document[$collection]) && is_array($document[$collection])) {
                if ($this->isSetCollection($product, $collection)) {
                    $document[$collection] = array_values(array_filter($document[$collection], fn($item) => $this->entityIdentity($item) !== $key));
                } else {
                    unset($document[$collection][$key]);
                }
            }
            $document['_sync']['tombstones'][$collection][$key] = $stamp;
            return $document;
        }
        if ($type === 'event_append') {
            $eventsKey = $product === 'words' ? 'study_events' : 'studyEvents';
            $event = $mutation['value'] ?? null;
            if (!is_array($event)) throw new ApiException('invalid_event', '学习事件格式无效。');
            $event['mutationId'] = $mutation['mutationId'];
            $document[$eventsKey] = $this->mergeEvents($document[$eventsKey] ?? [], [$event]);
            return $document;
        }
        if ($type === 'progress_set') {
            $scope = $key;
            $progressKey = $product === 'words' ? 'last_progress' : 'progressPositions';
            if ($product === 'words') $document[$progressKey] = $mutation['value'] ?? null;
            else $document[$progressKey][$scope] = $mutation['value'] ?? null;
            $document['_sync']['entityUpdatedAt'][$progressKey][$scope] = $stamp;
            return $document;
        }
        throw new ApiException('unsupported_mutation', '客户端提交了不支持的同步变更。');
    }

    private function mergeSnapshot(string $product, array $current, array $incoming): array
    {
        $result = $this->emptyDocument($product);
        $result = array_replace($result, $current);
        if ($product === 'words') {
            $result['favs'] = $this->unionByIdentity($current['favs'] ?? [], $incoming['favs'] ?? []);
            $result['mastered'] = $this->mergeEntityMap($current['mastered'] ?? [], $incoming['mastered'] ?? []);
            $result['last_progress'] = $this->newer($current['last_progress'] ?? null, $incoming['last_progress'] ?? null);
            $result['progress_positions'] = $this->mergeEntityMap($current['progress_positions'] ?? [], $incoming['progress_positions'] ?? []);
            $result['wrongbook'] = $this->mergeEntityMap($current['wrongbook'] ?? [], $incoming['wrongbook'] ?? [], true);
            $result['custom_lists'] = $this->mergeListByIdentity($current['custom_lists'] ?? [], $incoming['custom_lists'] ?? []);
            $result['lookup_history'] = array_slice($this->mergeEvents($current['lookup_history'] ?? [], $incoming['lookup_history'] ?? []), -500);
            $result['srs_state'] = $this->mergeEntityMap($current['srs_state'] ?? [], $incoming['srs_state'] ?? []);
            $result['daily_state'] = $this->mergeCounters($current['daily_state'] ?? [], $incoming['daily_state'] ?? []);
            $result['study_events'] = $this->mergeEvents($current['study_events'] ?? [], $incoming['study_events'] ?? []);
            $result['app_settings'] = array_replace(is_array($current['app_settings'] ?? null) ? $current['app_settings'] : [], is_array($incoming['app_settings'] ?? null) ? $incoming['app_settings'] : []);
        } else {
            $result['favorites'] = $this->unionByIdentity($current['favorites'] ?? [], $incoming['favorites'] ?? []);
            $result['answers'] = $this->mergeEntityMap($current['answers'] ?? [], $incoming['answers'] ?? [], true);
            $result['wrongbook'] = $this->mergeEntityMap($current['wrongbook'] ?? [], $incoming['wrongbook'] ?? [], true);
            $result['mastered'] = $this->mergeEntityMap($current['mastered'] ?? [], $incoming['mastered'] ?? []);
            $result['lastProgress'] = $this->newer($current['lastProgress'] ?? null, $incoming['lastProgress'] ?? null);
            $result['progressPositions'] = $this->mergeEntityMap($current['progressPositions'] ?? [], $incoming['progressPositions'] ?? []);
            $result['studyEvents'] = $this->mergeEvents($current['studyEvents'] ?? [], $incoming['studyEvents'] ?? []);
            $result['sessions'] = $this->mergeEvents($current['sessions'] ?? [], $incoming['sessions'] ?? []);
        }
        $result['_sync'] = $this->mergeSyncMeta($current['_sync'] ?? [], $incoming['_sync'] ?? []);
        return $this->applyTombstones($result);
    }

    private function mergeSyncMeta(array $a, array $b): array
    {
        $out = ['tombstones'=>[],'entityUpdatedAt'=>[]];
        foreach (['tombstones','entityUpdatedAt'] as $kind) {
            foreach (array_unique(array_merge(array_keys($a[$kind] ?? []), array_keys($b[$kind] ?? []))) as $collection) {
                $out[$kind][$collection] = $this->mergeCounters($a[$kind][$collection] ?? [], $b[$kind][$collection] ?? []);
            }
        }
        return $out;
    }

    private function applyTombstones(array $document): array
    {
        foreach ($document['_sync']['tombstones'] ?? [] as $collection => $items) {
            foreach ($items as $key => $deletedAt) {
                $updatedAt = $document['_sync']['entityUpdatedAt'][$collection][$key] ?? 0;
                if ((int) $deletedAt >= (int) $updatedAt && isset($document[$collection]) && is_array($document[$collection])) {
                    if (array_is_list($document[$collection])) $document[$collection] = array_values(array_filter($document[$collection], fn($item) => $this->entityIdentity($item) !== (string)$key));
                    else unset($document[$collection][$key]);
                }
            }
        }
        return $document;
    }

    private function allowedCollection(string $product, string $collection): bool
    {
        $allowed = $product === 'words' ? ['wrongbook','mastered','progress_positions','srs_state','daily_state','app_settings','custom_lists','favs'] : ['answers','wrongbook','mastered','progressPositions','favorites'];
        return in_array($collection, $allowed, true);
    }

    private function isSetCollection(string $product, string $collection): bool
    {
        return ($product === 'words' && $collection === 'favs') || ($product === 'mt' && $collection === 'favorites');
    }

    private function entityIdentity(mixed $item): string
    {
        if (!is_array($item)) return (string) $item;
        foreach (['key','id','uuid'] as $field) {
            if (isset($item[$field]) && is_scalar($item[$field])) return (string) $item[$field];
        }
        if (isset($item['w']) || isset($item['e'])) return (string) ($item['t'] ?? 'w') . '_' . (string) ($item['w'] ?? $item['e']) . '_' . (string) ($item['u'] ?? '');
        if (isset($item['word']) && is_scalar($item['word'])) return (string) $item['word'];
        return hash('sha256', json_encode($item, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }

    private function unionByIdentity(mixed $a, mixed $b): array
    {
        $out = [];
        foreach (array_merge(is_array($a) ? $a : [], is_array($b) ? $b : []) as $item) {
            $out[$this->entityIdentity($item)] = $item;
        }
        return array_values($out);
    }

    private function upsertListEntity(mixed $items, string $key, mixed $value): array
    {
        $out = [];
        $replaced = false;
        foreach (is_array($items) ? $items : [] as $item) {
            if ($this->entityIdentity($item) === $key) {
                $out[] = $value;
                $replaced = true;
            } else {
                $out[] = $item;
            }
        }
        if (!$replaced) $out[] = $value;
        return $out;
    }

    private function newer(mixed $a, mixed $b): mixed
    {
        if ($a === null) return $b;
        if ($b === null) return $a;
        $ta = $this->timestamp($a);
        $tb = $this->timestamp($b);
        return $tb >= $ta ? $b : $a;
    }

    private function timestamp(mixed $value): int
    {
        if (!is_array($value)) return 0;
        foreach (['updatedAt','updated','timestamp','lastWrongAt','at'] as $key) {
            if (!isset($value[$key])) continue;
            if (is_numeric($value[$key])) return (int) $value[$key];
            $time = strtotime((string) $value[$key]);
            if ($time !== false) return $time * 1000;
        }
        return 0;
    }

    private function mergeEntityMap(mixed $a, mixed $b, bool $maxCounters = false): array
    {
        $a = is_array($a) ? $a : [];
        $b = is_array($b) ? $b : [];
        $out = $a;
        foreach ($b as $key => $value) {
            if (!array_key_exists($key, $out)) { $out[$key] = $value; continue; }
            if ($maxCounters && is_array($out[$key]) && is_array($value)) {
                $newer = $this->newer($out[$key], $value);
                $merged = array_replace($out[$key], $newer);
                foreach (['attempts','correct','count','streak'] as $counter) if (isset($out[$key][$counter]) || isset($value[$counter])) $merged[$counter] = max((int)($out[$key][$counter]??0),(int)($value[$counter]??0));
                $out[$key] = $merged;
            } else $out[$key] = $this->newer($out[$key], $value);
        }
        return $out;
    }

    private function mergeCounters(mixed $a, mixed $b): array
    {
        $a = is_array($a) ? $a : [];
        $b = is_array($b) ? $b : [];
        foreach ($b as $key => $value) $a[$key] = is_numeric($value) && is_numeric($a[$key] ?? null) ? max((int)$a[$key], (int)$value) : $value;
        return $a;
    }

    private function mergeEvents(mixed $a, mixed $b): array
    {
        $out = [];
        foreach (array_merge(is_array($a)?$a:[], is_array($b)?$b:[]) as $event) {
            $key = is_array($event) ? ($event['mutationId'] ?? $event['id'] ?? $event['uuid'] ?? hash('sha256', json_encode($event))) : hash('sha256', json_encode($event));
            $out[(string)$key] = $event;
        }
        return array_values($out);
    }

    private function mergeListByIdentity(mixed $a, mixed $b): array
    {
        $out = [];
        foreach (array_merge(is_array($a)?$a:[], is_array($b)?$b:[]) as $item) {
            $key = is_array($item) ? ($item['uuid'] ?? $item['id'] ?? $item['name'] ?? hash('sha256', json_encode($item))) : hash('sha256', json_encode($item));
            $out[(string)$key] = isset($out[(string)$key]) ? $this->newer($out[(string)$key], $item) : $item;
        }
        return array_values($out);
    }
}
