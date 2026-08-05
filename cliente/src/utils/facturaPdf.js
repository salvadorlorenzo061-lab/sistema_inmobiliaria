import autoTable from 'jspdf-autotable';

// Formato unico de documento para todo el sistema: FACTURA / COMPROBANTE DE COBRO.
// Lo usan Caja (emision), Detalle de Pagos (reimpresion) y Anulacion de Deuda (anulada),
// para que la factura emitida y la anulada se vean identicas salvo el sello ANULADA.

export const COLOR_ORO = [173, 136, 38];

let contadorImagen = 0;

export const getImageFormatFromDataUrl = (dataUrl = '') => {
  const match = String(dataUrl || '').match(/^data:image\/([a-zA-Z0-9+.-]+);base64,/i);
  if (!match) return 'PNG';
  const rawFormat = match[1].toLowerCase();
  if (rawFormat === 'jpg' || rawFormat === 'jpeg') return 'JPEG';
  if (rawFormat === 'webp') return 'WEBP';
  return 'PNG';
};

export const normalizeImageDataUrl = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:image')) return raw;

  const base64Part = raw.includes('base64,') ? raw.split('base64,')[1] : raw;
  const cleaned = String(base64Part || '').replace(/\s+/g, '');
  if (!cleaned || !/^[A-Za-z0-9+/=]+$/.test(cleaned)) return '';

  let mime = 'image/png';
  if (cleaned.startsWith('/9j/')) {
    mime = 'image/jpeg';
  } else if (cleaned.startsWith('UklGR')) {
    mime = 'image/webp';
  } else if (cleaned.startsWith('iVBOR')) {
    mime = 'image/png';
  }

  return `data:${mime};base64,${cleaned}`;
};

const fechaFmt = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

const fechaHoraFmt = (d) => {
  const n = new Date();
  return `${fechaFmt(d)}, ${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}:${String(n.getSeconds()).padStart(2, '0')}`;
};

const texto = (valor, alterno = 'N/A') => {
  const limpio = String(valor ?? '').trim();
  return limpio || alterno;
};

const normalizarConcepto = (valor = '') => String(valor || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim();

const inferirTipoConcepto = (detalle = {}) => {
  const tipoDirecto = normalizarConcepto(detalle?.tipo_concepto || '');
  if (tipoDirecto) return tipoDirecto;

  const concepto = normalizarConcepto(detalle?.nombre_concepto || detalle?.concepto || '');
  if (concepto.includes('enganche')) return 'enganche';
  if (concepto.includes('abono a capital')) return 'abono_capital';
  if (concepto.includes('interes')) return 'interes';
  if (concepto.includes('mora')) return 'mora';
  if (concepto.includes('extraordinario')) return 'extraordinario';
  if (concepto.includes('servicio')) return 'servicio';
  if (concepto.includes('cuota')) return 'cuota_terreno';
  return 'otro';
};

export const buildConsolidatedInvoiceRows = (detalles = [], options = {}) => {
  const usarCuotaCeroEnganche = Boolean(options?.usarCuotaCeroEnganche);
  const normalizados = (Array.isArray(detalles) ? detalles : [])
    .map((item, index) => ({
      orden: index,
      tipo: inferirTipoConcepto(item),
      mes: texto(item?.mes_pagado || item?.mes, ''),
      cuotaReal: Number(item?.numero_cuota_afectada || item?.numero_cuota || 0) || null,
      monto: Number(item?.subtotal ?? item?.total ?? 0)
    }))
    .filter((item) => Number.isFinite(item.monto) && item.monto > 0);

  if (!normalizados.length) {
    return [['Pago aplicado', 'N/A', 'Q 0.00']];
  }

  const grupos = [];
  const gruposPorClave = new Map();
  const enganche = normalizados.find((item) => item.tipo === 'enganche');
  const cuotasTerreno = normalizados.filter((item) => item.tipo === 'cuota_terreno');

  const asegurarGrupo = (clave, base = {}) => {
    if (!gruposPorClave.has(clave)) {
      const grupo = {
        clave,
        orden: base.orden ?? grupos.length,
        mes: base.mes || 'N/A',
        cuotaReal: base.cuotaReal ?? null,
        tieneEnganche: Boolean(base.tieneEnganche),
        total: 0
      };
      gruposPorClave.set(clave, grupo);
      grupos.push(grupo);
    }
    return gruposPorClave.get(clave);
  };

  cuotasTerreno.forEach((item) => {
    asegurarGrupo(`mes:${item.mes}`, {
      orden: item.orden,
      mes: item.mes || 'N/A',
      cuotaReal: item.cuotaReal,
      tieneEnganche: false
    });
  });

  if (enganche) {
    const grupoEnganche = asegurarGrupo(`mes:${enganche.mes || 'N/A'}`, {
      orden: enganche.orden,
      mes: enganche.mes || 'N/A',
      cuotaReal: 0,
      tieneEnganche: true
    });
    grupoEnganche.tieneEnganche = true;
    grupoEnganche.cuotaReal = 0;
  }

  if (!grupos.length) {
    const primero = normalizados[0];
    asegurarGrupo(`mes:${primero.mes || 'N/A'}`, {
      orden: primero.orden,
      mes: primero.mes || 'N/A',
      cuotaReal: primero.tipo === 'enganche' ? 0 : primero.cuotaReal,
      tieneEnganche: primero.tipo === 'enganche'
    });
  }

  grupos.sort((a, b) => a.orden - b.orden);
  const primerGrupo = grupos[0];

  normalizados.forEach((item) => {
    let grupoDestino = null;

    if ((item.tipo === 'cuota_terreno' || item.tipo === 'interes' || item.tipo === 'servicio') && item.mes && gruposPorClave.has(`mes:${item.mes}`)) {
      grupoDestino = gruposPorClave.get(`mes:${item.mes}`);
    } else if (item.tipo === 'mora' && item.mes && gruposPorClave.has(`mes:${item.mes}`)) {
      grupoDestino = gruposPorClave.get(`mes:${item.mes}`);
    } else {
      grupoDestino = primerGrupo;
    }

    grupoDestino.total = Number((grupoDestino.total + item.monto).toFixed(2));
    if (item.tipo === 'enganche') {
      grupoDestino.tieneEnganche = true;
      grupoDestino.cuotaReal = 0;
    }
    if (item.tipo === 'cuota_terreno' && Number.isInteger(item.cuotaReal) && item.cuotaReal > 0) {
      grupoDestino.cuotaReal = item.cuotaReal;
    }
  });

  return grupos
    .filter((grupo) => grupo.total > 0)
    .sort((a, b) => a.orden - b.orden)
    .map((grupo) => {
      let cuotaVisual = grupo.cuotaReal;
      if (grupo.tieneEnganche) {
        cuotaVisual = 0;
      } else if (Number.isInteger(cuotaVisual) && cuotaVisual > 0 && usarCuotaCeroEnganche) {
        cuotaVisual = Math.max(cuotaVisual - 1, 1);
      }

      const concepto = Number.isInteger(cuotaVisual)
        ? `Cuota ${cuotaVisual}`
        : 'Pago aplicado';

      return [concepto, texto(grupo.mes), `Q ${grupo.total.toFixed(2)}`];
    });
};

/**
 * Dibuja el formato FACTURA / COMPROBANTE DE COBRO sobre un documento jsPDF ya creado.
 * No guarda el archivo: el llamador decide el nombre con doc.save().
 */
export const renderFacturaComprobante = (doc, datos = {}) => {
  const {
    titulo = ['FACTURA / COMPROBANTE', 'DE COBRO'],
    logo = '',
    empresa = {},
    documentoNo = 'N/A',
    fechaEmision = null,
    cliente = {},
    contrato = 'N/A',
    pago = {},
    encabezados = ['Concepto / Cuota', 'Mes Afectado', 'Total'],
    filas = [],
    resumen = [],
    anulada = false,
    notaPie = 'Gracias por su pago. Conservar este documento para cualquier aclaración fiscal y administrativa.'
  } = datos;

  const pW = doc.internal.pageSize.getWidth();
  const pH = doc.internal.pageSize.getHeight();
  const fecha = fechaEmision instanceof Date && !Number.isNaN(fechaEmision.getTime())
    ? fechaEmision
    : new Date();
  const metodo = String(pago?.metodo || '').toLowerCase();

  let y = 12;
  doc.setFillColor(...COLOR_ORO);
  doc.rect(0, 0, pW, 5, 'F');

  if (logo) {
    try {
      contadorImagen += 1;
      doc.addImage(logo, getImageFormatFromDataUrl(logo), 9, y - 1, 33, 33, `fac-logo-${contadorImagen}`, 'FAST');
    } catch {
      // no-op
    }
  }

  doc.setTextColor(40, 40, 40);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(String(empresa?.nombre || 'CORPORACION DE INVERSION INMOBILIARIA').toUpperCase(), 46, y + 5);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`NIT: ${texto(empresa?.nit)}`, 46, y + 10);
  doc.text(`País: ${texto(empresa?.pais, 'Guatemala')}`, 46, y + 14.5);
  doc.text(`Moneda: ${texto(empresa?.moneda, 'GTQ')}`, 46, y + 19);

  doc.setFillColor(245, 245, 245);
  doc.rect(140, y - 2, 63, 30, 'F');
  doc.setDrawColor(180, 180, 180);
  doc.rect(140, y - 2, 63, 30);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(String(titulo[0] || ''), 171.5, y + 4, { align: 'center' });
  doc.text(String(titulo[1] || ''), 171.5, y + 9, { align: 'center' });
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.text(`Documento No: ${texto(documentoNo)}`, 171.5, y + 15, { align: 'center' });
  doc.text(`Fecha emisión: ${fechaFmt(fecha)}`, 171.5, y + 20, { align: 'center' });
  doc.text(`Fecha/Hora impresión: ${fechaHoraFmt(fecha)}`, 171.5, y + 25, { align: 'center' });

  y += 36;
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(10, y, pW - 10, y);
  y += 5;

  // Datos del cliente
  doc.setFillColor(240, 240, 240);
  doc.rect(10, y, pW - 20, 7, 'F');
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('DATOS DEL CLIENTE / RESIDENTE', 12, y + 5);
  y += 10;

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Nombre:', 12, y);
  doc.setFont('Helvetica', 'normal');
  doc.text(texto(cliente?.nombre), 35, y);
  doc.setFont('Helvetica', 'bold');
  doc.text('Dirección:', 120, y);
  doc.setFont('Helvetica', 'normal');
  doc.text(texto(cliente?.direccion).slice(0, 38), 143, y);
  y += 6;

  doc.setFont('Helvetica', 'bold');
  doc.text('Identificación:', 12, y);
  doc.setFont('Helvetica', 'normal');
  doc.text(texto(cliente?.identificacion), 42, y);
  doc.setFont('Helvetica', 'bold');
  doc.text('Contrato:', 120, y);
  doc.setFont('Helvetica', 'normal');
  doc.text(texto(contrato), 143, y);
  y += 6;

  doc.setFont('Helvetica', 'bold');
  doc.text('DPI:', 12, y);
  doc.setFont('Helvetica', 'normal');
  doc.text(texto(cliente?.dpi), 24, y);
  doc.setFont('Helvetica', 'bold');
  doc.text('NIT:', 120, y);
  doc.setFont('Helvetica', 'normal');
  doc.text(texto(cliente?.nit, 'CF'), 131, y);
  y += 8;

  // Datos de pago
  doc.setFillColor(240, 240, 240);
  doc.rect(10, y, pW - 20, 7, 'F');
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('DATOS DE PAGO', 12, y + 5);
  y += 10;

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Método de pago:', 12, y);
  doc.setFont('Helvetica', 'normal');
  doc.text(texto(pago?.metodo), 48, y);
  doc.setFont('Helvetica', 'bold');
  doc.text('Referencia:', 120, y);
  doc.setFont('Helvetica', 'normal');
  doc.text(texto(pago?.referencia || documentoNo), 143, y);
  y += 10;

  const banco = texto(pago?.banco, '');
  const fechaOperacion = texto(pago?.fechaOperacion, '');
  const boletaReferencia = texto(pago?.boletaReferencia, '');
  if ((metodo.includes('deposit') || metodo.includes('transfer')) && (banco || fechaOperacion || boletaReferencia)) {
    doc.setFont('Helvetica', 'bold');
    doc.text('Banco:', 12, y);
    doc.setFont('Helvetica', 'normal');
    doc.text(banco || 'N/A', 28, y);
    doc.setFont('Helvetica', 'bold');
    doc.text('Fecha op.:', 120, y);
    doc.setFont('Helvetica', 'normal');
    doc.text(fechaOperacion || 'N/A', 145, y);
    y += 6;
    doc.setFont('Helvetica', 'bold');
    doc.text('Boleta/Ref.:', 12, y);
    doc.setFont('Helvetica', 'normal');
    doc.text(boletaReferencia || 'N/A', 35, y);
    y += 8;
  }

  // Tabla de detalle
  autoTable(doc, {
    startY: y,
    head: [encabezados],
    body: filas.length ? filas : [['Sin detalle registrado', 'N/A', 'Q 0.00']],
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: COLOR_ORO, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: 95 },
      1: { cellWidth: 50, halign: 'center' },
      2: { cellWidth: 40, halign: 'right' }
    },
    margin: { left: 10, right: 10 }
  });

  y = doc.lastAutoTable.finalY + 8;

  // Resumen
  const resX = pW - 90;
  const resW = 80;
  const lineH = 7;

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(resX - 2, y - 3, resX + resW + 2, y - 3);

  resumen.forEach(({ label, valor, bold = false, rojo = false }) => {
    doc.setFont('Helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(8.8);
    doc.setTextColor(rojo ? 180 : 40, rojo ? 0 : 40, rojo ? 0 : 40);
    doc.text(`${label}:`, resX, y);
    doc.text(`Q${parseFloat(valor || 0).toFixed(2)}`, resX + resW, y, { align: 'right' });
    doc.setTextColor(40, 40, 40);
    y += lineH;
  });

  doc.line(resX - 2, y - 3, resX + resW + 2, y - 3);

  if (anulada) {
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(38);
    doc.setTextColor(200, 30, 30);
    doc.text('ANULADA', pW / 2, 150, { align: 'center', angle: -20 });
    doc.setTextColor(40, 40, 40);
  }

  // Pie
  doc.setFont('Helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text(notaPie, 10, pH - 10);
  doc.setTextColor(40, 40, 40);
  doc.setFillColor(...COLOR_ORO);
  doc.rect(0, pH - 5, pW, 5, 'F');
};
