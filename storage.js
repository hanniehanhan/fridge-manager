'use strict';
(function(root){
  const KEY = 'yellow-fridge-v1';
  function validate(items){
    if(!Array.isArray(items)) throw new Error('invalid data');
    const ids = new Set();
    for(const item of items){
      if(!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length>100 || typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || item.quantity<0.001 || typeof item.unit !== 'string' || !item.unit.trim() || item.unit.length>20 || !root.FridgeDates.validDate(item.expiry) || !['fridge','freezer','pantry'].includes(item.location) || !['active','used'].includes(item.state) || (item.state==='used' && (typeof item.usedAt!=='string' || !Number.isFinite(Date.parse(item.usedAt))))) throw new Error('invalid item');
      ids.add(item.id);
    }
    return items;
  }
  root.FridgeStorage = {
    key: KEY,
    loadMotion(){try{const raw=root.localStorage.getItem('chihuahua-motion-v1');if(raw===null)return {ok:true,value:false};if(raw!=='true'&&raw!=='false')throw new Error('invalid preference');return {ok:true,value:raw==='true'};}catch(error){return {ok:false,value:false,error};}},
    saveMotion(value){try{root.localStorage.setItem('chihuahua-motion-v1',String(value));return {ok:true};}catch(error){return {ok:false,error};}},
    load(){try{const raw=root.localStorage.getItem(KEY);return {ok:true,items:raw===null?[]:validate(JSON.parse(raw))};}catch(error){return {ok:false,error};}},
    save(items){try{validate(items);root.localStorage.setItem(KEY,JSON.stringify(items));return {ok:true};}catch(error){return {ok:false,error};}}
  };
})(globalThis);
