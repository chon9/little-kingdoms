import { newGame, play, inspectMove, positionName } from '/engine.js';

function position(blue=[],orange=[],turn=1){const s=newGame();blue.forEach(i=>s.board[i]=1);orange.forEach(i=>s.board[i]=2);s.count=[0,blue.length,orange.length];s.turn=turn;return s;}
const eyeRing=[10,11,12,19,21,28,30],siege=[1,2,3,9,13,18,22,27,31,37,38,39];
function simultaneous(){const s=newGame();s.board=Array(81).fill(2);for(let i=0;i<81;i++)if(i%9===0||Math.floor(i/9)>=6||(Math.floor(i/9)===5&&i%9<=6))s.board[i]=1;s.board[40]=3;s.board[1]=0;s.count=[0,39,40];return s;}
export const LESSONS=[
  {id:'first-castles',title:'Place & connect',comic:2,initial:()=>newGame(),steps:[
    {action:30,color:1,prompt:'You command Shu. Select D6, then press Deploy to place your first blue castle.',explanation:'Your first castle is on the board. The glowing dots beside castles are their empty neighboring squares, or liberties.',replies:[50]},
    {action:31,color:1,prompt:'Wei answered at F4. Place at E6 to connect a second blue castle side by side.',explanation:'These two blue castles form one connected group. They share their liberties. Diagonal contact alone would not connect them.'}
  ]},
  {id:'single-eye',title:'Build one protected eye',comic:5,initial:()=>position(eyeRing,siege),steps:[
    {action:29,color:1,prompt:'This starting position is under siege. Close the gap at C6 to leave one empty eye at C7.',explanation:'The ring now has exactly one liberty: C7. It is sealed Shu territory, so Wei cannot enter it. Safe groups stay unmarked; no danger warning should appear.'},
    {action:20,color:2,blocked:true,prompt:'Now you are Wei. Try deploying at C7, inside the single eye. Can a capture override the territory ban?',explanation:'Blocked. Wei cannot enter sealed Shu territory, even to claim a capture. One protected eye keeps this connected group safe.'}
  ]},
  {id:'large-territory',title:'Seal a bigger area',comic:6,initial:()=>position([2,10]),steps:[
    {action:18,color:1,prompt:'Finish the diagonal wall at A7. The top and left board edges will help you seal the corner.',explanation:'Three empty squares are now Shu territory: A9, B9 and A8. Larger sealed areas are protected too.'},
    {action:0,color:2,blocked:true,prompt:'Take Wei’s turn and try entering A9. Does having more than one empty square make invasion legal?',explanation:'Blocked. The size does not change the rule: every empty square in this sealed area is off limits to Wei.'},
    {action:9,color:2,blocked:true,prompt:'Try another square in the same area: A8.',explanation:'Also blocked. All three squares are sealed territory, not just one special eye.'}
  ]},
  {id:'danger',title:'Read danger & defend',comic:10,initial:()=>position([0],[1]),steps:[
    {action:9,color:1,prompt:'The red ! on Shu at A9 is real: Wei could capture at A8. Extend your group to A8 before that happens.',explanation:'Good defense. Your connected group now has two liberties, so the red warning clears. Continue to see Wei’s reply.',replies:[10]},
    {action:18,color:1,prompt:'Wei has played B8. Your group has one unprotected liberty again, so the red ! returns. Extend to A7.',explanation:'The group has breathing room again. Red ! means a legal winning enemy capture is available. Safe groups, including protected eyes, stay unmarked.'}
  ]},
  {id:'capture',title:'Win with one capture',comic:3,initial:()=>position([1],[0]),steps:[
    {action:9,color:1,prompt:'Wei’s corner castle has only A8 left. Place there to take its last liberty.',explanation:'Shu wins immediately. Capturing even one enemy group ends the battle; territory points do not need to be counted.'}
  ]},
  {id:'open-contested',title:'Open or contested land',comic:7,initial:()=>position([10,12,19,21,28,29,30],[],2),steps:[
    {action:20,color:2,prompt:'This blue wall has a gap at C8. As Wei, place at C7 inside the apparent enclosure.',explanation:'Legal: the gap means this is not sealed territory. Your new orange castle has only C8 left, however, so it is in danger. Legal does not always mean safe.'},
    {scene:()=>position([3,11,19,27],[0],2),action:1,color:2,prompt:'New practice scene: Wei was already at A9 before the wall closed. Extend that orange castle to B9.',explanation:'Legal: this empty region touches both colors. The enemy castle already inside prevents Shu from claiming it as sealed territory.'}
  ]},
  {id:'neutral-wall',title:'Use the white wall',comic:4,initial:()=>position([22,30]),steps:[
    {action:32,color:1,prompt:'Place at F6. Together with Shu at E7 and D6, the permanent white castle at E5 will help seal E6.',explanation:'E6 is sealed Shu territory. The white castle is a shared wall; it does not connect these separate blue groups.'},
    {action:31,color:2,blocked:true,prompt:'As Wei, try entering the protected square at E6.',explanation:'Blocked. The neutral wall can help either kingdom complete a sealed territory.'}
  ]},
  {id:'self-capture',title:'Avoid a sacrifice',comic:8,initial:()=>position([1,10,19,27],[0,9],2),steps:[
    {action:18,color:2,blocked:true,prompt:'You are Wei. Try extending the orange group at A7, its only remaining liberty.',explanation:'That would leave your own group with zero liberties and capture nothing. The engine rejects the sacrifice. Continue; Wei will pass.',replies:['pass']},
    {action:18,color:1,prompt:'Wei passed. Now place Shu at A7 to take the orange group’s last liberty.',explanation:'Shu captures and wins. The same square can be an illegal sacrifice for one color and a winning capture for the other.'}
  ]},
  {id:'pass-score',title:'Pass & count land',comic:9,initial:()=>position([3,11,19,27],[71,79]),steps:[
    {action:'pass',color:1,prompt:'Shu has six empty territory squares; Wei has one. Press Pass as Shu.',explanation:'One pass does not end the battle. Wei may still deploy or pass. A deployment would reset the consecutive-pass count.'},
    {action:'pass',color:2,prompt:'Now take Wei’s turn and press Pass again to finish and count the land.',explanation:'Two consecutive passes end it. Shu: 6 − 2 = 4. Wei: 1. Shu’s adjusted lead is 3, so Shu wins under your chosen scoring variant.'}
  ]},
  {id:'simultaneous',title:'The simultaneous exception',comic:8,initial:simultaneous,steps:[
    {action:1,color:1,prompt:'Final practice position: both colors share the last empty square at B9. Place Shu there to see the simultaneous rule.',explanation:'Both colors have zero liberties. Your chosen rule breaks only Blue and awards Wei the win, even though Shu placed the final castle.'}
  ]}
];
export function createTutorial(id=LESSONS[0].id){const lesson=LESSONS.find(l=>l.id===id)||LESSONS[0];return{lessonId:lesson.id,state:lesson.initial(),step:0,review:false,done:false,feedback:''};}
export function tutorialStep(session){return LESSONS.find(l=>l.id===session.lessonId).steps[session.step];}
export function submitTutorial(session,action){
  if(session.review||session.done)return session;
  const step=tutorialStep(session),move=action==='pass'?null:inspectMove(session.state,action);
  if(action!==step.action)return{...session,feedback:move?.error||`For this step, ${step.action==='pass'?'press Pass':'deploy at '+positionName(step.action)}. Your practice board has not changed.`};
  if(step.blocked){
    if(!move?.error)throw new Error('Tutorial expected a blocked move, but the engine allowed it.');
    return{...session,review:true,feedback:move.error+' '+step.explanation};
  }
  if(move?.error)return{...session,feedback:move.error};
  return{...session,state:play(session.state,action),review:true,feedback:step.explanation};
}
export function advanceTutorial(session){
  if(!session.review||session.done)return session;
  const lesson=LESSONS.find(l=>l.id===session.lessonId);
  if(session.step===lesson.steps.length-1)return{...session,done:true};
  let state=session.state;for(const reply of tutorialStep(session).replies||[])state=play(state,reply);
  const next=lesson.steps[session.step+1];if(next.scene)state=next.scene();
  if(state.turn!==next.color)throw new Error('Tutorial turn does not match the next step.');
  return{...session,state,step:session.step+1,review:false,feedback:''};
}
export function restoreTutorial(saved){
  let session=createTutorial(saved?.lessonId);
  const lesson=LESSONS.find(l=>l.id===session.lessonId),step=Number.isInteger(saved?.step)?Math.max(0,Math.min(lesson.steps.length-1,saved.step)):0;
  for(let i=0;i<step;i++)session=advanceTutorial(submitTutorial(session,tutorialStep(session).action));
  if(saved?.review||saved?.done)session=submitTutorial(session,tutorialStep(session).action);
  if(saved?.done)session=advanceTutorial(session);
  return session;
}
