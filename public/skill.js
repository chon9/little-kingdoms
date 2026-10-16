// Little Kingdoms ranks: an opponent-adjusted device estimate, not Go credentials
// or a server-verified competitive ladder. XP and cosmetic unlocks are independent.
export const BOT_RATINGS=Object.freeze([800,1000,1200,1400,1600,1800,2000,2200,2400,2600]);
export const SKILL_RANKS=Object.freeze([
  ...Array.from({length:20},(_,i)=>Object.freeze({index:i,label:(20-i)+' Kyu',short:(20-i)+'K',rating:i?1000+i*50:0,games:i*2,dan:false})),
  ...[2000,2100,2220,2360,2520,2700,2900,3120,3360].map((rating,i)=>Object.freeze({index:20+i,label:(i+1)+' Dan',short:(i+1)+'D',rating,games:[60,90,130,180,240,310,390,480,580][i],dan:true}))
]);
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const round=n=>Math.round(n*10)/10;
export const validSkillRating=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=5000;
export function skillSnapshot(value){return{skillRating:validSkillRating(value?.skillRating)?round(value.skillRating):1000,skillGames:Number.isSafeInteger(value?.skillGames)&&value.skillGames>=0&&value.skillGames<=1000000?value.skillGames:0};}
export function normalizeSkill(value){
  const p={rating:1000,games:0,wins:0,peak:0,recent:[]};if(value?.schema!==1)return{schema:1,...p};
  if(validSkillRating(value.rating))p.rating=round(value.rating);
  if(Number.isSafeInteger(value.games)&&value.games>=0)p.games=clamp(value.games,0,1000000);
  if(Number.isSafeInteger(value.wins)&&value.wins>=0)p.wins=Math.min(value.wins,p.games);
  if(Number.isInteger(value.peak))p.peak=clamp(value.peak,0,28);
  if(Array.isArray(value.recent))p.recent=value.recent.filter(r=>typeof r?.id==='string'&&r.id.length<=100&&validSkillRating(r.before)&&validSkillRating(r.after)&&Number.isFinite(r.delta)&&Math.abs(r.delta)<=48&&typeof r.won==='boolean'&&Number.isInteger(r.rank)&&r.rank>=0&&r.rank<29&&Number.isInteger(r.previousRank)&&r.previousRank>=0&&r.previousRank<29).slice(-20).map(r=>({...r,mode:/^(AI (?:[1-9]|10)|PvP|2v2)$/.test(r.mode)?r.mode:'PvP'}));
  return{schema:1,...p};
}
export function skillRank(skill){let rank=SKILL_RANKS[0];for(const candidate of SKILL_RANKS)if(skill.rating>=candidate.rating&&skill.games>=candidate.games&&candidate.index<=(Number.isInteger(skill.peak)?skill.peak:28))rank=candidate;return rank;}
export function skillProgress(value){const skill=normalizeSkill(value),rank=skillRank(skill),next=SKILL_RANKS[rank.index+1];return{skill,rank,next,ratingNeeded:next?Math.max(0,round(next.rating-skill.rating)):0,gamesNeeded:next?Math.max(0,next.games-skill.games):0};}
export function ratingChange(rating,opponent,won,games=20){
  const k=games<20?48:rating>=2700?16:rating>=2000?24:32;
  const expected=1/(1+10**((opponent-rating)/400));return round(k*((won?1:0)-expected));
}
const mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
export function matchRatings(skill,{state,mode,humanColor,humanSeat,botLevel=1}){
  if(mode==='bot')return{own:skill.rating,opponent:BOT_RATINGS[clamp(Number.isInteger(botLevel)?botLevel:1,1,10)-1]};
  if(state.mode==='teams'){
    const color=seat=>seat<=2?state.team1Color:3-state.team1Color;
    const own=[],enemy=[];for(const seat of[1,2,3,4]){const rating=seat===humanSeat?skill.rating:skillSnapshot(state.teamPlayers?.[seat]).skillRating;(color(seat)===humanColor?own:enemy).push(rating);}return{own:mean(own),opponent:mean(enemy)};
  }
  return{own:skill.rating,opponent:skillSnapshot(state.players?.[3-humanColor]).skillRating};
}
export function awardSkill(value,options){
  const skill=normalizeSkill(value),{state,mode,humanColor,humanSeat}=options;
  const no=reason=>({skill,receipt:null,reason});
  if(!state.winner||!['bot','online'].includes(mode)||state.steamAborted||mode==='bot'&&state.rated===false)return no('practice');
  if(typeof state.matchId!=='string'||!state.matchId||state.matchId.length>100)return no('invalid');
  if(skill.recent.some(r=>r.id===state.matchId))return no('duplicate');
  const total=(state.count?.[1]||0)+(state.count?.[2]||0),won=state.winner===humanColor;
  const own=state.mode==='teams'?state.seatCounts?.[humanSeat]||0:state.count?.[humanColor]||0;
  const acted=own>0||state.history?.some(h=>state.mode==='teams'?h.seat===humanSeat:h.color===humanColor);
  const selfResigned=state.reason==='resignation'&&(state.mode==='teams'?state.resignedSeat===humanSeat:!won);
  if(total<1||won&&(total<3||!own||!state.count[3-humanColor])||!won&&!acted&&!selfResigned)return no('unplayed');
  const previousRank=skillRank(skill),ratings=matchRatings(skill,options),delta=ratingChange(ratings.own,ratings.opponent,won,skill.games);
  const after=round(clamp(skill.rating+delta,0,5000)),next={...skill,rating:after,games:skill.games+1,wins:skill.wins+(won?1:0)};
  if(won)next.peak=Math.max(skill.peak,skillRank({...next,peak:28}).index);
  const rank=skillRank(next),receipt={id:state.matchId,before:skill.rating,after,delta:round(after-skill.rating),won,rank:rank.index,previousRank:previousRank.index,opponent:round(ratings.opponent),mode:mode==='bot'?'AI '+options.botLevel:state.mode==='teams'?'2v2':'PvP'};
  next.peak=Math.max(skill.peak,rank.index);next.recent=[...skill.recent,receipt].slice(-20);return{skill:next,receipt,reason:'rated'};
}
