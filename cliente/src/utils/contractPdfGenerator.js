import jsPDF from 'jspdf';

/* ─────────────── Utilidades de conversión ─────────────── */
const UNIDADES = ['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve',
  'diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve',
  'veinte','veintiuno','veintidós','veintitrés','veinticuatro','veinticinco','veintiséis','veintisiete','veintiocho','veintinueve'];
const DECENAS  = ['','','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
const CENTENAS = ['','ciento','doscientos','trescientos','cuatrocientos','quinientos','seiscientos','setecientos','ochocientos','novecientos'];

function cientos(n){
  if(n===100) return 'cien';
  const c=Math.floor(n/100), resto=n%100;
  if(resto===0) return CENTENAS[c];
  if(resto<30)  return CENTENAS[c]+(c?' ':'')+(UNIDADES[resto]||'');
  const d=Math.floor(resto/10), u=resto%10;
  return CENTENAS[c]+(c?' ':'')+DECENAS[d]+(u?' y '+UNIDADES[u]:'');
}

const numeroALetras = (n)=>{
  n=Math.floor(n);
  if(n===0) return 'cero';
  if(n<0)   return 'menos '+numeroALetras(-n);
  let txt='';
  if(n>=1000000){ txt+=numeroALetras(Math.floor(n/1000000))+(Math.floor(n/1000000)===1?' millón':' millones')+' '; n%=1000000; }
  if(n>=1000){    const m=Math.floor(n/1000); txt+=(m===1?'mil':cientos(m)+' mil')+' '; n%=1000; }
  if(n>0)         txt+=cientos(n);
  return txt.trim();
};

const monedaLetras = n =>{
  const s=numeroALetras(Math.floor(n));
  return s.charAt(0).toUpperCase()+s.slice(1)+' Quetzales Exactos';
};

const MESES_PALABRAS = {1:'enero',2:'febrero',3:'marzo',4:'abril',5:'mayo',6:'junio',
  7:'julio',8:'agosto',9:'septiembre',10:'octubre',11:'noviembre',12:'diciembre'};
const mesLetras   = m => MESES_PALABRAS[parseInt(m)] || '';
const anioLetras  = y =>{ const n=parseInt(y); return n>=2000?'dos mil '+numeroALetras(n-2000):numeroALetras(n); };
const diaLetras   = d => numeroALetras(parseInt(d));

/* ─────────────── Generador principal ─────────────── */
export const generarPdfContrato = (datosContrato={}, datosResidente={}) => {
  const doc = new jsPDF('p','mm','letter');
  const PW  = doc.internal.pageSize.getWidth();
  const PH  = doc.internal.pageSize.getHeight();
  const ML  = 18, MR = 18, MT = 18, MB = 18;
  const TW  = PW - ML - MR;

  /* ── dibujar borde dorado en cada página ── */
  const drawBorder = () => {
    doc.setDrawColor(180, 140, 0);
    doc.setLineWidth(1.5);
    doc.rect(10, 10, PW-20, PH-20);
    doc.setLineWidth(0.5);
    doc.rect(12, 12, PW-24, PH-24);
  };

  /* ── estado interno ── */
  let y = MT;
  // eslint-disable-next-line no-unused-vars
  let currentPage = 1;

  const newPage = () => {
    doc.addPage();
    currentPage++;
    drawBorder();
    y = MT;
  };

  const checkY = (needed=5) => { if(y + needed > PH - MB) newPage(); };

  /* ── fuente base ── */
  doc.setFont('Times','normal');
  doc.setFontSize(10);
  drawBorder();

  /* ═══ Función simple: texto normal justificado ═══ */
  const addPara = (text, extraSpacing=2) => {
    const lines = doc.splitTextToSize(text, TW);
    lines.forEach((line, i) => {
      checkY(5);
      if(i < lines.length - 1){
        // justificar
        const words = line.trim().split(' ').filter(w=>w);
        if(words.length > 1){
          doc.setFont('Times','normal');
          const totalW = words.reduce((acc,w)=>acc+doc.getTextWidth(w),0);
          const gap    = (TW - totalW)/(words.length-1);
          let cx = ML;
          words.forEach(w=>{ doc.text(w,cx,y); cx+=doc.getTextWidth(w)+gap; });
        } else { doc.setFont('Times','normal'); doc.text(line,ML,y); }
      } else { doc.setFont('Times','normal'); doc.text(line,ML,y); }
      y += 4.8;
    });
    y += extraSpacing;
  };

  /* ═══ Datos del contrato ═══ */
  const fechaFirmaObj = datosContrato.fecha_firma ? new Date(datosContrato.fecha_firma) : new Date();
  const diaFirma  = datosContrato.dia_firma  || fechaFirmaObj.getDate();
  const mesFirma  = datosContrato.mes_firma  || (fechaFirmaObj.getMonth()+1);
  const anioFirma = datosContrato.anio_firma || fechaFirmaObj.getFullYear();

  const diaFirmaLetras  = diaLetras(diaFirma);
  const mesFirmaLetras  = mesLetras(mesFirma);
  const anioFirmaLetras = anioLetras(anioFirma);

  // Vendedor
  const vNombre    = datosContrato.nombre_vendedor     || 'DULCE MARIA OSORIO SABAN DE PEREZ';
  const vEdad      = datosContrato.edad_vendedor       || 'veintinueve';
  const vEstCivil  = datosContrato.estado_civil_vendedor || 'casada';
  const vProfesion = datosContrato.profesion_vendedor  || 'ejecutiva de negocios';
  const vDpi       = datosContrato.dpi_vendedor        || '3003 09864 0101';
  const vEmpresa   = datosContrato.empresa_vendedor    || 'CORPORACION DE PROYECTOS Y VIVIENDAS, SOCIEDAD ANONIMA';
  const vNotario   = datosContrato.notario             || 'Alma Karina Aguilar Chávez';
  const vFechaNomb = datosContrato.fecha_nombramiento  || 'siete de octubre del año dos mil veinticinco';
  const vRegNum    = datosContrato.registro_numero     || '810,559';
  const vRegFolio  = datosContrato.registro_folio      || '120';
  const vRegLibro  = datosContrato.registro_libro      || '853';

  // Comprador
  const cNombre    = datosResidente.nombre             || '[NOMBRE COMPRADOR]';
  const cEdad      = datosResidente.edad               || '[EDAD]';
  const cEstCivil  = datosResidente.estado_civil       || '[ESTADO CIVIL]';
  const cProfesion = datosResidente.profesion          || '[PROFESIÓN]';
  const cDpi       = datosResidente.numero_identificacion || '[DPI]';

  // Propiedad
  const pFinca    = datosContrato.numero_finca       || '30052';
  const pFolio    = datosContrato.folio_propiedad    || '133';
  const pLibro    = datosContrato.libro_propiedad    || '268';
  const pLote     = datosContrato.numero_lote        || '1';
  const pManzana  = datosContrato.manzana_propiedad  || 'A';
  const pArea     = datosContrato.area_propiedad     || '89.65';
  const pProyecto = datosContrato.proyecto_propiedad || 'VILLAS DE TAPACUN';
  const mNorte    = datosContrato.medida_norte       || '15.00';
  const mSur      = datosContrato.medida_sur         || '15.00';
  const mOriente  = datosContrato.medida_oriente     || '15.00';
  const mPoniente = datosContrato.medida_poniente    || '15.00';

  // Números económicos
  const mTotal    = parseFloat(datosContrato.monto_total)        || 120000;
  const enganche  = parseFloat(datosContrato.enganche)           || 20000;
  const capRest   = mTotal - enganche;
  const intPct    = parseFloat(datosContrato.interes_porcentaje) || 14;
  const intMonto  = capRest * (intPct/100);
  const totalCInt = capRest + intMonto;
  const nCuotas   = parseInt(datosContrato.cuotas_pactadas)      || 60;
  const vCuota    = parseFloat(datosContrato.monto_cuota)        || parseFloat((capRest/nCuotas).toFixed(2));
  const ultCuota  = parseFloat((totalCInt - vCuota*(nCuotas-1)).toFixed(2));
  const mora      = parseFloat(datosContrato.mora)               || 600;
  const diaPago   = datosContrato.dia_pago_limite                || '5';
  const plazo     = parseInt(datosContrato.plazo_meses)          || 60;
  const pctDominio= parseInt(datosContrato.porcentaje_dominio)   || 80;
  const mesInicio = datosContrato.mes_inicio_pagos               || '7';
  const anioIni   = datosContrato.anio_inicio_pagos              || '2026';

  // Convertir a palabras
  const fmt = n => parseFloat(n).toLocaleString('es-GT',{minimumFractionDigits:2});

  /* ══════════════════════════════════════════════════════════════
     CUERPO DEL CONTRATO
  ══════════════════════════════════════════════════════════════ */

  // Párrafo introductorio
  addPara(
    `En la Ciudad Capital, departamento de Guatemala, el día ${diaFirmaLetras} de ${mesFirmaLetras} del año ${anioFirmaLetras}. ` +
    `Comparezco accionando por una parte yo ${vNombre} de ${vEdad} años de edad, ${vEstCivil}, guatemalteca, ${vProfesion}, ` +
    `de este domicilio, me identifico con el Documento Personal de Identificación (D.P.I.) con Código Único de Identificación (C.U.I.) número ${vDpi} ` +
    `extendido por el Registro Nacional de las Personas de la República de Guatemala, comparezco en nombre propio y en mi calidad de ` +
    `ADMINISTRADOR ÚNICO Y REPRESENTANTE LEGAL de la Entidad denominada ${vEmpresa}, extremo que acredito con el Acta Notarial de mi Nombramiento, ` +
    `faccionada en la Ciudad de Guatemala, el día ${vFechaNomb}, por la Notario ${vNotario}, encontrándose debidamente inscrita en el Registro Mercantil General ` +
    `de República al número ${vRegNum}; folio ${vRegFolio}; del libro ${vRegLibro} de Auxiliares de Comercio, con fecha diecisiete de octubre del año dos mil veinticinco ` +
    `y en el transcurso de este instrumento se me dominará "LA PARTE VENDEDORA".`
  );

  addPara(
    `Y, por la otra parte ${cNombre} de ${cEdad} años de edad, ${cEstCivil}, ${cProfesion}, guatemalteco, de este domicilio, ` +
    `me identifico con el Documento Personal de Identificación (D.P.I) con número de Código Único de Identificación (C.U.I) número ${cDpi} ` +
    `extendido por el Registro Nacional de las Personas de la República de Guatemala, actúo en nombre propio y en el transcurso de este instrumento ` +
    `se me denominará "LA PARTE COMPRADORA".`
  );

  addPara(
    `Aseguramos los comparecientes ser de los datos de identificación personal consignados, hallarnos en el libre ejercicio de nuestros derechos civiles ` +
    `y que por este acto otorgamos CONTRATO DE PROMESA DE COMPRAVENTA POR ABONOS DE FRACCIÓN DE BIEN INMUEBLE, EN DOCUMENTO PRIVADO CON LEGALIZACIÓN ` +
    `NOTARIAL DE FIRMAS. De conformidad con las siguientes cláusulas:`
  );

  // CLÁUSULAS
  addPara(
    `PRIMERA: "LA PARTE VENDEDORA" con la calidad con que actuó, manifiesto ser la legítima propietaria del bien inmueble inscrito en el Registro General ` +
    `de la Propiedad de la Zona Central bajo el número de finca: ${numeroALetras(parseInt(pFinca)).toUpperCase()} (${pFinca}); folio: ` +
    `${numeroALetras(parseInt(pFolio)).toUpperCase()} (${pFolio}); libro: ${numeroALetras(parseInt(pLibro)).toUpperCase()} (${pLibro}) de Guatemala.`
  );

  addPara(
    `SEGUNDA: "LA PARTE VENDEDORA" con la calidad con que actuó, manifiesto que por este acto prometo en venta a "LA PARTE COMPRADORA" una fracción ` +
    `que deberá ser desmembrada de la finca identificada o de la finca que se especifique en un futuro, fracción que se identifica con el número de lote ` +
    `${numeroALetras(parseInt(pLote)).toUpperCase()} de la manzana ${pManzana} (${pLote}${pManzana}), que cuenta con un área de ` +
    `${numeroALetras(parseInt(pArea.split('.')[0])).toUpperCase()} punto ${pArea.split('.')[1]||'00'} metros cuadrados (${pArea}mts²) del proyecto ` +
    `denominado ${pProyecto}, con las siguientes medidas y colindancias. NORTE: del punto cero al punto observado uno, una distancia de ` +
    `${numeroALetras(parseInt(mNorte)).toUpperCase()} punto ${mNorte.split('.')[1]||'00'} metros (${mNorte} mts), que colinda con lote tres de la manzana ${pManzana}. ` +
    `SUR: del punto dos al punto observado tres una distancia de ${numeroALetras(parseInt(mSur)).toUpperCase()} punto ${mSur.split('.')[1]||'00'} metros ` +
    `(${mSur} mts), que colinda con lote tres de la manzana ${pManzana}. En las medidas ya está incluido un derecho de banqueta. ORIENTE: del punto uno ` +
    `al punto observado dos una distancia de ${numeroALetras(parseInt(mOriente)).toUpperCase()} punto ${mOriente.split('.')[1]||'00'} metros (${mOriente} mts), ` +
    `que colinda con lote tres de la manzana ${pManzana}. PONIENTE: del punto tres al punto observado cero una distancia de ` +
    `${numeroALetras(parseInt(mPoniente)).toUpperCase()} punto ${mPoniente.split('.')[1]||'00'} metros (${mPoniente} mts), que colinda con lote tres ` +
    `de la manzana ${pManzana}. En las medidas ya está incluido un derecho de banqueta.`
  );

  addPara(
    `TERCERA: La fracción vendida contará con los siguientes servicios: A) EL AGUA: La fracción especificada contará con el servicio de agua potable ` +
    `el cual se establecerá si será municipal o privado. B) POSTEADO ELÉCTRICO: el posteado eléctrico será instalado por "LA PARTE VENDEDORA" encargándose ` +
    `de los trámites y gastos necesarios para su instalación. C) SERVICIO DE SANEAMIENTO: "LA PARTE VENDEDORA" se compromete a realizar la estructura ` +
    `de los pozos de absorción para drenajes, mismos a los que "LA PARTE COMPRADORA" se compromete a conectarse por medio de un biodigestor. D) CALLES: ` +
    `"LA PARTE VENDEDORA" se compromete a realizar la estructura de las calles al momento de terminar la estructura de los pozos de absorción para drenajes.`
  );

  // CUARTA (TÉRMINOS ECONÓMICOS)
  addPara(
    `CUARTA: El contrato de venta se da bajo las siguientes condiciones: A) DEL PRECIO. El precio del bien inmueble es de ` +
    `${monedaLetras(mTotal).toUpperCase()} (Q. ${fmt(mTotal)}), de los cuales "LA PARTE COMPRADORA" el día dieciocho de junio del presente año ` +
    `entrego la cantidad de ${monedaLetras(enganche).toUpperCase()} (Q.${fmt(enganche)}) en calidad de primera y única cuota de enganche. ` +
    `B) DEL CAPITAL RESTANTE SIN INTERESES. El capital restante sin intereses es de ${monedaLetras(capRest).toUpperCase()} (Q. ${fmt(capRest)}). ` +
    `C) DE LOS INTERESES. El capital restante devengara un interés del ${intPct} por ciento anual variable. D) DEL CAPITAL RESTANTE CON INTERESES. ` +
    `El capital restante con intereses es de ${monedaLetras(totalCInt).toUpperCase()} (Q. ${fmt(totalCInt)}). E) DE LA FORMA DE PAGO. ` +
    `"LA PARTE COMPRADORA" cancelara en ${numeroALetras(nCuotas-1).toUpperCase()} CUOTAS de ${monedaLetras(vCuota).toUpperCase()} (Q. ${fmt(vCuota)}) ` +
    `cada una y UNA ULTIMA cuota de ${monedaLetras(ultCuota).toUpperCase()} (Q ${fmt(ultCuota)}), sin necesidad de cobro ni requerimiento alguno. ` +
    `F) EL LUGAR DE PAGO. El pago se realizará el día ${numeroALetras(parseInt(diaPago)).toUpperCase()} de cada mes a partir del mes de ` +
    `${mesLetras(mesInicio)} del año ${anioLetras(anioIni)}, sin necesidad de cobro ni requerimiento alguno hasta solventar completamente la obligación ` +
    `contraída; y en caso de incumplimiento de uno o más abonos consecutivos da derecho a "LA PARTE VENDEDORA" a cobrar una MORA de ` +
    `${monedaLetras(mora).toUpperCase()} (Q.${fmt(mora)}) POR CADA MES VENCIDO HASTA PONERSE AL DÍA. G) EL PLAZO. El plazo del presente contrato ` +
    `es de ${numeroALetras(plazo).toUpperCase()} MESES, a partir de la fecha de inicio de los pagos como fecha límite para cumplir con lo establecido ` +
    `y que puede ser prorrogado según convenga a los intereses de "LA PARTE VENDEDORA". H) "LA PARTE COMPRADORA" podrá hacer abonos a capital. ` +
    `I) CESIÓN DEL CRÉDITO: El presente crédito podrá ser cedido, negociado o enajenado de cualquier forma por " LA PARTE VENDEDORA" sin necesidad ` +
    `de previo aviso o posterior notificación a "LA PARTE COMPRADORA", y sin menoscabar los derechos adquiridos por "LA PARTE COMPRADORA". J) ` +
    `La presente compraventa se otorga con PACTO DE RESERVA DE DOMINIO a favor de " LA PARTE VENDEDORA " hasta que "LA PARTE COMPRADORA" haya ` +
    `cancelado el ${numeroALetras(pctDominio).toUpperCase()} por ciento (${pctDominio}%) del precio total del inmueble en mención. Haciendo constar ` +
    `que "LA PARTE COMPRADORA" no podrá hacer ningún tramité o gestión ante las autoridades municipales o cualquier otra empresa pública o privada ` +
    `sin autorización escrita de "LA PARTE VENDEDORA". K) El bien inmueble que hoy se promete en venta será utilizado única y exclusivamente para ` +
    `construir vivienda formal quedando prohibido darle cualquier otro uso.`
  );

  addPara(
    `QUINTA: Manifiesto "LA PARTE VENDEDORA" en forma expresa que sobre el bien inmueble que por este acto vendo no pesan gravámenes anotaciones, ` +
    `o limitaciones que puedan afectar los derechos de "LA PARTE COMPRADORA", comprometiéndome en la calidad con que actuó en todo caso al saneamiento ` +
    `de ley. Y al estar debidamente cancelado el inmueble "LA PARTE VENDEDORA" asumo el compromiso de otorgar la escritura traslativa de dominio con el ` +
    `Notario que la misma designe; CORRIENDO LOS GASTOS E IMPUESTOS a los que esta afecto el contrato de compraventa respectivo, mismos que se cancelaran ` +
    `a la Superintendencia de Administración Tributaria (SAT) y al Registro General de la Propiedad, por "LA PARTE COMPRADORA". Haciendo constar que al ` +
    `estar cancelado en su totalidad se fraccionará la escritura correspondiente a nombre del señor ${cNombre} y la misma deberá inscribirse en el Registró ` +
    `General de la Propiedad.`
  );

  addPara(
    `SEXTA: Manifestamos los comparecientes que en caso de incumplimiento del pago de tres o más cuotas en la forma y fecha establecidas en este contrato, ` +
    `o en caso de arrepentimiento por cualquier circunstancia de "LA PARTE COMPRADORA" o cualquier otra circunstancia que la empresa así lo considere, ` +
    `perderá el dinero que hasta el momento haya entregado sin tener derecho a devolución de dinero ni a indemnización alguna; se tendrá por rescindido este ` +
    `contrato sin necesidad de demanda ni entrega judicial y si fuera el caso da derecho a que la otra parte demande y utilice este documento como título ` +
    `ejecutivo y para el efecto "LA PARTE COMPRADORA" renuncia al fuero de su domicilio y señala como lugar para recibir notificaciones: ` +
    `Lote cinco A Colonia El Recreo San José, El Tablón, Villa Canales. Y autoriza a "LA PARTE VENDEDORA" a rescindir este contrato y se compromete ` +
    `a devolver el bien inmueble descrito sin necesidad de demanda ni entrega judicial.`
  );

  addPara(
    `SÉPTIMA: "LA PARTE VENDEDORA", se reserva el derecho de realizar la venta o negociación hasta que "LA PARTE COMPRADORA" haya cancelado su última ` +
    `cuota pudiendo ser devuelta la cantidad entregada en la misma forma y plazo en que se recibió sin responsabilidad alguna como intereses, daños y ` +
    `perjuicios y otros de "LA PARTE VENDEDORA", haciendo constancia que se descontará un veinticinco por ciento del valor total entregado por gastos ` +
    `administrativos.`
  );

  addPara(
    `OCTAVA: Manifestamos los otorgantes que en los términos relacionados aceptamos CONTRATO DE PROMESA DE COMPRAVENTA POR ABONOS DE FRACCIÓN DE BIEN ` +
    `INMUEBLE, EN DOCUMENTO PRIVADO CON LEGALIZACIÓN NOTARIAL DE FIRMAS, que por este acto se hace. Todos leemos lo escrito y enterados de su contenido, ` +
    `objeto, validez y efectos legales, lo aceptamos, ratificamos, firmamos y para mayor certeza jurídica dejamos la impresión dactilar de nuestros dedos ` +
    `pulgares derechos.`
  );

  /* ═══════════════════════════════════════════════════════════
     PÁGINA DE FIRMAS
  ═══════════════════════════════════════════════════════════ */
  newPage();
  
  // Encabezado de página de firmas
  y = MT + 10;
  doc.setFont('Times','bold');
  doc.setFontSize(14);
  doc.text('FIRMAS DE LAS PARTES', PW/2, y, { align: 'center' });
  
  y += 20;
  
  // Sección vendedor (izquierda)
  doc.setFont('Times','normal');
  doc.setFontSize(10);
  
  // Línea de firma vendedor
  doc.line(ML, y, ML + (TW/2 - 5), y);
  y += 8;
  
  // Nombre vendedor
  doc.setFont('Times','bold');
  doc.text(vNombre, ML, y, { maxWidth: TW/2 - 5 });
  doc.setFont('Times','normal');
  y += 8;
  doc.setFontSize(9);
  doc.text(`D.P.I.: ${vDpi}`, ML, y);
  
  // Sección comprador (derecha)
  y = MT + 28;
  doc.setFont('Times','normal');
  doc.setFontSize(10);
  
  // Línea de firma comprador
  doc.line(ML + TW/2 + 5, y, ML + TW - 5, y);
  y += 8;
  
  // Nombre comprador
  doc.setFont('Times','bold');
  doc.text(cNombre, ML + TW/2 + 5, y, { maxWidth: TW/2 - 10 });
  doc.setFont('Times','normal');
  y += 8;
  doc.setFontSize(9);
  doc.text(`D.P.I.: ${cDpi}`, ML + TW/2 + 5, y);
  
  // Fecha de firma
  y = MT + 60;
  doc.setFont('Times','normal');
  doc.setFontSize(10);
  doc.text(`Firma en: Guatemala, ${diaFirmaLetras} de ${mesLetras(mesFirma)} del año ${anioLetras(anioFirma)}`, ML, y);
  
  y += 15;
  // Sello/lugar para notario
  doc.setFont('Times','italic');
  doc.setFontSize(9);
  doc.text('(Espacio reservado para sello y firma del notario)', ML, y);

  /* ═══════════════════════════════════════════════════════════
     PÁGINA DE LEGALIZACIÓN NOTARIAL
  ═══════════════════════════════════════════════════════════ */
  newPage();

  const mesNotL  = mesLetras(datosContrato.mes_legalizacion || mesFirma);
  const anioNotL = anioLetras(datosContrato.anio_legalizacion || anioFirma);

  addPara(
    `En la Ciudad Capital, Departamento de Guatemala, el día ${diaFirmaLetras} de ${mesNotL} del año ${anioNotL}. Como Notario doy fe: ` +
    `a) Que las firmas que anteceden SON AUTENTICAS por haber sido puestas el día de hoy en mi presencia por ${vNombre} quien se identifica ` +
    `con el documento personal de identificación (D.P.I) con código único de identificación (C.U.I) número ${vDpi} extendido por el Registro ` +
    `Nacional de las Personas de la República de Guatemala, y el señor ${cNombre}, quien se identifica con el documento personal de identificación ` +
    `(D.P.I) con número de código único de identificación (C.U.I) número ${cDpi} extendido por el Registro Nacional de las Personas de la República ` +
    `de Guatemala. b) Que las firmas calzan CONTRATO DE PROMESA DE COMPRAVENTA POR ABONOS DE FRACCIÓN DE BIEN INMUEBLE, EN DOCUMENTO PRIVADO CON ` +
    `LEGALIZACIÓN NOTARIAL DE FIRMAS y, c) De que los signatarios firman nuevamente conmigo en la presente Acta de Legalización de firmas y además ` +
    `dejan la impresión dactilar de su dedo pulgar derecho.`
  );

  y += 20;
  checkY(20);
  doc.setFont('Times','normal');
  doc.setFontSize(10);
  doc.text('F. ________________________________', ML, y);
  doc.text('F. ________________________________', ML + TW/2, y);
  y += 8;
  doc.setFont('Times','bold');
  doc.text(vNombre, ML, y);
  doc.text(cNombre, ML + TW/2, y);
  doc.setFont('Times','normal');
  y += 20;
  checkY(10);
  doc.setFont('Times','bold');
  doc.text('ANTE MÍ,', ML, y);
  doc.setFont('Times','normal');

  return doc;
};

/* ── Exportaciones ── */
export const descargarPdfContrato = (datosContrato, datosResidente) => {
  const doc = generarPdfContrato(datosContrato, datosResidente);
  doc.save(`Contrato_${datosContrato.codigo_contrato || 'nuevo'}.pdf`);
};

export const imprimirPdfContrato = (datosContrato, datosResidente) => {
  const doc = generarPdfContrato(datosContrato, datosResidente);
  // Convertir PDF a objeto URL para apertura en nueva ventana
  const pdfUrl = doc.output('bloburi');
  // Abrir en nueva ventana e imprimir
  const printWindow = window.open(pdfUrl);
  if (printWindow) {
    printWindow.onload = function() {
      setTimeout(() => {
        printWindow.print();
      }, 250);
    };
  }
};

export const obtenerPdfComoBinary = async (datosContrato, datosResidente) => {
  const doc = generarPdfContrato(datosContrato, datosResidente);
  return doc.output('blob');
};
