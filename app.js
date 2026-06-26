const EL={fuego:'#E8621A',tierra:'#7A9A3E',aire:'#4A9EFF',agua:'#2C6AA0'};
const STCSS={agresivo:'background:rgba(216,90,48,.2);color:#F0997B',defensivo:'background:rgba(15,110,86,.2);color:#5DCAA5',tactico:'background:rgba(83,74,183,.2);color:#AFA9EC',equilibrado:'background:rgba(55,138,221,.2);color:#85B7EB',veneno:'background:rgba(83,150,40,.2);color:#9ECC5A',caos:'background:rgba(212,83,126,.2);color:#ED93B1',soporte:'background:rgba(130,80,180,.2);color:#CFA9EC'};

let ws=null, myId=null, myName='', myBeast='', myRole='', oppName='', oppBeast='', battleId='';
let mySt={}, oppSt={}, pendingFrom=null, pendingIsTraining=false;
let reconnectTimer=null, myWallet='', myCurrentHP=0, isKicked=false;

// ── GESTOR DE AUDIO ──
const audioFiles = {
    lobby: new Audio('Audio/lobby.mp3'),
    batalla: new Audio('Audio/batalla.mp3'),
    ataque: new Audio('Audio/ataque.mp3'),
    curacion: new Audio('Audio/curacion.mp3'),
    boton: new Audio('Audio/boton.mp3')
};
audioFiles.lobby.loop = true; audioFiles.lobby.volume = 0.3;
audioFiles.batalla.loop = true; audioFiles.batalla.batalla.volume = 0.3;
let currentMusic = null;
let isMuted = false;

function playMusic(track) {
    if (currentMusic === audioFiles[track]) return;
    if (currentMusic) currentMusic.pause();
    currentMusic = audioFiles[track];
    if (!isMuted) currentMusic.play().catch(e=>{});
}
function playSfx(track) {
    if (isMuted) return;
    const sfx = audioFiles[track];
    if (!sfx) return;
    sfx.currentTime = 0;
    sfx.play().catch(e=>{});
}
function toggleMute() {
    isMuted = !isMuted;
    const btn = document.getElementById('btn-mute');
    if (isMuted) {
        if (currentMusic) currentMusic.pause();
        btn.textContent = '🔇';
    } else {
        if (currentMusic) currentMusic.play().catch(e=>{});
        btn.textContent = '🔊';
    }
}
// Sonido global para todos los botones
document.addEventListener('click', (e) => { if(e.target.closest('.btn')) playSfx('boton'); });
// ── FIN GESTOR DE AUDIO ──

function copyWallet() {
  navigator.clipboard.writeText('C7pezdMQV5SnXWuzpt9YHnW1JrAAjvjdybNqoE8uZFTb')
    .then(() => {
      const btn = event.currentTarget || event.target;
      const orig = btn.textContent;
      btn.textContent = '✓ Copiado!';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    }).catch(() => alert('Dirección: C7pezdMQV5SnXWuzpt9YHnW1JrAAjvjdybNqoE8uZFTb'));
}
function depositWidgetHTML() {
  return `<div style="background:rgba(74,158,255,.06);border:0.5px solid rgba(74,158,255,.2);border-radius:10px;padding:10px 12px">
    <div style="font-size:11px;color:#85B7EB;margin-bottom:4px">💡 Deposita USDC para retar jugadores</div>
    <div style="font-size:10px;color:rgba(255,255,255,.4);margin-bottom:7px">0.10 USDC = 100 HP · cualquier monto funciona</div>
    <div style="display:flex;gap:6px;align-items:center">
      <div style="flex:1;background:rgba(0,0,0,.35);border-radius:6px;padding:6px 8px;font-family:monospace;font-size:9px;color:#85B7EB;word-break:break-all;cursor:pointer" onclick="copyWallet()">C7pezdMQV5SnXWuzpt9YHnW1JrAAjvjdybNqoE8uZFTb <span style="color:rgba(255,255,255,.3)">📋</span></div>
      <button class="btn btn-sm" style="font-size:10px;white-space:nowrap;padding:5px 10px" onclick="checkHPNow()">Verificar HP</button>
    </div>
  </div>`;
}
function getPhantom() { return window.phantom?.solana || window.solana || null; }
async function connectPhantom() {
  await new Promise(r => setTimeout(r, 100));
  const phantom = getPhantom();
  if (!phantom || !phantom.isPhantom) {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const currentUrl = window.location.href;
    if (isMobile) {
      const deepLink = `https://phantom.app/ul/browse/${currentUrl}`;
      const noPhantomDiv = document.getElementById('no-phantom');
      noPhantomDiv.style.display = 'block';
      noPhantomDiv.innerHTML = `<div style="color:#F0997B; font-size:13px; line-height:1.5; text-align:left"><strong>📱 Para jugar desde tu móvil:</strong><br><br>1. Abre la app de <strong>Phantom</strong> en tu teléfono.<br>2. Ve a la pestaña <strong>"Descubrir" (🔍)</strong> en la barra inferior.<br>3. Pega este enlace en la barra de búsqueda para entrar al juego:<div style="background:rgba(0,0,0,.3); padding:8px; margin-top:8px; border-radius:6px; word-break:break-all; font-family:monospace; font-size:10px; color:#85B7EB; cursor:pointer; display:flex; justify-content:space-between; align-items:center" onclick="copyText('${currentUrl}')"><span>${currentUrl}</span><span style="margin-left:8px; white-space:nowrap">📋</span></div><br><button class="btn btn-blue btn-sm" style="width:100%; padding:10px" onclick="window.location.href='${deepLink}'">Intentar abrir automáticamente</button></div>`;
      document.getElementById('btn-phantom').style.display = 'none';
      return;
    }
    document.getElementById('no-phantom').style.display='block';
    document.getElementById('no-phantom').innerHTML = 'Phantom no detectado. <a href="https://phantom.app" target="_blank" style="color:#F0997B;text-decoration:underline">Instalalo aqui</a> y recarga la pagina.';
    document.getElementById('btn-phantom').style.display='none';
    return;
  }
  try {
    const resp = await phantom.connect();
    myWallet = resp.publicKey.toString();
    document.getElementById('btn-phantom').style.display='none';
    document.getElementById('wallet-connected').style.display='block';
    document.getElementById('wallet-addr').textContent = myWallet.slice(0,8)+'...'+myWallet.slice(-6);
    document.getElementById('wallet-hp').textContent = 'Verificando...';
    const sn = document.getElementById('step-name');
    if(sn){ sn.style.opacity='1'; sn.style.pointerEvents='auto'; }
    await checkHPNow(true);
  } catch(e) {
    console.error('Phantom error:', e);
    alert('No se pudo conectar Phantom. Asegurate de tener la extension instalada y activa.');
  }
}
function copyText(text) {
  navigator.clipboard.writeText(text).then(() => alert('¡Enlace copiado! Ábrelo en el navegador de Phantom.')).catch(() => alert('Copia este enlace manualmente: ' + text));
}
window.addEventListener('load', async () => {
  await new Promise(r => setTimeout(r, 500));
  const ph2 = getPhantom();
  if (ph2?.isPhantom && ph2.isConnected) {
    try {
      const r2 = await ph2.connect({ onlyIfTrusted: true });
      myWallet = r2.publicKey.toString();
      document.getElementById('btn-phantom').style.display='none';
      document.getElementById('wallet-connected').style.display='block';
      document.getElementById('wallet-addr').textContent = myWallet.slice(0,8)+'...'+myWallet.slice(-6);
      document.getElementById('wallet-hp').textContent = 'Verificando...';
      await checkHPNow(true);
    } catch(e) {}
  }
});
async function checkHPNow(fromConnect=false) {
  if (!myWallet) return;
  try {
    const res  = await fetch('/hp?wallet='+myWallet);
    const data = await res.json();
    const hp   = data.hp || 0;
    const loginHp = document.getElementById('wallet-hp');
    if(loginHp){ loginHp.textContent=hp+' HP'; loginHp.style.color=hp>=100?'#5DCAA5':'#EF9F27'; }
    updateHPDisplay(hp);
    if(document.getElementById('s-lobby').classList.contains('active') && ws){ ws.send(JSON.stringify({type:'ping'})); }
    if (hp >= 100) {
      document.getElementById('step-charge').style.display='none';
      document.getElementById('step-name').style.opacity='1';
      document.getElementById('step-name').style.pointerEvents='auto';
    } else {
      document.getElementById('step-charge').style.display='block';
      document.getElementById('step-name').style.opacity='1';
      document.getElementById('step-name').style.pointerEvents='auto';
    }
  } catch(e) { document.getElementById('wallet-hp').textContent = 'Error al verificar'; }
}
function show(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  // NUEVO: Cambiar música al cambiar de pantalla
  if(id === 's-login' || id === 's-pick' || id === 's-lobby') playMusic('lobby');
  if(id === 's-battle' || id === 's-result') playMusic('batalla');
}
function hpColor(pct){return pct>50?'#5DCAA5':pct>25?'#EF9F27':'#F0997B';}
function stTags(st,right=false){
  let t='';
  if(st.poisonTurns>0) t+=`<span class="stag" style="background:rgba(83,150,40,.3);color:#9ECC5A">☠×${st.poisonTurns}</span>`;
  if(st.burnTurns>0)   t+=`<span class="stag" style="background:rgba(216,90,48,.3);color:#F0997B">🔥×${st.burnTurns}</span>`;
  if(st.shield>0)      t+=`<span class="stag" style="background:rgba(55,138,221,.3);color:#85B7EB">🛡×${st.shield}</span>`;
  if(st.reflect50>0)   t+=`<span class="stag" style="background:rgba(55,138,221,.2);color:#85B7EB">↩50%</span>`;
  if(st.stun)          t+=`<span class="stag" style="background:rgba(212,83,126,.3);color:#ED93B1">💫stun</span>`;
  if(st.recharge>0)    t+=`<span class="stag" style="background:rgba(136,135,128,.3);color:#B4B2A9">⚡×${st.recharge}</span>`;
  if(st.blind>0)       t+=`<span class="stag" style="background:rgba(186,117,23,.3);color:#EF9F27">👁×${st.blind}</span>`;
  if(st.weakAtk>0)     t+=`<span class="stag" style="background:rgba(15,110,86,.3);color:#5DCAA5">⬇atk×${st.weakAtk}</span>`;
  if(st.weaken>0)      t+=`<span class="stag" style="background:rgba(15,110,86,.3);color:#5DCAA5">⬇dmg×${st.weaken}</span>`;
  if(st.analyzed>0)    t+=`<span class="stag" style="background:rgba(130,80,180,.3);color:#CFA9EC">🔍×${st.analyzed}</span>`;
  return t;
}
function panelHTML(st, bKey, label, side){
  const b=BEASTS[bKey]||{name:bKey,sub:'',img:'',el:'aire',style:'equilibrado'};
  const pct=Math.max(0,st.hp/st.maxHp*100);
  const right=side==='opp';
  return `<div class="f-label">${label}</div>
    <div class="f-sprite-wrap"><img class="f-sprite" id="spr-${side}" src="${b.img}" alt="${b.name}"></div>
    <div class="f-name">${b.name}</div>
    <div class="f-sub">${b.sub}</div>
    <div class="hp-lbl">HP</div>
    <div class="hp-wrap"><div class="hp-fill" id="hpbar-${side}" style="width:${pct.toFixed(1)}%;background:${hpColor(pct)}"></div></div>
    <div class="hp-val" id="hpval-${side}">${Math.max(0,st.hp)} / ${st.maxHp}</div>
    <div class="stags">${stTags(st,right)}</div>`;
}
function dmgLabel(a){
  if(a.fx==='chaos'||a.fx==='chaosHi') return '?? HP';
  if(a.fx==='equalize') return 'ΔHP';
  if(a.fx==='double') return `2×${a.d}`;
  if(a.fx==='triple') return `3×${a.d}`;
  if(a.d===0){
    const map={heal20:'♥+20',heal30:'♥+30',fortress:'♥+15+🛡',shield2:'🛡×2',shield1r:'🛡+↩',reflect50:'↩50%',weaken:'⬇atk',analyze:'🔍+15%',purify:'✨cura',counter:'↩daño',swap:'⇄estados'};
    return map[a.fx]||'—';
  }
  if(a.fx==='drain10') return `15 HP (+10♥)`;
  return `${a.d} HP`;
}
function dmgClass(a){
  if(a.d===0) return 'dmg-zero';
  const eff=a.fx==='double'?a.d*2:a.fx==='triple'?a.d*3:a.d;
  if(eff>=35) return 'dmg-high';
  if(eff>=18) return 'dmg-mid';
  return 'dmg-low';
}
function dmgLabelPick(a){
  if(a.fx==='chaos'||a.fx==='chaosHi') return '?? HP';
  if(a.fx==='equalize') return 'ΔHP';
  if(a.fx==='double') return `2×${a.d}`;
  if(a.fx==='triple') return `3×${a.d}`;
  if(a.d===0){
    const m={heal20:'♥+20',heal30:'♥+30',fortress:'♥+Escudo',shield2:'Escudo×2',shield1r:'Escudo+↩',reflect50:'↩50%',weaken:'⬇Atk rival',analyze:'🔍+15%dmg',purify:'✨Limpiar',counter:'↩Daño recv',swap:'⇄Estados'};
    return m[a.fx]||'Buff';
  }
  if(a.fx==='drain10') return `15 HP (+10♥)`;
  return `${a.d} HP`;
}
function dmgClassPick(a){
  if(a.d===0) return 'dmg-zero';
  const e=a.fx==='double'?a.d*2:a.fx==='triple'?a.d*3:a.d;
  return e>=35?'dmg-high':e>=18?'dmg-mid':'dmg-low';
}
function buildPickGrid(){
  const keys=Object.entries(BEASTS);
  let html='';
  const cats = {};
  keys.forEach(([k,b])=>{ if(!cats[b.cat]) cats[b.cat] = []; cats[b.cat].push({k,b}); });
  for(const catName in cats){
    html += `<div style="grid-column:1/-1; margin-top:15px; border-bottom:0.5px solid rgba(255,255,255,.2); padding-bottom:5px; color:#CFA9EC; font-weight:600; text-transform:uppercase; letter-spacing:.08em; font-size:13px">✦ ${catName} Series</div>`;
    cats[catName].forEach(({k,b})=>{
      html+=`<div class="bcard" id="bc-${k}" onclick="selectBeast('${k}')">
        <img src="${b.img}" alt="${b.name}">
        <div class="bname">${b.name}</div>
        <div class="bsub">${b.sub}</div>
        <span class="bstyle" style="${STCSS[b.style]}">${b.style}</span>
        <div class="elbar" style="background:${EL[b.el]}"></div>
      </div>`;
    });
  }
  html+=`<div class="beast-detail" id="beast-detail-panel"></div>`;
  document.getElementById('pick-grid').innerHTML=html;
}
function showBeastDetail(k){
  const b=BEASTS[k];
  const panel=document.getElementById('beast-detail-panel');
  const statData={atk:{aries:70,tauro:55,geminis:65,cancer:45,leo:70,virgo:60,libra:62,escorpio:65,sagitario:68,capricornio:50,acuario:72,piscis:58},def:{aries:30,tauro:90,geminis:50,cancer:95,leo:65,virgo:70,libra:62,escorpio:55,sagitario:55,capricornio:92,acuario:45,piscis:68},spd:{aries:90,tauro:30,geminis:80,cancer:40,leo:70,virgo:65,libra:62,escorpio:70,sagitario:75,capricornio:35,acuario:85,piscis:60}};
  const atksHtml=b.attacks.map(a=>{
    const tags=[];
    if(a.pierce) tags.push('<span class="atk-tag tag-pierce">Ignora escudo</span>');
    if(a.fx==='double') tags.push('<span class="atk-tag tag-nobreak">Doble golpe</span>');
    if(a.fx==='triple') tags.push('<span class="atk-tag tag-nobreak">Triple golpe</span>');
    if(a.risk||a.self>0) tags.push(`<span class="atk-tag tag-risk">Riesgo${a.self>0?' -'+a.self+' HP':''}</span>`);
    if(a.buff) tags.push('<span class="atk-tag tag-buff">Buff</span>');
    if(a.dot)  tags.push('<span class="atk-tag tag-dot">Daño/turno</span>');
    if(a.debuff) tags.push('<span class="atk-tag tag-debuff">Debuff</span>');
    const ppText = a.pp === 99 || a.pp === undefined ? 'PP: ∞' : `PP: ${a.pp}`;
    return `<div class="bd-atk">
      <div class="bd-atk-top">
        <span class="bd-atk-name">${a.n}</span>
        <span class="bd-atk-dmg ${dmgClassPick(a)}">${dmgLabelPick(a)}</span>
      </div>
      ${tags.length?`<div class="bd-atk-tags">${tags.join('')}</div>`:''}
      <div class="bd-atk-desc">${a.desc}</div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="bd-atk-acc">${a.acc}% precisión</div>
        <div class="bd-atk-pp">${ppText}</div>
      </div>
    </div>`;
  }).join('');
  panel.innerHTML=`<div class="bd-left"><img src="${b.img}" alt="${b.name}"><div class="bd-name">${b.name}</div><div class="bd-sub">${b.sub}</div><div class="bd-stats"><div class="bd-stat"><div class="bd-stat-val">${statData.atk[k]||'—'}</div><div class="bd-stat-lbl">ATK</div></div><div class="bd-stat"><div class="bd-stat-val">${statData.def[k]||'—'}</div><div class="bd-stat-lbl">DEF</div></div><div class="bd-stat"><div class="bd-stat-val">${statData.spd[k]||'—'}</div><div class="bd-stat-lbl">VEL</div></div></div></div><div class="bd-attacks">${atksHtml}</div>`;
  panel.classList.add('open');
  panel.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function selectBeast(k){
  myBeast=k;
  document.querySelectorAll('.bcard').forEach(c=>c.classList.remove('sel'));
  document.getElementById('bc-'+k)?.classList.add('sel');
  document.getElementById('btn-enter').disabled=false;
  if(ws&&ws.readyState===1) ws.send(JSON.stringify({type:'change_beast',beast:k}));
  showBeastDetail(k);
}
function goPickBeast(){
  if(!myWallet){alert('Primero conecta tu wallet Phantom');return;}
  myName=document.getElementById('inp-name').value.trim();
  if(!myName){alert('Escribe tu nombre de combate');return;}
  buildPickGrid();
  show('s-pick');
  updateHPDisplay(myCurrentHP);
  checkHPNow(false);
}
function enterLobby(){ if(!myBeast) return; connectWS(); }
function connectWS(){
  if(ws){try{ws.close();}catch{}}
  isKicked=false;
  const proto=location.protocol==='https:'?'wss':'ws';
  ws=new WebSocket(`${proto}://${location.host}`);
  ws.onopen=()=>{ clearTimeout(reconnectTimer); ws.send(JSON.stringify({type:'join',name:myName,beast:myBeast,wallet:myWallet})); };
  ws.onmessage=e=>{try{handleMsg(JSON.parse(e.data));}catch(err){console.error(err);}};
  ws.onerror=()=>{};
  ws.onclose=()=>{
    const inBattle=document.getElementById('s-battle').classList.contains('active');
    if(!inBattle && !isKicked) reconnectTimer=setTimeout(()=>{ if(myName&&myBeast) connectWS(); },2000);
  };
}
function handleMsg(m){
  if(m.type==='joined'){ myId=m.id; if(m.hp !== undefined) updateHPDisplay(m.hp); updateLobbyBadge(); if(!isKicked) show('s-lobby'); checkHPNow(false); }
  if(m.type==='kicked'){ isKicked=true; alert(m.msg); show('s-login'); if(ws) ws.close(); }
  if(m.type==='lobby'){ const others=m.players.filter(p=>p.id!==myId); document.getElementById('lbl-online').textContent=m.players.length; renderLobby(others); }
  if(m.type==='leaderboard_update'){ renderLeaderboard(m.top); }
  if(m.type==='chat_message'){ handleChatMessage(m); }
  if(m.type==='challenged'){
    pendingFrom=m.fromId; pendingIsTraining = !!m.isTraining;
    const b=BEASTS[m.fromBeast]||{name:m.fromBeast,img:''};
    document.getElementById('ch-img').src=b.img;
    document.getElementById('ch-title').textContent=`¡Reto de ${m.fromName}!`;
    document.getElementById('ch-sub').textContent=pendingIsTraining ? `${m.fromName} quiere un ENTRENAMIENTO con su ${b.name}. (Sin apostar HP)` : `${m.fromName} quiere batallar con su ${b.name}. ¿Aceptas el combate?`;
    document.getElementById('modal-challenged').classList.remove('hidden');
  }
  if(m.type==='battle_start'){
    battleId=m.battleId; myRole=m.role; oppName=m.opponent; oppBeast=m.opponentBeast;
    const empty={hp:100,maxHp:100,poisonDmg:0,poisonTurns:0,burnDmg:0,burnTurns:0,shield:0,shieldReflect:0,reflect50:0,stun:false,recharge:0,regen:0,regenTurns:0,blind:0,weakAtk:0,weaken:0,corrode:0,analyzed:0,lastDmgReceived:0,pp:[]};
    mySt={...empty}; oppSt={...empty};
    window._isCpuBattle=!!m.isCpu; window._isTrainingBattle=!!m.isTraining;
    const isCpu=!!m.isCpu; const isTraining=!!m.isTraining;
    let startMsg='';
    if(isTraining) startMsg = `¡Entrenamiento amistoso! ${myName} (${BEASTS[myBeast]?.name}) vs ${oppName} (${BEASTS[oppBeast]?.name})`;
    else if(isCpu) startMsg = `¡Zodiac Master invoca a ${BEASTS[oppBeast]?.name||oppBeast}! Prepárate...`;
    else startMsg = `¡Combate! ${myName} (${BEASTS[myBeast]?.name}) vs ${oppName} (${BEASTS[oppBeast]?.name})`;
    show('s-battle');
    renderBattle(!isCpu,[{t:startMsg,c:'hi'}]);
  }
  if(m.type==='battle_state'){
    const me=myRole==='p1'?m.p1:m.p2; const opp=myRole==='p1'?m.p2:m.p1;
    const prevMyHp=mySt.hp, prevOppHp=oppSt.hp;
    mySt=me.state; oppSt=opp.state;
    if(mySt.hp<prevMyHp) animHit('me',prevMyHp-mySt.hp);
    if(oppSt.hp<prevOppHp) animHit('opp',prevOppHp-oppSt.hp);
    renderBattle(m.yourTurn,m.logs);
  }
  if(m.type==='hp_updated'){ updateHPDisplay(m.hp); myCurrentHP=m.hp; }
  if(m.type==='cashout_result'){
    const btn=document.getElementById('btn-cashout');
    if(!m.ok){ if(btn){btn.disabled=false;btn.textContent='💰 Cashout';} alert('Error en cashout: '+m.reason); return; }
    if(m.status==='confirmed'){ if(btn){btn.disabled=false;btn.textContent='💰 Cashout';} updateHPDisplay(0); alert(`✓ Cashout exitoso\n${m.hp} HP = ${m.usdc} USDC enviados a tu wallet`); }
  }
  if(m.type==='error'){ alert('⚠ ' + m.msg); }
  if(m.type==='payout_ok'){ const el=document.getElementById('r-payout-status'); if(el){ el.innerHTML=`<span style="color:#5DCAA5">✓ ${m.usdc} USDC enviados a tu wallet</span><br><a href="https://solscan.io/tx/${m.tx}" target="_blank" style="font-size:10px;color:#4a9eff">Ver transacción en Solscan ↗</a>`; } }
  if(m.type==='payout_error'){ const el=document.getElementById('r-payout-status'); if(el){ if(m.reason==='insufficient_funds'){ el.innerHTML=`<span style="color:#F0997B">⚠ Error: fondos insuficientes en la plataforma (${m.available} USDC disponibles, necesita ${m.needed} USDC). Contacta al administrador.</span>`; } else { el.innerHTML=`<span style="color:#F0997B">⚠ Error al procesar el pago. Contacta al administrador.</span>`; } } }
  if(m.type==='battle_end'){
    const won=m.won; const isCpuResult=m.isCpu||window._isCpuBattle||oppName==='Zodiac Master'; const isTrainingResult=m.isTraining||window._isTrainingBattle;
    const winnerHp=m.winnerHp||0; const newHp=m.newHp||0;
    show('s-result');
    if(!isCpuResult && !isTrainingResult) updateHPDisplay(newHp);
    const b1=BEASTS[myBeast],b2=BEASTS[oppBeast];
    let resultBody='';
    if(isTrainingResult){
      const xpWon = won ? (m.winnerXp||0) : (m.loserXp||0);
      resultBody=`<div style="background:rgba(130,80,180,.08);border:0.5px solid rgba(130,80,180,.2);border-radius:10px;padding:14px;margin:14px 0;text-align:left"><div style="font-size:11px;color:#CFA9EC;margin-bottom:10px;text-transform:uppercase;letter-spacing:.08em">Modo Entrenamiento</div><div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="font-size:13px;color:rgba(255,255,255,.6)">Experiencia obtenida</span><span style="font-size:13px;color:#CFA9EC;font-weight:600">+${xpWon} XP</span></div><div style="font-size:11px;color:rgba(255,255,255,.35);margin-top:8px;text-align:center">Sin riesgo de HP · Solo por diversión</div></div>`;
    } else if(isCpuResult){
      resultBody=`<div style="background:rgba(93,202,165,.08);border:0.5px solid rgba(93,202,165,.2);border-radius:10px;padding:14px;margin:14px 0;text-align:center"><div style="font-size:20px;margin-bottom:4px">&#127891;</div><div style="font-size:13px;color:#5DCAA5;font-weight:600">Combate de entrenamiento</div><div style="font-size:12px;color:rgba(255,255,255,.4);margin-top:4px">Sin costo — reta a otro jugador para apostar HP</div></div>`;
    } else if(won){
      resultBody=`<div style="background:rgba(255,255,255,.05);border-radius:10px;padding:14px;margin:14px 0;text-align:left"><div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:10px;text-transform:uppercase;letter-spacing:.08em">Resultado</div><div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="font-size:13px;color:rgba(255,255,255,.6)">HP bloqueados devueltos</span><span style="font-size:13px;color:#5DCAA5;font-weight:600">+100 HP</span></div><div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="font-size:13px;color:rgba(255,255,255,.6)">HP ganados del rival</span><span style="font-size:13px;color:#5DCAA5;font-weight:600">+${winnerHp} HP</span></div><div style="border-top:0.5px solid rgba(255,255,255,.1);margin:10px 0"></div><div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="font-size:13px;font-weight:600;color:#fff">Tu HP ahora</span><span style="font-size:15px;font-weight:700;color:#5DCAA5">${newHp} HP</span></div><div style="display:flex;justify-content:space-between"><span style="font-size:11px;color:rgba(255,255,255,.35)">Equivalente en USDC</span><span style="font-size:11px;color:rgba(255,255,255,.35)">${(newHp*0.001).toFixed(3)} USDC</span></div></div>`;
    } else {
      resultBody=`<div style="background:rgba(255,255,255,.05);border-radius:10px;padding:14px;margin:14px 0;text-align:left"><div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:10px;text-transform:uppercase;letter-spacing:.08em">Resultado</div><div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="font-size:13px;color:rgba(255,255,255,.6)">HP bloqueados perdidos</span><span style="font-size:13px;color:#F0997B;font-weight:600">-100 HP</span></div><div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="font-size:13px;color:rgba(255,255,255,.6)">Tu HP ahora</span><span style="font-size:13px;color:#F0997B;font-weight:600">${newHp} HP</span></div><div style="display:flex;justify-content:space-between"><span style="font-size:11px;color:rgba(255,255,255,.35)">Equivalente</span><span style="font-size:11px;color:rgba(255,255,255,.35)">${(newHp*0.001).toFixed(3)} USDC</span></div></div>`;
    }
    document.getElementById('result-box').innerHTML=`<div style="display:flex;justify-content:center;gap:20px;margin-bottom:16px;align-items:center"><img src="${b1?.img||''}" style="width:80px;height:80px;object-fit:contain;image-rendering:pixelated;filter:${won?'none':'grayscale(1) opacity(.4)'}"><div style="font-size:20px;color:rgba(255,255,255,.25)">VS</div><img src="${b2?.img||''}" style="width:80px;height:80px;object-fit:contain;image-rendering:pixelated;transform:scaleX(-1);filter:${won?'grayscale(1) opacity(.4)':'none'}"></div><div class="r-icon">${won?'&#127942;':'&#128128;'}</div><div class="r-title">${won?(m.forfeit?'&#161;Rival abandon&#243;!':'&#161;Victoria!'):'Derrota'}</div><div class="r-sub">${myName} &#183; ${b1?.name} vs ${oppName} &#183; ${b2?.name}</div>${resultBody}<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">${!isCpuResult&&!isTrainingResult&&newHp>0?`<button class="btn btn-sm" style="background:rgba(239,159,39,.15);border-color:rgba(239,159,39,.4);color:#EF9F27" onclick="show('s-pick');buildPickGrid()">&#128176; Hacer Cashout</button>`:''}<button class="btn btn-blue" onclick="backToLobby()">Volver al lobby</button></div>`;
  }
}
function animHit(side, dmg){
  const spr=document.getElementById('spr-'+side); if(!spr) return;
  spr.classList.remove('anim-hit','anim-attack'); void spr.offsetWidth; spr.classList.add('anim-hit');
  const wrap=spr.closest('.f-sprite-wrap'); const fl=document.createElement('div'); fl.className='dmg-float'; fl.textContent='-'+dmg; fl.style.color=side==='me'?'#F0997B':'#F0997B'; wrap.appendChild(fl);
  playSfx('ataque'); // NUEVO: Sonido de golpe al recibir daño
  setTimeout(()=>{spr.classList.remove('anim-hit');fl.remove();},800);
}
function animAttack(side){
  const spr=document.getElementById('spr-'+side); if(!spr) return;
  spr.classList.remove('anim-attack'); void spr.offsetWidth; spr.classList.add('anim-attack');
  setTimeout(()=>spr.classList.remove('anim-attack'),400);
}
function updateLobbyBadge(){ document.getElementById('lbl-myname').textContent=myName; const b=BEASTS[myBeast]; if(b) document.getElementById('badge-img').src=b.img; }
let _lastLobbyPlayers=[];
function renderLobbyFromCache(){ renderLobby(_lastLobbyPlayers); }
function renderLobby(others){
  _lastLobbyPlayers=others;
  const list=document.getElementById('players-list');
  const myHp=myCurrentHP;
  const hpWarnEl=document.getElementById('lobby-hp-warn');
  if(hpWarnEl) hpWarnEl.style.display=myHp<100?'block':'none';
  if(!others.length){list.innerHTML='<p class="empty-lobby">No hay otros jugadores en el lobby...<br>Comparte la URL con tus amigos</p>';return;}
  list.innerHTML=others.map(p=>{
    const b=BEASTS[p.beast]||{name:p.beast,img:''};
    const rivalHp=p.hp||0;
    const canChallenge=myHp>=100&&rivalHp>=100;
    const hpColor=rivalHp>=100?'#5DCAA5':'#F0997B';
    return `<div class="p-row"><div class="p-info"><img class="p-img" src="${b.img}" alt="${b.name}"><div><div class="p-name">${p.name}</div><div class="p-beast">${b.name} · <span style="color:${hpColor};font-size:10px">${rivalHp} HP</span></div></div></div><div style="display:flex;gap:6px"><button class="btn btn-sm" style="background:rgba(130,80,180,.15);border-color:rgba(130,80,180,.35);color:#CFA9EC" onclick="sendChallengeTraining(${p.id},'${p.name}')">🤝 Entrenar</button><button class="btn btn-blue btn-sm" ${canChallenge?'':'disabled'} onclick="sendChallenge(${p.id},'${p.name}')" title="${!canChallenge?'Se necesitan 100 HP mínimo para retar':''}">⚔ Retar</button></div></div>`;
  }).join('');
}
async function doCashout(){
  const btn=document.getElementById('btn-cashout');
  if(btn){btn.disabled=true;btn.textContent='Procesando...';}
  if(!ws || ws.readyState !== 1){ if(btn){btn.disabled=false;btn.textContent='💰 Cashout';} alert('Debes entrar al lobby primero para conectar con el servidor.'); return; }
  ws.send(JSON.stringify({type:'cashout'}));
}
function updateHPDisplay(hp){
  myCurrentHP = hp || 0;
  const el=document.getElementById('pick-hp-val'); if(el){ el.textContent=hp+' HP'; el.style.color=hp>=100?'#5DCAA5':'#EF9F27'; }
  const elUsdc=document.getElementById('pick-usdc-val'); if(elUsdc) elUsdc.textContent='= '+(hp*0.001).toFixed(3)+' USDC';
  const loginHp=document.getElementById('wallet-hp'); if(loginHp){ loginHp.textContent=hp+' HP'; loginHp.style.color=hp>=100?'#5DCAA5':'#EF9F27'; }
  const btn=document.getElementById('btn-cashout'); if(btn){ btn.style.display=hp>0?'inline-block':'none'; btn.disabled=false; btn.textContent='💰 Cashout'; }
  const warn=document.getElementById('low-hp-warning'); if(warn) warn.style.display=hp<100?'block':'none';
  const charge=document.getElementById('step-charge'); if(charge) charge.style.display = hp<100 ? 'block' : 'none';
  const depHtml = hp<100 ? depositWidgetHTML() : '';
  const pickDep = document.getElementById('pick-deposit-widget'); if(pickDep) pickDep.innerHTML = depHtml;
  const lobbyDep = document.getElementById('lobby-deposit-widget'); if(lobbyDep) lobbyDep.innerHTML = depHtml;
  if(document.getElementById('s-lobby')?.classList.contains('active')){ const cur = document.getElementById('players-list'); if(cur) renderLobbyFromCache(); }
}
function sendChallenge(targetId,name){ if(confirm(`¿Retar a ${name} a combate por HP?`)) ws.send(JSON.stringify({type:'challenge',targetId})); }
function sendChallengeTraining(targetId,name){ if(confirm(`¿Retar a ${name} a un ENTRENAMIENTO? (Sin apostar HP)`)) ws.send(JSON.stringify({type:'challenge_training',targetId})); }
function challengeMaster(){ ws.send(JSON.stringify({type:'challenge_cpu'})); }
function acceptChallenge(){
  document.getElementById('modal-challenged').classList.remove('hidden');
  if(pendingFrom!==null) ws.send(JSON.stringify({type:'accept',fromId:pendingFrom, isTraining: pendingIsTraining}));
  pendingIsTraining=false; pendingFrom=null;
}
function rejectChallenge(){ document.getElementById('modal-challenged').classList.add('hidden'); pendingFrom=null; pendingIsTraining=false; }
function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
function sendChatMessage(){ const input = document.getElementById('chat-input'); const msg = input.value.trim(); if(msg && ws && ws.readyState === 1){ ws.send(JSON.stringify({type:'chat_message', text:msg})); input.value = ''; } }
function handleChatMessage(m){
  const chatBox = document.getElementById('chat-box');
  if(chatBox.querySelector('.chat-empty')) chatBox.innerHTML = '';
  const msgDiv = document.createElement('div'); msgDiv.className = 'chat-msg';
  msgDiv.innerHTML = `<span class="chat-name">${escapeHtml(m.name)}:</span> <span style="color:rgba(255,255,255,.8)">${escapeHtml(m.text)}</span>`;
  chatBox.appendChild(msgDiv);
  while(chatBox.children.length > 50) { chatBox.removeChild(chatBox.firstChild); }
  chatBox.scrollTop = chatBox.scrollHeight;
}
function renderLeaderboard(top) {
  const podium = document.getElementById('leaderboard-podium');
  if (!podium) return;
  if (!top || top.length === 0) {
    podium.innerHTML = '<div style="flex:1;color:rgba(255,255,255,.3);text-align:center;font-size:11px;padding:20px 0">Gana batallas reales para aparecer aquí</div>';
    return;
  }
  podium.innerHTML = top.map((p, i) => {
    const medals = ['🥇', '🥈', '🥉'];
    const colors = ['#F5A623', '#C0C0C0', '#CD7F32'];
    const name = p.last_name || 'Anónimo';
    const wins = p.wins || 0;
    const losses = p.losses || 0;
    return `<div style="flex:1;background:rgba(255,255,255,.04);border:0.5px solid ${colors[i]};border-radius:10px;padding:10px 6px;text-align:center;backdrop-filter:blur(4px)">
      <div style="font-size:20px;margin-bottom:2px">${medals[i] || '🏆'}</div>
      <div style="font-size:12px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>
      <div style="font-size:9px;color:rgba(255,255,255,.5);margin-top:3px">${wins}V · ${losses}D</div>
    </div>`;
  }).join('');
}
function renderBattle(yourTurn, logs){
  document.getElementById('f-me').innerHTML=panelHTML(mySt,myBeast,myName+' (tú)','me');
  document.getElementById('f-opp').innerHTML=panelHTML(oppSt,oppBeast,oppName,'opp');
  const orb=document.getElementById('turn-orb'); if(orb) orb.style.display=yourTurn?'block':'none';
  const locked=!yourTurn||mySt.stun||mySt.recharge>0;
  let tb='';
  if(yourTurn){
    if(mySt.stun) tb='Estás aturdido — pierdes este turno';
    else if(mySt.recharge>0) tb=`⚡ Recargando — espera ${mySt.recharge} turno(s)`;
    else tb='<span>Tu turno</span> — elige un ataque';
  } else tb='Turno del rival...';
  document.getElementById('turn-bar').innerHTML=tb;

  const b=BEASTS[myBeast];
  document.getElementById('atk-grid').innerHTML=b.attacks.map((a,i)=>{
    const tags=[];
    if(a.pierce) tags.push('<span class="atk-tag tag-pierce">Ignora escudo</span>');
    if(a.fx==='double') tags.push('<span class="atk-tag tag-nobreak">Doble golpe</span>');
    if(a.fx==='triple') tags.push('<span class="atk-tag tag-nobreak">Triple golpe</span>');
    if(a.risk||a.self>0) tags.push(`<span class="atk-tag tag-risk">Riesgo${a.self>0?' -'+a.self+' HP':''}</span>`);
    if(a.buff) tags.push('<span class="atk-tag tag-buff">Buff</span>');
    if(a.dot)  tags.push('<span class="atk-tag tag-dot">Daño/turno</span>');
    if(a.debuff) tags.push('<span class="atk-tag tag-debuff">Debuff</span>');
    
    const currentPp = mySt.pp ? mySt.pp[i] : undefined;
    const maxPp = a.pp === undefined ? 99 : a.pp;
    const ppLeft = currentPp === undefined ? maxPp : currentPp;
    const isDisabled = locked || ppLeft <= 0;
    const ppText = maxPp === 99 ? '∞' : `${ppLeft}/${maxPp}`;
    
    return `<button class="atk-btn" ${isDisabled?'disabled':''} onclick="doAttack(${i})">
      <div class="atk-top">
        <div class="atk-name">${a.n}</div>
        <div class="atk-dmg ${dmgClass(a)}">${dmgLabel(a)}</div>
      </div>
      <div class="atk-tags">${tags.join('')}</div>
      <div class="atk-desc">${a.desc}</div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="atk-acc">${a.acc}% precisión</div>
        <div class="atk-acc" style="color:rgba(255,255,255,.5)">PP: ${ppText}</div>
      </div>
    </button>`;
  }).join('');

  if(logs&&logs.length){
    const lb=document.getElementById('log-box');
    lb.innerHTML=logs.map(l=>`<div class="ll lc-${l.c||'normal'}">${l.t}</div>`).join('');
    lb.scrollTop=lb.scrollHeight;
  }
}
function doAttack(i){ 
  animAttack('me'); 
  // NUEVO: Sonido de ataque o curación
  const atk = BEASTS[myBeast].attacks[i];
  if(atk.d === 0) playSfx('curacion'); else playSfx('ataque');
  ws.send(JSON.stringify({type:'attack',battleId,index:i})); 
}
function goChangeBeast(){
  buildPickGrid();
  if(myBeast){ setTimeout(()=>{ document.getElementById('bc-'+myBeast)?.classList.add('sel'); document.getElementById('btn-enter').disabled=false; },50); }
  document.getElementById('btn-enter').onclick=function(){
    if(!myBeast)return;
    if(ws&&ws.readyState===1) ws.send(JSON.stringify({type:'change_beast',beast:myBeast}));
    updateLobbyBadge();
    document.getElementById('btn-enter').onclick=null;
    show('s-lobby');
  };
  show('s-pick');
}
function leaveLobby(){ if(ws) ws.send(JSON.stringify({type:'leave_lobby'})); show('s-login'); }
function backToLobby(){ updateLobbyBadge(); show('s-lobby'); }
document.getElementById('inp-name').addEventListener('keydown',e=>{if(e.key==='Enter')goPickBeast();});
