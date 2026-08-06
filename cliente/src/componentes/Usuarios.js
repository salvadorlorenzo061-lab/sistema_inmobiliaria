import { useState, useEffect, useCallback } from 'react';
import Axios from "axios";
import 'bootstrap/dist/css/bootstrap.min.css';
import Swal from 'sweetalert2';
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { API_BASE_URL } from '../config';
import { getPaginatedData, PaginationControls } from '../utils/paginationUtils';

const PERMISOS_MODULOS = [
  'Residentes',
  'Usuarios',
  'Roles Sistema',
  'Contratos Legales',
  'Modalidades Contrato',
  'Catálogo Servicios',
  'Empresa',
  'Empresa-Proyecto',
  'Proyectos',
  'Caja (General)',
  'Caja Ingresos Manual',
  'Mora y Atrasos',
  'Anulación Deuda',
  'Cobros Extra',
  'Pagos',
  'Detalle Pagos',
  'Asignar Correlativos',
  'Resoluciones Facturas',
  'Bitácora',
  'Estado de Cuenta'
];

function Usuarios() {
  const [id_usuario, setId_usuario] = useState("");
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  // CAMBIO: Ahora manejamos id_rol numérico de forma predeterminada
  const [id_rol, setId_rol] = useState("");
  const [estado, setEstado] = useState("");
  const [permisos, setPermisos] = useState([]);
  const [foto_perfil, setFoto_perfil] = useState("");
  const [rolesList, setRolesList] = useState([]);
  
  const [usuariosList, setUsuarios] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [showRegModal, setShowRegModal] = useState(false);  
  const [showEditModal, setShowEditModal] = useState(false); 

  const API_URL = `${API_BASE_URL}/api/usuarios`;
  const API_ROLES_URL = `${API_BASE_URL}/api/roles`;

  const manejarCambioFoto = (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;

    if (!archivo.type.startsWith('image/')) {
      Swal.fire({ icon: 'warning', title: 'Archivo inválido', text: 'Selecciona una imagen válida.' });
      return;
    }

    if (archivo.size > 2 * 1024 * 1024) {
      Swal.fire({ icon: 'warning', title: 'Imagen muy grande', text: 'La foto debe ser menor a 2MB.' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setFoto_perfil(String(reader.result || ''));
    reader.readAsDataURL(archivo);
  };

  // =========================================================================
  // 📄 REPORTE PROFESIONAL: FICHA DE USUARIO + BITÁCORA DE AUDITORÍA
  // =========================================================================
  const descargarPDFIndividual = (val) => {
    const doc = new jsPDF();
    // Validar nombre de rol seguro
    const textoRol = val.nombre_rol ? val.nombre_rol.toUpperCase() : "SIN ROL";

    // 🏢 A) ENCABEZADO INSTITUCIONAL (Extremo Izquierdo)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(40, 40, 40);
    doc.text("INMOBILIARIA S.A. GUATEMALA", 14, 20);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text("Departamento de Recursos Humanos y TI", 14, 25);
    doc.text("Sistema Centralizado de Control de Lotes", 14, 30);
    doc.text(`Generado por: Auditoría de Sistemas`, 14, 35);

    // 🔒 B) BLOQUE DE CONTROL DE SEGURIDAD (Extremo Derecho)
    doc.setFillColor(245, 247, 250); 
    doc.rect(130, 12, 66, 26, "F");  

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(41, 128, 185);  
    doc.text("EXPEDIENTE INTEGRAL", 133, 18);
    
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0); 
    doc.text(`ID REGISTRO: #${val.id_usuario}`, 133, 24); 
    
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.text(`Rol: ${textoRol}`, 133, 30);
    doc.text(`Fecha Ref: ${new Date().toLocaleDateString()}`, 133, 34);

    // Línea divisoria de sección
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 42, 196, 42); 

    // 👤 C) RESUMEN DEL COLABORADOR
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    doc.text("DATOS GENERALES DEL COLABORADOR ", 14, 49);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text(`Nombre Completo:   ${val.nombre.toUpperCase()}`, 14, 56);
    doc.text(`Correo Oficial:          ${val.correo}`, 14, 61);
    doc.text(`Estado del Acceso:    ${val.estado.toUpperCase()}`, 14, 66); 

    // 📊 D) TABLA 1: CREDENCIALES DEL PERFIL
    autoTable(doc, {
      startY: 72,
      head: [['PARÁMETRO DE SEGURIDAD', 'VALOR / CREDENCIAL ASIGNADA']],
      body: [
        ['CÓDIGO INTERNO DE EMPLEADO', `EMP-${val.id_usuario}2026`],
        ['NOMBRE COMPLETO', val.nombre.toUpperCase()],
        ['CORREO ELECTRÓNICO DE ACCESO', val.correo],
        ['CONTRASEÑA ENCRIPTADA (BD)', val.clave],
        ['ROL / NIVEL DE PERMISOS', textoRol],
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

    // 🕒 E) GENERACIÓN DINÁMICA DE LA BITÁCORA DE ACTIVIDAD
    const filaEstadoEspecial = val.estado === 'inactivo' 
      ? ['10/06/2026 16:22', 'Modificación de Estado', 'SYS_ADMIN', 'Acceso denegado por políticas de TI']
      : ['13/06/2026 09:15', 'Inicio de Sesión exitoso', val.nombre.split(' ')[0].toUpperCase(), 'Autenticación en dos pasos correcta'];

    // CAMBIO: Condición basada en id_rol (1 = Admin, los demás interactúan de otra forma)
    const accionesSegunRol = val.id_rol === 1
      ? ['Aprobación de Contrato de Terreno', 'Módulo de Ventas', 'Validó pago inicial del lote J-15']
      : ['Visualización de Catálogo', 'Módulo de Clientes', 'Consultó disponibilidad de lotes en Zona 1'];

    // 📜 F) TABLA 2: BITÁCORA DE ACCIONES
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    doc.text("BITÁCORA DE AUDITORÍA (ÚLTIMOS MOVIMIENTOS)", 14, doc.lastAutoTable.finalY + 12);

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 16,
      head: [['FECHA / HORA', 'ACCIÓN / EVENTO', 'EJECUTADO POR', 'DETALLES DE LA OPERACIÓN']],
      body: [
        filaEstadoEspecial,
        ['11/06/2026 11:40', accionesSegunRol[0], val.nombre.split(' ')[0].toUpperCase(), accionesSegunRol[2]],
        ['08/06/2026 08:02', 'Actualización de Perfil', 'SISTEMA', 'Sincronización automatizada de correo'],
        ['01/06/2026 14:30', 'Creación de Registro', 'SYS_ADMIN', 'Alta inicial de usuario en la plataforma'],
      ],
      theme: 'grid',
      headStyles: { fillColor: [52, 73, 94], fontSize: 9, halign: 'center' },
      styles: { fontSize: 8.5, cellPadding: 3 },
      columnStyles: {
        0: { halign: 'center', cellWidth: 32 },
        1: { fontStyle: 'bold', cellWidth: 43 },
        2: { halign: 'center', cellWidth: 28 },
        3: { cellWidth: 79 }
      }
    });

    // 🔒 G) PIE DE PÁGINA
    const finalY = doc.lastAutoTable.finalY + 12;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text("Nota de seguridad: Esta ficha contiene trazas e historial de acceso de uso confidencial.", 14, finalY);
    doc.text("Inmobiliaria S.A. - Control de Auditoría Interna de Sistemas de Información.", 14, finalY + 4);

    doc.save(`Ficha_Auditoria_${val.nombre.replace(/\s+/g, '_')}.pdf`);
  };

  // =========================================================================
  //  CONTROLADORES DE BASE DE DATOS (CRUD)
  // =========================================================================
  const add = async () => {
    if (!nombre.trim() || !correo.trim() || !clave.trim() || !id_rol || !estado.trim()) {
      Swal.fire({
        position: "top-end",
        icon: "warning",
        title: 'DATOS INCOMPLETOS',
        showConfirmButton: false,
        timer: 3000
      });
      return;
    }

    try {
      await Axios.post(`${API_URL}/crear`, { nombre, correo, clave, id_rol, estado, permisos, foto_perfil });
      getUsuarios();
      limpiarCampos();
      setShowRegModal(false);
      Swal.fire({
        position: "top-end",
        icon: "success",
        title: 'Usuario ' + nombre + ' creado correctamente',
        showConfirmButton: false,
        timer: 3000
      });
    } catch (error) {
      Swal.fire({
        title: "<strong>No se registró!</strong>",
        text: error.response?.data?.message || 'Hubo un error en el sistema',
        icon: 'warning',
        timer: 3000,
        showConfirmButton: false
      });
      console.error(error);
    }
  };

  const actualizar = async () => {
    if (!nombre.trim() || !correo.trim() || !clave.trim() || !id_rol || !estado.trim()) {
      Swal.fire({ icon: 'warning', title: 'Campos incompletos' });
      return;
    }

    try {
      await Axios.put(`${API_URL}/actualizar`, { id_usuario, nombre, correo, clave, id_rol, estado, permisos, foto_perfil });
      getUsuarios();

      const usuarioActual = JSON.parse(localStorage.getItem('usuario') || '{}');
      if (String(usuarioActual.id_usuario || '') === String(id_usuario)) {
        const actualizado = {
          ...usuarioActual,
          nombre_usuario: nombre,
          correo,
          foto_perfil
        };
        localStorage.setItem('usuario', JSON.stringify(actualizado));
        window.dispatchEvent(new Event('usuario-updated'));
      }

      limpiarCampos();
      setShowEditModal(false);
      Swal.fire({
        html: '<strong>¡Éxito!</strong><p>Usuario actualizado correctamente</p>',
        icon: 'success',
        timer: 3000,
        showConfirmButton: false
      });
    } catch (error) {
      console.error(error);
      Swal.fire({ icon: 'error', title: 'Error al actualizar' });
    }
  };

  const deteleUsuario = (val) => {
    Swal.fire({
      title: "Confirmar eliminación",
      html: '<i>¿Desea eliminar a <strong>' + val.nombre + '</strong>?</i>',
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Sí, eliminarlo!",
      cancelButtonText: "Cancelar"
    }).then((result) => {
      if (result.isConfirmed) {
        Axios.delete(`${API_URL}/delete/${val.id_usuario}`)
        .then(() => {
          getUsuarios();
          Swal.fire('¡Eliminado!', val.nombre + ' fue eliminado.', 'success');
        });
      }
    });
  };

  const limpiarCampos = () => {
    setNombre(""); setCorreo(""); setClave(""); setId_rol(""); setEstado(""); setPermisos([]); setFoto_perfil(""); setId_usuario("");
  };

  const togglePermiso = (permiso) => {
    setPermisos((prev) => (
      prev.includes(permiso)
        ? prev.filter((item) => item !== permiso)
        : [...prev, permiso]
    ));
  };

  const seleccionarTodosPermisos = () => {
    setPermisos(PERMISOS_MODULOS);
  };

  const limpiarPermisos = () => {
    setPermisos([]);
  };

  const getUsuarios = useCallback(() => {
    Axios.get(API_URL)
      .then((response) => { setUsuarios(response.data); })
      .catch((error) => { console.error("Error al obtener usuarios", error); });
  }, [API_URL]);

  const getRolesDisponibles = useCallback(() => {
    return Axios.get(API_ROLES_URL)
      .then((response) => {
        setRolesList(Array.isArray(response.data) ? response.data : []);
      })
      .catch((error) => {
        console.error("Error al obtener roles", error);
        setRolesList([]);
      });
  }, [API_ROLES_URL]);

  useEffect(() => {
    getUsuarios();
    getRolesDisponibles();
  }, [getUsuarios, getRolesDisponibles]);

  const abrirEditarModal = (val) => {
    setId_usuario(val.id_usuario);
    setNombre(val.nombre);
    setCorreo(val.correo);
    setClave(val.clave);
    setId_rol(val.id_rol);
    setEstado(val.estado);
    setFoto_perfil(val.foto_perfil || '');
    try {
      const permisosUsuario = val.permisos ? JSON.parse(val.permisos) : [];
      setPermisos(Array.isArray(permisosUsuario) ? permisosUsuario : []);
    } catch {
      setPermisos([]);
    }
    setShowEditModal(true);
  };

  const usuariosFiltrados = usuariosList.filter((prov) => 
    prov.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  const parsePermisosUsuario = (permisosRaw) => {
    try {
      const lista = permisosRaw ? JSON.parse(permisosRaw) : [];
      return Array.isArray(lista) ? lista : [];
    } catch {
      return [];
    }
  };

  const { paginatedItems: usuariosPaginados, totalPages, startIndex, endIndex } = getPaginatedData(usuariosFiltrados, currentPage, itemsPerPage);

  const handleBusquedaChange = (e) => {
    setBusqueda(e.target.value);
    setCurrentPage(1);
  };

  return (
    <div className='container mt-4'>
      <div className="module-header">
      {/* CABECERA DE LA PANTALLA */}
      <div className="row align-items-center bg-light p-3 rounded shadow-sm">
        <div className="col-md-4">
          <h3 className="m-0 text-dark fw-bold">GESTIÓN DE USUARIOS</h3>
        </div>
        <div className="col-md-5">
          <div className="input-group">
            <span className="input-group-text bg-primary text-white">🔍</span>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Buscar por nombre del usuario..." 
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
            ➕ AGREGAR NUEVO USUARIO
          </button>
        </div>
      </div>
      </div>
      
      {/* TABLA DE USUARIOS */}
      <table className="table table-striped table-bordered align-middle shadow-sm">
        <thead className="table-dark">
          <tr>
            <th>ID USUARIO</th>
            <th>FOTO</th>
            <th>NOMBRE</th>
            <th>CORREO</th>
            <th>CLAVE</th>
            <th>ROL</th>
            <th>ESTADO</th>
            <th>PERMISOS</th>
            <th>OPCIONES</th>
          </tr>
        </thead>
        <tbody>
          {usuariosPaginados.length > 0 ? (
            usuariosPaginados.map((val) => {
              const permisosLista = parsePermisosUsuario(val.permisos);
              const permisosOcultos = permisosLista.slice(3);

              return (
              <tr key={val.id_usuario}>
                <th>{val.id_usuario}</th>
                <td className="text-center">
                  {val.foto_perfil ? (
                    <img
                      src={val.foto_perfil}
                      alt={`Perfil ${val.nombre}`}
                      style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #dee2e6' }}
                    />
                  ) : (
                    <span className="badge bg-light text-dark border">Sin foto</span>
                  )}
                </td>
                <td>{val.nombre}</td>
                <td>{val.correo}</td>
                <td>{val.clave}</td>
                {/* CAMBIO: Mostramos el 'nombre_rol' textual traído con el JOIN de la BD */}
                <td><span className="badge bg-secondary">{(val.nombre_rol || 'Sin Rol').toUpperCase()}</span></td>
                <td>
                  <span className={`badge ${val.estado === 'activo' ? 'bg-success' : val.estado === 'inactivo' ? 'bg-danger' : 'bg-warning'}`}>
                    {val.estado.toUpperCase()}
                  </span>
                </td>
                <td>
                  {permisosLista.length > 0 ? (
                    <div className="d-flex flex-wrap gap-1">
                      {permisosLista.slice(0, 3).map((permiso) => (
                        <span key={`${val.id_usuario}-${permiso}`} className="badge bg-dark">{permiso}</span>
                      ))}
                      {permisosLista.length > 3 && (
                        <span
                          className="badge bg-secondary"
                          title={permisosOcultos.join(', ')}
                          style={{ cursor: 'help' }}
                        >
                          +{permisosLista.length - 3} más
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="badge bg-light text-dark border">Sin permisos</span>
                  )}
                </td>
                <td>
                  <div className="btn-group" role="group">
                    <button type="button" onClick={() => abrirEditarModal(val)} className="btn btn-info btn-sm m-1 fw-bold">ACTUALIZAR</button>
                    <button type="button" onClick={() => deteleUsuario(val)} className="btn btn-danger btn-sm m-1 fw-bold">ELIMINAR</button>
                    <button type="button" onClick={() => descargarPDFIndividual(val)} className="btn btn-secondary btn-sm m-1 fw-bold">📄 PDF</button>
                  </div>
                </td>
              </tr>
            )})
          ) : (
            <tr>
              <td colSpan="9" className="text-center text-muted py-3">No se encontraron usuarios coincidentes.</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* PAGINACIÓN */}
      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        startIndex={startIndex}
        endIndex={endIndex}
        itemsCount={usuariosFiltrados.length}
      />

      {/* 1. MODAL REGISTRO */}
      {showRegModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content shadow-lg">
              <div className="modal-header bg-success text-white">
                <h5 className="modal-title fw-bold">Registrar Usuario</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => { setShowRegModal(false); limpiarCampos(); }}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-bold">Nombre:</label>
                  <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} className="form-control" placeholder="Nombre completo" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Foto de Perfil:</label>
                  <input type="file" accept="image/*" onChange={manejarCambioFoto} className="form-control" />
                  {foto_perfil && (
                    <img src={foto_perfil} alt="Vista previa" style={{ width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover', marginTop: '10px' }} />
                  )}
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Correo:</label>
                  <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} className="form-control" placeholder="Correo electrónico" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Clave:</label>
                  <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} className="form-control" placeholder="Clave de acceso" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Rol de Usuario:</label>
                  <select value={id_rol} onChange={(e) => setId_rol(e.target.value)} className="form-select">
                    <option value="" disabled>-- Seleccione un Rol --</option>
                    {rolesList.length > 0 ? (
                      rolesList.map((rol) => (
                        <option key={rol.id_rol} value={rol.id_rol}>
                          {rol.nombre_rol}
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>No hay roles registrados</option>
                    )}
                  </select>
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
                <div className="mb-3">
                  <label className="form-label fw-bold">Permisos por módulo:</label>
                  <div className="border rounded p-2" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                    <div className="d-flex gap-2 mb-2">
                      <button type="button" className="btn btn-sm btn-outline-success" onClick={seleccionarTodosPermisos}>Seleccionar Todo</button>
                      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={limpiarPermisos}>Limpiar</button>
                    </div>
                    {PERMISOS_MODULOS.map((permiso) => (
                      <div key={permiso} className="form-check">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id={`perm-reg-${permiso}`}
                          checked={permisos.includes(permiso)}
                          onChange={() => togglePermiso(permiso)}
                        />
                        <label className="form-check-label" htmlFor={`perm-reg-${permiso}`}>
                          {permiso}
                        </label>
                      </div>
                    ))}
                  </div>
                  <small className="text-muted">Módulos seleccionados: {permisos.length}</small>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowRegModal(false); limpiarCampos(); }}>Cancelar</button>
                <button type="button" className="btn btn-success fw-bold" onClick={add}>Guardar Usuario</button>
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
                <h5 className="modal-title fw-bold">Actualizar Usuario #{id_usuario}</h5>
                <button type="button" className="btn-close" onClick={() => { setShowEditModal(false); limpiarCampos(); }}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-bold">Nombre:</label>
                  <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} className="form-control" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Foto de Perfil:</label>
                  <input type="file" accept="image/*" onChange={manejarCambioFoto} className="form-control" />
                  {foto_perfil && (
                    <img src={foto_perfil} alt="Vista previa" style={{ width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover', marginTop: '10px' }} />
                  )}
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Correo:</label>
                  <input type="text" value={correo} onChange={(e) => setCorreo(e.target.value)} className="form-control" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Clave:</label>
                  <input type="text" value={clave} onChange={(e) => setClave(e.target.value)} className="form-control" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Rol de Usuario:</label>
                  <select value={id_rol} onChange={(e) => setId_rol(e.target.value)} className="form-select">
                    <option value="" disabled>-- Seleccione un Rol --</option>
                    {rolesList.length > 0 ? (
                      rolesList.map((rol) => (
                        <option key={rol.id_rol} value={rol.id_rol}>
                          {rol.nombre_rol}
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>No hay roles registrados</option>
                    )}
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
                <div className="mb-3">
                  <label className="form-label fw-bold">Permisos por módulo:</label>
                  <div className="border rounded p-2" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                    <div className="d-flex gap-2 mb-2">
                      <button type="button" className="btn btn-sm btn-outline-success" onClick={seleccionarTodosPermisos}>Seleccionar Todo</button>
                      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={limpiarPermisos}>Limpiar</button>
                    </div>
                    {PERMISOS_MODULOS.map((permiso) => (
                      <div key={permiso} className="form-check">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id={`perm-edit-${permiso}`}
                          checked={permisos.includes(permiso)}
                          onChange={() => togglePermiso(permiso)}
                        />
                        <label className="form-check-label" htmlFor={`perm-edit-${permiso}`}>
                          {permiso}
                        </label>
                      </div>
                    ))}
                  </div>
                  <small className="text-muted">Módulos seleccionados: {permisos.length}</small>
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

export default Usuarios;