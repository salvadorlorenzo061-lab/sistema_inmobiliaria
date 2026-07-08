import { useState, useEffect, useCallback } from 'react';
import Axios from "axios";
import 'bootstrap/dist/css/bootstrap.min.css';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getPaginatedData, PaginationControls } from '../utils/paginationUtils';
import { API_BASE_URL } from '../config';

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

    const empresaLogo = normalizeImageDataUrl(documento?.empresa?.logo_empresa || '');
    const doc = new jsPDF();
    const margenX = 14;
    const fechaHora = new Date().toLocaleString();

    if (empresaLogo) {
      try {
        const logoFormat = getImageFormatFromDataUrl(empresaLogo);
        doc.addImage(empresaLogo, logoFormat, margenX, 10, 35, 25, `logo-${documento?.id_pago || 'doc'}`, 'FAST');
      } catch (e) {
        console.warn('No se pudo renderizar logo de factura:', e);
      }
    }

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(documento?.empresa?.nombre_empresa || 'Inmobiliaria', 55, 16);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`NIT: ${documento?.empresa?.nit_empresa || 'N/A'}`, 55, 22);
    doc.text(`País: ${documento?.empresa?.pais || 'Guatemala'}`, 55, 27);
    doc.text(`Moneda: ${documento?.empresa?.moneda || 'GTQ'}`, 55, 32);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text('FACTURA / COMPROBANTE DE COBRO', 132, 16);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Documento No: ${documento?.correlativo || `REC-${documento?.id_pago || '0'}`}`, 132, 24);
    doc.text(`Fecha emisión: ${new Date(documento?.fecha_evento || Date.now()).toLocaleDateString()}`, 132, 30);
    doc.text(`Fecha/Hora impresión: ${fechaHora}`, 132, 36);
    doc.line(14, 42, 196, 42);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('DATOS DEL CLIENTE / RESIDENTE', 14, 52);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Nombre: ${documento?.cliente?.nombre_residente || 'N/A'}`, 14, 59);
    doc.text(`Identificación: ${documento?.cliente?.numero_identificacion || 'N/A'}`, 14, 65);
    doc.text(`DPI: ${documento?.cliente?.dpi || 'N/A'}`, 14, 71);
    doc.text(`NIT: ${documento?.cliente?.nit || 'CF'}`, 14, 77);
    doc.text(`Dirección: ${documento?.cliente?.direccion_notificacion || 'N/A'}`, 105, 59);
    doc.text(`Contrato: ${documento?.contrato?.codigo_contrato || 'N/A'} (${documento?.contrato?.nombre_contrato || 'N/A'})`, 105, 65);

    doc.setFont('Helvetica', 'bold');
    doc.text('DATOS DE PAGO', 14, 88);
    doc.setFont('Helvetica', 'normal');
    doc.text(`Método de pago: ${documento?.metodo_pago || 'N/A'}`, 14, 94);
    doc.text(`Referencia: ${documento?.correlativo || 'N/A'}`, 105, 94);
    doc.text(`Cobrado por: ${documento?.usuario_cobro || 'N/A'}`, 14, 100);

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

    autoTable(doc, {
      startY: 106,
      head: [['Concepto / Cuota', 'Mes Afectado', 'Monto Base', 'IVA 12%', 'Total por Mes']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [36, 125, 188] },
      styles: { fontSize: 10 }
    });

    const subtotal = rows.reduce((acc, row) => acc + parseFloat(String(row[2]).replace('Q', '')), 0);
    const ivaTotal = rows.reduce((acc, row) => acc + parseFloat(String(row[3]).replace('Q', '')), 0);
    const total = rows.reduce((acc, row) => acc + parseFloat(String(row[4]).replace('Q', '')), 0);

    let finalY = doc.lastAutoTable.finalY + 12;
    doc.setFont('Helvetica', 'bold');
    doc.text(`Subtotal deuda pagada: Q${subtotal.toFixed(2)}`, 130, finalY);
    doc.text(`IVA 12%: Q${ivaTotal.toFixed(2)}`, 130, finalY + 7);
    doc.text(`Total Cobrado: Q${total.toFixed(2)}`, 130, finalY + 14);

    doc.setFont('Helvetica', 'italic');
    doc.setFontSize(9);
    doc.text('Gracias por su pago. Conservar este documento para cualquier aclaración fiscal y administrativa.', 14, finalY + 28);

    if (String(documento?.estado_factura || '').toUpperCase() === 'ANULADA') {
      doc.setTextColor(180, 0, 0);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(42);
      doc.text('ANULADA', 105, 155, { align: 'center', angle: 20 });
      doc.setTextColor(0, 0, 0);
    }

    doc.save(`Recibo_${documento?.correlativo || `REC-${documento?.id_pago || '0'}`}.pdf`);
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