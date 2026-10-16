// Device-local, unranked progression. Never used as proof of online identity.
const names = [
  ['Liu Shan','劉禪'],['Mi Zhu','糜竺'],['Zhou Cang','周倉'],['Guan Ping','關平'],['Ma Dai','馬岱'],['Huang Zhong','黃忠'],['Wei Yan','魏延'],['Ma Chao','馬超'],['Zhao Yun','趙雲'],['Zhuge Liang','諸葛亮'],
  ['Cao Pi','曹丕'],['Cao Hong','曹洪'],['Li Dian','李典'],['Yue Jin','樂進'],['Yu Jin','于禁'],['Xu Chu','許褚'],['Xiahou Yuan','夏侯淵'],['Xiahou Dun','夏侯惇'],['Zhang Liao','張遼'],['Cao Cao','曹操'],
  ['Guan Yu','關羽'],['Liu Bei','劉備'],['Zhang Fei','張飛'],['Jiang Wei','姜維'],['Pang Tong','龐統'],['Huang Yueying','黃月英'],['Guan Yinping','關銀屏'],['Xingcai','星彩'],['Guan Xing','關興'],['Bao Sanniang','鮑三娘'],
  ['Sima Yi','司馬懿'],['Guo Jia','郭嘉'],['Xun Yu','荀彧'],['Zhen Ji','甄姬'],['Zhang Chunhua','張春華'],['Cao Ren','曹仁'],['Dian Wei','典韋'],['Jia Xu','賈詡'],['Sima Zhao','司馬昭'],['Wang Yi','王異']
];
export const AVATARS = names.map(([name,han],id)=>({id,name,han,color:id<10||id>=20&&id<30?1:2,atlas:id<20?'generals':'generals-unlock',index:id%20,unlock:id<20?id%10+1:id-18}));
export const PROFILE_KEY='little-kingdoms-profile-v1';
export const xpForLevel=level=>80*(level-1)+20*(level-1)**2;
export function levelForXP(xp){let level=1;while(level<50&&xp>=xpForLevel(level+1))level++;return level;}
export function freshProfile(){return{schema:1,xp:0,avatar:0,matches:0,wins:0,claimed:[],defeated:[]};}
export function normalizeProfile(value){
  const p=freshProfile();if(value?.schema!==1)return p;
  for(const key of ['xp','matches','wins'])if(Number.isSafeInteger(value[key])&&value[key]>=0)p[key]=value[key];
  p.claimed=Array.isArray(value.claimed)?[...new Set(value.claimed.filter(x=>typeof x==='string'&&x.length<=100))]:[];
  p.defeated=Array.isArray(value.defeated)?[...new Set(value.defeated.filter(x=>Number.isInteger(x)&&x>=1&&x<=10))]:[];
  if(Number.isInteger(value.avatar)&&AVATARS[value.avatar]?.unlock<=levelForXP(p.xp))p.avatar=value.avatar;
  return p;
}
export function awardMatch(profile,{state,mode,humanColor,botLevel=1}){
  const p=normalizeProfile(profile),id=state.matchId;
  if(!state.winner||typeof id!=='string'||!id||p.claimed.includes(id))return{profile:p,xp:0,duplicate:true,unlocked:[]};
  const played=state.count[1]+state.count[2],own=state.count[humanColor],won=state.winner===humanColor;
  const eligible=played>=4&&own>=2&&!(state.reason==='resignation'&&!won);
  let xp=eligible?(mode==='online'?(won?150:60):mode==='local'?40:won?60+12*botLevel:25+4*botLevel):0;
  let firstVictory=false;
  if(eligible&&mode==='bot'&&won&&!p.defeated.includes(botLevel)){xp+=40+5*botLevel;p.defeated.push(botLevel);firstVictory=true;}
  const previousLevel=levelForXP(p.xp);p.claimed.push(id);p.xp+=xp;
  if(eligible){p.matches++;if(won)p.wins++;}
  const level=levelForXP(p.xp),unlocked=AVATARS.filter(a=>a.unlock>previousLevel&&a.unlock<=level);
  return{profile:p,xp,previousLevel,level,unlocked,firstVictory,eligible,duplicate:false};
}

// First-person character lines, deliberately short enough for a tactical cut-in.
const signature={
  0:['I can do this. Watch me!','I saved a little surprise!','I really won a kingdom!'],
  9:['I have already seen our path.','I left no opening to chance.','I let the board tell my story.'],
  19:['I will command this age!','I turn your opening into my victory.','I claim these riverlands!'],
  20:['I stand by my oath!','I will hold this line.','I have honored my promise.'],
  21:['I fight for my people.','I will protect every castle.','I share this victory with you.'],
  22:['I am ready! Who dares face me?','I will not yield an inch!','I knew we could do it!'],
  25:['I have an ingenious little plan.','I built a way out of this!','I call that a successful experiment!'],
  30:['I know when to wait.','I have been expecting that.','I prefer the last word.'],
  33:['I will make my own legend.','I keep my composure.','I made every move count.']
};
export function avatarLine(id,event){const a=AVATARS[id]||AVATARS[0],lines=signature[a.id]||[`I am ${a.name}. My banner is ready.`,`I will keep my kingdom safe.`,`I have earned this victory!`];return event==='start'?lines[0]:event==='win'?lines[2]:event==='loss'?'I will return wiser. My story continues.':event==='threat'?'I see the danger. I will stand firm!':event==='territory'?'I claim this land for my kingdom!':lines[1];}
