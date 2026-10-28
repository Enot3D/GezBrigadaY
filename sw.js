const CACHE='brigada-shell-v20';
const ASSETS=['./manifest.json?v=16','./icon-180.png','./','./index.html','./styles.css?v=19','./app.js?v=20','./push.js?v=19','https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js','https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js','https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('brigada-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
// Always check the network for navigation and app assets; cache is an offline fallback.
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 const local=url.origin===self.location.origin&&url.pathname.startsWith(new URL(self.registration.scope).pathname);
 if(!local)return;
 if(request.mode==='navigate'||['.js','.css','.html','.json'].some(ext=>url.pathname.endsWith(ext))){
  event.respondWith(fetch(request,{cache:'no-store'}).then(response=>{
   if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)));}
   return response;
  }).catch(async()=>await caches.match(request)||await caches.match('./index.html')));
 }
});
self.addEventListener('push',event=>{event.waitUntil((async()=>{let data={};try{data=event.data?.json()||{};}catch{}await self.registration.showNotification(data.title||'Бригада · новое задание',{body:data.body||'Откройте задания по станкам',tag:data.tag||'brigada-task',icon:'./icon-180.png',data:{url:'https://enot3d.github.io/GezBrigadaY/'}});})());});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const url='https://enot3d.github.io/GezBrigadaY/';const windows=await clients.matchAll({type:'window',includeUncontrolled:true});const existing=windows.find(client=>client.url.startsWith(url));if(existing){existing.postMessage({type:'OPEN_TASKS'});await existing.focus();}else await clients.openWindow(url+'#tasks');})());});
