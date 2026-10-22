<?php
declare(strict_types=1);

namespace NaviStudy;

final class Config
{
    public function __construct(private array $values) {}

    public static function load(string $root): self
    {
        $envFile = $root . '/.env';
        if (is_file($envFile)) {
            foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
                if (str_starts_with(trim($line), '#') || !str_contains($line, '=')) continue;
                [$key, $value] = array_map('trim', explode('=', $line, 2));
                if (getenv($key) === false) putenv($key . '=' . $value);
            }
        }

        $dataDir = getenv('NAVISTUDY_DATA_DIR') ?: $root . '/var';
        if (!str_starts_with($dataDir, '/') && !preg_match('/^[A-Za-z]:[\\\\\/]/', $dataDir)) {
            $dataDir = $root . '/' . ltrim($dataDir, './');
        }

        return new self([
            'root' => $root,
            'env' => getenv('NAVISTUDY_ENV') ?: 'production',
            'dataDir' => $dataDir,
            'publicOrigin' => rtrim(getenv('NAVISTUDY_PUBLIC_ORIGIN') ?: 'https://study.example.test', '/'),
            'allowedOrigins' => array_values(array_filter(array_map('trim', explode(',', getenv('NAVISTUDY_ALLOWED_ORIGINS') ?: 'https://study.example.test,https://words.example.test,https://mt.example.test')))),
            'cookieSecure' => (getenv('NAVISTUDY_COOKIE_SECURE') ?: '1') !== '0',
            'accessTtl' => 900,
            'refreshTtl' => 2592000,
            'ssoTtl' => 2592000,
            'oauthCodeTtl' => 300,
            'deleteGrace' => 604800,
            'maxDevices' => 10,
            'quotaBytes' => 2 * 1024 * 1024,
            'maxMutations' => 500,
            'snapshotLimit' => 20,
        ]);
    }

    public function get(string $key): mixed
    {
        return $this->values[$key] ?? null;
    }
}

