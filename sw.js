const CACHE='noor-v2.5.85-staging-profile-fix2';
const IMAGE_CACHE='noor-images-v1';
const SHELL=['/','/index.html','/manifest.webmanifest','/assets/css/app.css?v=2.5.85','/assets/js/app.js?v=2.5.85-staging-profile-fix2','/assets/icons/logo-noor-horizontal.png','/assets/icons/icon-192.png','/assets/icons/icon-512.png','/assets/icons/apple-touch-icon.png','/assets/icons/favicon-64.png','/assets/icons/favicon-32.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>{}))});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('noor-')&&k!==CACHE&&k!==IMAGE_CACHE)await caches.delete(k);await self.clients.claim()})())});
async function networkFirst(req){try{const fresh=await fetch(req,{cache:'no-store'});if(fresh&&fresh.ok){const c=await caches.open(CACHE);c.put(req,fresh.clone()).catch(()=>{})}return fresh}catch(e){const cached=await caches.match(req);if(cached)return cached;if(req.mode==='navigate'){const shell=await caches.match('/index.html');if(shell)return shell}throw e}}
async function cacheFirst(req,cacheName=CACHE){const cached=await caches.match(req);if(cached)return cached;const fresh=await fetch(req);if(fresh&&(fresh.ok||fresh.type==='opaque')){const c=await caches.open(cacheName);c.put(req,fresh.clone()).catch(()=>{})}return fresh}
async function staleWhileRevalidate(req){const cache=await caches.open(IMAGE_CACHE);const cached=await cache.match(req);const update=fetch(req).then(res=>{if(res&&(res.ok||res.type==='opaque'))cache.put(req,res.clone()).catch(()=>{});return res}).catch(()=>null);if(cached){update.catch(()=>{});return cached}const fresh=await update;if(fresh)return fresh;throw new Error('Immagine non disponibile')}
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);
  if(e.request.destination==='image'){e.respondWith(staleWhileRevalidate(e.request));return}
  if(u.origin===self.location.origin){if(e.request.mode==='navigate'||/\.(?:js|css|html|webmanifest)$/.test(u.pathname)){e.respondWith(networkFirst(e.request));return}e.respondWith(cacheFirst(e.request));return}
  if(u.hostname==='www.gstatic.com'){e.respondWith(cacheFirst(e.request));return}
});
