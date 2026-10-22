(() => {
  const QUEUE_KEY = 'navi_analytics_queue_v1';
  const VISITOR_KEY = 'navi_analytics_visitor_v1';
  const visitorId = localStorage.getItem(VISITOR_KEY) || (() => {
    const value = 'visitor-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2));
    localStorage.setItem(VISITOR_KEY, value);
    return value;
  })();
  let timer = 0;
  function inferredProduct() {
    const host = location.hostname;
    const path = location.pathname;
    if (host.startsWith('words.') || path.startsWith('/words/')) return 'words';
    if (host.startsWith('mt.') || path.startsWith('/mt/')) return 'mt';
    if (path.startsWith('/reading/')) return 'reading';
    if (path.startsWith('/naviplan/')) return 'plan';
    if (path.startsWith('/tools/')) return 'tools';
    return 'study';
  }
  const product = document.currentScript?.dataset.analyticsProduct || document.body?.dataset.analyticsProduct || inferredProduct();
  const apiBase = document.body?.dataset.analyticsApiBase || (() => {
    const path = location.pathname;
    const host = location.hostname;
    if (host.startsWith('words.') || host.startsWith('mt.')) return '/navistudy-api';
    if (path.startsWith('/words/')) return '/words/navistudy-api';
    if (path.startsWith('/mt/')) return '/mt/navistudy-api';
    if (path.startsWith('/reading/')) return '/reading/navistudy-api';
    if (path.startsWith('/naviplan/')) return '/naviplan/navistudy-api';
    return '/api/v1';
  })();
  function readQueue() { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; } }
  function writeQueue(value) { localStorage.setItem(QUEUE_KEY, JSON.stringify(value.slice(-200))); }
  function eventId() { return 'evt-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2)); }
  async function flush() {
    const queue = readQueue();
    if (!queue.length || !navigator.onLine) return;
    try {
      const endpoint = apiBase.endsWith('/api/v1') ? apiBase + '/analytics/events' : apiBase + '/api/v1/analytics/events';
      const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ platform: 'web', visitorId, events: queue.slice(0, 50) }) });
      if (!response.ok) return;
      writeQueue(queue.slice(50));
    } catch {}
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(flush, 800); }
  function track(name, data = {}) {
    const event = { eventId: eventId(), name, product: data.product || product, itemId: data.itemId || undefined, value: Number.isFinite(data.value) ? data.value : undefined, metadata: data.metadata || {}, occurredAt: Math.floor(Date.now() / 1000) };
    const queue = readQueue(); queue.push(event); writeQueue(queue); schedule(); return event;
  }
  window.NaviAnalytics = { track, flush };
  window.addEventListener('navi:track', (event) => { if (event.detail?.name) track(event.detail.name, event.detail); });
  if (product === 'tools') {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const response = await originalFetch(input, init);
      try {
        const url = new URL(typeof input === 'string' ? input : input.url, location.href);
        const method = String(init.method || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
        if (response.ok && method === 'POST' && /\/tools\/api\/availability\/sessions\/?$/.test(url.pathname)) {
          const payload = await response.clone().json();
          track('tool_created', { product: 'tools', itemId: payload.id });
        } else if (response.ok && method === 'POST' && /\/tools\/api\/availability\/sessions\/[^/]+\/responses\/?$/.test(url.pathname)) {
          const match = url.pathname.match(/\/sessions\/([^/]+)\/responses\/?$/);
          track('tool_response', { product: 'tools', itemId: match ? decodeURIComponent(match[1]) : undefined });
        }
      } catch {}
      return response;
    };
  }
  if (product === 'study') {
    addEventListener('click', (event) => {
      const link = event.target.closest?.('a[href]');
      if (!link) return;
      const target = new URL(link.href, location.href);
      const nextProduct = target.pathname.startsWith('/words/') ? 'words'
        : target.pathname.startsWith('/mt/') ? 'mt'
          : target.pathname.startsWith('/reading/') ? 'reading'
            : target.pathname.startsWith('/naviplan/') ? 'plan'
              : target.pathname.startsWith('/tools/') ? 'tools' : '';
      if (nextProduct) track('product_open', { product: nextProduct });
    });
  }
  track('page_view', { product, metadata: { path: location.pathname } });
  addEventListener('online', flush); addEventListener('pagehide', flush);
})();
