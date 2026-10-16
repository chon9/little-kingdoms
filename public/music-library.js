export const MUSIC_TRACKS=Object.freeze([
  {
    "id": "pb-545843",
    "title": "China Chinese Background Music",
    "originalTitle": "China Chinese Background Music",
    "author": "HitsLab",
    "authorUrl": "https://pixabay.com/music/china-chinese-china-chinese-background-music-545843/",
    "file": "/assets/music/pb-545843.mp3",
    "source": "https://pixabay.com/music/china-chinese-china-chinese-background-music-545843/",
    "duration": 70.4,
    "license": "Pixabay Content License",
    "licenseUrl": "https://pixabay.com/service/license-summary/"
  },
  {
    "id": "pb-489219",
    "title": "China Chinese Music",
    "originalTitle": "China Chinese Music",
    "author": "HitsLab",
    "authorUrl": "https://pixabay.com/music/china-china-chinese-music-489219/",
    "file": "/assets/music/pb-489219.mp3",
    "source": "https://pixabay.com/music/china-china-chinese-music-489219/",
    "duration": 65.541224,
    "license": "Pixabay Content License",
    "licenseUrl": "https://pixabay.com/service/license-summary/"
  },
  {
    "id": "pb-502069",
    "title": "Chinese China Music",
    "originalTitle": "Chinese China Music",
    "author": "HitsLab",
    "authorUrl": "https://pixabay.com/music/china-chinese-china-chinese-music-502069/",
    "file": "/assets/music/pb-502069.mp3",
    "source": "https://pixabay.com/music/china-chinese-china-chinese-music-502069/",
    "duration": 60.865306,
    "license": "Pixabay Content License",
    "licenseUrl": "https://pixabay.com/service/license-summary/"
  },
  {
    "id": "pb-390058",
    "title": "Mandarin Oriental",
    "originalTitle": "Mandarin Oriental",
    "author": "geoffharvey",
    "authorUrl": "https://pixabay.com/music/china-mandarin-oriental-390058/",
    "file": "/assets/music/pb-390058.mp3",
    "source": "https://pixabay.com/music/china-mandarin-oriental-390058/",
    "duration": 68.101224,
    "license": "Pixabay Content License",
    "licenseUrl": "https://pixabay.com/service/license-summary/"
  },
  {
    "id": "pb-155926",
    "title": "Shi · Recognition",
    "originalTitle": "Shi · Recognition",
    "author": "ET11LX",
    "authorUrl": "https://pixabay.com/music/china-chinese-ancient-style-music-love-et11lx-%E5%8F%A4%E9%A3%8E-%E6%8A%92%E6%83%85-%E8%AF%86-155926/",
    "file": "/assets/music/pb-155926.mp3",
    "source": "https://pixabay.com/music/china-chinese-ancient-style-music-love-et11lx-%E5%8F%A4%E9%A3%8E-%E6%8A%92%E6%83%85-%E8%AF%86-155926/",
    "duration": 48.117551,
    "license": "Pixabay Content License",
    "licenseUrl": "https://pixabay.com/service/license-summary/"
  },
  {
    "id": "pb-247345",
    "title": "Shi · Orchestral",
    "originalTitle": "Shi · Orchestral",
    "author": "ET11LX",
    "authorUrl": "https://pixabay.com/music/world-chinese-ancient-style-music-love-et%E5%8D%81%E4%B8%80lx-%E5%8F%A4%E9%A3%8E-%E6%8A%92%E6%83%85-%E8%AF%86%E4%B8%B0%E5%AF%8C%E9%85%8D%E5%99%A8%E6%8E%A8%E9%AB%98%E6%BD%AE%E7%89%88-247345/",
    "file": "/assets/music/pb-247345.mp3",
    "source": "https://pixabay.com/music/world-chinese-ancient-style-music-love-et%E5%8D%81%E4%B8%80lx-%E5%8F%A4%E9%A3%8E-%E6%8A%92%E6%83%85-%E8%AF%86%E4%B8%B0%E5%AF%8C%E9%85%8D%E5%99%A8%E6%8E%A8%E9%AB%98%E6%BD%AE%E7%89%88-247345/",
    "duration": 66.612245,
    "license": "Pixabay Content License",
    "licenseUrl": "https://pixabay.com/service/license-summary/"
  },
  {
    "id": "pb-155927",
    "title": "Ripple",
    "originalTitle": "Ripple",
    "author": "ET11LX",
    "authorUrl": "https://pixabay.com/music/china-ripple-chinese-ancient-style-music-romantic-love-et11lx-%E5%8F%A4%E9%A3%8E-%E6%8A%92%E6%83%85-%E6%B6%9F%E6%BC%AA-155927/",
    "file": "/assets/music/pb-155927.mp3",
    "source": "https://pixabay.com/music/china-ripple-chinese-ancient-style-music-romantic-love-et11lx-%E5%8F%A4%E9%A3%8E-%E6%8A%92%E6%83%85-%E6%B6%9F%E6%BC%AA-155927/",
    "duration": 59.115102,
    "license": "Pixabay Content License",
    "licenseUrl": "https://pixabay.com/service/license-summary/"
  }
].map(track=>Object.freeze(track)));
export const MUSIC_MODES=Object.freeze(['rotation','shuffle','repeat']);

// A shuffle bag visits every track once before starting another cycle.
// At a cycle boundary it cannot immediately repeat the last track.
export class MusicQueue{
  constructor(track=MUSIC_TRACKS[0].id,mode='rotation',random=Math.random){
    this.random=random;this.configure(track,mode);
  }
  configure(track,mode){
    const validTrack=MUSIC_TRACKS.some(t=>t.id===track)?track:MUSIC_TRACKS[0].id;
    const validMode=MUSIC_MODES.includes(mode)?mode:'rotation';
    if(this.track!==validTrack||this.mode!==validMode)this.remaining=null;
    this.track=validTrack;this.mode=validMode;
  }
  next(manual=false){
    if(this.mode==='repeat'&&!manual)return this.track;
    if(this.mode==='shuffle'){
      if(!this.remaining?.length){
        this.remaining=MUSIC_TRACKS.map(t=>t.id).filter(id=>this.remaining!==null||id!==this.track);
        for(let i=this.remaining.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.remaining[i],this.remaining[j]]=[this.remaining[j],this.remaining[i]];}
        if(this.remaining[0]===this.track)[this.remaining[0],this.remaining[1]]=[this.remaining[1],this.remaining[0]];
      }
      this.track=this.remaining.shift();
    }else this.track=MUSIC_TRACKS[(MUSIC_TRACKS.findIndex(t=>t.id===this.track)+1)%MUSIC_TRACKS.length].id;
    return this.track;
  }
}
