export const MUSIC_TRACKS=Object.freeze([
  {
    "id": "gq-02",
    "title": "Orchestral Action",
    "originalTitle": "02 - Cinematic Orchestral Action Trailer",
    "author": "Gregor Quendel",
    "authorUrl": "https://www.gregorquendel.com",
    "file": "/assets/music/gq-02.mp3",
    "source": "https://opengameart.org/content/free-cinematic-trailer-music",
    "duration": 64.835918,
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/"
  },
  {
    "id": "gq-04",
    "title": "Action Percussion",
    "originalTitle": "04 - Cinematic Action Percussion Trailer",
    "author": "Gregor Quendel",
    "authorUrl": "https://www.gregorquendel.com",
    "file": "/assets/music/gq-04.mp3",
    "source": "https://opengameart.org/content/free-cinematic-trailer-music",
    "duration": 78.027755,
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/"
  },
  {
    "id": "gq-01",
    "title": "Cinematic Oriental I",
    "originalTitle": "01 - Cinematic Oriental Trailer - I",
    "author": "Gregor Quendel",
    "authorUrl": "https://www.gregorquendel.com",
    "file": "/assets/music/gq-01.mp3",
    "source": "https://opengameart.org/content/free-cinematic-trailer-music",
    "duration": 39.026939,
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/"
  },
  {
    "id": "gq-12",
    "title": "Cinematic Oriental II",
    "originalTitle": "12 - Cinematic Oriental Trailer - II",
    "author": "Gregor Quendel",
    "authorUrl": "https://www.gregorquendel.com",
    "file": "/assets/music/gq-12.mp3",
    "source": "https://opengameart.org/content/free-cinematic-trailer-music",
    "duration": 57.051429,
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/"
  },
  {
    "id": "gq-05",
    "title": "Modern Orchestra",
    "originalTitle": "05 - Cinematic Modern Orchestral Trailer",
    "author": "Gregor Quendel",
    "authorUrl": "https://www.gregorquendel.com",
    "file": "/assets/music/gq-05.mp3",
    "source": "https://opengameart.org/content/free-cinematic-trailer-music",
    "duration": 60.969796,
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/"
  },
  {
    "id": "gq-06",
    "title": "Cello Arpeggio",
    "originalTitle": "06 - Cinematic Cello Arpeggio Trailer",
    "author": "Gregor Quendel",
    "authorUrl": "https://www.gregorquendel.com",
    "file": "/assets/music/gq-06.mp3",
    "source": "https://opengameart.org/content/free-cinematic-trailer-music",
    "duration": 68.04898,
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/"
  },
  {
    "id": "gq-07",
    "title": "Orchestral Percussion",
    "originalTitle": "07 - Cinematic Minimal Orchestral Percussion Trailer",
    "author": "Gregor Quendel",
    "authorUrl": "https://www.gregorquendel.com",
    "file": "/assets/music/gq-07.mp3",
    "source": "https://opengameart.org/content/free-cinematic-trailer-music",
    "duration": 81.048,
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/"
  },
  {
    "id": "gq-08",
    "title": "Chanting Percussion",
    "originalTitle": "08 - Cinematic Chanting Throat Singing Percussion Trailer",
    "author": "Gregor Quendel",
    "authorUrl": "https://www.gregorquendel.com",
    "file": "/assets/music/gq-08.mp3",
    "source": "https://opengameart.org/content/free-cinematic-trailer-music",
    "duration": 40.045714,
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/"
  },
  {
    "id": "gq-03",
    "title": "Cinematic Piano",
    "originalTitle": "03 - Cinematic Piano Trailer",
    "author": "Gregor Quendel",
    "authorUrl": "https://www.gregorquendel.com",
    "file": "/assets/music/gq-03.mp3",
    "source": "https://opengameart.org/content/free-cinematic-trailer-music",
    "duration": 44.042449,
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/"
  },
  {
    "id": "gq-11",
    "title": "Fairy Tale",
    "originalTitle": "11 - Cinematic Fairy Tale Trailer",
    "author": "Gregor Quendel",
    "authorUrl": "https://www.gregorquendel.com",
    "file": "/assets/music/gq-11.mp3",
    "source": "https://opengameart.org/content/free-cinematic-trailer-music",
    "duration": 34.037551,
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/"
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
