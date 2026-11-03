/* CruzamientosMT — comprobación de distancias reglamentarias
   Fuentes: AED017 V6 (líneas aéreas MT), FED030 V6 (PT), FED029 V7 (CD), ene-2026 */
(function(){
'use strict';

/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const num = x => { if (x === '' || x == null) return NaN; return parseFloat(String(x).replace(',', '.')); };
const fmt = (x, d) => (x == null || isNaN(x)) ? '—' : Number(x).toLocaleString('es-ES', {minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d});
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const store = {
  get(k, d){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
};
function toast(msg){
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2200);
}

/* ---------- estado global ---------- */
const G = Object.assign({inst:'', anio:'', U:15, cond:'desnudo'}, store.get('cmt_global', {}));
if (G.fecha && !G.anio) G.anio = String(G.fecha).slice(0, 4);   // versión anterior guardaba fecha completa
delete G.fecha;
const VALS = store.get('cmt_vals', {});
let INF = store.get('cmt_informe', []);
let TAB = store.get('cmt_tab', 'MT');

/* Cortes de reglamento. Con solo el año, el año del corte queda indeterminado (null). */
const CORTES = [
  {k:'pre1982', y:1982, txt:'01/12/1982'},   // RD 3275/1982 (altura pantallas CD)
  {k:'pre2001', y:2001, txt:'2001', exacto:true}, // L33B: "anteriores a 2001"
  {k:'pre2010', y:2010, txt:'19/03/2010'},   // líneas: RD 223/2008
  {k:'pre2016', y:2016, txt:'09/06/2016'}    // centros: RD 337/2014
];
function eras(){
  const y = parseInt(G.anio, 10);
  const has = !isNaN(y) && y > 1900;
  const e = {anio: has ? y : null, U: num(G.U), cond: G.cond};
  CORTES.forEach(c => {
    if (!has) e[c.k] = null;
    else if (c.exacto) e[c.k] = y < c.y;
    else e[c.k] = y < c.y ? true : y > c.y ? false : null;
  });
  e.known = CORTES.every(c => e[c.k] !== null);
  return e;
}
/* Tramos de fecha entre cortes; cada uno es un escenario completo */
const TRAMOS = [0,1,2,3,4].map(i => {
  const e = {};
  CORTES.forEach((c, j) => e[c.k] = j >= i);
  return e;
});
function tramosPosibles(e){
  const idx = [];
  TRAMOS.forEach((t, i) => { if (CORTES.every(c => e[c.k] === null || e[c.k] === t[c.k])) idx.push(i); });
  return idx;
}
function etiquetaTramo(i, j, first, last){
  const lo = i > first ? CORTES[i - 1] : null, hi = j < last ? CORTES[j] : null;
  const t = c => c.exacto ? c.txt : 'el ' + c.txt;
  if (lo && hi) return `entre ${t(lo)} y ${t(hi)}`;
  if (hi) return `antes de${hi.exacto ? '' : 'l'} ${hi.txt}`;
  if (lo) return `a partir de${lo.exacto ? '' : 'l'} ${lo.txt}`;
  return 'cualquier fecha';
}
const condTxt = c => ({desnudo:'desnudo', recubierto:'recubierto', haz:'aislado en haz'}[c] || c);

/* ---------- resultado estándar ---------- */
// med < min => defecto
function resMin(med, min, unit, base, extra){
  extra = extra || {};
  const r = Object.assign({unit, min, med, lines: base || []}, extra);
  if (min == null) { r.st = 'info'; return r; }
  if (isNaN(med)) { r.st = 'pend'; return r; }
  r.st = med < min ? 'def' : 'ok';
  return r;
}
// med > max => defecto
function resMax(med, max, unit, base){
  const r = {unit, min: max, med, lines: base || [], isMax: true};
  if (isNaN(med)) { r.st = 'pend'; return r; }
  r.st = med > max ? 'def' : 'ok';
  return r;
}
const needDate = () => ({st:'na', lines:['Indica la <b>fecha de puesta en servicio</b> arriba: la distancia depende de ella.']});
const p10 = e => e.pre2010 ? 'anterior al 19/03/2010' : 'posterior al 19/03/2010';
const p16 = e => e.pre2016 ? 'anterior al 09/06/2016' : 'posterior al 09/06/2016';

/* G23B tabla post-2010 (U de la línea superior, distancia apoyo superior al cruce) */
const T23 = [[10,1.95,2.65],[15,2.00,2.70],[20,2.05,2.75],[25,2.13,2.83],[30,2.20,2.90]];
function tablaG23(U, L1){
  const row = T23.find(r => U <= r[0] + 1e-9);
  if (!row) return null;
  return {min: L1 > 25 ? row[2] : row[1], row};
}
/* CD: d según tensión y reglamento */
const dCD = (U, pre) => U <= 20 ? (pre ? 20 : 22) : (pre ? 27 : 32);

/* ---------- comprobaciones ---------- */
const F = {
  med: (label, unit) => ({k:'med', t:'num', label: label || 'Distancia medida', unit: unit || 'm'}),
};

const CHECKS = [
/* ===================== LÍNEAS MT (AED017) ===================== */
{ id:'G23B', g:'MT', title:'Cruce con líneas eléctricas o telecom. Distancia vertical',
  desc:'Distancia vertical entre conductores de ambas líneas en el punto de cruce.',
  fields:[
    {k:'cruce', t:'sel', label:'Cruce con', def:'elec', opts:[['elec','Línea eléctrica'],['tel','Línea de telecomunicaciones']]},
    {k:'pos', t:'sel', label:'Nuestra línea pasa', def:'encima', opts:[['encima','Por encima'],['debajo','Por debajo']], show:v=>v.cruce==='elec'},
    {k:'Uo', t:'num', label:'Tensión de la otra línea', unit:'kV', show:v=>v.cruce==='elec'},
    {k:'condO', t:'sel', label:'Conductor de la otra línea', def:'desnudo', opts:[['desnudo','Desnudo'],['recubierto','Recubierto'],['haz','Aislado en haz']], show:v=>v.cruce==='elec'},
    {k:'L1', t:'num', label:'L1: cruce → apoyo más próximo línea superior', unit:'m'},
    {k:'L2', t:'num', label:'L2: cruce → apoyo más próximo línea inferior', unit:'m', show:(v,e)=>e.pre2010!==false},
    {k:'auto', t:'chk', label:'Existe autorización expresa para cruzar por encima', show:v=>v.cruce==='elec'},
    F.med('Distancia vertical medida entre conductores')
  ],
  calc(v, e){
    const med = num(v.med), L1 = num(v.L1) || 0, L2 = num(v.L2) || 0;
    const elec = v.cruce !== 'tel';
    const Uo = num(v.Uo);
    const ourTop = !elec || v.pos !== 'debajo';
    const Usup = ourTop ? e.U : Uo;
    const lines = [], extraDef = [];
    if (elec && !isNaN(Uo) && !v.auto) {
      const Uarriba = ourTop ? e.U : Uo, Uabajo = ourTop ? Uo : e.U;
      if (Uarriba < Uabajo) extraDef.push(`La línea de menor tensión (${fmt(Uarriba,0)} kV) cruza por encima de la de mayor tensión (${fmt(Uabajo,0)} kV).`);
    }
    if (!e.known) return needDate();
    if (isNaN(Usup)) return {st:'pend', lines:['Indica la tensión de la otra línea.']};
    let min;
    if (e.pre2010) {
      min = 1.5 + (Usup + L1 + L2) / 100;
      lines.push(`Instalación ${p10(e)}: <span class="formula">D2 = 1,5 + (U + L1 + L2)/100 = 1,5 + (${fmt(Usup,1)} + ${fmt(L1,1)} + ${fmt(L2,1)})/100 = ${fmt(min,3)} m</span>`);
      lines.push('U = tensión de la línea superior. Antes de 2010 los cables en haz se tratan como desnudos.');
    } else {
      const ours = e.cond, oth = elec ? v.condO : 'tel';
      const tab = () => {
        const t = tablaG23(Usup, L1);
        if (!t) { lines.push(`U = ${fmt(Usup,0)} kV fuera de la tabla (10–30 kV): consultar.`); return null; }
        lines.push(`Instalación ${p10(e)}: tabla de la guía para U ≤ ${t.row[0]} kV y apoyo superior a ${L1 > 25 ? 'más de' : '25 m o menos de'} 25 m del cruce → <b>${fmt(t.min)} m</b>.`);
        return t.min;
      };
      if (!elec) {
        if (ours === 'haz') { min = 1.0; lines.push('Cable en haz con línea de telecomunicaciones: mínimo 1 m en el caso más desfavorable.'); }
        else if (ours === 'recubierto') { min = 1.5; lines.push('Cable recubierto con línea de telecomunicaciones: mínimo 1,5 m.'); }
        else min = tab();
      } else if (ours === 'haz' && oth === 'haz') {
        lines.push('Cruce entre dos líneas en haz: no hay distancia fija; basta con que no haya rozamientos ni deterioros entre ellas.');
        return {st:'info', lines, extraDef};
      } else if ((ours === 'haz' && oth === 'desnudo') || (ours === 'desnudo' && oth === 'haz')) {
        const Udes = ours === 'desnudo' ? e.U : Uo;
        const hazArriba = (ours === 'haz') === ourTop;
        if (Udes <= 30) {
          min = 0.5;
          lines.push('Cable en haz con línea desnuda ≤ 30 kV: mínimo 0,5 m en el caso más desfavorable.');
          if (hazArriba) extraDef.push('El cable en haz debe ir siempre por debajo de la línea desnuda.');
        } else { lines.push('Línea desnuda > 30 kV: se aplican las distancias de dos líneas desnudas.'); min = tab(); }
      } else {
        if (ours === 'recubierto' || oth === 'recubierto') lines.push('Con conductor recubierto se aplican las mismas distancias que entre líneas desnudas.');
        min = tab();
      }
    }
    if (min == null) return {st:'info', lines, extraDef};
    return resMin(med, min, 'm', lines, {extraDef});
  }
},
{ id:'GA2B', g:'MT', title:'Cruce con líneas. Distancia horizontal a apoyos',
  desc:'Distancia del conductor a los apoyos de otras líneas eléctricas o de telecomunicaciones.',
  fields:[
    {k:'Usup', t:'num', label:'Tensión de la línea superior (si no es la nuestra)', unit:'kV', show:(v,e)=>e.pre2010!==false},
    F.med('Distancia horizontal conductor → apoyo')
  ],
  calc(v, e){
    if (!e.known) return needDate();
    const med = num(v.med);
    if (e.pre2010) {
      const U = isNaN(num(v.Usup)) ? e.U : num(v.Usup);
      const min = 1.5 + U / 150;
      return resMin(med, min, 'm', [`Instalación ${p10(e)}: <span class="formula">D2 = 1,5 + U/150 = 1,5 + ${fmt(U,1)}/150 = ${fmt(min,3)} m</span>`, 'Indicar en observaciones si el cruce es con línea AT, MT, BT o telecomunicaciones.']);
    }
    return resMin(med, 2, 'm', [`Instalación ${p10(e)}: D2 = 2 m (igual para haz y recubierto).`, 'Indicar en observaciones si el cruce es con línea AT, MT, BT o telecomunicaciones.']);
  }
},
{ id:'G53B', g:'MT', title:'Cruce con carreteras. Distancia a la rasante',
  desc:'Distancia vertical de los conductores a la rasante de la calzada (vías del nomenclátor oficial).',
  fields:[
    {k:'estado', t:'chk', label:'Carretera del Estado en obra al amparo del RD 899/2025'},
    F.med('Distancia vertical a la rasante')
  ],
  calc(v){
    const min = v.estado ? 8 : 7;
    return resMin(num(v.med), min, 'm', [v.estado ? 'Carretera del Estado, obra según RD 899/2025: mínimo 8 m.' : 'Mínimo 7 m (también en haz y recubierto).', 'Anotar siempre el código de la vía de comunicación.']);
  }
},
{ id:'G58B', g:'MT', title:'Cruce con ferrocarril sin electrificar',
  desc:'Distancia vertical entre conductores y las cabezas de raíles.',
  fields:[F.med('Distancia vertical a cabeza de raíl')],
  calc(v){ return resMin(num(v.med), 7, 'm', ['Mínimo 7 m (también en haz y recubierto).']); }
},
{ id:'G81B', g:'MT', title:'Cruce con ferrocarril electrificado',
  desc:'Distancia entre los conductores y la catenaria.',
  fields:[F.med('Distancia conductor → catenaria')],
  calc(v, e){
    if (!e.known) return needDate();
    const min = e.pre2010 ? 3 : 4;
    return resMin(num(v.med), min, 'm', [`Instalación ${p10(e)}: D = ${min} m.`]);
  }
},
{ id:'G61B', g:'MT', title:'Cruce con ríos y canales navegables',
  desc:'Distancia vertical en el punto más bajo de la catenaria sobre el cauce.',
  fields:[
    {k:'G', t:'num', label:'Gálibo G (si no se conoce: 4,7)', unit:'m', def:'4.7'},
    {k:'Del', t:'num', label:'Distancia de aislamiento Del (30 kV: 0,27)', unit:'m', def:'0.27'},
    F.med('Distancia vertical al cauce')
  ],
  calc(v){
    const G = isNaN(num(v.G)) ? 4.7 : num(v.G), Del = isNaN(num(v.Del)) ? 0.27 : num(v.Del);
    const min = G + 2.3 + Del;
    return resMin(num(v.med), min, 'm', [`<span class="formula">D = G + 2,3 + Del = ${fmt(G)} + 2,3 + ${fmt(Del)} = ${fmt(min)} m</span>`]);
  }
},
{ id:'G71B', g:'MT', title:'Cruce con teleféricos y cables transportadores',
  desc:'Distancia de los conductores a la catenaria del teleférico o a los cables transportadores.',
  fields:[F.med()],
  calc(v, e){
    if (!e.known) return needDate();
    const min = e.pre2010 ? 4 : 5;
    return resMin(num(v.med), min, 'm', [`Instalación ${p10(e)}: D = ${min} m.`]);
  }
},
{ id:'L21B', g:'MT', title:'Distancia a la masa vegetal',
  desc:'Distancia entre los conductores y el arbolado.',
  fields:[F.med('Distancia conductor → vegetación')],
  calc(v, e){
    if (!e.known) return needDate();
    let min = 2, why;
    if (e.pre2010) why = `Instalación ${p10(e)}: 2 m para líneas desnudas y aisladas.`;
    else if (e.cond === 'desnudo') why = `Instalación ${p10(e)}, conductor desnudo: 2 m.`;
    else if (e.U > 20) why = `Instalación ${p10(e)}, línea aislada de más de 20 kV: 2 m.`;
    else { min = 1.5; why = `Instalación ${p10(e)}, línea aislada (haz o recubierto) ≤ 20 kV: 1,5 m.`; }
    return resMin(num(v.med), min, 'm', [why]);
  }
},
{ id:'L22B', g:'MT', title:'Árbol a más de 2 m con riesgo de caída sobre la línea',
  desc:'Árboles más altos que la línea, a menos distancia que su propia altura, con terreno que hace prever su caída.',
  fields:[
    {k:'hA', t:'num', label:'Altura del árbol', unit:'m'},
    {k:'hL', t:'num', label:'Altura de los conductores', unit:'m'},
    {k:'d', t:'num', label:'Distancia del árbol a la línea', unit:'m'},
    {k:'riesgo', t:'chk', label:'Pendiente, terreno inconsistente o árbol inclinado hacia la línea'}
  ],
  calc(v){
    const hA = num(v.hA), hL = num(v.hL), d = num(v.d);
    if ([hA, hL, d].some(isNaN)) return {st:'pend', lines:['Rellena altura del árbol, de los conductores y distancia.']};
    const lines = [];
    const masAlto = hA > hL, alcanza = d < hA;
    lines.push(`Árbol ${masAlto ? 'más alto' : 'no más alto'} que la línea (${fmt(hA)} m frente a ${fmt(hL)} m).`);
    lines.push(`Distancia ${fmt(d)} m ${alcanza ? '<' : '≥'} altura del árbol ${fmt(hA)} m: ${alcanza ? 'podría alcanzarla' : 'no la alcanza'}.`);
    if (d < 2) lines.push('Está a menos de 2 m: revisa también L21B.');
    if (masAlto && alcanza && !v.riesgo) lines.push('Solo es defecto si la pendiente o el terreno hacen prever su caída.');
    return {st: (masAlto && alcanza && v.riesgo) ? 'def' : 'ok', lines, plain:true};
  }
},
{ id:'L31B', g:'MT', title:'Distancia a edificios en zona accesible',
  desc:'Distancia directa entre el punto accesible del edificio (terraza, balcón…) y el conductor.',
  fields:[F.med('Distancia directa al punto accesible')],
  calc(v, e){
    if (e.cond === 'haz') return resMin(num(v.med), 4, 'm', ['Cable aislado en haz: 4 m sea cual sea la fecha.', 'Un tejado es accesible si tiene algún tipo de terraza.']);
    if (!e.known) return needDate();
    const min = e.pre2010 ? 5 : 6;
    return resMin(num(v.med), min, 'm', [`Instalación ${p10(e)}, conductor ${condTxt(e.cond)}: D = ${min} m.`, 'Un tejado es accesible si tiene algún tipo de terraza.']);
  }
},
{ id:'L32B', g:'MT', title:'Distancia a edificios en zona inaccesible',
  desc:'Edificios, tejados sin terraza, farolas, vallas publicitarias y cualquier zona de riesgo no accesible.',
  fields:[F.med()],
  calc(v, e){
    const min = e.cond === 'haz' ? 2 : 4;
    return resMin(num(v.med), min, 'm', [e.cond === 'haz' ? 'Cable aislado en haz: 2 m.' : `Conductor ${condTxt(e.cond)}: 4 m.`, 'Los apoyos de otras líneas no son edificaciones: usar la distancia de cruce.']);
  }
},
{ id:'L33B', g:'MT', title:'Distancia a edificio solo en proyección horizontal',
  desc:'Distancia en proyección horizontal entre el edificio y el conductor (en su máximo desplazamiento).',
  fields:[
    {k:'acc', t:'sel', label:'Zona del edificio', def:'si', opts:[['si','Accesible'],['no','No accesible']]},
    F.med('Distancia horizontal')
  ],
  calc(v, e){
    if (!e.known) return needDate();
    if (e.pre2001) return {st:'ok', lines:['Instalación anterior a 2001: no hay defecto L33B.'], plain:true};
    return resMin(num(v.med), 5, 'm', ['Instalación posterior a 2001: D = 5 m.', `Indica en observaciones: accesibilidad ${v.acc === 'no' ? 'no' : 'sí'} y época posterior a 2001.`, 'Reversible con carta de mutuo acuerdo si se cumplen el resto de distancias y la seguridad reforzada.']);
  }
},
{ id:'L61B', g:'MT', title:'Distancia vertical al terreno',
  desc:'Distancia vertical de los conductores al punto más próximo del terreno.',
  fields:[
    {k:'expl', t:'chk', label:'Atraviesa explotación ganadera cercada o agrícola'},
    {k:'dif', t:'chk', label:'Lugar de difícil acceso'},
    {k:'rod', t:'chk', label:'No se prevé circulación rodada', show:(v,e)=>e.cond==='haz'},
    {k:'cat', t:'chk', label:'Instalación en Cataluña (D328)', show:v=>v.dif},
    F.med('Distancia vertical al terreno')
  ],
  calc(v, e){
    let min = 6; const lines = [];
    if (v.expl) {
      if (!e.known) return needDate();
      if (!e.pre2010) { min = 7; lines.push(`Instalación ${p10(e)} sobre explotación ganadera o agrícola: 7 m.`); }
      else lines.push('Explotación ganadera/agrícola: los 7 m solo aplican a líneas posteriores a 2010.');
    }
    if (min === 6) {
      if (e.cond === 'haz' && (v.rod || v.dif)) { min = 5; lines.push('Cable en haz sin circulación rodada o de difícil acceso: 5 m.'); }
      else if (v.dif && !v.cat) { min = 5; lines.push('Lugar de difícil acceso: se puede reducir 1 m → 5 m.'); }
      else if (v.dif && v.cat) lines.push('En Cataluña no se permite la reducción por difícil acceso: 6 m.');
      else lines.push('Distancia general: 6 m.');
    }
    return resMin(num(v.med), min, 'm', lines);
  }
},

/* ===================== PT (FED030) ===================== */
{ id:'L37C', g:'PT', title:'Distancia a edificaciones',
  desc:'Distancia directa entre el edificio o construcción y cualquier punto en tensión del PT.',
  fields:[
    {k:'acc', t:'sel', label:'Zona del edificio', def:'si', opts:[['si','Accesible'],['no','Inaccesible (tejado sin terraza, farolas, vallas…)']]},
    F.med('Distancia directa al punto en tensión')
  ],
  calc(v, e){
    if (v.acc === 'no') return resMin(num(v.med), 4, 'm', ['Zona inaccesible: D = 4 m. Farolas, semáforos y vallas publicitarias cuentan como inaccesibles.']);
    if (!e.known) return needDate();
    const min = e.pre2010 ? 5 : 6;
    return resMin(num(v.med), min, 'm', [`Zona accesible, puesta en servicio ${p10(e)}: D = ${min} m.`]);
  }
},
{ id:'L21C', g:'PT', title:'Distancia a la masa vegetal',
  desc:'Distancia entre los conductores o partes en tensión y el arbolado.',
  fields:[F.med('Distancia a la vegetación')],
  calc(v){ return resMin(num(v.med), 2, 'm', ['Mínimo 2 m.']); }
},
{ id:'D12C', g:'PT', title:'Altura sobre el terreno de partes en tensión',
  desc:'Altura de cualquier elemento en tensión sobre el terreno en la base del PT.',
  fields:[
    {k:'cierre', t:'chk', label:'Hay cierre de protección ≥ 2,2 m en horizontal y ≥ 2,5 m de alto (malla ≤ 50×50 cm)'},
    F.med('Altura del elemento en tensión más bajo')
  ],
  calc(v){
    const r = resMin(num(v.med), 5, 'm', ['Mínimo 5 m sobre el terreno.']);
    if (r.st === 'def' && v.cierre) { r.st = 'ok'; r.lines.push('Hay cierre de protección reglamentario: no se considera defecto.'); }
    return r;
  }
},
{ id:'D21C', g:'PT', title:'Altura sobre el terreno de la masa del transformador',
  desc:'Altura del transformador sobre el terreno.',
  fields:[
    {k:'cierre', t:'chk', label:'Hay cierre de protección ≥ 2,2 m en horizontal y ≥ 2,5 m de alto (malla ≤ 50×50 cm)'},
    F.med('Altura de la masa del trafo')
  ],
  calc(v){
    const r = resMin(num(v.med), 3, 'm', ['Mínimo 3 m sobre el terreno.']);
    if (r.st === 'def' && v.cierre) { r.st = 'ok'; r.lines.push('Hay cierre de protección reglamentario: no se considera defecto.'); }
    return r;
  }
},
{ id:'X12C', g:'PT', title:'Embarrado exterior. Separación entre fases',
  desc:'Distancia al aire entre elementos en tensión.',
  fields:[F.med('Separación entre fases', 'cm')],
  calc(v, e){
    const min = e.U <= 20 ? 16 : 27;
    return resMin(num(v.med), min, 'cm', [e.U <= 20 ? '11, 15 y 20 kV: mínimo 16 cm.' : '25 kV: mínimo 27 cm.', 'Basta revisión ocular si es similar a la reglamentaria; nunca medir por contacto.']);
  }
},

/* ===================== CD (FED029) ===================== */
{ id:'X11D', g:'CD', title:'Embarrado interior. Separación entre fases o fase-masa',
  desc:'Distancia al aire entre elementos en tensión y entre éstos y las estructuras metálicas.',
  fields:[F.med('Separación medida', 'cm')],
  calc(v, e){
    const min = e.U <= 20 ? 16 : 27;
    return resMin(num(v.med), min, 'cm', [e.U <= 20 ? '11, 15 y 20 kV: mínimo 16 cm.' : '25 kV: mínimo 27 cm.', 'Basta revisión ocular si es similar a la reglamentaria; nunca medir por contacto.']);
  }
},
{ id:'V41D', g:'CD', title:'Protección de celdas: distancia a puntos en tensión',
  desc:'Distancia horizontal entre la protección de la celda y los puntos en tensión MT. Usa V42D si es la celda del transformador.',
  fields:[
    {k:'celda', t:'sel', label:'Celda', def:'mt', opts:[['mt','Celda MT (V41D)'],['tr','Celda de transformador (V42D)']]},
    {k:'prot', t:'sel', label:'Tipo de protección', def:'enrej', opts:[['noc','Pantalla/tabique macizo no conductor'],['cond','Pantalla/tabique macizo conductor'],['enrej','Pantalla de enrejado'],['bar','Barandillas, listones o cadenas']]},
    F.med('Distancia horizontal protección → punto en tensión', 'cm')
  ],
  code: v => v.celda === 'tr' ? 'V42D' : 'V41D',
  calc(v, e){
    if (!e.known) return needDate();
    const d = dCD(e.U, e.pre2016);
    const lines = [`Centro ${p16(e)}, U = ${fmt(e.U,0)} kV → d = ${d} cm.`];
    let min;
    switch (v.prot) {
      case 'noc': min = d; lines.push(`Tabique macizo no conductor: d = ${min} cm.`); break;
      case 'cond': min = d + 3; lines.push(`Tabique macizo conductor: d + 3 = ${min} cm.`); break;
      case 'bar': min = e.pre2016 ? 80 : 125; lines.push(`Barandillas, listones o cadenas: ${min} cm.`); break;
      default: min = d + 10; lines.push(`Pantalla de enrejado: d + 10 = ${min} cm.`);
    }
    return resMin(num(v.med), min, 'cm', lines);
  }
},
{ id:'V41D-H', g:'CD', codeTxt:'V41D/V42D', title:'Protección de celdas: alturas de pantallas y barandillas',
  desc:'Alturas mínimas/máximas de las protecciones y altura de elementos en tensión sobre pasillos.',
  fields:[
    {k:'celda', t:'sel', label:'Celda', def:'mt', opts:[['mt','Celda MT (V41D)'],['tr','Celda de transformador (V42D)']]},
    {k:'tipo', t:'sel', label:'Comprobar', def:'pant', opts:[['pant','Pantalla (tabique o enrejado)'],['bar','Barandillas, listones o cadenas'],['pas','Altura de elementos en tensión sobre pasillo']]},
    {k:'sup', t:'num', label:'Altura del borde superior de la pantalla', unit:'cm', show:v=>v.tipo==='pant'},
    {k:'inferior', t:'sel', label:'Elementos en tensión en la parte baja', def:'normal', opts:[['normal','Ninguno por debajo de 40 cm'],['bajo','Hay elementos por debajo de 40 cm'],['nada','No hay elementos en la parte inferior de la celda']], show:v=>v.tipo==='pant'},
    {k:'inf', t:'num', label:'Altura del borde inferior de la pantalla', unit:'cm', show:v=>v.tipo==='pant'},
    {k:'pmin', t:'num', label:'Altura del punto en tensión más bajo', unit:'cm', show:v=>v.tipo==='pant'&&v.inferior==='nada'},
    {k:'X', t:'num', label:'Altura del borde superior (cadena: punto más bajo) X', unit:'cm', show:v=>v.tipo==='bar'},
    {k:'n', t:'num', label:'Nº de listones / barandillas / cadenas', unit:'ud', show:v=>v.tipo==='bar'},
    {k:'hueco', t:'num', label:'Mayor hueco libre bajo el listón superior', unit:'cm', show:v=>v.tipo==='bar'},
    {k:'hp', t:'num', label:'Altura de los elementos en tensión sobre el pasillo', unit:'cm', show:v=>v.tipo==='pas'}
  ],
  code: v => v.celda === 'tr' ? 'V42D' : 'V41D',
  calc(v, e){
    const lines = [], fails = [];
    let any = false;
    if (v.tipo === 'pas') {
      if (!e.known) return needDate();
      const d = dCD(e.U, e.pre2016), min = (e.pre2016 ? 230 : 250) + d;
      lines.push(`Centro ${p16(e)}: altura mínima ${e.pre2016 ? 230 : 250} + d = ${min} cm (d = ${d} cm).`);
      return resMin(num(v.hp), min, 'cm', lines);
    }
    if (v.tipo === 'bar') {
      const X = num(v.X), n = num(v.n), h = num(v.hueco);
      if (!isNaN(X)) { any = true; lines.push(`Borde superior ${fmt(X,0)} cm (mínimo 100 cm).`); if (X < 100) fails.push(`Borde superior a ${fmt(X,0)} cm < 100 cm.`); }
      if (!isNaN(n)) { any = true; lines.push(`${fmt(n,0)} elementos (mínimo 3).`); if (n < 3) fails.push(`Solo ${fmt(n,0)} elementos: deben ser al menos 3.`); }
      if (!isNaN(h)) {
        any = true;
        const maxH = isNaN(X) ? 40 : Math.min(0.3 * X, 40);
        lines.push(`Hueco máximo permitido: ${isNaN(X) ? '40 cm' : `30 % de X con máximo 40 = ${fmt(maxH,1)} cm`}.`);
        if (h > maxH) fails.push(`Hueco de ${fmt(h,0)} cm > ${fmt(maxH,1)} cm.`);
      }
    } else {
      const s = num(v.sup), i = num(v.inf);
      if (!isNaN(s)) {
        any = true;
        const minS = e.pre1982 ? 170 : 180;
        lines.push(`Borde superior mínimo ${minS} cm${e.pre1982 ? ' (instalación anterior al RD 3275/1982)' : e.known ? '' : ' (170 cm si es anterior al RD 3275/1982)'}.`);
        if (s < minS) fails.push(`Borde superior a ${fmt(s,0)} cm < ${minS} cm.`);
      }
      if (!isNaN(i)) {
        any = true;
        if (v.inferior === 'nada') {
          const p = num(v.pmin);
          if (isNaN(p)) lines.push('Indica la altura del punto en tensión más bajo.');
          else { const maxI = p - 25; lines.push(`Sin elementos abajo: debe quedar al menos 25 cm hasta el punto en tensión más bajo → borde inferior ≤ ${fmt(maxI,0)} cm.`); if (i > maxI) fails.push(`Borde inferior a ${fmt(i,0)} cm: solo ${fmt(p - i,0)} cm hasta el punto en tensión.`); }
        } else {
          const maxI = v.inferior === 'bajo' ? 20 : 40;
          lines.push(`Borde inferior máximo ${maxI} cm${v.inferior === 'bajo' ? ' (hay elementos en tensión por debajo de 40 cm)' : ''}.`);
          if (i > maxI) fails.push(`Borde inferior a ${fmt(i,0)} cm > ${maxI} cm.`);
        }
      }
    }
    if (!any) return {st:'pend', lines:['Introduce las medidas.']};
    return {st: fails.length ? 'def' : 'ok', lines, extraDef: fails, plain:true};
  }
},
{ id:'V23D', g:'CD', title:'Pasillos no reglamentarios (anchura)',
  desc:'Anchura libre de pasillos de maniobra e inspección, medida entre partes salientes (mandos, manetas, barandillas…).',
  fields:[
    {k:'tipo', t:'sel', label:'Pasillo de', def:'man', opts:[['man','Maniobra'],['insp','Inspección']]},
    {k:'lados', t:'sel', label:'Elementos en alta tensión', def:'uno', opts:[['uno','A un solo lado'],['dos','A ambos lados'],['ninguno','Sin elementos en tensión']]},
    {k:'env', t:'chk', label:'Celdas bajo envolvente aislante (UNE-EN 62271-201)'},
    F.med('Anchura libre del pasillo')
  ],
  calc(v){
    let min; const lines = [];
    if (v.env) { min = 0.8; lines.push('Celdas bajo envolvente aislante: mínimo 0,8 m.'); }
    else if (v.tipo === 'man') {
      min = v.lados === 'dos' ? 1.2 : 1.0;
      lines.push(v.lados === 'dos' ? 'Maniobra con AT a ambos lados: 1,2 m.' : v.lados === 'uno' ? 'Maniobra con AT a un lado: 1 m.' : 'Pasillo de maniobra: 1 m.');
    } else {
      min = v.lados === 'dos' ? 1.0 : 0.8;
      lines.push(v.lados === 'dos' ? 'Inspección con AT a ambos lados: 1 m.' : v.lados === 'uno' ? 'Inspección con AT a un lado: 0,8 m.' : 'Pasillo de inspección: 0,8 m.');
    }
    lines.push('Entre celdas y cuadro BT cuenta como maniobra con tensión a un lado. El tabique macizo y el mando no cuentan como elementos en tensión.');
    return resMin(num(v.med), min, 'm', lines);
  }
},
{ id:'V25D', g:'CD', title:'Iluminación a menos de 1 m de la MT',
  desc:'Acceso a los elementos de iluminación respecto a la MT (defecto si es el único punto de luz).',
  fields:[
    {k:'unico', t:'chk', label:'Es el único punto de iluminación', def:true},
    F.med('Distancia del acceso al punto de luz a la MT')
  ],
  calc(v){
    const r = resMin(num(v.med), 1, 'm', ['Mínimo 1 m respecto a la MT.']);
    if (r.st === 'def' && !v.unico) { r.st = 'ok'; r.lines.push('Hay otros puntos de luz: solo es defecto si este es el único.'); }
    return r;
  }
}
];

/* ---------- valores por comprobación ---------- */
function vals(c){
  if (!VALS[c.id]) VALS[c.id] = {};
  const v = VALS[c.id];
  c.fields.forEach(f => { if (v[f.k] === undefined && f.def !== undefined) v[f.k] = f.def; });
  return v;
}
const codeOf = (c, v) => c.code ? c.code(v) : (c.codeTxt || c.id);

/* ---------- render ---------- */
const lista = $('#lista');
const cardEls = {};

function fieldHTML(c, f, v){
  const id = `f-${c.id}-${f.k}`;
  if (f.t === 'chk') return `<label class="chk fld full" data-k="${f.k}"><input type="checkbox" id="${id}" ${v[f.k] ? 'checked' : ''}/> <span>${f.label}</span></label>`;
  if (f.t === 'sel') return `<label class="fld ${f.opts.length > 2 || f.opts.some(o => o[1].length > 16) ? 'full' : ''}" data-k="${f.k}">${f.label}<select id="${id}">${f.opts.map(o => `<option value="${o[0]}" ${v[f.k] === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></label>`;
  const full = f.k === 'med' ? 'full' : '';
  return `<label class="fld ${full}" data-k="${f.k}">${f.label}${f.unit ? ` (${f.unit})` : ''}<input type="number" id="${id}" inputmode="decimal" step="any" min="0" value="${esc(v[f.k] ?? '')}" /></label>`;
}

function buildCards(){
  lista.innerHTML = '';
  CHECKS.forEach(c => {
    const v = vals(c);
    const el = document.createElement('article');
    el.className = 'chkcard';
    el.dataset.g = c.g;
    el.dataset.search = (c.id + ' ' + (c.codeTxt || '') + ' ' + c.title + ' ' + c.desc).toLowerCase();
    el.innerHTML = `
      <button type="button" class="chkhead" aria-expanded="false">
        <span class="code"></span><span class="ttl">${c.title}</span><span class="pill"></span><span class="chev"></span>
      </button>
      <div class="chkbody">
        <p class="desc">${c.desc}</p>
        <div class="grid fields">${c.fields.map(f => fieldHTML(c, f, v)).join('')}</div>
        <div class="res"></div>
        <div class="addbox">
          <label>Apoyo / vano / ubicación<input type="text" class="ref" placeholder="Ej. Apoyo 14-15" autocomplete="off" /></label>
          <button type="button" class="add">Añadir al informe</button>
        </div>
      </div>`;
    el.querySelector('.chkhead').addEventListener('click', () => {
      const open = el.classList.toggle('open');
      el.querySelector('.chkhead').setAttribute('aria-expanded', open);
    });
    c.fields.forEach(f => {
      const inp = el.querySelector(`#f-${c.id}-${f.k}`);
      const ev = f.t === 'num' ? 'input' : 'change';
      inp.addEventListener(ev, () => {
        v[f.k] = f.t === 'chk' ? inp.checked : inp.value;
        store.set('cmt_vals', VALS);
        update(c);
      });
    });
    el.querySelector('.add').addEventListener('click', () => addToReport(c, el));
    lista.appendChild(el);
    cardEls[c.id] = el;
  });
}

/* Normaliza un resultado de calc */
function finalSt(r){
  const extra = r.extraDef || [];
  let st = r.st;
  if (extra.length && !r.plain && st !== 'na') st = 'def';
  return st;
}
const dec = u => u === 'cm' ? 0 : 2;
const mTxt = r => r.min != null ? `${fmt(r.min, dec(r.unit))} ${r.unit}` : null;
const verdict = st => st === 'def' ? '❗ Defecto' : st === 'ok' ? '✔ No es defecto' : st === 'info' ? 'Comprobación visual' : 'Introduce la medida';
const strip = x => String(x).replace(/<[^>]+>/g, '');

/* Ejecuta la comprobación en todos los tramos de fecha posibles y agrupa los que dan lo mismo */
function evaluar(c, v, e){
  const idx = tramosPosibles(e);
  const runs = idx.map(i => {
    const ee = Object.assign({}, e, TRAMOS[i], {known:true});
    const r = c.calc(v, ee) || {st:'pend', lines:[]};
    r.final = finalSt(r);
    return {i, r, key: JSON.stringify([r.final, r.min, (r.extraDef || []).join('|')])};
  });
  const groups = [];
  runs.forEach(x => {
    const g = groups[groups.length - 1];
    if (g && g.key === x.key) { g.j = x.i; } else groups.push({key: x.key, i: x.i, j: x.i, r: x.r});
  });
  if (groups.length === 1) return groups[0].r;
  const first = idx[0], last = idx[idx.length - 1];
  groups.forEach(g => g.label = etiquetaTramo(g.i, g.j, first, last));
  const sts = groups.map(g => g.r.final);
  const r0 = groups[0].r;
  let st;
  if (sts.every(s => s === 'def')) st = 'def';
  else if (sts.every(s => s === 'ok')) st = 'ok';
  else if (sts.some(s => s === 'pend')) st = 'pend';
  else st = 'dep';
  return {st, final: st, dep: groups, med: r0.med, unit: r0.unit};
}

function update(c){
  const el = cardEls[c.id], v = vals(c), e = eras();
  c.fields.forEach(f => {
    const w = el.querySelector(`.fld[data-k="${f.k}"]`);
    w.hidden = f.show ? !f.show(v, e) : false;
  });
  const code = codeOf(c, v);
  el.querySelector('.code').textContent = code;
  const r = evaluar(c, v, e);
  c._last = r;
  const st = r.final;

  el.classList.remove('st-def', 'st-ok', 'st-dep');
  if (st === 'def' || st === 'ok' || st === 'dep') el.classList.add('st-' + st);
  const pill = el.querySelector('.pill');
  pill.className = 'pill ' + st;
  pill.textContent = st === 'def' ? 'Defecto' : st === 'ok' ? 'Correcto' : st === 'dep' ? 'Según fecha' : '';

  let h = '';
  const hasMed = r.med != null && !isNaN(r.med);
  if (r.dep) {
    h += `<div class="big">${st === 'dep' ? '⚠ Depende de la puesta en servicio' : st === 'pend' ? 'El mínimo depende de la puesta en servicio' : verdict(st) + ' (en cualquier fecha)'}</div>`;
    if (hasMed) h += `<div class="cmp">Medido <b>${fmt(r.med, dec(r.unit))} ${r.unit}</b></div>`;
    h += '<div class="casos">' + r.dep.map(g => {
      const gr = g.r, m = mTxt(gr);
      const det = [...(gr.extraDef || []).map(x => `<b>${x}</b>`), ...(gr.lines || [])];
      return `<div class="caso ${gr.final}">
        <div class="caso-h"><span>Si se puso en servicio <b>${g.label}</b></span><span class="caso-v">${gr.final === 'pend' ? (m ? 'mín. ' + m : '') : verdict(gr.final)}</span></div>
        ${m && gr.final !== 'pend' ? `<div class="caso-m">Mínimo ${m}</div>` : ''}
        ${det.length ? `<ul>${det.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
      </div>`;
    }).join('') + '</div>';
    if (st === 'dep') h += '<p class="nota">No se sabe la fecha exacta: decide tú qué caso aplica.</p>';
  } else {
    const extra = r.extraDef || [];
    const m = mTxt(r);
    if (st === 'def') h += `<div class="big">❗ Defecto ${code}</div>`;
    else if (st === 'ok') h += `<div class="big">✔ No es defecto</div>`;
    else if (st === 'info') h += `<div class="big">Comprobación visual</div>`;
    else if (m) h += `<div class="big">Mínimo reglamentario: ${m}</div>`;
    if (m && hasMed) h += `<div class="cmp">Medido <b>${fmt(r.med, dec(r.unit))} ${r.unit}</b> ${r.st === 'def' ? '<' : '≥'} mínimo <b>${m}</b></div>`;
    const items = [...extra.map(x => `<b>${x}</b>`), ...(r.lines || [])];
    if (items.length) h += `<ul>${items.map(x => `<li>${x}</li>`).join('')}</ul>`;
  }
  const res = el.querySelector('.res');
  res.className = 'res ' + st;
  res.innerHTML = h;
  el.querySelector('.add').disabled = !(st === 'def' || st === 'ok' || st === 'dep');
}

function updateAll(){
  CHECKS.forEach(update);
  renderEras();
  counts();
}

function counts(){
  const n = {MT:0, PT:0, CD:0};
  CHECKS.forEach(c => { if (c._last && (c._last.final === 'def' || c._last.final === 'dep')) n[c.g]++; });
  document.querySelectorAll('#tabs button').forEach(b => {
    const t = b.dataset.tab, cnt = b.querySelector('.cnt');
    cnt.textContent = t === 'INF' ? (INF.length || '') : (n[t] || '');
  });
}

function renderEras(){
  const e = eras();
  const el = $('#eras');
  if (e.anio == null) { el.innerHTML = '<span class="warn">Sin año de puesta en servicio.</span> Puedes seguir: si un defecto depende de la fecha verás los dos casos.'; return; }
  const parts = [];
  const desc = (k, nom, c) => e[k] === null ? `${nom}: <span class="warn">${e.anio} — no se sabe si antes o después del ${c}</span>` : `${nom}: <b>${e[k] ? 'antes' : 'después'} del ${c}</b>`;
  parts.push(desc('pre2010', 'Líneas', '19/03/2010'));
  parts.push(desc('pre2016', 'Centros PT/CD', '09/06/2016'));
  el.innerHTML = parts.join(' · ');
}

/* ---------- pestañas y búsqueda ---------- */
function setTab(t){
  TAB = t; store.set('cmt_tab', t);
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $('#vista-checks').hidden = t === 'INF';
  $('#vista-informe').hidden = t !== 'INF';
  if (t === 'INF') renderReport(); else filter();
}
function filter(){
  const q = $('#buscar').value.trim().toLowerCase();
  Object.values(cardEls).forEach(el => {
    el.hidden = q ? !el.dataset.search.includes(q) : el.dataset.g !== TAB;
  });
}

/* ---------- informe ---------- */
function obsDe(r){
  const d = dec(r.unit);
  if (r.dep) {
    const med = r.med != null && !isNaN(r.med) ? `Medido ${fmt(r.med, d)} ${r.unit}. ` : '';
    return med + r.dep.map(g => {
      const gr = g.r, m = mTxt(gr);
      const extra = (gr.extraDef || []).length ? ' (' + gr.extraDef.map(strip).join(' ') + ')' : '';
      return `P.e.s. ${g.label}: ${m ? 'mín. ' + m + ' → ' : ''}${gr.final === 'def' ? 'DEFECTO' : gr.final === 'ok' ? 'correcto' : 'revisar'}${extra}`;
    }).join('; ');
  }
  let obs;
  if (r.min != null && r.med != null && !isNaN(r.med)) {
    obs = r.final === 'def'
      ? `Distancia mínima medida ${fmt(r.med, d)} ${r.unit} < ${fmt(r.min, d)} ${r.unit} reglamentaria`
      : `Distancia medida ${fmt(r.med, d)} ${r.unit} ≥ ${fmt(r.min, d)} ${r.unit}`;
    if (r.extraDef && r.extraDef.length) obs += '. ' + r.extraDef.map(strip).join(' ');
  } else {
    obs = (r.extraDef && r.extraDef.length ? r.extraDef : (r.lines || []).slice(0, 2)).map(strip).join(' ');
  }
  return obs;
}
const stTxt = s => s === 'def' ? 'DEFECTO' : s === 'dep' ? 'Según fecha' : 'Correcto';

function addToReport(c, el){
  const v = vals(c), r = c._last;
  if (!r || !(r.final === 'def' || r.final === 'ok' || r.final === 'dep')) return;
  const code = codeOf(c, v);
  const refInp = el.querySelector('.ref');
  INF.push({
    t: Date.now(), inst: G.inst, anio: G.anio || '', ref: refInp.value.trim(), code, title: c.title, guia: c.g,
    st: r.final, med: (r.med == null || isNaN(r.med)) ? null : r.med, min: r.dep ? null : (r.min ?? null), unit: r.unit || '', obs: obsDe(r)
  });
  store.set('cmt_informe', INF);
  refInp.value = '';
  counts();
  toast(`${code} añadido al informe`);
}

function renderReport(){
  const ul = $('#inf-lista');
  const nd = INF.filter(x => x.st === 'def').length, np = INF.filter(x => x.st === 'dep').length;
  $('#inf-vacio').hidden = INF.length > 0;
  $('#inf-acciones').hidden = INF.length === 0;
  $('#inf-resumen').innerHTML = INF.length ? `<div class="d"><b>${nd}</b>defectos</div><div class="p"><b>${np}</b>según fecha</div><div class="o"><b>${INF.length - nd - np}</b>correctas</div>` : '';
  ul.innerHTML = INF.map((x, i) => `
    <li class="${x.st}">
      <b>${esc(x.code)}</b> · ${stTxt(x.st)}${x.ref ? ` <span class="ref">· ${esc(x.ref)}</span>` : ''}<br/>
      ${esc(x.obs)}
      <div class="ref">${esc(x.title)}${x.inst ? ' · ' + esc(x.inst) : ''}${x.anio ? ' · p.e.s. ' + esc(x.anio) : ''} · ${new Date(x.t).toLocaleString('es-ES', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'})}</div>
      <button type="button" class="del" data-i="${i}" aria-label="Quitar">×</button>
    </li>`).join('');
  ul.querySelectorAll('.del').forEach(b => b.addEventListener('click', () => {
    INF.splice(+b.dataset.i, 1); store.set('cmt_informe', INF); renderReport(); counts();
  }));
}

function reportText(){
  const hoy = new Date().toLocaleDateString('es-ES');
  const insts = [...new Set(INF.map(x => x.inst).filter(Boolean))];
  const nd = INF.filter(x => x.st === 'def').length;
  let t = `*Revisión de distancias${insts.length ? ' – ' + insts.join(', ') : ''}*\n${hoy} · ${nd} defecto(s) de ${INF.length} comprobaciones\n`;
  const linea = x => `• ${x.code}${x.ref ? ' (' + x.ref + ')' : ''}: ${x.obs}`;
  const bloque = (tit, arr) => arr.length ? `\n${tit}\n` + arr.map(linea).join('\n') + '\n' : '';
  t += bloque('❗ *Defectos*', INF.filter(x => x.st === 'def'));
  t += bloque('⚠ *Según fecha de puesta en servicio*', INF.filter(x => x.st === 'dep'));
  t += bloque('✔ *Correctos*', INF.filter(x => x.st === 'ok'));
  return t;
}

$('#inf-wa').addEventListener('click', () => {
  const t = reportText();
  if (navigator.share) { navigator.share({text: t}).catch(() => {}); return; }
  window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank');
});
$('#inf-copiar').addEventListener('click', () => {
  const t = reportText();
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Texto copiado'), () => {
    const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Texto copiado'); } catch(e){}
    ta.remove();
  });
});
$('#inf-csv').addEventListener('click', () => {
  const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  const n = x => x == null ? '' : String(x).replace('.', ',');
  const head = ['Fecha', 'Hora', 'Instalación', 'Año p.e.s.', 'Apoyo/ubicación', 'Guía', 'Código', 'Descripción', 'Resultado', 'Medido', 'Mínimo', 'Unidad', 'Observaciones'];
  const rows = INF.map(x => {
    const d = new Date(x.t);
    return [d.toLocaleDateString('es-ES'), d.toLocaleTimeString('es-ES', {hour:'2-digit', minute:'2-digit'}), x.inst, x.anio || 'Desconocido', x.ref, x.guia, x.code, x.title, stTxt(x.st), n(x.med), n(x.min), x.unit, x.obs].map(q).join(';');
  });
  const csv = '﻿' + head.map(q).join(';') + '\r\n' + rows.join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
  a.download = `CruzamientosMT_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
$('#inf-borrar').addEventListener('click', e => {
  const b = e.currentTarget;
  if (!b.dataset.armado) {
    b.dataset.armado = '1'; b.textContent = 'Pulsa otra vez para vaciar';
    setTimeout(() => { delete b.dataset.armado; b.textContent = 'Vaciar informe'; }, 3000);
    return;
  }
  delete b.dataset.armado; b.textContent = 'Vaciar informe';
  INF = []; store.set('cmt_informe', INF); renderReport(); counts();
});

/* ---------- datos globales ---------- */
function bindGlobal(){
  const inst = $('#g-inst'), anio = $('#g-anio'), U = $('#g-U');
  inst.value = G.inst; anio.value = G.anio; U.value = G.U;
  const save = () => store.set('cmt_global', G);
  inst.addEventListener('input', () => { G.inst = inst.value; save(); });
  anio.addEventListener('input', () => { G.anio = anio.value.replace(/\D/g, '').slice(0, 4); save(); updateAll(); });
  $('#g-anio-x').addEventListener('click', () => { anio.value = ''; G.anio = ''; save(); updateAll(); });
  U.addEventListener('input', () => { G.U = U.value; save(); updateAll(); });
  const seg = $('#g-cond');
  const paint = () => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === G.cond));
  seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { G.cond = b.dataset.v; save(); paint(); updateAll(); }));
  paint();
}

document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => { $('#buscar').value = ''; setTab(b.dataset.tab); }));
$('#buscar').addEventListener('input', filter);

bindGlobal();
buildCards();
updateAll();
setTab(TAB);

/* exponer para pruebas */
window.__CMT = {CHECKS, eras, G};
})();
