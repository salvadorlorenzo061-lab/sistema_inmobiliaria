import { useState, useEffect, useCallback } from 'react';
import Axios from "axios";
import 'bootstrap/dist/css/bootstrap.min.css';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getPaginatedData, PaginationControls } from '../utils/paginationUtils';
import { API_BASE_URL } from '../config';

function PagosDetalle() {
  const [id_pago_detalle, setId_pago_detalle] = useState("");
  const [id_pago, setId_pago] = useState("");
  const [tipo_concepto, setTipo_concepto] = useState("");
  const [id_concepto_servicio, setId_concepto_servicio] = useState("");
  const [mes_pagado, setMes_pagado] = useState("");
  const [numero_cuota_afectada, setNumero_cuota_afectada] = useState("");
  const [subtotal, setSubtotal] = useState("");

  const [detallesList, setDetalles] = useState([]);
  const [pagosList, setPagos] = useState([]);
  const [serviciosList, setServicios] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState('TODAS');

  const [showRegModal, setShowRegModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const API_URL = `${API_BASE_URL}/api/pagos_detalle`;

  const cargarSelects = useCallback(() => {
    Axios.get(`${API_BASE_URL}/api/pagos`).then(res => setPagos(res.data));
    Axios.get(`${API_BASE_URL}/api/servicios`).then(res => setServicios(res.data));
  }, []);

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

  const generarFacturaDesdeDetalle = (detalle) => {
    const pago = pagosList.find((p) => String(p.id_pago) === String(detalle.id_pago));
    if (!pago) {
      Swal.fire({ icon: 'warning', title: 'Pago no encontrado', text: 'No se encontró el pago maestro para este detalle.' });
      return;
    }

    const detallesFactura = detallesList.filter((d) => String(d.id_pago) === String(detalle.id_pago));
    const empresaLogo = normalizeImageDataUrl(pago.logo || '');
    const doc = new jsPDF();
    const margenX = 14;
    const fechaHora = new Date().toLocaleString();

    if (empresaLogo) {
      try {
        const logoFormat = getImageFormatFromDataUrl(empresaLogo);
        doc.addImage(empresaLogo, logoFormat, margenX, 10, 35, 25, `logo-${pago.id_pago}`, 'FAST');
      } catch (e) {
        console.warn('No se pudo renderizar logo de factura:', e);
      }
    }

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(pago.nombre_empresa || 'Inmobiliaria', 55, 16);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`NIT: ${pago.nit_empresa || 'N/A'}`, 55, 22);
    doc.text(`País: ${pago.pais || 'Guatemala'}`, 55, 27);
    doc.text(`Moneda: ${pago.moneda || 'GTQ'}`, 55, 32);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text('FACTURA / COMPROBANTE DE COBRO', 132, 16);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Documento No: ${pago.no_referencia || `REC-${pago.id_pago}`}`, 132, 24);
    doc.text(`Fecha emisión: ${new Date(pago.fecha_pago || Date.now()).toLocaleDateString()}`, 132, 30);
    doc.text(`Fecha/Hora impresión: ${fechaHora}`, 132, 36);
    doc.line(14, 42, 196, 42);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('DATOS DEL CLIENTE / RESIDENTE', 14, 52);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Nombre: ${pago.nombre_residente || 'N/A'}`, 14, 59);
    doc.text(`Identificación: ${pago.numero_identificacion || 'N/A'}`, 14, 65);
    doc.text(`DPI: ${pago.dpi || 'N/A'}`, 14, 71);
    doc.text(`NIT: ${pago.nit || 'CF'}`, 14, 77);
    doc.text(`Dirección: ${pago.direccion_notificacion || 'N/A'}`, 105, 59);
    doc.text(`Contrato: ${pago.codigo_contrato || 'N/A'} (${pago.nombre_contrato || 'N/A'})`, 105, 65);

    doc.setFont('Helvetica', 'bold');
    doc.text('DATOS DE PAGO', 14, 88);
    doc.setFont('Helvetica', 'normal');
    doc.text(`Método de pago: ${pago.forma_pago || 'N/A'}`, 14, 94);
    doc.text(`Referencia: ${pago.no_referencia || 'N/A'}`, 105, 94);
    doc.text(`Cobrado por: ${pago.nombre_usuario || `Usuario #${pago.id_usuario || 'N/A'}`}`, 14, 100);

    const rows = detallesFactura.map((item) => {
      const base = parseFloat(item.subtotal || 0);
      const iva = parseFloat((base * 0.12).toFixed(2));
      const total = parseFloat((base + iva).toFixed(2));
      let conceptoLabel = String(item.tipo_concepto || 'Concepto');

      if (item.tipo_concepto === 'cuota_terreno') {
        conceptoLabel = `Cuota Terreno No. ${item.numero_cuota_afectada || 'N/A'}`;
      } else if (item.tipo_concepto === 'servicio' || item.tipo_concepto === 'servicio_adicional') {
        const servicio = serviciosList.find((s) => String(s.id_servicio) === String(item.id_concepto_servicio));
        conceptoLabel = `Servicio: ${servicio?.nombre_servicio || `ID ${item.id_concepto_servicio || 'N/A'}`}`;
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

    doc.save(`Recibo_${pago.no_referencia || `REC-${pago.id_pago}`}.pdf`);
  };

  const getDetalles = useCallback(() => {
    Axios.get(API_URL).then(res => setDetalles(res.data)).catch(err => console.error(err));
  }, [API_URL]);

  useEffect(() => {
    getDetalles();
    cargarSelects();
  }, [getDetalles, cargarSelects]);

  const addDetalle = () => {
    if (!id_pago || !tipo_concepto || !subtotal.trim()) {
      Swal.fire({ position: "top-end", icon: "warning", title: 'CAMPOS INCOMPLETOS', showConfirmButton: false, timer: 3000 });
      return;
    }

    Axios.post(`${API_URL}/crear`, { id_pago, tipo_concepto, id_concepto_servicio: id_concepto_servicio || null, mes_pagado, numero_cuota_afectada, subtotal })
    .then(() => {
      getDetalles();
      limpiarCampos();
      setShowRegModal(false);
      Swal.fire({ position: "top-end", icon: "success", title: 'Desglose guardado', showConfirmButton: false, timer: 3000 });
    })
    .catch(err => {
      Swal.fire({ icon: 'error', title: 'Error al insertar', text: err.response?.data?.message || 'Error de servidor' });
    });
  };

  const actualizarDetalle = () => {
    Axios.put(`${API_URL}/actualizar`, { id_pago_detalle, id_pago, tipo_concepto, id_concepto_servicio: id_concepto_servicio || null, mes_pagado, numero_cuota_afectada, subtotal })
    .then(() => {
      getDetalles();
      limpiarCampos();
      setShowEditModal(false);
      Swal.fire({ icon: 'success', title: 'Registro actualizado', timer: 3000, showConfirmButton: false });
    })
    .catch(() => Swal.fire({ icon: 'error', title: 'Error al actualizar' }));
  };

  const deleteDetalle = (val) => {
    Swal.fire({
      title: "¿Eliminar desglose?",
      text: `ID Detalle: #${val.id_pago_detalle}`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, borrar"
    }).then(result => {
      if (result.isConfirmed) {
        Axios.delete(`${API_URL}/delete/${val.id_pago_detalle}`).then(() => {
          getDetalles();
          Swal.fire('Eliminado', 'El rubro fue borrado.', 'success');
        });
      }
    });
  };

  const abrirEditar = (val) => {
    setId_pago_detalle(val.id_pago_detalle);
    setId_pago(val.id_pago);
    setTipo_concepto(val.tipo_concepto);
    setId_concepto_servicio(val.id_concepto_servicio || "");
    setMes_pagado(val.mes_pagado || "");
    setNumero_cuota_afectada(val.numero_cuota_afectada || "");
    setSubtotal(String(val.subtotal));
    setShowEditModal(true);
  };

  const limpiarCampos = () => {
    setId_pago_detalle(""); setId_pago(""); setTipo_concepto(""); setId_concepto_servicio(""); setMes_pagado(""); setNumero_cuota_afectada(""); setSubtotal("");
  };

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
          <button className="btn btn-info fw-bold w-100 text-dark" onClick={() => { limpiarCampos(); setShowRegModal(true); }}>➕ AGREGAR DESGLOSE</button>
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
              <td>
                {val.estado_factura === 'ANULADA' ? (
                  <span className="text-muted small">Factura anulada</span>
                ) : (
                  <>
                    <button onClick={() => abrirEditar(val)} className="btn btn-warning btn-sm m-1 fw-bold">EDITAR</button>
                    <button onClick={() => deleteDetalle(val)} className="btn btn-danger btn-sm m-1 fw-bold">ELIMINAR</button>
                    <button onClick={() => generarFacturaDesdeDetalle(val)} className="btn btn-secondary btn-sm m-1 fw-bold">PDF</button>
                  </>
                )}
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

      {/* MODAL REGISTRO */}
      {showRegModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header bg-info text-dark"><h5 className="modal-title fw-bold">Asignar Rubro a Pago</h5></div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-bold">Vincular al Recibo No:</label>
                  <select value={id_pago} onChange={(e) => setId_pago(e.target.value)} className="form-select">
                    <option value="">-- Seleccione el Pago Maestro --</option>
                    {pagosList.map(p => <option key={p.id_pago} value={p.id_pago}>Recibo #{p.id_pago} - Total: Q{p.monto_total_pagado}</option>)}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Tipo de Concepto:</label>
                  <select value={tipo_concepto} onChange={(e) => setTipo_concepto(e.target.value)} className="form-select">
                    <option value="">-- Seleccione Categoría --</option>
                    <option value="cuota_terreno">Cuota Fija de Lote / Terreno</option>
                    <option value="mora">Interés Moratorio</option>
                    <option value="servicio_adicional">Servicio del Catálogo</option>
                  </select>
                </div>
                {tipo_concepto === "servicio_adicional" && (
                  <div className="mb-3">
                    <label className="form-label fw-bold">Seleccione el Servicio Comercial:</label>
                    <select value={id_concepto_servicio} onChange={(e) => setId_concepto_servicio(e.target.value)} className="form-select">
                      <option value="">-- Seleccione del Catálogo --</option>
                      {serviciosList.map(s => <option key={s.id_servicio} value={s.id_servicio}>{s.nombre_servicio}</option>)}
                    </select>
                  </div>
                )}
                <div className="mb-3">
                  <label className="form-label fw-bold">Mes Aplicado (Opcional):</label>
                  <input type="text" value={mes_pagado} onChange={(e) => setMes_pagado(e.target.value)} className="form-control" placeholder="Ej: Octubre 2026" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Número de Cuota Afectada (Si aplica):</label>
                  <input type="number" value={numero_cuota_afectada} onChange={(e) => setNumero_cuota_afectada(e.target.value)} className="form-control" placeholder="Ej: 14" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Subtotal Parcial (Q):</label>
                  <input type="number" step="0.01" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} className="form-control" />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowRegModal(false); limpiarCampos(); }}>Cerrar</button>
                <button type="button" className="btn btn-info" onClick={addDetalle}>Guardar Detalle</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDICIÓN */}
      {showEditModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header bg-warning text-dark"><h5 className="modal-title fw-bold">Editar Detalle #{id_pago_detalle}</h5></div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-bold">Subtotal:</label>
                  <input type="number" step="0.01" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} className="form-control" />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowEditModal(false); limpiarCampos(); }}>Cancelar</button>
                <button type="button" className="btn btn-warning" onClick={actualizarDetalle}>Actualizar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PagosDetalle;