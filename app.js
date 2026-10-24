'use strict';
const $ = id => document.getElementById(id);
const labels = {expired:'기한 지남',today:'오늘까지',soon:'3일 이내',fresh:'여유 있음'};
const locations = {fridge:'냉장',freezer:'냉동',pantry:'실온'};
const loaded = FridgeStorage.load();
let items = loaded.ok ? loaded.items : [];
let tab = 'active', editing = null, writable = loaded.ok;
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const motionSetting = FridgeStorage.loadMotion();
let reduceMotion = motionSetting.value;
const pending = new Map();
let undoItem = null, addedTimer = null;
$('reduce-motion').checked = reduceMotion;
function reduced(){return reduceMotion || motionQuery.matches;}
function syncMotion(){document.documentElement.classList.toggle('reduce-motion', reduced());}
function settingsError(text){$('settings-error').textContent=text;$('settings-error').hidden=false;}
if(!motionSetting.ok)settingsError('애니메이션 설정을 읽지 못했습니다. 기본 설정을 사용합니다.');
syncMotion();
function finishEating(id){
  const entry=pending.get(id);if(!entry)return;
  clearTimeout(entry.timer);pending.delete(id);
  try{render();}finally{if(entry.focus && !$('undo-notice').hidden)$('undo-button').focus();}
}
function updateHero(today){
  const active=items.filter(i=>i.state==='active');
  const urgent=active.filter(i=>['today','soon'].includes(FridgeDates.status(i.expiry,today)));
  const expired=active.filter(i=>FridgeDates.status(i.expiry,today)==='expired');
  const mode=!writable?'error':!active.length?'empty':urgent.length?'alert':'idle';
  $('hero-scene').className=`hero-scene ${mode}`;
  $('dog-dialogue').textContent=mode==='error'?'저장 데이터를 먼저 확인해 줘!':mode==='empty'?'냉장고가 텅 비었네!':mode==='alert'?'이것부터 확인해 봐!':'오늘은 뭐 먹지?';
  $('expiry-summary').textContent=urgent.length?`오늘부터 3일 이내 기한인 식재료 ${urgent.length}개` : '';
  $('expired-summary').textContent=expired.length?`기한이 지난 식재료 ${expired.length}개가 있어요. 상태를 따로 확인해 주세요. 섭취를 권하는 안내가 아닙니다.`:'';
}
function celebrateAdded(){
  clearTimeout(addedTimer);if(reduced())return;
  $('hero-scene').classList.add('added');
  addedTimer=setTimeout(()=>{$('hero-scene').classList.remove('added');},1400);
}
function eat(id){
  const item=items.find(i=>i.id===id);
  if(!writable || pending.has(id) || !item || item.state!=='active')return;
  const snapshot={...item};
  // Persist first. A reload during the presentation already sees the used record.
  if(!commit(items.map(i=>i.id===id?{...i,state:'used',usedAt:new Date().toISOString()}:i),'사용 완료 기록에 저장했어요.',false))return;
  undoItem=snapshot;$('undo-notice').hidden=false;$('undo-button').disabled=false;
  if(editing===id)resetForm();
  if(!reduced()){
    const entry={snapshot,timer:null,focus:true};pending.set(id,entry);
    entry.timer=setTimeout(()=>finishEating(id),1350);
  }
  try{render();if(reduced())$('undo-button').focus();}
  catch(error){finishEating(id);}
}
function undo(){
  if(!undoItem||!writable)return;
  const snapshot=undoItem;
  const current=items.find(i=>i.id===snapshot.id);
  if(!current||current.state!=='used')return;
  if(!commit(items.map(i=>i.id===snapshot.id?{...snapshot}:i),'원래 식재료 정보로 되돌렸어요.',false))return;
  const entry=pending.get(snapshot.id);if(entry)clearTimeout(entry.timer);pending.delete(snapshot.id);
  undoItem=null;$('undo-notice').hidden=true;tab='active';render();$('active-tab').focus();
}
$('undo-button').addEventListener('click',undo);
$('reduce-motion').addEventListener('change',()=>{
  const value=$('reduce-motion').checked;
  if(!FridgeStorage.saveMotion(value).ok){$('reduce-motion').checked=reduceMotion;settingsError('애니메이션 설정을 저장하지 못했습니다. 이전 설정을 유지합니다.');return;}
  reduceMotion=value;$('settings-error').hidden=true;syncMotion();
  if(reduced()){clearTimeout(addedTimer);$('hero-scene').classList.remove('added');for(const id of [...pending.keys()])finishEating(id);}
});
motionQuery.addEventListener('change',()=>{syncMotion();if(reduced())for(const id of [...pending.keys()])finishEating(id);});
const characterSource = 'assets/chihuahua.png';
function onCharacterError(event){
  event.target.hidden=true;
  $('image-error').hidden=false;
}
function characterImage(className){
  const img=node('img',undefined,className);
  img.alt='';img.width=1254;img.height=1254;
  img.addEventListener('error',onCharacterError);
  img.src=characterSource;
  return img;
}
$('hero-dog').addEventListener('error',onCharacterError);
// Handle an image that failed before deferred scripts attached the listener.
if($('hero-dog').complete && !$('hero-dog').naturalWidth)onCharacterError({target:$('hero-dog')});
function eatingCard(item){
  const card=node('article',undefined,'food-card eating-card');card.setAttribute('aria-label',`${item.name}: 사용 완료 저장됨`);
  const scene=node('div',undefined,'eating-scene');scene.setAttribute('aria-hidden','true');
  const plate=node('div',undefined,'cartoon-plate');plate.append(node('span','✦'));scene.append(plate);
  scene.append(characterImage('eating-dog dog-image'),node('span','✧ 냠! ✧','yum'));
  card.append(scene,node('p','사용 완료 기록에 저장했어요.','small'));return card;
}
function announce(text){$('message').textContent=text;$('message').hidden=false;}
function storageError(text){$('storage-error').textContent=text;$('storage-error').hidden=false;$('message').hidden=true;}
if(!loaded.ok){storageError('저장된 데이터를 읽거나 해석하지 못했습니다. 기존 데이터를 보호하기 위해 변경을 중지했습니다. 브라우저의 사이트 저장 권한을 확인한 뒤 새로고침해 주세요. 문제가 계속되면 사이트 데이터를 백업한 뒤 확인해 주세요.');$('submit-button').disabled=true;}
function commit(next, message, refresh=true){
  if(!writable)return false;
  const result=FridgeStorage.save(next);
  if(!result.ok){storageError('저장하지 못했습니다. 변경 사항은 적용되지 않았습니다. 브라우저 저장 공간과 사이트 저장 권한을 확인한 뒤 다시 시도해 주세요.');return false;}
  items=next;$('storage-error').hidden=true;announce(message);if(refresh)render();return true;
}
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function action(text,handler,className){const button=node('button',text,className);button.type='button';button.disabled=!writable;button.addEventListener('click',handler);return button;}
function resetForm(){editing=null;$('food-form').reset();$('form-title').textContent='식재료 추가';$('submit-button').textContent='＋ 식재료 추가';$('cancel-edit').hidden=true;}
function edit(item){editing=item.id;for(const key of ['name','quantity','unit','expiry','location'])$(key).value=item[key];$('form-title').textContent='식재료 수정';$('submit-button').textContent='변경 사항 저장';$('cancel-edit').hidden=false;$('name').focus();$('form-title').scrollIntoView({behavior:'smooth',block:'start'});}
function render(){
  const today=FridgeDates.todayLocal();$('today').textContent=today;updateHero(today);
  $('active-tab').setAttribute('aria-pressed',String(tab==='active'));$('used-tab').setAttribute('aria-pressed',String(tab==='used'));
  const query=$('search').value.trim().toLocaleLowerCase('ko');
  const displayItems=items.map(i=>tab==='active'&&pending.has(i.id)?pending.get(i.id).snapshot:i);
  const visible=displayItems.filter(item=>item.state===tab && item.name.toLocaleLowerCase('ko').includes(query) && ($('filter-location').value==='all'||item.location===$('filter-location').value) && ($('filter-status').value==='all'||FridgeDates.status(item.expiry,today)===$('filter-status').value)).sort((a,b)=>a.expiry.localeCompare(b.expiry)||a.name.localeCompare(b.name,'ko'));
  $('count').textContent=`${visible.filter(i=>tab!=='active'||!pending.has(i.id)).length}개`;
  const list=$('food-list');list.replaceChildren();
  if(!visible.length){const empty=node('div',undefined,'empty');empty.append(node('h3',!writable?'저장 데이터를 확인해 주세요':items.some(i=>i.state===tab)?'조건에 맞는 식재료가 없어요':tab==='used'?'아직 사용 완료 기록이 없어요':'냉장고의 첫 기록을 남겨보세요'));
    empty.append(node('p',!writable?'위의 저장 오류 안내를 확인해 주세요.':items.some(i=>i.state===tab)?'검색어나 필터를 바꿔보세요.':tab==='used'?'식재료를 다 쓰면 ‘다 먹었어요!’를 눌러주세요.':'이름과 기한 날짜를 입력해 시작하세요.'));
    if(writable&&tab==='active'&&!items.some(i=>i.state==='active'))empty.append(action('첫 식재료 추가하기',()=>{$('name').focus();$('form-title').scrollIntoView({behavior:'smooth'});}));list.append(empty);return;}
  for(const item of visible){if(tab==='active'&&pending.has(item.id)){list.append(eatingCard(item));continue;}const card=node('article',undefined,'food-card');const top=node('div',undefined,'card-top');const status=FridgeDates.status(item.expiry,today);top.append(node('h3',item.name),node('span',labels[status],`badge ${status}`));card.append(top,node('p',`${item.quantity} ${item.unit} · ${locations[item.location]}`,'details'),node('p',`기한 날짜 ${item.expiry}`,'details'));
    if(item.state==='used')card.append(node('p',`사용 완료 ${new Date(item.usedAt).toLocaleString('ko-KR')}`,'details'));
    const actions=node('div',undefined,'actions');actions.append(action('수정',()=>edit(item)));
    if(item.state==='active')actions.append(action('다 먹었어요!',()=>eat(item.id),'use'));
    actions.append(action('삭제',()=>{if(window.confirm(`‘${item.name}’ 기록을 삭제할까요? 삭제 후에는 되돌릴 수 없습니다.`)){if(commit(items.filter(i=>i.id!==item.id),'삭제했습니다.')){if(editing===item.id)resetForm();if(undoItem?.id===item.id){undoItem=null;$('undo-notice').hidden=true;}const entry=pending.get(item.id);if(entry)clearTimeout(entry.timer);pending.delete(item.id);render();}}},'delete'));card.append(actions);list.append(card);
  }
}
$('food-form').addEventListener('submit',event=>{event.preventDefault();if(!writable)return;
  const name=$('name').value.trim(),unit=$('unit').value.trim(),quantity=Number($('quantity').value),expiry=$('expiry').value;
  if(!name||!unit||!Number.isFinite(quantity)||quantity<0.001||!FridgeDates.validDate(expiry)){announce('이름, 단위, 0.001 이상의 수량과 올바른 날짜를 입력해 주세요.');return;}
  const fields={name,unit,quantity,expiry,location:$('location').value};
  const next=editing?items.map(i=>i.id===editing?{...i,...fields}:i):[...items,{...fields,id:crypto.randomUUID(),state:'active',usedAt:null}];
  const adding=!editing;
  if(commit(next,editing?'수정 사항을 저장했습니다.':'식재료를 추가했습니다.')){resetForm();if(adding)celebrateAdded();}
});
$('cancel-edit').addEventListener('click',resetForm);
for(const id of ['search','filter-location','filter-status'])$(id).addEventListener('input',render);
$('active-tab').addEventListener('click',()=>{tab='active';render();});$('used-tab').addEventListener('click',()=>{tab='used';render();});
window.addEventListener('focus',render);document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
// Prevent stale tabs from silently overwriting another tab's edits.
window.addEventListener('storage',event=>{if(event.key==='chihuahua-motion-v1'){const setting=FridgeStorage.loadMotion();if(setting.ok){reduceMotion=setting.value;$('reduce-motion').checked=reduceMotion;syncMotion();if(reduced())for(const id of [...pending.keys()])finishEating(id);}else settingsError('다른 탭의 애니메이션 설정을 읽지 못했습니다.');return;}if(event.key!==null&&event.key!==FridgeStorage.key)return;for(const entry of pending.values())clearTimeout(entry.timer);pending.clear();undoItem=null;$('undo-notice').hidden=true;writable=false;$('submit-button').disabled=true;storageError('다른 탭에서 저장 데이터가 변경되었습니다. 최신 데이터를 불러오려면 새로고침해 주세요.');render();});
let lastDate=FridgeDates.todayLocal();setInterval(()=>{const now=FridgeDates.todayLocal();if(now!==lastDate){lastDate=now;render();}},1000);
render();
