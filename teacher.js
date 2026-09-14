/* Friendly explanations and original diagrams for the built-in tsume problems. */
const ShogiTeacher=(()=>{
 const pos=i=>'９８７６５４３２１'[i%9]+'一二三四五六七八九'[Math.floor(i/9)];
 const focus={
 '1-1':'玉のすぐ前を、金でふさぐ形を探してみましょう。金を置いた場所に、飛車の利きが届くかも見てください。',
 '1-2':'桂馬が跳べる二つの場所に注目しましょう。その利きを使うと、持ち駒の金を守れます。',
 '1-3':'金は一枚だけで攻めるより、仲間とつなげると強くなります。盤上の金が守れる場所を探してみましょう。',
 '3-1':'飛車を成って龍の横利きを作りましょう。相手が合駒で線を止めたら、跳び越えて王手する桂馬が役立ちます。',
 '3-2':'端から飛車を成り、龍で逃げ道を狭めます。合駒の後にも届く、桂馬の王手を探してみましょう。',
 '3-3':'飛車を成って玉を奥へ追い、盤上の金が守れる場所へ持ち駒の金を打つ順番を考えましょう。',
 '5-1':'角を打って玉の位置を限定し、もう一枚の角を馬にします。最後は銀が届く場所へ玉を追うのがコツです。',
 '5-2':'角を打って玉を端へ呼び、香車で縦の逃げ道をふさぎます。最後に金を打てる場所まで玉を追いましょう。',
 '5-3':'金で玉を呼び、角の長い利きで次の逃げ道を切ります。最後は持ち駒の飛車を打つ場所を探しましょう。'
 };
 const label=(s,m,E)=>pos(m.to)+E.FULL_NAMES[m.drop||Math.abs(s.board[m.from])]+(m.drop?'打':m.promote?'成':'');
 function line(puzzle,prefix,P,E){
  let s=P.position(puzzle);const steps=[{state:s,move:null,before:null}];
  for(const m of prefix){const before=s;s=E.play(s,m);steps.push({state:s,before,move:m});}
  for(let n=0;n<5;n++){
   const node=P.node(puzzle,s,E),m=s.turn===1?node?.wins?.[0]:node?.reply;
   if(!m)break;const before=s;s=E.play(s,m);steps.push({state:s,before,move:m});
  }
  return steps;
 }
 function explanation(puzzle,step,index,E){
  const {state:s,before,move:m}=step;
  if(!m)return {title:'まずは、玉の逃げ道を見てみよう。',paragraphs:[(puzzle.hint||focus[puzzle.id]||puzzle.lesson),'王手をかけるだけでなく、「その次に玉はどこへ行けるかな？」と一つ先を考えるのがコツです。']};
  if(before.turn===-1)return {title:'相手も、いちばん粘れる手を選びます。',paragraphs:m.drop?[
   pos(m.to)+'に'+E.FULL_NAMES[m.drop]+'を打ち、王手の線をさえぎりました。これが「合駒」です。',
   '玉が逃げる手だけを読んでいると、この受けを見落としがちです。次は、間の駒があっても王手できる方法を探しましょう。'
  ]:[pos(m.to)+'へ玉が逃げました。ここなら、いまの王手を外せます。','玉の位置が変わると、ふさぐべき逃げ道も変わります。持ち駒と盤上の駒を、もう一度つないで考えましょう。']};
  const moves=E.legalMoves(s),king=s.board.indexOf(-8),mate=E.inCheck(s,-1)&&moves.length===0;
  const t=m.drop||Math.abs(before.board[m.from]),piece=E.FULL_NAMES[t];
  if(!mate)return {title:piece+'を働かせて、次の形を作ります。',paragraphs:[
   pos(m.to)+'へ'+(m.drop?piece+'を打つ':piece+'を動かす')+(m.promote?'と同時に成る':'')+'ことで、王手になります。',
   index===1?(puzzle.hint||focus[puzzle.id]||puzzle.lesson):'仲間の駒の利きも使いながら、玉を逃がす方向を限っていきます。最後の一手につながる王手です。',
   moves.some(x=>x.drop)?'ここは玉を逃がす以外に、合駒で受ける手もあります。相手の応手まで確かめましょう。':'相手の玉がどこへ逃げられるか、次の図で確かめてみましょう。'
  ]};
  const krow=Math.floor(king/9),kcol=king%9,adjacent=Math.max(Math.abs(Math.floor(m.to/9)-krow),Math.abs(m.to%9-kcol))===1;
  const open={...s,board:s.board.slice()};open.board[m.to]=0;open.board[king]=0;
  const support=s.board.flatMap((p,i)=>p>0&&i!==m.to&&E.targets(open,i).includes(m.to)?[pos(i)+'の'+E.FULL_NAMES[Math.abs(p)]]:[]);
  const protection=adjacent&&support.length?pos(m.to)+'の'+E.FULL_NAMES[Math.abs(s.board[m.to])]+'は、'+support.join('と')+'が守っています。玉が取ろうとすると、その駒の利きに入ってしまいます。':
   t===3?'桂馬は離れた場所から跳んで王手をしています。玉は一度に1マスしか動けないので、この桂馬を直接取りに行けません。':'王手の駒を取って助かる手もありません。周りの味方の利きが、玉を押さえています。';
  return {title:'「逃げる・取る・間に置く」が、全部できません。',paragraphs:[
   '図の赤い印は、玉が逃げられない場所です。あなたの駒が利いているか、玉方自身の駒でふさがっています。',
   protection,
   t===3?'桂馬の王手は跳び越えるので、間に駒を置いても防げません。':adjacent?'すぐ隣からの王手なので、間に駒を置く空きマスもありません。':'王手の線を止める受けも残っていません。',
   '逃げられず、王手も外せない。これで詰みです。よくできました。'
  ]};
 }
 function diagram(puzzle,step,E,{markMove=true,markEscape=false}={}){
  const s=step.state,king=s.board.indexOf(-8),left=king%9<4?0:4,top=0,cell=46,pad=22;
  const x=i=>pad+(i%9-left+.5)*cell,y=i=>pad+(Math.floor(i/9)-top+.5)*cell;
  let body='<rect x="22" y="22" width="230" height="230" fill="#eac389"/>';
  for(let n=0;n<=5;n++)body+='<path d="M '+(pad+n*cell)+' 22 V 252 M 22 '+(pad+n*cell)+' H 252" stroke="#95784f" stroke-width=".7"/>';
  for(let n=0;n<5;n++)body+='<text x="'+(pad+(n+.5)*cell)+'" y="14" text-anchor="middle" fill="#b9c6be" font-size="11">'+'９８７６５４３２１'[left+n]+'</text><text x="263" y="'+(pad+(n+.62)*cell)+'" text-anchor="middle" fill="#b9c6be" font-size="11">'+'一二三四五六七八九'[n]+'</text>';
  const mark=(i,color)=>{if(i!==null&&i%9>=left&&i%9<left+5&&Math.floor(i/9)<5)body+='<rect x="'+(x(i)-22)+'" y="'+(y(i)-22)+'" width="44" height="44" fill="none" stroke="'+color+'" stroke-width="3"/>';};
  if(markMove&&step.move){mark(step.move.from,'#80a985');mark(step.move.to,'#286a50');}
  for(let i=0;i<81;i++){const p=s.board[i];if(!p||i%9<left||i%9>=left+5||Math.floor(i/9)>4)continue;body+='<g transform="translate('+x(i)+' '+y(i)+')'+(p<0?' rotate(180)':'')+'"><path d="M 0 -18 L 13 -11 L 17 18 L -17 18 L -13 -11 Z" fill="#ffdfa7" stroke="#ac8850" stroke-width=".7"/><text y="11" text-anchor="middle" font-family="serif" font-size="29" font-weight="700" fill="'+(Math.abs(p)>8?'#ac3b2e':'#2b2c25')+'">'+E.NAMES[Math.abs(p)]+'</text></g>';}
  if(markEscape){for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){if(!dr&&!dc)continue;const rr=Math.floor(king/9)+dr,cc=king%9+dc;if(rr<0||rr>4||cc<left||cc>=left+5)continue;const i=rr*9+cc,trial={...s,board:s.board.slice()};trial.board[king]=0;trial.board[i]=-8;if(s.board[i]<0||E.inCheck(trial,-1))body+='<circle cx="'+(x(i)+15)+'" cy="'+(y(i)-15)+'" r="4" fill="#b74231"/>';}}
  return '<svg viewBox="0 0 274 274" role="img" aria-label="玉の周りを拡大した'+s.ply+'手目の局面" xmlns="http://www.w3.org/2000/svg">'+body+'</svg>';
 }
 return {pos,label,focus,line,explanation,diagram};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=ShogiTeacher;
