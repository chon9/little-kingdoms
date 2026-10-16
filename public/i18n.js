import { messages as gameMessages, patterns as gamePatterns, htmlMessages as gameHTML } from './locales/zh-game.js';
import { messages as ruleMessages, patterns as rulePatterns, htmlMessages as ruleHTML } from './locales/zh-rules.js';
import { messages as collectionMessages, patterns as collectionPatterns, htmlMessages as collectionHTML } from './locales/zh-collection.js';
import { messages as steamMessages } from './locales/zh-steam.js';

export const LANGUAGE_KEY='little-kingdoms-language';
export const LANGUAGES=Object.freeze(['en','zh-Hans']);
const normalized=value=>String(value).replace(/\s+/g,' ').trim();
const htmlKey=value=>normalized(value).replace(/&amp;/g,'&').replace(/&nbsp;/g,' ');
const messages=new Map(Object.entries({...gameMessages,...ruleMessages,...collectionMessages,...steamMessages}).map(([key,value])=>[normalized(key),value]));
const htmlMessages=new Map(Object.entries({...gameHTML,...ruleHTML,...collectionHTML}).map(([key,value])=>[htmlKey(key),value]));
const genericPatterns=new Set(['^(.+) · (.+)$','^(.+), (.+)$','^(.+) & (.+)$']);
const patterns=[...gamePatterns,...rulePatterns,...collectionPatterns].filter(([source])=>!genericPatterns.has(source)).map(([source,replacement,options])=>({regex:new RegExp(source,'u'),replacement,raw:new Set(options?.raw||[])}));
let language='en';
try{const saved=globalThis.localStorage?.getItem(LANGUAGE_KEY),query=typeof location!=='undefined'?new URLSearchParams(location.search).get('lang'):null;language=LANGUAGES.includes(query)?query:LANGUAGES.includes(saved)?saved:typeof navigator!=='undefined'&&navigator.language?.toLowerCase().startsWith('zh')?'zh-Hans':'en';}catch{}
export function getLanguage(){return language;}

function translate(value,depth=0){
  const key=normalized(value);if(!key||depth>8)return value;
  if(messages.has(key))return messages.get(key);
  for(const {regex,replacement,raw} of patterns){
    const match=key.match(regex);if(!match)continue;
    return replacement.replace(/\$(\d+)/g,(_,index)=>raw.has(Number(index))?(match[Number(index)]||''):translate(match[Number(index)]||'',depth+1));
  }
  if(/^“[\s\S]+”$/.test(key))return '“'+translate(key.slice(1,-1),depth+1)+'”';
  for(const separator of [' · ',', ',': ',' & '])if(key.includes(separator)){
    const parts=key.split(separator),translated=parts.map(part=>translate(part,depth+1));
    if(translated.some((part,i)=>part!==parts[i]))return translated.join(separator===': '?'：':separator===', '?'，':separator===' & '?'与':' · ');
  }
  return value;
}
export function tr(value){return language==='zh-Hans'?translate(String(value)):String(value);}

const textSources=new WeakMap(),attributeSources=new WeakMap(),htmlSources=new WeakMap();
const skipSelector='script,style,code,pre,textarea,[data-user-content],[data-l10n-skip],.board-coordinates,.side-coordinates,#active-room-code,#room-code';
function sourceRecord(map,node,current){const previous=map.get(node);if(previous&&current===previous.rendered)return previous;return{source:current,rendered:current};}
function translateNode(node){
  if(node.parentElement?.closest(skipSelector))return;
  const record=sourceRecord(textSources,node,node.nodeValue),original=record.source,core=normalized(original);
  const translated=language==='zh-Hans'?translate(core):core;
  const output=translated===core?original:original.replace(/\S[\s\S]*\S|\S/,()=>translated);
  if(node.nodeValue!==output)node.nodeValue=output;
  record.rendered=output;textSources.set(node,record);
}
function translateAttributes(element){
  if(element.closest('[data-l10n-skip],[data-user-content]'))return;
  const records=attributeSources.get(element)||new Map();
  for(const name of ['aria-label','title','placeholder','alt'])if(element.hasAttribute(name)){
    const current=element.getAttribute(name),previous=records.get(name),record=previous&&current===previous.rendered?previous:{source:current,rendered:current};
    const output=tr(record.source);if(output!==current)element.setAttribute(name,output);record.rendered=output;records.set(name,record);
  }
  attributeSources.set(element,records);
}
function protectUserContent(root){
  root.querySelectorAll?.('.commander-summary-name strong,.rank-player>span:last-child,#active-room-code').forEach(el=>{
    if(el.matches('.rank-player>span:last-child')&&el.querySelector('small')){
      for(const node of [...el.childNodes])if(node.nodeType===3&&node.nodeValue.trim()){
        const span=document.createElement('span');span.dataset.userContent='';node.replaceWith(span);span.append(node);
      }
    }else el.dataset.userContent='';
  });
}
function synchronizeDownloads(root){
  root.querySelectorAll?.('a[href*="little-kingdoms-comic-rules"]').forEach(link=>{
    const next='/assets/little-kingdoms-comic-rules'+(language==='zh-Hans'?'-zh-Hans':'')+'.pdf';
    if(link.getAttribute('href')!==next)link.setAttribute('href',next);
  });
  const manifest=document.querySelector('link[rel="manifest"]'),href=language==='zh-Hans'?'/manifest-zh-Hans.webmanifest':'/manifest.webmanifest';
  if(manifest&&manifest.getAttribute('href')!==href)manifest.setAttribute('href',href);
}
let controlsReady=false,applying=false;
function controls(){
  const target=document.querySelector('.header-controls,.tutorial-header,.manual-actions');
  if(target&&!document.getElementById('language-switch')){
    const button=document.createElement('button');button.id='language-switch';button.className='language-switch';button.type='button';button.dataset.l10nSkip='';button.onclick=()=>setLanguage(language==='en'?'zh-Hans':'en');target.append(button);
  }
  const button=document.getElementById('language-switch');if(button){const label=language==='en'?'简':'EN',hint=language==='en'?'Switch to Simplified Chinese':'切换至英语';if(button.textContent!==label)button.textContent=label;if(button.getAttribute('aria-label')!==hint)button.setAttribute('aria-label',hint);if(button.title!==hint)button.title=hint;button.lang=language==='en'?'zh-Hans':'en';}
  const settings=document.querySelector('.settings-language-slot')||document.querySelector('.settings-list');
  if(settings&&!document.getElementById('language-select')){
    const label=document.createElement('label');label.className='language-setting';label.dataset.l10nSkip='';label.innerHTML='<span></span><select id="language-select" aria-label="Language / 语言"><option value="en">English</option><option value="zh-Hans">简体中文</option></select>';label.querySelector('select').onchange=e=>setLanguage(e.target.value);settings.prepend(label);
  }
  const select=document.getElementById('language-select');if(select){select.value=language;const label=language==='en'?'Language':'语言';if(select.previousElementSibling.textContent!==label)select.previousElementSibling.textContent=label;if(select.getAttribute('aria-label')!==label)select.setAttribute('aria-label',label);}
  controlsReady=true;
}
export function localize(root=globalThis.document){
  if(!root||applying)return;applying=true;
  try{
    controls();protectUserContent(root);
    const elements=root.querySelectorAll?.('*')||[];
    for(const element of elements){
      if(element.closest(skipSelector))continue;
      if(element.matches('p,h1,h2,h3,figcaption,li,.comic-note,.comic-bubble')){
        const current=element.innerHTML,record=sourceRecord(htmlSources,element,current),translated=language==='zh-Hans'?htmlMessages.get(htmlKey(record.source)):record.source;
        if(htmlMessages.has(htmlKey(record.source))){
          const output=translated??record.source;if(current!==output)element.innerHTML=output;record.rendered=output;htmlSources.set(element,record);
        }
      }
      translateAttributes(element);
    }
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode()))translateNode(node);
    synchronizeDownloads(root);
    const description=document.querySelector('meta[name="description"]');if(description){const records=attributeSources.get(description)||new Map(),current=description.content,previous=records.get('content'),record=previous&&current===previous.rendered?previous:{source:current,rendered:current};const output=tr(record.source);if(current!==output)description.content=output;record.rendered=output;records.set('content',record);attributeSources.set(description,records);}
    document.documentElement.lang=language;document.documentElement.dataset.languageReady=language;
  }finally{applying=false;}
}
export function setLanguage(next){
  if(!LANGUAGES.includes(next))return;language=next;try{localStorage.setItem(LANGUAGE_KEY,next);}catch{}
  if(typeof speechSynthesis!=='undefined')speechSynthesis.cancel();localize();
  globalThis.dispatchEvent?.(new CustomEvent('kingdoms-languagechange',{detail:{language}}));
}
export function untranslated(root=globalThis.document?.body){
  if(!root)return[];const result=[];const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
  while((node=walker.nextNode()))if(!node.parentElement?.closest(skipSelector)&&/[A-Za-z]{2,}/.test(node.nodeValue)&&node.parentElement?.getClientRects().length)result.push({text:node.nodeValue.trim(),tag:node.parentElement.tagName,id:node.parentElement.id});
  return result;
}
if(typeof document!=='undefined'){
  const boot=()=>{
    localize();let queued=false;
    new MutationObserver(records=>{if(!records.length||queued)return;queued=true;queueMicrotask(()=>{queued=false;localize();});}).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','title','placeholder','alt']});
    addEventListener('storage',e=>{if(e.key===LANGUAGE_KEY&&LANGUAGES.includes(e.newValue)){language=e.newValue;localize();}});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
}
