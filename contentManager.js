const BEASTS_FALLBACK = require('./beasts.js');
const { getAllAttacksDB, getAllVicamonsDB, saveAttackDB, saveVicamonDB } = require('./hp-balance');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

let ATTACKS = {};
let BEASTS = {};

function classifyAttackType(atk) {
  if (!atk.d || atk.d === 0) {
    if (atk.fx === 'chaos' || atk.fx === 'chaosHi') return 'especial';
    return 'buff';
  }
  if (atk.fx && atk.fx !== 'null') return 'mixto';
  if (atk.self > 0 || atk.pierce || atk.d >= 28 || (atk.d >= 20 && atk.acc < 85)) return 'especial';
  return 'basico';
}

async function loadOfficialCatalog() {
  try {
    console.log("[CONTENT] Cargando catálogo oficial balanceado V2...");
    
    // 1. Limpiar tablas viejas
    await pool.query('DELETE FROM attacks');
    await pool.query('DELETE FROM vicamons');
    
    // 2. Insertar los 40 ataques oficiales
    const attacks = [
      // Básicos (10)
      { id: 'choque', name: 'Choque', d: 15, acc: 100, desc: 'Ataque ligero. Nunca falla.', type: 'basico', cost: 0, fx: null, pp: 99, self: 0 },
      { id: 'golpe_certero', name: 'Golpe Certero', d: 16, acc: 100, desc: 'Ataque directo confiable.', type: 'basico', cost: 0, fx: null, pp: 99, self: 0 },
      { id: 'embestida', name: 'Embestida', d: 17, acc: 100, desc: 'Carga rápida contra el rival.', type: 'basico', cost: 0, fx: null, pp: 99, self: 0 },
      { id: 'garra_rapida', name: 'Garra Rápida', d: 18, acc: 100, desc: 'Tajo veloz y seguro.', type: 'basico', cost: 0, fx: null, pp: 99, self: 0 },
      { id: 'azote', name: 'Azote', d: 19, acc: 100, desc: 'Golpe con cola o extremidad.', type: 'basico', cost: 0, fx: null, pp: 99, self: 0 },
      { id: 'mordisco', name: 'Mordisco', d: 20, acc: 100, desc: 'Daño directo con los colmillos.', type: 'basico', cost: 0, fx: null, pp: 99, self: 0 },
      { id: 'tajo', name: 'Tajo', d: 21, acc: 100, desc: 'Corte limpio y preciso.', type: 'basico', cost: 0, fx: null, pp: 99, self: 0 },
      { id: 'cabezazo', name: 'Cabezazo', d: 22, acc: 100, desc: 'Impacto contundente.', type: 'basico', cost: 0, fx: null, pp: 99, self: 0 },
      { id: 'golpe_brutal', name: 'Golpe Brutal', d: 24, acc: 100, desc: 'El ataque básico más fuerte.', type: 'basico', cost: 0, fx: null, pp: 99, self: 0 },
      { id: 'mordida_de_titanio', name: 'Mordida de Titanio', d: 20, acc: 100, desc: 'Colmillos de acero que no fallan.', type: 'basico', cost: 0, fx: null, pp: 99, self: 0 },
      
      // Buffs (8)
      { id: 'muro_de_energia', name: 'Muro de Energía', d: 0, acc: 100, desc: 'Bloquea los próximos 2 ataques.', type: 'buff', cost: 0, fx: 'shield2', pp: 4, self: 0 },
      { id: 'escudo_espejo', name: 'Escudo Espejo', d: 0, acc: 100, desc: 'Bloquea 1 ataque y refleja 15 HP.', type: 'buff', cost: 0, fx: 'shield1r', pp: 2, self: 0 },
      { id: 'reanimar', name: 'Reanimar', d: 0, acc: 100, desc: 'Restaura 20 HP.', type: 'buff', cost: 0, fx: 'heal20', pp: 5, self: 0 },
      { id: 'sanacion_mayor', name: 'Sanación Mayor', d: 0, acc: 100, desc: 'Restaura 30 HP.', type: 'buff', cost: 0, fx: 'heal30', pp: 3, self: 0 },
      { id: 'desarmar', name: 'Desarmar', d: 0, acc: 100, desc: 'Debilita al rival (-25% daño).', type: 'buff', cost: 0, fx: 'weaken', pp: 5, self: 0 },
      { id: 'estudio', name: 'Estudio', d: 0, acc: 100, desc: 'Próximos 3 ataques +15% daño.', type: 'buff', cost: 0, fx: 'analyze', pp: 4, self: 0 },
      { id: 'drenaje_vital', name: 'Drenaje Vital', d: 15, acc: 100, desc: 'Daña 15 y absorbe 10 HP.', type: 'buff', cost: 0, fx: 'drain10', pp: 5, self: 0 },
      { id: 'purificar', name: 'Purificar', d: 0, acc: 100, desc: 'Cura estados y cura 15 HP.', type: 'buff', cost: 0, fx: 'purify', pp: 2, self: 0 },
      
      // Tácticos (12)
      { id: 'destello_cegador', name: 'Destello Cegador', d: 15, acc: 85, desc: 'Daño + Ciega (-30% precisión).', type: 'mixto', cost: 0, fx: 'blind', pp: 4, self: 0 },
      { id: 'niebla_densa', name: 'Niebla Densa', d: 18, acc: 85, desc: 'Daño + Ciega 2 turnos.', type: 'mixto', cost: 0, fx: 'slow2', pp: 4, self: 0 },
      { id: 'ataque_dual', name: 'Ataque Dual', d: 10, acc: 90, desc: 'Golpea dos veces (20 total).', type: 'mixto', cost: 0, fx: 'double', pp: 5, self: 0 },
      { id: 'robo_de_energia', name: 'Robo de Energía', d: 22, acc: 100, desc: 'Daña 22 y te cura 10 HP.', type: 'mixto', cost: 0, fx: 'selfheal10', pp: 4, self: 0 },
      { id: 'llama_abrasadora', name: 'Llama Abrasadora', d: 18, acc: 100, desc: 'Daño + Quema (6 HP/turno).', type: 'mixto', cost: 0, fx: 'burn', pp: 4, self: 0 },
      { id: 'picadura_toxica', name: 'Picadura Tóxica', d: 10, acc: 100, desc: 'Daño + Veneno grave (8 HP/turno).', type: 'mixto', cost: 0, fx: 'poison5', pp: 4, self: 0 },
      { id: 'nube_toxica', name: 'Nube Tóxica', d: 22, acc: 85, desc: 'Daño + Veneno leve (3 HP/turno).', type: 'mixto', cost: 0, fx: 'poison3l', pp: 5, self: 0 },
      { id: 'castigo_justiciero', name: 'Castigo Justiciero', d: 22, acc: 85, desc: 'Daño + Stun si rival tiene más HP.', type: 'mixto', cost: 0, fx: 'stun_ifless', pp: 5, self: 0 },
      { id: 'onda_de_choque', name: 'Onda de Choque', d: 18, acc: 85, desc: 'Daño + Stun y Ciega.', type: 'mixto', cost: 0, fx: 'stun_blind', pp: 3, self: 0 },
      { id: 'acido_corrosivo', name: 'Ácido Corrosivo', d: 10, acc: 100, desc: 'El veneno del rival no se cura.', type: 'mixto', cost: 0, fx: 'corrode', pp: 3, self: 0 },
      { id: 'canon_de_plasma', name: 'Cañón de Plasma', d: 45, acc: 70, desc: 'Súper daño, pierdes próximo turno.', type: 'pesado', cost: 0, fx: 'recharge', pp: 3, self: 0 },
      { id: 'rayo_devastador', name: 'Rayo Devastador', d: 50, acc: 80, desc: 'El mayor daño del juego (50 HP).', type: 'pesado', cost: 0, fx: null, pp: 3, self: 0 },
      
      // Pesados (8)
      { id: 'golpe_demoledor', name: 'Golpe Demoledor', d: 29, acc: 65, desc: 'Brutal, pero impreciso.', type: 'pesado', cost: 0, fx: null, pp: 5, self: 0 },
      { id: 'perforacion_brutal', name: 'Perforación Brutal', d: 28, acc: 72, desc: 'Ignora escudos, -8 HP propio.', type: 'pesado', cost: 0, fx: 'pierce', pp: 5, self: 8 },
      { id: 'estallido_sonico', name: 'Estallido Sónico', d: 32, acc: 80, desc: 'Alto impacto confiable.', type: 'pesado', cost: 0, fx: null, pp: 5, self: 0 },
      { id: 'disparo_certero', name: 'Disparo Certero', d: 34, acc: 80, desc: 'Proyectil concentrado.', type: 'pesado', cost: 0, fx: null, pp: 5, self: 0 },
      { id: 'impacto_sismico', name: 'Impacto Sísmico', d: 48, acc: 70, desc: 'Devastador, -10 HP propio.', type: 'pesado', cost: 0, fx: 'risk', pp: 5, self: 10 },
      { id: 'envite_temerario', name: 'Envite Temerario', d: 40, acc: 65, desc: 'Si fallas, pierdes 15 HP.', type: 'pesado', cost: 0, fx: 'risk', pp: 3, self: 15 }
    ];

    for (const a of attacks) {
      await saveAttackDB(a);
    }

    // 3. Insertar los 12 Zodíacos con sus nuevos sets
    const zodiacs = [
      { id: 'aries', name: 'Aries', cat: 'Zodiaco', sub: 'Carnero de Fuego', img: 'Aries.png', el: 'fuego', style: 'agresivo', stats: {atk:70, def:30, spd:90}, attacks: ['golpe_brutal', 'desarmar', 'robo_de_energia', 'rayo_devastador'] },
      { id: 'tauro', name: 'Tauro', cat: 'Zodiaco', sub: 'Toro de Piedra', img: 'Tauro.png', el: 'tierra', style: 'defensivo', stats: {atk:55, def:90, spd:30}, attacks: ['mordisco', 'muro_de_energia', 'destello_cegador', 'golpe_demoledor'] },
      { id: 'geminis', name: 'Géminis', cat: 'Zodiaco', sub: 'Gemelos del Viento', img: 'Geminis.png', el: 'aire', style: 'caos', stats: {atk:65, def:50, spd:80}, attacks: ['garra_rapida', 'drenaje_vital', 'niebla_densa', 'canon_de_plasma'] },
      { id: 'cancer', name: 'Cáncer', cat: 'Zodiaco', sub: 'Cangrejo Abismal', img: 'Cancer.png', el: 'agua', style: 'defensivo', stats: {atk:45, def:95, spd:40}, attacks: ['azote', 'escudo_espejo', 'drenaje_vital', 'golpe_demoledor'] },
      { id: 'leo', name: 'Leo', cat: 'Zodiaco', sub: 'León Estelar', img: 'Leo.png', el: 'fuego', style: 'equilibrado', stats: {atk:70, def:65, spd:70}, attacks: ['cabezazo', 'estudio', 'llama_abrasadora', 'disparo_certero'] },
      { id: 'virgo', name: 'Virgo', cat: 'Zodiaco', sub: 'Doncella de Cristal', img: 'Virgo.png', el: 'tierra', style: 'tactico', stats: {atk:60, def:70, spd:65}, attacks: ['garra_rapida', 'sanacion_mayor', 'drenaje_vital', 'canon_de_plasma'] },
      { id: 'libra', name: 'Libra', cat: 'Zodiaco', sub: 'Balanza de Acero', img: 'Libra.png', el: 'aire', style: 'tactico', stats: {atk:62, def:62, spd:62}, attacks: ['mordisco', 'reanimar', 'onda_de_choque', 'golpe_demoledor'] },
      { id: 'escorpio', name: 'Escorpio', cat: 'Zodiaco', sub: 'Escorpión Abismal', img: 'Escorpio.png', el: 'agua', style: 'veneno', stats: {atk:65, def:55, spd:70}, attacks: ['choque', 'escudo_espejo', 'nube_toxica', 'golpe_demoledor'] },
      { id: 'sagitario', name: 'Sagitario', cat: 'Zodiaco', sub: 'Centauro Cósmico', img: 'Sagitario.png', el: 'fuego', style: 'equilibrado', stats: {atk:68, def:55, spd:75}, attacks: ['mordisco', 'reanimar', 'niebla_densa', 'disparo_certero'] },
      { id: 'capricornio', name: 'Capricornio', cat: 'Zodiaco', sub: 'Coba Titán', img: 'Capricornio.png', el: 'tierra', style: 'defensivo', stats: {atk:50, def:92, spd:35}, attacks: ['cabezazo', 'estudio', 'llama_abrasadora', 'disparo_certero'] },
      { id: 'acuario', name: 'Acuario', cat: 'Zodiaco', sub: 'Portador del Rayo', img: 'Acuario.png', el: 'aire', style: 'caos', stats: {atk:72, def:45, spd:85}, attacks: ['choque', 'escudo_espejo', 'onda_de_choque', 'golpe_demoledor'] },
      { id: 'piscis', name: 'Piscis', cat: 'Zodiaco', sub: 'Leviatán Dual', img: 'Piscis.png', el: 'agua', style: 'soporte', stats: {atk:58, def:68, spd:60}, attacks: ['azote', 'reanimar', 'nube_toxica', 'canon_de_plasma'] }
    ];

    for (const z of zodiacs) {
      await saveVicamonDB(z);
    }

    // 4. Insertar los Físicos (Llaveros)
    const physicals = [
      { id: 'irondog', name: 'Iron Dog', cat: 'Físico', sub: 'Can Cyborg', img: 'IronDog.png', el: 'tierra', style: 'equilibrado', stats: {atk:65, def:85, spd:75}, attacks: ['mordida_de_titanio', 'muro_de_energia', 'destello_cegador', 'golpe_demoledor'] },
      { id: 'tunqui', name: 'Tunqui', cat: 'Físico', sub: 'Guardián Amazónico', img: 'Tunqui.png', el: 'aire', style: 'equilibrado', stats: {atk:70, def:70, spd:70}, attacks: ['garra_rapida', 'escudo_espejo', 'llama_abrasadora', 'disparo_certero'] } // Añadido Tunqui para que los códigos QR funcionen
    ];

    for (const p of physicals) {
      await saveVicamonDB(p);
    }

    console.log("[CONTENT] ¡Catálogo oficial balanceado V2 cargado con éxito!");
  } catch(e) {
    console.error("[CONTENT ERROR] Error cargando catálogo oficial:", e);
  }
}

async function initializeContent() {
  try {
    console.log("[CONTENT] Inicializando contenido desde BD...");
    
    // Ejecutar la carga del catálogo V2
    await loadOfficialCatalog();
    
    let dbAttacks = await getAllAttacksDB();
    let dbVicamons = await getAllVicamonsDB();

    // Cargar en Memoria
    ATTACKS = {};
    dbAttacks.forEach(a => ATTACKS[a.id] = a);

    BEASTS = {};
    dbVicamons.forEach(v => {
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
    
    global.BEASTS_DB = BEASTS;
    global.ATTACKS_DB = ATTACKS;

  } catch(e) {
    console.error("[CONTENT ERROR] No se pudo cargar desde BD. Usando fallback beasts.js", e);
    global.BEASTS_DB = BEASTS_FALLBACK;
    global.ATTACKS_DB = {};
  }
}

module.exports = { initializeContent };
