const KEY='little-kingdoms-audio-v1';
const defaults={music:0.35,effects:0.55,cutins:true,voice:false,muted:false};
let saved;try{saved=JSON.parse(localStorage.getItem(KEY));}catch{}
export const audioSettings={...defaults};
for(const key of ['music','effects'])if(Number.isFinite(saved?.[key]))audioSettings[key]=Math.max(0,Math.min(1,saved[key]));
for(const key of ['cutins','voice','muted'])if(typeof saved?.[key]==='boolean')audioSettings[key]=saved[key];
const music=new Audio('/assets/river-oath.mp3');music.loop=true;music.preload='none';music.volume=audioSettings.music;
music.id='game-music';music.hidden=true;document.body.append(music);
let unlocked=false,context;
export function saveAudio(){try{localStorage.setItem(KEY,JSON.stringify(audioSettings));}catch{}syncMusic();}
export function syncMusic(){music.volume=audioSettings.music;if(unlocked&&!document.hidden&&!audioSettings.muted&&audioSettings.music>0)music.play().catch(()=>{});else music.pause();}
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
  speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(line);u.lang='en-US';u.rate=1.04;u.volume=audioSettings.effects;music.volume=audioSettings.music*.4;u.onend=u.onerror=syncMusic;speechSynthesis.speak(u);
}
document.addEventListener('pointerdown',unlockAudio,{once:true});document.addEventListener('keydown',unlockAudio,{once:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&'speechSynthesis'in window)speechSynthesis.cancel();syncMusic();});
