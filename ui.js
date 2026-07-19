function show(id){ document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); document.getElementById(id).classList.add('active'); if(id === 's-login' || id === 's-pick' || id === 's-lobby' || id === 's-profile' || id === 's-team-select' || id === 's-lab' || id === 's-tournament') playMusic('lobby'); if(id === 's-battle' || id === 's-result') playMusic('batalla'); }
function hpColor(pct){return pct>50?'#5DCAA5':pct>25?'#EF9F27':'#F0997B';}
function stTags(st,right=false){ let t=''; if(st.poisonTurns>0) t+=`<span class="stag" style="background:rgba(83,150,40,.3);color:#9ECC5A">☠×${st.poisonTurns}</span>`; if(st.burnTurns>0) t+=`<span class="stag" style="background:rgba(216,90,48,.3);color:#F0997B">🔥×${st.burnTurns}</span>`; if(st.shield>0) t+=`<span class="stag" style="background:rgba(55,138,221,.3);color:#85B7EB">🛡×${st.shield}</span>`; if(st.reflect50>0) t+=`<span class="stag" style="background:rgba(55,138,221,.2);color:#85B7EB">↩50%</span>`; if(st.stun) t+=`<span class="stag" style="background:rgba(212,83,126,.3);color:#ED93B1">💫stun</span>`; if(st.recharge>0) t+=`<span class="stag" style="background:rgba(136,135,128,.3);color:#B4B2A9">⚡×${st.recharge}</span>`; if(st.blind>0) t+=`<span class="stag" style="background:rgba(186,117,23,.3);color:#EF9F27">👁×${st.blind}</span>`; if(st.weakAtk>0) t+=`<span class="stag" style="background:rgba(15,110,86,.3);color:#5DCAA5">⬇atk×${st.weakAtk}</span>`; if(st.weaken>0) t+=`<span class="stag" style="background:rgba(15,110,86,.3);color:#5DCAA5">⬇dmg×${st.weaken}</span>`; if(st.analyzed>0) t+=`<span class="stag" style="background:rgba(130,80,180,.3);color:#CFA9EC">🔍×${st.analyzed}</span>`; return t; }
function panelHTML(st, bKey, label, side){ 
    let b;
    if (bKey === 'custom_lab_beast' && window._labBeastTemp) {
        b = window._labBeastTemp;
    } else {
        b = BEASTS[bKey] || {name:bKey,sub:'',img:'',el:'aire',style:'equilibrado'};
    }
    const pct=Math.max(0,st.hp/st.maxHp*100); const right=side==='opp'; 
    return `<div class="f-label">${label}</div><div class="f-sprite-wrap"><img class="f-sprite" id="spr-${side}" src="${b.img}" alt="${b.name}"></div><div class="f-name">${b.name}</div><div class="f-sub">${b.sub}</div><div class="hp-lbl">HP</div><div class="hp-wrap"><div class="hp-fill" id="hpbar-${side}" style="width:${pct.toFixed(1)}%;background:${hpColor(pct)}"></div></div><div class="hp-val" id="hpval-${side}">${Math.max(0,st.hp)} / ${st.maxHp}</div><div class="stags">${stTags(st,right)}</div>`; 
}
function dmgLabel(a){ if(a.fx==='chaos'||a.fx==='chaosHi') return '?? HP'; if(a.fx==='equalize') return 'ΔHP'; if(a.fx==='double') return `2×${a.d}`; if(a.fx==='triple') return `3×${a.d}`; if(a.d===0){ const map={heal20:'♥+20',heal30:'♥+30',fortress:'♥+15+🛡',shield2:'🛡×2',shield1r:'🛡+↩',reflect50:'↩50%',weaken:'⬇atk',analyze:'🔍+15%',purify:'✨cura',counter:'↩daño',swap:'⇄estados'}; return map[a.fx]||'—'; } if(a.fx==='drain10') return `15 HP (+10♥)`; return `${a.d} HP`; }
function dmgClass(a){ if(a.d===0) return 'dmg-zero'; const eff=a.fx==='double'?a.d*2:a.fx==='triple'?a.d*3:a.d; if(eff>=35) return 'dmg-high'; if(eff>=18) return 'dmg-mid'; return 'dmg-low'; }
function dmgLabelPick(a){ if(a.fx==='chaos'||a.fx==='chaosHi') return '?? HP'; if(a.fx==='equalize') return 'ΔHP'; if(a.fx==='double') return `2×${a.d}`; if(a.fx==='triple') return `3×${a.d}`; if(a.d===0){ const m={heal20:'♥+20',heal30:'♥+30',fortress:'♥+Escudo',shield2:'Escudo×2',shield1r:'Escudo+↩',reflect50:'↩50%',weaken:'⬇Atk rival',analyze:'🔍+15%dmg',purify:'✨Limpiar',counter:'↩Daño recv',swap:'⇄Estados'}; return m[a.fx]||'Buff'; } if(a.fx==='drain10') return `15 HP (+10♥)`; return `${a.d} HP`; }
function dmgClassPick(a){ if(a.d===0) return 'dmg-zero'; const e=a.fx==='double'?a.d*2:a.fx==='triple'?a.d*3:a.d; return e>=35?'dmg-high':e>=18?'dmg-mid':'dmg-low'; }

function buildBestiary(){ const allKeys=Object.entries(BEASTS); const keys=allKeys.filter(([k,b])=>b.cat!=='Físico'||myPhysicalBeasts.includes(k)); let html=''; const cats = {}; keys.forEach(([k,b])=>{ if(!cats[b.cat]) cats[b.cat] = []; cats[b.cat].push({k,b}); }); for(const catName in cats){ html += `<div style="grid-column:1/-1; margin-top:15px; border-bottom:0.5px solid rgba(255,255,255,.2); padding-bottom:5px; color:#CFA9EC; font-weight:600; text-transform:uppercase; letter-spacing:.08em; font-size:13px">✦ ${catName} Series</div>`; cats[catName].forEach(({k,b})=>{ html+=`<div class="bcard" id="bc-${k}" onclick="showBestiaryDetail('${k}')"><img src="${b.img}" alt="${b.name}"><div class="bname">${b.name}</div><div class="bsub">${b.sub}</div><span class="bstyle" style="${STCSS[b.style]}">${b.style}</span><div class="elbar" style="background:${EL[b.el]}"></div></div>`; }); } html+=`<div class="beast-detail" id="bestiary-detail-panel"></div>`; document.getElementById('bestiary-grid').innerHTML=html; }
function showBestiaryDetail(k){ const b=BEASTS[k]; const panel=document.getElementById('bestiary-detail-panel'); const statData={atk:{aries:70,tauro:55,geminis:65,cancer:45,leo:70,virgo:60,libra:62,escorpio:65,sagitario:68,capricornio:50,acuario:72,piscis:58},def:{aries:30,tauro:90,geminis:50,cancer:95,leo:65,virgo:70,libra:62,escorpio:55,sagitario:55,capricornio:92,acuario:45,piscis:68},spd:{aries:90,tauro:30,geminis:80,cancer:40,leo:70,virgo:65,libra:62,escorpio:70,sagitario:75,capricornio:35,acuario:85,piscis:60}}; const atksHtml=b.attacks.map(a=>{ const tags=[]; if(a.pierce) tags.push('<span class="atk-tag tag-pierce">Ignora escudo</span>'); if(a.fx==='double') tags.push('<span class="atk-tag tag-nobreak">Doble golpe</span>'); if(a.fx==='triple') tags.push('<span class="atk-tag tag-nobreak">Triple golpe</span>'); if(a.risk||a.self>0) tags.push(`<span class="atk-tag tag-risk">Riesgo${a.self>0?' -'+a.self+' HP':''}</span>`); if(a.buff) tags.push('<span class="atk-tag tag-buff">Buff</span>'); if(a.dot) tags.push('<span class="atk-tag tag-dot">Daño/turno</span>'); if(a.debuff) tags.push('<span class="atk-tag tag-debuff">Debuff</span>'); const ppText = a.pp === 99 || a.pp === undefined ? 'PP: ∞' : `PP: ${a.pp}`; return `<div class="bd-atk"><div class="bd-atk-top"><span class="bd-atk-name">${a.n}</span><span class="bd-atk-dmg ${dmgClassPick(a)}">${dmgLabelPick(a)}</span></div>${tags.length?`<div class="bd-atk-tags">${tags.join('')}</div>`:''}<div class="bd-atk-desc">${a.desc}</div><div style="display:flex;justify-content:space-between;align-items:center"><div class="bd-atk-acc">${a.acc}% precisión</div><div class="bd-atk-pp">${ppText}</div></div></div>`; }).join(''); panel.innerHTML=`<div class="bd-left"><img src="${b.img}" alt="${b.name}"><div class="bd-name">${b.name}</div><div class="bd-sub">${b.sub}</div><div class="bd-stats"><div class="bd-stat"><div class="bd-stat-val">${b.stats?b.stats.atk:(statData.atk[k]||'—')}</div><div class="bd-stat-lbl">ATK</div></div><div class="bd-stat"><div class="bd-stat-val">${b.stats?b.stats.def:(statData.def[k]||'—')}</div><div class="bd-stat-lbl">DEF</div></div><div class="bd-stat"><div class="bd-stat-val">${b.stats?b.stats.spd:(statData.spd[k]||'—')}</div><div class="bd-stat-lbl">VEL</div></div></div></div><div class="bd-attacks">${atksHtml}</div>`; panel.classList.add('open'); panel.scrollIntoView({behavior:'smooth',block:'nearest'}); }

function toggleEditName() { const box = document.getElementById('edit-name-box'); const input = document.getElementById('inp-edit-name'); if (box.style.display === 'none' || box.style.display === '') { input.value = myName; box.style.display = 'block'; } else { box.style.display = 'none'; } }
function saveNickname() { const newName = document.getElementById('inp-edit-name').value.trim(); if (!newName) return alert('Ingresa un nombre válido'); myName = newName; localStorage.setItem('vicamon_nick', myName); document.getElementById('profile-name').textContent = myName; document.getElementById('edit-name-box').style.display = 'none'; if (ws && ws.readyState === 1) ws.send(JSON.stringify({type:'update_nickname', name: myName})); updateLobbyBadge(); }

function openChallengeMenu(targetId, name, isTrain) { 
  pendingChallengeTargetId = targetId; 
  pendingIsTraining = isTrain; 
  isGauntletChallenge = false; 
  isBoardChallenge = false; 
  const title = isTrain ? `Entrenar con ${name}` : `Batalla por HP con ${name}`; 
  let buttonsHtml = ''; 
  if (isGuest && !isTrain) { alert('Los invitados solo pueden entrenar. Conecta tu wallet para batallas por HP.'); return; } 
  if (isTrain) { 
    buttonsHtml += `<button class="btn btn-blue" style="width:100%;margin-bottom:10px" onclick="selectChallengeMode('train')">🤝 Entrenar 1 vs 1 (XP)</button>`; 
    buttonsHtml += `<button class="btn btn-blue" style="width:100%" onclick="selectChallengeMode('train3v3')">🤝 Entrenar 3 vs 3 (XP)</button>`; 
  } else { 
    buttonsHtml += `<button class="btn btn-blue" style="width:100%;margin-bottom:10px" ${myCurrentHP < 100 ? 'disabled' : ''} onclick="selectChallengeMode('1v1')">⚔️ 1 vs 1 (Recompensa 100 HP)</button>`; 
    buttonsHtml += `<button class="btn btn-blue" style="width:100%" ${myCurrentHP < 300 ? 'disabled' : ''} onclick="selectChallengeMode('3v3')">⚔️ 3 vs 3 (Recompensa 300 HP)</button>`; 
  } 
  const modal = document.getElementById('modal-challenge-mode'); 
  modal.innerHTML = `<div class="modal" style="max-width:350px"><h3 style="margin-bottom:20px">${title}</h3><div style="display:flex;flex-direction:column;gap:5px">${buttonsHtml}</div><button class="btn btn-sm btn-red" style="margin-top:20px;width:100%" onclick="document.getElementById('modal-challenge-mode').classList.add('hidden')">Cancelar</button></div>`; 
  modal.classList.remove('hidden'); 
}

function openMasterMenu() {
  const modal = document.getElementById('modal-master-menu');
  if (!document.getElementById('btn-test-board')) {
    const boardBtn = document.createElement('button');
    boardBtn.id = 'btn-test-board';
    boardBtn.className = 'btn btn-blue';
    boardBtn.style.width = '100%';
    boardBtn.textContent = '♟️ Probar Modo Tablero (CPU)';
    boardBtn.onclick = () => {
      document.getElementById('modal-master-menu').classList.add('hidden');
      isGauntletChallenge = false;
      isBoardChallenge = true; 
      teamSelectionMode = '3v3'; 
      pendingChallengeTargetId = null;
      pendingIsTraining = true;
      selectedTeam = [];
      document.getElementById('ts-mode-title').textContent = 'Modo Tablero (Elige 3)';
      buildTeamPickGrid();
      show('s-team-select');
    };
    modal.querySelector('.modal').insertBefore(boardBtn, modal.querySelector('.btn-red'));
  }
  modal.classList.remove('hidden');
}

function selectChallengeMode(mode) { 
  document.getElementById('modal-challenge-mode').classList.add('hidden'); 
  document.getElementById('modal-master-menu').classList.add('hidden'); 
  isBoardChallenge = false; 
  teamSelectionMode = (mode === '3v3' || mode === 'train3v3') ? '3v3' : '1v1'; 
  pendingIsTraining = (mode === 'train' || mode === 'train3v3'); 
  selectedTeam = []; 
  const titleEl = document.getElementById('ts-mode-title'); 
  const isMaster = (pendingChallengeTargetId === null); 
  if(teamSelectionMode === '1v1') titleEl.textContent = (isMaster || pendingIsTraining) ? 'Entrenamiento: 1 vs 1 (Elige 1)' : 'Batalla por HP: 1 vs 1 (Elige 1)'; 
  if(teamSelectionMode === '3v3') titleEl.textContent = (isMaster || pendingIsTraining) ? 'Entrenamiento: 3 vs 3 (Elige 3)' : 'Batalla por HP: 3 vs 3 (Elige 3)'; 
  buildTeamPickGrid(); 
  show('s-team-select'); 
}

function buildTeamPickGrid() { const allKeys=Object.entries(BEASTS); const keys=allKeys.filter(([k,b])=>b.cat!=='Físico'||myPhysicalBeasts.includes(k)); let html=''; keys.forEach(([k,b])=>{ html+=`<div class="bcard" id="tpc-${k}" onclick="toggleTeamBeast('${k}')"><img src="${b.img}" alt="${b.name}"><div class="bname">${b.name}</div><div class="bsub">${b.sub}</div><span class="bstyle" style="${STCSS[b.style]}">${b.style}</span><div class="elbar" style="background:${EL[b.el]}"></div></div>`; }); html+=`<div class="beast-detail" id="team-detail-panel"></div>`; document.getElementById('team-pick-grid').innerHTML=html; updateTeamSelectionUI(); }
function toggleTeamBeast(k) { const maxPicks = teamSelectionMode === '3v3' ? 3 : 1; const idx = selectedTeam.indexOf(k); if(idx > -1) { selectedTeam.splice(idx, 1); } else { if(selectedTeam.length >= maxPicks) { alert(`Ya elegiste ${maxPicks} Vicamons.`); return; } selectedTeam.push(k); } updateTeamSelectionUI(); }
function updateTeamSelectionUI() { const maxPicks = teamSelectionMode === '3v3' ? 3 : 1; document.querySelectorAll('#team-pick-grid .bcard').forEach(c => c.classList.remove('sel')); selectedTeam.forEach((k, i) => { const card = document.getElementById('tpc-'+k); if(card) { card.classList.add('sel'); let badge = card.querySelector('.team-badge'); if(!badge) { badge = document.createElement('div'); badge.className = 'team-badge'; badge.style.cssText = 'position:absolute;top:2px;right:2px;background:#4a9eff;color:#fff;width:16px;height:16px;border-radius:50%;font-size:10px;display:flex;align-items:center;justify-content:center;font-weight:bold'; card.appendChild(badge); } badge.textContent = i + 1; } }); document.querySelectorAll('#team-pick-grid .bcard').forEach(c => { if(!c.classList.contains('sel')) { const badge = c.querySelector('.team-badge'); if(badge) badge.remove(); } }); document.getElementById('btn-confirm-team').disabled = selectedTeam.length !== maxPicks; }
function cancelTeamSelection() { if(pendingFrom !== null) { ws.send(JSON.stringify({type:'reject_challenge', fromId: pendingFrom})); pendingFrom = null; } isGauntletChallenge = false; isBoardChallenge = false; show('s-lobby'); }

function confirmTeam() { 
  if (isGauntletChallenge) { 
    myBeast = selectedTeam[0]; 
    ws.send(JSON.stringify({type:'challenge_gauntlet', beast: myBeast, towerMode: window._pendingTowerMode || 'hp'})); 
    isGauntletChallenge = false; 
    window._pendingTowerMode = null;
    show('s-lobby'); 
    return; 
  } 
  if (isBoardChallenge) { 
    myTeam = selectedTeam.slice();
    ws.send(JSON.stringify({type:'challenge_board_cpu', team: myTeam}));
    isBoardChallenge = false;
    show('s-lobby'); 
    return;
  }
  let isTraining; 
  if (pendingFrom !== null) { isTraining = pendingIsTraining; } else { isTraining = pendingIsTraining || pendingChallengeTargetId === null; } 
  const mode3v3 = teamSelectionMode === '3v3'; 
  if(mode3v3) { myTeam = selectedTeam.slice(); } else { myBeast = selectedTeam[0]; myTeam = [myBeast]; } 
  if(ws && ws.readyState === 1) { if(!mode3v3) ws.send(JSON.stringify({type:'change_beast', beast: myBeast})); } 
  if(pendingFrom !== null) { if(mode3v3) ws.send(JSON.stringify({type:'accept_3v3', fromId: pendingFrom, team: myTeam, isTraining: isTraining})); else ws.send(JSON.stringify({type:'accept', fromId: pendingFrom, isTraining: isTraining})); pendingFrom = null; pendingIs3v3 = false; pendingIsTraining = false; } 
  else if(pendingChallengeTargetId !== null) { if(mode3v3 && isTraining) ws.send(JSON.stringify({type:'challenge_3v3_training', targetId: pendingChallengeTargetId, team: myTeam})); else if(mode3v3) ws.send(JSON.stringify({type:'challenge_3v3', targetId: pendingChallengeTargetId, team: myTeam})); else if(isTraining) ws.send(JSON.stringify({type:'challenge_training', targetId: pendingChallengeTargetId})); else ws.send(JSON.stringify({type:'challenge', targetId: pendingChallengeTargetId})); pendingChallengeTargetId = null; pendingIsTraining = false; } 
  else if(isTraining) { if(mode3v3) ws.send(JSON.stringify({type:'challenge_3v3_cpu', team: myTeam})); else ws.send(JSON.stringify({type:'challenge_cpu'})); } 
  show('s-lobby'); 
}

function openTowerMenu() {
  const modal = document.getElementById('modal-tower-menu');
  const hpBtn = document.getElementById('btn-tower-hp');
  const trainBtn = document.getElementById('btn-tower-train');
  const guestBtn = document.getElementById('btn-tower-guest');
  
  hpBtn.style.display = 'none';
  trainBtn.style.display = 'none';
  guestBtn.style.display = 'none';
  
  if (isGuest) {
    guestBtn.style.display = 'flex';
  } else {
    hpBtn.style.display = 'flex';
    trainBtn.style.display = 'flex';
  }
  
  modal.classList.remove('hidden');
  
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({type:'get_tower_status'}));
  }
}

function challengeGauntlet(towerMode) { 
  document.getElementById('modal-tower-menu').classList.add('hidden');
  document.getElementById('modal-master-menu').classList.add('hidden');
  if(!ws || ws.readyState !== 1) return alert('Conectando...'); 
  if(towerMode === 'hp' && myCurrentHP < 100) return alert('Necesitas al menos 100 HP.');
  
  let msgText = '';
  if(towerMode === 'hp') msgText = '¿Iniciar Torre por HP? (Inviertes 100 HP)';
  else if(towerMode === 'training') msgText = '¿Iniciar Torre de Entrenamiento?';
  else msgText = '¿Iniciar Torre (Invitado)?';
  
  if(!confirm(msgText)) return; 
  isGauntletChallenge = true; 
  isBoardChallenge = false;
  teamSelectionMode = '1v1'; 
  document.getElementById('ts-mode-title').textContent = 'Torre de Batalla (Elige tu inicial)'; 
  selectedTeam = []; 
  buildTeamPickGrid(); 
  show('s-team-select'); 
  
  window._pendingTowerMode = towerMode;
}

function continueGauntlet() { document.getElementById('modal-gauntlet').classList.add('hidden'); const beastToUse = gauntletSelectedBeast || myBeast; ws.send(JSON.stringify({type:'gauntlet_continue', battleId: gauntletBattleId, beast: beastToUse})); myBeast = beastToUse; }
function selectGauntletBeast(k) { gauntletSelectedBeast = k; document.querySelectorAll('#g-beast-picker .bcard').forEach(c=>c.classList.remove('sel')); document.getElementById('gbc-'+k)?.classList.add('sel'); }
function surrender() { if(!confirm('¿Rendirte?')) return; if(ws && ws.readyState === 1) ws.send(JSON.stringify({type:'surrender', battleId})); }

function openSwitchMenu(reason = 'Elige tu siguiente Vicamon.') { const bench = window._myBench || []; let html = `<div class="modal" style="max-width:400px"><h3>Cambiar Vicamon</h3><p style="font-size:12px;color:#F0997B;margin-bottom:15px">${reason}</p><div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">`; bench.forEach((b, i) => { if (b.isDead || b.isActive) return; const beast = BEASTS[b.beast]; html += `<div class="bcard" style="width:100px;cursor:pointer" onclick="executeSwitch(${i})"><img src="${beast.img}" style="width:60px;height:60px"><div class="bname">${beast.name}</div><div style="font-size:10px;color:#5DCAA5">${b.state.hp} HP</div></div>`; }); html += `</div></div>`; let modalBg = document.getElementById('modal-switch'); if(!modalBg) { modalBg = document.createElement('div'); modalBg.className = 'modal-bg'; modalBg.id = 'modal-switch'; document.body.appendChild(modalBg); } modalBg.innerHTML = html; modalBg.classList.remove('hidden'); }
function executeSwitch(index) { const modalBg = document.getElementById('modal-switch'); if(modalBg) modalBg.classList.add('hidden'); ws.send(JSON.stringify({type:'team_switch', battleId, index})); }

function animHit(side, dmg){ const spr=document.getElementById('spr-'+side); if(!spr) return; spr.classList.remove('anim-hit','anim-attack'); void spr.offsetWidth; spr.classList.add('anim-hit'); const wrap=spr.closest('.f-sprite-wrap'); const fl=document.createElement('div'); fl.className='dmg-float'; fl.textContent='-'+dmg; fl.style.color='#F0997B'; wrap.appendChild(fl); playSfx('ataque'); setTimeout(()=>{spr.classList.remove('anim-hit');fl.remove();},800); }
function animAttack(side){ const spr=document.getElementById('spr-'+side); if(!spr) return; spr.classList.remove('anim-attack'); void spr.offsetWidth; spr.classList.add('anim-attack'); setTimeout(()=>spr.classList.remove('anim-attack'),400); }

function updateLobbyBadge(){ 
  document.getElementById('lbl-myname').textContent=myName; 
  const hpEl = document.getElementById('lbl-myhp'); 
  if(hpEl) hpEl.textContent = isGuest ? 'Invitado' : (myCurrentHP + ' HP'); 
  const b = BEASTS[myBeast] || BEASTS['aries']; 
  const badgeImg = document.getElementById('badge-img'); 
  if(badgeImg) { badgeImg.src=b.img; badgeImg.style.display='block'; } 
  const cashoutBtnLobby = document.getElementById('btn-cashout-lobby');
  if(cashoutBtnLobby) {
    cashoutBtnLobby.style.display = (myCurrentHP > 0 && !isGuest) ? 'inline-block' : 'none';
  }
}

var _lastLobbyPlayers=[]; function renderLobbyFromCache(){ renderLobby(_lastLobbyPlayers); }
function renderLobby(others){ _lastLobbyPlayers=others; const list=document.getElementById('players-list'); const myHp=myCurrentHP; const hpWarnEl=document.getElementById('low-hp-warning'); if(hpWarnEl) { hpWarnEl.style.display = 'block'; const warnMsg = hpWarnEl.querySelector('div:first-child'); if (warnMsg) warnMsg.style.display = (!isGuest && myHp < 100) ? 'block' : 'none'; } document.getElementById('guest-lobby-banner').style.display = isGuest ? 'flex' : 'none'; if(!others.length){list.innerHTML='<p class="empty-lobby">No hay otros jugadores...</p>';return;} list.innerHTML=others.map(p=>{ const b=BEASTS[p.beast]||{name:p.beast,img:''}; const rivalHp=p.hp||0; const isTargetGuest = p.isGuest || false; const canChallengeHP = !isGuest && !isTargetGuest && myHp >= 100 && rivalHp >= 100; const hpColor=rivalHp>=100?'#5DCAA5':'#F0997B'; const hpText = isTargetGuest ? 'Invitado' : `${rivalHp} HP`; return `<div class="p-row"><div class="p-info"><img class="p-img" src="${b.img}"><div><div class="p-name">${p.name}</div><div class="p-beast">${b.name} · <span style="color:${hpColor};font-size:10px">${hpText}</span></div></div></div><div style="display:flex;gap:6px"><button class="btn btn-sm" style="background:rgba(130,80,180,.15);border:1px solid rgba(130,80,180,.35);color:#CFA9EC" onclick="openChallengeMenu(${p.id},'${p.name}', true)">🤝 Entrenar</button><button class="btn btn-blue btn-sm" ${canChallengeHP?'':'disabled'} onclick="openChallengeMenu(${p.id},'${p.name}', false)">⚔️ Batalla HP</button></div></div>`; }).join(''); }

function challengeMaster(){ if(!ws || ws.readyState !== 1) return; openChallengeMenu(null, 'Zodiac Master', true); }
function acceptChallenge(){ document.getElementById('modal-challenged').classList.add('hidden'); stopChallengeBeep(); if(pendingFrom===null) return; if(isGuest && !pendingIsTraining) { alert('Los invitados solo pueden aceptar entrenamientos. Conecta tu wallet para batallas por HP.'); rejectChallenge(); return; } teamSelectionMode = pendingIs3v3 ? '3v3' : '1v1'; selectedTeam = []; const title = (pendingIs3v3 ? '3 vs 3' : '1 vs 1') + (pendingIsTraining ? ' (Entrenamiento)' : ' (Batalla por HP)'); document.getElementById('ts-mode-title').textContent = title; buildTeamPickGrid(); show('s-team-select'); }

// FIX: Enviar el ID del retador al servidor al rechazar
function rejectChallenge(){ 
    document.getElementById('modal-challenged').classList.add('hidden'); 
    stopChallengeBeep(); 
    if(pendingFrom !== null) { 
        ws.send(JSON.stringify({type:'reject_challenge', fromId: pendingFrom})); 
        pendingFrom = null; 
    }
    pendingIsTraining=false; pendingIs3v3=false; 
}

function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
function sendChatMessage(){ const input = document.getElementById('chat-input'); const msg = input.value.trim(); if(msg && ws && ws.readyState === 1){ ws.send(JSON.stringify({type:'chat_message', text:msg})); input.value = ''; } }
function handleChatMessage(m){ const chatBox = document.getElementById('chat-box'); if(chatBox.querySelector('.chat-empty')) chatBox.innerHTML = ''; const msgDiv = document.createElement('div'); msgDiv.className = 'chat-msg'; msgDiv.innerHTML = `<span class="chat-name">${escapeHtml(m.name)}:</span> <span style="color:rgba(255,255,255,.8)">${escapeHtml(m.text)}</span>`; chatBox.appendChild(msgDiv); chatBox.scrollTop = chatBox.scrollHeight; }
function renderLeaderboard(top) { const podium = document.getElementById('leaderboard-podium'); if (!top || top.length === 0) { podium.innerHTML = '<div style="flex:1;color:rgba(255,255,255,.3);text-align:center;font-size:11px;padding:20px 0">Gana batallas reales para aparecer aquí</div>'; return; } podium.innerHTML = top.map((p, i) => { const medals = ['🥇', '🥈', '🥉']; const colors = ['#F5A623', '#C0C0C0', '#CD7F32']; return `<div style="flex:1;background:rgba(255,255,255,.04);border:0.5px solid ${colors[i]};border-radius:10px;padding:10px 6px;text-align:center"><div style="font-size:20px">${medals[i]}</div><div style="font-size:12px;font-weight:700">${p.last_name || 'Anónimo'}</div><div style="font-size:9px;color:rgba(255,255,255,.5)">${p.wins}V · ${p.losses}D</div></div>`; }).join(''); }

function renderBattle(yourTurn, logs){ 
    document.getElementById('f-me').innerHTML=panelHTML(mySt,myBeast,myName+' (tú)','me'); 
    document.getElementById('f-opp').innerHTML=panelHTML(oppSt,oppBeast,oppName,'opp'); 
    if (window._isTeamBattle && window._myBench) { let benchHtml = '<div style="display:flex;gap:4px;margin-top:8px;justify-content:center;">'; window._myBench.forEach(b => { const beast = BEASTS[b.beast]; const opacity = b.isDead ? 0.3 : 1; const border = b.isActive ? '2px solid #4a9eff' : '0.5px solid rgba(255,255,255,.1)'; benchHtml += `<img src="${beast.img}" style="width:30px;height:30px;border:${border};border-radius:4px;opacity:${opacity}">`; }); benchHtml += '</div>'; document.getElementById('f-me').innerHTML += benchHtml; } 
    const orb=document.getElementById('turn-orb'); if(orb) orb.style.display=yourTurn?'block':'none'; const locked=!yourTurn||mySt.stun||mySt.recharge>0; let tb = yourTurn ? '<span>Tu turno</span>' : 'Turno del rival...'; document.getElementById('turn-bar').innerHTML=tb; 
    
    const b = (myBeast === 'custom_lab_beast' && window._labBeastTemp) ? window._labBeastTemp : BEASTS[myBeast];
    
    let switchBtnHtml = ''; 
    if (window._isTeamBattle && yourTurn && !locked) { const hasLivingBench = window._myBench.some(b => !b.isDead && !b.isActive); if (hasLivingBench) { switchBtnHtml = `<div style="grid-column:1/-1; margin-bottom:8px;"><button class="btn btn-sm" style="width:100%;background:rgba(130,80,180,.15);color:#CFA9EC" onclick="openSwitchMenu()">🔄 Cambiar Vicamon (Pierde turno)</button></div>`; } } 
    document.getElementById('atk-grid').innerHTML= switchBtnHtml + b.attacks.map((a,i)=>{ const tags=[]; if(a.pierce) tags.push('<span class="atk-tag tag-pierce">Ignora escudo</span>'); if(a.fx==='double') tags.push('<span class="atk-tag tag-nobreak">Doble golpe</span>'); if(a.fx==='triple') tags.push('<span class="atk-tag tag-nobreak">Triple golpe</span>'); if(a.risk||a.self>0) tags.push(`<span class="atk-tag tag-risk">Riesgo${a.self>0?' -'+a.self+' HP':''}</span>`); if(a.buff) tags.push('<span class="atk-tag tag-buff">Buff</span>'); if(a.dot) tags.push('<span class="atk-tag tag-dot">Daño/turno</span>'); if(a.debuff) tags.push('<span class="atk-tag tag-debuff">Debuff</span>'); const currentPp = mySt.pp ? mySt.pp[i] : undefined; const maxPp = a.pp === undefined ? 99 : a.pp; const ppLeft = currentPp === undefined ? maxPp : currentPp; const isDisabled = locked || ppLeft <= 0; const ppText = maxPp === 99 ? '∞' : `${ppLeft}/${maxPp}`; return `<button class="atk-btn" ${isDisabled?'disabled':''} onclick="doAttack(${i})"><div class="atk-top"><div class="atk-name">${a.n}</div><div class="atk-dmg ${dmgClass(a)}">${dmgLabel(a)}</div></div><div class="atk-tags">${tags.join('')}</div><div class="atk-desc">${a.desc}</div><div style="display:flex;justify-content:space-between"><div class="atk-acc">${a.acc}% prec</div><div class="atk-acc">PP: ${ppText}</div></div></button>`; }).join(''); 
    if(logs&&logs.length){ const lb=document.getElementById('log-box'); lb.innerHTML=logs.map(l=>`<div class="ll lc-${l.c||'normal'}">${l.t}</div>`).join(''); lb.scrollTop=lb.scrollHeight; } 
}
function doAttack(i){ animAttack('me'); try { const b = (myBeast === 'custom_lab_beast' && window._labBeastTemp) ? window._labBeastTemp : BEASTS[myBeast]; const atk = b.attacks[i]; if(atk.d === 0) playSfx('curacion'); else playSfx('ataque'); } catch(e) {} ws.send(JSON.stringify({type:'attack',battleId,index:i})); }
function leaveLobby(){ if(ws) ws.send(JSON.stringify({type:'leave_lobby'})); isKicked = true; if(ws) { try { ws.close(); } catch(e){} } ws = null; isGuest = false; show('s-login'); }
function backToLobby(){ updateLobbyBadge(); show('s-lobby'); }
