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
 return {sample,clean,put,copy};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=ShogiSchoolCore;
