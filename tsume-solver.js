/* Shared, bounded mate verification for original and authored puzzles. */
const TsumeSolver=(()=>{
 const stock=[0,18,4,4,4,4,2,2],types=[1,2,3,4,5,6,7,8,9,10,11,12,14,15];
 function position(q){
  const s={board:Array(81).fill(0),hands:[Array(8).fill(0),stock.slice()],turn:1,ply:0,last:null};
  if(!q||!Array.isArray(q.pieces)||!Array.isArray(q.hand)||![1,3,5].includes(q.depth))throw Error('手数は1・3・5手から選んでください。');
  const kings=[0,0];
  for(const pair of q.pieces){
   if(!Array.isArray(pair)||pair.length!==2)throw Error('駒の配置を確認してください。');
   const [i,p]=pair,t=Math.abs(p),base=t>8?t-8:t;
   if(!Number.isInteger(i)||i<0||i>80||!Number.isInteger(p)||!types.includes(t)||s.board[i])throw Error('駒の配置を確認してください。');
   s.board[i]=p;if(t===8)kings[p>0?0:1]++;else s.hands[1][base]--;
   const distance=p>0?Math.floor(i/9):8-Math.floor(i/9);
   if(((t===1||t===2)&&distance===0)||(t===3&&distance<2))throw Error('動けなくなる段に歩・香車・桂馬があります。成駒にするか、位置を変えてください。');
  }
  if(kings[1]!==1||kings[0]>1)throw Error('相手の玉を1枚置いてください。自分の玉は0枚か1枚です。');
  for(const t of q.hand){if(!Number.isInteger(t)||t<1||t>7)throw Error('持ち駒を確認してください。');s.hands[0][t]++;s.hands[1][t]--;}
  if(s.hands[1].some(n=>n<0))throw Error('駒の枚数が将棋1組の枚数を超えています。');
  for(const side of [1,-1])for(let c=0;c<9;c++)if(s.board.filter((p,i)=>p===side&&i%9===c).length>1)throw Error('同じ縦の列に歩が2枚あります。1枚を移動するか成駒にしてください。');
  return s;
 }
 function verify(q,createEngine,{budgetMs=10000,maxNodes=500000}={}){
  const E=createEngine({allowMissingKing:true}),initial=position(q),deadline=Date.now()+budgetMs,memo=new Map(),proof={},seen=new Set();let nodes=0;
  if(E.inCheck(initial,-1))throw Error('最初から相手の玉に王手がかかっています。王手の一手前の形にしてください。');
  if(E.inCheck(initial,1))throw Error('自分の玉に王手がかかっています。配置を見直してください。');
  function solve(s,d){
   if(++nodes>maxNodes||Date.now()>deadline)throw Error('調べる手が多いため、確認を中断しました。駒を減らすか手数を短くして、もう一度確認してください。');
   const key=E.key(s)+'/'+d;if(memo.has(key))return memo.get(key);
   const moves=E.legalMoves(s);
   if(s.turn===-1&&!moves.length)return E.inCheck(s,-1)?0:Infinity;
   if(!d)return Infinity;
   let v=s.turn===1?Infinity:0;
   for(const m of moves){const n=E.apply(s,m);if(s.turn===1&&!E.inCheck(n,-1))continue;const child=solve(n,d-1)+1;v=s.turn===1?Math.min(v,child):Math.max(v,child);if((s.turn===1&&v===1)||(s.turn===-1&&!Number.isFinite(v)))break;}
   memo.set(key,v);return v;
  }
  const distance=solve(initial,q.depth);
  if(!Number.isFinite(distance))throw Error(q.depth+'手以内では詰みません。玉の逃げ道と持ち駒を見直しましょう。');
  if(distance!==q.depth)throw Error('この形は'+distance+'手で詰みます。指定の手数を変更してください。');
  function walk(s,d){
   const k=E.key(s);if(seen.has(k+'/'+d))return;seen.add(k+'/'+d);const moves=E.legalMoves(s),node={distance:solve(s,d)};proof[k]=node;
   if(s.turn===-1&&!moves.length){node.wins=[];return;}
   if(s.turn===1){node.wins=moves.filter(m=>{const n=E.apply(s,m);return E.inCheck(n,-1)&&Number.isFinite(solve(n,d-1));});if(node.wins.length!==1)throw Error('正解になる手が複数あります（'+s.ply+'手目の局面）。配置を変えて正解を一つにしましょう。');walk(E.apply(s,node.wins[0]),d-1);}
   else{const values=moves.map(m=>solve(E.apply(s,m),d-1));if(values.some(v=>!Number.isFinite(v)))throw Error('玉が逃げられる手があります。');const longest=Math.max(...values),replies=moves.filter((_,i)=>values[i]===longest);node.reply=replies[0];for(const m of replies)walk(E.apply(s,m),d-1);}
  }
  walk(initial,q.depth);return {initial,proof,distance,nodes};
 }
 return {stock,types,position,verify};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=TsumeSolver;
