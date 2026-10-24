'use strict';
(function(root){
  const sources=Array.from({length:16},(_,i)=>`assets/frames/${String(i).padStart(2,'0')}.png`);
  // Two complete bites/chew cycles, then tongue, both corners, satisfaction, idle.
  const eating=[[8,200],[9,160],[10,180],[11,180],[10,180],[11,180],[8,200],[9,160],[10,180],[11,180],[10,180],[11,180],[12,180],[13,200],[14,200],[15,400],[0,160]];
  const duration=eating.reduce((n,f)=>n+f[1],0);
  let ready=false,failed=false;
  function sample(sequence,elapsed){let end=0;for(const [frame,ms] of sequence){end+=ms;if(elapsed<end)return frame;}return 0;}
  root.FridgeAnimation={
    sources,duration,get ready(){return ready;},
    idle(elapsed){return sample([[0,4600],[1,100],[2,130],[3,170]],elapsed%5000);},
    drool(elapsed){return sample([[4,180],[5,220],[6,300],[7,300],[0,150]],elapsed);},
    eat(elapsed){return sample(eating,elapsed);},
    portions(elapsed){return elapsed<200?2:elapsed<1280?1:0;},
    preload(notify){
      if(typeof root.Image!=='function')return;
      let count=0;
      for(const src of sources){const img=new root.Image();img.onload=()=>{if(++count===16&&!failed){ready=true;notify(true);}};img.onerror=()=>{if(!failed){failed=true;ready=false;notify(false);}};img.src=src;}
    },
    disable(){ready=false;failed=true;}
  };
})(globalThis);
