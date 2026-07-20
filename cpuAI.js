const BEASTS_FALLBACK = require('./beasts.js');
const { getAllAttacksDB, getAllVicamonsDB, saveAttackDB, saveVicamonDB } = require('./hp-balance');

let ATTACKS = {};
let BEASTS = {};

// NUEVO: Clasificador automático de ataques
function classifyAttackType(atk) {
  // Si no hace daño, es un Buff/Defensa/Utilidad
  if (!atk.d || atk.d === 0) {
    if (atk.fx === 'chaos' || atk.fx === 'chaosHi') return 'especial'; // El caos es especial
    return 'buff';
  }
  // Si tiene un efecto de estado, es Mixto
  if (atk.fx && atk.fx !== 'null') return 'mixto';
  
  // Si tiene auto-daño, ignora escudo, o es un golpe muy fuerte/impreciso, es Especial
  if (atk.self > 0 || atk.pierce || atk.d >= 28 || (atk.d >= 20 && atk.acc < 85)) return 'especial';
  
  // Por descarte, es Básico
  return 'basico';
}

async function initializeContent() {
  try {
    console.log("[CONTENT] Inicializando contenido desde BD...");
    
    // Sincronizar y reparar datos desde beasts.js (incluyendo el nuevo 'type')
    for (const key in BEASTS_FALLBACK) {
      const beast = BEASTS_FALLBACK[key];
      for (let i = 0; i < beast.attacks.length; i++) {
        const atk = beast.attacks[i];
        const atkId = `${key}_atk${i+1}`;
        
        // NUEVO: Calcular el tipo automáticamente
        const attackType = classifyAttackType(atk);
        
        const atkData = { 
          id: atkId, 
          name: atk.n, 
          d: atk.d, 
          acc: atk.acc, 
          fx: atk.fx, 
          pp: atk.pp, 
          desc: atk.desc, 
          type: attackType, // Asignamos el tipo calculado
          cost: 0 
        };
        await saveAttackDB(atkData);
      }
    }

    let dbAttacks = await getAllAttacksDB();
    let dbVicamons = await getAllVicamonsDB();

    // Si la BD está vacía, migramos desde beasts.js (Solo ocurre la primera vez)
    if (dbVicamons.length === 0) {
      console.log("[CONTENT] BD vacía. Migrando datos iniciales desde beasts.js...");
      
      // Migrar Vicamons
      for (const key in BEASTS_FALLBACK) {
        const b = BEASTS_FALLBACK[key];
        const atkIds = b.attacks.map((_, i) => `${key}_atk${i+1}`);
        const vicamonData = {
          id: key, name: b.name, sub: b.sub, img: b.img, el: b.el, style: b.style, cat: b.cat,
          stats: b.stats || null, attacks: atkIds
        };
        await saveVicamonDB(vicamonData);
      }
      
      dbAttacks = await getAllAttacksDB();
      dbVicamons = await getAllVicamonsDB();
      console.log("[CONTENT] Migración completada.");
    }

    // Cargar en Memoria
    ATTACKS = {};
    dbAttacks.forEach(a => ATTACKS[a.id] = a);

    BEASTS = {};
    dbVicamons.forEach(v => {
      // Reconstruir el objeto Vicamon como lo espera el motor de batalla
      BEASTS[v.id] = {
        name: v.name, sub: v.sub, img: v.img, el: v.el, style: v.style, cat: v.cat,
        stats: v.stats,
        attacks: v.attacks.map(atkId => {
          const atkData = ATTACKS[atkId];
          if (!atkData) return { n: 'Desconocido', d: 0, acc: 100, pp: 99, desc: 'Error' };
          return { n: atkData.name, d: atkData.d, acc: atkData.acc, fx: atkData.fx, pp: atkData.pp, desc: atkData.description };
        })
      };
    });

    console.log(`[CONTENT] ${Object.keys(BEASTS).length} Vicamons y ${Object.keys(ATTACKS).length} Ataques cargados en memoria.`);
    
    // Exponer globalmente para que el resto del servidor los use en lugar de beasts.js
    global.BEASTS_DB = BEASTS;
    global.ATTACKS_DB = ATTACKS;

  } catch(e) {
    console.error("[CONTENT ERROR] No se pudo cargar desde BD. Usando fallback beasts.js", e);
    global.BEASTS_DB = BEASTS_FALLBACK;
    global.ATTACKS_DB = {};
  }
}

module.exports = { initializeContent };
