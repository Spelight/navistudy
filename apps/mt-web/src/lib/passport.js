const BASE = location.pathname.startsWith("/mt/") ? "/mt/" : "/";
const API = `${BASE}navistudy-api`;

function randomId(prefix) {
  const value = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

function getDeviceId() {
  let value = localStorage.getItem("navi_device_id");
  if (!value) {
    value = randomId("web");
    localStorage.setItem("navi_device_id", value);
  }
  return value;
}

function csrf() {
  return decodeURIComponent((document.cookie.match(/(?:^|; )navi_mt_csrf=([^;]*)/) || [])[1] || "");
}

function identity(item) {
  if (item === null || typeof item !== "object") return String(item);
  if (item.key != null) return String(item.key);
  if (item.id != null) return String(item.id);
  if (item.uuid != null) return String(item.uuid);
  return JSON.stringify(item);
}

function prepareSnapshot(data, base) {
  const next = JSON.parse(JSON.stringify(data || {}));
  const previous = base && typeof base === "object" ? base : {};
  const sync = { tombstones: {}, entityUpdatedAt: {} };
  for (const kind of ["tombstones", "entityUpdatedAt"]) {
    for (const source of [previous._sync?.[kind], next._sync?.[kind]]) {
      if (!source || typeof source !== "object") continue;
      for (const [collection, values] of Object.entries(source)) sync[kind][collection] = { ...(sync[kind][collection] || {}), ...(values || {}) };
    }
  }
  const definitions = { favorites: "list", answers: "map", wrongbook: "map", mastered: "map", progressPositions: "map" };
  const now = Date.now();
  for (const [collection, shape] of Object.entries(definitions)) {
    if (!Object.prototype.hasOwnProperty.call(next, collection)) continue;
    const oldIds = new Set(shape === "list" ? (Array.isArray(previous[collection]) ? previous[collection].map(identity) : []) : Object.keys(previous[collection] || {}));
    const newIds = new Set(shape === "list" ? (Array.isArray(next[collection]) ? next[collection].map(identity) : []) : Object.keys(next[collection] || {}));
    sync.tombstones[collection] ||= {};
    sync.entityUpdatedAt[collection] ||= {};
    for (const id of oldIds) if (!newIds.has(id)) sync.tombstones[collection][id] = now;
    for (const id of newIds) if (!oldIds.has(id)) { sync.entityUpdatedAt[collection][id] = now; delete sync.tombstones[collection][id]; }
  }
  next._sync = sync;
  return next;
}

async function request(path, options = {}) {
  const init = { credentials: "same-origin", cache: "no-store", ...options };
  init.headers = { Accept: "application/json", ...(init.headers || {}) };
  if (init.body) init.headers["Content-Type"] = "application/json";
  if (init.method && init.method !== "GET" && csrf()) init.headers["X-CSRF-Token"] = csrf();
  let response = await fetch(API + path, init);
  if (response.status === 401 && path !== "/api/v1/auth/refresh") {
    const refreshed = await fetch(API + "/api/v1/auth/refresh", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf() }, body: "{}" });
    if (refreshed.ok) response = await fetch(API + path, init);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    const error = new Error(body?.error?.message || `HTTP ${response.status}`);
    error.code = body?.error?.code;
    throw error;
  }
  return body;
}

async function challenge(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function startPassportLogin() {
  const verifier = randomId("pkce") + randomId("v");
  const state = randomId("state");
  const redirectUri = location.origin + BASE + "navistudy-callback.html";
  sessionStorage.setItem("navi_pkce_verifier", verifier);
  sessionStorage.setItem("navi_oauth_state", state);
  sessionStorage.setItem("navi_oauth_return", location.href);
  const query = new URLSearchParams({ response_type: "code", client_id: "mt-web", redirect_uri: redirectUri, code_challenge: await challenge(verifier), code_challenge_method: "S256", state });
  location.assign(`https://study.example.test/oauth/authorize?${query}`);
}

export function createPassportSync({ getData, setData, onAccount, onStatus }) {
  const queueKey = "navi_sync_queue_mt";
  const metaKey = "navi_sync_meta_mt";
  let account = null;
  let timer;
  let running = false;
  let applying = false;
  let retry = 2000;
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const status = (value, message) => onStatus(value, message);
  const enqueue = (data) => {
    const queue = read(queueKey, []);
    const meta = read(metaKey, { revision: 0, initialized: false, lastSnapshot: null, lastLocalSnapshot: null });
    const prepared = prepareSnapshot(data, meta.lastLocalSnapshot || meta.lastSnapshot);
    queue.push({ mutationId: randomId("mutation"), type: "merge_snapshot", data: prepared });
    write(queueKey, queue.slice(-500));
    meta.lastLocalSnapshot = prepared;
    write(metaKey, meta);
  };

  async function initialize() {
    try {
      const result = await request("/api/v1/account");
      account = result.account;
      onAccount(account);
      const meta = read(metaKey, { revision: 0, initialized: false });
      if (!meta.initialized) {
        const local = getData();
        write(`navi_premerge_mt_${Date.now()}`, local);
        meta.initialized = true;
        write(metaKey, meta);
        enqueue(local);
      }
      await flush();
    } catch (error) {
      account = null;
      onAccount(null);
      status(navigator.onLine ? "local" : "offline", error.code === "authentication_required" ? "仅本机" : error.message);
    }
  }

  function markDirty() {
    if (applying) { applying = false; return; }
    if (!account) { status("local", "仅本机"); return; }
    clearTimeout(timer);
    status("syncing", "正在同步");
    timer = setTimeout(() => { enqueue(getData()); flush(); }, 1500);
  }

  async function flush() {
    if (running || !account) return;
    const queue = read(queueKey, []);
    if (!queue.length) { status("synced", "已同步"); return; }
    if (!navigator.onLine) { status("offline", "等待网络"); return; }
    running = true;
    status("syncing", "正在同步");
    const meta = read(metaKey, { revision: 0, initialized: true });
    try {
      const result = await request("/api/v1/sync/mt", { method: "POST", body: JSON.stringify({ deviceId: getDeviceId(), baseRevision: meta.revision || 0, schemaVersion: 1, mutations: queue.slice(0, 500) }) });
      applying = true;
      setData(result.document);
      meta.revision = result.revision;
      meta.lastSnapshot = result.document;
      const remaining = queue.slice(Math.min(queue.length, 500));
      if (!remaining.length) meta.lastLocalSnapshot = result.document;
      write(metaKey, meta);
      write(queueKey, remaining);
      retry = 2000;
      status("synced", "已同步");
      if (remaining.length) setTimeout(flush, 0);
    } catch {
      status(navigator.onLine ? "attention" : "offline", navigator.onLine ? "需要处理" : "等待网络");
      setTimeout(flush, retry);
      retry = Math.min(300000, retry * 2);
    } finally { running = false; }
  }

  async function signOut() {
    try { await request("/api/v1/auth/logout", { method: "POST", body: "{}" }); } catch {}
    account = null;
    onAccount(null);
    status("local", "仅本机");
  }

  addEventListener("online", flush);
  addEventListener("offline", () => status("offline", "等待网络"));
  addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  return { initialize, markDirty, flush, signOut };
}
