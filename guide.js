/* Original explanatory graphics; movement definitions come from the game rules. */
const ShogiGuide=(()=>{
  const readings={1:'ふひょう',2:'きょうしゃ',3:'けいま',4:'ぎんしょう',5:'きんしょう',6:'かくぎょう',7:'ひしゃ',8:'おうしょう',9:'ときん',10:'なりきょう',11:'なりけい',12:'なりぎん',14:'りゅうま',15:'りゅうおう'};
  const displayNames={1:'歩兵',2:'香車',3:'桂馬',4:'銀将',5:'金将',6:'角行',7:'飛車',8:'王将',9:'と金',10:'成香',11:'成桂',12:'成銀',14:'龍馬',15:'龍王'};
  const name=(type,E)=>'<ruby>'+(displayNames[type]||E.FULL_NAMES[type])+'<rt>'+readings[type]+'</rt></ruby>';
  const descriptions={
    1:'前へ1マス。後ろや横には進めません。',2:'前へ、空いている限り何マスでも進めます。',
    3:'前へ2マス、左右へ1マスの2か所へ跳びます。間に駒があっても跳び越えられます。',
    4:'前・斜め前・斜め後ろへ1マス。真横と真後ろへは進めません。',
    5:'前・斜め前・横・後ろへ1マス。斜め後ろへは進めません。',
    6:'斜め4方向へ何マスでも。途中の駒は跳び越えられません。',
    7:'縦・横へ何マスでも。途中の駒は跳び越えられません。',
    8:'周囲の8方向へ1マス。相手に取られる場所へは進めません。王と玉の動きは同じです。',
    9:'金と同じ6方向へ1マス。歩だったときと違い、横や後ろにも進めます。',
    10:'金と同じ6方向へ1マス。前へ何マスも進む動きはなくなります。',
    11:'金と同じ6方向へ1マス。桂馬の跳ぶ動きはなくなります。',
    12:'金と同じ6方向へ1マス。斜め後ろへは進めなくなります。',
    14:'角の動きに加え、縦・横にも1マス進めます。',
    15:'飛車の動きに加え、斜めにも1マス進めます。'
  };
  function grid(size,cell){let paths='';for(let n=0;n<=size;n++)paths+='<path d="M '+(n*cell)+' 0 V '+size*cell+' M 0 '+(n*cell)+' H '+size*cell+'"/>';return '<g fill="none" stroke="#8a704c" stroke-width=".7">'+paths+'</g>';}
  function glyph(x,y,p,E,scale=1){return '<g transform="translate('+x+' '+y+') scale('+scale+')'+(p<0?' rotate(180)':'')+'"><path d="M 0 -16 L 12 -9 L 16 16 L -16 16 L -12 -9 Z" fill="#ffdfa7" stroke="#b68d50" stroke-width=".6"/><text x="0" y="9" text-anchor="middle" font-family="serif" font-size="25" font-weight="700" fill="'+(Math.abs(p)>8?'#a83b30':'#2c2d25')+'">'+E.NAMES[Math.abs(p)]+'</text></g>';}
  function diagram(type,E,markerId='movement-arrow'){
    const size=280,center=140,cell=40,parts=[];
    for(const [dr,dc,range] of E.MOVEMENTS[type]){
      if(range>1){
        const x=center+dc*120,y=center+dr*120;
        parts.push('<path class="range-arrow" d="M '+center+' '+center+' L '+x+' '+y+'" fill="none" stroke="#285f49" stroke-width="3" marker-end="url(#'+markerId+')"/>');
      }else if(type===3){
        const x=center+dc*cell,y=center+dr*cell;
        parts.push('<path d="M '+center+' '+(center-18)+' Q '+x+' '+center+' '+x+' '+y+'" fill="none" stroke="#285f49" stroke-width="2" stroke-dasharray="4 4"/>');
        parts.push('<circle class="step-dot jump-dot" cx="'+x+'" cy="'+y+'" r="7" fill="#285f49"/>');
      }else parts.push('<circle class="step-dot" cx="'+(center+dc*cell)+'" cy="'+(center+dr*cell)+'" r="7" fill="#285f49"/>');
    }
    return '<svg viewBox="0 0 '+size+' '+size+'" role="img" aria-label="'+E.FULL_NAMES[type]+'の動き。'+descriptions[type]+'" xmlns="http://www.w3.org/2000/svg"><defs><marker id="'+markerId+'" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#285f49"/></marker></defs><rect width="280" height="280" fill="#eac389"/>'+grid(7,40)+parts.join('')+glyph(center,center,type,E)+'</svg>';
  }
  const tips={
    1:['前へ1マスだけ進みます。いちばん数が多く、取られても失う力が小さい駒です。前のマスを相手に使わせない役目もあります。','飛車の前の歩を進めると、飛車が進む道を作れます。相手の金や銀の前に歩を置き、それを取らせて前へ動かすと、空いた場所を別の駒で攻められます。成ると金と同じ動きになります。','後ろや横へ動けないので、進みすぎると戻れません。同じ縦の列に自分の歩を2枚置くことと、歩を置いた一手だけで詰ませることは禁止です。'],
    2:['前にだけ、何マスでも進めます。一直線の道を遠くから攻める役目です。横や後ろへは動けません。','飛車の前に香車を置くと、香車が取られても後ろの飛車で攻め続けられます。持ち駒なら、後ろへ逃げられない玉の下側に置くと、遠くから王手できます。','前に駒が1枚あるだけで進めません。横から攻められると逃げにくい駒です。成ると金の動きになりますが、遠くまで進む力はなくなります。'],
    3:['ほかの駒を飛び越えられる唯一の駒です。前へ2マス、左右へ1マスずれた場所を攻めます。前に並ぶ守りの駒を越えて攻められます。','着地する場所を歩や銀で守ると、桂馬が取られても取り返せます。相手の玉と飛車など、大切な2枚を同時に攻められる場所へ跳ぶと大きく得できます。','行ける場所が前の2か所だけで、後ろへ戻れません。前・横・後ろの相手は取れません。守る味方がいない場所へ跳ぶと、簡単に取られます。'],
    4:['前と斜めに動けるため、攻めと守りの両方に使えます。金にはできない、斜め後ろへ下がる動きが特徴です。','歩のすぐ後ろを進むと、歩が取られても銀で取り返せます。角が遠くから玉を攻め、銀が近くの逃げ道を止める組み合わせも強力です。','真横と真後ろへ動けません。真横から攻められても、その場では横へ逃げられません。成ると横や真後ろへ動けますが、斜め後ろへは動けません。'],
    5:['前・横・斜め前・真後ろの6方向へ動きます。近くを広く守れるため、玉を守る中心になる駒です。','玉の横や斜め前に置くと、玉へ近づく相手を止めやすくなります。金と銀、または金2枚を隣り合わせにすると、おたがいを守れます。相手の玉のすぐ前へ置く攻めも強力です。','斜め後ろへ動けず、1手で遠くへ行けません。攻めに使って玉から離しすぎると、玉を守る駒が足りなくなります。金は相手側の3段へ入っても成れません。'],
    6:['斜めなら、途中に駒がない限り何マスでも進めます。遠くの相手を一度に狙う役目です。成ると、周りへ1マス動く力も増えます。','飛車と一緒に使うと、飛車が縦横を、角が斜めを攻めて、玉の逃げ道を減らせます。角で玉と飛車、または玉と金を同時に攻められる場所を探すと大きく得できます。','縦と横へは動けないため、近くへ寄られると逃げにくくなります。自分の歩が斜めの道をふさいでいると動けないので、角の前を空けてから使います。'],
    7:['縦と横なら、途中に駒がない限り何マスでも進めます。広い範囲を一度に攻める中心の駒です。成ると斜めにも1マス動けます。','前の歩を進めて道を開け、銀や金で守りながら相手側へ入ると強力です。飛車が玉の横や後ろへの逃げ道を止め、金や銀が近くから攻める形を作れます。','斜めには動けないため、角や桂馬に狙われると逃げにくいことがあります。大切な駒なので、守る味方がいない場所へ出すと、逃げるために何手も使ってしまいます。'],
    8:['取られると負けになる、最も大切な駒です。周りの8方向へ1マス動けますが、相手が攻撃しているマスには進めません。','金や銀を近くに置くと、相手が玉へ近づきにくくなります。横や後ろに逃げられる空きマスを1つ以上残すと、攻められたときに逃げやすくなります。','一度に1マスしか動けず、自分だけでは遠くへ逃げられません。味方を周りに集めすぎて空きマスをなくすと、王手をかけられたときに逃げられません。']
  };
  function pair(type,E,id){
    const base=E.base(type),promotable=[1,2,3,4,6,7].includes(base),t=tips[base];
    const figure=(p,label)=>'<figure class="guide-figure'+(p===type?' current-piece':'')+'"><figcaption>'+label+' <b>'+name(p,E)+'</b></figcaption>'+diagram(p,E,id+'-'+p)+'</figure>';
    return '<div class="guide-pair'+(promotable?'':' no-promotion')+'">'+figure(base,'成る前')+(promotable?figure(base+8,'成った後'):'<div class="no-promotion-note">'+E.FULL_NAMES[base]+'は成りません。</div>')+'</div><p class="pair-legend">↑ 前　● 進める先　→ その先も進める　┄ 跳び越える</p><button type="button" class="guide-explain-button" aria-expanded="false">解説を見る</button><div class="guide-tips"><p><b>特徴</b>'+t[0]+'</p><p><b>強い点</b>'+t[1]+'</p><p class="weak-tip"><b>弱い点</b>'+t[2]+'</p></div>';
  }
  function initialDiagram(E){
    return '<svg viewBox="0 0 270 270" role="img" aria-label="将棋の初期配置。手前から香・桂・銀・金・玉・金・銀・桂・香。2段目は左に角、右に飛車。3段目は歩9枚。上の3段が敵陣。" xmlns="http://www.w3.org/2000/svg"><rect width="270" height="270" fill="#eac389"/><rect width="270" height="90" fill="#d9a870"/>'+grid(9,30)+E.initial().board.map((p,i)=>p?glyph(15+i%9*30,15+Math.floor(i/9)*30,p,E,.72):'').join('')+'</svg>';
  }
  const section=(title,body)=>'<details class="rule-section"><summary>'+title+'</summary><div>'+body+'</div></details>';
  function help(E){
    return '<p class="help-lead">相手の玉を逃げられなくしたら、勝ち。</p><div class="help-actions"><button id="open-piece-guide" class="guide-launch"><span aria-hidden="true">歩　飛　角</span><b>駒の動き方を見る</b><small>成る前・成った後と、特徴・強い点・弱い点</small></button></div>'+ 
    section('詰将棋の遊び方','<p>ヘッダーの「詰将棋」から、初級1手詰・中級3手詰・上級5手詰を選べます。相手の応手も1手に数えるので、あなたが指すのはそれぞれ1・2・3回です。</p><p>正解手順は王手を続けます。練習では正解以外の合法手も実際に指せて、相手も応手します。決められた手数で詰まなければ失敗となり、その局面を見直してからやり直せます。</p><p>玉方は最も長く逃げられる手を選び、盤上とあなたの持ち駒以外の駒を合駒に使えます。二歩・打ち歩詰めはできません。「ヒント」は考え方・使う駒・行き先の3段階。「答えを見る」では、図と先生の解説を一手ずつ確認できます。</p>')+
    section('まずは、クリックで一手','<ol><li>自分の駒をクリックして持ち上げます。</li><li>光った移動先をクリックして置きます。持ち駒は点のある空きマスへ。</li><li>成れるときは「成る」「成らない」を選びます。</li></ol><p>同じ駒の再クリック・右クリック・盤の外のクリックで選択解除。選んだだけでは一手になりません。</p><p>AI対戦は4つの強さから。友達対戦は部屋の招待URLを送るだけ。勝敗画面では再戦・対戦設定・盤面の確認を選べます。</p>')+
    section('盤の見方・初期配置','<p>9×9の盤に、双方20枚ずつ。先手から交互に1手を指します。パスはできません。駒の先が向いている方が、その駒の前です。</p><figure class="initial-diagram">'+initialDiagram(E)+'<figcaption>あなたから見て、上の3段が敵陣。</figcaption></figure><p>手前の列は中央に玉、その両側に金・銀・桂・香。2列目は左に角、右に飛車、3列目は歩9枚です。</p><p>盤の数字は筋、漢数字は段。「７六」は7筋・六段目。棋譜の「打」は持ち駒を置いた手、「成」は成った手です。</p>')+
    section('駒を取る・持ち駒を打つ','<p>駒の動ける先に相手の駒があれば、取って自分の持ち駒にできます。成駒を取ると、元の駒に戻ります。自分の駒のいるマスへは動けません。</p><div class="rule-flow"><span class="mini-piece promoted">馬</span><span>取る →</span><span class="mini-piece">角</span><span>持ち駒へ</span></div><p>自分の手番には、盤上の駒を1枚動かすか、持ち駒を1枚打つかを選びます。持ち駒は空きマスに、自分向き・成っていない状態で打ちます。打った直後に続けて動かすことはできません。</p><p>桂馬以外は他の駒を跳び越せません。飛・角・香も、相手の駒を取った場所で止まります。</p>')+
    section('成る・成らない','<p>移動前または移動後のマスが敵陣3段にあれば、その手で成れます。敵陣の中の移動、敵陣から出る移動でも選べます。持ち駒を打つ手では成れません。</p><div class="rule-flow"><span class="mini-piece">歩</span><span>成る →</span><span class="mini-piece promoted">と</span><span>金の動き</span></div><p>歩・香・桂・銀は成ると金の動き。角は馬、飛車は龍になります。玉と金は成りません。成った駒は、相手に取られるまで元に戻せません。</p><p>成ると動けなくなる方向もあるため、成らない選択もできます。ただし歩・香が最奥段へ、桂が最奥の2段へ進むときは必ず成ります。</p>')+
    section('王手・詰み・投了','<p>次の手で玉が取られそうな状態が王手。王手されたら、玉を逃がす・王手している駒を取る・間に駒を挟む、のいずれかで必ず解消します。隣からの王手や桂馬の王手には、間に駒を挟めません。</p><p>どの合法な手でも王手を解消できない状態が詰みです。玉を実際に取る前に勝敗が決まります。自分から負けを認める投了でも終了します。「王手」と声に出す義務はありません。</p>')+
    section('指せない手・反則','<ul><li><b>二歩：</b>同じ筋に自分の成っていない歩を2枚置けません。「と金」と歩は同じ筋に置けます。</li><li><b>打ち歩詰め：</b>歩を打ったその手で玉を詰ませるのは禁止。盤上の歩を進めて詰ますことや、歩以外の駒を打って詰ますことはできます。</li><li><b>行き所のない駒：</b>歩・香は最奥段、桂は最奥の2段に打てません。進めるときは成ります。</li><li><b>王手放置：</b>王手を無視したり、玉を相手の利きへ動かしたり、自分の駒を動かして玉を危険にさらしたりできません。</li><li><b>その他：</b>自分の駒の上への移動、規定外の動き、二手続けて指すことは禁止です。</li></ul><p>このゲームでは指せない手を受け付けません。大会では反則負けになります。</p>')+
    section('千日手・連続王手','<p>盤上の配置、両者の持ち駒、手番がすべて同じ局面に4回なると千日手です。公式対局では先後を交代して指し直します。このゲームでは引き分けとして終了し、再戦を選べます。</p><p>ただし、一方がその間ずっと王手をかけ続けた場合は、王手を続けた側の負けです。</p>')+
    section('持将棋・入玉の決まり','<p>玉が敵陣に入ることを入玉、両方の玉が入った状態を相入玉と呼びます。詰ます見込みがなくなった場合には持将棋の規定を使います。</p><p>合意による24点法では、玉を除き飛・角は各5点、他は各1点。成駒も元の駒で数え、盤上と持ち駒を合計します。双方24点以上なら指し直し、24点未満の側は負けです。大会によって27点制などの別規定もあります。</p><p>連盟の対局規則の入玉宣言は、自分の手番で、玉が敵陣・王手なし・敵陣の自駒が玉以外10枚以上を条件に、敵陣の自駒と持ち駒だけを数えます。500手未満では31点以上が勝ち、24〜30点は指し直し。条件を満たさず宣言すると負けです。</p><p>同規則では500手に達した場合も持将棋。王手が続いている場合は途切れた時点で判定します。棋戦ごとの宣言法・点数・指し直し条件は主催者の規定を優先します。</p><p class="rule-note">このゲームでは持将棋・入玉宣言の自動判定は行いません。</p>')+
    section('対局の開始・大会での約束','<p>通常は歩5枚を振る「振り駒」で先後を決めます。歩が多ければ振った側が先手、と金が多ければ後手。同数なら振り直しです。駒落ちは強い側の駒を減らす別の対局形式です。このゲームは平手で、AI戦も友達戦も王将・玉将のコイントスで自動的に先手と後手が決まります。</p><p>大会では持ち時間・秒読みを守り、時間切れは負け。指した手と同じ手で時計を押します。着手前に時計を止めること、着手後の「待った」、助言や別の盤・AIでの分析は認められません。駒から手を離すと着手が確定します。</p><p>始めと終わりに挨拶し、持ち駒は相手にも見えるように置きます。トラブルは立会人や主催者へ確認し、裁定に従います。反則の指摘時期や指し直しの持ち時間など、運営の細則は大会規定で確認してください。</p><p class="rule-note">このゲームは時間制限なし。AI戦のみ、練習用に「待った」を使えます。長い対人戦は1,024手で引き分けになります。</p>')+
    '<p class="rules-source">詳しい規則：<a href="https://www.shogi.or.jp/knowledge/shogi/" target="_blank" rel="noopener">日本将棋連盟の入門ガイド</a> · <a href="https://www.shogi.or.jp/match/taikyoku_rules/" target="_blank" rel="noopener">対局規則</a></p>'+
    '<details class="legal-notices"><summary>ライセンス</summary><p>音声：VOICEVOX:No.7<br>やねうら王 WASM：<a href="vendor/yaneuraou/LICENSE.md" target="_blank" rel="noopener">GPLv3</a> · <a href="https://github.com/mizar/YaneuraOu.wasm/tree/799183514172909f19ee975b81f025a2bc59bb8d" target="_blank" rel="noopener">対応ソース</a><br>PeerJS：<a href="vendor/peerjs/LICENSE" target="_blank" rel="noopener">MIT License</a><br>coi-serviceworker：<a href="vendor/coi-serviceworker/LICENSE" target="_blank" rel="noopener">MIT License</a></p></details>';
  }
  return {descriptions,diagram,initialDiagram,help,pair,tips,name,readings,displayNames};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=ShogiGuide;
