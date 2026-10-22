<?php
declare(strict_types=1);

namespace NaviStudy;

use PDO;

final class AnalyticsService
{
    private const PRODUCTS = ['study', 'words', 'mt', 'reading', 'plan', 'tools'];
    private const EVENTS = [
        'page_view', 'app_open', 'product_open', 'study_start', 'study_end',
        'question_answered', 'favorite_added', 'favorite_removed',
        'bookmark_added', 'bookmark_removed', 'note_saved',
        'plan_import', 'plan_evaluate', 'tool_created', 'tool_response',
    ];
    private const METADATA_KEYS = [
        'version', 'path', 'mode', 'count', 'book', 'unit', 'source', 'type',
        'chapter', 'order', 'courses', 'requirements',
    ];

    public function __construct(private Config $config, private Database $database) {}

    public function record(array $input, ?array $identity = null): array
    {
        $events = $input['events'] ?? null;
        if (!is_array($events) || count($events) > 100) throw new ApiException('invalid_analytics_events', '单次最多提交 100 条统计事件。', 400);
        $platform = (string) ($input['platform'] ?? 'web');
        if (!in_array($platform, ['web', 'wechat'], true)) throw new ApiException('invalid_analytics_platform', '统计来源无效。', 400);
        $visitorId = trim((string) ($input['visitorId'] ?? ''));
        if ($identity === null && !preg_match('/^[A-Za-z0-9._:-]{8,160}$/', $visitorId)) throw new ApiException('invalid_analytics_visitor', '缺少有效的匿名设备标识。', 400);
        $actorKey = $identity ? (string) $identity['id'] : $this->visitorHash($visitorId);
        $pdo = $this->database->analytics();
        $insert = $pdo->prepare('INSERT OR IGNORE INTO analytics_events(event_id,product,platform,event_name,user_id,visitor_hash,item_key,value_number,metadata_json,occurred_at,received_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
        $favoriteUpdate = $pdo->prepare('UPDATE analytics_favorites SET active=?,updated_at=? WHERE product=? AND item_key=? AND actor_key=? AND updated_at<=?');
        $favoriteInsert = $pdo->prepare('INSERT OR IGNORE INTO analytics_favorites(product,item_key,actor_key,active,updated_at) VALUES(?,?,?,?,?)');
        $accepted = 0;
        $now = time();
        $pdo->beginTransaction();
        try {
            foreach ($events as $event) {
                if (!is_array($event)) throw new ApiException('invalid_analytics_event', '统计事件格式无效。', 400);
                $eventId = trim((string) ($event['eventId'] ?? ''));
                $product = (string) ($event['product'] ?? $input['product'] ?? 'study');
                $name = (string) ($event['name'] ?? $event['type'] ?? '');
                if (!preg_match('/^[A-Za-z0-9._:-]{8,160}$/', $eventId) || !in_array($product, self::PRODUCTS, true) || !in_array($name, self::EVENTS, true)) throw new ApiException('invalid_analytics_event', '统计事件包含不支持的产品或事件类型。', 400);
                $itemKey = trim((string) ($event['itemId'] ?? $event['itemKey'] ?? ''));
                if ($itemKey !== '' && !preg_match('~^[\p{L}\p{N}._:/#?=+%@\x20\x27-]{1,200}$~u', $itemKey)) throw new ApiException('invalid_analytics_item', '统计对象编号无效。', 400);
                $occurred = (int) ($event['occurredAt'] ?? 0);
                if ($occurred < $now - 172800 || $occurred > $now + 300) $occurred = $now;
                $metadata = $event['metadata'] ?? [];
                if (!is_array($metadata)) $metadata = [];
                $metadata = $this->safeMetadata($metadata);
                $value = isset($event['value']) && is_numeric($event['value']) ? (int) $event['value'] : null;
                $insert->execute([
                    $eventId, $product, $platform, $name,
                    $identity['id'] ?? null, $identity ? null : $this->visitorHash($visitorId),
                    $itemKey !== '' ? $itemKey : null, $value,
                    json_encode($metadata, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
                    $occurred, $now,
                ]);
                if ($insert->rowCount() === 1) {
                    $accepted++;
                    if (in_array($name, ['favorite_added', 'favorite_removed', 'bookmark_added', 'bookmark_removed'], true) && $itemKey !== '' && in_array($product, ['words', 'mt', 'reading'], true)) {
                        $active = in_array($name, ['favorite_added', 'bookmark_added'], true) ? 1 : 0;
                        $favoriteUpdate->execute([$active, $occurred, $product, $itemKey, $actorKey, $occurred]);
                        if ($favoriteUpdate->rowCount() === 0) $favoriteInsert->execute([$product, $itemKey, $actorKey, $active, $occurred]);
                    }
                }
            }
            $cutoff = $now - (180 * 86400);
            $pdo->prepare('DELETE FROM analytics_events WHERE occurred_at < ?')->execute([$cutoff]);
            $pdo->prepare('DELETE FROM analytics_favorites WHERE active = 0 AND updated_at < ?')->execute([$cutoff]);
            $pdo->commit();
        } catch (\Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        return ['accepted' => $accepted, 'received' => count($events)];
    }

    public function overview(int $days = 30, string $platform = 'all', string $product = 'all', ?string $range = null): array
    {
        $platform = $this->platformFilter($platform);
        $product = $this->productFilter($product);
        $window = $this->window($range, $days);
        $days = $window['days'];
        $now = $window['now'];
        $to = $window['to'];
        $from = $window['from'];
        $previousFrom = $window['previousFrom'];
        $pdo = $this->database->analytics();
        $summary = $this->summary($pdo, $from, $to, $platform, $product);
        $previous = $this->summary($pdo, $previousFrom, $from, $platform, $product);
        $summary['change'] = [];
        foreach (['visits', 'users', 'authenticatedUsers', 'studyActions', 'questions', 'favoriteAdds'] as $key) {
            $summary['change'][$key] = $this->percentChange((int) $summary[$key], (int) $previous[$key]);
        }

        $trend = $this->trend($pdo, $from, $to, $platform, $product, $window);

        return [
            'days' => $days,
            'window' => [
                'key' => $window['key'], 'label' => $window['label'], 'bucket' => $window['bucket'],
                'from' => $from, 'to' => $to,
            ],
            'generatedAt' => $now,
            'filters' => ['platform' => $platform, 'product' => $product],
            'summary' => $summary,
            'previousSummary' => $previous,
            'trend' => $trend,
            'products' => $this->products($days, $platform, $product, $to, $from),
            'platforms' => $this->platforms($from, $to, $platform, $product),
            'events' => $this->eventBreakdown($from, $to, $platform, $product),
        ];
    }

    public function products(int $days = 30, string $platform = 'all', string $product = 'all', ?int $now = null, ?int $from = null): array
    {
        $days = min(90, max(1, $days));
        $platform = $this->platformFilter($platform);
        $product = $this->productFilter($product);
        $now ??= time();
        $from ??= $now - ($days * 86400);
        [$where, $params] = $this->where($from, $now, $platform, $product);
        $stmt = $this->database->analytics()->prepare("SELECT product, COUNT(*) events, COUNT(DISTINCT COALESCE(user_id, visitor_hash)) users, COUNT(DISTINCT CASE WHEN event_name IN ('page_view','app_open','product_open') THEN COALESCE(user_id, visitor_hash) END) visitors, SUM(CASE WHEN event_name IN ('question_answered','study_start','favorite_added','bookmark_added','note_saved','plan_import','plan_evaluate','tool_created','tool_response') THEN 1 ELSE 0 END) studyActions, SUM(CASE WHEN event_name IN ('favorite_added','bookmark_added') THEN 1 ELSE 0 END) favoriteAdds, SUM(CASE WHEN event_name='question_answered' THEN 1 ELSE 0 END) questions, SUM(CASE WHEN event_name='question_answered' AND value_number=1 THEN 1 ELSE 0 END) correct FROM analytics_events WHERE $where GROUP BY product ORDER BY product");
        $stmt->execute($params);
        $items = [];
        foreach ($stmt->fetchAll() as $row) {
            $questions = (int) $row['questions'];
            $items[$row['product']] = [
                'events' => (int) $row['events'], 'users' => (int) $row['users'],
                'visitors' => (int) $row['visitors'], 'studyActions' => (int) $row['studyActions'],
                'favoriteAdds' => (int) $row['favoriteAdds'], 'questions' => $questions,
                'correctRate' => $questions > 0 ? round(((int) $row['correct'] / $questions) * 100, 1) : null,
            ];
        }
        $visibleProducts = $product === 'all' ? self::PRODUCTS : [$product];
        foreach ($visibleProducts as $key) $items[$key] ??= ['events' => 0, 'users' => 0, 'visitors' => 0, 'studyActions' => 0, 'favoriteAdds' => 0, 'questions' => 0, 'correctRate' => null];
        return $items;
    }

    public function content(string $product, int $days = 30, int $limit = 20, string $platform = 'all', ?string $range = null): array
    {
        if (!in_array($product, ['words', 'mt', 'reading'], true)) throw new ApiException('invalid_product', '该产品暂无内容排行。', 404);
        $platform = $this->platformFilter($platform);
        $window = $this->window($range, $days);
        $from = $window['from'];
        $to = $window['to'];
        $limit = min(100, max(5, $limit));
        $platformSql = $platform === 'all' ? '' : ' AND platform=?';
        $stmt = $this->database->analytics()->prepare("SELECT item_key itemKey, SUM(CASE WHEN event_name IN ('question_answered','study_start') THEN 1 ELSE 0 END) attempts, SUM(CASE WHEN event_name IN ('favorite_added','bookmark_added') THEN 1 ELSE 0 END) favoriteAdds, SUM(CASE WHEN event_name='question_answered' THEN 1 ELSE 0 END) questions, SUM(CASE WHEN event_name='question_answered' AND value_number=1 THEN 1 ELSE 0 END) correct, SUM(CASE WHEN event_name='question_answered' AND value_number=0 THEN 1 ELSE 0 END) wrong, COUNT(DISTINCT COALESCE(user_id, visitor_hash)) users FROM analytics_events WHERE product=? AND item_key IS NOT NULL AND occurred_at>=? AND occurred_at<?$platformSql GROUP BY item_key ORDER BY attempts DESC, favoriteAdds DESC LIMIT ?");
        $index = 1;
        $stmt->bindValue($index++, $product);
        $stmt->bindValue($index++, $from, PDO::PARAM_INT);
        $stmt->bindValue($index++, $to, PDO::PARAM_INT);
        if ($platform !== 'all') $stmt->bindValue($index++, $platform);
        $stmt->bindValue($index, $limit, PDO::PARAM_INT);
        $stmt->execute();
        $favoriteStmt = $this->database->analytics()->prepare('SELECT item_key, COUNT(*) total FROM analytics_favorites WHERE product=? AND active=1 GROUP BY item_key');
        $favoriteStmt->execute([$product]);
        $activeFavorites = [];
        foreach ($favoriteStmt->fetchAll() as $row) $activeFavorites[$row['item_key']] = (int) $row['total'];
        $items = array_map(static function (array $row) use ($activeFavorites): array {
            $questions = (int) $row['questions'];
            return [
                'itemKey' => $row['itemKey'], 'attempts' => (int) $row['attempts'],
                'favoriteAdds' => (int) $row['favoriteAdds'], 'activeFavorites' => $activeFavorites[$row['itemKey']] ?? 0,
                'wrong' => (int) $row['wrong'], 'users' => (int) $row['users'],
                'correctRate' => $questions > 0 ? round(((int) $row['correct'] / $questions) * 100, 1) : null,
            ];
        }, $stmt->fetchAll());
        return ['product' => $product, 'platform' => $platform, 'items' => $items];
    }

    public function userSummary(string $userId): array
    {
        $stmt = $this->database->analytics()->prepare("SELECT product, COUNT(*) events, MIN(occurred_at) firstAt, MAX(occurred_at) lastAt, SUM(CASE WHEN event_name IN ('page_view','app_open','product_open') THEN 1 ELSE 0 END) visits, SUM(CASE WHEN event_name IN ('question_answered','study_start','favorite_added','bookmark_added','note_saved','plan_import','plan_evaluate','tool_created','tool_response') THEN 1 ELSE 0 END) actions FROM analytics_events WHERE user_id=? GROUP BY product");
        $stmt->execute([$userId]);
        $products = [];
        foreach ($stmt->fetchAll() as $row) $products[$row['product']] = ['events' => (int) $row['events'], 'firstAt' => (int) $row['firstAt'], 'lastAt' => (int) $row['lastAt'], 'visits' => (int) $row['visits'], 'actions' => (int) $row['actions']];
        $fav = $this->database->analytics()->prepare('SELECT product, COUNT(*) total FROM analytics_favorites WHERE actor_key=? AND active=1 GROUP BY product');
        $fav->execute([$userId]);
        $favorites = [];
        foreach ($fav->fetchAll() as $row) $favorites[$row['product']] = (int) $row['total'];
        return ['products' => $products, 'favorites' => $favorites];
    }

    private function window(?string $range, int $days, ?int $now = null): array
    {
        $now ??= time();
        $to = $now + 1;
        $range = trim((string) $range);
        if ($range === '') {
            $days = min(90, max(1, $days));
            return [
                'key' => $days . 'd', 'label' => '近 ' . $days . ' 天', 'bucket' => 'day',
                'days' => $days, 'now' => $now, 'from' => $now - ($days * 86400),
                'to' => $to, 'previousFrom' => $now - ($days * 2 * 86400),
            ];
        }
        if ($range === 'today') {
            $localMidnight = intdiv($now + 8 * 3600, 86400) * 86400 - 8 * 3600;
            $duration = max(1, $to - $localMidnight);
            return [
                'key' => 'today', 'label' => '今天', 'bucket' => 'hour',
                'days' => 1, 'now' => $now, 'from' => $localMidnight,
                'to' => $to, 'previousFrom' => $localMidnight - $duration,
            ];
        }
        if (preg_match('/^([0-9]{1,2})h$/', $range, $match)) {
            $hours = (int) $match[1];
            if (!in_array($hours, [4, 8, 24], true)) throw new ApiException('invalid_analytics_range', '统计时间范围无效。', 400);
            return [
                'key' => $hours . 'h', 'label' => '近 ' . $hours . ' 小时', 'bucket' => 'hour',
                'days' => 1, 'now' => $now, 'from' => $now - ($hours * 3600),
                'to' => $to, 'previousFrom' => $now - ($hours * 2 * 3600),
            ];
        }
        if (preg_match('/^([0-9]{1,2})d$/', $range, $match)) {
            $days = (int) $match[1];
            if (!in_array($days, [7, 30, 90], true)) throw new ApiException('invalid_analytics_range', '统计时间范围无效。', 400);
            return [
                'key' => $days . 'd', 'label' => '近 ' . $days . ' 天', 'bucket' => 'day',
                'days' => $days, 'now' => $now, 'from' => $now - ($days * 86400),
                'to' => $to, 'previousFrom' => $now - ($days * 2 * 86400),
            ];
        }
        throw new ApiException('invalid_analytics_range', '统计时间范围无效。', 400);
    }

    private function trend(PDO $pdo, int $from, int $to, string $platform, string $product, array $window): array
    {
        [$where, $params] = $this->where($from, $to, $platform, $product);
        if ($window['bucket'] === 'hour') {
            $stmt = $pdo->prepare("SELECT strftime('%Y-%m-%d %H:00', occurred_at, 'unixepoch', '+8 hours') bucket, COUNT(*) events, COUNT(DISTINCT COALESCE(user_id, visitor_hash)) users, SUM(CASE WHEN event_name IN ('page_view','app_open','product_open') THEN 1 ELSE 0 END) visits, SUM(CASE WHEN event_name IN ('question_answered','study_start','favorite_added','bookmark_added','note_saved','plan_import','plan_evaluate','tool_created','tool_response') THEN 1 ELSE 0 END) actions FROM analytics_events WHERE $where GROUP BY bucket ORDER BY bucket");
            $stmt->execute($params);
            $hourly = [];
            foreach ($stmt->fetchAll() as $row) $hourly[$row['bucket']] = ['bucket' => $row['bucket'], 'label' => substr((string) $row['bucket'], 11, 5), 'events' => (int) $row['events'], 'users' => (int) $row['users'], 'visits' => (int) $row['visits'], 'actions' => (int) $row['actions']];
            $trend = [];
            $localStart = intdiv($from + 8 * 3600, 3600) * 3600;
            $localEnd = intdiv(($to - 1) + 8 * 3600, 3600) * 3600;
            for ($local = $localStart; $local <= $localEnd; $local += 3600) {
                $bucket = gmdate('Y-m-d H:00', $local);
                $trend[] = $hourly[$bucket] ?? ['bucket' => $bucket, 'label' => gmdate('H:00', $local), 'events' => 0, 'users' => 0, 'visits' => 0, 'actions' => 0];
            }
            return $trend;
        }

        $stmt = $pdo->prepare("SELECT date(occurred_at, 'unixepoch', '+8 hours') day, COUNT(*) events, COUNT(DISTINCT COALESCE(user_id, visitor_hash)) users, SUM(CASE WHEN event_name IN ('page_view','app_open','product_open') THEN 1 ELSE 0 END) visits, SUM(CASE WHEN event_name IN ('question_answered','study_start','favorite_added','bookmark_added','note_saved','plan_import','plan_evaluate','tool_created','tool_response') THEN 1 ELSE 0 END) actions FROM analytics_events WHERE $where GROUP BY day ORDER BY day");
        $stmt->execute($params);
        $daily = [];
        foreach ($stmt->fetchAll() as $row) $daily[$row['day']] = ['day' => $row['day'], 'label' => substr((string) $row['day'], 5), 'events' => (int) $row['events'], 'users' => (int) $row['users'], 'visits' => (int) $row['visits'], 'actions' => (int) $row['actions']];
        $trend = [];
        for ($offset = $window['days'] - 1; $offset >= 0; $offset--) {
            $day = gmdate('Y-m-d', $window['now'] + (8 * 3600) - ($offset * 86400));
            $trend[] = $daily[$day] ?? ['day' => $day, 'label' => substr($day, 5), 'events' => 0, 'users' => 0, 'visits' => 0, 'actions' => 0];
        }
        return $trend;
    }

    private function summary(PDO $pdo, int $from, int $to, string $platform, string $product): array
    {
        [$where, $params] = $this->where($from, $to, $platform, $product);
        $stmt = $pdo->prepare("SELECT COUNT(*) events, COUNT(DISTINCT COALESCE(user_id, visitor_hash)) users, COUNT(DISTINCT user_id) authenticatedUsers, COUNT(DISTINCT visitor_hash) anonymousUsers, SUM(CASE WHEN event_name IN ('page_view','app_open','product_open') THEN 1 ELSE 0 END) visits, SUM(CASE WHEN event_name IN ('question_answered','study_start','favorite_added','bookmark_added','note_saved','plan_import','plan_evaluate','tool_created','tool_response') THEN 1 ELSE 0 END) studyActions, SUM(CASE WHEN event_name='question_answered' THEN 1 ELSE 0 END) questions, SUM(CASE WHEN event_name='question_answered' AND value_number=1 THEN 1 ELSE 0 END) correctAnswers, SUM(CASE WHEN event_name='question_answered' AND value_number=0 THEN 1 ELSE 0 END) wrongAnswers, SUM(CASE WHEN event_name IN ('favorite_added','bookmark_added') THEN 1 ELSE 0 END) favoriteAdds, COUNT(DISTINCT date(occurred_at, 'unixepoch', '+8 hours')) activeDays FROM analytics_events WHERE $where");
        $stmt->execute($params);
        $row = $stmt->fetch() ?: [];
        $questions = (int) ($row['questions'] ?? 0);
        return [
            'events' => (int) ($row['events'] ?? 0), 'users' => (int) ($row['users'] ?? 0),
            'authenticatedUsers' => (int) ($row['authenticatedUsers'] ?? 0), 'anonymousUsers' => (int) ($row['anonymousUsers'] ?? 0),
            'visits' => (int) ($row['visits'] ?? 0), 'studyActions' => (int) ($row['studyActions'] ?? 0),
            'questions' => $questions, 'correctAnswers' => (int) ($row['correctAnswers'] ?? 0),
            'wrongAnswers' => (int) ($row['wrongAnswers'] ?? 0), 'favoriteAdds' => (int) ($row['favoriteAdds'] ?? 0),
            'activeDays' => (int) ($row['activeDays'] ?? 0),
            'correctRate' => $questions > 0 ? round(((int) ($row['correctAnswers'] ?? 0) / $questions) * 100, 1) : null,
        ];
    }

    private function platforms(int $from, int $to, string $platform, string $product): array
    {
        [$where, $params] = $this->where($from, $to, $platform, $product);
        $stmt = $this->database->analytics()->prepare("SELECT platform, COUNT(*) events, COUNT(DISTINCT COALESCE(user_id, visitor_hash)) users, SUM(CASE WHEN event_name IN ('page_view','app_open','product_open') THEN 1 ELSE 0 END) visits, SUM(CASE WHEN event_name IN ('question_answered','study_start','favorite_added','bookmark_added','note_saved','plan_import','plan_evaluate','tool_created','tool_response') THEN 1 ELSE 0 END) actions FROM analytics_events WHERE $where GROUP BY platform ORDER BY platform");
        $stmt->execute($params);
        $items = [];
        foreach ($stmt->fetchAll() as $row) $items[$row['platform']] = ['events' => (int) $row['events'], 'users' => (int) $row['users'], 'visits' => (int) $row['visits'], 'actions' => (int) $row['actions']];
        foreach (($platform === 'all' ? ['web', 'wechat'] : [$platform]) as $key) $items[$key] ??= ['events' => 0, 'users' => 0, 'visits' => 0, 'actions' => 0];
        return $items;
    }

    private function eventBreakdown(int $from, int $to, string $platform, string $product): array
    {
        [$where, $params] = $this->where($from, $to, $platform, $product);
        $stmt = $this->database->analytics()->prepare("SELECT event_name name, COUNT(*) total, COUNT(DISTINCT COALESCE(user_id, visitor_hash)) users FROM analytics_events WHERE $where GROUP BY event_name ORDER BY total DESC, event_name LIMIT 12");
        $stmt->execute($params);
        return array_map(static fn(array $row): array => ['name' => $row['name'], 'total' => (int) $row['total'], 'users' => (int) $row['users']], $stmt->fetchAll());
    }

    private function where(int $from, int $to, string $platform, string $product): array
    {
        $clauses = ['occurred_at>=?', 'occurred_at<?'];
        $params = [$from, $to];
        if ($platform !== 'all') { $clauses[] = 'platform=?'; $params[] = $platform; }
        if ($product !== 'all') { $clauses[] = 'product=?'; $params[] = $product; }
        return [implode(' AND ', $clauses), $params];
    }

    private function platformFilter(string $platform): string
    {
        if (!in_array($platform, ['all', 'web', 'wechat'], true)) throw new ApiException('invalid_analytics_platform', '统计来源筛选无效。', 400);
        return $platform;
    }

    private function productFilter(string $product): string
    {
        if ($product !== 'all' && !in_array($product, self::PRODUCTS, true)) throw new ApiException('invalid_product', '统计产品筛选无效。', 400);
        return $product;
    }

    private function percentChange(int $current, int $previous): ?float
    {
        if ($previous === 0) return $current === 0 ? 0.0 : null;
        return round((($current - $previous) / $previous) * 100, 1);
    }

    private function visitorHash(string $visitorId): string
    {
        $secret = (string) (getenv('NAVISTUDY_ANALYTICS_SECRET') ?: $this->config->get('root'));
        return hash_hmac('sha256', $visitorId, $secret);
    }

    private function safeMetadata(array $metadata): array
    {
        $allowed = [];
        foreach ($metadata as $key => $value) {
            if (!is_string($key) || !in_array($key, self::METADATA_KEYS, true)) continue;
            if (is_scalar($value)) {
                $text = (string) $value;
                $allowed[$key] = function_exists('mb_substr') ? mb_substr($text, 0, 120, 'UTF-8') : substr($text, 0, 120);
            }
        }
        return array_slice($allowed, 0, 12, true);
    }
}
