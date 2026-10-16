const CACHE='little-kingdoms-v2.5.1';
const COLLECTION_SHELL=['/cosmetics.js','/collection.js','/collection.css','/rankings.js','/rankings.css','/i18n.js','/i18n.css','/locales/zh-game.js','/locales/zh-rules.js','/locales/zh-collection.js','/manifest-zh-Hans.webmanifest','/assets/little-kingdoms-comic-rules-zh-Hans.pdf'];
const COLLECTION_ART=[...Array.from({length:30},(_,i)=>'/assets/cosmetics/c'+String(i+1).padStart(2,'0')+'.webp'),...Array.from({length:20},(_,i)=>'/assets/cosmetics/b'+String(i+1).padStart(2,'0')+'.webp')];
const SHELL=['/','/index.html','/styles.css','/app.js','/engine.js','/ai.js','/ai-worker.js','/progression.js','/audio.js','/music-library.js','/tutorial.html','/tutorial.css','/tutorial-model.js','/tutorial.js','/rulebook.js','/rulebook.css','/rulebook.html','/rulebook-reader.js','/client-config.js','/favicon.svg','/manifest.webmanifest','/assets/generals.webp','/assets/generals-shock.webp','/assets/generals-sad.webp','/assets/generals-unlock.webp','/assets/war-theme.mp3','/assets/creed-of-course.mp3','/assets/enemy-ship.mp3','/assets/asianoriental2.mp3','/assets/music-credits.txt','/assets/little-kingdoms-comic-rules.pdf','/assets/riverlands.webp','/assets/icon-192.png','/assets/icon-512.png','/assets/dm-sans.woff2','/assets/marcellus.woff2'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll([...SHELL,...COLLECTION_SHELL,...COLLECTION_ART])));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}return response;}).catch(()=>caches.match(event.request).then(cached=>cached||(event.request.mode==='navigate'?caches.match('/'):Response.error()))));
});
