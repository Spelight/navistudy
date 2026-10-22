<?php
declare(strict_types=1);

namespace NaviStudy;

use PDO;

final class AuthService
{
    private const PASSWORD_OPTIONS = ['memory_cost' => 32768, 'time_cost' => 3, 'threads' => 1];
    private const COMMON_PASSWORDS = ['123456', '1234567890', 'password', 'password123', 'qwerty', 'qwerty12345', '111111', '1111111111', '000000', '0000000000'];

    public function __construct(private Config $config, private Database $database) {}

    public function register(array $input): array
    {
        $candidate = trim((string) ($input['username'] ?? ''));
        $usernameKey = $this->usernameKey($candidate);
        $pdo = $this->database->passport();
        $legacy = $pdo->prepare('SELECT 1 FROM legacy_claims WHERE username_key=? AND claimed_by IS NULL LIMIT 1');
        $legacy->execute([$usernameKey]);
        $username = $this->validateUsername($candidate, (bool) $legacy->fetchColumn());
        $password = $this->validatePassword($input['password'] ?? '', $username);
        $deviceId = $this->validateDeviceId($input['deviceId'] ?? 'browser');
        $deviceName = $this->cleanDeviceName($input['deviceName'] ?? '浏览器');
        $clientId = $this->validateClientId($input['clientId'] ?? 'study-web');
        $now = time();
        $userId = $this->id();
        $recoveryCode = $this->recoveryCode();

        $importer = new LegacyImporter($this->config, $this->database);
        $importer->attachProductDatabases($pdo);
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare('INSERT INTO users (id, username, username_key, password_hash, recovery_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([$userId, $username, $usernameKey, password_hash($password, PASSWORD_ARGON2ID, self::PASSWORD_OPTIONS), $this->recoveryHash($recoveryCode), $now, $now]);
            $claimedProducts = $importer->claimAttached($pdo, $userId, $usernameKey);
            $pdo->commit();
        } catch (\PDOException $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            if ((string) $error->getCode() === '23000' || str_contains($error->getMessage(), 'UNIQUE')) {
                throw new ApiException('username_unavailable', '该用户名暂不可用。', 409);
            }
            throw $error;
        } catch (\Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }

        $session = $this->createSession($userId, $deviceId, $deviceName, $clientId, $this->clientScopes($clientId), true);
        $this->audit('register', $userId);
        return ['account' => $this->publicUser($userId), 'recoveryCode' => $recoveryCode, 'claimedProducts' => $claimedProducts] + $session;
    }

    public function login(array $input): array
    {
        $username = trim((string) ($input['username'] ?? ''));
        $password = (string) ($input['password'] ?? '');
        $deviceId = $this->validateDeviceId($input['deviceId'] ?? 'browser');
        $deviceName = $this->cleanDeviceName($input['deviceName'] ?? '浏览器');
        $clientId = $this->validateClientId($input['clientId'] ?? 'study-web');
        $bucket = hash('sha256', Http::clientIpPrefix() . '|' . $this->usernameKey($username));
        $this->enforceRateLimit($bucket);

        $stmt = $this->database->passport()->prepare('SELECT * FROM users WHERE username_key = ?');
        $stmt->execute([$this->usernameKey($username)]);
        $user = $stmt->fetch();
        if (!$user) {
            $legacy = $this->database->passport()->prepare("SELECT 1 FROM legacy_claims WHERE username_key=? AND product='words' AND claimed_by IS NULL LIMIT 1");
            $legacy->execute([$this->usernameKey($username)]);
            if ($legacy->fetchColumn()) {
                $this->recordLoginFailure($bucket);
                usleep(random_int(120000, 240000));
                throw new ApiException('legacy_registration_required', '这是旧版 NaviWords 用户名。首次使用 NaviPassport 请先注册，注册后会自动继承原有记录。', 409);
            }
        }
        if (!$user || !password_verify($password, $user['password_hash'])) {
            $this->recordLoginFailure($bucket);
            usleep(random_int(120000, 240000));
            throw new ApiException('invalid_credentials', '用户名或密码不正确。', 401);
        }
        $this->clearLoginFailures($bucket);
        $session = $this->createSession($user['id'], $deviceId, $deviceName, $clientId, $this->clientScopes($clientId), true);
        $this->audit('login', $user['id']);
        return ['account' => $this->publicUser($user['id'])] + $session;
    }

    public function refresh(string $token): array
    {
        if ($token === '') throw new ApiException('invalid_refresh_token', '登录已失效，请重新登录。', 401);
        $pdo = $this->database->passport();
        $hash = $this->secretHash($token);
        $used = $pdo->prepare('SELECT family_id FROM used_refresh_tokens WHERE token_hash = ?');
        $used->execute([$hash]);
        if ($row = $used->fetch()) {
            $this->revokeFamily($row['family_id']);
            $this->audit('refresh_reuse_detected', null);
            throw new ApiException('refresh_token_reused', '检测到重复使用的登录凭据，该设备组已退出。', 401);
        }

        $stmt = $pdo->prepare('SELECT s.*, u.status FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.refresh_hash = ?');
        $stmt->execute([$hash]);
        $session = $stmt->fetch();
        if (!$session || $session['revoked_at'] || (int) $session['refresh_expires_at'] < time()) {
            throw new ApiException('invalid_refresh_token', '登录已失效，请重新登录。', 401);
        }
        if ($session['status'] !== 'active') throw new ApiException('account_pending_deletion', '账号处于删除冻结期。', 403);

        $newToken = $this->token();
        $now = time();
        $pdo->beginTransaction();
        try {
            $pdo->prepare('INSERT INTO used_refresh_tokens (token_hash, family_id, used_at) VALUES (?, ?, ?)')->execute([$hash, $session['family_id'], $now]);
            $pdo->prepare('UPDATE sessions SET refresh_hash = ?, refresh_expires_at = ?, last_used_at = ? WHERE id = ?')->execute([$this->secretHash($newToken), $now + $this->config->get('refreshTtl'), $now, $session['id']]);
            $pdo->prepare('UPDATE access_tokens SET revoked_at = ? WHERE session_id = ? AND revoked_at IS NULL')->execute([$now, $session['id']]);
            $this->observeSession($session['id'], $now);
            $pdo->commit();
        } catch (\Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        return $this->issueAccessToken($session['id'], $session['user_id'], $session['scopes']) + [
            'refreshToken' => $newToken,
            'refreshExpiresAt' => $now + $this->config->get('refreshTtl'),
            'csrfToken' => $session['csrf_token'],
            'account' => $this->publicUser($session['user_id']),
        ];
    }

    public function recover(array $input): array
    {
        $usernameKey = $this->usernameKey((string) ($input['username'] ?? ''));
        $code = $this->normalizeRecoveryCode((string) ($input['recoveryCode'] ?? ''));
        $password = $this->validatePassword($input['newPassword'] ?? '', (string) ($input['username'] ?? ''));
        $pdo = $this->database->passport();
        $stmt = $pdo->prepare('SELECT * FROM users WHERE username_key = ?');
        $stmt->execute([$usernameKey]);
        $user = $stmt->fetch();
        if (!$user || $code === '' || !hash_equals($user['recovery_hash'], $this->recoveryHash($code))) {
            usleep(random_int(120000, 240000));
            throw new ApiException('invalid_recovery', '用户名或恢复码不正确。', 401);
        }
        $newCode = $this->recoveryCode();
        $pdo->beginTransaction();
        try {
            $pdo->prepare('UPDATE users SET password_hash = ?, recovery_hash = ?, status = ?, deletion_at = NULL, updated_at = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_ARGON2ID, self::PASSWORD_OPTIONS), $this->recoveryHash($newCode), 'active', time(), $user['id']]);
            $this->revokeUserSessions($user['id']);
            $pdo->commit();
        } catch (\Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        $this->audit('password_recovered', $user['id']);
        return ['recoveryCode' => $newCode];
    }

    public function authenticate(?string $requiredScope = null, bool $allowPendingDeletion = false, string $accessCookie = 'navi_access', bool $allowSso = true): array
    {
        $pdo = $this->database->passport();
        $bearer = Http::bearer();
        $token = $bearer ?: ($_COOKIE[$accessCookie] ?? '');
        $auth = false;
        if ($token !== '') {
            $stmt = $pdo->prepare('SELECT t.scopes token_scopes, t.session_id, s.csrf_token, s.client_id, s.device_id, u.* FROM access_tokens t JOIN sessions s ON s.id=t.session_id JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.revoked_at IS NULL AND s.revoked_at IS NULL AND t.expires_at>=?');
            $stmt->execute([$this->secretHash($token), time()]);
            $auth = $stmt->fetch();
        }
        if (!$auth && !$bearer && $allowSso) {
            $sso = $_COOKIE['navi_sso'] ?? '';
            $stmt = $pdo->prepare('SELECT s.scopes token_scopes, s.id session_id, s.csrf_token, s.client_id, s.device_id, u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.sso_hash=? AND s.revoked_at IS NULL AND s.sso_expires_at>=?');
            $stmt->execute([$this->secretHash($sso), time()]);
            $auth = $stmt->fetch();
        }
        if (!$auth) throw new ApiException('authentication_required', '请先登录 Navi Passport。', 401);
        if (!$allowPendingDeletion && $auth['status'] !== 'active') throw new ApiException('account_pending_deletion', '账号处于删除冻结期，同步已暂停。', 403);
        if ($requiredScope && !$this->hasScope($auth['token_scopes'], $requiredScope)) throw new ApiException('insufficient_scope', '当前登录无权访问该产品数据。', 403);
        $this->touchSession((string) $auth['session_id']);
        return $auth;
    }

    public function requireCsrf(array $auth): void
    {
        if (Http::bearer()) return;
        $origin = Http::header('Origin');
        if (!$origin || !in_array(rtrim($origin, '/'), $this->config->get('allowedOrigins'), true)) {
            throw new ApiException('invalid_origin', '请求来源未获授权。', 403);
        }
        $provided = Http::header('X-CSRF-Token') ?? '';
        if ($provided === '' || !hash_equals((string) $auth['csrf_token'], $provided)) {
            throw new ApiException('invalid_csrf', '页面验证已过期，请刷新后重试。', 403);
        }
    }

    public function changePassword(array $auth, array $input): array
    {
        $current = (string) ($input['currentPassword'] ?? '');
        $next = $this->validatePassword($input['newPassword'] ?? '', $auth['username']);
        if (!password_verify($current, $auth['password_hash'])) throw new ApiException('invalid_credentials', '当前密码不正确。', 401);
        $code = $this->recoveryCode();
        $pdo = $this->database->passport();
        $pdo->beginTransaction();
        try {
            $pdo->prepare('UPDATE users SET password_hash=?, recovery_hash=?, updated_at=? WHERE id=?')->execute([password_hash($next, PASSWORD_ARGON2ID, self::PASSWORD_OPTIONS), $this->recoveryHash($code), time(), $auth['id']]);
            $this->revokeUserSessions($auth['id'], $auth['session_id']);
            $pdo->commit();
        } catch (\Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        $this->audit('password_changed', $auth['id']);
        return ['recoveryCode' => $code];
    }

    public function sessions(string $userId): array
    {
        $stmt = $this->database->passport()->prepare('SELECT id, device_id deviceId, device_name deviceName, client_id clientId, created_at createdAt, last_used_at lastUsedAt, revoked_at revokedAt FROM sessions WHERE user_id=? ORDER BY last_used_at DESC');
        $stmt->execute([$userId]);
        return $stmt->fetchAll();
    }

    public function revokeSession(string $userId, string $sessionId): void
    {
        $stmt = $this->database->passport()->prepare('UPDATE sessions SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL');
        $stmt->execute([time(), $sessionId, $userId]);
        if ($stmt->rowCount() === 0) throw new ApiException('session_not_found', '找不到该活动设备。', 404);
        $this->database->passport()->prepare('UPDATE access_tokens SET revoked_at=? WHERE session_id=? AND revoked_at IS NULL')->execute([time(), $sessionId]);
        $this->audit('session_revoked', $userId, ['sessionId' => $sessionId]);
    }

    public function logout(array $auth): void
    {
        $this->revokeSession($auth['id'], $auth['session_id']);
    }

    public function requestDeletion(array $auth, string $password): int
    {
        if (!password_verify($password, $auth['password_hash'])) throw new ApiException('invalid_credentials', '密码不正确。', 401);
        $at = time() + $this->config->get('deleteGrace');
        $this->database->passport()->prepare("UPDATE users SET status='pending_delete', deletion_at=?, updated_at=? WHERE id=?")->execute([$at, time(), $auth['id']]);
        $this->revokeUserSessions($auth['id']);
        $this->audit('deletion_requested', $auth['id'], ['deletionAt' => $at]);
        return $at;
    }

    public function cancelDeletion(array $auth): void
    {
        $this->database->passport()->prepare("UPDATE users SET status='active', deletion_at=NULL, updated_at=? WHERE id=?")->execute([time(), $auth['id']]);
        $this->audit('deletion_cancelled', $auth['id']);
    }

    public function createAuthorizationCode(array $auth, array $query): string
    {
        $clientId = $this->validateClientId($query['client_id'] ?? '');
        $redirectUri = (string) ($query['redirect_uri'] ?? '');
        $challenge = (string) ($query['code_challenge'] ?? '');
        if (($query['response_type'] ?? '') !== 'code' || ($query['code_challenge_method'] ?? '') !== 'S256') throw new ApiException('invalid_oauth_request', '仅支持授权码和 PKCE S256。');
        if (!$this->validRedirect($clientId, $redirectUri)) throw new ApiException('invalid_redirect_uri', '回调地址未登记。');
        if (!preg_match('/^[A-Za-z0-9_-]{43,128}$/', $challenge)) throw new ApiException('invalid_code_challenge', 'PKCE 参数无效。');
        $code = $this->token();
        $scopes = $this->clientScopes($clientId);
        $this->database->passport()->prepare('INSERT INTO oauth_codes (code_hash,user_id,client_id,redirect_uri,code_challenge,scopes,expires_at) VALUES (?,?,?,?,?,?,?)')->execute([$this->secretHash($code), $auth['id'], $clientId, $redirectUri, $challenge, $scopes, time() + $this->config->get('oauthCodeTtl')]);
        return $redirectUri . (str_contains($redirectUri, '?') ? '&' : '?') . http_build_query(['code' => $code, 'state' => (string) ($query['state'] ?? '')]);
    }

    public function exchangeAuthorizationCode(array $input): array
    {
        $code = (string) ($input['code'] ?? '');
        $clientId = $this->validateClientId($input['clientId'] ?? '');
        $redirectUri = (string) ($input['redirectUri'] ?? '');
        $verifier = (string) ($input['codeVerifier'] ?? '');
        $pdo = $this->database->passport();
        $codeHash = $this->secretHash($code);
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare('SELECT * FROM oauth_codes WHERE code_hash=?');
            $stmt->execute([$codeHash]);
            $row = $stmt->fetch();
            $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
            if (!$row || $row['used_at'] || (int) $row['expires_at'] < time() || $row['client_id'] !== $clientId || $row['redirect_uri'] !== $redirectUri || !hash_equals($row['code_challenge'], $challenge)) {
                throw new ApiException('invalid_authorization_code', '授权码无效或已使用。', 401);
            }
            $used = $pdo->prepare('UPDATE oauth_codes SET used_at=? WHERE code_hash=? AND used_at IS NULL');
            $used->execute([time(), $codeHash]);
            if ($used->rowCount() !== 1) throw new ApiException('invalid_authorization_code', '授权码无效或已使用。', 401);
            $result = $this->createSession($row['user_id'], $this->validateDeviceId($input['deviceId'] ?? 'browser'), $this->cleanDeviceName($input['deviceName'] ?? '浏览器'), $clientId, $row['scopes'], false);
            $pdo->commit();
            return $result;
        } catch (\Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
    }

    public function publicUser(string $userId): array
    {
        $stmt = $this->database->passport()->prepare('SELECT id, username, status, deletion_at deletionAt, created_at createdAt FROM users WHERE id=?');
        $stmt->execute([$userId]);
        $user = $stmt->fetch();
        if (!$user) throw new ApiException('account_not_found', '账号不存在。', 404);
        return $user;
    }

    private function createSession(string $userId, string $deviceId, string $deviceName, string $clientId, string $scopes, bool $withSso): array
    {
        $pdo = $this->database->passport();
        $existing = $pdo->prepare('SELECT id FROM sessions WHERE user_id=? AND device_id=? AND client_id=?');
        $existing->execute([$userId, $deviceId, $clientId]);
        $existingId = $existing->fetchColumn();
        $knownDevice = $pdo->prepare('SELECT 1 FROM sessions WHERE user_id=? AND device_id=? AND revoked_at IS NULL LIMIT 1');
        $knownDevice->execute([$userId, $deviceId]);
        $active = $pdo->prepare('SELECT COUNT(DISTINCT device_id) FROM sessions WHERE user_id=? AND revoked_at IS NULL');
        $active->execute([$userId]);
        if (!$existingId && !$knownDevice->fetchColumn() && (int) $active->fetchColumn() >= $this->config->get('maxDevices')) throw new ApiException('device_limit', '活动设备已达 10 台，请先下线旧设备。', 409);

        $sessionId = $existingId ?: $this->id();
        $familyId = $this->id();
        $refresh = $this->token();
        $sso = $withSso ? $this->token() : null;
        $csrf = $this->token(18);
        $now = time();
        if ($existingId) {
            $pdo->prepare('UPDATE access_tokens SET revoked_at=? WHERE session_id=? AND revoked_at IS NULL')->execute([$now, $sessionId]);
            $pdo->prepare('UPDATE sessions SET family_id=?,device_name=?,scopes=?,refresh_hash=?,refresh_expires_at=?,csrf_token=?,sso_hash=?,sso_expires_at=?,last_used_at=?,revoked_at=NULL WHERE id=?')->execute([$familyId,$deviceName,$scopes,$this->secretHash($refresh),$now+$this->config->get('refreshTtl'),$csrf,$sso ? $this->secretHash($sso) : null,$sso ? $now+$this->config->get('ssoTtl') : null,$now,$sessionId]);
        } else {
            $pdo->prepare('INSERT INTO sessions (id,family_id,user_id,device_id,device_name,client_id,scopes,refresh_hash,refresh_expires_at,csrf_token,sso_hash,sso_expires_at,created_at,last_used_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute([$sessionId,$familyId,$userId,$deviceId,$deviceName,$clientId,$scopes,$this->secretHash($refresh),$now+$this->config->get('refreshTtl'),$csrf,$sso ? $this->secretHash($sso) : null,$sso ? $now+$this->config->get('ssoTtl') : null,$now,$now]);
        }
        $this->observeSession($sessionId, $now);
        return $this->issueAccessToken($sessionId, $userId, $scopes) + [
            'refreshToken' => $refresh,
            'refreshExpiresAt' => $now + $this->config->get('refreshTtl'),
            'ssoToken' => $sso,
            'ssoExpiresAt' => $sso ? $now + $this->config->get('ssoTtl') : null,
            'csrfToken' => $csrf,
            'sessionId' => $sessionId,
        ];
    }

    private function issueAccessToken(string $sessionId, string $userId, string $scopes): array
    {
        $token = $this->token();
        $expires = time() + $this->config->get('accessTtl');
        $this->database->passport()->prepare('INSERT INTO access_tokens (token_hash,session_id,user_id,scopes,expires_at,created_at) VALUES (?,?,?,?,?,?)')->execute([$this->secretHash($token),$sessionId,$userId,$scopes,$expires,time()]);
        return ['accessToken' => $token, 'accessExpiresAt' => $expires, 'scopes' => explode(' ', $scopes)];
    }

    private function clientScopes(string $clientId): string
    {
        return match ($clientId) {
            'words-web' => 'words:read words:write account',
            'mt-web' => 'mt:read mt:write account',
            'reading-web' => 'reading:read reading:write account',
            'plan-web' => 'plan:read plan:write account',
            'navistudy-wechat' => 'words:read words:write mt:read mt:write reading:read reading:write plan:read plan:write account',
            'study-web' => 'words:read mt:read reading:read plan:read plan:write account',
            default => throw new ApiException('invalid_client', '客户端未登记。', 400),
        };
    }

    private function validateClientId(string $value): string
    {
        $this->clientScopes($value);
        return $value;
    }

    private function validRedirect(string $clientId, string $uri): bool
    {
        $allowed = [
            'words-web' => ['https://words.example.test/navistudy-callback.html', 'https://study.example.test/words/navistudy-callback.html', 'http://127.0.0.1:8081/navistudy-callback.html'],
            'mt-web' => ['https://mt.example.test/navistudy-callback.html', 'https://study.example.test/mt/navistudy-callback.html', 'http://127.0.0.1:5173/navistudy-callback.html'],
            'reading-web' => ['https://study.example.test/reading/navistudy-callback.html', 'http://127.0.0.1:8082/navistudy-callback.html'],
            'plan-web' => ['https://study.example.test/naviplan/navistudy-callback.html', 'http://127.0.0.1:5173/navistudy-callback.html'],
        ];
        return in_array($uri, $allowed[$clientId] ?? [], true);
    }

    private function validateUsername(mixed $value, bool $allowLegacyShort = false): string
    {
        $username = trim((string) $value);
        $length = mb_strlen($username, 'UTF-8');
        $minimum = $allowLegacyShort ? 1 : 3;
        if ($length < $minimum || $length > 40 || !preg_match('/^[\p{L}\p{N}_-]+$/u', $username)) throw new ApiException('invalid_username', '用户名需为 3-40 位中英文、数字、下划线或短横线。');
        return $username;
    }

    private function validatePassword(mixed $value, string $username): string
    {
        $password = (string) $value;
        $length = mb_strlen($password, 'UTF-8');
        if ($length < 6 || $length > 128) throw new ApiException('weak_password', '密码长度需为 6-128 个字符。');
        $lower = mb_strtolower($password, 'UTF-8');
        if (in_array($lower, self::COMMON_PASSWORDS, true) || $lower === mb_strtolower($username, 'UTF-8') || preg_match('/^(.)\1{5,}$/us', $password)) throw new ApiException('weak_password', '请使用更难猜的密码。');
        return $password;
    }

    private function validateDeviceId(mixed $value): string
    {
        $id = trim((string) $value);
        if (!preg_match('/^[A-Za-z0-9._:-]{3,128}$/', $id)) throw new ApiException('invalid_device', '设备标识无效。');
        return $id;
    }

    private function cleanDeviceName(mixed $value): string
    {
        $name = trim(strip_tags((string) $value));
        if ($name === '') $name = '未命名设备';
        return mb_substr($name, 0, 80, 'UTF-8');
    }

    private function usernameKey(string $username): string { return mb_strtolower(trim($username), 'UTF-8'); }
    private function normalizeRecoveryCode(string $code): string { return strtolower((string) preg_replace('/[^a-fA-F0-9]/', '', $code)); }
    private function recoveryCode(): string { return implode('-', str_split(bin2hex(random_bytes(16)), 8)); }
    private function recoveryHash(string $code): string { return $this->secretHash($this->normalizeRecoveryCode($code)); }
    private function token(int $bytes = 32): string { return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '='); }
    private function secretHash(string $value): string { return hash('sha256', $value); }
    private function id(): string { return bin2hex(random_bytes(16)); }
    private function hasScope(string $scopes, string $scope): bool { return in_array($scope, preg_split('/\s+/', trim($scopes)) ?: [], true); }

    private function revokeFamily(string $familyId): void
    {
        $pdo = $this->database->passport();
        $now = time();
        $ids = $pdo->prepare('SELECT id FROM sessions WHERE family_id=?');
        $ids->execute([$familyId]);
        foreach ($ids->fetchAll(PDO::FETCH_COLUMN) as $id) $pdo->prepare('UPDATE access_tokens SET revoked_at=? WHERE session_id=? AND revoked_at IS NULL')->execute([$now,$id]);
        $pdo->prepare('UPDATE sessions SET revoked_at=? WHERE family_id=? AND revoked_at IS NULL')->execute([$now,$familyId]);
    }

    private function revokeUserSessions(string $userId, ?string $except = null): void
    {
        $pdo = $this->database->passport();
        $now = time();
        if ($except) {
            $pdo->prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND id<>? AND revoked_at IS NULL')->execute([$now,$userId,$except]);
            $pdo->prepare('UPDATE access_tokens SET revoked_at=? WHERE user_id=? AND session_id<>? AND revoked_at IS NULL')->execute([$now,$userId,$except]);
        } else {
            $pdo->prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL')->execute([$now,$userId]);
            $pdo->prepare('UPDATE access_tokens SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL')->execute([$now,$userId]);
        }
    }

    private function enforceRateLimit(string $bucket): void
    {
        $stmt = $this->database->passport()->prepare('SELECT blocked_until FROM login_attempts WHERE bucket=?');
        $stmt->execute([$bucket]);
        $until = (int) ($stmt->fetchColumn() ?: 0);
        if ($until > time()) throw new ApiException('rate_limited', '尝试次数过多，请稍后再试。', 429);
    }

    private function recordLoginFailure(string $bucket): void
    {
        $pdo = $this->database->passport();
        $stmt = $pdo->prepare('SELECT failures,first_at FROM login_attempts WHERE bucket=?');
        $stmt->execute([$bucket]);
        $row = $stmt->fetch();
        $now = time();
        $failures = $row && $now - (int) $row['first_at'] < 3600 ? (int) $row['failures'] + 1 : 1;
        $first = $row && $now - (int) $row['first_at'] < 3600 ? (int) $row['first_at'] : $now;
        $delay = $failures < 5 ? 0 : min(900, 2 ** min(10, $failures - 4));
        $update = $pdo->prepare('UPDATE login_attempts SET failures=?,first_at=?,blocked_until=? WHERE bucket=?');
        $update->execute([$failures,$first,$now+$delay,$bucket]);
        if ($update->rowCount() === 0) {
            $insert = $pdo->prepare('INSERT OR IGNORE INTO login_attempts(bucket,failures,first_at,blocked_until) VALUES(?,?,?,?)');
            $insert->execute([$bucket,$failures,$first,$now+$delay]);
            if ($insert->rowCount() === 0) $update->execute([$failures,$first,$now+$delay,$bucket]);
        }
    }

    private function clearLoginFailures(string $bucket): void { $this->database->passport()->prepare('DELETE FROM login_attempts WHERE bucket=?')->execute([$bucket]); }

    private function touchSession(string $sessionId): void
    {
        $now = time();
        $stmt = $this->database->passport()->prepare('UPDATE sessions SET last_used_at=? WHERE id=? AND last_used_at<?');
        $stmt->execute([$now, $sessionId, $now - 60]);
        if ($stmt->rowCount() > 0) $this->observeSession($sessionId, $now);
    }

    private function observeSession(string $sessionId, int $now): void
    {
        $pdo = $this->database->passport();
        $ip = Http::clientIp();
        $agent = trim((string) (Http::header('User-Agent') ?? '未知客户端'));
        $agent = mb_substr($agent === '' ? '未知客户端' : $agent, 0, 240, 'UTF-8');
        $insert = $pdo->prepare('INSERT OR IGNORE INTO session_observations(session_id,first_ip,last_ip,user_agent,first_seen_at,last_seen_at) VALUES(?,?,?,?,?,?)');
        $insert->execute([$sessionId, $ip, $ip, $agent, $now, $now]);
        $pdo->prepare('UPDATE session_observations SET last_ip=?,user_agent=?,last_seen_at=? WHERE session_id=?')->execute([$ip, $agent, $now, $sessionId]);
    }

    private function audit(string $event, ?string $userId, array $details = []): void
    {
        $this->database->passport()->prepare('INSERT INTO audit_log(request_id,user_id,event,ip_prefix,details_json,created_at) VALUES(?,?,?,?,?,?)')->execute([$_SERVER['NAVISTUDY_REQUEST_ID'] ?? 'internal',$userId,$event,Http::clientIpPrefix(),json_encode($details, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),time()]);
    }
}
