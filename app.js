'use strict';
(() => {
  let E=createShogiEngine();
  const $=id=>document.getElementById(id),board=$('board'),dialog=$('choice-dialog');
  let state=E.initial(),legal=E.legalMoves(state),selected=null,finished=null,records=[E.record(state)],undoStack=[];
  let worker=null,workerUrl=null,aiTimer=null,watchdog=null,generation=0;
  let started=false,level='beginner',animation=null,aiError=false,startRequest=0;
  let mode='ai',playerSide=1,online=null,onlineInfo=null,onlineSeat=null,pendingMove=false,onlineBusy=false,onlineError='',onlineQueue=Promise.resolve(),pendingTimer=null;
  let startMode='ai',invitedRoom=new URLSearchParams(location.search).get('room'),greetedRoom=null;
  const inviteDialog=$('invite-dialog');
  const resultDialog=$('result-dialog'),pieceDialog=$('piece-guide-dialog');
  let gameSerial=0,resultShownKey='',guidePiece=1,livePiece=0;
  let puzzle=null,puzzleDepth=1,puzzleIndex=0,puzzleHint=0,puzzleMistake=false,puzzleFailed=false,puzzleFailTimer=null;
  const puzzleDialog=$('puzzle-dialog'),puzzleFailDialog=$('puzzle-fail-dialog'),hintDialog=$('hint-dialog'),lessonDialog=$('lesson-dialog');
  const coinDialog=$('coin-dialog');let coinRun=0,coinTimer=null,coinWaitResolve=null,coinStartResolve=null;
  let hintMove=null,lessonSteps=[],lessonStep=0,lessonKind='answer';
  const modalOpen=()=>Boolean(document.querySelector('dialog[open]'));
  const strongAI=ShogiAI.create(),openingBook=ShogiAI.book(E),startDialog=$('start-dialog'),infoDialog=$('info-dialog');
  let greetingSound=null,greetingLoading=null,greetingSource=null;
  let audioContext=null,placementSound=null,soundLoading=null;
  const AI_PAUSE_MS=900;
  function prepareAudio(){
    try{
      const AudioContext=window.AudioContext||window.webkitAudioContext;
      if(!AudioContext)return;
      if(!audioContext)audioContext=new AudioContext();
      if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
      if(!greetingLoading){
        const bytes=Uint8Array.from(atob(SHOGI_GREETING_AUDIO),c=>c.charCodeAt(0));
        greetingLoading=audioContext.decodeAudioData(bytes.buffer).then(b=>{greetingSound=b;}).catch(()=>{greetingLoading=null;});
      }
      if(!soundLoading){
        const bytes=Uint8Array.from(atob(SHOGI_PLACEMENT_AUDIO),c=>c.charCodeAt(0));
        soundLoading=audioContext.decodeAudioData(bytes.buffer).then(buffer=>{
          // Remove encoder silence so the impact coincides with placement.
          let first=buffer.length,last=0;
          for(let channel=0;channel<buffer.numberOfChannels;channel++){
            const samples=buffer.getChannelData(channel);
            for(let i=0;i<samples.length;i++)if(Math.abs(samples[i])>0.003){first=Math.min(first,i);last=Math.max(last,i);}
          }
          const begin=Math.max(0,first-Math.round(buffer.sampleRate*0.002));
          const end=Math.min(buffer.length,last+Math.round(buffer.sampleRate*0.018));
          const trimmed=audioContext.createBuffer(buffer.numberOfChannels,Math.max(1,end-begin),buffer.sampleRate);
          for(let channel=0;channel<buffer.numberOfChannels;channel++)trimmed.copyToChannel(buffer.getChannelData(channel).subarray(begin,end),channel);
          placementSound=trimmed;
        }).catch(()=>{soundLoading=null;});
      }
    }catch(_){/* Audio availability must never interrupt the game. */}
  }
  function playPlacement(promoted){
    if(!audioContext||audioContext.state!=='running'||!placementSound)return;
    try{
      const source=audioContext.createBufferSource(),gain=audioContext.createGain();
      source.buffer=placementSound;
      // Keep the natural wooden attack; promotion gets a slightly weightier tone.
      source.playbackRate.value=promoted?0.96:1;
      gain.gain.value=promoted?0.9:0.8;
      source.connect(gain);gain.connect(audioContext.destination);
      source.onended=()=>{source.disconnect();gain.disconnect();};source.start();
    }catch(_){/* A blocked sound must not block a valid move. */}
  }
  document.addEventListener('pointerdown',prepareAudio,{passive:true});
  const pos=i=>'９８７６５４３２１'[i%9]+'一二三四五六七八九'[Math.floor(i/9)];
  const isHuman=()=>started&&state.turn===playerSide&&!finished&&!puzzleFailed&&(mode!=='online'||Boolean(online?.connected&&onlineInfo?.began&&onlineInfo?.presence.every(Boolean)&&!pendingMove&&!onlineBusy&&!onlineError));
  const opponentName=()=>mode==='puzzle'?'玉方':mode==='online'?'相手':'AI';
  const cursorPiece=document.createElement('div');
  cursorPiece.id='cursor-piece';cursorPiece.hidden=true;cursorPiece.setAttribute('aria-hidden','true');document.body.append(cursorPiece);
  const pointer={x:0,y:0,inside:false,mouse:false};
  let cursorFrame=0,hoveredCell=null,carryDestinations=new Set();
  function paintCursor(){
    cursorFrame=0;
    const active=Boolean(selected&&isHuman()&&!modalOpen()&&pointer.mouse&&pointer.inside);
    cursorPiece.hidden=!active;document.body.classList.toggle('carrying-piece',active);
    hoveredCell?.classList.remove('drop-hover');hoveredCell=null;
    if(!active)return;
    cursorPiece.style.transform='translate3d('+pointer.x+'px,'+pointer.y+'px,0) translate(-50%,-62%)';
    const cell=document.elementFromPoint(pointer.x,pointer.y)?.closest('.cell');
    if(cell&&carryDestinations.has(Number(cell.dataset.square))){cell.classList.add('drop-hover');hoveredCell=cell;}
  }
  function syncCursor(){
    if(selected){
      const p=selected.drop?selected.drop*playerSide:state.board[selected.from];cursorPiece.replaceChildren(pieceNode(p));
      const sample=board.querySelector('.cell'),piece=board.querySelector('.piece');
      if(sample){const rect=sample.getBoundingClientRect();cursorPiece.style.width=rect.width*0.84+'px';cursorPiece.style.height=rect.height*0.92+'px';}
      if(piece)cursorPiece.style.setProperty('--carried-font',getComputedStyle(piece).fontSize);
      carryDestinations=new Set(selectedMoves().map(m=>m.to));
    }
    paintCursor();
  }
  function trackPointer(event){
    pointer.x=event.clientX;pointer.y=event.clientY;pointer.inside=true;pointer.mouse=event.pointerType==='mouse'||event.pointerType==='pen';
    if(selected&&!cursorFrame)cursorFrame=requestAnimationFrame(paintCursor);
  }
  document.addEventListener('pointermove',trackPointer,{passive:true});
  document.addEventListener('pointerdown',trackPointer,{passive:true,capture:true});
  document.addEventListener('pointerleave',()=>{pointer.inside=false;paintCursor();});
  window.addEventListener('blur',()=>{pointer.inside=false;paintCursor();});
  window.addEventListener('resize',syncCursor);
  window.addEventListener('scroll',()=>{if(selected)paintCursor();},{passive:true,capture:true});
  document.addEventListener('contextmenu',event=>{if(selected&&!dialog.open){event.preventDefault();selected=null;render();}});
  document.addEventListener('click',event=>{
    if(selected&&!dialog.open&&!event.target.closest('#board,#human-hand,#choice-dialog')){selected=null;render();}
  },{capture:true});
  function pieceNode(p) {
    const el=document.createElement('span');
    el.className='piece'+(p*playerSide<0?' enemy':'')+(Math.abs(p)>8?' promoted':'');
    el.textContent=p===8?'王':E.NAMES[Math.abs(p)];return el;
  }
  function selectedMoves(){
    return selected?legal.filter(m=>selected.drop?m.drop===selected.drop:m.from===selected.from&&!m.drop):[];
  }
  function render(message,landedAt) {
    const destinations=new Set(selectedMoves().map(m=>m.to)),checked=E.inCheck(state)?state.board.indexOf(state.turn*8):-1;
    board.replaceChildren();
    for(let n=0;n<81;n++){
      const i=playerSide===1?n:80-n;
      const p=state.board[i],cell=document.createElement('button');
      cell.type='button';cell.className='cell';cell.dataset.square=i;
      if(state.last&&(state.last.from===i||state.last.to===i))cell.classList.add('last');
      if(selected?.from===i)cell.classList.add('selected');
      if(destinations.has(i))cell.classList.add('legal');
      if(checked===i)cell.classList.add('check');
      if(landedAt===i)cell.classList.add('just-placed');
      cell.setAttribute('aria-label',pos(i)+' '+(p?(p*playerSide>0?'あなたの':opponentName()+'の')+E.FULL_NAMES[Math.abs(p)]:'空きマス')+(destinations.has(i)?' 移動できます':''));
      cell.setAttribute('aria-pressed',String(selected?.from===i));
      if(p)cell.append(pieceNode(p));
      cell.addEventListener('click',()=>onSquare(i));
      if(p){cell.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch'&&!selected)inspectPiece(Math.abs(p));});cell.addEventListener('focus',()=>{if(!selected)inspectPiece(Math.abs(p));});}
      board.append(cell);
    }
    renderHand(1);renderHand(-1);
    $('move-count').textContent=mode==='puzzle'?state.ply+' / '+puzzle.depth+' 手':state.ply+' 手目';
    $('puzzle-toolbar').hidden=mode!=='puzzle';$('puzzle-hint').disabled=!isHuman();$('puzzle-answer').disabled=!isHuman();
    if(puzzle&&mode==='puzzle'){$('puzzle-level-label').textContent=ShogiPuzzles.names[puzzle.depth]+'・'+puzzle.depth+'手詰　'+(puzzleIndex+1)+' / '+ShogiPuzzles.list(puzzle.depth).length;$('puzzle-title').textContent=puzzle.title;}$('undo').disabled=undoStack.length===0;
    $('undo').hidden=mode==='online'||mode==='puzzle';
    $('resign').hidden=!started||mode==='puzzle'||Boolean(finished);
    $('resign').disabled=mode==='online'?(!online?.connected||!onlineInfo?.began||Boolean(finished)||onlineBusy):mode!=='ai'||Boolean(finished);
    $('invite-button').hidden=mode!=='online'||playerSide!==1;
    $('undo').title='自分の直前の一手と、AIの応手を戻します';
    $('level-badge').textContent=mode==='puzzle'?'詰将棋・'+puzzle.depth+'手詰':mode==='online'?'友達と対戦':started?'AI・'+ShogiAI.levels[level].name:'AI対戦';
    $('ai-name').textContent=mode==='puzzle'?'玉方':mode==='online'?'友達':started?'AI・'+ShogiAI.levels[level].name:'相手';
    $('restart').textContent=mode==='puzzle'?'対局する':mode==='online'?'新規対局':started?'新しい対局':'始める';
    document.body.dataset.mode=mode;
    document.body.dataset.turn=!started?'ready':finished?'over':state.turn===playerSide?'human':'ai';
    document.querySelector('.your-hand .player-name small').textContent=playerSide===1?'先手':'後手';
    document.querySelector('.opponent-hand .player-name small').textContent=playerSide===1?'後手':'先手';
    document.querySelectorAll('.files span').forEach((el,n)=>{el.textContent=(playerSide===1?'９８７６５４３２１':'１２３４５６７８９')[n];});
    document.querySelectorAll('.ranks span').forEach((el,n)=>{el.textContent=(playerSide===1?'一二三四五六七八九':'九八七六五四三二一')[n];});
    const status=$('status');
    if(!started)status.textContent='「始める」で一局。';
    else if(finished)status.textContent=finished.reason==='left'?'この部屋は終了しました。':(finished.winner===0?'引き分け':finished.winner===playerSide?'あなたの勝ち':opponentName()+'の勝ち')+'。'+({mate:'詰みです。',resign:'投了で対局終了です。',repetition:'千日手です。','perpetual-check':'連続王手の千日手です。'}[finished.reason]||'対局終了です。');
    else if(mode==='online'&&onlineError)status.textContent=onlineError;
    else if(mode==='online'&&!online?.connected)status.textContent='接続を確認しています…';
    else if(mode==='online'&&!onlineInfo?.presence.every(Boolean))status.textContent=onlineInfo?.began?'相手の再接続を待っています。':'友達の参加を待っています。';
    else if(pendingMove)status.textContent='一手を届けています…';
    else if(aiError)status.textContent='AIの応答が止まりました。「待った」か「新しい対局」で再開できます。';
    else if(message)status.textContent=message;
    else if(state.turn!==playerSide)status.textContent=mode==='puzzle'?'玉方の応手です。':mode==='online'?'相手の番です。':'AIが考えています。';
    else status.textContent=mode==='puzzle'?'王手を続けて、詰みを見つけましょう。':checked>=0?'王手です。玉を守る手を。':'あなたの番です。';
    if(selected)inspectPiece(selected.drop||Math.abs(state.board[selected.from]));
    syncCursor();showResult();
  }
  function renderHand(side){
    const own=side===playerSide,el=$(own?'human-hand':'ai-hand');el.replaceChildren();
    const counts=state.hands[side===1?0:1];
    if(mode==='puzzle'&&!own){el.textContent='残りの駒すべて';return;}
    for(const t of [7,6,5,4,3,2,1])if(counts[t]){
      const item=document.createElement(own?'button':'span');
      item.dataset.piece=t;item.className='hand-piece'+(selected?.drop===t&&own?' selected':'');item.textContent=E.NAMES[t];
      const count=document.createElement('small');count.textContent='×'+counts[t];item.append(count);
      item.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch'&&!selected)inspectPiece(t);});
      item.addEventListener('pointerdown',()=>inspectPiece(t));
      if(own){
        item.type='button';item.disabled=false;
        item.setAttribute('aria-label','持ち駒の'+E.FULL_NAMES[t]+' '+counts[t]+'枚');
        item.setAttribute('aria-pressed',String(selected?.drop===t));
        item.addEventListener('click',()=>{inspectPiece(t);if(!isHuman()||modalOpen())return;selected=selected?.drop===t?null:{drop:t};render();});
      }
      el.append(item);
    }
    if(!el.children.length){const empty=document.createElement('p');empty.className='empty-hand';empty.textContent='持ち駒なし';el.append(empty);}
  }
  function choose(title,copy,icon,actions) {
    if(dialog.open)dialog.close();
    $('dialog-title').textContent=title;$('dialog-copy').textContent=copy;dialog.querySelector('.dialog-icon').textContent=icon;
    const container=$('dialog-actions');container.replaceChildren();
    actions.forEach(({label,primary,run})=>{
      const button=document.createElement('button');button.type='button';button.textContent=label;
      if(primary)button.className='primary';
      button.addEventListener('click',()=>{dialog.close();run?.();});container.append(button);
    });dialog.showModal();syncCursor();
  }
  function onSquare(to){
    if(modalOpen())return;
    if(state.board[to]&&(!selected||state.board[to]*playerSide>0))inspectPiece(Math.abs(state.board[to]));
    if(!isHuman())return;
    if(selected?.from===to){selected=null;render();return;}
    const options=selectedMoves().filter(m=>m.to===to);
    if(options.length>1){
      const t=Math.abs(state.board[selected.from]);
      choose('成りますか？',E.FULL_NAMES[t]+'を'+E.FULL_NAMES[t+8]+'にできます。',E.NAMES[t],[
        {label:'成る',primary:true,run:()=>humanMove(options.find(m=>m.promote))},
        {label:'成らない',run:()=>humanMove(options.find(m=>!m.promote))},
        {label:'キャンセル',run:()=>render()}
      ]);return;
    }
    if(options.length){humanMove(options[0]);return;}
    if(state.board[to]*playerSide>0){selected={from:to};render();return;}
    if(selected)render('そこへは動かせません。光ったマスを選んでください。');
  }
  function moveLabel(before,m){
    const type=m.drop||Math.abs(before.board[m.from]);
    return (before.turn===playerSide?'あなた':opponentName())+'　'+pos(m.to)+' '+E.FULL_NAMES[type]+(m.drop?'打':m.promote?'成':'');
  }
  function commit(m){
    const label=moveLabel(state,m),usi=ShogiAI.toUSI(m);state=E.play(state,m);state.last.label=label;
    records.push({...E.record(state),label,usi});selected=null;legal=E.legalMoves(state);finished=E.outcome(state,records,legal);render(undefined,m.to);
    playPlacement(m.promote);
  }
  function humanMove(move){
    if(!isHuman())throw new Error('今はあなたの手番ではありません。');
    const match=legal.find(m=>E.moveKey(m)===E.moveKey(move));if(!match)throw new Error('この手は指せません。');
    if(mode==='puzzle'){playPuzzleMove(match);return;}
    if(mode==='online'){
      pendingMove=true;selected=null;render();
      if(!online.send({type:'move',ply:state.ply,move:match})){pendingMove=false;render();return;}
      clearTimeout(pendingTimer);pendingTimer=setTimeout(()=>online?.send({type:'sync'}),6000);return;
    }
    undoStack.push({state,records:records.slice()});commit(match);if(!finished)scheduleAI();
  }
  const movingPiece=document.createElement('div');movingPiece.id='moving-piece';movingPiece.hidden=true;movingPiece.setAttribute('aria-hidden','true');document.body.append(movingPiece);
  function clearMovingPiece(){animation?.cancel();animation=null;movingPiece.hidden=true;document.querySelectorAll('.ai-origin,.ai-target').forEach(el=>el.classList.remove('ai-origin','ai-target'));}
  async function animateOpponent(move,token){
    const origin=move.drop?(mode==='puzzle'?$('ai-hand'):document.querySelector('#ai-hand [data-piece="'+move.drop+'"]')):board.querySelector('[data-square="'+move.from+'"]');
    const target=board.querySelector('[data-square="'+move.to+'"]');
    if(!origin||!target)return;
    const sample=(move.drop?target:origin).getBoundingClientRect(),from=origin.getBoundingClientRect(),to=target.getBoundingClientRect();
    const width=sample.width*.70,height=sample.height*.79;
    movingPiece.style.width=width+'px';movingPiece.style.height=height+'px';
    movingPiece.style.setProperty('--carried-font',getComputedStyle(board.querySelector('.piece')).fontSize);
    movingPiece.replaceChildren(pieceNode(move.drop?-playerSide*move.drop:state.board[move.from]));
    const sx=from.left+(from.width-width)/2,sy=from.top+(from.height-height)/2,tx=to.left+(to.width-width)/2,ty=to.top+(to.height-height)/2;
    origin.classList.add('ai-origin');target.classList.add('ai-target');movingPiece.hidden=false;
    $('status').textContent=opponentName()+'：'+(move.drop?'持ち駒の'+E.FULL_NAMES[move.drop]:pos(move.from)+'の'+E.FULL_NAMES[Math.abs(state.board[move.from])])+' → '+pos(move.to);
    const transform=(x,y,lift=0,scale=1)=>'translate3d('+x+'px,'+(y-lift)+'px,0) scale('+scale+')';
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    animation=movingPiece.animate(reduced?[{transform:transform(sx,sy),offset:0},{transform:transform(sx,sy),offset:.8},{transform:transform(tx,ty),offset:1}]:[
      {transform:transform(sx,sy),offset:0,easing:'ease-out'},
      {transform:transform(sx,sy,13,1.1),offset:.30},
      {transform:transform(sx,sy,13,1.1),offset:320/600,easing:'ease-in-out'},
      {transform:transform(tx,ty,13,1.1),offset:490/600,easing:'ease-in'},
      {transform:transform(tx,ty),offset:1}
    ],{duration:reduced?300:600,easing:'linear',fill:'forwards'});
    await animation.finished.catch(()=>{});
    if(token!==generation)return;
    clearMovingPiece();
  }
  function stopAI(){
    generation++;clearTimeout(aiTimer);clearTimeout(watchdog);worker?.terminate();worker=null;
    if(workerUrl){URL.revokeObjectURL(workerUrl);workerUrl=null;}
    clearMovingPiece();strongAI.cancel();aiError=false;
  }
  function scheduleAI(extraDelay=0){
    stopAI();const token=generation;
    aiTimer=setTimeout(async()=>{
      if(token!==generation||state.turn!==-playerSide||finished)return;
      const finish=async m=>{
        if(token!==generation||state.turn!==-playerSide||finished)return;
        const valid=legal.find(x=>E.moveKey(x)===E.moveKey(m||{}));
        if(!valid){aiError=true;render();return;}
        clearTimeout(watchdog);worker?.terminate();worker=null;
        if(workerUrl){URL.revokeObjectURL(workerUrl);workerUrl=null;}
        await animateOpponent(valid,token);
        if(token===generation&&state.turn===-playerSide&&!finished)commit(valid);
      };
      if(level!=='beginner'){
        try{
          const entries=openingBook.get(E.key(state));
          if(entries&&level!=='god'){await finish(ShogiAI.fromUSI(entries[Math.floor(Math.random()*entries.length)]));return;}
          const result=await strongAI.search(records.slice(1).map(r=>r.usi),level);
          if(token!==generation||result.cancelled)return;
          await finish(ShogiAI.fromUSI(result.move));
        }catch(_){if(token===generation){aiError=true;render();}}
        return;
      }
      let completed=false;
      const done=m=>{if(completed)return;completed=true;finish(m);};
      const fallback=()=>done(E.chooseMove(state,{budgetMs:35,history:records}));
      try{
        workerUrl=URL.createObjectURL(new Blob(['const E=('+createShogiEngine.toString()+')();\nonmessage=e=>{try{postMessage({move:E.chooseMove(e.data.state,{budgetMs:220,history:e.data.history})})}catch(error){postMessage({error:String(error)})}};'],{type:'application/javascript'}));
        worker=new Worker(workerUrl);worker.onmessage=event=>event.data.error?fallback():done(event.data.move);
        worker.onerror=event=>{event.preventDefault();fallback();};watchdog=setTimeout(fallback,1800);worker.postMessage({state,history:records});
      }catch(_){fallback();}
    },AI_PAUSE_MS+extraDelay+Math.random()*200);
  }
  function undo(){
    if(mode==='online'||!undoStack.length)return;
    stopAI();if(dialog.open)dialog.close();
    puzzleHint=0;const old=undoStack.pop();state=old.state;records=old.records;selected=null;finished=null;resultShownKey='';resultDialog.close();legal=E.legalMoves(state);render('直前の自分の手まで戻しました。');
  }
  function playGreeting(){
    const token=generation;
    prepareAudio();
    Promise.resolve(greetingLoading).then(()=>{
      if(token!==generation||!greetingSound||!audioContext||audioContext.state!=='running')return;
      greetingSource?.stop();greetingSource=audioContext.createBufferSource();const gain=audioContext.createGain(),tone=audioContext.createBiquadFilter();
      // Use the announcement voice at its natural pitch and pace.
      greetingSource.playbackRate.value=1;greetingSource.detune.value=0;
      gain.gain.value=.82;tone.type='highpass';tone.frequency.value=70;tone.Q.value=.5;
      greetingSource.buffer=greetingSound;greetingSource.connect(tone);tone.connect(gain);gain.connect(audioContext.destination);
      greetingSource.onended=()=>{tone.disconnect();gain.disconnect();};greetingSource.start();
    });
  }
  function leaveOnline(){
    online?.close(true);online=null;onlineInfo=null;onlineError='';pendingMove=false;onlineBusy=false;clearTimeout(pendingTimer);
    onlineQueue=Promise.resolve();onlineSeat=null;mode='ai';playerSide=1;invitedRoom=null;inviteDialog.close();closeCoin();
    history.replaceState(null,'',location.pathname);
  }
  async function receiveOnline(packet,token){
    if(token!==generation||mode!=='online')return;
    const previous=onlineInfo,oldPly=state.ply;
    const newRound=previous&&packet.round!==previous.round;
    const liveMove=!newRound&&packet.cause==='move'&&packet.state.ply===oldPly+1;
    const opponent=liveMove&&state.turn!==playerSide;
    onlineInfo=packet;onlineSeat=packet.seat??onlineSeat;if(packet.side===1||packet.side===-1)playerSide=packet.side;pendingMove=false;clearTimeout(pendingTimer);
    if(opponent){
      onlineBusy=true;selected=null;syncCursor();
      await animateOpponent(packet.move,token);
      if(token!==generation||mode!=='online')return;
    }
    onlineBusy=false;
    if(packet.state.ply!==oldPly||!previous||newRound){
      let before=E.initial();records=[E.record(before)];
      for(const move of packet.moves){
        const label=moveLabel(before,move),usi=ShogiAI.toUSI(move);
        before=E.apply(before,move);records.push({...E.record(before),label,usi});
      }
      state=packet.state;
      if(state.last)state.last.label=records.at(-1).label;
      legal=E.legalMoves(state);selected=null;
    }
    finished=packet.result;
    if(newRound){resultDialog.close();resultShownKey='';selected=null;}
    if(finished&&dialog.open)dialog.close();
    render(undefined,liveMove?packet.move.to:undefined);
    if(liveMove)playPlacement(packet.move.promote);
    if(packet.cause==='rematch-request'&&packet.rematch?.[-onlineSeat]&&!previous?.rematch?.[-onlineSeat])showResult(true);
    if(packet.began&&(!previous?.began||newRound)){
      if(inviteDialog.open)inviteDialog.close();
      const roundKey=packet.room+':'+packet.round;
      if(!previous&&packet.state.ply>0)greetedRoom=roundKey;
      if(greetedRoom!==roundKey){
        greetedRoom=roundKey;
        if(packet.cause==='coin'&&!await showCoin(packet.coin?.face||'king',playerSide))return;
        if(token!==generation||mode!=='online')return;
        playGreeting();render('よろしくお願いします。');
      }
    }
  }
  function enterOnline(seat){
    stopAI();online?.close(true);greetingSource?.stop();clearTimeout(pendingTimer);
    gameSerial++;resultShownKey='';resultDialog.close();
    E=createShogiEngine();puzzle=null;mode='online';onlineSeat=seat.side;playerSide=seat.side;started=true;selected=null;finished=null;pendingMove=false;onlineBusy=false;onlineError='';
    state=E.initial();records=[E.record(state)];undoStack=[];legal=E.legalMoves(state);onlineInfo=null;onlineQueue=Promise.resolve();
    const token=generation;history.replaceState(null,'','?room='+seat.room);
    online=ShogiOnline.connect(seat,{
      onSnapshot:packet=>{onlineQueue=onlineQueue.then(()=>receiveOnline(packet,token)).catch(()=>{if(token===generation){onlineBusy=false;onlineError='盤面を確認できませんでした。ページを開き直してください。';render();}});},
      onStatus:connected=>{if(token!==generation)return;if(!connected){selected=null;pendingMove=false;}if(!animation)render();},
      onError:(message,fatal)=>{if(token!==generation)return;pendingMove=false;clearTimeout(pendingTimer);if(fatal)onlineError=message;if(!animation)render(message);if(resultDialog.open)$('result-message').textContent=message;}
    });
    render();
  }
  async function showInvite(){
    if(mode!=='online'||!onlineInfo)return;
    $('invite-url').value='';$('copy-invite').disabled=true;$('invite-message').textContent='';
    $('invite-copy').textContent=onlineInfo.joined?'友達に招待URLを送り直せます。':'このURLを友達に送ってください。2人そろったら、対局が始まります。';
    inviteDialog.showModal();syncCursor();
    const room=onlineInfo.room;
    try{
      const url=await ShogiOnline.invitation(room);
      if(mode!=='online'||onlineInfo?.room!==room)return;
      $('invite-url').value=url;$('copy-invite').disabled=false;
    }catch(error){$('invite-message').textContent=error.message;}
  }
  $('invite-button').addEventListener('click',showInvite);
  $('invite-close').addEventListener('click',()=>inviteDialog.close());
  $('invite-url').addEventListener('click',()=>{$('invite-url').select();});
  $('copy-invite').addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText($('invite-url').value);$('invite-message').textContent='コピーしました。友達に送ってください。';}
    catch{$('invite-url').focus();$('invite-url').select();$('invite-message').textContent='URLを選択しました。コピーして友達に送ってください。';}
  });
  function resignGame(){
    if(finished||!started)return;
    if(mode==='online'){online?.send({type:'resign'});return;}
    if(mode!=='ai')return;
    stopAI();greetingSource?.stop();selected=null;finished={winner:-playerSide,reason:'resign'};render();
  }
  $('resign').addEventListener('click',()=>choose('投了しますか？','投了すると、相手の勝ちで対局が終了します。','礼',[
    {label:'続ける'},{label:'投了する',primary:true,run:resignGame}
  ]));
  function restart(nextLevel,side=1){
    clearTimeout(puzzleFailTimer);puzzleFailTimer=null;stopAI();leaveOnline();greetingSource?.stop();level=nextLevel;playerSide=side;started=true;gameSerial++;resultShownKey='';resultDialog.close();
    E=createShogiEngine();puzzle=null;state=E.initial();records=[E.record(state)];undoStack=[];selected=null;finished=null;legal=E.legalMoves(state);render('よろしくお願いします。');if(state.turn!==playerSide)scheduleAI(750);playGreeting();
  }
  function startView(){
    const friend=startMode==='friend',joining=friend&&invitedRoom;
    $('mode-ai').setAttribute('aria-pressed',String(!friend));$('mode-friend').setAttribute('aria-pressed',String(friend));
    $('ai-options').hidden=friend;$('friend-options').hidden=!friend;
    $('start-title').textContent=joining?'友達と、一局。':'気軽に、一局。';
    $('start-copy').textContent=joining?'参加後、コイントスで先手・後手が決まります。':started&&!finished?'今の対局を終了して、新しい一局を始めます。':friend?'2人そろったら、コイントスで先後が決まります。':'相手の強さを選ぶと、コイントスで先後が決まります。';
    document.querySelector('#friend-options small').innerHTML=joining?'準備ができたら、下のボタンで参加。<br>相手が待っています。':'部屋を作って、招待URLを送るだけ。<br>登録なしで、すぐに遊べます。';
    $('start-game').textContent=joining?'参加する':friend?'部屋を作る':'対局を始める';
  }
  $('mode-ai').addEventListener('click',()=>{if($('start-game').disabled)return;startMode='ai';startView();});
  $('mode-friend').addEventListener('click',()=>{if($('start-game').disabled)return;startMode='friend';startView();});
  const wait=ms=>new Promise(resolve=>{coinWaitResolve=resolve;coinTimer=setTimeout(()=>{coinWaitResolve=null;coinTimer=null;resolve();},ms);});
  function closeCoin(){
    coinRun++;clearTimeout(coinTimer);coinTimer=null;
    if(coinWaitResolve){const resolve=coinWaitResolve;coinWaitResolve=null;resolve();}
    if(coinStartResolve){const resolve=coinStartResolve;coinStartResolve=null;resolve(false);}
    if(coinDialog.open)coinDialog.close();
  }
  function resetCoin(face){
    const coin=$('shogi-coin');coin.classList.remove('tossing','landed');coin.dataset.face=face;
    $('coin-copy').textContent='王将と玉将のコインを投げます。';$('coin-readout').hidden=true;$('coin-result').hidden=true;$('coin-start').hidden=true;$('coin-cancel').hidden=true;
    void coin.offsetWidth;coin.classList.add('tossing');
  }
  async function showCoin(face,side){
    const run=++coinRun;clearTimeout(coinTimer);resetCoin(face);
    if(!coinDialog.open)coinDialog.showModal();syncCursor();
    await wait(matchMedia('(prefers-reduced-motion: reduce)').matches?250:1350);if(run!==coinRun)return false;
    $('shogi-coin').classList.remove('tossing');$('shogi-coin').classList.add('landed');
    $('coin-glyph').textContent=face==='jewel'?'玉':'王';
    $('coin-turn').textContent=side===1?'先手':'後手';
    $('coin-readout').hidden=false;
    $('coin-face-result').textContent=(face==='jewel'?'玉':'王')+'の面';
    $('coin-side-result').textContent='あなたは'+(side===1?'先手':'後手')+'です';
    $('coin-result').hidden=false;$('coin-copy').textContent='先手・後手が決まりました。';
    $('coin-start').hidden=false;$('coin-start').focus();
    return new Promise(resolve=>{coinStartResolve=resolve;});
  }
  async function openAiCoin(nextLevel){
    const face=Math.random()<.5?'king':'jewel',side=face==='king'?1:-1,run=coinRun+1;
    if(nextLevel!=='beginner')strongAI.ready().catch(()=>{});
    try{
      const shown=await showCoin(face,side);if(!shown||run!==coinRun)return;restart(nextLevel,side);
    }catch(e){
      if(run!==coinRun)return;
      $('coin-copy').textContent=e.message;$('coin-result').hidden=true;$('coin-cancel').hidden=false;
      if(!coinDialog.open)coinDialog.showModal();
    }
  }
  $('coin-start').addEventListener('click',()=>{
    prepareAudio();
    const resolve=coinStartResolve;coinStartResolve=null;
    $('coin-start').hidden=true;if(coinDialog.open)coinDialog.close();resolve?.(true);
  });
  $('coin-cancel').addEventListener('click',()=>{closeCoin();openStart();});
  coinDialog.addEventListener('cancel',event=>event.preventDefault());
  $('undo').addEventListener('click',undo);
  function renderPuzzleList(filter='all'){
    const list=$('puzzle-list');list.replaceChildren();list.dataset.filter=filter;
    document.querySelectorAll('[data-puzzle-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.puzzleFilter===filter)));
    let count=0;
    for(const depth of [1,3,5]){
      if(filter!=='all'&&Number(filter)!==depth)continue;
      const group=document.createElement('section');group.className='puzzle-group';
      const heading=document.createElement('h3');heading.id='puzzle-group-'+depth;
      const name=document.createElement('span');name.textContent=ShogiPuzzles.names[depth];
      const length=document.createElement('small');length.textContent=depth+'手詰';
      heading.append(name,length);group.setAttribute('aria-labelledby',heading.id);
      const choices=document.createElement('div');choices.className='puzzle-choices';
      ShogiPuzzles.list(depth).forEach((item,index)=>{
        const button=document.createElement('button');button.className='puzzle-choice';button.dataset.puzzleId=item.id;
        button.setAttribute('aria-label',ShogiPuzzles.names[depth]+'・'+depth+'手詰 第'+(index+1)+'問 '+item.title+'を解く');
        const number=document.createElement('small');number.textContent='第'+(index+1)+'問';
        const title=document.createElement('span');title.textContent=item.title;
        if(mode==='puzzle'&&puzzle?.id===item.id){button.setAttribute('aria-current','true');number.textContent+=' · プレイ中';}
        button.append(number,title);button.addEventListener('click',()=>startPuzzle(depth,index));choices.append(button);count++;
      });
      group.append(heading,choices);list.append(group);
    }
    list.scrollTop=0;$('puzzle-list-status').textContent=count+'問から選べます。';
  }
  function openPuzzles(){
    clearTimeout(puzzleFailTimer);puzzleFailTimer=null;
    closeCoin();for(const modal of [dialog,startDialog,infoDialog,pieceDialog,inviteDialog,resultDialog,puzzleFailDialog,hintDialog,lessonDialog])if(modal.open)modal.close();
    selected=null;syncCursor();renderPuzzleList();puzzleDialog.showModal();
  }
  function startPuzzle(depth,index=0){
    const nextPuzzle=ShogiPuzzles.list(depth)[index];if(!nextPuzzle)return;
    clearTimeout(puzzleFailTimer);puzzleFailTimer=null;
    stopAI();leaveOnline();greetingSource?.stop();
    closeCoin();for(const modal of [dialog,startDialog,infoDialog,pieceDialog,inviteDialog,resultDialog,puzzleDialog,puzzleFailDialog,hintDialog,lessonDialog])if(modal.open)modal.close();
    E=createShogiEngine({allowMissingKing:true});mode='puzzle';playerSide=1;started=true;
    puzzleDepth=depth;puzzleIndex=index;puzzle=nextPuzzle;puzzleHint=0;puzzleMistake=false;puzzleFailed=false;
    gameSerial++;resultShownKey='';state=ShogiPuzzles.position(puzzle);records=[E.record(state)];undoStack=[];
    selected=null;finished=null;legal=E.legalMoves(state);
    inspectPiece(puzzle.hand[0]||Math.abs(puzzle.pieces.find(([,p])=>p>0)?.[1])||5);render();
  }
  function playPuzzleMove(move){
    const next=E.apply(state,move);
    const node=ShogiPuzzles.node(puzzle,state,E);
    const correct=Boolean(node?.wins?.some(m=>E.moveKey(m)===E.moveKey(move)));
    if(!correct)puzzleMistake=true;
    puzzleHint=0;undoStack.push({state,records:records.slice()});commit(move);
    if(finished)return;
    if(state.ply>=puzzle.depth){showPuzzleFailure();return;}
    const reply=correct?ShogiPuzzles.node(puzzle,state,E)?.reply:E.chooseMove(state,{budgetMs:55,random:()=>0,history:records});
    if(!reply){showPuzzleFailure();return;}
    stopAI();const token=generation;
    aiTimer=setTimeout(async()=>{
      if(token!==generation||mode!=='puzzle'||finished)return;
      await animateOpponent(reply,token);
      if(token===generation&&mode==='puzzle'&&!finished){commit(reply);if(!finished&&state.ply>=puzzle.depth)showPuzzleFailure();}
    },450);
  }
  function showPuzzleFailure(){
    if(puzzleFailed)return;stopAI();puzzleFailed=true;selected=null;render('詰みには届きませんでした。局面を3秒間確認できます。');
    $('puzzle-fail-copy').textContent=puzzleMistake?'詰みには届きませんでした。動かした駒と玉の逃げ道を振り返ってみましょう。':'惜しいところまで来ています。最後に残った逃げ道を探してみましょう。';
    const serial=gameSerial;puzzleFailTimer=setTimeout(()=>{if(mode==='puzzle'&&puzzleFailed&&gameSerial===serial&&!puzzleFailDialog.open){puzzleFailDialog.showModal();syncCursor();}},3000);
  }
  $('puzzle-button').addEventListener('click',openPuzzles);
  $('puzzle-close').addEventListener('click',()=>puzzleDialog.close());
  document.querySelectorAll('[data-puzzle-filter]').forEach(button=>button.addEventListener('click',()=>renderPuzzleList(button.dataset.puzzleFilter)));
  $('puzzle-reset').addEventListener('click',()=>startPuzzle(puzzleDepth,puzzleIndex));
  $('puzzle-fail-retry').addEventListener('click',()=>startPuzzle(puzzleDepth,puzzleIndex));
  $('puzzle-fail-hint').addEventListener('click',()=>{startPuzzle(puzzleDepth,puzzleIndex);openPuzzleHint();});
  $('puzzle-fail-answer').addEventListener('click',()=>{startPuzzle(puzzleDepth,puzzleIndex);openPuzzleLesson('answer');});
  $('puzzle-fail-board').addEventListener('click',()=>puzzleFailDialog.close());
  $('puzzle-hint').addEventListener('click',openPuzzleHint);
  function openPuzzleHint(){
    if(mode!=='puzzle'||!isHuman())return;
    if(puzzleMistake&&!ShogiPuzzles.node(puzzle,state,E)?.wins?.length){startPuzzle(puzzleDepth,puzzleIndex);}
    puzzleHint=Math.min(3,puzzleHint+1);
    hintMove=ShogiPuzzles.node(puzzle,state,E)?.wins?.[0];if(!hintMove)return;
    selected=null;syncCursor();renderHint();hintDialog.showModal();
  }
  function renderHint(){
    $('hint-stage').textContent=['','ヒント 1 / 3 · 考え方','ヒント 2 / 3 · 使う駒','ヒント 3 / 3 · 行き先'][puzzleHint];
    const t=hintMove.drop||Math.abs(state.board[hintMove.from]);
    $('hint-title').textContent=puzzleHint===1?'まず、どこに注目しよう？':puzzleHint===2?'この駒を、働かせてみよう。':'この一手を、試してみよう。';
    $('hint-copy').textContent=puzzleHint===1?(state.ply===0?(puzzle.hint||ShogiTeacher.focus[puzzle.id]||puzzle.lesson):'玉の位置が変わりましたね。新しく空いた逃げ道を、仲間の駒と協力してふさぐ王手を探してみましょう。'):
      puzzleHint===2?(hintMove.drop?'持ち駒の':ShogiTeacher.pos(hintMove.from)+'の')+E.FULL_NAMES[t]+'を使います。王手になるだけでなく、玉が取れない・逃げにくい場所を探してみましょう。':
      ShogiTeacher.label(state,hintMove,E)+'です。'+(hintMove.promote?'ここでは成ることも大切です。成ったあとの利きを見てみましょう。':'その駒が、どの逃げ道をふさいでいるかも見てみましょう。');
    $('hint-diagram').innerHTML=ShogiTeacher.diagram(puzzle,{state,move:puzzleHint===3?hintMove:puzzleHint===2?{from:hintMove.from,to:null}:null},E);
    $('hint-more').hidden=puzzleHint===3;
  }
  function closeHint(){
    hintDialog.close();
    if(puzzleHint>=2&&hintMove&&isHuman()){selected=hintMove.drop?{drop:hintMove.drop}:{from:hintMove.from};render();if(puzzleHint===3)board.querySelector('[data-square="'+hintMove.to+'"]')?.classList.add('puzzle-hint-square');}
  }
  function openPuzzleLesson(kind){
    for(const modal of [dialog,resultDialog,puzzleFailDialog,hintDialog,puzzleDialog])if(modal.open)modal.close();
    lessonKind=kind;selected=null;syncCursor();
    lessonSteps=ShogiTeacher.line(puzzle,records.slice(1).map(r=>ShogiAI.fromUSI(r.usi)),ShogiPuzzles,E);
    lessonStep=kind==='solved'?lessonSteps.length-1:records.length-1;
    $('lesson-title').textContent=kind==='solved'?'正解です！':'答えを見てみよう。';
    $('lesson-kicker').textContent=ShogiPuzzles.names[puzzle.depth]+' · '+puzzle.depth+'手詰 · '+puzzle.title;
    $('lesson-next-puzzle').textContent=kind!=='solved'?'最初から解く':puzzleIndex+1<ShogiPuzzles.list(puzzleDepth).length?'次の問題':'最初の問題へ';
    renderLesson();lessonDialog.showModal();
  }
  function renderLesson(){
    const step=lessonSteps[lessonStep],copy=ShogiTeacher.explanation(puzzle,step,lessonStep,E),last=lessonStep===lessonSteps.length-1;
    $('lesson-diagram').innerHTML=ShogiTeacher.diagram(puzzle,step,E,{markEscape:last});
    $('lesson-step').textContent=lessonStep===0?'はじめの局面':lessonStep+' / '+(lessonSteps.length-1)+' 手目';
    $('lesson-prev').disabled=lessonStep===0;$('lesson-next').disabled=last;
    $('lesson-move').textContent=step.move?(step.before.turn===1?'あなた：':'玉方：')+ShogiTeacher.label(step.before,step.move,E):'一手ずつ、ゆっくり見ていきましょう。';
    $('lesson-explanation-title').textContent=copy.title;
    $('lesson-explanation').replaceChildren(...copy.paragraphs.map(text=>{const p=document.createElement('p');p.textContent=text;return p;}));
    const hand=step.state.hands[0].flatMap((n,t)=>n?[E.FULL_NAMES[t]+'×'+n]:[]);
    $('lesson-hand').textContent='あなたの持ち駒：'+(hand.join('　')||'なし');lessonDialog.querySelector('.lesson-content').scrollTop=0;
  }
  $('puzzle-answer').addEventListener('click',()=>{if(mode==='puzzle'&&isHuman())openPuzzleLesson('answer');});
  $('hint-more').addEventListener('click',()=>{puzzleHint=Math.min(3,puzzleHint+1);renderHint();});
  $('hint-close').addEventListener('click',closeHint);
  $('lesson-prev').addEventListener('click',()=>{if(lessonStep>0){lessonStep--;renderLesson();}});
  $('lesson-next').addEventListener('click',()=>{if(lessonStep<lessonSteps.length-1){lessonStep++;renderLesson();}});
  $('lesson-close').addEventListener('click',()=>lessonDialog.close());
  $('lesson-board').addEventListener('click',()=>lessonDialog.close());
  $('lesson-level').addEventListener('click',openPuzzles);
  $('lesson-next-puzzle').addEventListener('click',()=>startPuzzle(puzzleDepth,lessonKind==='solved'?(puzzleIndex+1)%ShogiPuzzles.list(puzzleDepth).length:puzzleIndex));
  function openStart(){
    clearTimeout(puzzleFailTimer);puzzleFailTimer=null;
    resultDialog.close();
    selected=null;syncCursor();document.querySelector('input[name="level"][value="'+level+'"]').checked=true;
    invitedRoom=null;startMode=mode==='online'?'friend':'ai';
    $('start-error').hidden=true;startView();startDialog.showModal();
  }
  $('restart').addEventListener('click',openStart);
  function cancelStart(){startRequest++;$('start-game').disabled=false;startView();startDialog.close();syncCursor();}
  $('start-cancel').addEventListener('click',cancelStart);
  startDialog.addEventListener('cancel',cancelStart);
  $('start-game').addEventListener('click',async()=>{
    const request=++startRequest,nextLevel=document.querySelector('input[name="level"]:checked').value;
    const friend=startMode==='friend',room=invitedRoom;
    $('start-error').hidden=true;$('start-game').disabled=true;$('start-game').textContent='対局を準備中…';
    try{
      prepareAudio();
      if(friend){
        const seat=room?await ShogiOnline.join(room):await ShogiOnline.create();
        if(request!==startRequest)return;
        startDialog.close();enterOnline(seat);
        // A fresh host opens the invitation once the seat has been acknowledged.
        if(!room){
          const check=setInterval(()=>{
            if(request!==startRequest||mode!=='online'){clearInterval(check);return;}
            if(onlineInfo){clearInterval(check);showInvite();}
          },100);
          setTimeout(()=>clearInterval(check),12000);
        }
      }else{if(request!==startRequest)return;startDialog.close();openAiCoin(nextLevel);}
    }catch(e){if(request===startRequest){$('start-error').textContent=e.message;$('start-error').hidden=false;}}
    finally{if(request===startRequest){$('start-game').disabled=false;startView();}}
  });
  function showResult(force=false){
    if(!finished)return;
    const key=(mode==='online'?onlineInfo?.room+':'+onlineInfo?.round:gameSerial)+':'+finished.reason+':'+state.ply;
    if(mode==='puzzle'){if(puzzleMistake){if(!puzzleFailed)showPuzzleFailure();return;}if(resultShownKey!==key||force){resultShownKey=key;openPuzzleLesson('solved');}return;}
    if(resultShownKey!==key||force){
      resultShownKey=key;selected=null;
      for(const modal of [dialog,startDialog,infoDialog,pieceDialog,inviteDialog,puzzleDialog,hintDialog,lessonDialog])if(modal.open)modal.close();
      const win=finished.winner===playerSide,draw=finished.winner===0,closed=finished.reason==='left';
      resultDialog.dataset.result=draw||closed?'draw':win?'win':'loss';
      $('result-emblem').textContent=draw||closed?'和':win?'王':'礼';
      $('result-title').textContent=mode==='puzzle'?'正解です！':closed?'部屋が終了しました':draw?'引き分けです':win?'あなたの勝ちです':'あなたの負けです';
      $('result-reason').textContent=({mate:'詰みです',resign:'投了です',repetition:'千日手です','perpetual-check':'連続王手の千日手です','no-moves':'指せる手がありません','move-limit':'規定の手数に達しました',left:'対局終了'})[finished.reason]||'対局終了';
      $('result-copy').textContent=mode==='puzzle'?puzzle.lesson:state.ply+'手まで。お疲れさまでした。';
      if(!resultDialog.open)resultDialog.showModal();syncCursor();
    }
    if(!resultDialog.open)return;
    const own=onlineInfo?.rematch?.[onlineSeat],other=onlineInfo?.rematch?.[-onlineSeat];
    const available=mode!=='online'||Boolean(online?.connected&&onlineInfo?.presence.every(Boolean)&&!onlineInfo?.left?.[-onlineSeat]&&finished.reason!=='left'&&!onlineError);
    $('result-rematch').disabled=!available||Boolean(mode==='online'&&own);
    $('result-settings').textContent=mode==='puzzle'?'問題を選ぶ':'新しい対局・難易度変更';
    $('result-rematch').textContent=mode==='puzzle'?(puzzleIndex+1<ShogiPuzzles.list(puzzleDepth).length?'次の問題':'最初の問題へ'):mode==='online'&&other&&!own?'再戦を受ける':'もう一度対戦';
    $('result-message').textContent=mode==='puzzle'?state.ply+'手で詰みました。':mode==='ai'?'同じ難易度で、もう一局。':!available?'相手が戻ると、再戦できます。':own?'再戦をお願いしました。相手の返事を待っています。':other?'相手がもう一局を希望しています。':'もう一局は、お互いが選ぶと始まります。';
  }
  $('result-rematch').addEventListener('click',()=>{
    prepareAudio();
    if(mode==='puzzle'){startPuzzle(puzzleDepth,(puzzleIndex+1)%ShogiPuzzles.list(puzzleDepth).length);return;}
    if(mode==='ai'){resultDialog.close();openAiCoin(level);return;}
    $('result-rematch').disabled=true;
    if(!online?.send({type:'rematch'})){$('result-message').textContent='接続を確認しています。少し待ってお試しください。';showResult();}
  });
  $('result-settings').addEventListener('click',()=>mode==='puzzle'?openPuzzles():openStart());
  $('result-board').addEventListener('click',()=>resultDialog.close());
  function showInfo(title){selected=null;syncCursor();$('info-title').textContent=title;$('info-content').replaceChildren();infoDialog.dataset.view=title==='遊び方'?'help':'history';infoDialog.showModal();}
  $('history-button').addEventListener('click',()=>{
    showInfo('棋譜');const history=document.createElement('ol');history.id='move-history';
    records.slice(1).forEach((entry,index)=>{const line=document.createElement('li');line.textContent=(index+1)+'　'+entry.label;history.append(line);});
    if(!history.children.length){const line=document.createElement('li');line.textContent='まだ指していません。';history.append(line);}$('info-content').append(history);
  });
  $('help-button').addEventListener('click',()=>{
    showInfo('遊び方');$('info-content').innerHTML=ShogiGuide.help(E);$('open-piece-guide').addEventListener('click',()=>{renderPieceGuide();pieceDialog.showModal();syncCursor();});
  });
  $('info-close').addEventListener('click',()=>infoDialog.close());
  function inspectPiece(type){
    if(!type||livePiece===type)return;
    livePiece=type;$('live-piece-name').innerHTML=ShogiGuide.name(type,E);$('live-piece-content').innerHTML=ShogiGuide.pair(type,E,'live');bindGuideExplanation($('live-piece-content'));$('live-guide').scrollTop=0;
  }
  function setGuideHidden(hidden){
    document.body.classList.toggle('guide-hidden',hidden);
    $('guide-hide').setAttribute('aria-expanded',String(!hidden));$('guide-show').setAttribute('aria-expanded',String(!hidden));
    try{localStorage.setItem('shogi-guide-hidden',hidden?'1':'0');}catch(_){/* Private browsing may block storage. */}
  }
  $('guide-hide').addEventListener('click',()=>setGuideHidden(true));
  $('guide-show').addEventListener('click',()=>setGuideHidden(false));
  function bindGuideExplanation(root){
    const button=root.querySelector('.guide-explain-button');if(!button)return;
    button.addEventListener('click',()=>{const open=root.classList.toggle('show-details');button.setAttribute('aria-expanded',String(open));button.textContent=open?'解説を閉じる':'解説を見る';});
  }
  function renderPieceGuide(){
    $('piece-picker').replaceChildren();
    for(const p of [1,2,3,4,5,6,7,8]){
      const button=document.createElement('button');button.type='button';button.textContent=E.NAMES[p];button.setAttribute('aria-label',E.FULL_NAMES[p]);button.setAttribute('aria-pressed',String(p===guidePiece));
      button.addEventListener('click',()=>{guidePiece=p;renderPieceGuide();});$('piece-picker').append(button);
    }
    $('piece-guide-detail').innerHTML=ShogiGuide.pair(guidePiece,E,'modal');bindGuideExplanation($('piece-guide-detail'));
  }
  $('piece-guide-close').addEventListener('click',()=>pieceDialog.close());
  dialog.addEventListener('cancel',()=>render());
  for(const modal of [dialog,startDialog,coinDialog,infoDialog,inviteDialog,pieceDialog,resultDialog,puzzleDialog,puzzleFailDialog,hintDialog,lessonDialog])modal.addEventListener('close',syncCursor);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&selected&&!dialog.open&&!startDialog.open&&!infoDialog.open){selected=null;render();}});
  try{setGuideHidden(localStorage.getItem('shogi-guide-hidden')==='1');}catch(_){setGuideHidden(false);}inspectPiece(1);render();
  if(invitedRoom){
    if(/^[\w-]{24}$/.test(invitedRoom)){
      const seat=ShogiOnline.saved(invitedRoom);
      if(seat)enterOnline(seat);
      else{startMode='friend';startView();startDialog.showModal();}
    }else{invitedRoom=null;render();}
  }
  const context=document.modelContext;
  if(context?.registerTool){
    const lifetime=new AbortController();
    const snapshot=()=>({started,mode,level,puzzleId:puzzle?.id,playerSide,connected:online?.connected,animating:!movingPiece.hidden,turn:state.turn===playerSide?'human':'opponent',ply:state.ply,board:state.board.slice(),hands:state.hands.map(h=>h.slice()),result:finished,legalMoves:isHuman()?legal:[]});
    const register=tool=>{try{Promise.resolve(context.registerTool(tool,{signal:lifetime.signal})).catch(()=>{});}catch(_){}};
    register({name:'get_shogi_game',title:'将棋の局面を読む',description:'Read the shogi position. Squares 0–80 are canonical from the second-player side. Positive pieces belong to first player. playerSide identifies your seat.',
      inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:snapshot});
    register({name:'play_shogi_move',title:'将棋の一手を指す',description:'Play one legal move returned by get_shogi_game. Online moves wait for the server. Returns the currently visible position.',
      inputSchema:{type:'object',properties:{from:{type:['integer','null'],minimum:0,maximum:80},to:{type:'integer',minimum:0,maximum:80},drop:{type:'integer',minimum:1,maximum:7},promote:{type:'boolean'}},required:['to'],additionalProperties:false},
      annotations:{readOnlyHint:false},execute:input=>{
        if(!input||!Number.isInteger(input.to)||input.to<0||input.to>80||modalOpen())throw new Error('対局状態と指し手を確認してください。');
        const match=legal.find(m=>E.moveKey(m)===E.moveKey({...input,from:input.drop?null:input.from}));
        if(!match)throw new Error('この手は指せません。');humanMove(match);return snapshot();
      }});
    window.addEventListener('pagehide',()=>lifetime.abort(),{once:true});
  }
  window.addEventListener('pagehide',()=>{online?.close();stopAI();strongAI.dispose();greetingSource?.stop();},{once:true});
})();
