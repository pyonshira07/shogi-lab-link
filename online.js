/* Two anonymous seats. Only the server can accept moves or decide a result. */
const ShogiOnline=(()=>{
  const savedKey=room=>'shogi-seat:'+room;
  function saved(room){try{return JSON.parse(sessionStorage.getItem(savedKey(room)));}catch{return null;}}
  function save(seat){try{sessionStorage.setItem(savedKey(seat.room),JSON.stringify(seat));}catch{throw new Error('このブラウザでは席を保存できません。通常のウィンドウで開いてください。');}}
  async function request(endpoint){
    if(!/^https?:$/.test(location.protocol))throw new Error('友達との対戦は、招待URLからお楽しみください。');
    let response;
    try{response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(12000)});}
    catch{throw new Error('接続できませんでした。少し待って、もう一度お試しください。');}
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'接続できませんでした。もう一度お試しください。');
    save(data);return data;
  }
  async function serverCreate(){return request('/api/rooms');}
  async function serverJoin(room){return saved(room)||request('/api/rooms/'+encodeURIComponent(room)+'/join');}
  async function serverInvitation(room){
    let base=location.origin;
    const config=await fetch('/api/config',{signal:AbortSignal.timeout(6000)}).then(r=>r.json()).catch(()=>({}));
    if(config.publicUrl)base=config.publicUrl;
    else if(['localhost','127.0.0.1'].includes(location.hostname))throw new Error('招待URLを準備しています。少し待ってお試しください。');
    const url=new URL(base);url.searchParams.set('room',room);return url.href;
  }
  function connectServer(seat,{onSnapshot,onStatus,onError}){
    let socket=null,closed=false,retry=null,attempt=0,joinTimer=null,connected=false,round=1;
    function open(){
      if(closed)return;clearTimeout(retry);
      onStatus(false);
      socket=new WebSocket(location.origin.replace(/^http/,'ws')+'/socket');
      const current=socket;
      joinTimer=setTimeout(()=>{if(!connected)current.close();},10000);
      current.onopen=()=>current.send(JSON.stringify({type:'hello',room:seat.room,token:seat.token}));
      current.onmessage=({data})=>{
        if(closed||current!==socket)return;
        let packet;try{packet=JSON.parse(data);}catch{return;}
        if(packet.type==='snapshot'){
          clearTimeout(joinTimer);attempt=0;connected=true;round=packet.round;onStatus(true);onSnapshot(packet);
        }else if(packet.type==='error'){
          if(['auth','gone','replaced'].includes(packet.code)){closed=true;connected=false;clearTimeout(joinTimer);clearTimeout(retry);current.close();onStatus(false);}
          onError(packet.message,closed);
        }
      };
      current.onerror=()=>{};
      current.onclose=()=>{
        clearTimeout(joinTimer);if(closed||current!==socket)return;
        connected=false;onStatus(false);
        retry=setTimeout(open,Math.min(8000,700*2**attempt++));
      };
    }
    function send(message){if(!connected||socket?.readyState!==WebSocket.OPEN)return false;socket.send(JSON.stringify({round,...message}));return true;}
    function wake(){if(!closed&&!connected&&socket?.readyState===WebSocket.CLOSED)open();}
    window.addEventListener('online',wake);
    open();
    return {send,get connected(){return connected;},close(leave=false){
      if(leave)send({type:'leave'});
      closed=true;connected=false;clearTimeout(retry);clearTimeout(joinTimer);window.removeEventListener('online',wake);socket?.close();
    }};
  }
  const peerTestMode=()=>new URLSearchParams(location.search).has('p2p');
  const publicPeerMode=()=>typeof Peer==='function'&&(peerTestMode()||(location.protocol==='https:'&&!['localhost','127.0.0.1'].includes(location.hostname)));
  function randomId(){
    const bytes=crypto.getRandomValues(new Uint8Array(18));
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  async function peerCreate(){const seat={room:randomId(),token:randomId(),side:1,transport:'peer'};save(seat);return seat;}
  async function peerJoin(room){
    if(!/^[\w-]{24}$/.test(room))throw new Error('招待URLを確認してください。');
    const old=saved(room);if(old)return old;
    const seat={room,token:randomId(),side:-1,transport:'peer'};save(seat);return seat;
  }
  async function peerInvitation(room){const test=peerTestMode()||(['localhost','127.0.0.1'].includes(location.hostname)&&saved(room)?.transport==='peer'),url=new URL(location.href);url.search='';url.hash='';if(test)url.searchParams.set('p2p','1');url.searchParams.set('room',room);return url.href;}
  function connectPeer(seat,{onSnapshot,onStatus,onError}){
    if(typeof Peer!=='function'){
      queueMicrotask(()=>onError('友達対戦の接続機能を読み込めませんでした。ページを開き直してください。',true));
      return {send:()=>false,get connected(){return false;},close(){}};
    }
    const host=seat.side===1,E=createShogiEngine(),hostId='shogi-lab-'+seat.room;
    let peer=null,conn=null,closed=false,connected=false,retry=null,attempt=0,guestRound=1;
    let room=host?{id:seat.room,state:E.initial(),moves:[],records:[],result:null,began:false,round:1,rematch:{1:false,'-1':false},left:{1:false,'-1':false},assignment:{1:null,'-1':null},coin:null,guestToken:null}:null;
    if(room)room.records=[E.record(room.state)];
    const liveGuest=()=>Boolean(conn?.open);
    function snapshot(role,cause='sync',move=null){
      return {type:'snapshot',room:room.id,seat:role,side:room.assignment[role]||role,cause,move,state:room.state,moves:room.moves,result:room.result,round:room.round,rematch:room.rematch,left:room.left,coin:room.coin,joined:Boolean(room.guestToken),began:room.began,presence:[connected,liveGuest()]};
    }
    function deliver(role,value){
      if(role===1)onSnapshot(typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value)));
      else if(liveGuest())conn.send(value);
    }
    function broadcast(cause,move){deliver(1,snapshot(1,cause,move));deliver(-1,snapshot(-1,cause,move));}
    function fail(role,code,message){
      if(role===1)onError(message,['auth','gone','replaced'].includes(code));
      else if(liveGuest())conn.send({type:'error',code,message});
    }
    function decideCoin(){
      const hostSente=(crypto.getRandomValues(new Uint8Array(1))[0]&1)===0;
      room.coin={face:hostSente?'king':'jewel'};room.assignment[1]=hostSente?1:-1;room.assignment[-1]=-room.assignment[1];room.began=true;
    }
    function handle(role,msg){
      if(!msg||typeof msg!=='object')return fail(role,'invalid','送信内容を確認してください。');
      if(['move','resign','leave','rematch'].includes(msg.type)&&msg.round!==room.round){fail(role,'stale','盤面を更新しました。もう一度操作してください。');deliver(role,snapshot(role));return;}
      if(msg.type==='sync'){deliver(role,snapshot(role));return;}
      if(msg.type==='leave'){
        room.left[role]=true;room.rematch[role]=false;
        if(!room.result)room.result={winner:room.began?-room.assignment[role]:0,reason:room.began?'resign':'left'};
        broadcast('end');return;
      }
      if(msg.type==='rematch'){
        if(!room.result||!room.began||room.result.reason==='left')return fail(role,'unavailable','対局が終わってから再戦できます。');
        if(!connected||!liveGuest()||room.left[1]||room.left[-1])return fail(role,'waiting','相手が戻るまでお待ちください。');
        room.rematch[role]=true;
        if(room.rematch[1]&&room.rematch[-1]){
          room.state=E.initial();room.moves=[];room.records=[E.record(room.state)];room.result=null;room.round++;room.began=false;
          room.rematch={1:false,'-1':false};room.assignment={1:null,'-1':null};room.coin=null;decideCoin();broadcast('coin');
        }else broadcast('rematch-request');
        return;
      }
      if(room.result)return fail(role,'ended','この対局は終了しました。');
      if(msg.type==='resign'){
        if(!room.began)return fail(role,'waiting','先手・後手を決めてから対局を始めます。');
        room.result={winner:-room.assignment[role],reason:'resign'};broadcast('end');return;
      }
      if(msg.type!=='move')return fail(role,'invalid','この操作はできません。');
      if(!room.began)return fail(role,'waiting','コイントスで先手・後手が決まるまでお待ちください。');
      if(!connected||!liveGuest())return fail(role,'waiting','相手の接続を待っています。');
      if(msg.ply!==room.state.ply){fail(role,'stale','盤面を更新しました。もう一度指してください。');deliver(role,snapshot(role));return;}
      if(room.state.turn!==room.assignment[role])return fail(role,'turn','今は相手の番です。');
      const requested=msg.move;
      if(!requested||!Number.isInteger(requested.to)||requested.to<0||requested.to>80||(!requested.drop&&(!Number.isInteger(requested.from)||requested.from<0||requested.from>80))||(requested.drop&&(!Number.isInteger(requested.drop)||requested.drop<1||requested.drop>7||requested.from!==null))||typeof requested.promote!=='boolean')return fail(role,'illegal','その手は指せません。');
      const move=E.legalMoves(room.state).find(m=>E.moveKey(m)===E.moveKey(requested));
      if(!move)return fail(role,'illegal','その手は指せません。');
      room.state=E.apply(room.state,move);room.moves.push(move);room.records.push(E.record(room.state));room.result=E.outcome(room.state,room.records);
      if(room.state.ply>=1024&&!room.result)room.result={winner:0,reason:'move-limit'};
      broadcast('move',move);
    }
    function attachGuest(candidate){
      const token=String(candidate.metadata?.token||'');
      if(room.guestToken&&room.guestToken!==token){candidate.on('open',()=>{candidate.send({type:'error',code:'replaced',message:'この部屋は満員です。新しい部屋を作って遊びましょう。'});candidate.close();});return;}
      if(conn&&conn!==candidate)conn.close();conn=candidate;room.guestToken=token||room.guestToken||'guest';room.left[-1]=false;
      candidate.on('data',msg=>{if(candidate===conn)handle(-1,msg);});
      candidate.on('open',()=>{
        if(candidate!==conn||closed)return;
        attempt=0;if(!room.began){decideCoin();broadcast('coin');}else broadcast('presence');
      });
      candidate.on('close',()=>{if(candidate!==conn||closed)return;conn=null;deliver(1,snapshot(1,'presence'));});
      candidate.on('error',()=>{});
    }
    function startGuestConnection(){
      if(closed||!peer?.open)return;clearTimeout(retry);onStatus(false);
      const current=peer.connect(hostId,{reliable:true,metadata:{token:seat.token}});conn=current;
      current.on('open',()=>{if(closed||current!==conn)return;connected=true;attempt=0;onStatus(true);current.send({type:'sync'});});
      current.on('data',packet=>{
        if(closed||current!==conn||!packet||typeof packet!=='object')return;
        if(packet.type==='snapshot'){guestRound=packet.round;onSnapshot(packet);}
        else if(packet.type==='error')onError(packet.message,['auth','gone','replaced'].includes(packet.code));
      });
      current.on('error',()=>{});
      current.on('close',()=>{if(closed||current!==conn)return;connected=false;onStatus(false);retry=setTimeout(startGuestConnection,Math.min(8000,700*2**attempt++));});
    }
    onStatus(false);
    peer=host?new Peer(hostId,{debug:0}):new Peer({debug:0});
    peer.on('open',()=>{
      if(closed)return;connected=true;onStatus(true);
      if(host){deliver(1,snapshot(1));peer.on('connection',attachGuest);}else startGuestConnection();
    });
    peer.on('disconnected',()=>{if(closed)return;connected=false;onStatus(false);try{peer.reconnect();}catch{}});
    peer.on('error',error=>{
      if(closed)return;
      if(!host&&error.type==='peer-unavailable'){clearTimeout(retry);retry=setTimeout(startGuestConnection,Math.min(8000,700*2**attempt++));return;}
      const fatal=['browser-incompatible','invalid-id','invalid-key','ssl-unavailable','unavailable-id'].includes(error.type);
      onError(fatal?'この端末では友達対戦を開始できません。':'接続が不安定です。もう一度お試しください。',fatal);
    });
    return {send(message){
      if(closed||!connected)return false;
      const value={round:host?room.round:guestRound,...message};
      if(host){handle(1,value);return true;}
      if(!conn?.open)return false;conn.send(value);return true;
    },get connected(){return connected;},close(leave=false){
      if(closed)return;if(leave){if(host)handle(1,{type:'leave',round:room.round});else if(conn?.open)conn.send({type:'leave',round:guestRound});}
      closed=true;connected=false;clearTimeout(retry);conn?.close();peer?.destroy();onStatus(false);
    }};
  }
  const create=()=>publicPeerMode()?peerCreate():serverCreate();
  const join=room=>publicPeerMode()?peerJoin(room):serverJoin(room);
  const invitation=room=>(saved(room)?.transport==='peer'||publicPeerMode())?peerInvitation(room):serverInvitation(room);
  const connect=(seat,callbacks)=>(seat.transport==='peer'||publicPeerMode())?connectPeer(seat,callbacks):connectServer(seat,callbacks);
  return {create,join,saved,invitation,connect};
})();
