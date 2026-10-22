<?php
declare(strict_types=1);

namespace NaviStudy;

use PDO;

final class AdminService
{
    private const SERVICES = ['words', 'mt', 'reading', 'plan', 'tools'];

    public function __construct(private Config $config, private Database $database, private ?AnalyticsService $analytics = null) {}

    public function requireAdmin(AuthService $auth, array $cookies): array
    {
        $identity = $auth->authenticate('account', false, $cookies['access'], $cookies['allowSso']);
        if (!$this->isOwner((string) ($identity['username'] ?? ''))) {
            throw new ApiException('admin_required', '只有服务所有者可以访问管理控制台。', 403);
        }
        return $identity;
    }

    public function serviceAccessForUser(string $userId): array
    {
        $user = $this->userRow($userId);
        return $this->permissionMap($userId, (string) $user['username']);
    }

    public function requireServiceAccess(string $userId, string $service): void
    {
        if (!in_array($service, self::SERVICES, true)) {
            throw new ApiException('invalid_product', '不支持该服务。', 404);
        }
        $permission = $this->serviceAccessForUser($userId)[$service];
        if (empty($permission['enabled'])) {
            throw new ApiException('service_disabled', '管理员已暂停该服务权限。', 403);
        }
    }

    public function overview(): array
    {
        $pdo = $this->database->passport();
        $now = time();
        $users = $pdo->query('SELECT status,COUNT(*) total FROM users GROUP BY status')->fetchAll();
        $userCounts = ['total' => 0, 'active' => 0, 'pending_delete' => 0];
        foreach ($users as $row) {
            $userCounts['total'] += (int) $row['total'];
            $userCounts[$row['status']] = (int) $row['total'];
        }

        $sessions = $pdo->query('SELECT revoked_at,refresh_expires_at,sso_expires_at,last_used_at FROM sessions')->fetchAll();
        $sessionCounts = ['active' => 0, 'total' => count($sessions), 'activeToday' => 0];
        foreach ($sessions as $session) {
            if ($this->sessionIsActive($session, $now)) $sessionCounts['active']++;
            if ((int) $session['last_used_at'] >= $now - 86400) $sessionCounts['activeToday']++;
        }

        $products = [];
        foreach (['words', 'mt', 'reading', 'plan'] as $product) {
            $row = $this->database->product($product)->query('SELECT COUNT(*) documents,COALESCE(SUM(size_bytes),0) bytes,MAX(updated_at) updated_at FROM documents')->fetch();
            $products[$product] = [
                'users' => (int) $row['documents'],
                'bytes' => (int) $row['bytes'],
                'updatedAt' => $row['updated_at'] === null ? null : (int) $row['updated_at'],
                'disabledUsers' => $this->disabledCount($product),
            ];
        }
        $availability = $this->availabilityStatuses();
        $products['tools'] = [
            'users' => count($availability),
            'bytes' => is_file($this->availabilityFile()) ? (int) filesize($this->availabilityFile()) : 0,
            'updatedAt' => is_file($this->availabilityFile()) ? (int) filemtime($this->availabilityFile()) : null,
            'disabledUsers' => $this->disabledCount('tools'),
        ];

        $securityEvents = $pdo->prepare("SELECT COUNT(*) FROM audit_log WHERE created_at>=? AND event IN ('refresh_reuse_detected','password_recovered','deletion_requested','admin_permission_updated','admin_session_revoked')");
        $securityEvents->execute([$now - 86400]);

        return [
            'generatedAt' => $now,
            'users' => $userCounts,
            'sessions' => $sessionCounts,
            'products' => $products,
            'securityEvents24h' => (int) $securityEvents->fetchColumn(),
            'recentActivity' => $this->auditLog(['limit' => 8])['items'],
        ];
    }

    public function users(array $query): array
    {
        $page = max(1, (int) ($query['page'] ?? 1));
        $limit = min(100, max(10, (int) ($query['limit'] ?? 30)));
        $needle = mb_strtolower(trim((string) ($query['query'] ?? '')), 'UTF-8');
        $status = (string) ($query['status'] ?? 'all');
        $service = (string) ($query['service'] ?? 'all');
        if (!in_array($status, ['all', 'active', 'pending_delete'], true)) $status = 'all';
        if (!in_array($service, array_merge(['all'], self::SERVICES), true)) $service = 'all';

        $sessionMap = $this->sessionSummaries();
        $serviceMap = $this->serviceMaps();
        $permissionRows = $this->permissionRows();
        $availability = $this->availabilityStatuses();
        $lastAuditIp = $this->lastAuditIps();
        $items = [];

        foreach ($this->database->passport()->query('SELECT id,username,status,deletion_at,created_at,updated_at FROM users ORDER BY created_at DESC')->fetchAll() as $row) {
            $id = (string) $row['id'];
            $permissions = $this->permissionMapFromRows($id, (string) $row['username'], $permissionRows);
            $services = $this->servicesForUser($id, (string) $row['username'], $serviceMap, $permissions, $availability);
            $session = $sessionMap[$id] ?? ['active' => 0, 'total' => 0, 'lastSeenAt' => null, 'lastIp' => null, 'lastIpApproximate' => false, 'devices' => []];
            if ($session['lastIp'] === null && isset($lastAuditIp[$id])) {
                $session['lastIp'] = $lastAuditIp[$id];
                $session['lastIpApproximate'] = true;
            }
            $item = [
                'id' => $id,
                'username' => $row['username'],
                'status' => $row['status'],
                'deletionAt' => $row['deletion_at'] === null ? null : (int) $row['deletion_at'],
                'createdAt' => (int) $row['created_at'],
                'updatedAt' => (int) $row['updated_at'],
                'activeSessions' => $session['active'],
                'totalSessions' => $session['total'],
                'lastSeenAt' => $session['lastSeenAt'],
                'lastIp' => $session['lastIp'],
                'lastIpApproximate' => $session['lastIpApproximate'],
                'deviceNames' => $session['devices'],
                'services' => $services,
                'permissions' => $permissions,
            ];
            if ($status !== 'all' && $item['status'] !== $status) continue;
            if ($service !== 'all' && empty($item['services'][$service]['hasData'])) continue;
            if ($needle !== '') {
                $haystack = mb_strtolower(implode(' ', [$item['username'], $item['id'], $item['lastIp'] ?? '', ...$item['deviceNames']]), 'UTF-8');
                if (!str_contains($haystack, $needle)) continue;
            }
            $items[] = $item;
        }

        $total = count($items);
        $pages = max(1, (int) ceil($total / $limit));
        $page = min($page, $pages);
        return [
            'items' => array_slice($items, ($page - 1) * $limit, $limit),
            'page' => $page,
            'limit' => $limit,
            'pages' => $pages,
            'total' => $total,
        ];
    }

    public function user(string $userId, string $currentSessionId): array
    {
        $user = $this->userRow($userId);
        $permissionRows = $this->permissionRows();
        $permissions = $this->permissionMapFromRows($userId, (string) $user['username'], $permissionRows);
        $services = $this->servicesForUser($userId, (string) $user['username'], $this->serviceMaps([$userId]), $permissions, $this->availabilityStatuses());
        $sessions = [];
        $stmt = $this->database->passport()->prepare('SELECT s.id,s.device_id,s.device_name,s.client_id,s.scopes,s.created_at,s.last_used_at,s.refresh_expires_at,s.sso_expires_at,s.revoked_at,o.first_ip,o.last_ip,o.user_agent,o.first_seen_at,o.last_seen_at FROM sessions s LEFT JOIN session_observations o ON o.session_id=s.id WHERE s.user_id=? ORDER BY s.last_used_at DESC');
        $stmt->execute([$userId]);
        foreach ($stmt->fetchAll() as $row) {
            $sessions[] = [
                'id' => $row['id'],
                'deviceId' => $row['device_id'],
                'deviceName' => $row['device_name'],
                'clientId' => $row['client_id'],
                'scopes' => array_values(array_filter(explode(' ', (string) $row['scopes']))),
                'createdAt' => (int) $row['created_at'],
                'lastUsedAt' => (int) $row['last_used_at'],
                'expiresAt' => max((int) ($row['refresh_expires_at'] ?? 0), (int) ($row['sso_expires_at'] ?? 0)),
                'revokedAt' => $row['revoked_at'] === null ? null : (int) $row['revoked_at'],
                'active' => $this->sessionIsActive($row, time()),
                'current' => hash_equals($currentSessionId, (string) $row['id']),
                'firstIp' => $row['first_ip'],
                'lastIp' => $row['last_ip'],
                'userAgent' => $row['user_agent'],
                'firstSeenAt' => $row['first_seen_at'] === null ? null : (int) $row['first_seen_at'],
                'lastSeenAt' => $row['last_seen_at'] === null ? null : (int) $row['last_seen_at'],
            ];
        }
        $audit = $this->auditLog(['userId' => $userId, 'limit' => 100]);
        return [
            'account' => [
                'id' => $user['id'],
                'username' => $user['username'],
                'status' => $user['status'],
                'deletionAt' => $user['deletion_at'] === null ? null : (int) $user['deletion_at'],
                'createdAt' => (int) $user['created_at'],
                'updatedAt' => (int) $user['updated_at'],
            ],
            'services' => $services,
            'permissions' => $permissions,
            'sessions' => $sessions,
            'audit' => $audit['items'],
            'analytics' => ($this->analytics ?? new AnalyticsService($this->config, $this->database))->userSummary($userId),
        ];
    }

    public function updatePermissions(array $admin, string $userId, array $input): array
    {
        $target = $this->userRow($userId);
        if ($this->isOwner((string) $target['username'])) {
            throw new ApiException('owner_permission_locked', '服务所有者的权限不能被停用。', 400);
        }
        $changes = $input['services'] ?? null;
        if (!is_array($changes) || $changes === []) throw new ApiException('invalid_request', '请选择要修改的服务权限。', 400);
        $pdo = $this->database->passport();
        $now = time();
        $pdo->beginTransaction();
        try {
            foreach ($changes as $service => $value) {
                if (!in_array($service, self::SERVICES, true) || !is_array($value)) {
                    throw new ApiException('invalid_permission', '服务权限参数无效。', 400);
                }
                $current = $this->permissionMap($userId, (string) $target['username'])[$service];
                $enabled = array_key_exists('enabled', $value) ? (bool) $value['enabled'] : (bool) $current['enabled'];
                $unrestricted = $service === 'tools' && array_key_exists('unrestricted', $value)
                    ? (bool) $value['unrestricted']
                    : (bool) $current['unrestricted'];
                $stmt = $pdo->prepare('INSERT OR REPLACE INTO service_permissions(user_id,service,enabled,unrestricted,updated_at,updated_by) VALUES(?,?,?,?,?,?)');
                $stmt->execute([$userId, $service, $enabled ? 1 : 0, $unrestricted ? 1 : 0, $now, $admin['id']]);
            }
            $this->audit('admin_permission_updated', $userId, ['actorUserId' => $admin['id'], 'services' => array_keys($changes)]);
            $pdo->commit();
        } catch (\Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        if (isset($changes['tools'])) {
            $permissions = $this->permissionMap($userId, (string) $target['username']);
            try {
                $this->writeAvailabilityPermission((string) $target['username'], (bool) $permissions['tools']['unrestricted']);
            } catch (\Throwable $error) {
                error_log(sprintf('[navistudy] request=%s compatibility_permission_mirror_failed type=%s', $_SERVER['NAVISTUDY_REQUEST_ID'] ?? 'internal', get_class($error)));
            }
        }
        return ['permissions' => $this->permissionMap($userId, (string) $target['username'])];
    }

    public function revokeSession(array $admin, string $userId, string $sessionId): array
    {
        if ($userId === (string) $admin['id'] && hash_equals((string) $admin['session_id'], $sessionId)) {
            throw new ApiException('current_session_locked', '不能在控制台中下线当前管理会话。', 400);
        }
        $pdo = $this->database->passport();
        $stmt = $pdo->prepare('UPDATE sessions SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL');
        $stmt->execute([time(), $sessionId, $userId]);
        if ($stmt->rowCount() === 0) throw new ApiException('session_not_found', '活动会话不存在或已经下线。', 404);
        $pdo->prepare('UPDATE access_tokens SET revoked_at=? WHERE session_id=? AND revoked_at IS NULL')->execute([time(), $sessionId]);
        $this->audit('admin_session_revoked', $userId, ['actorUserId' => $admin['id'], 'sessionId' => $sessionId]);
        return ['sessionId' => $sessionId, 'revoked' => true];
    }

    public function revokeAllSessions(array $admin, string $userId): array
    {
        $this->userRow($userId);
        $pdo = $this->database->passport();
        $now = time();
        $params = [$now, $userId];
        $sql = 'UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL';
        if ($userId === (string) $admin['id']) {
            $sql .= ' AND id<>?';
            $params[] = $admin['session_id'];
        }
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $pdo->prepare('UPDATE access_tokens SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL AND session_id IN (SELECT id FROM sessions WHERE user_id=? AND revoked_at IS NOT NULL)')->execute([$now, $userId, $userId]);
        $this->audit('admin_sessions_revoked', $userId, ['actorUserId' => $admin['id'], 'count' => $stmt->rowCount()]);
        return ['revokedCount' => $stmt->rowCount()];
    }

    public function auditLog(array $query): array
    {
        $page = max(1, (int) ($query['page'] ?? 1));
        $limit = min(200, max(8, (int) ($query['limit'] ?? 50)));
        $userId = trim((string) ($query['userId'] ?? ''));
        $event = trim((string) ($query['event'] ?? ''));
        $where = [];
        $params = [];
        if ($userId !== '') { $where[] = 'a.user_id=?'; $params[] = $userId; }
        if ($event !== '') { $where[] = 'a.event=?'; $params[] = $event; }
        $filter = $where ? ' WHERE ' . implode(' AND ', $where) : '';
        $count = $this->database->passport()->prepare('SELECT COUNT(*) FROM audit_log a' . $filter);
        $count->execute($params);
        $total = (int) $count->fetchColumn();
        $pages = max(1, (int) ceil($total / $limit));
        $page = min($page, $pages);
        $sql = 'SELECT a.id,a.request_id,a.user_id,a.event,a.ip_prefix,a.details_json,a.created_at,u.username FROM audit_log a LEFT JOIN users u ON u.id=a.user_id' . $filter . ' ORDER BY a.created_at DESC,a.id DESC LIMIT ? OFFSET ?';
        $stmt = $this->database->passport()->prepare($sql);
        $position = 1;
        foreach ($params as $value) $stmt->bindValue($position++, $value, PDO::PARAM_STR);
        $stmt->bindValue($position++, $limit, PDO::PARAM_INT);
        $stmt->bindValue($position, ($page - 1) * $limit, PDO::PARAM_INT);
        $stmt->execute();
        $items = array_map(static function (array $row): array {
            return [
                'id' => (int) $row['id'],
                'requestId' => $row['request_id'],
                'userId' => $row['user_id'],
                'username' => $row['username'],
                'event' => $row['event'],
                'ipPrefix' => $row['ip_prefix'],
                'details' => json_decode((string) $row['details_json'], true) ?: [],
                'createdAt' => (int) $row['created_at'],
            ];
        }, $stmt->fetchAll());
        return ['items' => $items, 'page' => $page, 'pages' => $pages, 'limit' => $limit, 'total' => $total];
    }

    private function userRow(string $userId): array
    {
        if (!preg_match('/^[a-f0-9]{32}$/', $userId)) throw new ApiException('account_not_found', '账号不存在。', 404);
        $stmt = $this->database->passport()->prepare('SELECT id,username,status,deletion_at,created_at,updated_at FROM users WHERE id=?');
        $stmt->execute([$userId]);
        $row = $stmt->fetch();
        if (!$row) throw new ApiException('account_not_found', '账号不存在。', 404);
        return $row;
    }

    private function permissionMap(string $userId, string $username): array
    {
        return $this->permissionMapFromRows($userId, $username, $this->permissionRows($userId));
    }

    private function permissionRows(?string $userId = null): array
    {
        $rows = [];
        if ($userId === null) {
            $result = $this->database->passport()->query('SELECT user_id,service,enabled,unrestricted,updated_at FROM service_permissions')->fetchAll();
        } else {
            $stmt = $this->database->passport()->prepare('SELECT user_id,service,enabled,unrestricted,updated_at FROM service_permissions WHERE user_id=?');
            $stmt->execute([$userId]);
            $result = $stmt->fetchAll();
        }
        foreach ($result as $row) $rows[$row['user_id']][$row['service']] = $row;
        return $rows;
    }

    private function permissionMapFromRows(string $userId, string $username, array $rows): array
    {
        $owner = $this->isOwner($username);
        $map = [];
        foreach (self::SERVICES as $service) {
            $row = $rows[$userId][$service] ?? null;
            $legacyUnrestricted = $service === 'tools' && $row === null && $this->legacyToolsUnrestricted($username);
            $map[$service] = [
                'enabled' => $owner || $row === null || (bool) $row['enabled'],
                'unrestricted' => $service === 'tools' && ($owner || $legacyUnrestricted || ($row !== null && (bool) $row['unrestricted'])),
                'updatedAt' => $row === null ? null : (int) $row['updated_at'],
                'locked' => $owner,
            ];
        }
        return $map;
    }

    private function serviceMaps(?array $onlyUsers = null): array
    {
        $maps = [];
        foreach (['words', 'mt', 'reading', 'plan'] as $product) {
            $sql = 'SELECT user_id,revision,schema_version,document_json,size_bytes,updated_at FROM documents';
            $params = [];
            if ($onlyUsers) {
                $sql .= ' WHERE user_id IN (' . implode(',', array_fill(0, count($onlyUsers), '?')) . ')';
                $params = $onlyUsers;
            }
            $stmt = $this->database->product($product)->prepare($sql);
            $stmt->execute($params);
            foreach ($stmt->fetchAll() as $row) $maps[$product][$row['user_id']] = $this->productStatus($product, $row);
        }
        return $maps;
    }

    private function servicesForUser(string $userId, string $username, array $maps, array $permissions, array $availability): array
    {
        $services = [];
        foreach (['words', 'mt', 'reading', 'plan'] as $product) {
            $services[$product] = $maps[$product][$userId] ?? [
                'hasData' => false, 'revision' => 0, 'schemaVersion' => null, 'sizeBytes' => 0,
                'updatedAt' => null, 'usage' => '暂无云端数据',
            ];
            $services[$product]['enabled'] = $permissions[$product]['enabled'];
        }
        $key = mb_strtolower($username, 'UTF-8');
        $tools = $availability[$key] ?? ['activeSessionCount' => 0, 'totalSessionCount' => 0, 'responseCount' => 0];
        $services['tools'] = [
            'enabled' => $permissions['tools']['enabled'],
            'hasData' => $tools['totalSessionCount'] > 0,
            'revision' => null,
            'schemaVersion' => null,
            'sizeBytes' => 0,
            'updatedAt' => $tools['updatedAt'] ?? null,
            'usage' => sprintf('%d 个进行中问卷 · %d 份回答', $tools['activeSessionCount'], $tools['responseCount']),
            'activeSessionCount' => $tools['activeSessionCount'],
            'totalSessionCount' => $tools['totalSessionCount'],
            'responseCount' => $tools['responseCount'],
        ];
        return $services;
    }

    private function productStatus(string $product, array $row): array
    {
        $data = json_decode((string) $row['document_json'], true) ?: [];
        $count = static fn(mixed $value): int => is_array($value) ? count($value) : 0;
        $usage = match ($product) {
            'words' => sprintf('%d 收藏 · %d 已掌握', $count($data['favs'] ?? []), $count($data['mastered'] ?? [])),
            'mt' => sprintf('%d 答题记录 · %d 错题', $count($data['answers'] ?? []), $count($data['wrongbook'] ?? [])),
            'reading' => sprintf('%d 书签 · %d 笔记', $count($data['bookmarks'] ?? []), $count($data['notes'] ?? [])),
            'plan' => sprintf('%d 门课程 · %d 项要求', $count($data['courses'] ?? ($data['audit']['courses'] ?? [])), $count($data['requirements'] ?? ($data['audit']['requirementAudits'] ?? []))),
            default => '已有云端数据',
        };
        return [
            'hasData' => true,
            'revision' => (int) $row['revision'],
            'schemaVersion' => (int) $row['schema_version'],
            'sizeBytes' => (int) $row['size_bytes'],
            'updatedAt' => (int) $row['updated_at'],
            'usage' => $usage,
        ];
    }

    private function sessionSummaries(): array
    {
        $map = [];
        $now = time();
        $sql = 'SELECT s.user_id,s.device_name,s.last_used_at,s.revoked_at,s.refresh_expires_at,s.sso_expires_at,o.last_ip,o.last_seen_at FROM sessions s LEFT JOIN session_observations o ON o.session_id=s.id ORDER BY s.last_used_at DESC';
        foreach ($this->database->passport()->query($sql)->fetchAll() as $row) {
            $id = (string) $row['user_id'];
            $map[$id] ??= ['active' => 0, 'total' => 0, 'lastSeenAt' => null, 'lastIp' => null, 'lastIpApproximate' => false, 'devices' => []];
            $map[$id]['total']++;
            if ($this->sessionIsActive($row, $now)) $map[$id]['active']++;
            $seen = max((int) $row['last_used_at'], (int) ($row['last_seen_at'] ?? 0));
            if ($map[$id]['lastSeenAt'] === null || $seen > $map[$id]['lastSeenAt']) {
                $map[$id]['lastSeenAt'] = $seen;
                $map[$id]['lastIp'] = $row['last_ip'];
                $map[$id]['lastIpApproximate'] = false;
            }
            if (!in_array($row['device_name'], $map[$id]['devices'], true)) $map[$id]['devices'][] = $row['device_name'];
        }
        return $map;
    }

    private function sessionIsActive(array $row, int $now): bool
    {
        return $row['revoked_at'] === null && max((int) ($row['refresh_expires_at'] ?? 0), (int) ($row['sso_expires_at'] ?? 0)) >= $now;
    }

    private function lastAuditIps(): array
    {
        $map = [];
        foreach ($this->database->passport()->query('SELECT user_id,ip_prefix FROM audit_log WHERE user_id IS NOT NULL ORDER BY created_at DESC,id DESC')->fetchAll() as $row) {
            $map[$row['user_id']] ??= $row['ip_prefix'];
        }
        return $map;
    }

    private function availabilityStatuses(): array
    {
        $file = $this->availabilityFile();
        $store = is_file($file) ? json_decode((string) file_get_contents($file), true) : [];
        $sessions = is_array($store['sessions'] ?? null) ? $store['sessions'] : [];
        $now = time();
        $users = [];
        foreach ($sessions as $session) {
            $username = trim((string) ($session['ownerUsername'] ?? 'legacy-admin'));
            $key = mb_strtolower($username, 'UTF-8');
            $users[$key] ??= ['activeSessionCount' => 0, 'totalSessionCount' => 0, 'responseCount' => 0, 'updatedAt' => null];
            $users[$key]['totalSessionCount']++;
            $users[$key]['responseCount'] += count($session['responses'] ?? []);
            $closesAt = strtotime((string) ($session['closesAt'] ?? '')) ?: 0;
            if ($closesAt >= $now) $users[$key]['activeSessionCount']++;
            $updatedAt = strtotime((string) ($session['updatedAt'] ?? $session['createdAt'] ?? '')) ?: null;
            if ($updatedAt && ($users[$key]['updatedAt'] === null || $updatedAt > $users[$key]['updatedAt'])) $users[$key]['updatedAt'] = $updatedAt;
        }
        return $users;
    }

    private function availabilityFile(): string
    {
        return getenv('NAVITOOLS_DATA_FILE') ?: ((getenv('NAVITOOLS_DATA_DIR') ?: '/var/lib/navistudy/tools') . '/availability.json');
    }

    private function writeAvailabilityPermission(string $username, bool $unrestricted): void
    {
        $file = $this->availabilityFile();
        $dir = dirname($file);
        if (!is_dir($dir) && !mkdir($dir, 0770, true) && !is_dir($dir)) throw new ApiException('storage_unavailable', '无法写入 NaviTools 权限。', 500);
        $handle = fopen($file . '.permission.lock', 'c');
        if ($handle === false || !flock($handle, LOCK_EX)) throw new ApiException('storage_unavailable', '无法锁定 NaviTools 权限。', 500);
        try {
            $store = is_file($file) ? json_decode((string) file_get_contents($file), true) : [];
            if (!is_array($store)) $store = [];
            $store['sessions'] ??= [];
            $key = mb_strtolower(trim($username), 'UTF-8');
            $store['servicePermissions']['navitools']['unrestrictedUsers'][$key] = $unrestricted;
            unset($store['servicePermissions']['naviagenda'], $store['servicePermissions']['naviplan']);
            $tmp = $file . '.passport-' . bin2hex(random_bytes(4)) . '.tmp';
            $json = json_encode($store, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);
            if (file_put_contents($tmp, $json, LOCK_EX) === false || !rename($tmp, $file)) {
                @unlink($tmp);
                throw new ApiException('storage_unavailable', '无法保存 NaviTools 权限。', 500);
            }
        } finally {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }

    private function legacyToolsUnrestricted(string $username): bool
    {
        $file = $this->availabilityFile();
        if (!is_file($file)) return false;
        $store = json_decode((string) file_get_contents($file), true);
        if (!is_array($store)) return false;
        $key = mb_strtolower(trim($username), 'UTF-8');
        return !empty($store['servicePermissions']['navitools']['unrestrictedUsers'][$key])
            || !empty($store['servicePermissions']['naviagenda']['unrestrictedUsers'][$key])
            || !empty($store['servicePermissions']['naviplan']['unrestrictedUsers'][$key]);
    }

    private function disabledCount(string $service): int
    {
        $stmt = $this->database->passport()->prepare('SELECT COUNT(*) FROM service_permissions WHERE service=? AND enabled=0');
        $stmt->execute([$service]);
        return (int) $stmt->fetchColumn();
    }

    private function audit(string $event, ?string $userId, array $details): void
    {
        $stmt = $this->database->passport()->prepare('INSERT INTO audit_log(request_id,user_id,event,ip_prefix,details_json,created_at) VALUES(?,?,?,?,?,?)');
        $stmt->execute([
            $_SERVER['NAVISTUDY_REQUEST_ID'] ?? 'internal', $userId, $event, Http::clientIpPrefix(),
            json_encode($details, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), time(),
        ]);
    }

    private function isOwner(string $username): bool
    {
        $owner = trim((string) getenv('NAVISTUDY_ADMIN_USERNAME'));
        return $owner !== '' && mb_strtolower(trim($username), 'UTF-8') === mb_strtolower($owner, 'UTF-8');
    }
}
