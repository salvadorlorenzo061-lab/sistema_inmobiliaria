import jsPDF from 'jspdf';

/**
 * Convierte números a palabras en español
 */
const numberToWords = (num) => {
  const ones = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
  const tens = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  const teens = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
  const scales = ['', 'mil', 'millón', 'mil millones', 'billón'];

  if (num === 0) return 'cero';

  let words = '';
  let scaleIndex = 0;

  while (num > 0) {
    const chunk = num % 1000;
    if (chunk !== 0) {
      let chunkWords = '';

      if (chunk >= 100) {
        const hundreds = Math.floor(chunk / 100);
        if (hundreds === 1) chunkWords += 'ciento ';
        else if (hundreds === 5) chunkWords += 'quinientos ';
        else if (hundreds === 7) chunkWords += 'setecientos ';
        else if (hundreds === 9) chunkWords += 'novecientos ';
        else chunkWords += ones[hundreds] + 'cientos ';
      }

      const remainder = chunk % 100;
      if (remainder >= 20) {
        chunkWords += tens[Math.floor(remainder / 10)];
        if (remainder % 10 > 0) chunkWords += ' y ' + ones[remainder % 10];
      } else if (remainder >= 10) {
        chunkWords += teens[remainder - 10];
      } else if (remainder > 0) {
        chunkWords += ones[remainder];
      }

      words = chunkWords + (scales[scaleIndex] ? ' ' + scales[scaleIndex] + ' ' : ' ') + words;
    }

    num = Math.floor(num / 1000);
    scaleIndex++;
  }

  return words.trim();
};

/**
 * Convierte números a moneda en palabras
 */
const numberToMoneyWords = (amount) => {
  const wholePart = Math.floor(amount);
  const words = numberToWords(wholePart);
  return words.charAt(0).toUpperCase() + words.slice(1) + ' QUETZALES';
};

/**
 * Formatea nombres de meses
 */
const monthToWords = (month) => {
  const months = {
    1: 'enero', 2: 'febrero', 3: 'marzo', 4: 'abril', 5: 'mayo', 6: 'junio',
    7: 'julio', 8: 'agosto', 9: 'septiembre', 10: 'octubre', 11: 'noviembre', 12: 'diciembre'
  };
  return months[parseInt(month)] || '';
};

/**
 * Convierte año a palabras
 */
const yearToWords = (year) => {
  const yearNum = parseInt(year);
  if (yearNum < 2000) {
    return numberToWords(Math.floor(yearNum / 1000)) + ' ' + numberToWords(yearNum % 1000);
  } else {
    return 'dos mil ' + numberToWords(yearNum - 2000);
  }
};

const documentoIdentidadALetras = (valor = '') => {
  const limpio = String(valor || '').trim();
  if (!limpio) return '';

  const grupos = limpio.split(/[\s-]+/).filter(Boolean);
  const gruposEnLetras = grupos.map((grupo) => {
    if (!/^\d+$/.test(grupo)) {
      return grupo.toLowerCase();
    }

    const numero = parseInt(grupo, 10);
    if (Number.isNaN(numero)) {
      return grupo;
    }

    if (numero === 0) {
      return 'cero';
    }

    return numberToWords(numero);
  });

  return gruposEnLetras.join(', ');
};

/**
 * Genera un PDF del contrato con TODOS los datos del residente
 */
export const generarPdfContrato = (datosContrato, datosResidente) => {
  try {
    const doc = new jsPDF('p', 'mm', 'letter');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const maxWidth = pageWidth - (margin * 2);

    doc.setFont('Times', 'normal');
    doc.setFontSize(10);

    let yPosition = margin;

    const addText = (text) => {
      if (!text) return;
      const lines = doc.splitTextToSize(text, maxWidth);
      lines.forEach((line) => {
        if (yPosition + 4.5 > pageHeight - margin - 5) {
          doc.addPage();
          yPosition = margin;
        }
        doc.text(line, margin, yPosition);
        yPosition += 4.5;
      });
      yPosition += 1.5;
    };

    // PÁGINA 1: CABECERA Y DATOS PRINCIPALES
    const diaFirma = datosContrato.dia_firma || '18';
    const mesFirma = monthToWords(datosContrato.mes_firma || '7');
    const anioFirma = yearToWords(datosContrato.anio_firma || '2025');
    
    // Datos vendedor (simulados - en producción vendrían de la BD)
    const vendedor = {
      nombre: datosContrato.nombre_vendedor || 'DULCE MARIA OSORIO SABAN DE PEREZ',
      edad: datosContrato.edad_vendedor || 'veintinueve',
      estado_civil: datosContrato.estado_civil_vendedor || 'casada',
      profesion: datosContrato.profesion_vendedor || 'ejecutiva de negocios',
      dpi: datosContrato.dpi_vendedor || '3003 09864 0101',
      empresa: datosContrato.empresa_vendedor || 'CORPORACION DE PROYECTOS Y VIVIENDAS, SOCIEDAD ANONIMA',
      numero_empresa: datosContrato.numero_empresa || '810,559',
      notario: datosContrato.notario || 'Alma Karina Aguilar Chávez',
      fecha_nombramiento: datosContrato.fecha_nombramiento || 'siete de octubre del año dos mil veinticinco',
      registro_numero: datosContrato.registro_numero || '810,559',
      registro_folio: datosContrato.registro_folio || '120',
      registro_libro: datosContrato.registro_libro || '853'
    };

    // Datos comprador
    const comprador = {
      nombre: datosResidente?.nombre || 'MARLON MISAEL GÓMEZ POITÁN',
      edad: datosResidente?.edad || 'cincuenta',
      estado_civil: datosResidente?.estado_civil || 'casado',
      profesion: datosResidente?.profesion || 'comerciante',
      dpi: datosResidente?.dpi || datosResidente?.numero_identificacion || '2608 69589 0114'
    };
    const compradorDpiLetras = documentoIdentidadALetras(comprador.dpi);

    // Datos propiedad
    const propiedad = {
      numero_finca: datosContrato.numero_finca || '30052',
      folio: datosContrato.folio_propiedad || '133',
      libro: datosContrato.libro_propiedad || '268',
      lote: datosContrato.numero_lote || '1',
      manzana: datosContrato.manzana_propiedad || 'A',
      area: datosContrato.area_propiedad || '89.65',
      proyecto: datosContrato.proyecto_propiedad || 'VILLAS DE TAPACUN'
    };

    // Medidas
    const medidas = {
      norte: datosContrato.medida_norte || '15.00',
      sur: datosContrato.medida_sur || '15.00',
      oriente: datosContrato.medida_oriente || '15.00',
      poniente: datosContrato.medida_poniente || '15.00'
    };

    // Datos económicos
    const monto_total = parseFloat(datosContrato.monto_total) || 120000;
    const enganche = parseFloat(datosContrato.enganche) || 20000;
    const capital_restante = monto_total - enganche;
    const interes_porcentaje = datosContrato.interes_porcentaje || 14;
    const interes_cantidad = capital_restante * (interes_porcentaje / 100);
    const total_con_interes = capital_restante + interes_cantidad;
    const cuotas = parseInt(datosContrato.cuotas_pactadas) || 60;
    const monto_cuota = parseFloat(datosContrato.monto_cuota) || (capital_restante / cuotas);
    const ultima_cuota = total_con_interes - (monto_cuota * (cuotas - 1));
    const mora = datosContrato.mora || 600;
    const dia_pago = datosContrato.dia_pago_limite || '5';
    const porcentaje_dominio = datosContrato.porcentaje_dominio || 80;
    const plazo_meses = datosContrato.plazo_meses || 60;

    // Párrafo 1: Encabezado con fecha
    let parrafo1 = `En la Ciudad Capital, departamento de Guatemala, el día ${diaFirma} de ${mesFirma} del año ${anioFirma}. Comparezco accionando por una parte yo ${vendedor.nombre} de ${vendedor.edad} años de edad, ${vendedor.estado_civil}, guatemalteca, ${vendedor.profesion}, de este domicilio, me identifico con el Documento Personal de Identificación (D.P.I.) con Código Único de Identificación (C.U.I.) número ${vendedor.dpi} extendido por el Registro Nacional de las Personas de la República de Guatemala, comparezco en nombre propio y en mi calidad de ADMINISTRADOR ÚNICO Y REPRESENTANTE LEGAL de la Entidad denominada ${vendedor.empresa}, extremo que acredito con el Acta Notarial de mi Nombramiento, faccionada en la Ciudad de Guatemala, el día ${vendedor.fecha_nombramiento}, por la Notario ${vendedor.notario}, encontrándose debidamente inscrita en el Registro Mercantil General de República al número ${vendedor.registro_numero}; folio ${vendedor.registro_folio}; del libro ${vendedor.registro_libro} de Auxiliares de Comercio, con fecha diecisiete de octubre del año dos mil veinticinco y en el transcurso de este instrumento se me dominará "LA PARTE VENDEDORA".`;
    
    addText(parrafo1);

    // Párrafo 2: Comprador
    let parrafo2 = `Y, por la otra parte ${comprador.nombre} de ${comprador.edad} años de edad, ${comprador.estado_civil}, ${comprador.profesion}, guatemalteco, de este domicilio, me identifico con el Documento Personal de Identificación (D.P.I) con número de Código Único de Identificación (C.U.I) número ${comprador.dpi}${compradorDpiLetras ? ` (${compradorDpiLetras})` : ''} extendido por el Registro Nacional de las Personas de la República de Guatemala, actúo en nombre propio y en el transcurso de este instrumento se me denominará "LA PARTE COMPRADORA".`;
    
    addText(parrafo2);

    // Párrafo 3: Tipo de contrato
    let parrafo3 = `Aseguramos los comparecientes ser de los datos de identificación personal consignados, hallarnos en el libre ejercicio de nuestros derechos civiles y que por este acto otorgamos CONTRATO DE PROMESA DE COMPRAVENTA POR ABONOS DE FRACCIÓN DE BIEN INMUEBLE EN DOCUMENTO PRIVADO CON LEGALIZACIÓN NOTARIAL DE FIRMAS. De conformidad con las siguientes cláusulas:`;
    
    addText(parrafo3);

    // CLÁUSULA PRIMERA
    let clausula1 = `PRIMERA: "LA PARTE VENDEDORA" con la calidad con que actuó, manifiesto ser la legítima propietaria del bien inmueble inscrito en el Registro General de la Propiedad de la Zona Central bajo el número de finca: ${numberToWords(parseInt(propiedad.numero_finca)).toUpperCase()} (${propiedad.numero_finca}); folio: ${numberToWords(parseInt(propiedad.folio)).toUpperCase()} (${propiedad.folio}); libro: ${numberToWords(parseInt(propiedad.libro)).toUpperCase()} (${propiedad.libro}) de Guatemala.`;
    
    addText(clausula1);

    // CLÁUSULA SEGUNDA
    const loteWord = numberToWords(parseInt(propiedad.lote)).toUpperCase();
    const manzanaFormat = `${loteWord} de la manzana ${propiedad.manzana}`;
    
    let clausula2 = `SEGUNDA: "LA PARTE VENDEDORA" con la calidad con que actuó, manifiesto que por este acto prometo en venta a "LA PARTE COMPRADORA" una fracción que deberá ser desmembrada de la finca identificada o de la finca que se especifique en un futuro, fracción que se identifica con el número de lote ${manzanaFormat} (${propiedad.lote}${propiedad.manzana}), que cuenta con un área de ${numberToWords(parseInt(propiedad.area.split('.')[0])).toUpperCase()} punto ${propiedad.area.split('.')[1] || '00'} metros cuadrados (${propiedad.area}mts2) del proyecto denominado ${propiedad.proyecto}, con las siguientes medidas y colindancias. NORTE: del punto cero al punto observado uno, una distancia de ${numberToWords(parseInt(medidas.norte)).toUpperCase()} punto ${medidas.norte.split('.')[1] || '00'} metros (${medidas.norte} mts), que colinda con lote tres de la manzana ${propiedad.manzana}. SUR: del punto dos al punto observado tres una distancia de ${numberToWords(parseInt(medidas.sur)).toUpperCase()} punto ${medidas.sur.split('.')[1] || '00'} metros (${medidas.sur} mts), que colinda con lote tres de la manzana ${propiedad.manzana}. en las medidas ya está incluido un derecho de banqueta. ORIENTE: del punto uno al punto observado dos una distancia de ${numberToWords(parseInt(medidas.oriente)).toUpperCase()} punto ${medidas.oriente.split('.')[1] || '00'} metros (${medidas.oriente} mts), que colinda con lote tres de la manzana ${propiedad.manzana}. PONIENTE: del punto tres al punto observado cero una distancia de ${numberToWords(parseInt(medidas.poniente)).toUpperCase()} punto ${medidas.poniente.split('.')[1] || '00'} metros (${medidas.poniente} mts), que colinda con lote tres de la manzana ${propiedad.manzana}. En las medidas ya está incluido un derecho de banqueta.`;
    
    addText(clausula2);

    // CLÁUSULA TERCERA - Servicios
    let clausula3 = `TERCERA: La fracción vendida contará con los siguientes servicios: A) EL AGUA: La fracción especificada contará con el servicio de agua potable el cual se establecerá si será municipal o privado. B) POSTEADO ELÉCTRICO: el posteado eléctrico será instalado por "LA PARTE VENDEDORA" encargándose de los trámites y gastos necesarios para su instalación. C) SERVICIO DE SANEAMIENTO: "LA PARTE VENDEDORA" se compromete a realizar la estructura de los pozos de absorción para drenajes, mismos a los que "LA PARTE COMPRADORA" se compromete a conectarse por medio de un biodigestor. D) CALLES: "LA PARTE VENDEDORA" se compromete a realizar la estructura de las calles al momento de terminar la estructura de los pozos de absorción para drenajes.`;
    
    addText(clausula3);

    // CLÁUSULA CUARTA - Términos económicos
    const montoWords = numberToMoneyWords(monto_total);
    const engancheWords = numberToMoneyWords(enganche);
    const capitalWords = numberToMoneyWords(capital_restante);
    const interesWords = numberToMoneyWords(interes_cantidad);
    const totalInteresWords = numberToMoneyWords(total_con_interes);
    const cuotasWords = numberToWords(cuotas).toUpperCase();
    const cuotaMontoWords = numberToMoneyWords(monto_cuota);
    const ultimaCuotaWords = numberToMoneyWords(ultima_cuota);
    const moraWords = numberToMoneyWords(mora);
    const diaWords = numberToWords(parseInt(dia_pago)).toUpperCase();
    const plazoWords = numberToWords(plazo_meses).toUpperCase();
    const porcentajeWords = numberToWords(porcentaje_dominio).toUpperCase();
    const mesInicio = monthToWords(datosContrato.mes_inicio_pagos || '7');
    const anioInicio = yearToWords(datosContrato.anio_inicio_pagos || '2026');

    let clausula4 = `CUARTA: El contrato de venta se da bajo las siguientes condiciones: A) DEL PRECIO. El precio del bien inmueble es de ${montoWords} (Q. ${monto_total.toLocaleString('es-GT', {minimumFractionDigits: 2})}), de los cuales "LA PARTE COMPRADORA" el día dieciocho de junio del presente año entrego la cantidad de ${engancheWords} (Q.${enganche.toLocaleString('es-GT', {minimumFractionDigits: 2})}) en calidad de primera y única cuota de enganche. B) DEL CAPITAL RESTANTE SIN INTERESES. El capital restante sin intereses es de ${capitalWords} (Q. ${capital_restante.toLocaleString('es-GT', {minimumFractionDigits: 2})}). C) DE LOS INTERESES. El capital restante devengara un interés del ${interes_porcentaje} por ciento anual variable. D) DEL CAPITAL RESTANTE CON INTERESES. El capital restante con intereses es de ${totalInteresWords} (Q. ${total_con_interes.toLocaleString('es-GT', {minimumFractionDigits: 2})}). E) DE LA FORMA DE PAGO. "LA PARTE COMPRADORA" cancelara en ${cuotasWords} CUOTAS de ${cuotaMontoWords} (Q. ${monto_cuota.toLocaleString('es-GT', {minimumFractionDigits: 2})}) cada una y UNA ULTIMA cuota de ${ultimaCuotaWords} (Q ${ultima_cuota.toLocaleString('es-GT', {minimumFractionDigits: 2})}), sin necesidad de cobro ni requerimiento alguno. F) EL LUGAR DE PAGO. El pago se realizará el día ${diaWords} de cada mes a partir del mes de ${mesInicio} del año ${anioInicio}, sin necesidad de cobro ni requerimiento alguno hasta solventar completamente la obligación contraída; y en caso de incumplimiento de uno o más abonos consecutivos da derecho a "LA PARTE VENDEDORA" a cobrar una MORA de ${moraWords} POR CADA MES VENCIDO HASTA PONERSE AL DÍA. G) EL PLAZO. El plazo del presente contrato es de ${plazoWords} MESES, a partir de la fecha de inicio de los pagos como fecha límite para cumplir con lo establecido y que puede ser prorrogado según convenga a los intereses de "LA PARTE VENDEDORA". H) "LA PARTE COMPRADORA" podrá hacer abonos a capital. I) CESIÓN DEL CRÉDITO: El presente crédito podrá ser cedido, negociado o enajenado de cualquier forma por " LA PARTE VENDEDORA" sin necesidad de previo aviso o posterior notificación a "LA PARTE COMPRADORA", y sin menoscabar los derechos adquiridos por "LA PARTE COMPRADORA". J) La presente compraventa se otorga con PACTO DE RESERVA DE DOMINIO a favor de " LA PARTE VENDEDORA " hasta que "LA PARTE COMPRADORA" haya cancelado el ${porcentajeWords} por ciento (${porcentaje_dominio}%) del precio total del inmueble en mención. Haciendo constar que "LA PARTE COMPRADORA" no podrá hacer ningún tramité o gestión ante las autoridades municipales o cualquier otra empresa pública o privada sin autorización escrita de "LA PARTE VENDEDORA". K) El bien inmueble que hoy se promete en venta será utilizado única y exclusivamente para construir vivienda formal quedando prohibido darle cualquier otro uso.`;
    
    addText(clausula4);

    // CLÁUSULA QUINTA
    let clausula5 = `QUINTA: Manifiesto "LA PARTE VENDEDORA" en forma expresa que sobre el bien inmueble que por este acto vendo no pesan gravámenes anotaciones, o limitaciones que puedan afectar los derechos de "LA PARTE COMPRADORA", comprometiéndome en la calidad con que actuó en todo caso al saneamiento de ley. Y al estar debidamente cancelado el inmueble "LA PARTE VENDEDORA" asumo el compromiso de otorgar la escritura traslativa de dominio con el Notario que la misma designe; CORRIENDO LOS GASTOS E IMPUESTOS a los que esta afecto el contrato de compraventa respectivo, mismos que se cancelaran a la Superintendencia de Administración Tributaria (SAT) y al Registro General de la Propiedad, por "LA PARTE COMPRADORA". Haciendo constar que al estar cancelado en su totalidad se fraccionará la escritura correspondiente a nombre del señor ${comprador.nombre} y la misma deberá inscribirse en el Registró General de la Propiedad.`;
    
    addText(clausula5);

    // CLÁUSULA SEXTA
    let clausula6 = `SEXTA: Manifestamos los comparecientes que en caso de incumplimiento del pago de tres o más cuotas en la forma y fecha establecidas en este contrato, o en caso de arrepentimiento por cualquier circunstancia de "LA PARTE COMPRADORA" o cualquier otra circunstancia que la empresa así lo considere, perderá el dinero que hasta el momento haya entregado sin tener derecho a devolución de dinero ni a indemnización alguna; se tendrá por rescindido este contrato sin necesidad de demanda ni entrega judicial y si fuera el caso da derecho a que la otra parte demande y utilice este documento como título ejecutivo y para el efecto "LA PARTE COMPRADORA" renuncia al fuero de su domicilio y señala como lugar para recibir notificaciones: Lote cinco A Colonia El Recreo San José, El Tablón, Villa Canales. Y autoriza a "LA PARTE VENDEDORA" a rescindir este contrato y se compromete a devolver el bien inmueble descrito sin necesidad de demanda ni entrega judicial.`;
    
    addText(clausula6);

    // CLÁUSULA SÉPTIMA
    let clausula7 = `SÉPTIMA: "LA PARTE VENDEDORA", se reserva el derecho de realizar la venta o negociación hasta que "LA PARTE COMPRADORA" haya cancelado su última cuota pudiendo ser devuelta la cantidad entregada en la misma forma y plazo en que se recibió sin responsabilidad alguna como intereses, daños y perjuicios y otros de "LA PARTE VENDEDORA", haciendo constancia que se descontará un veinticinco por ciento del valor total entregado por gastos administrativos.`;
    
    addText(clausula7);

    // CLÁUSULA OCTAVA
    let clausula8 = `OCTAVA: Manifestamos los otorgantes que en los términos relacionados aceptamos CONTRATO DE PROMESA DE COMPRAVENTA POR ABONOS DE FRACCIÓN DE BIEN INMUEBLE, EN DOCUMENTO PRIVADO CON LEGALIZACIÓN NOTARIAL DE FIRMAS, que por este acto se hace. Todos leemos lo escrito y enterados de su contenido, objeto, validez y efectos legales, lo aceptamos, ratificamos, firmamos y para mayor certeza jurídica dejamos la impresión dactilar de nuestros dedos pulgares derechos.`;
    
    addText(clausula8);

    // Líneas de firma
    yPosition += 10;
    doc.text('F. ______________________________ F. ______________________________', margin, yPosition);
    yPosition += 8;
    doc.text(vendedor.nombre, margin, yPosition);
    doc.text(comprador.nombre, margin + pageWidth / 2, yPosition);

    return doc;
  } catch (error) {
    console.error('Error al generar PDF:', error);
    throw error;
  }
};

/**
 * Descarga el PDF generado
 */
export const descargarPdfContrato = (datosContrato, datosResidente) => {
  try {
    const doc = generarPdfContrato(datosContrato, datosResidente);
    const filename = `Contrato_${datosContrato.codigo_contrato || 'SinCodigo'}.pdf`;
    doc.save(filename);
  } catch (error) {
    console.error('Error al descargar PDF:', error);
  }
};

/**
 * Obtiene el PDF como Blob para enviar al servidor
 */
export const obtenerPdfComoBinary = async (datosContrato, datosResidente) => {
  try {
    const doc = generarPdfContrato(datosContrato, datosResidente);
    return doc.output('blob');
  } catch (error) {
    console.error('Error al obtener PDF como binary:', error);
    throw error;
  }
};
