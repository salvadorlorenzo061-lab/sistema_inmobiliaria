import { useState, useEffect, useCallback } from 'react';
import Axios from "axios";
import 'bootstrap/dist/css/bootstrap.min.css';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getPaginatedData, PaginationControls } from '../utils/paginationUtils';
import { API_BASE_URL } from '../config';

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
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState('TODAS');

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
      const { data } = await Axios.get(`${API_URL}/documento/${detalle.id_pago}`);
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
    const rows = detallesFactura.map((item) => {
      const base = parseFloat(item.subtotal || 0);
      const iva = parseFloat((base * 0.12).toFixed(2));
      const total = parseFloat((base + iva).toFixed(2));
      let conceptoLabel = String(item.nombre_concepto || item.tipo_concepto || 'Concepto');

      if (!item.nombre_concepto && item.tipo_concepto === 'cuota_terreno') {
        conceptoLabel = `Cuota Terreno No. ${item.numero_cuota_afectada || 'N/A'}`;
      }

      return [
        conceptoLabel,
        item.mes_pagado || 'N/A',
        `Q${base.toFixed(2)}`,
        `Q${iva.toFixed(2)}`,
        `Q${total.toFixed(2)}`
      ];
    });

    const montoTotal = rows.reduce((acc, row) => acc + parseFloat(String(row[4]).replace('Q', '')), 0);
    const conceptos = [...new Set(detallesFactura.map((d) => String(d?.nombre_concepto || d?.tipo_concepto || '').trim()).filter(Boolean))].join(', ') || 'Pago de cuota';
    const correlativo = String(documento?.correlativo || `REC-${documento?.id_pago || '0'}`);
    const matchRef = correlativo.match(/^([A-Za-z]+)-([0-9]+)$/);
    const serie = matchRef ? matchRef[1].toUpperCase() : 'B';
    const numero = matchRef ? matchRef[2].slice(-5) : String(documento?.id_pago || '0').padStart(5, '0');
    const fechaDoc = new Date(documento?.fecha_evento || Date.now());
    const empresaLogo = normalizeImageDataUrl(documento?.empresa?.logo_empresa || '');
    const nombreEmpresa = String(documento?.empresa?.nombre_empresa || 'CORPORACION DE INVERSION INMOBILIARIA').toUpperCase();
    const nombreProyecto = String(documento?.contrato?.codigo_contrato || 'Proyecto');
    const rolEmisor = String(documento?.rol_usuario_cobro || '');
    const metodo = String(documento?.metodo_pago || '').toLowerCase();
    const esJuridico = isRoleJuridico(rolEmisor);

    const doc = new jsPDF({ orientation: esJuridico ? 'landscape' : 'landscape', unit: 'mm', format: 'letter' });

    if (esJuridico) {
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margenX = 8;
      const ancho = pageW - (margenX * 2);

      if (empresaLogo) {
        try {
          doc.addImage(empresaLogo, getImageFormatFromDataUrl(empresaLogo), margenX + 3, 8.5, 31, 18, `jur-logo-${Date.now()}`, 'FAST');
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

      autoTable(doc, {
        startY: 40,
        head: [['Concepto', 'Mes', 'Base', 'IVA', 'Total']],
        body: rows,
        theme: 'grid',
        styles: { fontSize: 9 }
      });

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(`Recibimos de: ${documento?.cliente?.nombre_residente || 'N/A'}`, 10, doc.lastAutoTable.finalY + 10);
      doc.text(`Cantidad: ${montoALetrasRecibo(montoTotal)}`, 10, doc.lastAutoTable.finalY + 16);
      doc.text(`Por cancelacion de: ${conceptos}`, 10, doc.lastAutoTable.finalY + 22);
      doc.text(`Proyecto: ${nombreProyecto}`, 10, doc.lastAutoTable.finalY + 28);
      doc.text(`Metodo: ${documento?.metodo_pago || 'N/A'} ${metodo.includes('efectivo') ? '(efectivo)' : ''}`, 10, doc.lastAutoTable.finalY + 34);

      if (String(documento?.estado_factura || '').toUpperCase() === 'ANULADA') {
        doc.setTextColor(180, 0, 0);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(42);
        doc.text('ANULADA', pageW / 2, pageH / 2, { align: 'center', angle: 20 });
        doc.setTextColor(0, 0, 0);
      }
    } else {
      const x = 10;
      const w = 190;
      let y = 10;
      const headerHeight = 22;
      const rightHeaderWidth = 68;
      const leftHeaderWidth = w - rightHeaderWidth;
      const rightHeaderX = x + leftHeaderWidth;

      doc.setFillColor(240, 228, 167);
      doc.rect(x, y, w, headerHeight, 'F');
      doc.rect(x, y, w, headerHeight);
      doc.line(rightHeaderX, y, rightHeaderX, y + headerHeight);
      if (empresaLogo) {
        try {
          doc.addImage(empresaLogo, getImageFormatFromDataUrl(empresaLogo), x + 3, y + 1.2, 24, 19, `caja-logo-${Date.now()}`, 'FAST');
        } catch {
          // no-op
        }
      }

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.text('RECIBO DE CAJA', rightHeaderX + (rightHeaderWidth / 2), y + 7, { align: 'center' });
      doc.setFontSize(9.5);
      doc.text(`Serie "${serie}"`, rightHeaderX + 6, y + 13.5);
      doc.setTextColor(166, 35, 35);
      doc.text(`N. ${String(numero).padStart(5, '0')}`, x + w - 2, y + 13.5, { align: 'right' });
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(9.2);
      doc.text(doc.splitTextToSize(nombreEmpresa, leftHeaderWidth - 12), x + 42, y + 7, { align: 'center' });

      y += headerHeight + 10;
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`Nombre: ${documento?.cliente?.nombre_residente || 'N/A'}`, x + 2, y + 4);
      doc.text(`Fecha: Guatemala, ${fechaLargaGT(fechaDoc)}`, x + 2, y + 10);
      doc.text(`Por: Q ${montoTotal.toFixed(2)}`, x + 140, y + 10);
      doc.text(`Paga la cantidad de: ${montoALetrasRecibo(montoTotal)}`, x + 2, y + 16);
      doc.text(`Por cancelacion de: ${conceptos}`, x + 2, y + 22);

      autoTable(doc, {
        startY: y + 28,
        head: [['Concepto', 'Mes', 'Total']],
        body: detallesFactura.map((i) => [i.nombre_concepto || i.tipo_concepto, i.mes_pagado || 'N/A', `Q${Number(i.subtotal || 0).toFixed(2)}`]),
        theme: 'grid',
        styles: { fontSize: 9 }
      });

      if (String(documento?.estado_factura || '').toUpperCase() === 'ANULADA') {
        doc.setTextColor(180, 0, 0);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(42);
        doc.text('ANULADA', 105, 140, { align: 'center', angle: 20 });
        doc.setTextColor(0, 0, 0);
      }
    }

    doc.save(`Recibo_${correlativo.replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`);
  };

  const getDetalles = useCallback(() => {
    Axios.get(API_URL).then(res => setDetalles(res.data)).catch(err => console.error(err));
  }, [API_URL]);

  useEffect(() => {
    getDetalles();
  }, [getDetalles]);

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
        <div className="col-md-3 text-end">
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