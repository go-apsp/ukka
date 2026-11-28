(function(){
"use strict";
var $=function(id){return document.getElementById(id)};
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function fmt(t){t=Math.max(0,Math.floor(t||0));var m=Math.floor(t/60),s=t%60;return m+":"+(s<10?"0":"")+s}

var BUILTIN=[
 {youtubeId:"1Bsn_63O9sY",title:"ukka「Final Chapter」＠Kanadevia Hall (2026.05.24)",builtin:true},
 {youtubeId:"pd4gCJTcRAA",title:"〖ライブ映像〗ukka新体制お披露目ワンマンライブ「New Chapter “7”」",builtin:true}
];

var db=null,FB=null;
var videos=BUILTIN.slice(),curVid=BUILTIN[0].youtubeId,cmts=[];
var player=null,ready=false,playing=false,dragging=false;
var baseT=0,baseAt=0; // 表示位置の補間用

function now(){
  if(!player||!ready)return 0;
  try{
    if(playing)return baseT+(performance.now()-baseAt)/1000;
    return player.getCurrentTime()||0;
  }catch(e){return 0}
}
function dur(){try{return (player&&ready&&player.getDuration())||0}catch(e){return 0}}

function showErr(msg){var e=$("err");e.textContent=msg;e.style.display="block"}
function hideErr(){$("err").style.display="none"}

/* ---------- Firebase ---------- */
async function initFB(){
  var appM=await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
  var fsM=await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
  var app=appM.initializeApp(window.FB_CONFIG);
  db=fsM.getFirestore(app);
  FB=fsM;
}
async function loadVideos(){
  videos=BUILTIN.slice();
  try{
    var snap=await FB.getDocs(FB.collection(db,"videos"));
    var extra=[];
    snap.forEach(function(d){var v=d.data();if(v&&v.youtubeId)extra.push({youtubeId:v.youtubeId,title:v.title||v.youtubeId,order:(typeof v.order==="number"?v.order:999)})});
    extra.sort(function(a,b){return a.order-b.order});
    extra.forEach(function(v){if(!videos.some(function(x){return x.youtubeId===v.youtubeId}))videos.push(v)});
  }catch(e){/* ルール未公開時などは内蔵動画だけで続行 */}
  var sel=$("vidsel");sel.innerHTML="";
  videos.forEach(function(v){
    var o=document.createElement("option");o.value=v.youtubeId;o.textContent=v.title;sel.appendChild(o);
  });
  sel.value=curVid;
}
async function loadComments(){
  cmts=[];
  try{
    var q=FB.query(FB.collection(db,"comments"),FB.where("videoId","==",curVid));
    var snap=await FB.getDocs(q);
    snap.forEach(function(d){var c=d.data();if(c)cmts.push({id:d.id,name:c.name||"",text:c.text||"",t:(typeof c.t==="number"?c.t:0)})});
    cmts.sort(function(a,b){return a.t-b.t});
    hideErr();
  }catch(e){
    showErr("コメントを読み込めませんでした。時間をおいて開き直してみてください。");
  }
  renderList();
}
function renderList(){
  var el=$("clist");
  if(!cmts.length){el.innerHTML='<p class="empty">まだコメントがありません。最初のコメントをどうぞ。</p>';return}
  el.innerHTML=cmts.map(function(c){
    return '<button class="item" data-t="'+c.t+'"><span class="t">'+fmt(c.t)+'</span><span class="n">'+esc(c.name)+'</span>'+esc(c.text)+'</button>';
  }).join("");
}

/* ---------- YouTube ---------- */
window.onYouTubeIframeAPIReady=function(){
  player=new YT.Player("yt",{
    videoId:curVid,
    playerVars:{playsinline:1,rel:0},
    events:{
      onReady:function(){ready=true;try{baseT=player.getCurrentTime()||0}catch(e){}baseAt=performance.now();requestAnimationFrame(loop)},
      onStateChange:function(ev){
        if(ev.data===YT.PlayerState.PLAYING){playing=true;try{baseT=player.getCurrentTime()||0}catch(e){}baseAt=performance.now();$("playbtn").textContent="⏸ 一時停止"}
        else{playing=false;if(ev.data===YT.PlayerState.PAUSED)$("playbtn").textContent="▶ 再生"}
      }
    }
  });
};
function loadYT(){
  var s=document.createElement("script");s.src="https://www.youtube.com/iframe_api";document.head.appendChild(s);
}
function seekTo(t){
  if(!player||!ready)return;
  var d=dur();t=Math.max(0,d?Math.min(t,d):t);
  player.seekTo(t,true);baseT=t;baseAt=performance.now();
}

/* ---------- カード表示 ---------- */
function activeCards(span,max){
  var n=now(),out=[];
  for(var i=0;i<cmts.length;i++){var c=cmts[i];if(c.t<=n&&n<c.t+span)out.push(c)}
  if(out.length>max)out=out.slice(out.length-max);
  return out;
}
var lastBelow="",lastOvl="";
function paint(){
  var below=activeCards(12,3);
  var key=below.map(function(c){return c.id}).join(",");
  if(key!==lastBelow){
    lastBelow=key;
    $("cards").innerHTML=below.map(function(c){
      return '<div class="card"><span class="t">'+fmt(c.t)+'</span><span class="n">'+esc(c.name)+'</span><p>'+esc(c.text)+'</p></div>';
    }).join("");
  }
  var ovl=activeCards(5,3);
  var key2=ovl.map(function(c){return c.id}).join(",");
  if(key2!==lastOvl){
    lastOvl=key2;
    $("ovl").innerHTML=ovl.map(function(c){
      return '<div class="ovcard"><span class="t">'+fmt(c.t)+'</span><span class="n">'+esc(c.name)+'</span>'+esc(c.text)+'</div>';
    }).join("");
  }
}
function loop(){
  var n=now(),d=dur();
  $("tm").textContent=fmt(n);$("dur").textContent=fmt(d);
  if(!dragging&&d>0)$("bar").value=Math.round(n/d*1000);
  paint();
  requestAnimationFrame(loop);
}

/* ---------- クイズ ---------- */
var QUIZ=[
 {q:"結城りなさんがukkaに加入したのはいつ？",opts:["2019年11月","2021年9月","2023年4月"],ans:1,exp:"2021年9月25日、オーディション「Brand New ukka!」で葵るりさんとともに加入が発表されました。"},
 {q:"『KUNOICHI 13』で、りなさんが初めて1stステージをクリアしたときの残り時間は？",opts:["残り5秒","残り25秒","残り1分"],ans:1,exp:"残り25秒でクリア。前回落下したドラゴングライダーへのリベンジでした。"},
 {q:"『SASUKE 43』での結城りなさんのゼッケン番号は？",opts:["16番","24番","41番"],ans:2,exp:"41番。アイドル予選会2025で優勝し、本戦への出場権を掴みました。"}
];
function renderQuiz(){
  var qz=$("quiz");if(!qz)return; // トップページにはクイズ欄が無いので、その場合は何もしない（以前はここで止まって動画とコメントも読み込まれなかった）
  qz.innerHTML=QUIZ.map(function(it,qi){
    return '<div class="q"><b>Q'+(qi+1)+". "+esc(it.q)+'</b><div class="opts">'+
      it.opts.map(function(o,oi){return '<button data-q="'+qi+'" data-o="'+oi+'">'+esc(o)+'</button>'}).join("")+
      '</div><p class="exp" id="exp'+qi+'" style="display:none"></p></div>';
  }).join("");
}

/* ---------- イベント ---------- */
document.addEventListener("click",function(ev){
  var sk=ev.target.closest("[data-seek]");
  if(sk){seekTo(now()+parseFloat(sk.getAttribute("data-seek")));return}
  var it=ev.target.closest(".item");
  if(it){seekTo(parseFloat(it.getAttribute("data-t")));if(player&&ready)player.playVideo();return}
  var qb=ev.target.closest(".quiz .opts button");
  if(qb){
    var qi=+qb.getAttribute("data-q"),oi=+qb.getAttribute("data-o"),it2=QUIZ[qi];
    var box=qb.parentElement;box.querySelectorAll("button").forEach(function(b){b.classList.remove("sel")});
    qb.classList.add("sel");
    var ex=$("exp"+qi);ex.style.display="block";
    ex.textContent=(oi===it2.ans?"正解！ ":"残念、正解は「"+it2.opts[it2.ans]+"」。 ")+it2.exp;
    return;
  }
});
$("playbtn").addEventListener("click",function(){
  if(!player||!ready)return;
  if(playing)player.pauseVideo();else player.playVideo();
});
$("bar").addEventListener("input",function(){
  dragging=true;var d=dur();if(d>0){var t=d*this.value/1000;$("tm").textContent=fmt(t)}
});
$("bar").addEventListener("change",function(){
  var d=dur();if(d>0)seekTo(d*this.value/1000);dragging=false;
});
$("vidsel").addEventListener("change",function(){
  curVid=this.value;lastBelow="";lastOvl="";$("cards").innerHTML="";$("ovl").innerHTML="";
  if(player&&ready){player.loadVideoById(curVid);baseT=0;baseAt=performance.now()}
  loadComments();
  renderChapters();
});

/* ---------- Final Chapter チャプター（カードUI） ---------- */
var FC_ID="1Bsn_63O9sY";
var CHAPTERS_FC=[
 {t:0,b:"OPENING",k:"etc",title:"オープニング映像〜登場"},
 {t:147,b:"M1",k:"song",title:"アフタヌーン・グラフィティ〜10th ver.〜"},
 {t:356,b:"M2",k:"song",title:"エビ・バディ・ワナ・ビー"},
 {t:532,b:"M3",k:"song",title:"オスグッド・コミュニケーション"},
 {t:750,b:"M4",k:"song",title:"コズミック・フロート〜10th ver.〜"},
 {t:944,b:"M5",k:"song",title:"さいしょのさいしょ"},
 {t:1216,b:"MC①",k:"mc",title:"全員挨拶〜1人ずつ自己紹介",sum:"コール＆レスポンスを交えてメンバー順に挨拶"},
 {t:1543,b:"M6",k:"song",title:"まわるまわるまわる"},
 {t:1759,b:"M7",k:"song",title:"僕らのハジマリ"},
 {t:1986,b:"M8",k:"song",title:"こころ予報"},
 {t:2255,b:"M9",k:"song",title:"恋、いちばんめ〜10th ver.〜"},
 {t:2538,b:"M10",k:"song",title:"Glow-up-Days〜10th ver.〜"},
 {t:2798,b:"M11",k:"song",title:"Overnight Rainbow",sum:"ペンライトで7色を作る呼びかけから楽曲へ"},
 {t:3145,b:"幕間",k:"etc",title:"幕間（衣装替え）"},
 {t:3353,b:"M12",k:"song",title:"WINGS〜10th ver.〜"},
 {t:3649,b:"M13",k:"song",title:"TAiLWiND"},
 {t:3865,b:"M14",k:"song",title:"透明"},
 {t:4147,b:"M15",k:"song",title:"Believe"},
 {t:4474,b:"M16",k:"song",title:"Re:RAY"},
 {t:4742,b:"M17",k:"song",title:"ボクエール"},
 {t:4984,b:"MC②",k:"mc",title:"衣装替え後のトーク"},
 {t:5129,b:"MC②",k:"mc",title:"メンバーの秘蔵写真公開",sum:"楽屋での寝顔や舞台裏の写真を紹介"},
 {t:5512,b:"M18",k:"song",title:"それは月曜日の9時のように〜10th ver.〜"},
 {t:5785,b:"M19",k:"song",title:"AM0805の交差点〜10th ver.〜"},
 {t:6028,b:"M20",k:"song",title:"Rising dream〜10th ver.〜"},
 {t:6240,b:"M21 ✦",k:"song kira",title:"キラキラ〜10th ver.〜"},
 {t:6500,b:"M22",k:"song",title:"ラブパレード〜10th ver.〜"},
 {t:6803,b:"EN1",k:"song",title:"Viva La Vida"},
 {t:7014,b:"EN2",k:"song",title:"タリルリラ"},
 {t:7282,b:"MC③",k:"mc",title:"メンバー1人ずつの挨拶"},
 {t:7307,b:"MESSAGE",k:"msg",c:"#f5f5f5",title:"若菜こはる：メッセージ",sum:"加入からの2年余り、支えてくれたファンやメンバーへの感謝"},
 {t:7555,b:"MESSAGE",k:"msg",c:"#f07800",title:"宮沢友：メッセージ",sum:"ukkaとの出会いと、自分にとっての誇り・宝物"},
 {t:7678,b:"MESSAGE",k:"msg",c:"#9b7ed9",title:"葵るり：メッセージ",sum:"ペンライトや声援、ステージ作りの青春を振り返る"},
 {t:7881,b:"MESSAGE",k:"msg",c:"#e60033",title:"結城りな：メッセージ",sum:"アイドルになる夢を叶えてくれた4年半への感謝"},
 {t:8028,b:"MESSAGE",k:"msg",c:"#f2b705",title:"芹澤もあ：メッセージ",sum:"10歳から20歳まで10年間歩めた感謝"},
 {t:8232,b:"MESSAGE",k:"msg",c:"#12b5a5",title:"茜空：メッセージ",sum:"「一緒に幸せになろう」という温かいメッセージ"},
 {t:8397,b:"MESSAGE",k:"msg",c:"#2b6fe2",title:"村星りじゅ：メッセージ",sum:"桜エビ〜ず結成から約11年間の歩みとこれからの思い"},
 {t:8642,b:"EN3",k:"song",title:"Aonity"},
 {t:8969,b:"EN4",k:"song",title:"リンドバーグ〜10th ver.〜"},
 {t:9511,b:"TALK",k:"etc",title:"ダブルアンコール登場・トーク"},
 {t:9570,b:"W-EN",k:"song",title:"リンドバーグ〜10th ver.〜"},
 {t:9833,b:"ENDING",k:"etc",title:"エンディング・最後の挨拶"}
];
var NC7_ID="pd4gCJTcRAA";
var CHAPTERS_NC7=[
 {t:18,b:"OPENING",k:"etc",title:"オープニング"},
 {t:104,b:"M1",k:"song",title:"つなぐ"},
 {t:390,b:"M2",k:"song",title:"Rising dream",sum:"「始まりました New Chapter \"7\"！」の掛け声から楽曲へ"},
 {t:603,b:"M3",k:"song",title:"WINGS"},
 {t:871,b:"MC①",k:"mc",title:"全員挨拶〜メンバー自己紹介",sum:"茜空、葵るり、芹澤もあ、結城りな、村星りじゅの順に挨拶"},
 {t:911,b:"MC",k:"mc",title:"新メンバー自己紹介",sum:"若菜こはる（コールは「こはちゃん」）、宮沢友（コールは「ゆうちゃん」）が意気込み"},
 {t:1007,b:"M4",k:"song",title:"リンドバーグ"},
 {t:1259,b:"M5",k:"song",title:"Viva La Vida"},
 {t:1509,b:"M6",k:"song",title:"214"},
 {t:1784,b:"M7",k:"song",title:"アフタヌーン・グラフィティ"},
 {t:2020,b:"M8",k:"song",title:"恋、いちばんめ"},
 {t:2286,b:"M9",k:"song",title:"カノープス"},
 {t:2556,b:"M10",k:"song",title:"wonder little love"},
 {t:2769,b:"M11",k:"song",title:"さいしょのさいしょ"},
 {t:3045,b:"M12",k:"song",title:"エビ・バディ・ワナ・ビー"},
 {t:3211,b:"M13",k:"song",title:"Overnight Rainbow",sum:"新曲としての披露"},
 {t:3480,b:"M14",k:"song",title:"コズミック・フロート"},
 {t:3674,b:"M15",k:"song",title:"don't say Love"},
 {t:3903,b:"M16",k:"song",title:"スーパーガール★センセーション"},
 {t:4134,b:"M17",k:"song",title:"キラキラ"},
 {t:4417,b:"M18",k:"song",title:"ラブパレード"},
 {t:4631,b:"挨拶",k:"etc",title:"本編終了の挨拶"},
 {t:4705,b:"EN1",k:"song",title:"AM0805の交差点"},
 {t:4959,b:"EN2",k:"song",title:"それは月曜日の9時のように"},
 {t:5177,b:"EN3",k:"song",title:"ティーンスピリット",sum:"ラストナンバー"},
 {t:5369,b:"MC②",k:"mc",title:"新体制初お披露目の感想",sum:"若菜こはる・宮沢友が感想と締めの挨拶"},
 {t:5456,b:"ENDING",k:"etc",title:"エンディング・最後の挨拶"}
];
var CHAPMAP={};
CHAPMAP[FC_ID]={head:"♪ Final Chapter チャプター",list:CHAPTERS_FC};
CHAPMAP[NC7_ID]={head:"♪ New Chapter \"7\" チャプター",list:CHAPTERS_NC7};
function fmtH(t){t=Math.max(0,Math.floor(t||0));var h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=t%60;var mm=h>0?("0"+m).slice(-2):String(m);return (h>0?h+":":"")+mm+":"+(s<10?"0":"")+s}
function goChapter(sec){
  if(player&&ready){player.seekTo(sec,true);player.playVideo();baseT=sec;baseAt=performance.now()}
  var w=$("mvwrap");if(w)w.scrollIntoView({behavior:"smooth",block:"center"});
}
function renderChapters(){
  var box=$("chapters");if(!box)return;
  var wrap=$("chapWrap"),data=CHAPMAP[curVid];
  if(!data){if(wrap)wrap.style.display="none";box.innerHTML="";return}
  if(wrap)wrap.style.display="";
  var h=$("chapHead");if(h)h.textContent=data.head;
  box.innerHTML="";
  data.list.forEach(function(ch){
    var b=document.createElement("button");
    b.type="button";b.className="chap-card "+ch.k;
    if(ch.k==="msg")b.style.borderLeftColor=ch.c;
    var dot=ch.k==="msg"?"<span class=\"chap-dot\" style=\"background:"+ch.c+"\"></span>":"";
    b.innerHTML="<span class=\"chap-left\"><span class=\"chap-time\">"+fmtH(ch.t)+"</span><span class=\"chap-badge\">"+esc(ch.b)+"</span></span>"+
      "<span class=\"chap-main\"><span class=\"chap-title\">"+dot+esc(ch.title)+"</span></span>"+
      "<span class=\"chap-play\">▶</span>";
    b.addEventListener("click",function(){goChapter(ch.t)});
    box.appendChild(b);
  });
}
renderChapters();
$("ovtoggle").addEventListener("click",function(){
  var ovl=$("ovl"),inside=ovl.classList.contains("inside");
  ovl.classList.toggle("inside",!inside);ovl.classList.toggle("outside",inside);
  this.textContent="表示: "+(inside?"枠外":"枠内");
  try{localStorage.setItem("ukka-overlay-position",inside?"outside":"inside")}catch(e){}
});
$("fsbtn").addEventListener("click",function(){
  var w=$("mvwrap");
  if(document.fullscreenElement){document.exitFullscreen()}
  else if(w.requestFullscreen){w.requestFullscreen()}
  else if(w.webkitRequestFullscreen){w.webkitRequestFullscreen()}
});
$("fsexit").addEventListener("click",function(){if(document.fullscreenElement)document.exitFullscreen()});
document.addEventListener("fullscreenchange",function(){
  $("fsexit").style.display=document.fullscreenElement?"block":"none";
});
$("addbtn").addEventListener("click",async function(){
  var name=$("nick").value.trim(),text=$("ctext").value.trim();
  if(!name){alert("ニックネームを入れてください");return}
  if(!text){alert("コメントを書いてください");return}
  if(!db){alert("まだ準備中です。少し待ってからお試しください");return}
  try{localStorage.setItem("ukka-nick",name)}catch(e){}
  var t=Math.floor(now()*10)/10;
  this.disabled=true;
  try{
    var ref=await FB.addDoc(FB.collection(db,"comments"),{videoId:curVid,name:name,text:text,t:t,at:FB.serverTimestamp()});
    cmts.push({id:ref.id,name:name,text:text,t:t});cmts.sort(function(a,b){return a.t-b.t});
    renderList();$("ctext").value="";
  }catch(e){
    alert("コメントを追加できませんでした。時間をおいてお試しください。");
  }
  this.disabled=false;
});

/* ---------- 起動 ---------- */
(function(){
  try{
    var savedNick=localStorage.getItem("ukka-nick");if(savedNick)$("nick").value=savedNick;
    var pos=localStorage.getItem("ukka-overlay-position");
    if(pos==="outside"){$("ovl").classList.remove("inside");$("ovl").classList.add("outside");$("ovtoggle").textContent="表示: 枠外"}
  }catch(e){}
  renderQuiz();
  var ytStarted=false;
  function startYT(){if(ytStarted)return;ytStarted=true;loadYT()}
  if(window.__peDone){startYT()}
  else{
    window.addEventListener("pe-done",startYT);
    setTimeout(startYT,2500);
  }
  initFB().then(loadVideos).then(loadComments).catch(function(){showErr("読み込みに失敗しました。開き直してみてください。")});
})();
})();
