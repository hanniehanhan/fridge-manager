const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(storage){const c=vm.createContext({localStorage:storage});for(const f of ['date-utils.js','storage.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);return c;}
function memory(initial={}){const data=new Map(Object.entries(initial));return {getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v)}};}
const item={id:'a',name:'<img src=x onerror=alert(1)>',quantity:0.5,unit:'팩',expiry:'2026-10-24',location:'fridge',state:'active',usedAt:null};
test('date boundaries, leap year, year rollover',()=>{const {FridgeDates:d}=setup(memory());for(const [date,status] of [['2026-10-23','expired'],['2026-10-24','today'],['2026-10-25','soon'],['2026-10-27','soon'],['2026-10-28','fresh']])assert.equal(d.status(date,'2026-10-24'),status);assert.equal(d.status('2027-01-01','2026-12-31'),'soon');assert.equal(d.status('2024-03-01','2024-02-28'),'soon');assert.equal(d.validDate('2024-02-29'),true);for(const value of ['2026-02-29','2026-04-31','0000-01-01','bad'])assert.equal(d.validDate(value),false);});
test('today uses local calendar fields',()=>{const {FridgeDates:d}=setup(memory());assert.equal(d.todayLocal({getFullYear:()=>2026,getMonth:()=>9,getDate:()=>24}),'2026-10-24');});
test('empty storage and round trip including literal unsafe-looking name',()=>{const {FridgeStorage:s}=setup(memory());assert.equal(s.load().items.length,0);assert.equal(s.save([item]).ok,true);assert.equal(s.load().items[0].name,item.name);});
test('read, parse and schema errors preserve original storage',()=>{for(const raw of ['{','{}','null',JSON.stringify([{...item,expiry:'2026-02-30'}]),JSON.stringify([item,item])]){let writes=0;const {FridgeStorage:s}=setup({getItem:()=>raw,setItem:()=>writes++});assert.equal(s.load().ok,false);assert.equal(writes,0);}assert.equal(setup({getItem(){throw Error('denied')}}).FridgeStorage.load().ok,false);});
test('write failure and invalid quantity never report success',()=>{const {FridgeStorage:s}=setup({getItem:()=>null,setItem(){throw Error('quota')}});assert.equal(s.save([item]).ok,false);assert.equal(setup(memory()).FridgeStorage.save([{...item,quantity:0}]).ok,false);});
test('used history persists through edit and reload',()=>{const {FridgeStorage:s}=setup(memory());const used={...item,state:'used',usedAt:'2026-10-24T01:00:00Z'};assert.equal(s.save([used]).ok,true);const edited={...s.load().items[0],name:'우유'};assert.equal(s.save([edited]).ok,true);assert.equal(s.load().items[0].state,'used');assert.equal(s.load().items[0].usedAt,used.usedAt);});
function app(storage=memory(),systemReduced=true){
  const images=[];const timers=new Map();let timerId=0;const events={};const media={matches:systemReduced,addEventListener:(k,f)=>{events.media=f}};
  class Element{
    constructor(){this.children=[];this.value='';this.hidden=true;this.handlers={};this.attributes={};this.textContent='';this.classList={add(){},remove(){},toggle(){}};}
    set innerHTML(value){throw Error('unsafe innerHTML');}
    append(...children){this.children.push(...children);} replaceChildren(...children){this.children=children;}
    querySelector(tag){return this.children.find(c=>tag==='img'?c.src!==undefined:false);} getAttribute(k){return this.attributes[k]??null;} removeAttribute(k){delete this.attributes[k];} setAttribute(k,v){this.attributes[k]=v;} addEventListener(k,f){this.handlers[k]=f;}
    focus(){} scrollIntoView(){} reset(){for(const key of ['name','quantity','unit','expiry'])elements[key].value='';elements.location.value='fridge';}
  }
  const elements={};const get=id=>elements[id]??=new Element();
  for(const id of ['location','filter-location','filter-status','search','name','quantity','unit','expiry'])get(id);
  elements.location.value='fridge';elements['filter-location'].value=elements['filter-status'].value='all';
  let confirmed=false;
  const c=vm.createContext({Image:class{constructor(){images.push(this)}},localStorage:storage,crypto:{randomUUID:()=>String(Math.random())},document:{documentElement:new Element(),getElementById:get,createElement:()=>{const e=new Element();e.hidden=false;return e;},createElementNS:()=>{const e=new Element();e.hidden=false;return e;},querySelectorAll:()=>[],addEventListener(){}},window:{matchMedia:()=>media,addEventListener:(k,f)=>{events[k]=f},confirm:()=>confirmed},setInterval(){},setTimeout:(f)=>{timers.set(++timerId,f);return timerId;},clearTimeout:id=>timers.delete(id)});
  for(const f of ['date-utils.js','storage.js','animation.js','app.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);
  return {images,storage,timers,events,media,flush:()=>{for(const [id,fn] of [...timers]){timers.delete(id);fn();}},elements,get,c,confirm:value=>{confirmed=value},submit:(name=item.name,expiry=item.expiry)=>{for(const [k,v]of Object.entries({name,quantity:'0.5',unit:'팩',expiry,location:'fridge'}))get(k).value=v;get('food-form').handlers.submit({preventDefault(){}});},click:(id)=>get(id).handlers.click(),render:()=>vm.runInContext('render()',c)};
}
test('UI CRUD, ordering, search, combined filters, cancel/delete and history',()=>{
  const a=app();assert.equal(a.get('food-list').children[0].children[0].textContent,'냉장고의 첫 기록을 남겨보세요');
  a.submit('우유','2026-10-28');a.submit(item.name,'2026-10-24');
  let cards=a.get('food-list').children;assert.equal(cards.length,2);assert.equal(cards[0].children[0].children[0].textContent,item.name);
  cards[0].children.at(-1).children[0].handlers.click();a.get('name').value='수정된 우유';a.get('food-form').handlers.submit({preventDefault(){}});assert.equal(a.get('food-list').children[0].children[0].children[0].textContent,'수정된 우유');
  a.get('search').value='수정';a.get('filter-location').value='freezer';a.render();assert.equal(a.get('count').textContent,'0개');a.get('filter-location').value='fridge';a.render();assert.equal(a.get('count').textContent,'1개');
  a.get('search').value='';a.render();a.get('food-list').children[0].children.at(-1).children[1].handlers.click();assert.equal(a.get('count').textContent,'1개');a.click('used-tab');assert.equal(a.get('count').textContent,'1개');
  a.get('food-list').children[0].children.at(-1).children.at(-1).handlers.click();assert.equal(a.get('count').textContent,'1개');a.confirm(true);a.get('food-list').children[0].children.at(-1).children.at(-1).handlers.click();assert.equal(a.get('count').textContent,'0개');
});
test('UI failed save retains form, no new card and no success notice',()=>{const a=app({getItem:()=>null,setItem(){throw Error('quota')}});a.submit();assert.equal(a.get('storage-error').hidden,false);assert.equal(a.get('message').hidden,true);assert.equal(a.get('name').value,item.name);assert.equal(a.get('count').textContent,'0개');});
test('UI load failure blocks edits and displays error',()=>{const a=app({getItem:()=>'{',setItem(){throw Error('must not write')}});assert.equal(a.get('submit-button').disabled,true);assert.equal(a.get('storage-error').hidden,false);a.submit();assert.equal(a.get('count').textContent,'0개');});
function clickEat(a){a.get('food-list').children[0].children.at(-1).children[1].handlers.click();}
function seed(){return memory({'yellow-fridge-v1':JSON.stringify([item])});}
test('legacy data loads unchanged, missing preferences default to false',()=>{const storage=seed();const before=storage.getItem('yellow-fridge-v1');const a=app(storage);assert.equal(a.get('count').textContent,'1개');assert.equal(a.get('reduce-motion').checked,false);assert.equal(storage.getItem('yellow-fridge-v1'),before);});
test('eat saves before animation, duplicate clicks do not write twice, reload keeps used',()=>{
  const data=seed();let writes=0;const storage={getItem:k=>data.getItem(k),setItem:(k,v)=>{writes++;data.setItem(k,v)}};const a=app(storage,false);
  const handler=a.get('food-list').children[0].children.at(-1).children[1].handlers.click;
  handler();assert.equal(JSON.parse(data.getItem('yellow-fridge-v1'))[0].state,'used');assert.equal(vm.runInContext('pending.size',a.c),1);assert.equal(a.get('food-list').children[0].className,'food-card eating-card');handler();assert.equal(writes,1);
  const reload=app(data);assert.equal(reload.get('count').textContent,'0개');reload.click('used-tab');assert.equal(reload.get('count').textContent,'1개');
  a.flush();assert.equal(vm.runInContext('pending.size',a.c),0);assert.equal(a.get('count').textContent,'0개');a.click('used-tab');assert.equal(a.get('count').textContent,'1개');
});
test('undo during animation restores exact original data, clears timer and can only run once',()=>{
  const data=seed();const a=app(data,false);clickEat(a);a.click('undo-button');assert.deepEqual(JSON.parse(data.getItem('yellow-fridge-v1')),[item]);assert.equal(vm.runInContext('pending.size',a.c),0);assert.equal(a.timers.size,0);a.click('undo-button');a.flush();assert.equal(a.get('count').textContent,'1개');assert.equal(a.get('undo-notice').hidden,true);
});
test('failed eat retains original card, no animation or success',()=>{
  const data=seed();const storage={getItem:k=>data.getItem(k),setItem(){throw Error('denied')}};const a=app(storage,false);clickEat(a);assert.equal(vm.runInContext('pending.size',a.c),0);assert.equal(a.timers.size,0);assert.equal(a.get('count').textContent,'1개');assert.equal(a.get('message').hidden,true);assert.equal(a.get('storage-error').hidden,false);assert.deepEqual(JSON.parse(data.getItem('yellow-fridge-v1')),[item]);
});
test('failed undo retains used data and retry succeeds',()=>{
  const data=seed();let fail=false;const storage={getItem:k=>data.getItem(k),setItem:(k,v)=>{if(fail)throw Error('quota');data.setItem(k,v)}};const a=app(storage);clickEat(a);fail=true;a.click('undo-button');assert.equal(JSON.parse(data.getItem('yellow-fridge-v1'))[0].state,'used');assert.equal(a.get('undo-notice').hidden,false);assert.equal(a.get('storage-error').hidden,false);fail=false;a.click('undo-button');assert.deepEqual(JSON.parse(data.getItem('yellow-fridge-v1')),[item]);
});
test('reduced motion from system or saved setting skips animation, preference persists separately',()=>{
  for(const system of [true,false]){const data=seed();if(!system)data.setItem('chihuahua-motion-v1','true');const a=app(data,system);clickEat(a);assert.equal(vm.runInContext('pending.size',a.c),0);assert.equal(a.get('count').textContent,'0개');assert.equal(a.get('undo-notice').hidden,false);a.click('undo-button');assert.equal(a.get('count').textContent,'1개');}
  const data=seed(),a=app(data,false);a.get('reduce-motion').checked=true;a.get('reduce-motion').handlers.change();assert.equal(data.getItem('chihuahua-motion-v1'),'true');assert.equal(app(data,false).get('reduce-motion').checked,true);
});
test('failed motion preference save restores previous setting',()=>{const data=seed();const a=app({getItem:k=>data.getItem(k),setItem(){throw Error('denied')}},false);a.get('reduce-motion').checked=true;a.get('reduce-motion').handlers.change();assert.equal(a.get('reduce-motion').checked,false);assert.equal(a.get('settings-error').hidden,false);});
test('turning on reduced motion or system preference finishes active animation',()=>{for(const kind of ['setting','system']){const a=app(seed(),false);clickEat(a);if(kind==='setting'){a.get('reduce-motion').checked=true;a.get('reduce-motion').handlers.change();}else{a.media.matches=true;a.events.media();}assert.equal(vm.runInContext('pending.size',a.c),0);assert.equal(a.timers.size,0);assert.equal(a.get('count').textContent,'0개');}});
test('expired warning is separate from today/soon prompt and empty is not search-no-results',()=>{const data=seed();const today=setup(memory()).FridgeDates.todayLocal();data.setItem('yellow-fridge-v1',JSON.stringify([{...item,expiry:'2000-01-01'},{...item,id:'b',expiry:today}]));const a=app(data);assert.equal(a.get('dog-dialogue').textContent,'이것부터 확인해 봐!');assert.match(a.get('expired-summary').textContent,/섭취를 권하는 안내가 아닙니다/);a.get('search').value='nothing';a.render();assert.equal(a.get('dog-dialogue').textContent,'이것부터 확인해 봐!');assert.equal(a.get('food-list').children[0].children[0].textContent,'조건에 맞는 식재료가 없어요');assert.equal(app().get('dog-dialogue').textContent,'냉장고가 텅 비었네!');});
test('cross-tab data changes clean up pending and lock writes; settings changes do not lock foods',()=>{const a=app(seed(),false);a.events.storage({key:'chihuahua-motion-v1'});assert.equal(vm.runInContext('writable',a.c),true);clickEat(a);a.events.storage({key:'yellow-fridge-v1'});assert.equal(vm.runInContext('pending.size',a.c),0);assert.equal(a.timers.size,0);assert.equal(a.get('submit-button').disabled,true);assert.equal(a.get('undo-notice').hidden,true);});
test('animation rendering exception still clears pending and leaves saved record correct',()=>{const a=app(seed(),false);const original=a.c.document.createElement;let first=true;a.c.document.createElement=(tag)=>{if(first&&tag==='img'){first=false;throw Error('simulated render failure');}return original(tag);};clickEat(a);assert.equal(vm.runInContext('pending.size',a.c),0);assert.equal(a.timers.size,0);assert.equal(JSON.parse(a.storage.getItem('yellow-fridge-v1'))[0].state,'used');assert.equal(a.get('count').textContent,'0개');});

test('static image uses relative source and an image load failure does not block food actions',()=>{const a=app(seed(),false);clickEat(a);const scene=a.get('food-list').children[0].children[0];const img=scene.children[1];assert.equal(img.src,'assets/chihuahua.png');assert.equal(img.alt,'');img.handlers.error({target:img});assert.equal(img.hidden,true);assert.equal(a.get('image-error').hidden,false);a.flush();a.click('undo-button');assert.equal(a.get('count').textContent,'1개');});
function animation(){const images=[];const c=vm.createContext({Image:class{constructor(){images.push(this)}}});vm.runInContext(fs.readFileSync('animation.js','utf8'),c);return {a:c.FridgeAnimation,images};}
test('frame sequences blink, drool, two bites and licking in supplied order',()=>{const {a}=animation();assert.equal(a.idle(0),0);assert.equal(a.idle(4610),1);assert.equal(a.idle(4750),2);assert.equal(a.idle(4900),3);assert.equal(a.idle(5000),0);assert.deepEqual([0,200,450,750,1100].map(t=>a.drool(t)),[4,5,6,7,0]);assert.equal(a.eat(0),8);assert.equal(a.eat(210),9);assert.equal(a.eat(370),10);assert.equal(a.eat(550),11);assert.equal(a.eat(1080),8);assert.equal(a.eat(1290),9);assert.equal(a.eat(2180),12);assert.equal(a.eat(2350),13);assert.equal(a.eat(2550),14);assert.equal(a.eat(2800),15);assert.equal(a.eat(a.duration),0);assert.deepEqual([0,200,1279,1280].map(t=>a.portions(t)),[2,1,1,0]);});
test('all 16 frames must preload before animation is enabled; one failure uses fallback',()=>{const {a,images}=animation();const results=[];a.preload(ok=>results.push(ok));assert.equal(images.length,16);for(const img of images.slice(0,15))img.onload();assert.equal(a.ready,false);images[15].onload();assert.equal(a.ready,true);assert.deepEqual(results,[true]);const failed=animation();const result=[];failed.a.preload(ok=>result.push(ok));failed.images[3].onerror();for(const img of failed.images)img.onload();assert.equal(failed.a.ready,false);assert.deepEqual(result,[false]);});
test('keyboard focus and mouse request drool, touch does not require hover; reduced motion suppresses it',()=>{for(const reduced of [false,true]){const a=app(seed(),reduced);const btn=a.get('food-list').children[0].children.at(-1).children[1];btn.handlers.pointerenter({pointerType:'touch'});assert.equal(vm.runInContext('droolStart',a.c),null);btn.handlers.focus();assert.equal(vm.runInContext('droolStart!==null',a.c),!reduced);}});
test('normalized frames exist as separate 320px PNG files with a common baseline',()=>{const report=JSON.parse(fs.readFileSync('assets/frames/alignment.json'));assert.equal(report.frames.length,16);for(const f of report.frames){const b=fs.readFileSync(`assets/frames/${String(f.index).padStart(2,'0')}.png`);assert.equal(b.readUInt32BE(16),320);assert.equal(b.readUInt32BE(20),320);assert.equal(f.baseline,304);assert.equal(f.output[1]+f.output[3],304);assert.ok(f.output[0]>=0&&f.output[0]+f.output[2]<=320);}});
test('a decoded frame failing later restores the static image without undo/data loss',()=>{const a=app(seed(),false);const images=[];a.c.Image=class{constructor(){images.push(this)}};a.c.FridgeAnimation.preload(()=>{});for(const img of images)img.onload();clickEat(a);const img=a.get('food-list').children[0].children[0].children[1];assert.match(img.src,/assets\/frames\/08\.png/);assert.equal(img.getAttribute('data-frame'),'8');a.c.document.querySelectorAll=selector=>['[data-eating-id]','[data-frame]'].includes(selector)?[img]:[];img.handlers.error({target:img});assert.equal(img.src,'assets/chihuahua.png');assert.equal(a.get('hero-dog').src,'assets/chihuahua.png');assert.equal(a.c.FridgeAnimation.ready,false);a.flush();a.click('undo-button');assert.equal(a.get('count').textContent,'1개');});
test('reduced motion holds a loaded sprite on open eyes instead of playing expressions',()=>{const a=app(seed(),true);const images=[];a.c.Image=class{constructor(){images.push(this)}};a.c.FridgeAnimation.preload(()=>{});for(const img of images)img.onload();a.render();assert.equal(a.get('hero-dog').getAttribute('data-frame'),'0');clickEat(a);assert.equal(vm.runInContext('pending.size',a.c),0);});
test('clock-driven playback updates both the image frame and plate without restarting on render',()=>{const a=app(seed(),false);const images=[];a.c.Image=class{constructor(){images.push(this)}};a.c.FridgeAnimation.preload(()=>{});for(const img of images)img.onload();clickEat(a);const scene=a.get('food-list').children[0].children[0],plate=scene.children[0],img=scene.children[1];a.c.document.querySelectorAll=selector=>selector==='[data-eating-id]'?[img]:selector==='[data-plate-id]'?[plate]:[];vm.runInContext('Date.now=()=>pending.values().next().value.started+210;paintAnimation()',a.c);assert.equal(img.getAttribute('data-frame'),'9');assert.equal(plate.getAttribute('data-portions'),'1');vm.runInContext('Date.now=()=>pending.values().next().value.started+1290;paintAnimation()',a.c);assert.equal(plate.getAttribute('data-portions'),'0');assert.equal(img.getAttribute('data-frame'),'9');a.render();assert.equal(vm.runInContext('pending.size',a.c),1);});
function connectScenes(a){
  const scan=root=>[root,...root.children.flatMap(scan)];
  a.c.document.querySelectorAll=selector=>{
    const nodes=scan(a.get('food-list'));
    if(selector==='.use')return nodes.filter(n=>n.className==='use');
    const attr=selector.slice(1,-1);return nodes.filter(n=>n.getAttribute(attr)!==null);
  };
}
function useButton(a){return a.c.document.querySelectorAll('.use')[0];}
function timeAt(a,time){vm.runInContext(`Date.now=()=>${time};paintAnimation()`,a.c);}
test('after adding and editing, actual selected frames drool, repeat on hover, stop on leave, and work on focus',()=>{
  const a=app(memory(),false);connectScenes(a);for(const img of a.images)img.onload();a.submit('사과');
  for(const edited of [false,true]){
    if(edited){a.get('food-list').children[0].children.at(-1).children[0].handlers.click();a.get('name').value='수정 사과';a.get('food-form').handlers.submit({preventDefault(){}});}
    let button=useButton(a);button.handlers.pointerenter({pointerType:'mouse'});const start=vm.runInContext('droolStart',a.c);
    for(const [elapsed,frame] of [[0,4],[200,5],[500,6],[800,7],[1200,0],[2400,4]]){timeAt(a,start+elapsed);assert.equal(a.get('hero-dog').getAttribute('data-frame'),String(frame));}
    const preview=a.c.document.querySelectorAll('[data-preview-id]')[0];assert.equal(preview.getAttribute('data-preview-active'),'true');assert.equal(preview.querySelector('img').getAttribute('data-frame'),'4');
    button.handlers.pointerleave();assert.equal(vm.runInContext('droolStart',a.c),null);assert.equal(preview.getAttribute('data-preview-active'),'false');assert.ok(Number(a.get('hero-dog').getAttribute('data-frame'))<4);
    button.handlers.focus();assert.equal(a.get('hero-dog').getAttribute('data-frame'),'4');button.handlers.blur();assert.equal(vm.runInContext('droolStart',a.c),null);
  }
});
test('hover then eat has priority and leaves the bowl visible while changing food amounts',()=>{
 const a=app(seed(),false);connectScenes(a);for(const img of a.images)img.onload();const button=useButton(a);button.handlers.mouseenter();button.handlers.click();
 const start=vm.runInContext('pending.values().next().value.started',a.c);button.handlers.focus();assert.equal(vm.runInContext('droolStart',a.c),null);
 for(const [elapsed,frame,portions]of [[0,8,2],[210,9,1],[1290,9,0],[2800,15,0]]){timeAt(a,start+elapsed);assert.equal(a.get('hero-dog').getAttribute('data-frame'),String(frame));const bowl=a.c.document.querySelectorAll('[data-plate-id]')[0];assert.equal(bowl.className,'pet-bowl');assert.equal(bowl.getAttribute('data-portions'),String(portions));assert.notEqual(bowl.hidden,true);}
 a.flush();assert.equal(vm.runInContext('pending.size',a.c),0);
});
test('hover before preload finishes restarts a full sequence when all images become ready',()=>{const a=app(seed(),false);connectScenes(a);useButton(a).handlers.mouseenter();const start=vm.runInContext('droolStart',a.c);timeAt(a,start+3000);for(const img of a.images)img.onload();assert.equal(vm.runInContext('droolStart',a.c),start+3000);assert.equal(a.get('hero-dog').getAttribute('data-frame'),'4');});
test('rerender underneath a stationary mouse reconnects hover after new buttons enter the DOM',()=>{const a=app(seed(),false);connectScenes(a);for(const img of a.images)img.onload();const original=a.c.document.createElement;a.c.document.createElement=tag=>{const e=original(tag);e.matches=selector=>selector===':hover'&&e.className==='use';return e;};const media=a.c.window.matchMedia;a.c.window.matchMedia=q=>q==='(any-hover: hover)'?{matches:true}:media(q);a.render();assert.equal(a.get('hero-dog').getAttribute('data-frame'),'4');assert.ok(vm.runInContext('droolButton!==null',a.c));});
test('motion explanation identifies app and system settings, not a false animation error',()=>{const system=app(seed(),true);assert.match(system.get('motion-status').textContent,/기기\/브라우저/);assert.doesNotMatch(system.get('motion-status').textContent,/앱의/);const storage=seed();storage.setItem('chihuahua-motion-v1','true');const setting=app(storage,false);assert.match(setting.get('motion-status').textContent,/앱의/);assert.doesNotMatch(setting.get('motion-status').textContent,/기기\/브라우저/);});
test('scene geometry at 320,390,430 and desktop keeps bowl below chest, centered at feet and in bounds (CSS model only)',()=>{
 const css=fs.readFileSync('styles.css','utf8');assert.match(css,/\.pet-stage\{position:relative;isolation:isolate/);assert.match(css,/\.pet-bowl\{position:absolute;left:33\.333%;top:86%;width:33\.333%/);assert.ok(!css.includes('.empty{text-align'));
 for(const viewport of [320,390,430,1440]){
 const page=Math.min(1200,viewport)-(viewport<=380?28:viewport<=800?36:56);
 const scene=viewport<=800?Math.min(300,page):Math.min(420,(page-24)/2.2);
 const sceneHeight=scene*280/420,petWidth=Math.min(viewport<=800?165:220,scene*.54),petHeight=petWidth*350/320;
 const petX=.04*scene,petY=sceneHeight*.98-petHeight,bowlX=petX+petWidth/3,bowlY=petY+petHeight*.86,bowlW=petWidth/3,bowlH=bowlW*24/64;
 assert.ok(petX>=0&&petY>=0&&petX+petWidth<=scene);assert.ok(bowlX>=0&&bowlX+bowlW<=scene);assert.ok(bowlY+bowlH<=sceneHeight);assert.ok(bowlY>petY+petWidth*.8);assert.ok(Math.abs(bowlX+bowlW/2-(petX+petWidth/2))<.01);
 }
});
