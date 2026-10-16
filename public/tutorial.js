import { groups, groupSafety, territories, positionName } from '/engine.js';
import { LESSONS, createTutorial, tutorialStep, submitTutorial, advanceTutorial, restoreTutorial } from '/tutorial-model.js';
import { effect, speak } from '/audio.js';
import '/i18n.js';
const $=id=>document.getElementById(id),KEY='little-kingdoms-tutorial-v1';
let saved;try{saved=JSON.parse(localStorage.getItem(KEY));}catch{}
const completed=new Set(Array.isArray(saved?.completed)?saved.completed.filter(id=>LESSONS.some(l=>l.id===id)):[]);
const requested=new URLSearchParams(location.search).get('lesson');
let session=requested&&LESSONS.some(l=>l.id===requested)&&requested!==saved?.lessonId?createTutorial(requested):restoreTutorial(saved),selected=null;
const cells=[];
function persist(){try{localStorage.setItem(KEY,JSON.stringify({lessonId:session.lessonId,step:session.step,review:session.review,done:session.done,completed:[...completed]}));}catch{}}
function portrait(element,color=1){const index=color===1?0:19;element.style.backgroundImage=`url('/assets/${color===1?'generals-unlock':'generals'}.webp')`;element.style.backgroundPosition=`${index%5*25}% ${Math.floor(index/5)*100/3}%`;element.setAttribute('aria-label',color===1?'Guan Yu':'Cao Cao');}
function chooseLesson(id){session=createTutorial(id);selected=null;history.replaceState(null,'',location.pathname+'?lesson='+session.lessonId);persist();render();}
function submit(action){
  const before=session;session=submitTutorial(session,action);selected=null;
  if(session.review&&!before.review){effect(tutorialStep(session).blocked?'pass':session.state.winner?'win':'place');speak(session.feedback);const lesson=LESSONS.find(l=>l.id===session.lessonId);if(session.step===lesson.steps.length-1)completed.add(lesson.id);}
  persist();render();
}
for(let i=0;i<81;i++){
  const cell=document.createElement('button');cell.type='button';cell.className='cell';cell.dataset.index=i;
  cell.onclick=()=>{if(session.review||session.done)return;if(selected===i){submit(i);return;}selected=i;session={...session,feedback:''};render();};
  cell.onkeydown=e=>{const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-9,ArrowDown:9}[e.key];if(!delta)return;e.preventDefault();const next=i+delta;if(next>=0&&next<81&&(!(e.key==='ArrowLeft'||e.key==='ArrowRight')||Math.floor(next/9)===Math.floor(i/9)))cells[next].focus();};
  $('tutorial-board').append(cell);cells.push(cell);
}
function render(){
  const lesson=LESSONS.find(l=>l.id===session.lessonId),step=tutorialStep(session),state=session.state,t=territories(state.board),danger=new Set(),protectedStones=new Set();
  for(const g of groupSafety(state,t)){if(g.threatened)g.stones.forEach(i=>danger.add(i));if(g.protected)g.stones.forEach(i=>protectedStones.add(i));}
  $('tutorial-lesson').innerHTML=LESSONS.map((l,i)=>`<option value="${l.id}" ${l.id===lesson.id?'selected':''}>${completed.has(l.id)?'✓ ':''}${String(i+1).padStart(2,'0')} · ${l.title}</option>`).join('');
  $('course-progress').textContent=completed.size+' / '+LESSONS.length;
  $('tutorial-practice').hidden=session.done;$('tutorial-complete').hidden=!session.done;
  $('tutorial-step-label').textContent=`STEP ${session.step+1} / ${lesson.steps.length} · ${step.color===1?'SHU · BLUE':'WEI · ORANGE'}`;
  $('tutorial-title').textContent=lesson.title;$('tutorial-instruction').textContent=step.prompt;portrait($('coach-avatar'),step.color);
  $('tutorial-feedback').textContent=session.feedback;$('tutorial-feedback').classList.toggle('success',session.review);$('tutorial-feedback').classList.toggle('shown',!!session.feedback);
  $('tutorial-pass').hidden=session.review;$('tutorial-deploy').hidden=session.review;$('tutorial-next').hidden=!session.review;
  $('tutorial-pass').classList.toggle('required-action',step.action==='pass');$('tutorial-deploy').disabled=selected===null;
  $('tutorial-deploy').textContent=selected===null?'Tap the glowing square':`Deploy ${positionName(selected)} ${step.blocked?'?':'＋'}`;
  $('tutorial-next').textContent=session.step<lesson.steps.length-1?'Continue →':LESSONS.indexOf(lesson)<LESSONS.length-1?'Next lesson →':'Finish tutorial →';
  $('tutorial-comic').href='/rulebook.html?chapter='+lesson.comic;
  $('tutorial-turn').textContent=state.winner?`${state.winner===1?'SHU':'WEI'} WINS`:state.turn===1?'SHU · BLUE':'WEI · ORANGE';
  $('tutorial-land').textContent=`Shu ${t.scores[1]} · Wei ${t.scores[2]} land`;
  const focusColor=['single-eye','large-territory','danger','neutral-wall'].includes(lesson.id)?1:step.color;
  const gs=groups(state.board),focus=gs.find(g=>g.color===focusColor)||gs[0],liberties=new Set(focus?.liberties||[]);$('tutorial-liberties').textContent=focus?`${focus.color===1?'Shu':'Wei'} group: ${focus.liberties.length} ${focus.liberties.length===1?'liberty':'liberties'}`:'E5 · shared wall';
  for(let i=0;i<81;i++){
    const c=state.board[i],ghost=selected===i&&!c&&!session.review,cell=cells[i];
    cell.className='cell'+(c?' '+['','blue','orange','neutral'][c]:'')+(t.owners[i]?' owned-'+(t.owners[i]===1?'blue':'orange'):'')+(danger.has(i)?' danger':'')+(selected===i?' selected':'')+(ghost?' ghost '+(step.color===1?'blue':'orange'):'')+(!session.review&&step.action===i?' tutorial-target':'')+(state.last===i?' last':'');
    cell.innerHTML=c||ghost?'<svg aria-hidden="true"><use href="#castle"/></svg>':'';
    if(!c&&liberties.has(i))cell.classList.add('tutorial-liberty');
    const description=c===3?'Permanent neutral shared wall':c?`${c===1?'Shu':'Wei'} castle${danger.has(i)?', danger: a legal enemy capture is available':''}${protectedStones.has(i)?', protected by sealed territory':''}`:t.owners[i]?`${t.owners[i]===1?'Shu':'Wei'} sealed territory`:'Empty';
    cell.setAttribute('aria-label',positionName(i)+': '+description+(!session.review&&step.action===i?', place here for this step':''));cell.setAttribute('aria-pressed',String(selected===i));
  }
  if(session.done){portrait($('graduate-avatar'));$('tutorial-complete-text').textContent=completed.size===LESSONS.length?`All ${LESSONS.length} lessons complete. You have built eyes, sealed land, defended danger and practiced both ways to win.`:`${completed.size} of ${LESSONS.length} lessons complete. Choose any remaining lesson above, or start a real match.`;}
}
$('tutorial-deploy').onclick=()=>{if(selected!==null)submit(selected);};$('tutorial-pass').onclick=()=>submit('pass');
$('tutorial-next').onclick=()=>{const lesson=LESSONS.find(l=>l.id===session.lessonId);if(session.step===lesson.steps.length-1&&LESSONS.indexOf(lesson)<LESSONS.length-1){chooseLesson(LESSONS[LESSONS.indexOf(lesson)+1].id);return;}session=advanceTutorial(session);selected=null;persist();render();};
$('tutorial-lesson').onchange=e=>chooseLesson(e.target.value);$('tutorial-reset').onclick=()=>chooseLesson(session.lessonId);$('tutorial-again').onclick=()=>chooseLesson(LESSONS[0].id);
render();
new ResizeObserver(()=>{const area=document.querySelector('.tutorial-boardspace'),frame=area.querySelector('.board-surround');if(area.clientWidth&&area.clientHeight)frame.style.width=Math.max(90,Math.min(area.clientWidth-4,area.clientHeight-12,580))+'px';}).observe(document.querySelector('.tutorial-boardspace'));
if('serviceWorker'in navigator&&!window.KINGDOMS_API_BASE&&['http:','https:'].includes(location.protocol))navigator.serviceWorker.register('/sw.js').catch(()=>{});
