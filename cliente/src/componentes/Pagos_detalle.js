import { useState, useEffect, useCallback, useRef } from 'react';
import Axios from "axios";
import 'bootstrap/dist/css/bootstrap.min.css';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import { getPaginatedData, PaginationControls } from '../utils/paginationUtils';
import { buildConsolidatedInvoiceRows, renderFacturaComprobante } from '../utils/facturaPdf';
import { API_BASE_URL } from '../config';

// El sistema emite un unico formato de documento (FACTURA / COMPROBANTE DE COBRO).
// El layout de Recibo Juridico se conserva mas abajo, desactivado, por si se requiere volver a el.
const USAR_FORMATO_RECIBO_JURIDICO = false;

const normalizeRole = (value = '') => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim();

const isRoleJuridico = (roleName = '') => {
  const rol = normalizeRole(roleName);
  return rol.includes('jurid') || rol.includes('legal');
};

const UNIDADES = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidos', 'veintitres', 'veinticuatro', 'veinticinco', 'veintiseis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DECENAS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

const cientosALetras = (n) => {
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100);
  const r = n % 100;
  if (r === 0) return CENTENAS[c];
  if (r < 30) return `${CENTENAS[c]} ${UNIDADES[r]}`.trim();
  const d = Math.floor(r / 10);
  const u = r % 10;
  return `${CENTENAS[c]} ${DECENAS[d]}${u ? ` y ${UNIDADES[u]}` : ''}`.trim();
};

const numeroALetrasRecibo = (n) => {
  const numero = Math.floor(Number(n || 0));
  if (!Number.isFinite(numero) || numero <= 0) return 'cero';
  let restante = numero;
  let salida = '';

  if (restante >= 1000000) {
    const millones = Math.floor(restante / 1000000);
    salida += `${numeroALetrasRecibo(millones)} ${millones === 1 ? 'millon' : 'millones'} `;
    restante %= 1000000;
  }
  if (restante >= 1000) {
    const miles = Math.floor(restante / 1000);
    salida += `${miles === 1 ? 'mil' : `${cientosALetras(miles)} mil`} `;
    restante %= 1000;
  }
  if (restante > 0) salida += cientosALetras(restante);
  return salida.trim();
};

const montoALetrasRecibo = (monto) => {
  const base = numeroALetrasRecibo(monto);
  return `${base.charAt(0).toUpperCase()}${base.slice(1)} quetzales exactos`;
};

const fechaLargaGT = (valor) => {
  const fecha = valor instanceof Date && !Number.isNaN(valor.getTime()) ? valor : new Date();
  return fecha.toLocaleDateString('es-GT', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

function PagosDetalle() {
  const [detallesList, setDetalles] = useState([]);
  const parametrosIniciales = new URLSearchParams(window.location.search);
  const [busqueda, setBusqueda] = useState(parametrosIniciales.get('buscar') || "");
  const [filtroEstado, setFiltroEstado] = useState(parametrosIniciales.get('estado') || 'TODAS');
  const facturaSolicitadaRef = useRef(parametrosIniciales.get('buscar') || '');

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const API_URL = `${API_BASE_URL}/api/pagos_detalle`;

  const normalizeImageDataUrl = (value = '') => {
    const cleanValue = String(value || '').trim();
    if (!cleanValue) return '';
    if (cleanValue.startsWith('data:image')) return cleanValue;
    if (cleanValue.startsWith('base64,')) return `data:image/png;${cleanValue}`;
    return `data:image/png;base64,${cleanValue.replace(/^data:[^,]+,/, '')}`;
  };

  const getImageFormatFromDataUrl = (dataUrl = '') => {
    const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,/i);
    if (!match) return 'PNG';
    const rawFormat = match[1].toLowerCase();
    if (rawFormat === 'jpg' || rawFormat === 'jpeg') return 'JPEG';
    if (rawFormat === 'webp') return 'WEBP';
    return 'PNG';
  };

  const generarFacturaDesdeDetalle = async (detalle) => {
    if (!detalle?.id_pago) {
      Swal.fire({ icon: 'warning', title: 'Pago no válido', text: 'Este registro no tiene un pago asociado para generar PDF.' });
      return;
    }

    let documento;
    try {
      const estadoFactura = String(detalle?.estado_factura || '').trim();
      const params = estadoFactura ? { estado_factura: estadoFactura } : undefined;
      const { data } = await Axios.get(`${API_URL}/documento/${detalle.id_pago}`, params ? { params } : undefined);
      documento = data;
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'No fue posible generar PDF',
        text: error?.response?.data?.message || 'No se encontró evidencia histórica del documento.'
      });
      return;
    }

    const detallesFactura = Array.isArray(documento?.detalles) ? documento.detalles : [];
    const montoTotal = detallesFactura.reduce((acc, item) => acc + Number(item?.subtotal || 0), 0);
    const conceptos = [...new Set(detallesFactura.map((d) => String(d?.nombre_concepto || d?.tipo_concepto || '').trim()).filter(Boolean))].join(', ') || 'Pago de cuota';
    const correlativo = String(documento?.correlativo || `REC-${documento?.id_pago || '0'}`);
    const matchRef = correlativo.match(/^([A-Za-z]+)-([0-9]+)$/);
    const serie = matchRef ? matchRef[1].toUpperCase() : 'B';
    const numero = matchRef ? matchRef[2].slice(-5) : String(documento?.id_pago || '0').padStart(5, '0');
    const fechaDoc = new Date(documento?.fecha_evento || Date.now());
    const empresaLogo = normalizeImageDataUrl(documento?.empresa?.logo_empresa || '');
    const logoProyecto = normalizeImageDataUrl(documento?.empresa?.logo_proyecto || '');
    const nombreEmpresa = String(documento?.empresa?.nombre_empresa || 'CORPORACION DE INVERSION INMOBILIARIA').toUpperCase();
    const rolEmisor = String(documento?.rol_usuario_cobro || '');
    const metodo = String(documento?.metodo_pago || '').toLowerCase();
    const bancoPago = String(documento?.banco_pago || '').trim();
    const fechaOperacion = String(documento?.fecha_operacion || '').trim();
    const boletaReferencia = String(documento?.boleta_referencia || documento?.correlativo || '').trim();
    const esJuridico = USAR_FORMATO_RECIBO_JURIDICO && isRoleJuridico(rolEmisor);

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    const fechaDocumento = fechaDoc instanceof Date && !Number.isNaN(fechaDoc.getTime()) ? fechaDoc : new Date();
    const detalleBase = detallesFactura.map((item) => ({
      tipo_concepto: String(item?.tipo_concepto || ''),
      subtotal: Number(item?.subtotal || 0)
    }));
    const abonoExtra = detalleBase
      .filter((d) => d.tipo_concepto !== 'cuota_terreno')
      .reduce((sum, d) => sum + d.subtotal, 0);

    if (esJuridico) {
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margenX = 8;
      const ancho = pageW - (margenX * 2);
      const contenidoY = 36;
      const contenidoH = 145;
      const nombreProyecto = String(documento?.contrato?.nombre_contrato || documento?.contrato?.codigo_contrato || 'Proyecto');
      const d = String(fechaDocumento.getDate()).padStart(2, '0');
      const m = String(fechaDocumento.getMonth() + 1).padStart(2, '0');
      const yFull = String(fechaDocumento.getFullYear());

      doc.setDrawColor(188, 177, 117);
      doc.setLineWidth(0.35);
      if (typeof doc.roundedRect === 'function') {
        doc.roundedRect(margenX, contenidoY, ancho, contenidoH, 3, 3, 'S');
      } else {
        doc.rect(margenX, contenidoY, ancho, contenidoH);
      }

      if (empresaLogo) {
        try {
          doc.addImage(empresaLogo, getImageFormatFromDataUrl(empresaLogo), margenX + 2.5, 7.8, 36, 21, `jur-logo-${Date.now()}`, 'FAST');
        } catch {
          // no-op
        }
      }

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(10.8);
      doc.text(nombreEmpresa, pageW / 2, 14.5, { align: 'center' });
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(7.8);
      doc.text('15 Avenida "A" 24-22, Zona 13, Oficina #5', pageW / 2, 20, { align: 'center' });
      doc.text('PBX: 2220-6406  Telefono: 5825-5903', pageW / 2, 24.2, { align: 'center' });

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8.8);
      doc.text('Recibo Juridico', pageW - 42.5, 14.2);
      doc.rect(pageW - 42.5, 15.9, 37.5, 11.8);
      doc.setTextColor(166, 35, 35);
      doc.setFontSize(11.8);
      doc.text(`NO. ${String(numero).padStart(5, '0')}`, pageW - 23.8, 23.9, { align: 'center' });
      doc.setTextColor(0, 0, 0);

      doc.setTextColor(195, 195, 195);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(28);
      doc.text('CORPORACION DE', pageW / 2, 102, { align: 'center' });
      doc.text('INVERSION INMOBILIARIA', pageW / 2, 116, { align: 'center' });
      doc.setTextColor(0, 0, 0);

      let rY = contenidoY + 8;
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11.5);
      doc.text('DATOS DEL CLIENTE', margenX + 4, rY);
      doc.setDrawColor(210, 190, 92);
      doc.setLineWidth(0.45);
      doc.line(margenX + 4, rY + 1.8, margenX + 34, rY + 1.8);

      rY += 11;
      doc.setDrawColor(60, 60, 60);
      doc.setLineWidth(0.2);
      doc.setFontSize(8.3);
      doc.text('Fecha:', margenX + 4, rY);
      const fechaX = margenX + 18;
      const boxW = 8;
      const boxH = 8;
      [d[0], d[1], m[0], m[1], yFull[0], yFull[1], yFull[2], yFull[3]].forEach((char, idx) => {
        const offsetX = idx < 2 ? idx * (boxW + 1) : idx < 4 ? (2 * (boxW + 1)) + 4 + ((idx - 2) * (boxW + 1)) : (4 * (boxW + 1)) + 8 + ((idx - 4) * (boxW + 1));
        doc.rect(fechaX + offsetX, rY - 5.8, boxW, boxH);
        doc.text(char, fechaX + offsetX + (boxW / 2), rY - 0.4, { align: 'center' });
      });
      doc.text('/', fechaX + (2 * (boxW + 1)) + 1.4, rY - 0.8);
      doc.text('/', fechaX + (4 * (boxW + 1)) + 5.2, rY - 0.8);

      const amountBoxX = pageW - 47;
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11.3);
      doc.text('Por: Q', amountBoxX - 22, rY + 0.1);
      doc.rect(amountBoxX, rY - 5.8, 42, 8.2);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10.4);
      doc.text(montoTotal.toFixed(2), amountBoxX + 2, rY - 0.2);

      const filaAncho = ancho - 4;
      const filaX = margenX + 2;
      const filaH = 10.5;
      rY += 6;
      doc.rect(filaX, rY, filaAncho, filaH);
      doc.rect(filaX, rY + filaH, filaAncho, filaH);
      doc.rect(filaX, rY + (filaH * 2), filaAncho, filaH);
      doc.rect(filaX, rY + (filaH * 3), filaAncho, filaH);

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8.3);
      doc.text('Recibimos de:', filaX + 2, rY + 6.8);
      doc.text('Cantidad de:', filaX + 2, rY + 17.3);
      doc.text('Por cancelacion de:', filaX + 2, rY + 27.8);
      doc.text('Proyecto:', filaX + 2, rY + 38.3);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10.3);
      doc.text(doc.splitTextToSize(String(documento?.cliente?.nombre_residente || 'N/A'), filaAncho - 34).slice(0, 1), filaX + 30, rY + 6.8);
      doc.text(doc.splitTextToSize(montoALetrasRecibo(montoTotal), filaAncho - 34).slice(0, 1), filaX + 30, rY + 17.3);
      doc.text(doc.splitTextToSize(String(conceptos), filaAncho - 40).slice(0, 1), filaX + 40, rY + 27.8);
      doc.text(doc.splitTextToSize(nombreProyecto, filaAncho - 34).slice(0, 1), filaX + 23, rY + 38.3);

      const pagosY = rY + (filaH * 4);
      doc.rect(filaX, pagosY, filaAncho, 24);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8.2);
      doc.text('Boleta:', filaX + 2, pagosY + 5.6);
      doc.text('Transferencia:', filaX + 52, pagosY + 5.6);
      doc.text('Cheque:', filaX + 114, pagosY + 5.6);
      doc.text('Efectivo:', filaX + 156, pagosY + 5.6);

      const referenciaBase = String(documento?.correlativo || documento?.metodo_pago || '').trim();
      const boletaValor = metodo.includes('deposit') ? referenciaBase : '';
      const transferenciaValor = metodo.includes('transfer') ? referenciaBase : '';
      const chequeValor = metodo.includes('cheque') ? referenciaBase : '';
      const efectivoValor = metodo.includes('efectivo') ? 'X' : '';
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10.1);
      doc.text(doc.splitTextToSize(boletaValor || '', 44).slice(0, 1), filaX + 2, pagosY + 16);
      doc.text(doc.splitTextToSize(transferenciaValor || '', 56).slice(0, 1), filaX + 52, pagosY + 16);
      doc.text(doc.splitTextToSize(chequeValor || '', 40).slice(0, 1), filaX + 114, pagosY + 16);
      doc.text(efectivoValor, filaX + 160, pagosY + 16);

      const firmaY = pagosY + 24;
      doc.rect(filaX, firmaY, filaAncho, 22);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text('Firma:', filaX + 2, firmaY + 6.2);
      if (logoProyecto) {
        try {
          doc.addImage(logoProyecto, getImageFormatFromDataUrl(logoProyecto), filaX + 62, firmaY + 1.8, 32, 13.2, `det-jur-proy-${Date.now()}`, 'FAST');
        } catch {
          // no-op
        }
      }

      doc.setFont('Helvetica', 'italic');
      doc.setFontSize(6.7);
      doc.text(
        doc.splitTextToSize('Los pagos mediante cheque estan regulados por las disposiciones contenidas en el Articulo 494 al 543 del Codigo de Comercio. Es importante tener en cuenta que todo cheque recibido se acepta bajo reserva de cobro; en caso de presentarse un cheque sin fondos disponibles, se aplicara un recargo de Q75.00 y se debitara en el proximo pago. Este recibo se extiende previo a la confirmacion de la transaccion bancaria.', ancho - 4).slice(0, 2),
        margenX + 2,
        pageH - 7.5
      );

      if (String(documento?.estado_factura || '').toUpperCase() === 'ANULADA') {
        doc.setTextColor(180, 0, 0);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(42);
        doc.text('ANULADA', pageW / 2, pageH / 2, { align: 'center', angle: 20 });
        doc.setTextColor(0, 0, 0);
      }
    } else {
      const filasFactura = buildConsolidatedInvoiceRows(detallesFactura, {
        usarCuotaCeroEnganche: Number(documento?.contrato?.enganche || 0) > 0
      });

      renderFacturaComprobante(doc, {
        logo: empresaLogo,
        empresa: {
          nombre: nombreEmpresa,
          nit: documento?.empresa?.nit,
          pais: documento?.empresa?.pais,
          moneda: documento?.empresa?.moneda
        },
        documentoNo: correlativo,
        fechaEmision: fechaDocumento,
        cliente: {
          nombre: documento?.cliente?.nombre_residente,
          direccion: documento?.cliente?.direccion,
          identificacion: documento?.cliente?.numero_identificacion,
          dpi: documento?.cliente?.dpi,
          nit: documento?.cliente?.nit
        },
        contrato: documento?.contrato?.codigo_contrato,
        pago: {
          metodo: documento?.metodo_pago,
          referencia: correlativo,
          banco: bancoPago,
          fechaOperacion,
          boletaReferencia
        },
        filas: filasFactura,
        resumen: [
          { label: "Subtotal deuda pagada", valor: montoTotal },
          { label: "Total Cobrado Hoy", valor: montoTotal, bold: true }
        ],
        anulada: String(documento?.estado_factura || "").toUpperCase() === "ANULADA"
      });
    }

    doc.save(`Factura_${correlativo.replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`);
  };

  const getDetalles = useCallback(() => {
    Axios.get(API_URL).then(res => setDetalles(res.data)).catch(err => console.error(err));
  }, [API_URL]);

  useEffect(() => {
    getDetalles();

    const handleFocus = () => getDetalles();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        getDetalles();
      }
    };

    const intervalId = window.setInterval(getDetalles, 15000);

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [getDetalles]);

  useEffect(() => {
    const idPagoSolicitado = String(facturaSolicitadaRef.current || '').trim();
    if (!idPagoSolicitado || !detallesList.length) return;

    const estadoSolicitado = String(parametrosIniciales.get('estado') || '').toUpperCase();
    const detalle = detallesList.find((item) => (
      String(item?.id_pago || '') === idPagoSolicitado
      && (!estadoSolicitado || String(item?.estado_factura || 'EMITIDA').toUpperCase() === estadoSolicitado)
    ));

    if (detalle) {
      facturaSolicitadaRef.current = '';
      generarFacturaDesdeDetalle(detalle);
    }
  }, [detallesList]);

  // Filtrado y paginación
  const detallesFiltrados = detallesList.filter((d) => {
    const textoBusqueda = String(busqueda || '').toLowerCase().trim();
    const coincideBusqueda = !textoBusqueda
      || String(d.id_pago || '').toLowerCase().includes(textoBusqueda)
      || String(d.correlativo || '').toLowerCase().includes(textoBusqueda);

    if (!coincideBusqueda) return false;

    if (filtroEstado === 'EMITIDA') return String(d.estado_factura || 'EMITIDA').toUpperCase() === 'EMITIDA';
    if (filtroEstado === 'ANULADA') return String(d.estado_factura || '').toUpperCase() === 'ANULADA';
    return true;
  });
  const { paginatedItems: detallesPaginados, totalPages, startIndex, endIndex } = getPaginatedData(detallesFiltrados, currentPage, itemsPerPage);

  const handleBusquedaChange = (e) => {
    setBusqueda(e.target.value);
    setCurrentPage(1);
  };

  const handleFiltroEstadoChange = (e) => {
    setFiltroEstado(e.target.value);
    setCurrentPage(1);
  };

  return (
    <div className='container mt-4'>
      <div className="module-header">
      <div className="row align-items-center bg-light p-3 rounded shadow-sm">
        <div className="col-md-4"><h3 className="m-0 text-dark fw-bold">DETALLE DE COMPROBANTES</h3></div>
        <div className="col-md-4">
          <input type="text" className="form-control" placeholder="Buscar por ID de pago principal..." value={busqueda} onChange={handleBusquedaChange} />
        </div>
        <div className="col-md-2">
          <select className="form-select fw-bold" value={filtroEstado} onChange={handleFiltroEstadoChange}>
            <option value="TODAS">TODAS</option>
            <option value="EMITIDA">EMITIDAS</option>
            <option value="ANULADA">ANULADAS</option>
          </select>
        </div>
        <div className="col-md-3 text-end d-flex gap-2">
          <button className="btn btn-outline-secondary fw-bold" onClick={getDetalles}>↻ ACTUALIZAR</button>
          <button className="btn btn-secondary fw-bold w-100" disabled>HISTORIAL INMUTABLE</button>
        </div>
      </div>
      </div>

      <table className="table table-striped table-bordered shadow-sm">
        <thead className="table-dark">
          <tr>
            <th>ID DETALLE</th>
            <th>ID PAGO MAESTRO</th>
            <th>FACTURA</th>
            <th>TIPO CONCEPTO</th>
            <th>SERVICIO ASOCIADO</th>
            <th>PERIODO / CUOTA</th>
            <th>SUBTOTAL</th>
            <th>ESTADO</th>
            <th>COBRADO POR</th>
            <th>ACCIONES</th>
          </tr>
        </thead>
        <tbody>
          {detallesPaginados.map(val => (
            <tr key={val.id_pago_detalle}>
              <th>#{val.id_pago_detalle}</th>
              <td>Recibo #{val.id_pago}</td>
              <td>{val.correlativo || <span className="text-muted">Sin correlativo</span>}</td>
              <td>
                <span className={`badge ${val.estado_factura === 'ANULADA' ? 'bg-danger' : 'bg-dark'}`}>
                  {String(val.tipo_concepto || '').toUpperCase()}
                </span>
              </td>
              <td>{val.id_concepto_servicio ? `Servicio #${val.id_concepto_servicio}` : <span className="text-muted">Ninguno (Lote/Mora)</span>}</td>
              <td>{val.mes_pagado ? `Mes: ${val.mes_pagado}` : ''} {val.numero_cuota_afectada ? `| Cuota No. ${val.numero_cuota_afectada}` : ''}</td>
              <td className={`fw-bold ${val.estado_factura === 'ANULADA' ? 'text-danger' : 'text-primary'}`}>Q {parseFloat(val.subtotal || 0).toFixed(2)}</td>
              <td>
                <span className={`badge ${val.estado_factura === 'ANULADA' ? 'bg-danger' : 'bg-success'}`}>
                  {val.estado_factura || 'EMITIDA'}
                </span>
              </td>
              <td>{val.usuario_cobro || `Usuario #${val.id_usuario || 'N/A'}`}</td>
              <td>
                <button onClick={() => generarFacturaDesdeDetalle(val)} className="btn btn-secondary btn-sm m-1 fw-bold">PDF</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* PAGINACIÓN */}
      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        startIndex={startIndex}
        endIndex={endIndex}
        itemsCount={detallesFiltrados.length}
      />
    </div>
  );
}

export default PagosDetalle;