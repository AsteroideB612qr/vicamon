const BEASTS = {
  aries:      {name:'Aries',      cat:'Zodiaco', sub:'Carnero de Fuego',    img:'Aries.png',      el:'fuego', style:'agresivo', stats: {atk:70, def:30, spd:90},
    attacks:[
      {n:'Golpe Brutal',  d:24, acc:100, self:0,  fx:null,       pp:99, desc:'El ataque básico más fuerte.'},
      {n:'Desarmar',       d:0,  acc:100, self:0,  fx:'weaken',   pp:5,  desc:'Debilita al rival (-25% daño).'},
      {n:'Robo de Energía',d:22, acc:100, self:0,  fx:'selfheal10',pp:4, desc:'Daña 22 y te cura 10 HP.'},
      {n:'Rayo Devastador', d:50, acc:80,  self:0,  fx:null,       pp:3,  desc:'El mayor daño del juego (50 HP).'},
    ]},
  tauro:      {name:'Tauro',      cat:'Zodiaco', sub:'Toro de Piedra',      img:'Tauro.png',      el:'tierra',style:'defensivo', stats: {atk:55, def:90, spd:30},
    attacks:[
      {n:'Mordisco',        d:20, acc:100, self:0,  fx:null,       pp:99, desc:'Daño directo con los colmillos.'},
      {n:'Muro de Energía',  d:0,  acc:100, self:0,  fx:'shield2',  pp:4,  desc:'Bloquea los próximos 2 ataques.'},
      {n:'Destello Cegador', d:15, acc:85,  self:0,  fx:'blind',    pp:4,  desc:'Daño + Ciega (-30% precisión).'},
      {n:'Golpe Demoledor',  d:29, acc:65,  self:0,  fx:null,       pp:5,  desc:'Brutal, pero impreciso.'},
    ]},
  geminis:    {name:'Géminis',    cat:'Zodiaco', sub:'Gemelos del Viento',  img:'Geminis.png',    el:'aire',  style:'caos', stats: {atk:65, def:50, spd:80},
    attacks:[
      {n:'Garra Rápida',    d:18, acc:100, self:0,  fx:null,       pp:99, desc:'Tajo veloz y seguro.'},
      {n:'Drenaje Vital',    d:15, acc:100, self:0,  fx:'drain10',  pp:5,  desc:'Daña 15 y absorbe 10 HP.'},
      {n:'Niebla Densa',     d:18, acc:85,  self:0,  fx:'slow2',    pp:4,  desc:'Daño + Ciega 2 turnos.'},
      {n:'Cañón de Plasma',  d:45, acc:70,  self:0,  fx:'recharge', pp:3,  desc:'Súper daño, pierdes próximo turno.'},
    ]},
  cancer:     {name:'Cáncer',     cat:'Zodiaco', sub:'Cangrejo Abismal',    img:'Cancer.png',     el:'agua',  style:'defensivo', stats: {atk:45, def:95, spd:40},
    attacks:[
      {n:'Azote',           d:19, acc:100, self:0,  fx:null,       pp:99, desc:'Golpe con cola o extremidad.'},
      {n:'Escudo Espejo',    d:0,  acc:100, self:0,  fx:'shield1r', pp:2,  desc:'Bloquea 1 ataque y refleja 15 HP.'},
      {n:'Drenaje Vital',    d:15, acc:100, self:0,  fx:'drain10',  pp:5,  desc:'Daña 15 y absorbe 10 HP.'},
      {n:'Golpe Demoledor',  d:29, acc:65,  self:0,  fx:null,       pp:5,  desc:'Brutal, pero impreciso.'},
    ]},
  leo:        {name:'Leo',        cat:'Zodiaco', sub:'León Estelar',        img:'Leo.png',        el:'fuego', style:'equilibrado', stats: {atk:70, def:65, spd:70},
    attacks:[
      {n:'Cabezazo',        d:22, acc:100, self:0,  fx:null,       pp:99, desc:'Impacto contundente.'},
      {n:'Estudio',         d:0,  acc:100, self:0,  fx:'analyze',  pp:4,  desc:'Próximos 3 ataques +15% daño.'},
      {n:'Llama Abrasadora',d:18, acc:100, self:0,  fx:'burn',     pp:4,  desc:'Daño + Quema (6 HP/turno).'},
      {n:'Disparo Certero',  d:34, acc:80,  self:0,  fx:null,       pp:5,  desc:'Proyectil concentrado.'},
    ]},
  virgo:      {name:'Virgo',      cat:'Zodiaco', sub:'Doncella de Cristal', img:'Virgo.png',      el:'tierra',style:'tactico', stats: {atk:60, def:70, spd:65},
    attacks:[
      {n:'Garra Rápida',    d:18, acc:100, self:0,  fx:null,       pp:99, desc:'Tajo veloz y seguro.'},
      {n:'Sanación Mayor',  d:0,  acc:100, self:0,  fx:'heal30',   pp:3,  desc:'Restaura 30 HP.'},
      {n:'Drenaje Vital',   d:15, acc:100, self:0,  fx:'drain10',  pp:5,  desc:'Daña 15 y absorbe 10 HP.'},
      {n:'Cañón de Plasma', d:45, acc:70,  self:0,  fx:'recharge', pp:3,  desc:'Súper daño, pierdes próximo turno.'},
    ]},
  libra:      {name:'Libra',      cat:'Zodiaco', sub:'Balanza de Acero',    img:'Libra.png',      el:'aire',  style:'tactico', stats: {atk:62, def:62, spd:62},
    attacks:[
      {n:'Mordisco',        d:20, acc:100, self:0,  fx:null,       pp:99, desc:'Daño directo con los colmillos.'},
      {n:'Reanimar',         d:0,  acc:100, self:0,  fx:'heal20',   pp:5,  desc:'Restaura 20 HP.'},
      {n:'Onda de Choque',  d:18, acc:85,  self:0,  fx:'stun_blind',pp:3,  desc:'Daño + Stun y Ciega.'},
      {n:'Golpe Demoledor', d:29, acc:65,  self:0,  fx:null,       pp:5,  desc:'Brutal, pero impreciso.'},
    ]},
  escorpio:   {name:'Escorpio',   cat:'Zodiaco', sub:'Escorpión Abismal',   img:'Escorpio.png',   el:'agua',  style:'veneno', stats: {atk:65, def:55, spd:70},
    attacks:[
      {n:'Choque',          d:15, acc:100, self:0,  fx:null,       pp:99, desc:'Ataque ligero. Nunca falla.'},
      {n:'Escudo Espejo',   d:0,  acc:100, self:0,  fx:'shield1r', pp:2,  desc:'Bloquea 1 ataque y refleja 15 HP.'},
      {n:'Nube Tóxica',     d:22, acc:85,  self:0,  fx:'poison3l', pp:5,  desc:'Daño + Veneno leve (3 HP/turno).'},
      {n:'Golpe Demoledor', d:29, acc:65,  self:0,  fx:null,       pp:5,  desc:'Brutal, pero impreciso.'},
    ]},
  sagitario:  {name:'Sagitario',  cat:'Zodiaco', sub:'Centauro Cósmico',    img:'Sagitario.png',  el:'fuego', style:'equilibrado', stats: {atk:68, def:55, spd:75},
    attacks:[
      {n:'Mordisco',        d:20, acc:100, self:0,  fx:null,       pp:99, desc:'Daño directo con los colmillos.'},
      {n:'Reanimar',         d:0,  acc:100, self:0,  fx:'heal20',   pp:5,  desc:'Restaura 20 HP.'},
      {n:'Niebla Densa',    d:18, acc:85,  self:0,  fx:'slow2',    pp:4,  desc:'Daño + Ciega 2 turnos.'},
      {n:'Disparo Certero', d:34, acc:80,  self:0,  fx:null,       pp:5,  desc:'Proyectil concentrado.'},
    ]},
  capricornio:{name:'Capricornio',cat:'Zodiaco', sub:'Coba Titán',          img:'Capricornio.png',el:'tierra',style:'defensivo', stats: {atk:50, def:92, spd:35},
    attacks:[
      {n:'Cabezazo',        d:22, acc:100, self:0,  fx:null,       pp:99, desc:'Impacto contundente.'},
      {n:'Estudio',         d:0,  acc:100, self:0,  fx:'analyze',  pp:4,  desc:'Próximos 3 ataques +15% daño.'},
      {n:'Llama Abrasadora',d:18, acc:100, self:0,  fx:'burn',     pp:4,  desc:'Daño + Quema (6 HP/turno).'},
      {n:'Disparo Certero', d:34, acc:80,  self:0,  fx:null,       pp:5,  desc:'Proyectil concentrado.'},
    ]},
  acuario:    {name:'Acuario',    cat:'Zodiaco', sub:'Portador del Rayo',   img:'Acuario.png',    el:'aire',  style:'caos', stats: {atk:72, def:45, spd:85},
    attacks:[
      {n:'Choque',          d:15, acc:100, self:0,  fx:null,       pp:99, desc:'Ataque ligero. Nunca falla.'},
      {n:'Escudo Espejo',   d:0,  acc:100, self:0,  fx:'shield1r', pp:2,  desc:'Bloquea 1 ataque y refleja 15 HP.'},
      {n:'Onda de Choque',  d:18, acc:85,  self:0,  fx:'stun_blind',pp:3,  desc:'Daño + Stun y Ciega.'},
      {n:'Golpe Demoledor', d:29, acc:65,  self:0,  fx:null,       pp:5,  desc:'Brutal, pero impreciso.'},
    ]},
  piscis:     {name:'Piscis',     cat:'Zodiaco', sub:'Leviatán Dual',       img:'Piscis.png',     el:'agua',  style:'soporte', stats: {atk:58, def:68, spd:60},
    attacks:[
      {n:'Azote',           d:19, acc:100, self:0,  fx:null,       pp:99, desc:'Golpe con cola o extremidad.'},
      {n:'Reanimar',         d:0,  acc:100, self:0,  fx:'heal20',   pp:5,  desc:'Restaura 20 HP.'},
      {n:'Nube Tóxica',     d:22, acc:85,  self:0,  fx:'poison3l', pp:5,  desc:'Daño + Veneno leve (3 HP/turno).'},
      {n:'Cañón de Plasma', d:45, acc:70,  self:0,  fx:'recharge', pp:3,  desc:'Súper daño, pierdes próximo turno.'},
    ]},
  irondog:    {name:'Iron Dog',   cat:'Físico',  sub:'Can Cyborg',          img:'IronDog.png',    el:'tierra', style:'equilibrado', stats: {atk:65, def:85, spd:75},
    attacks:[
      {n:'Mordida de Titanio', d:20, acc:100, self:0,  fx:null,       pp:99, desc:'Colmillos de acero que no fallan.'},
      {n:'Muro de Energía',  d:0,  acc:100, self:0,  fx:'shield2',  pp:4,  desc:'Bloquea los próximos 2 ataques.'},
      {n:'Destello Cegador', d:15, acc:85,  self:0,  fx:'blind',    pp:4,  desc:'Daño + Ciega (-30% precisión).'},
      {n:'Golpe Demoledor',  d:29, acc:65,  self:0,  fx:null,       pp:5,  desc:'Brutal, pero impreciso.'},
    ]}
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BEASTS;
}
if (typeof window !== 'undefined') {
  window.BEASTS = BEASTS;
}
