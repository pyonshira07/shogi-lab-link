'use strict';
importScripts('vendor/yaneuraou/yaneuraou.halfkp.js');
let engine=null,revision=0,chain=Promise.resolve();
function waitFor(prefix,command){return new Promise(resolve=>{const listener=line=>{if(line.startsWith(prefix)){engine.removeMessageListener(listener);resolve(line);}};engine.addMessageListener(listener);engine.postMessage(command);});}
const ready=YaneuraOu_HalfKP({mainScriptUrlOrBlob:new URL('vendor/yaneuraou/yaneuraou.halfkp.js',self.location.href).href,locateFile:name=>new URL('vendor/yaneuraou/'+name,self.location.href).href}).then(async e=>{
  engine=e;await waitFor('usiok','usi');
  engine.postMessage('setoption name USI_Hash value 64');
  engine.postMessage('setoption name Threads value 2');
  engine.postMessage('setoption name EnteringKingRule value NoEnteringKing');
  engine.postMessage('setoption name USI_OwnBook value false');
  engine.postMessage('setoption name PvInterval value 1000');
  await waitFor('readyok','isready');engine.postMessage('usinewgame');return engine;
});
let lastInfo='';ready.then(e=>e.addMessageListener(line=>{if(line.startsWith('info depth'))lastInfo=line;})).catch(()=>{});
onmessage=({data})=>{
  if(data.type==='init'){ready.then(()=>postMessage({id:data.id,ready:true})).catch(e=>postMessage({id:data.id,error:String(e)}));return;}
  const token=++revision;engine?.postMessage('stop');
  if(data.type==='stop')return;
  chain=chain.catch(()=>{}).then(async()=>{
    try{
      await ready;if(token!==revision){postMessage({id:data.id,error:'cancelled'});return;}
      const c=data.config;lastInfo='';engine.postMessage('setoption name SkillLevel value '+c.skill);
      engine.postMessage('position startpos'+(data.moves.length?' moves '+data.moves.join(' '):''));
      const line=await waitFor('bestmove','go movetime '+c.time+(c.depth?' depth '+c.depth:''));
      postMessage({id:data.id,move:line.split(' ')[1],info:lastInfo,cancelled:token!==revision});
    }catch(e){postMessage({id:data.id,error:String(e)});}
  });
};
