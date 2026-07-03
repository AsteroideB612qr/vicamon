const GAUNTLET_HABILITADO = true;

const EL = {fuego:'#E8621A', tierra:'#7A9A3E', aire:'#4A9EFF', agua:'#2C6AA0'};
const STCSS = {
  agresivo:'background:rgba(216,90,48,.2);color:#F0997B', 
  defensivo:'background:rgba(15,110,86,.2);color:#5DCAA5', 
  tactico:'background:rgba(83,74,183,.2);color:#AFA9EC', 
  equilibrado:'background:rgba(55,138,221,.2);color:#85B7EB', 
  veneno:'background:rgba(83,150,40,.2);color:#9ECC5A', 
  caos:'background:rgba(212,83,126,.2);color:#ED93B1', 
  soporte:'background:rgba(130,80,180,.2);color:#CFA9EC'
};

let ws=null, myId=null, myName='', myBeast='', myRole='', oppName='', oppBeast='', battleId='';
let mySt={}, oppSt={}, pendingFrom=null, pendingIsTraining=false, pendingIs3v3=false;
let reconnectTimer=null, myWallet='', myCurrentHP=0, isKicked=false;
let myStats = { wins: 0, losses: 0, rank: null };
let gauntletBattleId = null, gauntletSelectedBeast = null;

let pendingChallengeTargetId = null;
let teamSelectionMode = '1v1'; 
let selectedTeam = []; 
let myTeam = [];
let isGauntletChallenge = false;
let lastMsgTime = Date.now(); 

let platformWalletAddress = ''; 

const audioFiles = {
    lobby: new Audio('Audio/lobby.mp3'),
    batalla: new Audio('Audio/batalla.mp3'),
    ataque: new Audio('Audio/ataque.mp3'),
    curacion: new Audio('Audio/curacion.mp3'),
    boton: new Audio('Audio/boton.mp3')
};
audioFiles.lobby.loop = true; audioFiles.lobby.volume = 0.3;
audioFiles.batalla.loop = true; audioFiles.batalla.volume = 0.3;
let currentMusic = null, isMuted = false, challengeBeepInterval = null;

function playMusic(track) { if (currentMusic === audioFiles[track]) return; if (currentMusic) currentMusic.pause(); currentMusic = audioFiles[track]; if (!isMuted) currentMusic.play().catch(e=>{}); }
function playSfx(track) { if (isMuted) return; const sfx = audioFiles[track]; if (!sfx) return; sfx.currentTime = 0; sfx.play().catch(e=>{}); }
function toggleMute() { isMuted = !isMuted; const btn = document.getElementById('btn-mute'); if (isMuted) { if (currentMusic) currentMusic.pause(); btn.textContent = '🔇'; } else { if (currentMusic) currentMusic.play().catch(e=>{}); btn.textContent = '🔊'; } }
function startChallengeBeep() { if (challengeBeepInterval) return; playSfx('boton'); challengeBeepInterval = setInterval(() => { playSfx('boton'); }, 1500); }
function stopChallengeBeep() { if (challengeBeepInterval) { clearInterval(challengeBeepInterval); challengeBeepInterval = null; } }
document.addEventListener('click', (e) => { if(e.target.closest('.btn')) playSfx('boton'); });

// CAMBIO 1: Botón de torre arranca deshabilitado hasta saber el HP
window.addEventListener('load', () => { 
  const btnG = document.getElementById('btn-gauntlet'); 
  if (btnG) {
    btnG.style.display = GAUNTLET_HABILITADO ? 'inline-block' : 'none'; 
    btnG.disabled = true; // Deshabilitado por defecto al cargar
  }
  fetchPlatformWallet(); 
});

async function fetchPlatformWallet() {
  try {
    const res = await fetch('/platform-wallet');
    const data = await res.json();
    if (data.wallet) {
      platformWalletAddress = data.wallet;
      const loginWalletSpan = document.querySelector('#step-charge div[onclick="copyWallet()"] span');
      if (loginWalletSpan) loginWalletSpan.textContent = platformWalletAddress;
    }
  } catch(e) { console.error("Error cargando wallet de plataforma:", e); }
}

async function disconnectWallet() { try { const phantom = getPhantom(); if (phantom && phantom.isConnected) await phantom.disconnect(); } catch(e) {} myWallet = ''; myName = ''; myBeast = ''; if(ws) { try { ws.close(); } catch(e){} } document.getElementById('btn-phantom').style.display='flex'; document.getElementById('wallet-connected').style.display='none'; document.getElementById('no-phantom').style.display='none'; document.getElementById('inp-name').value = ''; show('s-login'); }

function copyWallet() { 
  if (!platformWalletAddress) return alert('La wallet no se ha cargado aún.');
  navigator.clipboard.writeText(platformWalletAddress).then(() => { 
    alert('¡Dirección copiada! Envía USDC a esa wallet.'); 
  }).catch(() => alert('Dirección: ' + platformWalletAddress)); 
}

function depositWidgetHTML() { 
  const walletAddr = platformWalletAddress || 'Cargando...';
  return `<div style="background:rgba(74,158,255,.06);border:0.5px solid rgba(74,158,255,.2);border-radius:10px;padding:10px 12px"><div style="font-size:11px;color:#85B7EB;margin-bottom:4px">💡 Deposita USDC para obtener HP</div><div style="font-size:10px;color:rgba(255,255,255,.4);margin-bottom:7px">0.10 USDC = 100 HP · cualquier monto funciona</div><div style="display:flex;gap:6px;align-items:center"><div style="flex:1;background:rgba(0,0,0,.35);border-radius:6px;padding:6px 8px;font-family:monospace;font-size:9px;color:#85B7EB;word-break:break-all;cursor:pointer" onclick="copyWallet()">${walletAddr} <span style="color:rgba(255,255,255,.3)">📋</span></div><button class="btn btn-sm" style="font-size:10px;white-space:nowrap;padding:5px 10px" onclick="checkHPNow()">Verificar HP</button></div></div>`; 
}

function getPhantom() { return window.phantom?.solana || window.solana || null; }

async function connectPhantom() {
  await new Promise(r => setTimeout(r, 100));
  const phantom = getPhantom();
  if (!phantom || !phantom.isPhantom) {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const currentUrl = window.location.href;
    if (isMobile) { const deepLink = `https://phantom.app/ul/browse/${currentUrl}`; const noPhantomDiv = document.getElementById('no-phantom'); noPhantomDiv.style.display = 'block'; noPhantomDiv.innerHTML = `<div style="color:#F0997B; font-size:13px; line-height:1.5; text-align:left"><strong>📱 Para jugar desde tu móvil:</strong><br><br>1. Abre la app de <strong>Phantom</strong>.<br>2. Ve a <strong>"Descubrir" (🔍)</strong>.<br>3. Pega este enlace:<div style="background:rgba(0,0,0,.3); padding:8px; margin-top:8px; border-radius:6px; word-break:break-all; font-family:monospace; font-size:10px; color:#85B7EB; cursor:pointer; display:flex; justify-content:space-between; align-items:center" onclick="copyText('${currentUrl}')"><span>${currentUrl}</span><span style="margin-left:8px; white-space:nowrap">📋</span></div><br><button class="btn btn-blue btn-sm" style="width:100%; padding:10px" onclick="window.location.href='${deepLink}'">Intentar abrir automáticamente</button></div>`; document.getElementById('btn-phantom').style.display = 'none'; return; }
    document.getElementById('no-phantom').style.display='block';
    document.getElementById('no-phantom').innerHTML = 'Phantom no detectado. <a href="https://phantom.app" target="_blank" style="color:#F0997B;text-decoration:underline">Instalalo aqui</a>.';
    document.getElementById('btn-phantom').style.display='none'; return;
  }
  try {
    const resp = await phantom.connect();
    myWallet = resp.publicKey.toString();
    document.getElementById('btn-phantom').style.display='none';
    document.getElementById('wallet-connected').style.display='block';
    document.getElementById('wallet-addr').textContent = myWallet.slice(0,8)+'...'+myWallet.slice(-6);
    document.getElementById('wallet-hp').textContent = 'Verificando...';
    const sn = document.getElementById('step-name'); if(sn){ sn.style.opacity='1'; sn.style.pointerEvents='auto'; }
    await checkHPNow(true);
    const savedName = localStorage.getItem('vicamon_nick');
    if (savedName) {
      document.getElementById('inp-name').value = savedName;
      goProfile();
    }
  } catch(e) { console.error('Phantom error:', e); alert('No se pudo conectar Phantom.'); }
}
function copyText(text) { navigator.clipboard.writeText(text).then(() => alert('¡Enlace copiado!')).catch(() => alert('Copia este enlace manualmente: ' + text)); }
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
      const savedName = localStorage.getItem('vicamon_nick');
      if (savedName) {
        document.getElementById('inp-name').value = savedName;
        goProfile();
      }
    } catch(e) {} 
  } 
});

setInterval(() => {
  if (ws && ws.readyState === 1) {
    if (Date.now() - lastMsgTime > 25000) {
      console.log("WS timeout, forzando reconexión...");
      try { ws.close(); } catch(e) {}
      return;
    }
    ws.send(JSON.stringify({type:'ping'}));
  }
}, 10000);

async function checkHPNow(fromConnect=false) {
  if (!myWallet) return;
  try {
    const res = await fetch('/hp?wallet='+myWallet); const data = await res.json(); const hp = data.hp || 0;
    const loginHp = document.getElementById('wallet-hp');
    if(loginHp){ loginHp.textContent=hp+' HP'; loginHp.style.color=hp>=100?'#5DCAA5':'#EF9F27'; }
    updateHPDisplay(hp);
    if (data.stats) updateProfileUI(data.stats);
    if(document.getElementById('s-lobby').classList.contains('active') && ws){ ws.send(JSON.stringify({type:'ping'})); }
    if (hp >= 100) { document.getElementById('step-charge').style.display='none'; document.getElementById('step-name').style.opacity='1'; document.getElementById('step-name').style.pointerEvents='auto'; }
    else { document.getElementById('step-charge').style.display='block'; document.getElementById('step-name').style.opacity='1'; document.getElementById('step-name').style.pointerEvents='auto'; }
  } catch(e) { document.getElementById('wallet-hp').textContent = 'Error'; }
}

function updateProfileUI(stats) { if (stats) myStats = stats; const nameEl = document.getElementById('profile-name'); if (nameEl) { nameEl.textContent = myName || 'Jugador'; document.getElementById('profile-wallet').textContent = myWallet ? myWallet.slice(0,8)+'...'+myWallet.slice(-6) : 'Desconectado'; document.getElementById('profile-wins').textContent = myStats.wins || 0; document.getElementById('profile-losses').textContent = myStats.losses || 0; document.getElementById('profile-rank').textContent = myStats.rank ? '#' + myStats.rank : 'Sin clasificado'; } }
function show(id){ document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); document.getElementById(id).classList.add('active'); if(id === 's-login' || id === 's-pick' || id === 's-lobby' || id === 's-profile' || id === 's-team-select') playMusic('lobby'); if(id === 's-battle' || id === 's-result') playMusic('batalla'); }
function hpColor(pct){return pct>50?'#5DCAA5':pct>25?'#EF9F27':'#F0997B';}
function stTags(st,right=false){ let t=''; if(st.poisonTurns>0) t+=`<span class="stag" style="background:rgba(83,150,40,.3);color:#9ECC5A">☠×${st.poisonTurns}</span>`; if(st.burnTurns>0) t+=`<span class="stag" style="background:rgba(216,90,48,.3);color:#F0997B">🔥×${st.burnTurns}</span>`; if(st.shield>0) t+=`<span class="stag" style="background:rgba(55,138,221,.3);color:#85B7EB">🛡×${st.shield}</span>`; if(st.reflect50>0) t+=`<span class="stag" style="background:rgba(55,138,221,.2);color:#85B7EB">↩50%</span>`; if(st.stun) t+=`<span class="stag" style="background:rgba(212,83,126,.3);color:#ED93B1">💫stun</span>`; if(st.recharge>0) t+=`<span class="stag" style="background:rgba(136,135,128,.3);color:#B4B2A9">⚡×${st.recharge}</span>`; if(st.blind>0) t+=`<span class="stag" style="background:rgba(186,117,23,.3);color:#EF9F27">👁×${st.blind}</span>`; if(st.weakAtk>0) t+=`<span class="stag" style="background:rgba(15,110,86,.3);color:#5DCAA5">⬇atk×${st.weakAtk}</span>`; if(st.weaken>0) t+=`<span class="stag" style="background:rgba(15,110,86,.3);color:#5DCAA5">⬇dmg×${st.weaken}</span>`; if(st.analyzed>0) t+=`<span class="stag" style="background:rgba(130,80,180,.3);color:#CFA9EC">🔍×${st.analyzed}</span>`; return t; }
function panelHTML(st, bKey, label, side){ const b=BEASTS[bKey]||{name:bKey,sub:'',img:'',el:'aire',style:'equilibrado'}; const pct=Math.max(0,st.hp/st.maxHp*100); const right=side==='opp'; return `<div class="f-label">${label}</div><div class="f-sprite-wrap"><img class="f-sprite" id="spr-${side}" src="${b.img}" alt="${b.name}"></div><div class="f-name">${b.name}</div><div class="f-sub">${b.sub}</div><div class="hp-lbl">HP</div><div class="hp-wrap"><div class="hp-fill" id="hpbar-${side}" style="width:${pct.toFixed(1)}%;background:${hpColor(pct)}"></div></div><div class="hp-val" id="hpval-${side}">${Math.max(0,st.hp)} / ${st.maxHp}</div><div class="stags">${stTags(st,right)}</div>`; }
function dmgLabel(a){ if(a.fx==='chaos'||a.fx==='chaosHi') return '?? HP'; if(a.fx==='equalize') return 'ΔHP'; if(a.fx==='double') return `2×${a.d}`; if(a.fx==='triple') return `3×${a.d}`; if(a.d===0){ const map={heal20:'♥+20',heal30:'♥+30',fortress:'♥+15+🛡',shield2:'🛡×2',shield1r:'🛡+↩',reflect50:'↩50%',weaken:'⬇atk',analyze:'🔍+15%',purify:'✨cura',counter:'↩daño',swap:'⇄estados'}; return map[a.fx]||'—'; } if(a.fx==='drain10') return `15 HP (+10♥)`; return `${a.d} HP`; }
function dmgClass(a){ if(a.d===0) return 'dmg-zero'; const eff=a.fx==='double'?a.d*2:a.fx==='triple'?a.d*3:a.d; if(eff>=35) return 'dmg-high'; if(eff>=18) return 'dmg-mid'; return 'dmg-low'; }
function dmgLabelPick(a){ if(a.fx==='chaos'||a.fx==='chaosHi') return '?? HP'; if(a.fx==='equalize') return 'ΔHP'; if(a.fx==='double') return `2×${a.d}`; if(a.fx==='triple') return `3×${a.d}`; if(a.d===0){ const m={heal20:'♥+20',heal30:'♥+30',fortress:'♥+Escudo',shield2:'Escudo×2',shield1r:'Escudo+↩',reflect50:'↩50%',weaken:'⬇Atk rival',analyze:'🔍+15%dmg',purify:'✨Limpiar',counter:'↩Daño recv',swap:'⇄Estados'}; return m[a.fx]||'Buff'; } if(a.fx==='drain10') return `15 HP (+10♥)`; return `${a.d} HP`; }
function dmgClassPick(a){ if(a.d===0) return 'dmg-zero'; const e=a.fx==='double'?a.d*2:a.fx==='triple'?a.d*3:a.d; return e>=35?'dmg-high':e>=18?'dmg-mid':'dmg-low'; }

function buildBestiary(){ const keys=Object.entries(BEASTS); let html=''; const cats = {}; keys.forEach(([k,b])=>{ if(!cats[b.cat]) cats[b.cat] = []; cats[b.cat].push({k,b}); }); for(const catName in cats){ html += `<div style="grid-column:1/-1; margin-top:15px; border-bottom:0.5px solid rgba(255,255,255,.2); padding-bottom:5px; color:#CFA9EC; font-weight:600; text-transform:uppercase; letter-spacing:.08em; font-size:13px">✦ ${catName} Series</div>`; cats[catName].forEach(({k,b})=>{ html+=`<div class="bcard" id="bc-${k}" onclick="showBestiaryDetail('${k}')"><img src="${b.img}" alt="${b.name}"><div class="bname">${b.name}</div><div class="bsub">${b.sub}</div><span class="bstyle" style="${STCSS[b.style]}">${b.style}</span><div class="elbar" style="background:${EL[b.el]}"></div></div>`; }); } html+=`<div class="beast-detail" id="bestiary-detail-panel"></div>`; document.getElementById('bestiary-grid').innerHTML=html; }
function showBestiaryDetail(k){ const b=BEASTS[k]; const panel=document.getElementById('bestiary-detail-panel'); const statData={atk:{aries:70,tauro:55,geminis:65,cancer:45,leo:70,virgo:60,libra:62,escorpio:65,sagitario:68,capricornio:50,acuario:72,piscis:58},def:{aries:30,tauro:90,geminis:50,cancer:95,leo:65,virgo:70,libra:62,escorpio:55,sagitario:55,capricornio:92,acuario:45,piscis:68},spd:{aries:90,tauro:30,geminis:80,cancer:40,leo:70,virgo:65,libra:62,escorpio:70,sagitario:75,capricornio:35,acuario:85,piscis:60}}; const atksHtml=b.attacks.map(a=>{ const tags=[]; if(a.pierce) tags.push('<span class="atk-tag tag-pierce">Ignora escudo</span>'); if(a.fx==='double') tags.push('<span class="atk-tag tag-nobreak">Doble golpe</span>'); if(a.fx==='triple') tags.push('<span class="atk-tag tag-nobreak">Triple golpe</span>'); if(a.risk||a.self>0) tags.push(`<span class="atk-tag tag-risk">Riesgo${a.self>0?' -'+a.self+' HP':''}</span>`); if(a.buff) tags.push('<span class="atk-tag tag-buff">Buff</span>'); if(a.dot) tags.push('<span class="atk-tag tag-dot">Daño/turno</span>'); if(a.debuff) tags.push('<span class="atk-tag tag-debuff">Debuff</span>'); const ppText = a.pp === 99 || a.pp === undefined ? 'PP: ∞' : `PP: ${a.pp}`; return `<div class="bd-atk"><div class="bd-atk-top"><span class="bd-atk-name">${a.n}</span><span class="bd-atk-dmg ${dmgClassPick(a)}">${dmgLabelPick(a)}</span></div>${tags.length?`<div class="bd-atk-tags">${tags.join('')}</div>`:''}<div class="bd-atk-desc">${a.desc}</div><div style="display:flex;justify-content:space-between;align-items:center"><div class="bd-atk-acc">${a.acc}% precisión</div><div class="bd-atk-pp">${ppText}</div></div></div>`; }).join(''); panel.innerHTML=`<div class="bd-left"><img src="${b.img}" alt="${b.name}"><div class="bd-name">${b.name}</div><div class="bd-sub">${b.sub}</div><div class="bd-stats"><div class="bd-stat"><div class="bd-stat-val">${statData.atk[k]||'—'}</div><div class="bd-stat-lbl">ATK</div></div><div class="bd-stat"><div class="bd-stat-val">${statData.def[k]||'—'}</div><div class="bd-stat-lbl">DEF</div></div><div class="bd-stat"><div class="bd-stat-val">${statData.spd[k]||'—'}</div><div class="bd-stat-lbl">VEL</div></div></div></div><div class="bd-attacks">${atksHtml}</div>`; panel.classList.add('open'); panel.scrollIntoView({behavior:'smooth',block:'nearest'}); }

function goProfile(){ 
  if(!myWallet){alert('Primero conecta tu wallet Phantom');return;} 
  myName=document.getElementById('inp-name').value.trim(); 
  if(!myName){alert('Escribe tu nombre de combate');return;} 
  localStorage.setItem('vicamon_nick', myName); 
  updateProfileUI(); 
  buildBestiary(); 
  show('s-profile'); 
  updateHPDisplay(myCurrentHP); 
  checkHPNow(false); 
  const profWidget = document.getElementById('profile-deposit-widget'); 
  if(profWidget) profWidget.innerHTML = depositWidgetHTML();
  if (!ws || ws.readyState !== 1) {
    connectWS();
  }
}

function toggleEditName() { const box = document.getElementById('edit-name-box'); const input = document.getElementById('inp-edit-name'); if (box.style.display === 'none' || box.style.display === '') { input.value = myName; box.style.display = 'block'; } else { box.style.display = 'none'; } }
function saveNickname() { const newName = document.getElementById('inp-edit-name').value.trim(); if (!newName) return alert('Ingresa un nombre válido'); myName = newName; localStorage.setItem('vicamon_nick', myName); document.getElementById('profile-name').textContent = myName; document.getElementById('edit-name-box').style.display = 'none'; if (ws && ws.readyState === 1) ws.send(JSON.stringify({type:'update_nickname', name: myName})); updateLobbyBadge(); }

function openChallengeMenu(targetId, name, isTrain) {
  pendingChallengeTargetId = targetId;
  pendingIsTraining = isTrain;
  isGauntletChallenge = false;
  const title = isTrain ? `Entrenar con ${name}` : `Retar a ${name}`;
  let buttonsHtml = '';
  if (isTrain) {
    buttonsHtml += `<button class="btn btn-blue" style="width:100%;margin-bottom:10px" onclick="selectChallengeMode('train')">🤝 Entrenar 1 vs 1 (XP)</button>`;
    buttonsHtml += `<button class="btn btn-blue" style="width:100%" onclick="selectChallengeMode('train3v3')">🤝 Entrenar 3 vs 3 (XP)</button>`;
  } else {
    buttonsHtml += `<button class="btn btn-blue" style="width:100%;margin-bottom:10px" ${myCurrentHP < 100 ? 'disabled' : ''} onclick="selectChallengeMode('1v1')">⚔️ 1 vs 1 (Apuesta 100 HP)</button>`;
    buttonsHtml += `<button class="btn btn-blue" style="width:100%" ${myCurrentHP < 300 ? 'disabled' : ''} onclick="selectChallengeMode('3v3')">⚔️ 3 vs 3 (Apuesta 300 HP)</button>`;
  }
  const modal = document.getElementById('modal-challenge-mode');
  modal.innerHTML = `
    <div class="modal" style="max-width:350px">
      <h3 style="margin-bottom:20px">${title}</h3>
      <div style="display:flex;flex-direction:column;gap:5px">${buttonsHtml}</div>
      <button class="btn btn-sm btn-red" style="margin-top:20px;width:100%" onclick="document.getElementById('modal-challenge-mode').classList.add('hidden')">Cancelar</button>
    </div>
  `;
  modal.classList.remove('hidden');
}

function selectChallengeMode(mode) {
  document.getElementById('modal-challenge-mode').classList.add('hidden');
  teamSelectionMode = (mode === '3v3' || mode === 'train3v3') ? '3v3' : '1v1';
  pendingIsTraining = (mode === 'train' || mode === 'train3v3'); 
  selectedTeam = [];
  const titleEl = document.getElementById('ts-mode-title');
  const isMaster = (pendingChallengeTargetId === null);
  if(teamSelectionMode === '1v1') titleEl.textContent = (isMaster || pendingIsTraining) ? 'Entrenamiento: 1 vs 1 (Elige 1)' : 'Combate: 1 vs 1 (Elige 1)';
  if(teamSelectionMode === '3v3') titleEl.textContent = (isMaster || pendingIsTraining) ? 'Entrenamiento: 3 vs 3 (Elige 3)' : 'Combate: 3 vs 3 (Elige 3)';
  buildTeamPickGrid();
  show('s-team-select');
}

function buildTeamPickGrid() { const keys=Object.entries(BEASTS); let html=''; keys.forEach(([k,b])=>{ html+=`<div class="bcard" id="tpc-${k}" onclick="toggleTeamBeast('${k}')"><img src="${b.img}" alt="${b.name}"><div class="bname">${b.name}</div><div class="bsub">${b.sub}</div><span class="bstyle" style="${STCSS[b.style]}">${b.style}</span><div class="elbar" style="background:${EL[b.el]}"></div></div>`; }); html+=`<div class="beast-detail" id="team-detail-panel"></div>`; document.getElementById('team-pick-grid').innerHTML=html; updateTeamSelectionUI(); }
function toggleTeamBeast(k) { const maxPicks = teamSelectionMode === '3v3' ? 3 : 1; const idx = selectedTeam.indexOf(k); if(idx > -1) { selectedTeam.splice(idx, 1); } else { if(selectedTeam.length >= maxPicks) { alert(`Ya elegiste ${maxPicks} Vicamons.`); return; } selectedTeam.push(k); } updateTeamSelectionUI(); }
function updateTeamSelectionUI() { const maxPicks = teamSelectionMode === '3v3' ? 3 : 1; document.querySelectorAll('#team-pick-grid .bcard').forEach(c => c.classList.remove('sel')); selectedTeam.forEach((k, i) => { const card = document.getElementById('tpc-'+k); if(card) { card.classList.add('sel'); let badge = card.querySelector('.team-badge'); if(!badge) { badge = document.createElement('div'); badge.className = 'team-badge'; badge.style.cssText = 'position:absolute;top:2px;right:2px;background:#4a9eff;color:#fff;width:16px;height:16px;border-radius:50%;font-size:10px;display:flex;align-items:center;justify-content:center;font-weight:bold'; card.appendChild(badge); } badge.textContent = i + 1; } }); document.querySelectorAll('#team-pick-grid .bcard').forEach(c => { if(!c.classList.contains('sel')) { const badge = c.querySelector('.team-badge'); if(badge) badge.remove(); } }); document.getElementById('btn-confirm-team').disabled = selectedTeam.length !== maxPicks; }
function cancelTeamSelection() { if(pendingFrom !== null) { ws.send(JSON.stringify({type:'reject_challenge'})); pendingFrom = null; } isGauntletChallenge = false; show('s-lobby'); }

function confirmTeam() {
  if (isGauntletChallenge) {
    myBeast = selectedTeam[0];
    ws.send(JSON.stringify({type:'challenge_gauntlet', beast: myBeast}));
    isGauntletChallenge = false;
    show('s-lobby');
    return;
  }
  let isTraining;
  if (pendingFrom !== null) {
    isTraining = pendingIsTraining;
  } else {
    isTraining = pendingIsTraining || pendingChallengeTargetId === null;
  }
  const mode3v3 = teamSelectionMode === '3v3';
  if(mode3v3) { myTeam = selectedTeam.slice(); } else { myBeast = selectedTeam[0]; myTeam = [myBeast]; }
  if(ws && ws.readyState === 1) { if(!mode3v3) ws.send(JSON.stringify({type:'change_beast', beast: myBeast})); }
  
  if(pendingFrom !== null) { 
    if(mode3v3) ws.send(JSON.stringify({type:'accept_3v3', fromId: pendingFrom, team: myTeam, isTraining: isTraining}));
    else ws.send(JSON.stringify({type:'accept', fromId: pendingFrom, isTraining: isTraining}));
    pendingFrom = null; pendingIs3v3 = false; pendingIsTraining = false;
  } else if(pendingChallengeTargetId !== null) { 
    if(mode3v3 && isTraining) ws.send(JSON.stringify({type:'challenge_3v3_training', targetId: pendingChallengeTargetId, team: myTeam}));
    else if(mode3v3) ws.send(JSON.stringify({type:'challenge_3v3', targetId: pendingChallengeTargetId, team: myTeam}));
    else if(isTraining) ws.send(JSON.stringify({type:'challenge_training', targetId: pendingChallengeTargetId}));
    else ws.send(JSON.stringify({type:'challenge', targetId: pendingChallengeTargetId}));
    pendingChallengeTargetId = null; pendingIsTraining = false;
  } else if(isTraining) { 
    if(mode3v3) ws.send(JSON.stringify({type:'challenge_3v3_cpu', team: myTeam}));
    else ws.send(JSON.stringify({type:'challenge_cpu'}));
  }
  show('s-lobby');
}

function enterLobby(){ if(ws && ws.readyState === 1) { show('s-lobby'); ws.send(JSON.stringify({type:'ping'})); } else { if(!myBeast) myBeast = 'aries'; connectWS(); } }
function connectWS(){ clearTimeout(reconnectTimer); isKicked=false; const proto=location.protocol==='https:'?'wss':'ws'; const localWs = new WebSocket(`${proto}://${location.host}`); localWs.onopen=()=>{ clearTimeout(reconnectTimer); lastMsgTime = Date.now(); localWs.send(JSON.stringify({type:'join',name:myName,beast:myBeast||'aries',wallet:myWallet})); }; localWs.onmessage=e=>{ lastMsgTime = Date.now(); try{handleMsg(JSON.parse(e.data));}catch(err){console.error(err);} }; localWs.onerror=()=>{}; localWs.onclose=()=>{ if(ws !== localWs) return; const inBattle=document.getElementById('s-battle').classList.contains('active'); if(!inBattle && !isKicked) reconnectTimer=setTimeout(()=>{ if(myName&&myBeast) connectWS(); },2000); }; ws = localWs; }

// CAMBIO 2: Verificación extra de seguridad al intentar entrar a la torre
function challengeGauntlet() {
  if(!ws || ws.readyState !== 1) return alert('Conectando...');
  if(myCurrentHP < 100) return alert('Necesitas al menos 100 HP para entrar a la Torre de Batalla.');
  if(!confirm('¿Iniciar la Torre de Batalla? (Apostarás 100 HP)')) return;
  isGauntletChallenge = true;
  teamSelectionMode = '1v1';
  document.getElementById('ts-mode-title').textContent = 'Torre de Batalla (Elige tu inicial)';
  selectedTeam = [];
  buildTeamPickGrid();
  show('s-team-select');
}

function continueGauntlet() { document.getElementById('modal-gauntlet').classList.add('hidden'); const beastToUse = gauntletSelectedBeast || myBeast; ws.send(JSON.stringify({type:'gauntlet_continue', battleId: gauntletBattleId, beast: beastToUse})); myBeast = beastToUse; }
function selectGauntletBeast(k) { gauntletSelectedBeast = k; document.querySelectorAll('#g-beast-picker .bcard').forEach(c=>c.classList.remove('sel')); document.getElementById('gbc-'+k)?.classList.add('sel'); }
function surrender() { if(!confirm('¿Rendirte?')) return; if(ws && ws.readyState === 1) ws.send(JSON.stringify({type:'surrender', battleId})); }

function openSwitchMenu(reason = 'Elige tu siguiente Vicamon. ¡Perderás el turno!') { 
  const bench = window._myBench || []; 
  let html = `<div class="modal" style="max-width:400px"><h3>Cambiar Vicamon</h3><p style="font-size:12px;color:#F0997B;margin-bottom:15px">${reason}</p><div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">`; 
  bench.forEach((b, i) => { 
    if (b.isDead || b.isActive) return; 
    const beast = BEASTS[b.beast]; 
    html += `<div class="bcard" style="width:100px;cursor:pointer" onclick="executeSwitch(${i})"><img src="${beast.img}" style="width:60px;height:60px"><div class="bname">${beast.name}</div><div style="font-size:10px;color:#5DCAA5">${b.state.hp} HP</div></div>`; 
  }); 
  html += `</div><button class="btn btn-sm btn-red" style="margin-top:15px;width:100%" onclick="closeSwitchMenu()">Cancelar</button></div>`; 
  let modalBg = document.getElementById('modal-switch'); 
  if(!modalBg) { modalBg = document.createElement('div'); modalBg.className = 'modal-bg'; modalBg.id = 'modal-switch'; document.body.appendChild(modalBg); } 
  modalBg.innerHTML = html; modalBg.classList.remove('hidden'); 
}
function closeSwitchMenu() { const m = document.getElementById('modal-switch'); if(m) m.classList.add('hidden'); }
function executeSwitch(index) { closeSwitchMenu(); ws.send(JSON.stringify({type:'team_switch', battleId, index})); }

function handleMsg(m){
  if(m.type==='joined'){ 
    myId=m.id; 
    if(m.hp !== undefined) updateHPDisplay(m.hp); 
    updateLobbyBadge(); 
    updateProfileUI(m.stats); 
    if(document.getElementById('s-login').classList.contains('active') && !isKicked) show('s-lobby'); 
    checkHPNow(false); 
  }
  if(m.type==='nickname_updated'){ myName = m.name; updateLobbyBadge(); }
  if(m.type==='kicked'){ isKicked=true; alert(m.msg); show('s-login'); if(ws) ws.close(); }
  if(m.type==='lobby'){ const others=m.players.filter(p=>p.id!==myId); document.getElementById('lbl-online').textContent=m.players.length; renderLobby(others); }
  if(m.type==='leaderboard_update'){ renderLeaderboard(m.top); }
  if(m.type==='chat_message'){ handleChatMessage(m); }
  if(m.type==='gauntlet_next'){ gauntletBattleId = m.battleId; gauntletSelectedBeast = myBeast; const b = BEASTS[m.nextBeast]; document.getElementById('g-title').textContent = `¡Jefe ${m.round - 1}/12 derrotado!`; document.getElementById('g-sub').innerHTML = `El próximo rival es <strong style="color:#CFA9EC">${b.name}</strong> (${m.round}/12).`; const picker = document.getElementById('g-beast-picker'); picker.innerHTML = Object.entries(BEASTS).map(([k,b])=>`<div class="bcard" id="gbc-${k}" style="padding:5px" onclick="selectGauntletBeast('${k}')"><img src="${b.img}" style="width:50px;height:50px"><div class="bname" style="font-size:10px">${b.name}</div></div>`).join(''); document.getElementById('gbc-'+myBeast)?.classList.add('sel'); document.getElementById('modal-gauntlet').classList.remove('hidden'); return; }
  
  if(m.type==='challenged'){ pendingFrom=m.fromId; pendingIsTraining = !!m.isTraining; pendingIs3v3 = false; const b=BEASTS[m.fromBeast]||{name:m.fromBeast,img:''}; document.getElementById('ch-img').src=b.img; document.getElementById('ch-title').textContent=`¡Reto de ${m.fromName}!`; document.getElementById('ch-sub').textContent=pendingIsTraining ? `${m.fromName} quiere un ENTRENAMIENTO 1v1.` : `${m.fromName} quiere batallar 1v1 (Apuesta 100 HP).`; document.getElementById('modal-challenged').classList.remove('hidden'); startChallengeBeep(); }
  if(m.type==='challenged_3v3'){ pendingFrom=m.fromId; pendingIs3v3 = true; pendingIsTraining = !!m.isTraining; document.getElementById('ch-img').src='vicamon-logo.png'; document.getElementById('ch-title').textContent=`¡Reto 3v3 de ${m.fromName}!`; document.getElementById('ch-sub').textContent=pendingIsTraining ? `${m.fromName} quiere un ENTRENAMIENTO 3v3.` : `${m.fromName} quiere una batalla 3v3 (Apuesta 300 HP).`; document.getElementById('modal-challenged').classList.remove('hidden'); startChallengeBeep(); }

  if(m.type==='battle_start'){
    battleId=m.battleId; myRole=m.role; oppName=m.opponent; oppBeast=m.opponentBeast;
    window._isTeamBattle = !!m.isTeamBattle;
    const empty={hp:100,maxHp:100,poisonDmg:0,poisonTurns:0,burnDmg:0,burnTurns:0,shield:0,shieldReflect:0,reflect50:0,stun:false,recharge:0,regen:0,regenTurns:0,blind:0,weakAtk:0,weaken:0,corrode:0,analyzed:0,lastDmgReceived:0,pp:[]};
    mySt={...empty}; oppSt={...empty};
    const isCpu=!!m.isCpu; const isTraining=!!m.isTraining;
    let startMsg = `¡Combate! ${myName} vs ${oppName}`;
    if(isTraining) startMsg = `¡Entrenamiento! ${myName} vs ${oppName}`;
    show('s-battle'); renderBattle(!isCpu,[{t:startMsg,c:'hi'}]);
  }
  if(m.type==='battle_state'){
    const me=myRole==='p1'?m.p1:m.p2; const opp=myRole==='p1'?m.p2:m.p1;
    if (m.isTeamBattle) { mySt = me.activeState; oppSt = opp.activeState; myBeast = me.activeBeast; oppBeast = opp.activeBeast; window._myBench = me.bench; } 
    else { myBeast = me.beast || myBeast; oppBeast = opp.beast || oppBeast; mySt=me.state; oppSt=opp.state; }
    const prevMyHp=mySt.hp, prevOppHp=oppSt.hp;
    if(mySt.hp<prevMyHp) animHit('me',prevMyHp-mySt.hp);
    if(oppSt.hp<prevOppHp) animHit('opp',prevOppHp-oppSt.hp);
    renderBattle(m.yourTurn,m.logs);
  }
  if(m.type === 'team_force_switch'){ openSwitchMenu(m.reason); }
  
  if(m.type==='hp_updated'){ updateHPDisplay(m.hp); myCurrentHP=m.hp; }
  if(m.type==='cashout_result'){ const btn=document.getElementById('btn-cashout'); if(!m.ok){ if(btn){btn.disabled=false;btn.textContent='💰 Cashout';} alert('Error: '+m.reason); return; } if(m.status==='confirmed'){ if(btn){btn.disabled=false;btn.textContent='💰 Cashout';} updateHPDisplay(0); alert(`✓ Cashout: ${m.usdc} USDC`); } }
  if(m.type==='error'){ alert('⚠ ' + m.msg); }
  
  if(m.type==='battle_end'){
    const won=m.won; 
    const isCpuResult = m.isCpu === true; 
    const isTrainingResult = m.isTraining === true;
    const isGauntletResult = m.isGauntlet === true; 
    const isTeamResult = m.isTeamBattle === true;
    
    const winnerHp=m.winnerHp||0; 
    const newHp=m.newHp||0; 
    if(m.stats) updateProfileUI(m.stats); 
    show('s-result');
    
    if(!isCpuResult && !isTrainingResult) updateHPDisplay(newHp); 
    if(isGauntletResult) updateHPDisplay(newHp); 
    if(isTeamResult && !isTrainingResult) updateHPDisplay(newHp);
    
    let resultBody='';
    
    if(isTeamResult && isTrainingResult){
        const myXp = won ? (m.winnerXp || 0) : (m.loserXp || 0);
        resultBody=`<div style="background:rgba(130,80,180,.08);border:0.5px solid rgba(130,80,180,.2);border-radius:10px;padding:14px;margin:14px 0;text-align:center"><div style="font-size:20px">&#127891;</div><div style="font-size:13px;color:#CFA9EC;font-weight:600">Entrenamiento 3v3</div><div style="font-size:14px;color:#5DCAA5;margin-top:8px">+${myXp} XP</div></div>`;
    } else if(isGauntletResult){
        if(won){
            resultBody=`<div style="background:rgba(246, 226, 102, 0.1);border-radius:10px;padding:14px;margin:14px 0;text-align:center"><div style="color:#F6E265">¡Torre Completada!</div><div style="color:#5DCAA5;margin-top:8px">+100 HP devueltos<br>+100 HP ganados</div></div>`;
        } else {
            resultBody=`<div style="background:rgba(255,255,255,.05);border-radius:10px;padding:14px;margin:14px 0;text-align:center"><div style="color:#F0997B">Torre Fallida</div><div style="color:#F0997B;margin-top:8px">-100 HP perdidos</div></div>`;
        }
    } else if(isTrainingResult){
        const myXp = won ? (m.winnerXp || 0) : (m.loserXp || 0);
        resultBody=`<div style="background:rgba(130,80,180,.08);border-radius:10px;padding:14px;margin:14px 0;text-align:center"><div style="font-size:20px">&#127891;</div><div style="font-size:13px;color:#CFA9EC">Entrenamiento 1v1</div><div style="font-size:14px;color:#5DCAA5;margin-top:8px">+${myXp} XP</div></div>`;
    } else if(isTeamResult){
        if(won){
            resultBody=`<div style="background:rgba(255,255,255,.05);border-radius:10px;padding:14px;margin:14px 0"><div>Combate 3v3</div><div style="color:#5DCAA5;margin-top:8px">+300 HP + ${winnerHp} HP sobrantes</div><div style="color:#fff;margin-top:8px">Total: ${newHp} HP</div></div>`;
        } else {
            resultBody=`<div style="background:rgba(255,255,255,.05);border-radius:10px;padding:14px;margin:14px 0"><div>Combate 3v3</div><div style="color:#F0997B;margin-top:8px">-300 HP</div></div>`;
        }
    } else if(isCpuResult){
        const myXp = won ? (m.winnerXp || 0) : (m.loserXp || 0);
        resultBody=`<div style="background:rgba(93,202,165,.08);border-radius:10px;padding:14px;margin:14px 0;text-align:center"><div style="font-size:20px">&#127891;</div><div style="color:#5DCAA5">Entrenamiento vs Master</div><div style="font-size:14px;color:#5DCAA5;margin-top:8px">+${myXp} XP</div></div>`;
    } else if(won){
        resultBody=`<div style="background:rgba(255,255,255,.05);border-radius:10px;padding:14px;margin:14px 0"><div>Victoria</div><div style="color:#5DCAA5;margin-top:8px">+${100+winnerHp} HP</div><div style="color:#fff;margin-top:8px">Total: ${newHp} HP</div></div>`;
    } else {
        resultBody=`<div style="background:rgba(255,255,255,.05);border-radius:10px;padding:14px;margin:14px 0"><div>Derrota</div><div style="color:#F0997B;margin-top:8px">-100 HP</div></div>`;
    }
    
    const icon = won ? '🏆' : '💀'; 
    const title = won ? '¡Victoria!' : 'Derrota';
    document.getElementById('result-box').innerHTML=`<div class="r-icon">${icon}</div><div class="r-title">${title}</div>${resultBody}<button class="btn btn-blue" onclick="backToLobby()">Volver</button>`;
    window._isTeamBattle = false;
  }
}
function animHit(side, dmg){ const spr=document.getElementById('spr-'+side); if(!spr) return; spr.classList.remove('anim-hit','anim-attack'); void spr.offsetWidth; spr.classList.add('anim-hit'); const wrap=spr.closest('.f-sprite-wrap'); const fl=document.createElement('div'); fl.className='dmg-float'; fl.textContent='-'+dmg; fl.style.color='#F0997B'; wrap.appendChild(fl); playSfx('ataque'); setTimeout(()=>{spr.classList.remove('anim-hit');fl.remove();},800); }
function animAttack(side){ const spr=document.getElementById('spr-'+side); if(!spr) return; spr.classList.remove('anim-attack'); void spr.offsetWidth; spr.classList.add('anim-attack'); setTimeout(()=>spr.classList.remove('anim-attack'),400); }
function updateLobbyBadge(){ document.getElementById('lbl-myname').textContent=myName; const hpEl = document.getElementById('lbl-myhp'); if(hpEl) hpEl.textContent = myCurrentHP + ' HP'; const b=BEASTS[myBeast]; if(b) document.getElementById('badge-img').src=b.img; }
let _lastLobbyPlayers=[]; function renderLobbyFromCache(){ renderLobby(_lastLobbyPlayers); }
function renderLobby(others){ 
  _lastLobbyPlayers=others; 
  const list=document.getElementById('players-list'); 
  const myHp=myCurrentHP; 
  const hpWarnEl=document.getElementById('low-hp-warning'); 
  if(hpWarnEl) {
    hpWarnEl.style.display = 'block'; 
    const warnMsg = hpWarnEl.querySelector('div:first-child');
    if (warnMsg) warnMsg.style.display = myHp < 100 ? 'block' : 'none';
  }
  if(!others.length){list.innerHTML='<p class="empty-lobby">No hay otros jugadores...</p>';return;} 
  list.innerHTML=others.map(p=>{ 
    const b=BEASTS[p.beast]||{name:p.beast,img:''}; 
    const rivalHp=p.hp||0; 
    const canChallenge = myHp >= 100 && rivalHp >= 100; 
    const hpColor=rivalHp>=100?'#5DCAA5':'#F0997B'; 
    return `<div class="p-row"><div class="p-info"><img class="p-img" src="${b.img}"><div><div class="p-name">${p.name}</div><div class="p-beast">${b.name} · <span style="color:${hpColor};font-size:10px">${rivalHp} HP</span></div></div></div><div style="display:flex;gap:6px"><button class="btn btn-sm" style="background:rgba(130,80,180,.15);border:1px solid rgba(130,80,180,.35);color:#CFA9EC" onclick="openChallengeMenu(${p.id},'${p.name}', true)">🤝 Entrenar</button><button class="btn btn-blue btn-sm" ${canChallenge?'':'disabled'} onclick="openChallengeMenu(${p.id},'${p.name}', false)">⚔️ Retar</button></div></div>`; 
  }).join(''); 
}

async function doCashout(){ const btn=document.getElementById('btn-cashout'); if(btn){btn.disabled=true;btn.textContent='Procesando...';} if(!ws || ws.readyState !== 1){ if(btn){btn.disabled=false;btn.textContent='💰 Cashout';} return; } ws.send(JSON.stringify({type:'cashout'})); }

// CAMBIO 3: Habilitar/Deshabilitar botón de la Torre según el HP
function updateHPDisplay(hp){ 
  myCurrentHP = hp || 0; 
  const el=document.getElementById('pick-hp-val'); if(el){ el.textContent=hp+' HP'; el.style.color=hp>=100?'#5DCAA5':'#EF9F27'; } 
  const loginHp=document.getElementById('wallet-hp'); if(loginHp){ loginHp.textContent=hp+' HP'; loginHp.style.color=hp>=100?'#5DCAA5':'#EF9F27'; } 
  const profHp=document.getElementById('profile-hp'); if(profHp){ profHp.textContent=hp+' HP'; profHp.style.color=hp>=100?'#5DCAA5':'#EF9F27'; } 
  const btn=document.getElementById('btn-cashout'); if(btn){ btn.style.display=hp>0?'inline-block':'none'; btn.disabled=false; btn.textContent='💰 Cashout'; } 
  
  // Control del botón de la Torre de Batalla
  const btnG = document.getElementById('btn-gauntlet');
  if (btnG && GAUNTLET_HABILITADO) {
    btnG.style.display = 'inline-block'; // Aseguramos que sea visible
    btnG.disabled = myCurrentHP < 100; // Se deshabilita si tiene menos de 100 HP
  }
  
  // INYECTAR WALLET DE PLATAFORMA SIEMPRE
  const lobbyWidget = document.getElementById('lobby-deposit-widget');
  if(lobbyWidget) lobbyWidget.innerHTML = depositWidgetHTML();
  const profWidget = document.getElementById('profile-deposit-widget');
  if(profWidget) profWidget.innerHTML = depositWidgetHTML();

  if(document.getElementById('s-lobby')?.classList.contains('active')){ 
    renderLobbyFromCache(); 
    updateLobbyBadge(); 
  } 
}

function challengeMaster(){ if(!ws || ws.readyState !== 1) return; openChallengeMenu(null, 'Zodiac Master', true); }

function acceptChallenge(){
  document.getElementById('modal-challenged').classList.add('hidden');
  stopChallengeBeep();
  if(pendingFrom===null) return;
  teamSelectionMode = pendingIs3v3 ? '3v3' : '1v1';
  selectedTeam = [];
  const title = (pendingIs3v3 ? '3 vs 3' : '1 vs 1') + (pendingIsTraining ? ' (Entrenamiento)' : ' (Combate)');
  document.getElementById('ts-mode-title').textContent = title;
  buildTeamPickGrid(); 
  show('s-team-select');
}
function rejectChallenge(){ document.getElementById('modal-challenged').classList.add('hidden'); stopChallengeBeep(); pendingFrom=null; pendingIsTraining=false; pendingIs3v3=false; }
function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
function sendChatMessage(){ const input = document.getElementById('chat-input'); const msg = input.value.trim(); if(msg && ws && ws.readyState === 1){ ws.send(JSON.stringify({type:'chat_message', text:msg})); input.value = ''; } }
function handleChatMessage(m){ const chatBox = document.getElementById('chat-box'); if(chatBox.querySelector('.chat-empty')) chatBox.innerHTML = ''; const msgDiv = document.createElement('div'); msgDiv.className = 'chat-msg'; msgDiv.innerHTML = `<span class="chat-name">${escapeHtml(m.name)}:</span> <span style="color:rgba(255,255,255,.8)">${escapeHtml(m.text)}</span>`; chatBox.appendChild(msgDiv); chatBox.scrollTop = chatBox.scrollHeight; }
function renderLeaderboard(top) { const podium = document.getElementById('leaderboard-podium'); if (!top || top.length === 0) { podium.innerHTML = '<div style="flex:1;color:rgba(255,255,255,.3);text-align:center;font-size:11px;padding:20px 0">Gana batallas reales para aparecer aquí</div>'; return; } podium.innerHTML = top.map((p, i) => { const medals = ['🥇', '🥈', '🥉']; const colors = ['#F5A623', '#C0C0C0', '#CD7F32']; return `<div style="flex:1;background:rgba(255,255,255,.04);border:0.5px solid ${colors[i]};border-radius:10px;padding:10px 6px;text-align:center"><div style="font-size:20px">${medals[i]}</div><div style="font-size:12px;font-weight:700">${p.last_name || 'Anónimo'}</div><div style="font-size:9px;color:rgba(255,255,255,.5)">${p.wins}V · ${p.losses}D</div></div>`; }).join(''); }

function renderBattle(yourTurn, logs){
  document.getElementById('f-me').innerHTML=panelHTML(mySt,myBeast,myName+' (tú)','me');
  document.getElementById('f-opp').innerHTML=panelHTML(oppSt,oppBeast,oppName,'opp');
  if (window._isTeamBattle && window._myBench) { let benchHtml = '<div style="display:flex;gap:4px;margin-top:8px;justify-content:center;">'; window._myBench.forEach(b => { const beast = BEASTS[b.beast]; const opacity = b.isDead ? 0.3 : 1; const border = b.isActive ? '2px solid #4a9eff' : '0.5px solid rgba(255,255,255,.1)'; benchHtml += `<img src="${beast.img}" style="width:30px;height:30px;border:${border};border-radius:4px;opacity:${opacity}">`; }); benchHtml += '</div>'; document.getElementById('f-me').innerHTML += benchHtml; }
  const orb=document.getElementById('turn-orb'); if(orb) orb.style.display=yourTurn?'block':'none';
  const locked=!yourTurn||mySt.stun||mySt.recharge>0;
  let tb = yourTurn ? '<span>Tu turno</span>' : 'Turno del rival...';
  document.getElementById('turn-bar').innerHTML=tb;
  const b=BEASTS[myBeast];
  let switchBtnHtml = '';
  if (window._isTeamBattle && yourTurn && !locked) { const hasLivingBench = window._myBench.some(b => !b.isDead && !b.isActive); if (hasLivingBench) { switchBtnHtml = `<div style="grid-column:1/-1; margin-bottom:8px;"><button class="btn btn-sm" style="width:100%;background:rgba(130,80,180,.15);color:#CFA9EC" onclick="openSwitchMenu()">🔄 Cambiar Vicamon (Pierde turno)</button></div>`; } }
  document.getElementById('atk-grid').innerHTML= switchBtnHtml + b.attacks.map((a,i)=>{ const tags=[]; if(a.pierce) tags.push('<span class="atk-tag tag-pierce">Ignora escudo</span>'); if(a.fx==='double') tags.push('<span class="atk-tag tag-nobreak">Doble golpe</span>'); if(a.fx==='triple') tags.push('<span class="atk-tag tag-nobreak">Triple golpe</span>'); if(a.risk||a.self>0) tags.push(`<span class="atk-tag tag-risk">Riesgo${a.self>0?' -'+a.self+' HP':''}</span>`); if(a.buff) tags.push('<span class="atk-tag tag-buff">Buff</span>'); if(a.dot) tags.push('<span class="atk-tag tag-dot">Daño/turno</span>'); if(a.debuff) tags.push('<span class="atk-tag tag-debuff">Debuff</span>'); const currentPp = mySt.pp ? mySt.pp[i] : undefined; const maxPp = a.pp === undefined ? 99 : a.pp; const ppLeft = currentPp === undefined ? maxPp : currentPp; const isDisabled = locked || ppLeft <= 0; const ppText = maxPp === 99 ? '∞' : `${ppLeft}/${maxPp}`; return `<button class="atk-btn" ${isDisabled?'disabled':''} onclick="doAttack(${i})"><div class="atk-top"><div class="atk-name">${a.n}</div><div class="atk-dmg ${dmgClass(a)}">${dmgLabel(a)}</div></div><div class="atk-tags">${tags.join('')}</div><div class="atk-desc">${a.desc}</div><div style="display:flex;justify-content:space-between"><div class="atk-acc">${a.acc}% prec</div><div class="atk-acc">PP: ${ppText}</div></div></button>`; }).join('');
  if(logs&&logs.length){ const lb=document.getElementById('log-box'); lb.innerHTML=logs.map(l=>`<div class="ll lc-${l.c||'normal'}">${l.t}</div>`).join(''); lb.scrollTop=lb.scrollHeight; }
}
function doAttack(i){ animAttack('me'); try { const atk = BEASTS[myBeast].attacks[i]; if(atk.d === 0) playSfx('curacion'); else playSfx('ataque'); } catch(e) {} ws.send(JSON.stringify({type:'attack',battleId,index:i})); }
function leaveLobby(){ if(ws) ws.send(JSON.stringify({type:'leave_lobby'})); isKicked = true; if(ws) { try { ws.close(); } catch(e){} } ws = null; show('s-profile'); }
function backToLobby(){ updateLobbyBadge(); show('s-lobby'); }
document.getElementById('inp-name').addEventListener('keydown',e=>{if(e.key==='Enter')goProfile();});
