import type { CourseOverride, PassportSession, PlanPassportSyncResponse, PlanSnapshot } from "./types";

export type LoginPreloadResponse = {
  clientId: string;
  execution: string | null;
  captchaRequired: boolean;
  captcha: { captchaId: string; imageUrl: string } | null;
};

const jsonHeaders = { "Content-Type": "application/json" };
const base = import.meta.env.BASE_URL;
const passportBase = `${base}navistudy-api/api/v1`;
const planApiBase = `${base}api`;
const passportClientId = "plan-web";
const oauthStorage = {
  verifier: "navi_plan_pkce_verifier",
  state: "navi_plan_oauth_state",
  returnTo: "navi_plan_oauth_return"
};

export class CaptchaChallenge extends Error {
  constructor(public readonly challenge: LoginPreloadResponse) {
    super("北航统一认证需要验证码，请输入后再次导入");
    this.name = "CaptchaChallenge";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", cache: "no-store", ...init });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 422 && body?.captchaRequired && body?.clientId) throw new CaptchaChallenge(body as LoginPreloadResponse);
    throw new Error(body?.error?.message ?? body?.message ?? body?.code ?? `请求失败：${response.status}`);
  }
  return body as T;
}

function csrfFromCookie() {
  const match = document.cookie.match(/(?:^|;\s*)(?:navi_plan_csrf|navi_csrf)=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export function loadPassportSession(): Promise<PassportSession> {
  return request<PassportSession>(`${passportBase}/account`);
}

export function loadPlanPassportSync(): Promise<PlanPassportSyncResponse> {
  return request<PlanPassportSyncResponse>(`${passportBase}/sync/plan`);
}

export function preloadBuaa(): Promise<LoginPreloadResponse> {
  return request<LoginPreloadResponse>(`${planApiBase}/import/preload`, { method: "POST" });
}

export function importPlan(credentials: { username: string; password: string; captcha?: string | null; clientId?: string | null; execution?: string | null }): Promise<PlanSnapshot> {
  return request<PlanSnapshot>(`${planApiBase}/import/run`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(credentials) });
}

export function evaluatePlan(snapshot: PlanSnapshot, manualCorrections: Record<string, CourseOverride>): Promise<PlanSnapshot> {
  return request<PlanSnapshot>(`${planApiBase}/evaluate`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ snapshot, manualCorrections })
  });
}

export function savePlanPassportSync(snapshot: PlanSnapshot, baseRevision: number, csrfToken?: string): Promise<PlanPassportSyncResponse> {
  const mutationId = `plan-web-${Date.now()}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  return request<PlanPassportSyncResponse>(`${passportBase}/sync/plan`, {
    method: "POST",
    headers: { ...jsonHeaders, "X-CSRF-Token": csrfToken || csrfFromCookie() },
    body: JSON.stringify({
      deviceId: "plan-web",
      baseRevision,
      schemaVersion: 1,
      mutations: [{ mutationId, type: "merge_snapshot", data: snapshot }]
    })
  });
}

function randomId(prefix: string) {
  const suffix = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function passportDeviceId() {
  const existing = localStorage.getItem("navi_device_id");
  if (existing) return existing;
  const next = randomId("web");
  localStorage.setItem("navi_device_id", next);
  return next;
}

async function pkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function passportRedirectUri() {
  return new URL(`${base}navistudy-callback.html`, window.location.origin).toString();
}

async function waitForServiceWorkerActivation() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration(base);
    if (!registration) return;
    await registration.update();
    const worker = registration.installing ?? registration.waiting;
    if (!worker || worker.state === "activated") return;
    await Promise.race([
      new Promise<void>((resolve) => {
        worker.addEventListener("statechange", () => {
          if (worker.state === "activated" || worker.state === "redundant") resolve();
        });
      }),
      new Promise<void>((resolve) => window.setTimeout(resolve, 2500))
    ]);
  } catch {
    // Authentication remains available when service workers are unsupported or temporarily offline.
  }
}

export async function passportLoginUrl() {
  await waitForServiceWorkerActivation();
  const verifier = `${randomId("pkce")}${randomId("v")}`;
  const state = randomId("state");
  sessionStorage.setItem(oauthStorage.verifier, verifier);
  sessionStorage.setItem(oauthStorage.state, state);
  sessionStorage.setItem(oauthStorage.returnTo, window.location.href);
  const query = new URLSearchParams({
    response_type: "code",
    client_id: passportClientId,
    redirect_uri: passportRedirectUri(),
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: "S256",
    state
  });
  return new URL(`/oauth/authorize?${query}`, window.location.origin).toString();
}

function safePassportReturn(value: string | null) {
  const fallback = new URL(base, window.location.origin).toString();
  if (!value) return fallback;
  try {
    const target = new URL(value, window.location.origin);
    return target.origin === window.location.origin && target.pathname.startsWith(base) ? target.toString() : fallback;
  } catch {
    return fallback;
  }
}

export async function finishPassportLogin() {
  const query = new URLSearchParams(window.location.search);
  const code = query.get("code");
  if (!code) throw new Error("登录回调缺少授权码，请返回后重试。");
  const expectedState = sessionStorage.getItem(oauthStorage.state);
  if (!expectedState || query.get("state") !== expectedState) throw new Error("授权状态校验失败，请重新登录。");

  await request(new URL("/oauth/token", window.location.origin).toString(), {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      code,
      clientId: passportClientId,
      redirectUri: passportRedirectUri(),
      codeVerifier: sessionStorage.getItem(oauthStorage.verifier) ?? "",
      deviceId: passportDeviceId(),
      deviceName: navigator.platform || "浏览器"
    })
  });

  const returnTo = safePassportReturn(sessionStorage.getItem(oauthStorage.returnTo));
  Object.values(oauthStorage).forEach((key) => sessionStorage.removeItem(key));
  return returnTo;
}
