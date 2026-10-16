import { getLanguage, tr } from './i18n.js';
import { MUSIC_TRACKS, MUSIC_MODES, MusicQueue } from './music-library.js';
export { MUSIC_TRACKS } from './music-library.js';
const KEY='little-kingdoms-audio-v1';
const defaults={music:0.35,effects:0.55,cutins:true,voice:false,muted:false,track:MUSIC_TRACKS[0].id,musicMode:'rotation'};
let saved;try{saved=JSON.parse(localStorage.getItem(KEY));}catch{}
export const audioSettings={...defaults};
for(const key of ['music','effects'])if(Number.isFinite(saved?.[key]))audioSettings[key]=Math.max(0,Math.min(1,saved[key]));
for(const key of ['cutins','voice','muted'])if(typeof saved?.[key]==='boolean')audioSettings[key]=saved[key];
if(MUSIC_TRACKS.some(t=>t.id===saved?.track))audioSettings.track=saved.track;
if(MUSIC_MODES.includes(saved?.musicMode))audioSettings.musicMode=saved.musicMode;
if(saved?.track&&!MUSIC_TRACKS.some(t=>t.id===saved.track))try{localStorage.setItem(KEY,JSON.stringify(audioSettings));}catch{}
const queue=new MusicQueue(audioSettings.track,audioSettings.musicMode);
const music=new Audio(MUSIC_TRACKS.find(t=>t.id===audioSettings.track).file);music.loop=audioSettings.musicMode==='repeat';music.preload='none';music.volume=audioSettings.music;
music.id='game-music';music.hidden=true;document.body.append(music);
let unlocked=false,context,voiceActive=false,musicUnavailable=false;
export function currentMusic(){return MUSIC_TRACKS.find(t=>t.id===audioSettings.track)||MUSIC_TRACKS[0];}
function announceMusic(){window.dispatchEvent(new CustomEvent('kingdoms-musicchange',{detail:{track:currentMusic(),unavailable:musicUnavailable}}));}
export function saveAudio(){try{localStorage.setItem(KEY,JSON.stringify(audioSettings));}catch{}syncMusic();}
export function syncMusic(){
  queue.configure(audioSettings.track,audioSettings.musicMode);
  music.loop=queue.mode==='repeat';music.volume=audioSettings.music*(voiceActive ? .4 : 1);
  const track=currentMusic();
  if(music.getAttribute('src')!==track.file){music.pause();music.src=track.file;musicUnavailable=false;announceMusic();}
  if(unlocked&&!document.hidden&&!audioSettings.muted&&audioSettings.music>0)music.play().catch(()=>{});else music.pause();
}
export function chooseMusic(id){if(!MUSIC_TRACKS.some(t=>t.id===id))return;audioSettings.track=id;musicUnavailable=false;saveAudio();announceMusic();}
export function setMusicMode(mode){if(!MUSIC_MODES.includes(mode))return;audioSettings.musicMode=mode;saveAudio();announceMusic();}
export function nextMusic(){audioSettings.track=queue.next(true);musicUnavailable=false;saveAudio();announceMusic();}
music.addEventListener('ended',()=>{audioSettings.track=queue.next();music.currentTime=0;saveAudio();announceMusic();});
music.addEventListener('error',()=>{musicUnavailable=true;announceMusic();});
export function unlockAudio(){unlocked=true;syncMusic();}
export function effect(kind='place'){
  if(audioSettings.muted||!audioSettings.effects)return;
  try{context||=new(window.AudioContext||window.webkitAudioContext)();context.resume();
    const notes=kind==='win'?[392,493.88,587.33,783.99]:kind==='pass'?[293.66]:[440,659.25];
    notes.forEach((frequency,i)=>{const o=context.createOscillator(),g=context.createGain(),t=context.currentTime+i*.075;o.type='sine';o.frequency.value=frequency;g.gain.setValueAtTime(audioSettings.effects*.1,t);g.gain.exponentialRampToValueAtTime(.0001,t+.23);o.connect(g);g.connect(context.destination);o.start(t);o.stop(t+.25);});
  }catch{}
}
export function speak(line){
  if(!audioSettings.voice||audioSettings.muted||!('speechSynthesis'in window))return;
  speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(tr(line));u.lang=getLanguage()==='zh-Hans'?'zh-CN':'en-US';const voice=speechSynthesis.getVoices().find(v=>v.lang.toLowerCase().startsWith(getLanguage()==='zh-Hans'?'zh-cn':'en'));if(voice)u.voice=voice;u.rate=1.04;u.volume=audioSettings.effects;voiceActive=true;music.volume=audioSettings.music*.4;u.onend=u.onerror=()=>{voiceActive=false;syncMusic();};speechSynthesis.speak(u);
}
document.addEventListener('pointerdown',unlockAudio,{once:true});document.addEventListener('keydown',unlockAudio,{once:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if('speechSynthesis'in window)speechSynthesis.cancel();voiceActive=false;}syncMusic();});
window.addEventListener('kingdoms-languagechange',()=>{voiceActive=false;syncMusic();});
