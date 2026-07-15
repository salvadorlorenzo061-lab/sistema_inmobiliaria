import { useState, useEffect } from 'react';
import Axios from "axios";
import 'bootstrap/dist/css/bootstrap.min.css';
import Swal from 'sweetalert2';
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { getPaginatedData, PaginationControls } from '../utils/paginationUtils'; 
import { API_BASE_URL } from '../config';

const LOTE_FACTURAS = 10000;

const toDateInputValue = (value) => {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
};

function Resoluciones_facturas() {
  const [id_resolucion, setId_resolucion] = useState(""); 
  const [id_empresa, setId_empresa] = useState("");
  const [id_usuario, setId_usuario] = useState("");
  const [numero_resolucion, setNumero_resolucion] = useState("");
  const [serie, setSerie] = useState("");
  const [rango_inicial, setRango_inicial] = useState("");
  const [rango_final, setRango_final] = useState("");
  const [correlativo_actual, setCorrelativo_actual] = useState("");
  const [fecha_autorizacion, setFecha_autorizacion] = useState("");
  const [fecha_vencimiento, setFecha_vencimiento] = useState("");
  const [estado, setEstado] = useState("");
  const [rol, setRol] = useState("caja");
  const [empresasList, setEmpresasList] = useState([]);
  const [empresasSeleccionadas, setEmpresasSeleccionadas] = useState([]);
  const [proyectosList, setProyectosList] = useState([]);
  const [usuariosList, setUsuariosList] = useState([]);
  
  const [Resoluciones_facturasList, setResoluciones_facturas] = useState([]);
  const [busqueda, setBusqueda] = useState("");

  const [showRegModal, setShowRegModal] = useState(false);  
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10; 

  const API_URL = `${API_BASE_URL}/api/resoluciones_facturas`;

  const getEmpresas = () => {
    Axios.get(`${API_BASE_URL}/api/empresas`)
      .then((response) => {
        setEmpresasList(Array.isArray(response.data) ? response.data : []);
      })
      .catch((error) => {
        console.error('Error al obtener empresas', error);
        setEmpresasList([]);
      });
  };

  const getUsuarios = () => {
    Axios.get(`${API_BASE_URL}/api/usuarios`)
      .then((response) => {
        setUsuariosList(Array.isArray(response.data) ? response.data : []);
      })
      .catch((error) => {
        console.error('Error al obtener usuarios', error);
        setUsuariosList([]);
      });
  };

  const getProyectos = () => {
    Axios.get(`${API_BASE_URL}/api/proyectos`)
      .then((response) => {
        setProyectosList(Array.isArray(response.data) ? response.data : []);
      })
      .catch((error) => {
        console.error('Error al obtener proyectos', error);
        setProyectosList([]);
      });
  };

  const getNombreEmpresa = (empresaId) => {
    const empresa = empresasList.find((item) => String(item.id_empresa) === String(empresaId));
    return empresa?.nombre_empresa || `Empresa #${empresaId}`;
  };

  const getNombreUsuario = (usuarioId, usuarioRegistro = null) => {
    if (usuarioRegistro?.nombre_usuario) return usuarioRegistro.nombre_usuario;
    const usuario = usuariosList.find((item) => String(item.id_usuario) === String(usuarioId));
    return usuario?.nombre || `Usuario #${usuarioId || 'N/A'}`;
  };

  const usuariosDisponibles = Array.isArray(usuariosList)
    ? [...usuariosList].sort((a, b) => String(a?.nombre || '').localeCompare(String(b?.nombre || '')))
    : [];

  useEffect(() => {
    if (!id_usuario) return;
    const existe = usuariosDisponibles.some((item) => String(item.id_usuario) === String(id_usuario));
    if (!existe) {
      setId_usuario('');
    }
  }, [id_usuario, usuariosDisponibles]);

  const toggleEmpresaSeleccionada = (idEmpresa) => {
    const id = String(idEmpresa);
    setEmpresasSeleccionadas((prev) => (
      prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id]
    ));
  };

  const idsEmpresasObjetivo = empresasSeleccionadas.length
    ? empresasSeleccionadas
    : (id_empresa ? [String(id_empresa)] : []);

  const proyectosPorEmpresaSeleccionada = idsEmpresasObjetivo.map((idEmp) => {
    const empresa = empresasList.find((item) => String(item.id_empresa) === String(idEmp));
    const proyectos = proyectosList
      .filter((proyecto) => String(proyecto?.id_empresa) === String(idEmp))
      .sort((a, b) => String(a?.nombre || '').localeCompare(String(b?.nombre || '')));

    return {
      id_empresa: idEmp,
      nombre_empresa: empresa?.nombre_empresa || `Empresa #${idEmp}`,
      proyectos
    };
  });

  const calcularRangoFinalPorLote = (inicio) => {
    const n = Number(inicio);
    if (!Number.isFinite(n) || n <= 0) return "";
    return String(n + LOTE_FACTURAS - 1);
  };

  const aplicarLoteDesdeRangoInicial = (valorInicial) => {
    setRango_inicial(valorInicial);
    const finalCalculado = calcularRangoFinalPorLote(valorInicial);
    if (!String(rango_final || '').trim()) {
      setRango_final(finalCalculado);
    }
    if (!String(correlativo_actual || '').trim()) {
      setCorrelativo_actual(String(valorInicial || ''));
    }
  };

  const autocalcularRangoFinal = () => {
    const finalCalculado = calcularRangoFinalPorLote(rango_inicial);
    setRango_final(finalCalculado);
  };

  // =========================================================================
  // 📄 REPORTE PROFESIONAL: FICHA DE RESOLUCIONES FACTURAS
  // =========================================================================
  const descargarPDFIndividual = (val) => {
    const doc = new jsPDF();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(40, 40, 40);
    doc.text("INMOBILIARIA S.A. GUATEMALA", 14, 20);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text("Departamento de Facturación e Informática", 14, 25);
    doc.text("Sistema Centralizado de Control", 14, 30);
    doc.text(`Generado por: Auditoría de Sistemas`, 14, 35);

    doc.setFillColor(245, 247, 250); 
    doc.rect(130, 12, 66, 26, "F");  

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(41, 128, 185);  
    doc.text("EXPEDIENTE INTEGRAL", 133, 18);
    
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0); 
    doc.text(`ID REGISTRO: #${val.id_resolucion}`, 133, 24); 
    
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.text(`Empresa ID: ${val.id_empresa}`, 133, 30);
    doc.text(`Fecha Ref: ${new Date().toLocaleDateString()}`, 133, 34);

    doc.line(14, 42, 196, 42); 

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    doc.text("DATOS GENERALES DE LA RESOLUCIÓN FACTURA", 14, 49);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text(`ID:   ${String(val.id_resolucion)}`, 14, 56);
    doc.text(`Número de resolución: ${val.numero_resolucion}`, 14, 61);
    doc.text(`Estado resolución:    ${val.estado.toUpperCase()}`, 14, 66); 

    autoTable(doc, {
      startY: 72,
      head: [['PARÁMETRO DE SEGURIDAD', 'VALOR / CREDENCIAL ASIGNADA']],
      body: [
        ['CÓDIGO INTERNO RESOLUCION', `RES-${val.id_resolucion}2026`],
        ['USUARIO RESPONSABLE', getNombreUsuario(val.id_usuario, val)],
        ['SERIE', val.serie.toUpperCase()],
        ['RANGO INICIAL', val.rango_inicial],
        ['RANGO FINAL', val.rango_final],
        ['CORRELATIVO ACTUAL', String(val.correlativo_actual).toUpperCase()],
        ['FECHA AUTORIZACION', val.fecha_autorizacion],
        ['FECHA VENCIMIENTO', val.fecha_vencimiento],
        ['ROL ASIGNADO', String(val.rol || 'caja').toUpperCase()],
        ['ESTADO OPERATIVO EN SISTEMA', val.estado.toUpperCase()],
      ],
      theme: 'striped',
      headStyles: { fillColor: [41, 128, 185], fontSize: 9.5, halign: 'left' },
      styles: { fontSize: 9, cellPadding: 3.5 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 65, textColor: [50, 50, 50] },
        1: { cellWidth: 117 }
      }
    });

    const finalY = doc.lastAutoTable.finalY + 12;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text("Nota de seguridad: Esta ficha contiene datos de resoluciones autorizadas de uso confidencial.", 14, finalY);
    doc.text("Inmobiliaria S.A. - Control de Auditoría Interna de Sistemas de Información.", 14, finalY + 4);

    doc.save(`Ficha_Resolucion_${val.numero_resolucion.replace(/\s+/g, '_')}.pdf`);
  };

  // =========================================================================
  //   CONTROLADORES DE BASE DE DATOS (CRUD)
  // =========================================================================
  const add = () => {
    const empresasObjetivoRaw = empresasSeleccionadas.length
      ? empresasSeleccionadas
      : (id_empresa ? [String(id_empresa)] : []);
    const empresasObjetivo = [...new Set(empresasObjetivoRaw.map((item) => String(item)))];

    if (!empresasObjetivo.length || !id_usuario || !numero_resolucion || !serie.trim() || !rango_inicial.toString().trim() || !rango_final.toString().trim() || !fecha_autorizacion.trim() || !fecha_vencimiento.trim() || !estado.trim() || !rol.trim()) {
      Swal.fire({
        position: "top-end",
        icon: "warning",
        title: 'DATOS INCOMPLETOS',
        showConfirmButton: false,
        timer: 3000
      });
      return; 
    }

    const rInicial = Number(rango_inicial);
    const rFinal = Number(rango_final);
    const cActual = Number(correlativo_actual);

    if (rInicial > rFinal) {
      Swal.fire({ icon: "error", title: "Error de Rangos", text: "El rango inicial no puede ser mayor que el rango final." });
      return;
    }

    if (cActual < rInicial || cActual > rFinal) {
      Swal.fire({ icon: "error", title: "Correlativo Inválido", text: `El correlativo actual (${cActual}) debe estar estrictamente dentro del rango autorizado (${rInicial} al ${rFinal}).` });
      return;
    }

    Promise.allSettled(
      empresasObjetivo.map((empresaId) => Axios.post(`${API_URL}/crear`, {
        id_empresa: Number(empresaId),
        id_usuario,
        numero_resolucion,
        serie,
        rango_inicial,
        rango_final,
        correlativo_actual,
        fecha_autorizacion,
        fecha_vencimiento,
        estado,
        rol
      }))
    )
      .then((resultados) => {
        const exitos = resultados.filter((item) => item.status === 'fulfilled').length;
        const fallos = resultados.filter((item) => item.status === 'rejected');

        getResoluciones();

        if (exitos > 0) {
          limpiarCampos();
          setShowRegModal(false);
        }

        if (fallos.length === 0) {
          Swal.fire({
            position: "top-end",
            icon: "success",
            title: `Resolución ${numero_resolucion} creada en ${exitos} empresa(s)`,
            showConfirmButton: false,
            timer: 3200
          });
          return;
        }

        const mensajeError = fallos[0]?.reason?.response?.data?.message || 'Hubo errores en parte del registro.';
        Swal.fire({
          title: '<strong>Registro parcial</strong>',
          text: `${exitos} empresa(s) registradas. ${fallos.length} con error. ${mensajeError}`,
          icon: 'warning'
        });
      })
      .catch((error) => {
        Swal.fire({
          title: "<strong>No se registró!</strong>",
          text: error?.response?.data?.message || 'Hubo un error en el sistema',
          icon: 'warning',
          timer: 3000,
          showConfirmButton: false
        });
        console.error(error);
      });
  };

  const actualizar = () => {
    const empresasObjetivoRaw = empresasSeleccionadas.length
      ? empresasSeleccionadas
      : (id_empresa ? [String(id_empresa)] : []);
    const empresasObjetivo = [...new Set(empresasObjetivoRaw.map((item) => String(item)))];

    if (!id_resolucion || !empresasObjetivo.length || !id_usuario || !numero_resolucion || !serie.trim() || !rango_inicial.toString().trim() || !rango_final.toString().trim() || !fecha_autorizacion.trim() || !fecha_vencimiento.trim() || !estado.trim() || !rol.trim()) {
      Swal.fire({ icon: 'warning', title: 'Campos incompletos' });
      return;
    }

    const idEmpresaActualizada = Number(empresasObjetivo[0]);

    const rInicial = Number(rango_inicial);
    const rFinal = Number(rango_final);
    const cActual = Number(correlativo_actual);

    if (rInicial > rFinal) {
      Swal.fire({ icon: "error", title: "Error de Rangos", text: "El rango inicial no puede ser mayor que el rango final." });
      return;
    }

    if (cActual < rInicial || cActual > rFinal) {
      Swal.fire({ icon: "error", title: "Correlativo Inválido", text: `El correlativo actual (${cActual}) debe estar estrictamente dentro del rango autorizado (${rInicial} al ${rFinal}).` });
      return;
    }

    const normalizarTexto = (valor) => String(valor || '').trim().toUpperCase();
    const hayTraslape = (inicioA, finA, inicioB, finB) => Math.max(inicioA, inicioB) <= Math.min(finA, finB);

    const payloadBase = {
      id_usuario,
      numero_resolucion,
      serie,
      rango_inicial,
      rango_final,
      correlativo_actual,
      fecha_autorizacion,
      fecha_vencimiento,
      estado,
      rol
    };

    Axios.get(API_URL)
      .then((respListado) => {
        const resolucionesExistentes = Array.isArray(respListado?.data) ? respListado.data : [];
        const empresasExtras = empresasObjetivo.slice(1);

        const operaciones = [
          Axios.put(`${API_URL}/actualizar`, {
            id_resolucion,
            id_empresa: idEmpresaActualizada,
            ...payloadBase
          })
        ];

        empresasExtras.forEach((empresaId) => {
          const idEmp = Number(empresaId);

          const resolucionExistente = resolucionesExistentes.find((item) => {
            if (Number(item?.id_resolucion) === Number(id_resolucion)) return false;
            if (Number(item?.id_empresa) !== idEmp) return false;
            if (normalizarTexto(item?.numero_resolucion) !== normalizarTexto(numero_resolucion)) return false;
            if (normalizarTexto(item?.serie) !== normalizarTexto(serie)) return false;

            const iniItem = Number(item?.rango_inicial);
            const finItem = Number(item?.rango_final);
            return Number.isFinite(iniItem) && Number.isFinite(finItem) && hayTraslape(iniItem, finItem, rInicial, rFinal);
          });

          if (resolucionExistente) {
            operaciones.push(
              Axios.put(`${API_URL}/actualizar`, {
                id_resolucion: Number(resolucionExistente.id_resolucion),
                id_empresa: idEmp,
                ...payloadBase
              })
            );
            return;
          }

          operaciones.push(
            Axios.post(`${API_URL}/crear`, {
              id_empresa: idEmp,
              ...payloadBase
            })
          );
        });

        return Promise.allSettled(operaciones);
      })
      .then((resultados) => {
        const exitos = resultados.filter((item) => item.status === 'fulfilled').length;
        const fallos = resultados.filter((item) => item.status === 'rejected');

        getResoluciones();

        if (exitos > 0) {
          limpiarCampos();
          setShowEditModal(false);
        }

        if (fallos.length === 0) {
          Swal.fire({
            html: `<strong>¡Éxito!</strong><p>Actualización aplicada en ${exitos} empresa(s) sin duplicados.</p>`,
            icon: 'success',
            timer: 3200,
            showConfirmButton: false
          });
          return;
        }

        const mensajeError = fallos[0]?.reason?.response?.data?.message || 'Hubo errores en parte de la operación.';
        Swal.fire({
          title: '<strong>Actualización parcial</strong>',
          text: `${exitos} empresa(s) procesadas. ${fallos.length} con error. ${mensajeError}`,
          icon: 'warning'
        });
      })
      .catch((error) => {
        console.error(error);
        Swal.fire({ icon: 'error', title: 'Error al actualizar' });
      });
  };

  const deteleResolucion = (val) => {
    Swal.fire({
      title: "Confirmar eliminación",
      html: '<i>¿Desea eliminar la resolución <strong>' + val.numero_resolucion + '</strong>?</i>',
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      buttonColor: "#d33",
      confirmButtonText: "Sí, eliminarla!",
      cancelButtonText: "Cancelar"
    }).then((result) => {
      if (result.isConfirmed) {
        Axios.delete(`${API_URL}/delete/${val.id_resolucion}`)
        .then(() => {
          getResoluciones();
          Swal.fire('¡Eliminado!', 'La resolución ' + val.numero_resolucion + ' fue eliminada.', 'success');
        })
        .catch(err => console.error(err));
      }
    });
  };

  const limpiarCampos = () => {
    setId_resolucion("");
    setId_empresa("");
    setEmpresasSeleccionadas([]);
    setId_usuario("");
    setNumero_resolucion(""); 
    setSerie(""); 
    setRango_inicial(""); 
    setRango_final(""); 
    setCorrelativo_actual("");
    setFecha_autorizacion("");
    setFecha_vencimiento("");
    setEstado("");
    setRol('caja');
  };

  const getResoluciones = () => {
    Axios.get(API_URL)
    .then((response) => { setResoluciones_facturas(response.data); })
    .catch((error) => { console.error("Error al obtener resoluciones", error); });
  };

  useEffect(() => {
    getResoluciones();
    getEmpresas();
    getUsuarios();
    getProyectos();
  }, []);

  const abrirEditarModal = (val) => {
    setId_resolucion(val.id_resolucion);
    setId_empresa(val.id_empresa);
    setEmpresasSeleccionadas(val.id_empresa ? [String(val.id_empresa)] : []);
    setId_usuario(val.id_usuario ? String(val.id_usuario) : '');
    setNumero_resolucion(val.numero_resolucion);
    setSerie(val.serie);
    setRango_inicial(val.rango_inicial); 
    setRango_final(val.rango_final);
    setCorrelativo_actual(val.correlativo_actual);
    setFecha_autorizacion(toDateInputValue(val.fecha_autorizacion));
    setFecha_vencimiento(toDateInputValue(val.fecha_vencimiento));
    setEstado(val.estado);
    setRol(String(val.rol || 'caja'));
    setShowEditModal(true);
  };

  const resoluciones_facturasFiltrados = Resoluciones_facturasList.filter((prov) => 
    prov.numero_resolucion?.toLowerCase().includes(busqueda.toLowerCase())
  );

  const handleBusquedaChange = (e) => {
    setBusqueda(e.target.value);
    setCurrentPage(1);
  };

  const { paginatedItems: resolucionesPaginadas, totalPages, startIndex, endIndex } = getPaginatedData(resoluciones_facturasFiltrados, currentPage, itemsPerPage);

  return (
    <div className='container mt-4'>
      
      {/* CABECERA DE LA PANTALLA */}
      <div className="module-header">
      <div className="row align-items-center bg-light p-3 rounded shadow-sm">
        <div className="col-md-4">
          <h3 className="m-0 text-dark fw-bold">GESTIÓN DE RESOLUCIONES FACTURAS</h3>
        </div>
        <div className="col-md-5">
          <div className="input-group">
            <span className="input-group-text bg-primary text-white">🔍</span>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Buscar por número resolución..." 
              value={busqueda}
              onChange={handleBusquedaChange}
            />
          </div>
        </div>
        <div className="col-md-3 text-end">
          <button 
            className="btn btn-success fw-bold w-100" 
            onClick={() => { limpiarCampos(); setShowRegModal(true); }}
          >
            ➕ AGREGAR NUEVA RESOLUCION
          </button>
        </div>
      </div>
      </div>
      
      {/* TABLA DE DATOS */}
      <table className="table table-striped table-bordered align-middle shadow-sm">
        <thead className="table-dark">
          <tr>
            <th>EMPRESA</th>
            <th>USUARIO</th>
            <th>NUMERO RESOLUCION</th>
            <th>SERIE</th>
            <th>RANGO INICIAL</th>
            <th>RANGO FINAL</th>
            <th>CORRELATIVO ACTUAL</th>
            <th>FECHA AUTORIZACION</th>
            <th>FECHA VENCIMIENTO</th>
            <th>ROL</th>
            <th>ESTADO</th>
            <th>OPCIONES</th>
          </tr>
        </thead>
        <tbody>
          {resolucionesPaginadas.length > 0 ? (
            resolucionesPaginadas.map((val) => (
              <tr key={val.id_resolucion}>
                <td>
                  <div className="fw-bold">{getNombreEmpresa(val.id_empresa)}</div>
                  <div className="small text-muted">ID: {val.id_empresa}</div>
                </td>
                <td>
                  <div className="fw-bold">{getNombreUsuario(val.id_usuario, val)}</div>
                  <div className="small text-muted">ID: {val.id_usuario || 'N/A'}</div>
                </td>
                <td>{val.numero_resolucion}</td>
                <td>{val.serie}</td>
                <td>{val.rango_inicial}</td>
                <td>{val.rango_final}</td>
                <td>{val.correlativo_actual}</td>
                <td>{val.fecha_autorizacion}</td>
                <td>{val.fecha_vencimiento}</td>
                <td>
                  <span className={`badge ${String(val.rol || '').toLowerCase() === 'juridico' ? 'bg-primary' : String(val.rol || '').toLowerCase() === 'ambos' ? 'bg-dark' : 'bg-info text-dark'}`}>
                    {String(val.rol || 'caja').toUpperCase()}
                  </span>
                </td>
                <td>
                  <span className={`badge ${val.estado === 'activo' ? 'bg-success' : val.estado === 'inactivo' ? 'bg-danger' : 'bg-warning'}`}>
                    {val.estado.toUpperCase()}
                  </span>
                </td>
                <td>
                  <div className="btn-group" role="group">
                    <button type="button" onClick={() => abrirEditarModal(val)} className="btn btn-info btn-sm m-1 fw-bold">ACTUALIZAR</button>
                    <button type="button" onClick={() => deteleResolucion(val)} className="btn btn-danger btn-sm m-1 fw-bold">ELIMINAR</button>
                    <button type="button" onClick={() => descargarPDFIndividual(val)} className="btn btn-secondary btn-sm m-1 fw-bold">📄 PDF</button>
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="12" className="text-center text-muted py-3">No se encontraron resoluciones coincidentes.</td>
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
        itemsCount={resoluciones_facturasFiltrados.length}
      />

      {/* 1. MODAL REGISTRO */}
      {showRegModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content shadow-lg">
              <div className="modal-header bg-success text-white">
                <h5 className="modal-title fw-bold">Registrar Resolución Factura</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => { setShowRegModal(false); limpiarCampos(); }}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-bold">Empresa</label>
                  <div className="border rounded p-2 mb-2" style={{ maxHeight: '140px', overflowY: 'auto' }}>
                    {empresasList.map((empresa) => {
                      const checked = empresasSeleccionadas.includes(String(empresa.id_empresa));
                      return (
                        <label key={`check-${empresa.id_empresa}`} className="form-check d-flex align-items-center justify-content-between mb-1">
                          <div>
                            <input
                              className="form-check-input me-2"
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleEmpresaSeleccionada(empresa.id_empresa)}
                            />
                            <span className="form-check-label">{empresa.nombre_empresa}</span>
                          </div>
                          <small className="text-muted">ID: {empresa.id_empresa}</small>
                        </label>
                      );
                    })}
                  </div>
                  <small className="text-muted">Si marcas checkboxes, se creará una resolución por cada empresa seleccionada.</small>
                </div>
                {idsEmpresasObjetivo.length > 0 && (
                  <div className="mb-3 border rounded p-2 bg-light">
                    <div className="fw-bold mb-1">Proyectos de las empresas seleccionadas</div>
                    {proyectosPorEmpresaSeleccionada.map((grupo) => (
                      <div key={`proy-${grupo.id_empresa}`} className="mb-2">
                        <div className="small fw-bold text-primary">{grupo.nombre_empresa}</div>
                        {grupo.proyectos.length > 0 ? (
                          <ul className="small mb-1 ps-3">
                            {grupo.proyectos.map((proyecto) => (
                              <li key={`proy-item-${grupo.id_empresa}-${proyecto.id_proyecto}`}>
                                {proyecto.nombre} (ID: {proyecto.id_proyecto})
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="small text-muted">Sin proyectos asociados.</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="mb-3">
                  <label className="form-label fw-bold">Usuario asignado</label>
                  <select value={id_usuario} onChange={(e) => setId_usuario(e.target.value)} className="form-select">
                    <option value="">-- Seleccione usuario --</option>
                    {usuariosDisponibles.map((usuario) => (
                      <option key={usuario.id_usuario} value={usuario.id_usuario}>
                        {usuario.nombre} ({String(usuario.nombre_rol || 'sin rol').toUpperCase()})
                      </option>
                    ))}
                  </select>
                  <small className="text-muted">Se muestran todos los usuarios; el rol de resolución sigue validándose al asignar correlativos.</small>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Número resolución:</label>
                  <input type="text" value={numero_resolucion} onChange={(e) => setNumero_resolucion(e.target.value)} className="form-control" placeholder="Ingrese Número Resolución" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Serie:</label>
                  <input type="text" value={serie} onChange={(e) => setSerie(e.target.value)} className="form-control" placeholder="Ingrese serie" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Rango Inicial (lote de {LOTE_FACTURAS.toLocaleString()}):</label>
                  <input type="number" value={rango_inicial} onChange={(e) => aplicarLoteDesdeRangoInicial(e.target.value)} className="form-control" placeholder="Rango Inicial" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Rango Final (automático):</label>
                  <input type="number" value={rango_final} onChange={(e) => setRango_final(e.target.value)} className="form-control" placeholder="Rango Final" />
                  <div className="d-flex justify-content-between align-items-center mt-1">
                    <small className="text-muted">Puedes editarlo manualmente o autocalcular por lote estándar.</small>
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={autocalcularRangoFinal}>Autocalcular</button>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Correlativo actual:</label>
                  <input type="number" value={correlativo_actual} onChange={(e) => setCorrelativo_actual(e.target.value)} className="form-control" placeholder="Correlativo actual" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Fecha autorizada:</label>
                  <input type="date" value={fecha_autorizacion} onChange={(e) => setFecha_autorizacion(e.target.value)} className="form-control" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Fecha vencimiento:</label>
                  <input type="date" value={fecha_vencimiento} onChange={(e) => setFecha_vencimiento(e.target.value)} className="form-control" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Rol para uso de correlativos:</label>
                  <select value={rol} onChange={(e) => setRol(e.target.value)} className="form-select">
                    <option value="caja">Caja</option>
                    <option value="juridico">Juridico</option>
                    <option value="ambos">Ambos</option>
                  </select>
                  <small className="text-muted">Define qué tipo de usuario podrá consumir esta resolución al asignar lotes.</small>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Estado:</label>
                  <select value={estado} onChange={(e) => setEstado(e.target.value)} className="form-select">
                    <option value="" disabled>-- Seleccione un estado --</option>
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                    <option value="pendiente">Pendiente</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowRegModal(false); limpiarCampos(); }}>Cancelar</button>
                <button type="button" className="btn btn-success fw-bold" onClick={add}>Guardar Resolución</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. MODAL EDICIÓN */}
      {showEditModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content shadow-lg">
              <div className="modal-header bg-warning text-dark">
                <h5 className="modal-title fw-bold">Actualizar Resolución #{id_resolucion}</h5>
                <button type="button" className="btn-close" onClick={() => { setShowEditModal(false); limpiarCampos(); }}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-bold">Empresa</label>
                  <div className="border rounded p-2 mb-2" style={{ maxHeight: '140px', overflowY: 'auto' }}>
                    {empresasList.map((empresa) => {
                      const checked = empresasSeleccionadas.includes(String(empresa.id_empresa));
                      return (
                        <label key={`edit-check-${empresa.id_empresa}`} className="form-check d-flex align-items-center justify-content-between mb-1">
                          <div>
                            <input
                              className="form-check-input me-2"
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleEmpresaSeleccionada(empresa.id_empresa)}
                            />
                            <span className="form-check-label">{empresa.nombre_empresa}</span>
                          </div>
                          <small className="text-muted">ID: {empresa.id_empresa}</small>
                        </label>
                      );
                    })}
                  </div>
                  <small className="text-muted">Puedes marcar varias empresas; se asignará sin duplicar resoluciones existentes.</small>
                </div>
                {idsEmpresasObjetivo.length > 0 && (
                  <div className="mb-3 border rounded p-2 bg-light">
                    <div className="fw-bold mb-1">Proyectos de las empresas seleccionadas</div>
                    {proyectosPorEmpresaSeleccionada.map((grupo) => (
                      <div key={`edit-proy-${grupo.id_empresa}`} className="mb-2">
                        <div className="small fw-bold text-primary">{grupo.nombre_empresa}</div>
                        {grupo.proyectos.length > 0 ? (
                          <ul className="small mb-1 ps-3">
                            {grupo.proyectos.map((proyecto) => (
                              <li key={`edit-proy-item-${grupo.id_empresa}-${proyecto.id_proyecto}`}>
                                {proyecto.nombre} (ID: {proyecto.id_proyecto})
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="small text-muted">Sin proyectos asociados.</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="mb-3">
                  <label className="form-label fw-bold">Usuario asignado</label>
                  <select value={id_usuario} onChange={(e) => setId_usuario(e.target.value)} className="form-select">
                    <option value="">-- Seleccione usuario --</option>
                    {usuariosDisponibles.map((usuario) => (
                      <option key={usuario.id_usuario} value={usuario.id_usuario}>
                        {usuario.nombre} ({String(usuario.nombre_rol || 'sin rol').toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Número resolución:</label>
                  <input type="text" value={numero_resolucion} onChange={(e) => setNumero_resolucion(e.target.value)} className="form-control" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Serie:</label>
                  <input type="text" value={serie} onChange={(e) => setSerie(e.target.value)} className="form-control" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Rango Inicial:</label>
                  <input type="number" value={rango_inicial} onChange={(e) => aplicarLoteDesdeRangoInicial(e.target.value)} className="form-control" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Rango Final (automático):</label>
                  <input type="number" value={rango_final} onChange={(e) => setRango_final(e.target.value)} className="form-control" />
                  <div className="d-flex justify-content-between align-items-center mt-1">
                    <small className="text-muted">Puedes editarlo manualmente o autocalcular por lote estándar.</small>
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={autocalcularRangoFinal}>Autocalcular</button>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Correlativo actual:</label>
                  <input type="number" value={correlativo_actual} onChange={(e) => setCorrelativo_actual(e.target.value)} className="form-control" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Fecha autorizada:</label>
                  <input type="date" value={fecha_autorizacion} onChange={(e) => setFecha_autorizacion(e.target.value)} className="form-control" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Fecha vencimiento:</label>
                  <input type="date" value={fecha_vencimiento} onChange={(e) => setFecha_vencimiento(e.target.value)} className="form-control" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Rol para uso de correlativos:</label>
                  <select value={rol} onChange={(e) => setRol(e.target.value)} className="form-select">
                    <option value="caja">Caja</option>
                    <option value="juridico">Juridico</option>
                    <option value="ambos">Ambos</option>
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Estado:</label>
                  <select value={estado} onChange={(e) => setEstado(e.target.value)} className="form-select">
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                    <option value="pendiente">Pendiente</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowEditModal(false); limpiarCampos(); }}>Cancelar</button>
                <button type="button" className="btn btn-warning fw-bold" onClick={actualizar}>Guardar Cambios</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Resoluciones_facturas;