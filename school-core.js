const ShogiSchoolCore=(()=>{
 const copy=x=>JSON.parse(JSON.stringify(x));
 const sample=()=>({id:'sample-1',title:'サンプル：飛車で金を守ろう',depth:1,pieces:[[7,-8],[15,7]],hand:[5],hint:'玉のすぐ前に金を置く形を考えてみましょう。その金に飛車の力が届くことが大切です。',lesson:'２二に金を置くと王手です。金は２一の玉だけでなく、その左右の逃げ道もふさぎます。玉が金を取ろうとしても、３二の飛車が金を守っているので取れません。隣からの王手なので、間に別の駒を置くこともできず、詰みになります。'});
 function clean(input){
  if(!input||typeof input!=='object')throw Error('問題のデータを読み取れません。');
  const text=(key,max)=>{if(typeof input[key]!=='string'||input[key].length>max)throw Error('文章の長さを確認してください。');return input[key].trim();};
  const q={id:typeof input.id==='string'&&/^[\w-]{1,64}$/.test(input.id)?input.id:null,title:text('title',60),depth:input.depth,pieces:copy(input.pieces),hand:copy(input.hand),hint:text('hint',600),lesson:text('lesson',2000)};
  if(!q.title)throw Error('問題の名前を入力してください。');
  if(!Array.isArray(q.pieces)||q.pieces.length>40||!Array.isArray(q.hand)||q.hand.length>38)throw Error('駒の枚数を確認してください。');
  TsumeSolver.position(q);return q;
 }
 function put(library,input,{id,now,expectedRevision}={}){
  const q=clean(input),items=copy(library.items||[]),index=q.id?items.findIndex(p=>p.id===q.id):-1;
  if(library.revision!==expectedRevision)throw Error('別の画面で更新されています。一覧を読み直してから保存してください。');
  if(index<0&&items.length>=10)throw Error('保存できるのは10問までです。既存の問題を編集するか、不要な問題を削除してください。');
  q.id=index<0?id:q.id;q.updatedAt=now;q.createdAt=index<0?now:items[index].createdAt;
  if(index<0)items.push(q);else items[index]=q;
  return {version:1,revision:library.revision+1,items};
 }
 const baseType=p=>Math.abs(p)>8?Math.abs(p)-8:Math.abs(p);
 function remaining(q,p){
  const t=baseType(p),total=[0,18,4,4,4,4,2,2,1][t];
  if(t===8)return total-q.pieces.filter(([,x])=>x===p).length;
  return total-q.pieces.filter(([,x])=>baseType(x)===t).length-q.hand.filter(x=>x===t).length;
 }
 // Picking up a piece does not change the position. A placement is one atomic edit.
 function place(q,held,target){
  if(!held||![1,2,3,4,5,6,7,8,9,10,11,12,14,15].includes(Math.abs(held.piece)))throw Error('駒を選んでください。');
  if(target!=='hand'&&target!=='box'&&(!Number.isInteger(target)||target<0||target>80))throw Error('盤のマスを選んでください。');
  const next=copy(q),p=held.piece,t=baseType(p),at=i=>next.pieces.find(([s])=>s===i)?.[1]||0;
  const set=(i,x)=>{next.pieces=next.pieces.filter(([s])=>s!==i);if(x)next.pieces.push([i,x]);};
  if(held.source==='board'){
   if(at(held.from)!==held.original||baseType(held.original)!==t)throw Error('駒を選び直してください。');
   set(held.from,0);
  }else if(held.source==='hand'){
   const i=next.hand.indexOf(t);if(i<0)throw Error('持ち駒を選び直してください。');next.hand.splice(i,1);
  }else if(held.source==='palette'){
   if(remaining(q,p)<1&&target!=='box')throw Error('この駒はすべて使っています。盤の駒を動かしてください。');
  }else throw Error('駒を選び直してください。');
  if(target==='hand'){
   if(t===8)throw Error('玉は持ち駒にできません。');next.hand.push(t);
  }else if(target!=='box'){
   const other=at(target);if(other&&held.source==='board'&&target!==held.from)set(held.from,other);
   set(target,p);
  }
  if([1,2,3,4,5,6,7,8,-8].some(x=>remaining(next,x)<0))throw Error('駒の枚数が多すぎます。玉は自分と相手に1枚ずつです。');
  return next;
 }
 return {sample,clean,put,copy,baseType,remaining,place};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=ShogiSchoolCore;
