var labOriginalImg = null; 

const MOVE_POOL = [
    { n: 'Golpe Básico', d: 20, acc: 100, fx: null, pp: 99, desc: 'Confiable, nunca falla. PP infinito.', pts: 20, type: 'atk' },
    { n: 'Súper Golpe', d: 35, acc: 80, fx: null, pp: 5, desc: 'Mucho daño, pero puede fallar.', pts: 28, type: 'atk' },
    { n: 'Golpe Rápido', d: 15, acc: 100, fx: 'double', pp: 10, desc: 'Golpea dos veces seguidas.', pts: 24, type: 'atk' },
    { n: 'Embestida', d: 40, acc: 75, fx: null, pp: 5, desc: 'Devastador, pero impreciso.', pts: 30, type: 'atk' },
    { n: 'Drenaje', d: 15, acc: 100, fx: 'drain10', pp: 5, desc: 'Daña 15 HP y te cura 10 HP.', pts: 25, type: 'atk' },
    { n: 'Lanzallamas', d: 18, acc: 100, fx: 'burn', pp: 5, desc: 'Daño + Quema al rival (6 HP/turno por 2 turnos).', pts: 28, type: 'atk' },
    { n: 'Picadura Tóxica', d: 6, acc: 100, fx: 'poison5', pp: 5, desc: 'Daño leve + Veneno grave (8 HP/turno por 5 turnos).', pts: 26, type: 'atk' },
    { n: 'Carga Cegadora', d: 15, acc: 85, fx: 'blind', pp: 5, desc: 'Daño + Ciega al rival (-30% precisión por 2 turnos).', pts: 24, type: 'atk' },
    { n: 'Escudo', d: 0, acc: 100, fx: 'shield2', pp: 5, desc: 'Bloquea los próximos 2 ataques.', pts: 25, type: 'buff' },
    { n: 'Cura Menor', d: 0, acc: 100, fx: 'heal20', pp: 5, desc: 'Restaura 20 HP.', pts: 20, type: 'buff' },
    { n: 'Fortaleza', d: 0, acc: 100, fx: 'fortress', pp: 3, desc: 'Escudo + Cura 15 HP + Regeneración (6 HP/turno por 2 turnos).', pts: 35, type: 'buff' },
    { n: 'Purificar', d: 0, acc: 100, fx: 'purify', pp: 3, desc: 'Cura tus estados negativos + 15 HP.', pts: 22, type: 'buff' },
    { n: 'Debilitar', d: 0, acc: 100, fx: 'weaken', pp: 3, desc: 'El rival hace 25% menos de daño (por 2 turnos).', pts: 20, type: 'debuff' },
    { n: 'Onda Aturdidora', d: 0, acc: 80, fx: 'stun', pp: 3, desc: 'El rival pierde su próximo turno (1 turno).', pts: 25, type: 'debuff' }
];

document.addEventListener('DOMContentLoaded', () => {
    const imgInput = document.getElementById('lab-img-input');
    if(imgInput) {
        imgInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                labOriginalImg = new Image();
                labOriginalImg.onload = () => { processLabImage(); };
                labOriginalImg.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });
    }
    populateMoveSelects();
    calculateLabBalance(); 
});

function populateMoveSelects() {
    const selects = document.querySelectorAll('.lab-mv-select');
    selects.forEach((sel) => {
        let html = '<option value="" style="background:#1a1a24;color:#fff">-- Selecciona un Movimiento --</option>';
        MOVE_POOL.forEach((mv, i) => {
            let typeIcon = mv.type === 'atk' ? '⚔️' : mv.type === 'buff' ? '🛡️' : '✨';
            html += `<option value="${i}" style="background:#1a1a24;color:#fff">${typeIcon} ${mv.n}</option>`;
        });
        sel.innerHTML = html;
        sel.onchange = () => { calculateLabBalance(); updateMoveDescriptions(); };
    });
}

function updateMoveDescriptions() {
    const selects = document.querySelectorAll('.lab-mv-select');
    selects.forEach(sel => {
        const descEl = sel.parentElement.querySelector('.lab-mv-desc');
        if (!descEl) return;
        if (sel.value === "") {
            descEl.innerHTML = '<span style="color:rgba(255,255,255,.3)">Selecciona un movimiento para ver su efecto.</span>';
            return;
        }
        const mv = MOVE_POOL[parseInt(sel.value)];
        let typeText = mv.type === 'atk' ? '⚔️ Ataque' : mv.type === 'buff' ? '🛡️ Defensa' : '✨ Soporte';
        let statsText = `Daño: ${mv.d} | Prec: ${mv.acc}% | PP: ${mv.pp === 99 ? '∞' : mv.pp}`;
        descEl.innerHTML = `<strong style="color:#85B7EB">${typeText}</strong> · ${mv.desc} <br><span style="font-size:9px;color:rgba(255,255,255,.4)">${statsText}</span>`;
    });
}

function processLabImage() {
    if (!labOriginalImg) return;
    const canvas = document.getElementById('lab-canvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const pixelSize = parseInt(document.getElementById('lab-pixel-size').value);
    const paletteSize = parseInt(document.getElementById('lab-color-palette').value);
    const w = canvas.width, h = canvas.height;
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = Math.max(1, Math.floor(w / pixelSize));
    tempCanvas.height = Math.max(1, Math.floor(h / pixelSize));
    const imgW = labOriginalImg.width, imgH = labOriginalImg.height;
    const size = Math.min(imgW, imgH);
    const sx = (imgW - size) / 2, sy = (imgH - size) / 2;
    tempCtx.drawImage(labOriginalImg, sx, sy, size, size, 0, 0, tempCanvas.width, tempCanvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(tempCanvas, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const step = 255 / (paletteSize - 1);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.round(data[i] / step) * step;     
        data[i+1] = Math.round(data[i+1] / step) * step; 
        data[i+2] = Math.round(data[i+2] / step) * step; 
    }
    ctx.putImageData(imageData, 0, 0);
}

function calculateLabBalance() {
    const selects = document.querySelectorAll('.lab-mv-select');
    let totalPower = 0, buffCount = 0, atkCount = 0, emptyCount = 0;
    let uniqueMoves = new Set();
    selects.forEach(sel => {
        if (sel.value === "") { emptyCount++; return; }
        const mv = MOVE_POOL[parseInt(sel.value)];
        totalPower += mv.pts;
        uniqueMoves.add(mv.n);
        if (mv.type === 'buff') buffCount++;
        if (mv.type === 'atk') atkCount++;
    });
    
    const markerEl = document.getElementById('lab-balance-marker');
    const msgEl = document.getElementById('lab-balance-msg');
    const btn = document.getElementById('lab-submit-btn');
    
    let markerPos = Math.min(100, (totalPower / 160) * 100);
    markerEl.style.left = markerPos + '%';

    // VALIDACIONES DE COMPOSICIÓN
    if (emptyCount > 0) { msgEl.textContent = 'Te faltan elegir movimientos.'; msgEl.style.color = '#EF9F27'; btn.disabled = true; btn.textContent = '🔒 PRÓXIMAMENTE (Costo: 3000 HP)'; return; }
    if (uniqueMoves.size < 4) { msgEl.textContent = 'No puedes repetir movimientos.'; msgEl.style.color = '#F0997B'; btn.disabled = true; btn.textContent = '🔒 PRÓXIMAMENTE (Costo: 3000 HP)'; return; }
    if (buffCount > 2) { msgEl.textContent = 'Máximo 2 movimientos defensivos/curas.'; msgEl.style.color = '#F0997B'; btn.disabled = true; btn.textContent = '🔒 PRÓXIMAMENTE (Costo: 3000 HP)'; return; }
    if (atkCount === 0) { msgEl.textContent = 'Debes tener al menos 1 movimiento de ataque.'; msgEl.style.color = '#F0997B'; btn.disabled = true; btn.textContent = '🔒 PRÓXIMAMENTE (Costo: 3000 HP)'; return; }

    // EVALUACIÓN DE BALANCE Y BLOQUEO TEMPORAL DE ENVÍO
    btn.disabled = true;
    btn.textContent = '🔒 PRÓXIMAMENTE (Costo: 3000 HP)';
    
    if (totalPower < 70) {
        msgEl.textContent = '⚠ Vicamon Débil. (Envíos deshabilitados temporalmente)';
        msgEl.style.color = '#F6E265'; 
    } else if (totalPower <= 120) {
        msgEl.textContent = '✓ Vicamon Balanceado. (Envíos deshabilitados temporalmente)';
        msgEl.style.color = '#5DCAA5'; 
    } else {
        msgEl.textContent = '✗ Vicamon Desbalanceado. (Envíos deshabilitados temporalmente)';
        msgEl.style.color = '#F0997B'; 
    }
}

function getLabBeastData() {
    if (!labOriginalImg) return alert('Debes subir una imagen de referencia.');
    const name = document.getElementById('lab-name').value.trim() || 'Vicamon Beta';
    const sub = document.getElementById('lab-sub').value.trim() || 'Proto-Tipo';
    const el = document.getElementById('lab-element').value;
    const selects = document.querySelectorAll('.lab-mv-select');
    const attacks = [];
    for(let i=0; i<4; i++) {
        if (!selects[i].value) return null;
        const mv = MOVE_POOL[parseInt(selects[i].value)];
        attacks.push({ n: mv.n, d: mv.d, acc: mv.acc, fx: mv.fx, pp: mv.pp, desc: mv.desc });
    }
    const canvas = document.getElementById('lab-canvas');
    const imgData = canvas.toDataURL('image/png');
    return { name, sub, el, img: imgData, attacks };
}

function simulateLabVicamon() {
    const labBeast = getLabBeastData();
    if (!labBeast) return alert('Debes elegir los 4 movimientos antes de simular.');
    window._labBeastTemp = labBeast; 
    if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'lab_simulate', beast: labBeast }));
    } else {
        alert('Error de conexión.');
    }
}

function submitLabVicamon() {
    alert('El envío de Vicamons está temporalmente deshabilitado mientras calibramos los ataques.');
}

function openQRScanner() {
    const modal = document.getElementById('modal-qr-scanner');
    modal.classList.remove('hidden');
    if (qrScanner) return; 
    qrScanner = new Html5Qrcode("qr-reader");
    qrScanner.start(
        { facingMode: "environment" }, 
        { fps: 10, qrbox: 250 },
        (decodedText) => {
            document.getElementById('inp-physical-code').value = decodedText;
            redeemPhysicalCode();
            closeQRScanner();
        },
        (errorMessage) => { /* Ignorar */ }
    ).catch(err => {
        alert('No se pudo acceder a la cámara. Asegúrate de dar permisos o usa el campo de texto.');
        closeQRScanner();
    });
}

function closeQRScanner() {
    const modal = document.getElementById('modal-qr-scanner');
    modal.classList.add('hidden');
    if (qrScanner) {
        qrScanner.stop().then(() => { qrScanner.clear(); qrScanner = null; }).catch(err => { qrScanner = null; });
    }
}
