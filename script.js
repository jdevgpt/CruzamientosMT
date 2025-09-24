document.getElementById('analizar').addEventListener('click', function(){
  const tipo = document.getElementById('tipo').value;
  const U = parseFloat(document.getElementById('U').value) || 0;
  const L1 = parseFloat(document.getElementById('L1').value) || 0;
  const L2 = parseFloat(document.getElementById('L2').value) || 0;
  const medida = parseFloat(document.getElementById('medida').value);
  const antes2010 = document.getElementById('antes2010').checked;
  const tipoConductor = document.getElementById('tipoConductor').value;

  const resumenEl = document.getElementById('resumen');
  const detalleEl = document.getElementById('detalle');
  const card = document.getElementById('resultadoCard');

  if (isNaN(medida)){
    alert('Introduce una distancia medida válida.');
    return;
  }

  let hallazgos = [];
  let explicaciones = [];

  // Ejemplo: Cruce línea ↔ línea (vertical) con G23B
  if (tipo === 'linea-linea'){
    if (antes2010){
      const D2 = 1.5 + (U + L1 + L2) / 100;
      explicaciones.push(`G23B (antes 2010): D2 = 1.5 + (U+L1+L2)/100 = ${D2.toFixed(3)} m`);
      if (medida < D2) hallazgos.push({codigo:'G23B', texto:`${medida} m < ${D2.toFixed(3)} m`});
    } else {
      let min = (tipoConductor === 'unipolar') ? 0.5 : 1.0;
      explicaciones.push(`G23B (post 2010): mínimo ${min} m`);
      if (medida < min) hallazgos.push({codigo:'G23B', texto:`${medida} m < ${min} m`});
    }
  }

  // Cruce horizontal GA2B
  if (tipo === 'linea-linea' || tipo === 'linea-carretera' || tipo === 'linea-ferrocarril'){
    if (antes2010){
      const D2ga = 1.5 + U/150;
      explicaciones.push(`GA2B (antes 2010): D2 = 1.5 + U/150 = ${D2ga.toFixed(3)} m`);
      if (medida < D2ga) hallazgos.push({codigo:'GA2B', texto:`${medida} m < ${D2ga.toFixed(3)} m`});
    } else {
      if (medida < 2.0) hallazgos.push({codigo:'GA2B', texto:`${medida} m < 2.0 m`});
      else explicaciones.push('GA2B: cumple con ≥ 2.0 m');
    }
  }

  // Carreteras G53B
  if (tipo === 'linea-carretera'){
    if (medida < 7.0) hallazgos.push({codigo:'G53B', texto:`${medida} m < 7.0 m`});
    else explicaciones.push('G53B: cumple con ≥ 7.0 m');
  }

  // Edificios L31B / L32B
  if (tipo === 'linea-edificio'){
    const lim = antes2010 ? 5.0 : 6.0;
    if (medida < lim) hallazgos.push({codigo:'L31B', texto:`${medida} m < ${lim} m`});
    const lim32 = (tipoConductor === 'unipolar') ? 2.0 : 4.0;
    if (medida < lim32) hallazgos.push({codigo:'L32B', texto:`${medida} m < ${lim32} m`});
  }

  // Río / Canal G61B (ejemplo)
  if (tipo === 'linea-rio'){
    const G = 4.7, Del = 0.27;
    const D = G + 2.3 + Del;
    if (medida < D) hallazgos.push({codigo:'G61B', texto:`${medida} m < ${D.toFixed(2)} m`});
  }

  // Resultado
  let resumenTxt = hallazgos.length === 0
    ? 'No se han detectado defectos ✅'
    : `Detectados ${hallazgos.length} defecto(s): ${hallazgos.map(h=>h.codigo).join(', ')} ❗`;

  resumenEl.textContent = resumenTxt;
  detalleEl.innerText = hallazgos.map(h=>`${h.codigo}: ${h.texto}`).join('\n') || 'Ninguno';
  card.hidden = false;
  card.scrollIntoView({behavior:'smooth'});
});
