/* Shogi Lab: pure rules + bounded local AI. No dependencies or network. */
function createShogiEngine({allowMissingKing=false}={}) {
  const NAMES = {1:'歩',2:'香',3:'桂',4:'銀',5:'金',6:'角',7:'飛',8:'玉',9:'と',10:'杏',11:'圭',12:'全',14:'馬',15:'龍'};
  const FULL_NAMES={1:'歩',2:'香車',3:'桂馬',4:'銀',5:'金',6:'角',7:'飛車',8:'玉',9:'と金',10:'成香',11:'成桂',12:'成銀',14:'馬',15:'龍'};
  const VALUES={1:100,2:280,3:300,4:420,5:510,6:700,7:850,8:20000,9:520,10:520,11:520,12:520,14:950,15:1100};
  const GOLD=[[-1,-1,1],[-1,0,1],[-1,1,1],[0,-1,1],[0,1,1],[1,0,1]];
  const DIAG=[[-1,-1,8],[-1,1,8],[1,-1,8],[1,1,8]];
  const ORTH=[[-1,0,8],[0,-1,8],[0,1,8],[1,0,8]];
  // dr is relative to the first player. Edit these vectors for future variants.
  const MOVEMENTS={
    1:[[-1,0,1]],2:[[-1,0,8]],3:[[-2,-1,1],[-2,1,1]],
    4:[[-1,-1,1],[-1,0,1],[-1,1,1],[1,-1,1],[1,1,1]],
    5:GOLD,6:DIAG,7:ORTH,8:[...DIAG,...ORTH].map(([r,c])=>[r,c,1]),
    9:GOLD,10:GOLD,11:GOLD,12:GOLD,
    14:[...DIAG,...ORTH.map(([r,c])=>[r,c,1])],
    15:[...ORTH,...DIAG.map(([r,c])=>[r,c,1])]
  };
  const row=i=>Math.floor(i/9),col=i=>i%9;
  const base=t=>t>8?t-8:t;
  const handIndex=side=>side===1?0:1;
  const zone=(r,side)=>side===1?r<=2:r>=6;
  const deadRank=(t,r,side)=>{const distance=side===1?r:8-r;return (t===1||t===2)&&distance===0 || t===3&&distance<2;};
  function initial() {
    const board=Array(81).fill(0),back=[2,3,4,5,8,5,4,3,2];
    for(let c=0;c<9;c++){board[c]=-back[c];board[72+c]=back[c];board[18+c]=-1;board[54+c]=1;}
    board[10]=-7;board[16]=-6;board[64]=6;board[70]=7;
    return {board,hands:[Array(8).fill(0),Array(8).fill(0)],turn:1,ply:0,last:null};
  }
  function targets(state,from) {
    const p=state.board[from],out=[];
    if(!p)return out;
    const side=Math.sign(p),r=row(from),c=col(from);
    for(const [dr,dc,range] of MOVEMENTS[Math.abs(p)]) {
      for(let n=1;n<=range;n++){
        const rr=r+dr*side*n,cc=c+dc*n;
        if(rr<0||rr>8||cc<0||cc>8)break;
        const to=rr*9+cc,q=state.board[to];
        if(q*side>0)break;
        out.push(to);
        if(q)break;
      }
    }
    return out;
  }
  function inCheck(state,side=state.turn) {
    const king=state.board.indexOf(side*8);
    if(king<0)return !allowMissingKing;
    for(let i=0;i<81;i++)if(state.board[i]*side<0&&targets(state,i).includes(king))return true;
    return false;
  }
  function apply(state,move) {
    const next={board:state.board.slice(),hands:state.hands.map(h=>h.slice()),turn:-state.turn,ply:state.ply+1,last:{...move}};
    const side=state.turn,hand=next.hands[handIndex(side)];
    if(move.drop){next.board[move.to]=side*move.drop;hand[move.drop]--;}
    else {
      const p=next.board[move.from],captured=next.board[move.to];
      if(captured)hand[base(Math.abs(captured))]++;
      next.board[move.to]=move.promote?side*(Math.abs(p)+8):p;
      next.board[move.from]=0;
    }
    return next;
  }
  function pseudoMoves(state,boardOnly=false) {
    const side=state.turn,out=[];
    for(let from=0;from<81;from++) {
      const p=state.board[from],t=Math.abs(p);
      if(p*side<=0)continue;
      for(const to of targets(state,from)) {
        if(Math.abs(state.board[to])===8)continue;
        const promotable=[1,2,3,4,6,7].includes(t)&&(zone(row(from),side)||zone(row(to),side));
        if(!deadRank(t,row(to),side))out.push({from,to,promote:false});
        if(promotable)out.push({from,to,promote:true});
      }
    }
    if(boardOnly)return out;
    const hand=state.hands[handIndex(side)];
    for(let t=1;t<=7;t++)if(hand[t]>0) {
      for(let to=0;to<81;to++){
        if(state.board[to]||deadRank(t,row(to),side))continue;
        if(t===1&&state.board.some((p,i)=>p===side&&col(i)===col(to)))continue;
        out.push({from:null,to,drop:t,promote:false});
      }
    }
    return out;
  }
  function legalMoves(state,options={}) {
    const moves=[];
    for(const move of pseudoMoves(state,options.boardOnly)) {
      const next=apply(state,move);
      if(inCheck(next,state.turn))continue;
      // A checking pawn is adjacent to the king: no dropped piece can interpose.
      if(move.drop===1&&targets(next,move.to).includes(next.board.indexOf(-state.turn*8)) &&
          legalMoves(next,{boardOnly:true,stopAfterOne:true}).length===0)continue;
      moves.push(move);
      if(options.stopAfterOne)break;
    }
    return moves;
  }
  function key(state){return state.board.join(',')+'|'+state.hands.map(h=>h.join(',')).join('|')+'|'+state.turn;}
  function record(state){return {key:key(state),mover:-state.turn,check:inCheck(state,state.turn)};}
  function repetition(history){
    if(history.length<4)return null;
    const k=history[history.length-1].key,occurrences=[];
    history.forEach((e,i)=>{if(e.key===k)occurrences.push(i);});
    if(occurrences.length<4)return null;
    const cycle=history.slice(occurrences[occurrences.length-4]+1);
    for(const side of [1,-1]){
      const turns=cycle.filter(e=>e.mover===side);
      if(turns.length&&turns.every(e=>e.check))return {winner:-side,reason:'perpetual-check'};
    }
    return {winner:0,reason:'repetition'};
  }
  function outcome(state,history=[],moves){
    const repeat=repetition(history);
    if(repeat)return repeat;
    if(!(moves||legalMoves(state,{stopAfterOne:true})).length)return {winner:-state.turn,reason:inCheck(state)?'mate':'no-moves'};
    return null;
  }
  function moveKey(m){return [m.from,m.to,m.drop||0,!!m.promote].join(':');}
  function play(state,requested) {
    const move=legalMoves(state).find(m=>moveKey(m)===moveKey(requested));
    if(!move)throw new Error('この手は指せません。');
    return apply(state,move);
  }
  function evaluate(state) {
    let value=0;
    for(let i=0;i<81;i++){
      const p=state.board[i];if(!p)continue;
      const side=Math.sign(p),t=Math.abs(p),advance=side===1?8-row(i):row(i);
      const center=4-Math.abs(4-col(i));
      value+=side*(VALUES[t]+(t!==8?advance*4+center*2:0));
    }
    for(const side of [1,-1])for(let t=1;t<8;t++)value+=side*state.hands[handIndex(side)][t]*VALUES[t]*1.06;
    return value*state.turn;
  }
  function priority(state,m) {
    return (VALUES[Math.abs(state.board[m.to])]||0)*10+
      (m.promote?VALUES[Math.abs(state.board[m.from])+8]-VALUES[Math.abs(state.board[m.from])]:0)+
      (!m.drop?5:0);
  }
  function chooseMove(state,{budgetMs=220,random=Math.random,history=[]}={}) {
    const start=Date.now(),deadline=start+budgetMs;
    const moves=legalMoves(state);
    if(!moves.length)return null;
    moves.sort((a,b)=>priority(state,b)-priority(state,a));
    let best=moves[0],score=-Infinity,completed=0;
    for(const m of moves){
      const next=apply(state,m),rec=record(next),rep=repetition([...history,rec]);
      let value;
      if(rep)value=rep.winner===0?0:rep.winner===state.turn?90000:-90000;
      else {
        const replies=legalMoves(next);
        if(!replies.length)return m;
        replies.sort((a,b)=>priority(next,b)-priority(next,a));
        let worst=Infinity,complete=true;
        // Two plies, capped reply beam. This is deliberately a small, casual AI.
        for(const reply of replies.slice(0,28)) {
          if(Date.now()>deadline&&completed){complete=false;break;}
          const after=apply(next,reply);
          const v=evaluate(after);
          worst=Math.min(worst,v);
          if(worst<score-4)break;
        }
        if(!complete)break;
        value=worst+(inCheck(next)?12:0)+random()*3;
      }
      completed++;
      if(value>score){score=value;best=m;}
      if(Date.now()>deadline)break;
    }
    return best;
  }
  return {NAMES,FULL_NAMES,MOVEMENTS,VALUES,initial,targets,inCheck,apply,legalMoves,play,key,record,repetition,outcome,moveKey,chooseMove,base};
}
if(typeof module!=='undefined'&&module.exports)module.exports={createShogiEngine};
