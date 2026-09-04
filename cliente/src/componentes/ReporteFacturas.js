import React, { useState } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import { API_BASE_URL } from '../config';
import {
  buildConsolidatedInvoiceRows,
  normalizeImageDataUrl,
  renderFacturaComprobante
} from '../utils/facturaPdf';

const ReporteFacturas = () => {
  const [criterio, setCriterio] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [estado, setEstado] = useState('TODAS');
  const [facturas, setFacturas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [documentoDescargando, setDocumentoDescargando] = useState('');
  const [busquedaRealizada, setBusquedaRealizada] = useState(false);

  const mostrarToast = (mensaje, icon = 'info') => Swal.fire({
    toast: true,
    position: 'top-end',
    icon,
    title: mensaje,
    showConfirmButton: false,
    timer: 2600
  });

  const buscarFacturas = async () => {
    if (fechaInicio && fechaFin && fechaInicio > fechaFin) {
      mostrarToast('La fecha inicial no puede ser posterior a la fecha final.', 'warning');
      return;
    }

    setCargando(true);
    setBusquedaRealizada(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/pagos_detalle/reporte-facturas`, {
        params: {
          criterio: criterio.trim(),
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          estado
        }
      });
      setFacturas(Array.isArray(data) ? data : []);
    } catch (error) {
      setFacturas([]);
      mostrarToast(error?.response?.data?.message || 'No se pudo consultar la reportería de facturas.', 'error');
    } finally {
      setCargando(false);
    }
  };

  const limpiar = () => {
    setCriterio('');
    setFechaInicio('');
    setFechaFin('');
    setEstado('TODAS');
    setFacturas([]);
    setBusquedaRealizada(false);
  };

  const descargarFactura = async (factura) => {
    const idPago = Number(factura?.id_pago || 0);
    const estadoFactura = String(factura?.estado_factura || 'EMITIDA').toUpperCase();
    const claveDocumento = `${idPago}-${estadoFactura}`;

    if (!idPago) {
      mostrarToast('No se encontró el identificador del documento.', 'warning');
      return;
    }

    setDocumentoDescargando(claveDocumento);
    try {
      const { data: documento } = await axios.get(`${API_BASE_URL}/api/pagos_detalle/documento/${idPago}`, {
        params: { estado_factura: estadoFactura }
      });
      const detalles = Array.isArray(documento?.detalles) ? documento.detalles : [];
      const filas = buildConsolidatedInvoiceRows(detalles, {
        usarCuotaCeroEnganche: Number(documento?.contrato?.enganche || 0) > 0
      });
      const totalDocumento = detalles.reduce((sum, detalle) => sum + Number(detalle?.subtotal || 0), 0);
      const correlativo = String(documento?.correlativo || factura?.correlativo || `Pago-${idPago}`);
      const fechaDocumento = documento?.fecha_evento ? new Date(documento.fecha_evento) : new Date();
      const logo = normalizeImageDataUrl(documento?.empresa?.logo_empresa || documento?.empresa?.logo_proyecto || '');
      const doc = new jsPDF();

      renderFacturaComprobante(doc, {
        logo,
        empresa: {
          nombre: documento?.empresa?.nombre_empresa,
          nit: documento?.empresa?.nit_empresa,
          pais: documento?.empresa?.pais,
          moneda: documento?.empresa?.moneda
        },
        documentoNo: correlativo,
        fechaEmision: Number.isNaN(fechaDocumento.getTime()) ? new Date() : fechaDocumento,
        cliente: {
          nombre: documento?.cliente?.nombre_residente,
          direccion: documento?.cliente?.direccion_notificacion,
          identificacion: documento?.cliente?.numero_identificacion,
          dpi: documento?.cliente?.dpi,
          nit: documento?.cliente?.nit
        },
        contrato: documento?.contrato?.codigo_contrato,
        pago: {
          metodo: documento?.metodo_pago,
          referencia: correlativo,
          banco: documento?.banco_pago,
          fechaOperacion: documento?.fecha_operacion,
          boletaReferencia: documento?.boleta_referencia
        },
        filas,
        resumen: [
          { label: 'Subtotal deuda pagada', valor: totalDocumento },
          { label: 'Total Cobrado', valor: totalDocumento, bold: true }
        ],
        anulada: estadoFactura === 'ANULADA'
      });

      const nombreSeguro = correlativo.replace(/[^A-Za-z0-9_-]/g, '_');
      doc.save(`Factura_${estadoFactura}_${nombreSeguro}.pdf`);
      mostrarToast(`Factura ${estadoFactura.toLowerCase()} descargada.`, 'success');
    } catch (error) {
      mostrarToast(error?.response?.data?.message || 'No se pudo descargar la factura histórica.', 'error');
    } finally {
      setDocumentoDescargando('');
    }
  };

  return (
    <div className="container mt-4">
      <div className="module-header">
        <div className="row align-items-center bg-light p-3 rounded shadow-sm">
          <div className="col-lg-4">
            <h3 className="m-0 text-dark fw-bold">REPORTE DE FACTURAS</h3>
          </div>
          <div className="col-lg-8 text-lg-end text-muted">
            Facturas emitidas y anuladas
          </div>
        </div>
      </div>

      <div className="border rounded shadow-sm bg-white p-3 mb-4">
        <div className="row g-3 align-items-end">
          <div className="col-lg-5">
            <label className="form-label fw-bold">Cliente, identificación o documento</label>
            <input
              type="search"
              className="form-control"
              placeholder="Nombre, apellido, ID, DPI, factura o contrato..."
              value={criterio}
              onChange={(e) => setCriterio(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && buscarFacturas()}
            />
          </div>
          <div className="col-md-3 col-lg-2">
            <label className="form-label fw-bold">Desde</label>
            <input type="date" className="form-control" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
          </div>
          <div className="col-md-3 col-lg-2">
            <label className="form-label fw-bold">Hasta</label>
            <input type="date" className="form-control" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
          </div>
          <div className="col-md-3 col-lg-1">
            <label className="form-label fw-bold">Estado</label>
            <select className="form-select" value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="TODAS">Todas</option>
              <option value="EMITIDA">Emitidas</option>
              <option value="ANULADA">Anuladas</option>
            </select>
          </div>
          <div className="col-md-3 col-lg-2 d-flex gap-2">
            <button type="button" className="btn btn-primary flex-grow-1" onClick={buscarFacturas} disabled={cargando}>
              {cargando ? 'Buscando...' : 'Buscar'}
            </button>
            <button type="button" className="btn btn-outline-secondary" onClick={limpiar}>Limpiar</button>
          </div>
        </div>
      </div>

      {facturas.length > 0 && (
        <div className="table-responsive border rounded shadow-sm" style={{ maxHeight: '620px' }}>
          <table className="table table-striped table-bordered align-middle mb-0">
            <thead className="table-dark position-sticky top-0">
              <tr>
                <th>Cuota / Mes</th>
                <th>Factura</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Identificación</th>
                <th>Contrato</th>
                <th>Estado</th>
                <th className="text-end">Total</th>
                <th>Documento</th>
              </tr>
            </thead>
            <tbody>
              {facturas.map((factura, index) => {
                const claveDocumento = `${factura.id_pago}-${String(factura.estado_factura || 'EMITIDA').toUpperCase()}`;
                const descargando = documentoDescargando === claveDocumento;
                const cuotaEtiqueta = Number.isFinite(Number(factura?.cuota_inicio)) && Number(factura.cuota_inicio) > 0
                  ? `Cuota ${factura.cuota_inicio}`
                  : 'Enganche';
                return (
                <tr key={`${claveDocumento}-${factura.fecha_evento || index}`}>
                  <td>
                    {cuotaEtiqueta}
                    <div className="small text-muted">{factura.meses_pagados || 'Sin mes registrado'}</div>
                  </td>
                  <td>{factura.correlativo || `Pago #${factura.id_pago}`}</td>
                  <td>{factura.fecha_evento ? new Date(factura.fecha_evento).toLocaleDateString('es-GT') : 'N/A'}</td>
                  <td>{factura.nombre_residente || 'N/A'}</td>
                  <td>{factura.numero_identificacion || factura.dpi || 'N/A'}</td>
                  <td>{factura.codigo_contrato || 'N/A'}</td>
                  <td>
                    <span className={`badge ${String(factura.estado_factura).toUpperCase() === 'ANULADA' ? 'bg-danger' : 'bg-success'}`}>
                      {factura.estado_factura}
                    </span>
                  </td>
                  <td className="text-end fw-bold">Q{Number(factura.total_documento || 0).toFixed(2)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => descargarFactura(factura)}
                      disabled={Boolean(documentoDescargando)}
                    >
                      {descargando ? 'Descargando...' : 'Descargar PDF'}
                    </button>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      )}

      {!cargando && busquedaRealizada && facturas.length === 0 && (
        <div className="alert alert-light border text-center text-muted">No hay facturas para los filtros seleccionados.</div>
      )}
    </div>
  );
};

export default ReporteFacturas;
