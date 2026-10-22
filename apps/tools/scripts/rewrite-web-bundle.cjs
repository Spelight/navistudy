const fs = require('fs');
const path = require('path');

const bundlePath = path.resolve(__dirname, '..', 'web', 'assets', 'availability.js');
let source = fs.readFileSync(bundlePath, 'utf8');
const start = source.lastIndexOf('const hh=');
const render = source.indexOf('Bm.createRoot', start);
if (start < 0 || render < 0) throw new Error('NaviTools bundle tail markers were not found');

const router = `async function bh(){if(!("serviceWorker"in navigator))return;const d=new URL("/tools/",window.location.origin).pathname;try{const b=await navigator.serviceWorker.getRegistrations();if(await Promise.all(b.filter(p=>new URL(p.scope).pathname.startsWith(d)).map(p=>p.unregister())),"caches"in window){const p=await caches.keys();await Promise.all(p.filter(o=>o.includes("navitools")||o.includes("workbox-precache")).map(o=>caches.delete(o)))}}catch(b){console.warn("NaviTools service worker cleanup failed",b)}}bh();function gh(){const d=new URL("/tools/",window.location.origin).pathname.replace(/\\/+$/,""),p=(window.location.pathname.startsWith(d)?window.location.pathname.slice(d.length)||"/":window.location.pathname).replace(/\\/+$/,"")||"/";if(p==="/availability/admin")return f.jsx(mh,{});if(p.startsWith("/availability/result/")){const o=decodeURIComponent(p.slice(21));if(o)return f.jsx(vh,{sessionId:o})}if(p.startsWith("/availability/")){const o=decodeURIComponent(p.slice(14));if(o&&o!=="admin")return f.jsx(yh,{sessionId:o})}return f.jsx(rh,{})}`;

source = source.slice(0, start) + router + source.slice(render);
fs.writeFileSync(bundlePath, source, 'utf8');
if (source.includes('App-YkDGmmZY.js') || /naviagenda/i.test(source)) {
  throw new Error('Retired NaviAgenda fallback remains in the NaviTools bundle');
}
console.log('NaviTools bundle no longer exposes the retired Agenda fallback');
