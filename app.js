<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Admin - VICAMON</title>
  <style>
    body{font-family:system-ui;background:#0a0a0f;color:#fff;padding:20px;max-width:1000px;margin:0 auto}
    .header{display:flex;gap:10px;margin-bottom:20px;align-items:center}
    input,button,select,textarea{background:#1a1a24;border:1px solid #333;color:#fff;padding:10px;border-radius:8px;outline:none;font-family:system-ui}
    button{cursor:pointer;background:#4a9eff;border:none;font-weight:bold}
    button:disabled{opacity:.5;cursor:not-allowed}
    .tabs{display:flex;gap:10px;margin-bottom:20px;border-bottom:1px solid #333}
    .tab{padding:10px 20px;cursor:pointer;color:#888;border-bottom:2px solid transparent}
    .tab.active{color:#fff;border-bottom:2px solid #4a9eff}
    .tab-content{display:none}
    .tab-content.active{display:block}
    .metrics-grid{display:grid;grid-template-columns:repeat(3, 1fr);gap:15px;margin-bottom:20px}
    .metric-card{background:#14141e;padding:15px;border-radius:12px;border:1px solid #2a2a35;text-align:center}
    .metric-title{font-size:12px;color:#85B7EB;text-transform:uppercase;margin-bottom:10px}
    .metric-value{font-size:24px;font-weight:bold;color:#fff;margin-bottom:5px}
    .status-red{border-color:#F0997B !important}
    .status-green{border-color:#5DCAA5 !important}
    .text-red{color:#F0997B !important}
    .text-green{color:#5DCAA5 !important}
    .admin-actions{margin-top:20px;display:flex;gap:10px;flex-wrap:wrap}
    .btn-withdraw{background:#F5A623;color:#000}
    table{width:100%;border-collapse:collapse;background:#14141e;border-radius:12px;overflow:hidden;margin-top:20px}
    th,td{padding:12px;border-bottom:1px solid #2a2a35;text-align:left;font-size:14px}
    th{color:#85B7EB;text-transform:uppercase;font-size:12px}
    td input{width:80px;padding:5px;text-align:center}
    .btn-save{background:#5DCAA5;padding:8px 16px;color:#000}
    .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;background:#14141e;padding:20px;border-radius:12px}
    .form-group{display:flex;flex-direction:column;gap:5px;margin-bottom:15px}
    .form-group label{font-size:12px;color:#aaa}
    .form-group input, .form-group select{width:100%;padding:8px}
    .atk-catalog-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:15px}
    .atk-card{background:#14141e;padding:10px;border-radius:8px;cursor:pointer;text-align:center;border:1px solid #2a2a35;transition:0.2s}
    .atk-card:hover{border-color:#4a9eff;background:#1a1a2e}
    .atk-cat-title{grid-column:1/-1;border-bottom:1px solid #333;padding-bottom:5px;margin-top:15px;color:#85B7EB;text-transform:uppercase;font-size:12px}
    .atk-detail-box{background:#111;padding:15px;border-radius:8px;margin-top:15px;border:1px solid #333;font-size:14px;line-height:1.5}
  </style>
</head>
<body>
  <h1>Panel de Administración VICAMON</h1>
  <div class="header">
    <input type="password" id="pass" placeholder="Contraseña de admin" style="flex:1">
    <button onclick="login()">Desbloquear</button>
  </div>

  <div id="admin-content" style="display:none;">
    <div class="tabs">
      <div class="tab active" onclick="showTab('treasury', this)">💰 Tesorería</div>
      <div class="tab" onclick="showTab('attacks', this)">⚔️ Ataques</div>
      <div class="tab" onclick="showTab('vicamons', this)">🐉 Vicamons</div>
      <div class="tab" onclick="showTab('simulator', this)">🧪 Simulador</div>
    </div>

    <!-- TESORERÍA -->
    <div id="tab-treasury" class="tab-content active">
      <div class="metrics-grid">
        <div class="metric-card" id="wallet-card">
          <div class="metric-title">Wallet Plataforma (Real)</div>
          <div class="metric-value" id="wallet-hp">0 HP</div>
          <div class="metric-value" style="font-size:14px;color:#aaa" id="wallet-usdc">0.000 USDC</div>
        </div>
        <div class="metric-card" id="players-card">
          <div class="metric-title">Deuda Jugadores</div>
          <div class="metric-value" id="players-hp">0 HP</div>
          <div class="metric-value" style="font-size:14px;color:#aaa" id="players-usdc">0.000 USDC</div>
        </div>
        <div class="metric-card" id="excedente-card">
          <div class="metric-title">Excedente (Ganancia)</div>
          <div class="metric-value" id="excedente-hp">0 HP</div>
          <div class="metric-value" style="font-size:14px;color:#aaa" id="excedente-usdc">0.000 USDC</div>
        </div>
      </div>
      <div class="admin-actions">
        <button onclick="withdrawFunds()" id="btn-withdraw" class="btn-withdraw">💸 Retirar Ganancias a Wallet</button>
        <button onclick="resetPlatformHP()">Resetear HP Plataforma</button>
        <button onclick="unlockAllHP()">Desbloquear HP de todos</button>
      </div>
      <table id="tbl" style="display:none">
        <thead><tr><th>Wallet</th><th>Nickname</th><th>HP</th><th>HP Bloqueados</th><th>Acción</th></tr></thead>
        <tbody id="data"></tbody>
      </table>
    </div>

    <!-- ATAQUES -->
    <div id="tab-attacks" class="tab-content">
      <h2>Crear / Editar Ataque</h2>
      <div class="form-grid">
        <div>
          <div class="form-group"><label>ID Único (ej: lanzallamas_v2)</label><input type="text" id="atk-id"></div>
          <div class="form-group"><label>Nombre</label><input type="text" id="atk-name"></div>
          <div class="form-group"><label>Daño (0 si es buff)</label><input type="number" id="atk-d" value="0"></div>
          <div class="form-group"><label>Precisión (%)</label><input type="number" id="atk-acc" value="100"></div>
        </div>
        <div>
          <div class="form-group">
            <label>Efecto (fx)</label>
            <select id="atk-fx">
              <option value="">Ninguno</option>
              <option value="burn">Quemar (2t)</option>
              <option value="poison5">Veneno (5t)</option>
              <option value="poison3l">Veneno Leve (3t)</option>
              <option value="stun">Aturdir</option>
              <option value="blind">Cegar</option>
              <option value="shield2">Escudo x2</option>
              <option value="heal20">Curar 20</option>
              <option value="heal30">Curar 30</option>
              <option value="drain10">Drenar 10</option>
              <option value="weaken">Debilitar</option>
            </select>
          </div>
          <div class="form-group"><label>PP (99 = Infinito)</label><input type="number" id="atk-pp" value="10"></div>
          <div class="form-group">
            <label>Tipo</label>
            <select id="atk-type">
              <option value="basico">Básico</option>
              <option value="buff">Buff/Defensa</option>
              <option value="mixto">Mixto</option>
              <option value="especial">Especial</option>
            </select>
          </div>
          <div class="form-group"><label>Costo en HP (Para comprarlo)</label><input type="number" id="atk-cost" value="50"></div>
        </div>
      </div>
      <div class="form-group" style="margin-top:15px"><label>Descripción</label><input type="text" id="atk-desc" placeholder="Descripción del ataque"></div>
      <button onclick="saveAttack()" style="margin-top:15px;width:100%;padding:12px">💾 Guardar Ataque en BD</button>

      <h2 style="margin-top:30px">Catálogo de Ataques Existentes</h2>
      <div id="atk-catalog" class="atk-catalog-grid"></div>
      <div id="atk-catalog-detail" class="atk-detail-box" style="display:none;"></div>
    </div>

    <!-- VICAMONS -->
    <div id="tab-vicamons" class="tab-content">
      <h2>Crear / Editar Vicamon</h2>
      <div class="form-grid">
        <div>
          <div class="form-group"><label>ID Único (ej: tunqui)</label><input type="text" id="vic-id"></div>
          <div class="form-group"><label>Nombre</label><input type="text" id="vic-name"></div>
          <div class="form-group"><label>Subtítulo</label><input type="text" id="vic-sub"></div>
          <div class="form-group"><label>URL de Imagen (ej: Tunqui.png)</label><input type="text" id="vic-img"></div>
        </div>
        <div>
          <div class="form-group">
            <label>Categoría</label>
            <select id="vic-cat"><option value="Zodiaco">Zodiaco</option><option value="Físico">Físico</option><option value="Especial">Especial</option></select>
          </div>
          <div class="form-group">
            <label>Elemento</label>
            <select id="vic-el"><option value="fuego">Fuego</option><option value="tierra">Tierra</option><option value="aire">Aire</option><option value="agua">Agua</option></select>
          </div>
          <div class="form-group">
            <label>Estilo</label>
            <select id="vic-style"><option value="agresivo">Agresivo</option><option value="defensivo">Defensivo</option><option value="tactico">Táctico</option><option value="equilibrado">Equilibrado</option><option value="veneno">Veneno</option><option value="caos">Caos</option><option value="soporte">Soporte</option></select>
          </div>
          <div class="form-group"><label>Stats (JSON: {"atk":70,"def":80,"spd":90})</label><input type="text" id="vic-stats" value='{"atk":70,"def":70,"spd":70}'></div>
        </div>
      </div>

      <h3 style="margin-top:20px">Asignar Ataques</h3>
      <p style="font-size:12px;color:#aaa">Selecciona 4 attaques del catálogo. Carga los ataques primero si no aparecen.</p>
      <div class="form-grid" style="grid-template-columns:1fr 1fr 1fr 1fr">
        <div class="form-group"><label>Ataque 1</label><select class="vic-atk-select" id="vic-atk1" onchange="updateVicAtkDesc(1)"></select><div id="vic-atk1-desc" style="font-size:10px;color:#888;margin-top:5px;min-height:25px"></div></div>
        <div class="form-group"><label>Ataque 2</label><select class="vic-atk-select" id="vic-atk2" onchange="updateVicAtkDesc(2)"></select><div id="vic-atk2-desc" style="font-size:10px;color:#888;margin-top:5px;min-height:25px"></div></div>
        <div class="form-group"><label>Ataque 3</label><select class="vic-atk-select" id="vic-atk3" onchange="updateVicAtkDesc(3)"></select><div id="vic-atk3-desc" style="font-size:10px;color:#888;margin-top:5px;min-height:25px"></div></div>
        <div class="form-group"><label>Ataque 4</label><select class="vic-atk-select" id="vic-atk4" onchange="updateVicAtkDesc(4)"></select><div id="vic-atk4-desc" style="font-size:10px;color:#888;margin-top:5px;min-height:25px"></div></div>
      </div>
      <button onclick="saveVicamon()" style="margin-top:15px;width:100%;padding:12px">💾 Guardar Vicamon en BD</button>
      <button onclick="loadContent()" style="margin-top:10px;width:100%;padding:10px;background:#333">🔄 Recargar Ataques en Desplegables</button>
    </div>

    <!-- SIMULADOR -->
    <div id="tab-simulator" class="tab-content">
      <h2>Coliseo de Pruebas (Balance)</h2>
      <p>Simula batallas 1v1 entre todos los Vicamons existentes para evaluar su balance de forma rápida.</p>
      <button onclick="runSimulation()" style="padding:12px;width:100%">⚔️ Simular Meta (Todos vs Todos)</button>
      <div id="sim-results" style="margin-top:20px"></div>
    </div>
  </div>

  <script>
    let globalPass='';
    let contentAttacks = [];

    function showTab(tabName, el) {
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.getElementById('tab-' + tabName).classList.add('active');
      el.classList.add('active');
      if(tabName === 'attacks' || tabName === 'vicamons') { if(contentAttacks.length === 0) loadContent(); }
    }

    async function login(){
      globalPass=document.getElementById('pass').value;
      if(!globalPass) return alert('Ingresa la contraseña');
      const res=await fetch('/admin-data?pass='+encodeURIComponent(globalPass));
      if(!res.ok){ alert('Contraseña incorrecta'); return; }
      document.getElementById('admin-content').style.display = 'block';
      loadData();
      loadContent();
    }

    async function loadData(){
      const res=await fetch('/admin-data?pass='+encodeURIComponent(globalPass));
      if(!res.ok){ return; }
      const data=await res.json();
      document.getElementById('tbl').style.display='table';
      const wHp = document.getElementById('wallet-hp');
      const wUsdc = document.getElementById('wallet-usdc');
      const pHp = document.getElementById('players-hp');
      const pUsdc = document.getElementById('players-usdc');
      const eHp = document.getElementById('excedente-hp');
      const eUsdc = document.getElementById('excedente-usdc');
      const wCard = document.getElementById('wallet-card');
      const pCard = document.getElementById('players-card');
      const eCard = document.getElementById('excedente-card');

      wHp.textContent = data.platformHp + ' HP';
      wUsdc.textContent = data.platformUsdc.toFixed(4) + ' USDC';
      pHp.textContent = data.playersTotalHp + ' HP';
      pUsdc.textContent = data.playersTotalUsdc.toFixed(4) + ' USDC';
      eHp.textContent = data.excedente + ' HP';
      eUsdc.textContent = data.excedenteUsdc.toFixed(4) + ' USDC';

      if(data.playersTotalHp > data.platformHp) { pCard.classList.add('status-red'); pCard.classList.remove('status-green'); pHp.classList.add('text-red'); }
      else { pCard.classList.add('status-green'); pCard.classList.remove('status-red'); pHp.classList.add('text-green'); }
      if(data.excedente < 0) { eCard.classList.add('status-red'); eCard.classList.remove('status-green'); eHp.classList.add('text-red'); }
      else { eCard.classList.add('status-green'); eCard.classList.remove('status-red'); eHp.classList.add('text-green'); }
      if(data.platformHp < data.playersTotalHp + data.excedente) { wCard.classList.add('status-red'); wCard.classList.remove('status-green'); wHp.classList.add('text-red'); }
      else { wCard.classList.add('status-green'); wCard.classList.remove('status-red'); wHp.classList.add('text-green'); }

      document.getElementById('data').innerHTML=data.players.map(p=>'<tr><td>'+p.wallet.slice(0,8)+'...'+p.wallet.slice(-4)+'</td><td>'+(p.last_name||'-')+'</td><td><input type="number" value="'+p.hp+'" id="hp-'+p.wallet+'"></td><td>'+(p.locked_hp||0)+'</td><td><button class="btn-save" onclick="saveHP(\''+p.wallet+'\')">Guardar</button></td></tr>').join('');
    }

    async function loadContent(){
      const res = await fetch('/admin-get-content?pass='+encodeURIComponent(globalPass));
      if(!res.ok) return;
      const data = await res.json();
      contentAttacks = data.attacks;
      const optionsHtml = data.attacks.map(a => `<option value="${a.id}">${a.name} (${a.type})</option>`).join('');
      document.querySelectorAll('.vic-atk-select').forEach((sel, i) => {
        sel.innerHTML = '<option value="">-- Selecciona --</option>' + optionsHtml;
        updateVicAtkDesc(i+1);
      });
      const types = ['basico', 'buff', 'mixto', 'especial'];
      let catalogHtml = '';
      types.forEach(type => {
        const typeName = {basico:'Básicos', buff:'Buffs/Defensas', mixto:'Mixtos', especial:'Especiales'}[type];
        catalogHtml += `<div class="atk-cat-title">${typeName}</div>`;
        data.attacks.filter(a => a.type === type).forEach(a => {
          catalogHtml += `<div class="atk-card" onclick="showAtkCatalogDetail('${a.id}')">${a.name}</div>`;
        });
      });
      document.getElementById('atk-catalog').innerHTML = catalogHtml;
    }

    function showAtkCatalogDetail(id) {
      const atk = contentAttacks.find(a => a.id === id);
      if(!atk) return;
      const box = document.getElementById('atk-catalog-detail');
      box.style.display = 'block';
      box.innerHTML = `
        <strong style="color:#4a9eff;font-size:16px">${atk.name}</strong> <span style="color:#888">(Tipo: ${atk.type}, Costo: ${atk.cost} HP)</span><br>
        <span style="color:#aaa">Daño: ${atk.d} | Precisión: ${atk.acc}% | PP: ${atk.pp === 99 ? '∞' : atk.pp} | Efecto: ${atk.fx || 'Ninguno'}</span><br><br>
        <span style="color:#fff">${atk.description}</span>
      `;
    }

    function updateVicAtkDesc(num) {
      const sel = document.getElementById(`vic-atk${num}`);
      const descEl = document.getElementById(`vic-atk${num}-desc`);
      const atkId = sel.value;
      if(!atkId) { descEl.textContent = ''; return; }
      const atk = contentAttacks.find(a => a.id === atkId);
      if(atk) descEl.textContent = atk.description;
    }

    async function saveAttack(){
      const data = {
        id: document.getElementById('atk-id').value.trim(),
        name: document.getElementById('atk-name').value.trim(),
        d: parseInt(document.getElementById('atk-d').value) || 0,
        acc: parseInt(document.getElementById('atk-acc').value) || 100,
        fx: document.getElementById('atk-fx').value || null,
        pp: parseInt(document.getElementById('atk-pp').value) || 10,
        desc: document.getElementById('atk-desc').value.trim(),
        type: document.getElementById('atk-type').value,
        cost: parseInt(document.getElementById('atk-cost').value) || 0
      };
      if(!data.id || !data.name) return alert('ID y Nombre son obligatorios');
      const res = await fetch('/admin-save-attack', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pass:globalPass, data})});
      const result = await res.json();
      if(result.ok) { alert('✓ Ataque guardado! El servidor lo ha recargado en memoria.'); loadContent(); }
      else alert('Error: ' + result.msg);
    }

    async function saveVicamon(){
      const stats = JSON.parse(document.getElementById('vic-stats').value || '{}');
      const attacks = [
        document.getElementById('vic-atk1').value,
        document.getElementById('vic-atk2').value,
        document.getElementById('vic-atk3').value,
        document.getElementById('vic-atk4').value
      ].filter(a => a !== "");
      if(attacks.length !== 4) return alert('Debes seleccionar exactamente 4 ataques');
      const data = {
        id: document.getElementById('vic-id').value.trim(),
        name: document.getElementById('vic-name').value.trim(),
        sub: document.getElementById('vic-sub').value.trim(),
        img: document.getElementById('vic-img').value.trim(),
        cat: document.getElementById('vic-cat').value,
        el: document.getElementById('vic-el').value,
        style: document.getElementById('vic-style').value,
        stats: stats,
        attacks: attacks
      };
      if(!data.id || !data.name) return alert('ID y Nombre son obligatorios');
      const res = await fetch('/admin-save-vicamon', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pass:globalPass, data})});
      const result = await res.json();
      if(result.ok) alert('✓ Vicamon guardado! El servidor lo ha recargado en memoria. Ya puedes invocarlo o verlo en el Bestiario.');
      else alert('Error: ' + result.msg);
    }

    // NUEVO: Simulador
    async function runSimulation(){
      const btn = event.target;
      btn.disabled = true; btn.textContent = 'Simulando... Esto puede tardar unos segundos.';
      const res = await fetch('/admin-run-simulation', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pass:globalPass})});
      const data = await res.json();
      btn.disabled = false; btn.textContent = '⚔️ Simular Meta (Todos vs Todos)';
      if(data.ok){
        let html = '<table><tr><th>Rank</th><th>Vicamon</th><th>Victorias</th><th>Derrotas</th><th>Empates</th><th>Win Rate</th></tr>';
        data.results.forEach((r, i) => {
          html += `<tr><td>${i+1}</td><td>${r.name}</td><td style="color:#5DCAA5">${r.wins}</td><td style="color:#F0997B">${r.losses}</td><td>${r.draws}</td><td style="font-weight:bold">${r.winRate}%</td></tr>`;
        });
        html += '</table>';
        document.getElementById('sim-results').innerHTML = html;
      } else {
        alert('Error en simulación');
      }
    }

    async function saveHP(wallet){
      const hp=document.getElementById('hp-'+wallet).value;
      const res=await fetch('/admin-update-hp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pass:globalPass,wallet,hp:parseInt(hp)})});
      if(res.ok) alert('✓ HP actualizado'); else alert('Error');
    }
    async function resetPlatformHP(){ if(!confirm('¿Resetear HP de plataforma a 0?')) return; const res=await fetch('/admin-reset-platform',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pass:globalPass})}); if(res.ok) loadData(); }
    async function unlockAllHP(){ if(!confirm('¿Desbloquear HP de todos?')) return; const res=await fetch('/admin-unlock-hp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pass:globalPass})}); if(res.ok) alert('✓ HP desbloqueados'); }
    async function withdrawFunds(){ if(!confirm('¿Retirar TODOS los USDC a tu wallet?')) return; const res=await fetch('/admin-withdraw',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pass:globalPass})}); const data=await res.json(); if(data.ok) alert('✓ Retiro exitoso!'); else alert('Error: '+data.msg); }
  </script>
</body>
</html>
