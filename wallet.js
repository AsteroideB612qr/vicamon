var myWallet = '';
var myCurrentHP = 0;
var isGuest = false;
var myPhysicalBeasts = [];
var myStats = { wins: 0, losses: 0, rank: null };
var platformWalletAddress = ''; 

async function fetchPlatformWallet() { try { const res = await fetch('/platform-wallet'); const data = await res.json(); if (data.wallet) { platformWalletAddress = data.wallet; const loginWalletSpan = document.querySelector('#step-charge div[onclick="copyWallet()"] span'); if (loginWalletSpan) loginWalletSpan.textContent = platformWalletAddress; } } catch(e) { console.error("Error cargando wallet de plataforma:", e); } }

function playAsGuest() { myWallet = 'guest_' + Math.random().toString(36).substring(2, 8); isGuest = true; myCurrentHP = 0; document.getElementById('btn-phantom').style.display = 'none'; document.getElementById('btn-guest').style.display = 'none'; document.getElementById('wallet-connected').style.display = 'none'; document.getElementById('no-phantom').style.display = 'none'; document.getElementById('step-charge').style.display = 'none'; const sn = document.getElementById('step-name'); if(sn){ sn.style.opacity='1'; sn.style.pointerEvents='auto'; } document.getElementById('inp-name').focus(); }

async function disconnectWallet() { 
  try { const phantom = getPhantom(); if (phantom && phantom.isConnected) await phantom.disconnect(); } catch(e) {} 
  myWallet = ''; myName = ''; myBeast = ''; isGuest = false; 
  myPhysicalBeasts = []; localStorage.removeItem('vicamon_physical_codes');
  if(typeof ws !== 'undefined' && ws) { try { ws.close(); } catch(e){} } 
  document.getElementById('btn-phantom').style.display='flex'; document.getElementById('btn-guest').style.display='flex'; document.getElementById('wallet-connected').style.display='none'; document.getElementById('no-phantom').style.display='none'; document.getElementById('inp-name').value = ''; show('s-login'); 
}

function copyWallet() { if (!platformWalletAddress) return alert('La wallet no se ha cargado aún.'); navigator.clipboard.writeText(platformWalletAddress).then(() => { alert('¡Dirección copiada! Envía USDC a esa wallet.'); }).catch(() => alert('Dirección: ' + platformWalletAddress)); }

function depositWidgetHTML() { if (isGuest) return ''; const walletAddr = platformWalletAddress || 'Cargando...'; return `<div style="background:rgba(74,158,255,.06);border:0.5px solid rgba(74,158,255,.2);border-radius:10px;padding:10px 12px"><div style="font-size:11px;color:#85B7EB;margin-bottom:4px">💡 Deposita USDC para obtener HP</div><div style="font-size:10px;color:rgba(255,255,255,.4);margin-bottom:7px">0.10 USDC = 100 HP · cualquier monto funciona</div><div style="display:flex;gap:6px;align-items:center"><div style="flex:1;background:rgba(0,0,0,.35);border-radius:6px;padding:6px 8px;font-family:monospace;font-size:9px;color:#85B7EB;word-break:break-all;cursor:pointer" onclick="copyWallet()">${walletAddr} <span style="color:rgba(255,255,255,.3)">📋</span></div><button class="btn btn-sm" style="font-size:10px;white-space:nowrap;padding:5px 10px" onclick="checkHPNow()">Verificar HP</button></div></div>`; }

function getPhantom() { return window.phantom?.solana || window.solana || null; }

async function connectPhantom() {
  await new Promise(r => setTimeout(r, 100));
  const phantom = getPhantom();
  if (!phantom || !phantom.isPhantom) {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent); 
    if (isMobile) { 
      // NUEVO: Usar el modal universal en móvil
      document.getElementById('mobile-url-display').textContent = window.location.href;
      document.getElementById('modal-mobile-connect').classList.remove('hidden');
      return; 
    }
    // Escritorio sin Phantom
    document.getElementById('no-phantom').style.display='block'; 
    document.getElementById('no-phantom').innerHTML = 'Phantom no detectado. <a href="https://phantom.app" target="_blank" style="color:#F0997B;text-decoration:underline">Instalalo aqui</a>.'; 
    document.getElementById('btn-phantom').style.display='none'; 
    document.getElementById('btn-guest').style.display='none'; 
    return;
  }
  try {
    const resp = await phantom.connect(); const wasGuest = isGuest; myWallet = resp.publicKey.toString(); isGuest = false; 
    document.getElementById('btn-phantom').style.display='none'; document.getElementById('btn-guest').style.display='none'; document.getElementById('wallet-connected').style.display='block'; document.getElementById('wallet-addr').textContent = myWallet.slice(0,8)+'...'+myWallet.slice(-6); document.getElementById('wallet-hp').textContent = 'Verificando...'; const sn = document.getElementById('step-name'); if(sn){ sn.style.opacity='1'; sn.style.pointerEvents='auto'; }
    if (wasGuest) { if (typeof ws !== 'undefined' && ws) { try { ws.close(); } catch(e) {} } connectWS(); } else { await checkHPNow(true); const savedName = localStorage.getItem('vicamon_nick'); if (savedName) { document.getElementById('inp-name').value = savedName; goProfile(); } }
  } catch(e) { console.error('Phantom error:', e); alert('No se pudo conectar Phantom.'); }
}

// NUEVAS: Funciones para el modal móvil
function openPhantomApp() {
  // Cerrar sesión de invitado para evitar duplicados en el servidor
  if(isGuest && typeof ws !== 'undefined' && ws) { 
    try { ws.close(); } catch(e) {} 
  }
  const currentUrl = window.location.href;
  const deepLink = `https://phantom.app/ul/browse/${currentUrl}`;
  window.location.href = deepLink;
}

function closeMobileConnectModal() {
  document.getElementById('modal-mobile-connect').classList.add('hidden');
}

function copyText(text) { navigator.clipboard.writeText(text).then(() => alert('¡Enlace copiado!')).catch(() => alert('Copia este enlace manualmente: ' + text)); }

window.addEventListener('load', async () => { 
  const btnG = document.getElementById('btn-gauntlet'); 
  if (btnG) { btnG.style.display = GAUNTLET_HABILITADO ? 'inline-block' : 'none'; btnG.disabled = true; }
  await fetchPlatformWallet(); 
  await new Promise(r => setTimeout(r, 500)); const ph2 = getPhantom(); if (ph2?.isPhantom && ph2.isConnected) { try { const r2 = await ph2.connect({ onlyIfTrusted: true }); myWallet = r2.publicKey.toString(); isGuest = false; document.getElementById('btn-phantom').style.display='none'; document.getElementById('btn-guest').style.display='none'; document.getElementById('wallet-connected').style.display='block'; document.getElementById('wallet-addr').textContent = myWallet.slice(0,8)+'...'+myWallet.slice(-6); document.getElementById('wallet-hp').textContent = 'Verificando...'; await checkHPNow(true); const savedName = localStorage.getItem('vicamon_nick'); if (savedName) { document.getElementById('inp-name').value = savedName; goProfile(); } } catch(e) {} } 
});

async function checkHPNow(fromConnect=false) { if (!myWallet || isGuest) return; try { const res = await fetch('/hp?wallet='+myWallet); const data = await res.json(); const hp = data.hp || 0; const loginHp = document.getElementById('wallet-hp'); if(loginHp){ loginHp.textContent=hp+' HP'; loginHp.style.color=hp>=100?'#5DCAA5':'#EF9F27'; } updateHPDisplay(hp); if (data.stats) updateProfileUI(data.stats); if(document.getElementById('s-lobby').classList.contains('active') && ws){ ws.send(JSON.stringify({type:'ping'})); } if (hp >= 100) { document.getElementById('step-charge').style.display='none'; document.getElementById('step-name').style.opacity='1'; document.getElementById('step-name').style.pointerEvents='auto'; } else { document.getElementById('step-charge').style.display='block'; document.getElementById('step-name').style.opacity='1'; document.getElementById('step-name').style.pointerEvents='auto'; } } catch(e) { document.getElementById('wallet-hp').textContent = 'Error'; } }

function updateProfileUI(stats) { if (stats) myStats = stats; const nameEl = document.getElementById('profile-name'); if (nameEl) { nameEl.textContent = myName || 'Jugador'; document.getElementById('profile-wallet').textContent = isGuest ? 'Modo Invitado (Sin Wallet)' : (myWallet ? myWallet.slice(0,8)+'...'+myWallet.slice(-6) : 'Desconectado'); document.getElementById('profile-wallet-box').style.display = isGuest ? 'none' : 'block'; document.getElementById('profile-wins').textContent = myStats.wins || 0; document.getElementById('profile-losses').textContent = myStats.losses || 0; document.getElementById('profile-rank').textContent = myStats.rank ? '#' + myStats.rank : 'Sin clasificado'; document.getElementById('guest-upgrade-banner').style.display = isGuest ? 'block' : 'none'; } }

function updateHPDisplay(hp){ if(isGuest) hp = 0; myCurrentHP = hp || 0; const el=document.getElementById('pick-hp-val'); if(el){ el.textContent=hp+' HP'; el.style.color=hp>=100?'#5DCAA5':'#EF9F27'; } const loginHp=document.getElementById('wallet-hp'); if(loginHp){ loginHp.textContent=hp+' HP'; loginHp.style.color=hp>=100?'#5DCAA5':'#EF9F27'; } const profHp=document.getElementById('profile-hp'); if(profHp){ profHp.textContent=hp+' HP'; profHp.style.color=hp>=100?'#5DCAA5':'#EF9F27'; } const profUsdc=document.getElementById('profile-usdc'); if(profUsdc){ profUsdc.textContent=(hp*0.001).toFixed(3)+' USDC'; } const btn=document.getElementById('btn-cashout'); if(btn){ btn.style.display=hp>0 && !isGuest?'inline-block':'none'; btn.disabled=false; btn.textContent='💰 Cashout'; } const btnG = document.getElementById('btn-gauntlet'); if (btnG && typeof GAUNTLET_HABILITADO !== 'undefined') { btnG.style.display = 'inline-block'; btnG.disabled = isGuest || myCurrentHP < 100; } const lobbyWidget = document.getElementById('lobby-deposit-widget'); if(lobbyWidget) lobbyWidget.innerHTML = depositWidgetHTML(); const profWidget = document.getElementById('profile-deposit-widget'); if(profWidget) profWidget.innerHTML = depositWidgetHTML(); if(document.getElementById('s-lobby')?.classList.contains('active')){ renderLobbyFromCache(); updateLobbyBadge(); } }

async function doCashout(){ if(isGuest) return alert('Los invitados no pueden hacer cashout.'); const btn=document.getElementById('btn-cashout'); if(btn){btn.disabled=true;btn.textContent='Procesando...';} if(!ws || ws.readyState !== 1){ if(btn){btn.disabled=false;btn.textContent='💰 Cashout';} return; } ws.send(JSON.stringify({type:'cashout'})); }

function redeemPhysicalCode() { const input = document.getElementById('inp-physical-code'); const code = input.value.trim(); if(!code) return; if(ws && ws.readyState === 1) ws.send(JSON.stringify({type:'redeem_physical_code', code: code})); input.value = ''; }
function autoRedeemPhysicalCodes() { const codes = JSON.parse(localStorage.getItem('vicamon_physical_codes') || '[]'); codes.forEach(code => { if(ws && ws.readyState === 1) ws.send(JSON.stringify({type:'redeem_physical_code', code: code})); }); }
function updatePhysicalUI() { const list = document.getElementById('physical-beasts-list'); if(!list) return; if(myPhysicalBeasts.length === 0) { list.innerHTML = '<div style="font-size:11px;color:rgba(255,255,255,.3)">Ningún Vicamon físico invocado</div>'; return; } list.innerHTML = myPhysicalBeasts.map(k => { const b = BEASTS[k]; if(!b) return ''; return `<div style="background:rgba(246,226,102,.1);border:0.5px solid rgba(246,226,102,.3);border-radius:8px;padding:6px;display:flex;align-items:center;gap:6px"><img src="${b.img}" style="width:30px;height:30px;image-rendering:pixelated"><span style="font-size:12px;color:#F6E265;font-weight:600">${b.name}</span></div>`; }).join(''); }
