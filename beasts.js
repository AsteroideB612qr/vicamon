const BEASTS = {
  aries:      {name:'Aries',      cat:'Zodiaco', sub:'Carnero de Fuego',    img:'Aries.png',      el:'fuego', style:'agresivo',
    attacks:[
      {n:'Embestida ardiente',  d:32, acc:72,  self:8,  fx:null,       pierce:true,  desc:'Golpe poderoso que ignora escudos. Te cuesta 8 HP al lanzarlo.'},
      {n:'Cornada solar',       d:20, acc:100, self:0,  fx:null,                     desc:'Ataque directo y confiable. Nunca falla.'},
      {n:'Furia del carnero',   d:45, acc:55,  self:15, fx:null,       risk:true,    desc:'Golpe devastador. Si falla, pierdes 15 HP. Alto riesgo.'},
      {n:'Carga celeste',       d:25, acc:85,  self:0,  fx:'stun',                   desc:'Impacta y aturde al rival, haciéndole perder su próximo turno.'},
    ]},
  tauro:      {name:'Tauro',      cat:'Zodiaco', sub:'Toro de Piedra',      img:'Tauro.png',      el:'tierra',style:'defensivo',
    attacks:[
      {n:'Muro de obsidiana',   d:0,  acc:100, self:0,  fx:'shield2',  buff:true,    desc:'Crea un escudo que dura 2 turnos. Bloquea ataques directos.'},
      {n:'Pisotón sísmico',     d:22, acc:88,  self:0,  fx:'slow',     debuff:true,  desc:'Golpe que ralentiza al rival, reduciendo su precisión 1 turno.'},
      {n:'Coraza telúrica',     d:0,  acc:100, self:0,  fx:'heal20',   buff:true,    desc:'Se cura 20 HP. Ideal para recuperarse antes de contraatacar.'},
      {n:'Cornada de granito',  d:35, acc:65,  self:0,  fx:null,                     desc:'Golpe lento pero brutal. Baja precisión, daño muy alto.'},
    ]},
  geminis:    {name:'Géminis',    cat:'Zodiaco', sub:'Gemelos del Viento',  img:'Geminis.png',    el:'aire',  style:'caos',
    attacks:[
      {n:'Ataque doble',        d:14, acc:90,  self:0,  fx:'double',                 desc:'Dos cabezas atacan a la vez. Golpea dos veces seguidas de 14 HP cada una.'},
      {n:'Cambio de personalidad',d:0,acc:100, self:0,  fx:'swap',     buff:true,    desc:'Intercambia tus estados negativos con los del rival.'},
      {n:'Viento confuso',      d:18, acc:100, self:0,  fx:'blind',    debuff:true,  desc:'Ciega al rival 2 turnos. Sus ataques tienen 30% menos de precisión.'},
      {n:'Caos gemelar',        d:0,  acc:95,  self:0,  fx:'chaos',                  desc:'Daño completamente aleatorio entre 5 y 40 HP. Impredecible por diseño.'},
    ]},
  cancer:     {name:'Cáncer',     cat:'Zodiaco', sub:'Cangrejo Abismal',    img:'Cancer.png',     el:'agua',  style:'defensivo',
    attacks:[
      {n:'Caparazón lunar',     d:0,  acc:100, self:0,  fx:'shield1r', buff:true,    desc:'Escudo 1 turno que refleja 15 HP al atacante cuando lo golpean.'},
      {n:'Pinza drenante',      d:15, acc:100, self:0,  fx:'drain10',                desc:'Ataca y roba 10 HP al rival. Ese HP se suma a tu vida.'},
      {n:'Corriente fría',      d:20, acc:85,  self:0,  fx:'slow2',    debuff:true,  desc:'Ralentiza al rival 2 turnos completos reduciendo su precisión.'},
      {n:'Marea nocturna',      d:28, acc:70,  self:0,  fx:'shieldbonus',            desc:'Más poderoso si el rival tiene escudo activo (+10 HP daño extra).'},
    ]},
  leo:        {name:'Leo',        cat:'Zodiaco', sub:'León Estelar',        img:'Leo.png',        el:'fuego', style:'equilibrado',
    attacks:[
      {n:'Rugido solar',        d:0,  acc:100, self:0,  fx:'weaken',   debuff:true,  desc:'Debilita al rival 2 turnos. Sus ataques hacen 25% menos de daño.'},
      {n:'Zarpazo estelar',     d:28, acc:88,  self:0,  fx:'weakbonus',              desc:'Hace +10 HP extra si el rival está debilitado. Úsalo después del Rugido.'},
      {n:'Melena de fuego',     d:20, acc:100, self:0,  fx:'burn',     dot:true,     desc:'Ataque seguro que quema al rival: 6 HP de daño por turno durante 2 turnos.'},
      {n:'Rugido del rey',      d:40, acc:65,  self:0,  fx:null,                     desc:'Golpe masivo. Ignora todos los debuffs propios al calcularse.'},
    ]},
  virgo:      {name:'Virgo',      cat:'Zodiaco', sub:'Doncella de Cristal', img:'Virgo.png',      el:'tierra',style:'tactico',
    attacks:[
      {n:'Análisis de debilidad',d:0, acc:100, self:0,  fx:'analyze',  buff:true,    desc:'Analiza al rival. Tus próximos 3 ataques hacen 15% más de daño.'},
      {n:'Fragmento cortante',  d:24, acc:88,  self:0,  fx:null,       pierce:true,  desc:'Corte preciso que ignora escudos. Pasa a través de cualquier defensa.'},
      {n:'Purificación',        d:0,  acc:100, self:0,  fx:'purify',   buff:true,    desc:'Elimina todos tus estados negativos y cura 15 HP.'},
      {n:'Prisma fatal',        d:35, acc:70,  self:0,  fx:'stateBonus',             desc:'+10 HP extra si el rival tiene cualquier estado activo (veneno, stun, etc.).'},
    ]},
  libra:      {name:'Libra',      cat:'Zodiaco', sub:'Balanza de Acero',    img:'Libra.png',      el:'aire',  style:'tactico',
    attacks:[
      {n:'Equilibrio fatal',    d:0,  acc:100, self:0,  fx:'equalize',               desc:'El daño es exactamente la diferencia de HP entre tú y el rival.'},
      {n:'Contrapeso',          d:0,  acc:100, self:0,  fx:'counter',  buff:true,    desc:'Recupera exactamente el daño que recibiste en el turno anterior.'},
      {n:'Filo de justicia',    d:25, acc:85,  self:0,  fx:'lowHPbonus',             desc:'+10 HP de daño extra si tu HP actual es menor que el del rival.'},
      {n:'Sentencia',           d:30, acc:75,  self:0,  fx:'stun_ifless',            desc:'Aturde al rival si en este momento tiene más HP que tú.'},
    ]},
  escorpio:   {name:'Escorpio',   cat:'Zodiaco', sub:'Escorpión Abismal',   img:'Escorpio.png',   el:'agua',  style:'veneno',
    attacks:[
      {n:'Picadura mortal',     d:6,  acc:100, self:0,  fx:'poison5',  dot:true,     desc:'Envenena al rival: 8 HP de daño por turno durante 5 turnos.'},
      {n:'Cola abismal',        d:22, acc:85,  self:0,  fx:'poisonBonus',            desc:'+5 HP por cada turno de veneno activo que tenga el rival al golpear.'},
      {n:'Toxina corrosiva',    d:10, acc:100, self:0,  fx:'corrode',  debuff:true,  desc:'El veneno del rival ya no puede ser curado ni limpiado por 3 turnos.'},
      {n:'Aguijón final',       d:35, acc:65,  self:0,  fx:'poisonDouble',           desc:'Si el rival está envenenado, este ataque hace el doble de daño (70 HP).'},
    ]},
  sagitario:  {name:'Sagitario',  cat:'Zodiaco', sub:'Centauro Cósmico',    img:'Sagitario.png',  el:'fuego', style:'equilibrado',
    attacks:[
      {n:'Flecha de fuego',     d:26, acc:92,  self:0,  fx:null,                     desc:'Flecha precisa y confiable. Casi nunca falla. Tu ataque principal.'},
      {n:'Disparo cargado',     d:42, acc:65,  self:0,  fx:'recharge',               desc:'Gran daño pero debes recargar 1 turno después. Planifica cuándo usarlo.'},
      {n:'Lluvia de estrellas', d:10, acc:80,  self:0,  fx:'triple',                 desc:'Tres flechas de 10 HP cada una. Cada flecha puede fallar independientemente.'},
      {n:'Flecha del destino',  d:30, acc:75,  self:0,  fx:'random_fx',              desc:'Además del daño, aplica un efecto aleatorio: veneno, stun, ceguera o -ataque.'},
    ]},
  capricornio:{name:'Capricornio',cat:'Zodiaco', sub:'Cabra Titán',         img:'Capricornio.png',el:'tierra',style:'defensivo',
    attacks:[
      {n:'Fortaleza alpina',    d:0,  acc:100, self:0,  fx:'fortress', buff:true,    desc:'Todo en uno: escudo 2 turnos + cura 15 HP + regenera 6 HP por 2 turnos.'},
      {n:'Pisotón tectónico',   d:28, acc:78,  self:0,  fx:'weakAtk',  debuff:true,  desc:'Golpe que reduce el ataque del rival en 20% durante 2 turnos.'},
      {n:'Coraza de cumbre',    d:0,  acc:100, self:0,  fx:'reflect50',buff:true,    desc:'Refleja: el próximo ataque recibido te daña solo 50% y el resto lo devuelves.'},
      {n:'Avalancha final',     d:40, acc:60,  self:15, fx:null,       risk:true,    desc:'Golpe masivo pero te cuesta 15 HP propios. Baja precisión. Golpe desesperado.'},
    ]},
  acuario:    {name:'Acuario',    cat:'Zodiaco', sub:'Portador del Rayo',   img:'Acuario.png',    el:'aire',  style:'caos',
    attacks:[
      {n:'Descarga caótica',    d:0,  acc:88,  self:0,  fx:'chaosHi',                desc:'Daño completamente aleatorio entre 10 y 45 HP. Nunca sabes cuánto hará.'},
      {n:'Tormenta eléctrica',  d:18, acc:100, self:0,  fx:'stun_blind',debuff:true, desc:'Garantizado: aturde al rival 1 turno Y le reduce precisión. Doble debuff.'},
      {n:'Sobrecarga',          d:50, acc:50,  self:0,  fx:'overload', risk:true,    desc:'Ataque poderoso. Si falla, pierdes 25 HP propios. Enorme riesgo.'},
      {n:'Corriente alterna',   d:20, acc:95,  self:0,  fx:'random_fx',              desc:'Casi nunca falla y aplica un estado aleatorio al rival además del daño.'},
    ]},
  piscis:     {name:'Piscis',     cat:'Zodiaco', sub:'Leviatán Dual',       img:'Piscis.png',     el:'agua',  style:'soporte',
    attacks:[
      {n:'Cola del abismo',     d:22, acc:85,  self:0,  fx:'poison3l', dot:true,     desc:'Ataque que envena levemente: 3 HP por turno durante 3 turnos.'},
      {n:'Corriente curativa',  d:0,  acc:100, self:0,  fx:'heal30',   buff:true,    desc:'La curación más alta del juego: 30 HP recuperados de golpe.'},
      {n:'Dualidad oceánica',   d:15, acc:100, self:0,  fx:'selfheal10',buff:true,   desc:'Ataca y se cura a la vez: 15 HP de daño al rival + 10 HP de cura propia.'},
      {n:'Marea del fin',       d:38, acc:65,  self:0,  fx:'lowHPx15',               desc:'Si tu HP está por debajo del 30%, este ataque hace 1.5× el daño normal (57 HP).'},
    ]},
};

// Truco para que funcione en Node.js (Render) y en el Navegador (HTML)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BEASTS;
}
if (typeof window !== 'undefined') {
  window.BEASTS = BEASTS;
}
