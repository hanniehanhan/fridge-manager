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
  const timers=new Map();let timerId=0;const events={};const media={matches:systemReduced,addEventListener:(k,f)=>{events.media=f}};
  class Element{
    constructor(){this.children=[];this.value='';this.hidden=true;this.handlers={};this.attributes={};this.textContent='';this.classList={add(){},remove(){},toggle(){}};}
    set innerHTML(value){throw Error('unsafe innerHTML');}
    append(...children){this.children.push(...children);} replaceChildren(...children){this.children=children;}
    setAttribute(k,v){this.attributes[k]=v;} addEventListener(k,f){this.handlers[k]=f;}
    focus(){} scrollIntoView(){} reset(){for(const key of ['name','quantity','unit','expiry'])elements[key].value='';elements.location.value='fridge';}
  }
  const elements={};const get=id=>elements[id]??=new Element();
  for(const id of ['location','filter-location','filter-status','search','name','quantity','unit','expiry'])get(id);
  elements.location.value='fridge';elements['filter-location'].value=elements['filter-status'].value='all';
  let confirmed=false;
  const c=vm.createContext({localStorage:storage,crypto:{randomUUID:()=>String(Math.random())},document:{documentElement:new Element(),getElementById:get,createElement:()=>new Element(),createElementNS:()=>new Element(),addEventListener(){}},window:{matchMedia:()=>media,addEventListener:(k,f)=>{events[k]=f},confirm:()=>confirmed},setInterval(){},setTimeout:(f)=>{timers.set(++timerId,f);return timerId;},clearTimeout:id=>timers.delete(id)});
  for(const f of ['date-utils.js','storage.js','app.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);
  return {storage,timers,events,media,flush:()=>{for(const [id,fn] of [...timers]){timers.delete(id);fn();}},elements,get,c,confirm:value=>{confirmed=value},submit:(name=item.name,expiry=item.expiry)=>{for(const [k,v]of Object.entries({name,quantity:'0.5',unit:'팩',expiry,location:'fridge'}))get(k).value=v;get('food-form').handlers.submit({preventDefault(){}});},click:(id)=>get(id).handlers.click(),render:()=>vm.runInContext('render()',c)};
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
