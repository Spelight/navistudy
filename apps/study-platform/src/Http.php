<?php
declare(strict_types=1);

namespace NaviStudy;

final class ApiException extends \RuntimeException
{
    public function __construct(public string $errorCode, string $message, public int $status = 400)
    {
        parent::__construct($message);
    }
}

final class Http
{
    public static function requestId(): string
    {
        return bin2hex(random_bytes(8));
    }

    public static function jsonBody(): array
    {
        $raw = file_get_contents('php://input');
        if ($raw === false || $raw === '') return [];
        if (strlen($raw) > 3 * 1024 * 1024) throw new ApiException('payload_too_large', '请求内容过大。', 413);
        try {
            $decoded = json_decode($raw, true, 128, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new ApiException('invalid_json', '请求不是有效的 JSON。');
        }
        if (!is_array($decoded)) throw new ApiException('invalid_json', '请求必须是 JSON 对象。');
        return $decoded;
    }

    public static function respond(array $payload, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        exit;
    }

    public static function ok(array $data = [], int $status = 200): never
    {
        self::respond(['ok' => true] + $data, $status);
    }

    public static function fail(ApiException $error, string $requestId): never
    {
        self::respond(['ok' => false, 'error' => [
            'code' => $error->errorCode,
            'message' => $error->getMessage(),
            'requestId' => $requestId,
        ]], $error->status);
    }

    public static function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        return isset($_SERVER[$key]) ? trim((string) $_SERVER[$key]) : null;
    }

    public static function bearer(): ?string
    {
        $value = self::header('Authorization');
        return $value && preg_match('/^Bearer\s+(.+)$/i', $value, $match) ? trim($match[1]) : null;
    }

    public static function clientIpPrefix(): string
    {
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'local';
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            $parts = explode('.', $ip);
            return implode('.', array_slice($parts, 0, 3)) . '.0/24';
        }
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
            return implode(':', array_slice(explode(':', $ip), 0, 4)) . '::/64';
        }
        return 'unknown';
    }
}

