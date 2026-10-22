<?php
declare(strict_types=1);

namespace NaviStudy;

use PDO;

final class Database
{
    private array $connections = [];

    public function __construct(private Config $config) {}

    public function passport(): PDO
    {
        return $this->open('passport', ['001_initial.sql', '003_admin.sql']);
    }

    public function analytics(): PDO
    {
        return $this->open('analytics', '004_analytics.sql');
    }

    public function product(string $product): PDO
    {
        if (!in_array($product, ['words', 'mt', 'reading', 'plan'], true)) {
            throw new ApiException('invalid_product', '不支持该学习产品。', 404);
        }
        return $this->open($product, '002_product.sql');
    }

    public function migrateAll(): void
    {
        $this->passport();
        $this->analytics();
        $this->product('words');
        $this->product('mt');
        $this->product('reading');
        $this->product('plan');
    }

    private function open(string $name, string|array $migrations): PDO
    {
        if (isset($this->connections[$name])) return $this->connections[$name];
        $dir = $this->config->get('dataDir');
        if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) {
            throw new \RuntimeException('Cannot create NaviStudy data directory.');
        }
        $pdo = new PDO('sqlite:' . $dir . '/' . $name . '.sqlite3', null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('PRAGMA journal_mode = WAL');
        $pdo->exec('PRAGMA synchronous = NORMAL');
        $pdo->exec('PRAGMA busy_timeout = 5000');
        foreach ((array) $migrations as $migration) {
            $sql = file_get_contents($this->config->get('root') . '/migrations/' . $migration);
            if ($sql === false) throw new \RuntimeException('Migration file missing.');
            $pdo->exec($sql);
        }
        return $this->connections[$name] = $pdo;
    }
}
