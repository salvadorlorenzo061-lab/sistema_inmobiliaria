import { useState, useEffect } from 'react';
import Axios from "axios";
import 'bootstrap/dist/css/bootstrap.min.css';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getPaginatedData, PaginationControls } from '../utils/paginationUtils';
import { API_BASE_URL } from '../config';

function PagosExtraordinarios() {
  const [id_pago_extra, setId_pago_extra] = useState("");
  const [id_contrato, setId_contrato] = useState("");
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [estado, setEstado] = useState("pendiente");

  const [extrasList, setExtrasList] = useState([]);
  const [contratosList, setContratosList] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [busquedaResidente, setBusquedaResidente] = useState("");
  const [resultadosResidentes, setResultadosResidentes] = useState([]);
  const [residenteSeleccionado, setResidenteSeleccionado] = useState(null);
  const [mensajeBusquedaResidente, setMensajeBusquedaResidente] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [esEdicion, setEsEdicion] = useState(false);
  const [modoFormulario, setModoFormulario] = useState('cargo');
  const [proyectosCatalogo, setProyectosCatalogo] = useState([]);
  const [proyectosAmenidad, setProyectosAmenidad] = useState([]);
  const [contratosAmenidad, setContratosAmenidad] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const API_URL = `${API_BASE_URL}/api/pagos_extraordinarios`;
  const API_SERVICIOS = `${API_BASE_URL}/api/servicios`;
  const IVA_RATE = 0.12;

  const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const cargarExtras = () => Axios.get(`${API_URL}?_=${Date.now()}`)
    .then(res => setExtrasList(Array.isArray(res.data) ? res.data : []))
    .catch(err => {
      console.error('Error al cargar pagos extraordinarios:', err);
      setExtrasList([]);
    });

  const getImageFormatFromDataUrl = (dataUrl = '') => {
    const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,/i);
    if (!match) return 'PNG';
    const rawFormat = match[1].toLowerCase();
    if (rawFormat === 'jpg' || rawFormat === 'jpeg') return 'JPEG';
    if (rawFormat === 'webp') return 'WEBP';
    return 'PNG';
  };

  const imprimirFacturaExtra = (data) => {
    try {
      const doc = new jsPDF();
      const fechaHora = new Date().toLocaleString();
      const contratoRelacionado = (contratosList || []).find(c => String(c.id_contrato) === String(data?.id_contrato));
      const empresaNombre = data?.nombre_empresa || contratoRelacionado?.nombre_empresa_marca || 'INMOBILIARIA ALFA S.A.';
      const nitEmpresa = data?.nit_empresa || 'N/A';
      const paisEmpresa = data?.pais || 'Guatemala';
      const monedaEmpresa = data?.moneda || 'GTQ';
      const logoEmpresa = data?.logo || contratoRelacionado?.logo_empresa_marca || null;
      const montoBase = parseFloat(data?.monto || 0);
      const montoIva = parseFloat((montoBase * IVA_RATE).toFixed(2));
      const montoTotal = parseFloat((montoBase + montoIva).toFixed(2));
      const estadoPago = (data?.estado || 'pendiente').toUpperCase();

      if (logoEmpresa) {
        try {
          const logoFormat = getImageFormatFromDataUrl(logoEmpresa);
          doc.addImage(logoEmpresa, logoFormat, 14, 10, 35, 22, `extra-logo-${data?.id_pago_extra || 'tmp'}`, 'FAST');
        } catch (e) {
          console.warn('No se pudo renderizar logo en factura extra:', e);
        }
      }

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(empresaNombre, 55, 18);

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`NIT: ${nitEmpresa}`, 55, 24);
      doc.text(`País: ${paisEmpresa}`, 55, 29);
      doc.text(`Moneda: ${monedaEmpresa}`, 55, 34);

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('FACTURA CONTABLE DE COBRO EXTRAORDINARIO', 104, 16);

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Documento No: EXTRA-${data?.id_pago_extra || 'N/A'}`, 104, 23);
      doc.text(`Fecha emisión: ${data?.fecha_pago ? new Date(data.fecha_pago).toLocaleDateString() : new Date().toLocaleDateString()}`, 104, 29);
      doc.text(`Fecha/Hora impresión: ${fechaHora}`, 104, 35);

      doc.line(14, 40, 196, 40);

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('DATOS DEL RESIDENTE', 14, 48);

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Nombre: ${data?.nombre_residente || 'N/A'}`, 14, 55);
      doc.text(`DPI: ${data?.dpi || 'N/A'}`, 14, 61);
      doc.text(`Clave: ${data?.numero_identificacion || 'N/A'}`, 14, 67);
      doc.text(`Contrato: ${data?.codigo_contrato || `#${data?.id_contrato || 'N/A'}`}`, 14, 73);

      doc.setFont('Helvetica', 'bold');
      doc.text('DETALLE CONTABLE DEL COBRO', 14, 85);

      autoTable(doc, {
        startY: 90,
        head: [['Concepto', 'Subtotal', 'IVA 12%', 'Total']],
        body: [[
          data?.concepto || 'N/A',
          `Q${montoBase.toFixed(2)}`,
          `Q${montoIva.toFixed(2)}`,
          `Q${montoTotal.toFixed(2)}`
        ]],
        theme: 'striped',
        headStyles: { fillColor: [36, 125, 188] },
        styles: { fontSize: 10 }
      });

      let finalY = (doc.lastAutoTable?.finalY || 106) + 10;
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Estado del cobro: ${estadoPago}`, 14, finalY);

      finalY += 8;
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`Subtotal: Q${montoBase.toFixed(2)}`, 135, finalY);
      doc.text(`IVA (12%): Q${montoIva.toFixed(2)}`, 135, finalY + 7);
      doc.setTextColor(200, 0, 0);
      doc.text(`TOTAL FACTURA: Q${montoTotal.toFixed(2)}`, 135, finalY + 14);
      doc.setTextColor(0, 0, 0);

      doc.setFont('Helvetica', 'italic');
      doc.setFontSize(9);
      doc.text('Factura contable generada automáticamente por el módulo de Cobros Extraordinarios.', 14, finalY + 28);

      doc.save(`Factura_Extra_${data?.id_pago_extra || 'sin_id'}.pdf`);
    } catch (error) {
      console.error('Error al generar factura extra:', error);
      Swal.fire('Atención', 'El cobro se guardó, pero no se pudo generar la factura PDF.', 'warning');
    }
  };

  useEffect(() => {
    cargarExtras();

    Axios.get(`${API_BASE_URL}/api/contratos_residentes`)
      .then(res => setContratosList(Array.isArray(res.data) ? res.data : []))
      .catch(err => {
        console.error('Error al cargar contratos:', err);
        setContratosList([]);
      });

    Axios.get(`${API_SERVICIOS}/catalogo-proyectos`)
      .then((res) => setProyectosCatalogo(Array.isArray(res.data) ? res.data : []))
      .catch((err) => {
        console.error('Error al cargar catalogo de proyectos para amenidades:', err);
        setProyectosCatalogo([]);
      });
  }, [API_URL, API_SERVICIOS]);

  const recargarExtras = async (intentos = 2) => {
    for (let i = 0; i <= intentos; i += 1) {
      try {
        const res = await Axios.get(`${API_URL}?_=${Date.now()}_${i}`);
        setExtrasList(Array.isArray(res.data) ? res.data : []);
        return;
      } catch {
        if (i === intentos) {
          setExtrasList([]);
          return;
        }
        await esperar(450);
      }
    }
  };

  const guardar = () => {
    if (!concepto.trim() || !monto) {
      Swal.fire('Atención', 'Complete todos los campos requeridos', 'warning');
      return;
    }

    if (modoFormulario === 'amenidad') {
      Axios.post(`${API_SERVICIOS}/crear`, {
        nombre_servicio: concepto,
        costo_servicio: monto,
        estado: 'activo',
        proyectos_asignados: proyectosAmenidad,
        contratos_asignados: contratosAmenidad
      })
        .then(() => {
          setShowModal(false);
          limpiar();
          Swal.fire({
            icon: 'success',
            title: 'Amenidad creada',
            text: proyectosAmenidad.length
              ? 'Amenidad registrada y relacionada a proyectos.'
              : 'Amenidad registrada sin proyecto asignado.',
            timer: 2200,
            showConfirmButton: false
          });
        })
        .catch((err) => {
          const detalleServidor = err.response?.data?.detail || err.response?.data?.message || err.response?.data;
          Swal.fire({
            icon: 'error',
            title: 'No se pudo crear la amenidad',
            text: detalleServidor || 'Error al guardar la amenidad.'
          });
        });
      return;
    }

    if (!id_contrato) {
      Swal.fire('Atención', 'Debe seleccionar un contrato para crear el cobro extraordinario.', 'warning');
      return;
    }

    const url = esEdicion ? `${API_URL}/actualizar` : `${API_URL}/crear`;
    const metodo = esEdicion ? Axios.put : Axios.post;

    metodo(url, { id_pago_extra, id_contrato, concepto, monto, estado })
    .then(async (response) => {
      if (!esEdicion && response?.data?.detalle?.id_pago_extra) {
        const detalleNuevo = response.data.detalle;
        setExtrasList((prev) => {
          const base = Array.isArray(prev) ? prev : [];
          const sinDuplicado = base.filter((item) => String(item.id_pago_extra) !== String(detalleNuevo.id_pago_extra));
          return [detalleNuevo, ...sinDuplicado];
        });
      }

      await recargarExtras(2);
      if (!esEdicion && response?.data?.detalle) {
        imprimirFacturaExtra(response.data.detalle);
      }
      setShowModal(false); limpiar();
      setBusqueda('');
      setCurrentPage(1);
      Swal.fire({
        icon: 'success',
        title: esEdicion ? 'Registro actualizado' : 'Registro guardado y factura generada',
        text: !esEdicion && response?.data?.id_pago_extra
          ? `ID generado: #${response.data.id_pago_extra}`
          : '',
        timer: 2200,
        showConfirmButton: false
      });
    })
    .catch((err) => {
      console.error('Error al guardar cargo extraordinario:', err);
      const esServidorCaido = !err.response;
      const detalleServidor = err.response?.data?.detail || err.response?.data?.message || err.response?.data;
      Swal.fire({
        icon: 'error',
        title: 'No se pudo guardar',
        text: esServidorCaido
          ? 'No hay conexión con el servidor API (puerto 3001). Verifica que el backend esté encendido.'
          : (detalleServidor || 'Revisa los datos del formulario o la conexión con el servidor.')
      });
    });
  };

  const cambiarEstadoCobro = async (item, nuevoEstado, tituloConfirmacion) => {
    const confirm = await Swal.fire({
      icon: 'question',
      title: tituloConfirmacion,
      text: `Cobro #${item.id_pago_extra} (${item.concepto})`,
      showCancelButton: true,
      confirmButtonText: 'Sí, continuar',
      cancelButtonText: 'Cancelar'
    });

    if (!confirm.isConfirmed) return;

    try {
      try {
        await Axios.put(`${API_URL}/cambiar-estado/${item.id_pago_extra}`, { estado: nuevoEstado });
      } catch (primaryErr) {
        // Fallback para entornos donde PUT está restringido por proxy/CORS.
        await Axios.post(`${API_URL}/cambiar-estado/${item.id_pago_extra}`, { estado: nuevoEstado });
      }
      recargarExtras();
      Swal.fire({ icon: 'success', title: 'Estado actualizado', timer: 1500, showConfirmButton: false });
    } catch (err) {
      const backendText = typeof err.response?.data === 'string' ? err.response.data : null;
      Swal.fire({
        icon: 'error',
        title: 'No se pudo actualizar estado',
        text: err.response?.data?.detail || err.response?.data?.message || backendText || 'Error de conexión con el servidor.'
      });
    }
  };

  const abrirEditar = (val) => {
    setId_pago_extra(val.id_pago_extra); setId_contrato(val.id_contrato);
    setConcepto(val.concepto); setMonto(String(val.monto)); setEstado(val.estado);
    setResidenteSeleccionado(null);
    setBusquedaResidente("");
    setResultadosResidentes([]);
    setEsEdicion(true); setShowModal(true);
  };

  const limpiar = () => {
    setId_pago_extra("");
    setId_contrato("");
    setConcepto("");
    setMonto("");
    setEstado("pendiente");
    setEsEdicion(false);
    setBusquedaResidente("");
    setResultadosResidentes([]);
    setResidenteSeleccionado(null);
    setMensajeBusquedaResidente("");
    setModoFormulario('cargo');
    setProyectosAmenidad([]);
    setContratosAmenidad([]);
  };

  const buscarResidenteContrato = async () => {
    if (!busquedaResidente.trim()) {
      Swal.fire('Atención', 'Ingresa nombre, DPI, clave o contrato para buscar.', 'warning');
      return;
    }

    try {
      const res = await Axios.get(`${API_URL}/buscar-residente?criterio=${encodeURIComponent(busquedaResidente.trim())}`);
      const resultadosApi = Array.isArray(res.data) ? res.data : [];
      setResultadosResidentes(resultadosApi);
      setMensajeBusquedaResidente(resultadosApi.length ? "" : "No se encontraron residentes activos con ese criterio.");
    } catch (err) {
      const criterio = busquedaResidente.trim().toLowerCase();
      const resultadosLocales = (contratosList || [])
        .filter((c) =>
          String(c.nombre_residente || '').toLowerCase().includes(criterio) ||
          String(c.dpi || '').toLowerCase().includes(criterio) ||
          String(c.numero_identificacion || '').toLowerCase().includes(criterio) ||
          String(c.codigo_contrato || '').toLowerCase().includes(criterio)
        )
        .map((c) => ({
          id_residente: c.id_residente,
          nombre: c.nombre_residente,
          dpi: c.dpi,
          numero_identificacion: c.numero_identificacion,
          id_contrato: c.id_contrato,
          codigo_contrato: c.codigo_contrato,
          nombre_tipo_contrato: c.nombre_tipo_contrato
        }));

      setResultadosResidentes(resultadosLocales);
      setMensajeBusquedaResidente(
        resultadosLocales.length
          ? ""
          : "No hay coincidencias por ahora. Puedes crear el cobro seleccionando manualmente un contrato."
      );
    }
  };

  const seleccionarResidenteContrato = (item) => {
    setId_contrato(String(item.id_contrato));
    setResidenteSeleccionado(item);
    setResultadosResidentes([]);
    setBusquedaResidente(item.nombre || '');
    setMensajeBusquedaResidente('');
  };

  const listaFiltrada = extrasList.filter(e => (e.concepto || '').toLowerCase().includes(busqueda.toLowerCase()));
  const resumenResidentesConExtra = Object.values(
    extrasList.reduce((acc, item) => {
      const key = item.nombre_residente || `Contrato #${item.id_contrato}`;
      if (!acc[key]) {
        acc[key] = { nombre: key, cantidad: 0 };
      }
      acc[key].cantidad += 1;
      return acc;
    }, {})
  );

  const handleBusquedaChange = (e) => {
    setBusqueda(e.target.value);
    setCurrentPage(1);
  };

  const { paginatedItems: extrasPaginadas, totalPages, startIndex, endIndex } = getPaginatedData(listaFiltrada, currentPage, itemsPerPage);

  return (
    <div className='container mt-4'>
      <div className="module-header">
      <div className="row align-items-center bg-light p-3 rounded">
        <div className="col-md-4"><h4 className="m-0 fw-bold">COBROS EXTRAORDINARIOS</h4></div>
        <div className="col-md-5">
          <input type="text" className="form-control" placeholder="Buscar concepto de pago..." onChange={handleBusquedaChange} />
        </div>
        <div className="col-md-3 text-end">
          <button className="btn btn-danger fw-bold w-100" onClick={() => { limpiar(); setShowModal(true); }}>➕ CARGO EXTRAORDINARIO</button>
        </div>
      </div>
      </div>

      <div className="card mb-3 shadow-sm border-info">
        <div className="card-header bg-info text-white fw-bold">👥 Residentes con cobro extra cargado</div>
        <div className="card-body py-2">
          {resumenResidentesConExtra.length ? (
            <div className="d-flex flex-wrap gap-2">
              {resumenResidentesConExtra.map((r, idx) => (
                <span key={`${r.nombre}-${idx}`} className="badge bg-secondary p-2">
                  {r.nombre} ({r.cantidad})
                </span>
              ))}
            </div>
          ) : (
            <small className="text-muted">Aún no hay cobros extraordinarios cargados.</small>
          )}
        </div>
      </div>

      <table className="table table-bordered table-striped shadow-sm">
        <thead className="table-danger border-danger">
          <tr><th>ID</th><th>CONTRATO</th><th>CONCEPTO DE COBRO</th><th>MONTO EXTRA</th><th>ESTADO</th><th>ACCIONES</th></tr>
        </thead>
        <tbody>
          {extrasPaginadas.length ? extrasPaginadas.map(val => (
            <tr key={val.id_pago_extra}>
              <th>#{val.id_pago_extra}</th>
              <td>
                {val.codigo_contrato || `Contrato #${val.id_contrato}`}
                <br />
                <small className="text-muted">{val.nombre_residente || 'Residente no disponible'}</small>
              </td>
              <td className="fw-bold">{val.concepto}</td>
              <td className="text-danger fw-bold">Q {parseFloat(val.monto).toFixed(2)}</td>
              <td>
                <span className={`badge bg-${
                  (val.estado || 'pendiente') === 'pagado'
                    ? 'success'
                    : (val.estado || 'pendiente') === 'anulado'
                      ? 'secondary'
                      : 'warning'
                }`}>
                  {(val.estado || 'PENDIENTE').toUpperCase()}
                </span>
              </td>
              <td>
                <button className="btn btn-sm btn-warning fw-bold m-1" onClick={() => abrirEditar(val)}>EDITAR</button>
                <button className="btn btn-sm btn-primary fw-bold m-1" onClick={() => imprimirFacturaExtra(val)}>IMPRIMIR</button>
                {(val.estado || 'pendiente') !== 'pagado' && (val.estado || 'pendiente') !== 'anulado' && (
                  <button
                    className="btn btn-sm btn-success fw-bold m-1"
                    onClick={() => cambiarEstadoCobro(val, 'pagado', '¿Generar pago de este cobro extraordinario?')}
                  >
                    GENERAR PAGO
                  </button>
                )}
                {(val.estado || 'pendiente') !== 'anulado' && (
                  <button
                    className="btn btn-sm btn-dark fw-bold m-1"
                    onClick={() => cambiarEstadoCobro(val, 'anulado', '¿Anular/Revertir este cobro extraordinario?')}
                  >
                    ANULAR COBRO
                  </button>
                )}
                {(val.estado || 'pendiente') === 'anulado' && (
                  <button
                    className="btn btn-sm btn-secondary fw-bold m-1"
                    onClick={() => cambiarEstadoCobro(val, 'pendiente', '¿Reactivar este cobro extraordinario?')}
                  >
                    REACTIVAR
                  </button>
                )}
              </td>
            </tr>
          )) : (
            <tr>
              <td colSpan="6" className="text-center text-muted py-3">
                No hay cobros extraordinarios registrados. Usa el botón "CARGO EXTRAORDINARIO" para crear uno.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        startIndex={startIndex}
        endIndex={endIndex}
        itemsCount={listaFiltrada.length}
      />

      {showModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content border-danger">
              <div className="modal-header bg-danger text-white"><h5>{esEdicion ? "Modificar Cargo Extra" : "Aplicar Cargo Extraordinario"}</h5></div>
              <div className="modal-body">
                {!esEdicion && (
                  <div className="mb-3">
                    <label className="fw-bold">Tipo de registro:</label>
                    <select
                      className="form-select"
                      value={modoFormulario}
                      onChange={(e) => {
                        const modo = e.target.value;
                        setModoFormulario(modo);
                        setResidenteSeleccionado(null);
                        setResultadosResidentes([]);
                        setMensajeBusquedaResidente('');
                        setId_contrato('');
                        setProyectosAmenidad([]);
                        setContratosAmenidad([]);
                      }}
                    >
                      <option value="cargo">Cobro extraordinario a contrato</option>
                      <option value="amenidad">Crear amenidad para proyectos</option>
                    </select>
                    <small className="text-muted">Use "Crear amenidad" para que luego aparezca en contratos según el proyecto.</small>
                  </div>
                )}

                {!esEdicion && modoFormulario === 'cargo' && (
                  <>
                    <div className="mb-2">
                      <label className="fw-bold">Buscar Residente (Nombre / DPI / Clave / Contrato):</label>
                      <div className="input-group">
                        <input
                          type="text"
                          className="form-control"
                          value={busquedaResidente}
                          onChange={(e) => setBusquedaResidente(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && buscarResidenteContrato()}
                          placeholder="Ej: MARIA, 152244522, RES-202606..., CON-..."
                        />
                        <button type="button" className="btn btn-primary" onClick={buscarResidenteContrato}>Buscar</button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => {
                            setBusquedaResidente('');
                            setResultadosResidentes([]);
                            setResidenteSeleccionado(null);
                            setId_contrato('');
                            setMensajeBusquedaResidente('');
                          }}
                        >Limpiar</button>
                      </div>
                    </div>

                    {residenteSeleccionado && (
                      <div className="alert alert-success py-2 mb-2">
                        <strong>Seleccionado:</strong> {residenteSeleccionado.nombre} | DPI: {residenteSeleccionado.dpi} | Clave: {residenteSeleccionado.numero_identificacion || 'N/A'} | Contrato: {residenteSeleccionado.codigo_contrato}
                      </div>
                    )}

                    {resultadosResidentes.length > 0 && (
                      <div className="list-group mb-3" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                        {resultadosResidentes.map((item, idx) => (
                          <button
                            type="button"
                            key={`${item.id_contrato}-${idx}`}
                            className="list-group-item list-group-item-action"
                            onClick={() => seleccionarResidenteContrato(item)}
                          >
                            <div className="fw-bold">{item.nombre}</div>
                            <small className="text-muted">DPI: {item.dpi} | Clave: {item.numero_identificacion || 'N/A'} | Contrato: {item.codigo_contrato} | Tipo: {item.nombre_tipo_contrato}</small>
                          </button>
                        ))}
                      </div>
                    )}

                    {mensajeBusquedaResidente && (
                      <div className="alert alert-info py-2 mb-3">
                        {mensajeBusquedaResidente}
                      </div>
                    )}
                  </>
                )}

                {(modoFormulario === 'cargo' || esEdicion) && (
                  <div className="mb-2">
                    <label className="fw-bold">Vincular al Contrato:</label>
                    <select value={id_contrato} onChange={e => setId_contrato(e.target.value)} className="form-select">
                      <option value="">-- Seleccione Contrato Destino --</option>
                      {contratosList.map(c => (
                        <option key={c.id_contrato} value={c.id_contrato}>
                          #{c.id_contrato} - {c.codigo_contrato || 'SIN-CODIGO'} - {c.nombre_residente || 'Residente'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="mb-2">
                  <label className="fw-bold">{modoFormulario === 'amenidad' && !esEdicion ? 'Nombre de amenidad:' : 'Concepto / Razón del Cargo:'}</label>
                  <input type="text" className="form-control" value={concepto} onChange={e => setConcepto(e.target.value)} placeholder={modoFormulario === 'amenidad' && !esEdicion ? 'Ej: Agua potable residencial' : 'Ej: Aporte para pavimentación calle principal'} />
                </div>
                <div className="mb-2">
                  <label className="fw-bold">{modoFormulario === 'amenidad' && !esEdicion ? 'Tarifa base de amenidad (Q):' : 'Monto Excepcional (Q):'}</label>
                  <input type="number" step="0.01" className="form-control" value={monto} onChange={e => setMonto(e.target.value)} />
                </div>
                {modoFormulario === 'amenidad' && !esEdicion && (
                  <div className="mb-2">
                    <label className="fw-bold">Asignar amenidad a proyectos:</label>
                    <select
                      className="form-select"
                      multiple
                      value={proyectosAmenidad.map((id) => String(id))}
                      onChange={(e) => {
                        const ids = Array.from(e.target.selectedOptions)
                          .map((option) => Number(option.value))
                          .filter((id) => Number.isInteger(id) && id > 0);
                        setProyectosAmenidad(ids);
                      }}
                      style={{ minHeight: '140px' }}
                    >
                      {proyectosCatalogo.map((proyecto) => (
                        <option key={proyecto.id_proyecto} value={proyecto.id_proyecto}>
                          {proyecto.nombre} - {proyecto.nombre_empresa || 'Sin empresa'}
                        </option>
                      ))}
                    </select>
                    <small className="text-muted">Opcional. Solo aparecerá en contrato cuando el proyecto tenga esta amenidad asignada.</small>
                  </div>
                )}
                {modoFormulario === 'amenidad' && !esEdicion && (
                  <div className="mb-2">
                    <label className="fw-bold">Asignar amenidad a contratos:</label>
                    <select
                      className="form-select"
                      multiple
                      value={contratosAmenidad.map((id) => String(id))}
                      onChange={(e) => {
                        const ids = Array.from(e.target.selectedOptions)
                          .map((option) => Number(option.value))
                          .filter((id) => Number.isInteger(id) && id > 0);
                        setContratosAmenidad(ids);
                      }}
                      style={{ minHeight: '140px' }}
                    >
                      {contratosList.map((contrato) => (
                        <option key={contrato.id_contrato} value={contrato.id_contrato}>
                          {contrato.codigo_contrato || `#${contrato.id_contrato}`} - {contrato.nombre_residente || 'Residente'}
                        </option>
                      ))}
                    </select>
                    <small className="text-muted">Si eliges un contrato aquí, la amenidad aparecerá en Caja de inmediato para ese residente.</small>
                  </div>
                )}
                {(modoFormulario === 'cargo' || esEdicion) && (
                  <div className="mb-2">
                    <label className="fw-bold">Estado:</label>
                    <select className="form-select" value={estado} onChange={e => setEstado(e.target.value)}>
                      <option value="pendiente">Pendiente de Cobro</option>
                      <option value="pagado">Pagado / Solventado</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-light" onClick={() => setShowModal(false)}>Cancelar</button>
                <button className="btn btn-danger" onClick={guardar}>{modoFormulario === 'amenidad' && !esEdicion ? 'Crear Amenidad' : 'Aplicar Cargo'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default PagosExtraordinarios;