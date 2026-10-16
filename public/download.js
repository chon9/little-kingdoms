import {localize} from './i18n.js';
localize();
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
