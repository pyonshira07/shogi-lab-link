/* AI settings, USI mapping and small position-matched opening book. */
const ShogiAI = (()=>{
  const levels={beginner:{name:'初級'},intermediate:{name:'中級',skill:2,depth:3,time:250},advanced:{name:'上級',skill:12,depth:12,time:1600},god:{name:'神',skill:20,time:4500}};
  const square=i=>(9-i%9)+'abcdefghi'[Math.floor(i/9)];
  const toUSI=m=>(m.drop?' PLNSGBR'[m.drop]+'*':square(m.from))+square(m.to)+(m.promote?'+':'');
  const fromSquare=s=>(s.charCodeAt(1)-97)*9+9-Number(s[0]);
  const fromUSI=s=>s?.[1]==='*'?{from:null,to:fromSquare(s.slice(2,4)),drop:' PLNSGBR'.indexOf(s[0]),promote:false}:{from:fromSquare(s.slice(0,2)),to:fromSquare(s.slice(2,4)),promote:s.endsWith('+')};
  // Standard opening branches. Match the whole position, never force a script.
  const lines=[
    '7g7f 3c3d 2g2f 8c8d 2f2e 8d8e 6i7h 4a3b',
    '2g2f 8c8d 2f2e 8d8e 7g7f 3c3d 6i7h 4a3b',
    '7g7f 3c3d 2g2f 4c4d 7i6h 3a4b 5g5f 4b4c',
    '7g7f 3c3d 6g6f 8c8d 7i6h 7a6b 6h6g 5c5d',
    '2g2f 8c8d 7g7f 3c3d 2f2e 2b3c 3i4h 3a2b'
  ];
  function book(E){const map=new Map();for(const line of lines){let s=E.initial();for(const u of line.split(' ')){const m=fromUSI(u);if(s.turn===-1){const k=E.key(s);if(!map.has(k))map.set(k,[]);if(!map.get(k).includes(u))map.get(k).push(u);}s=E.play(s,m);}}return map;}
  function create(){
    let worker=null,loading=null,nextId=0;const pending=new Map();
    function dispose(){worker?.terminate();worker=null;loading=null;for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('AIの準備を中止しました。'));}pending.clear();}
    function request(data,ms){return new Promise((resolve,reject)=>{const id=++nextId,timer=setTimeout(()=>{pending.delete(id);reject(new Error('AIの応答を確認できませんでした。もう一度お試しください。'));dispose();},ms);pending.set(id,{resolve,reject,timer});worker.postMessage({...data,id});});}
    function ready(){
      if(loading)return loading;
      if(!globalThis.crossOriginIsolated)return Promise.reject(new Error('この環境では対局を始められませんでした。ゲームのURLを開き直すか、初級でお楽しみください。'));
      worker=new Worker(new URL('strong-worker.js',document.baseURI));
      worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;clearTimeout(p.timer);pending.delete(data.id);data.error?p.reject(new Error('対局を準備できませんでした。少し待って、もう一度お試しください。')):p.resolve(data);};
      worker.onerror=e=>{e.preventDefault();dispose();};
      loading=request({type:'init'},60000).catch(e=>{dispose();throw e;});return loading;
    }
    async function search(moves,level){await ready();return request({type:'search',moves,config:levels[level]},levels[level].time+15000);}
    function cancel(){if(worker)worker.postMessage({type:'stop'});for(const [id,p] of pending)if(loading){clearTimeout(p.timer);p.reject(new Error('cancelled'));pending.delete(id);}}
    return {ready,search,cancel,dispose};
  }
  return {levels,toUSI,fromUSI,book,lines,create};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=ShogiAI;
