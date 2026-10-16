export const MUSIC_TRACKS=Object.freeze([
  {id:'war-theme',title:'War Theme',author:'Spring Spring',file:'/assets/war-theme.mp3',source:'https://opengameart.org/content/war-theme',duration:283.744},
  {id:'creed-of-course',title:'Creed of Course',author:'Eldritch Grim',file:'/assets/creed-of-course.mp3',source:'https://opengameart.org/content/creed-of-course-0',duration:96.449},
  {id:'enemy-ship',title:'Enemy Ship Approaching',author:'yd',file:'/assets/enemy-ship.mp3',source:'https://opengameart.org/content/enemy-ship-approaching',duration:41.659},
  {id:'asianoriental2',title:'Asianoriental2',author:'Tozan',file:'/assets/asianoriental2.mp3',source:'https://opengameart.org/content/asianoriental2',duration:192.477},
]);
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
