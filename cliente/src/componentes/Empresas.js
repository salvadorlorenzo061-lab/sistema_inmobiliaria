import { useState, useEffect, useCallback } from 'react';
import Axios from "axios";
import { API_BASE_URL } from '../config';
import 'bootstrap/dist/css/bootstrap.min.css';
import Swal from 'sweetalert2';

const getLogoValidation = (logoData = "") => {
  if (!logoData) {
    return { isValid: true, message: '', format: '' };
  }

  if (typeof logoData !== 'string') {
    return { isValid: false, message: 'El logo no tiene un formato válido.', format: '' };
  }

  const match = logoData.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,/i);
  if (!match) {
    return { isValid: false, message: 'Logo inválido: debe estar en Base64 (data:image/...).', format: '' };
  }

  const format = match[1].toLowerCase();
  const allowedFormats = ['png', 'jpg', 'jpeg', 'webp'];
  if (!allowedFormats.includes(format)) {
    return {
      isValid: false,
      message: 'Formato no soportado para PDF. Usa PNG, JPG o WEBP.',
      format
    };
  }

  return { isValid: true, message: '', format };
};

function Empresas() {
  const [id_empresa, setId_empresa] = useState("");
  const [nombre_empresa, setNombre_empresa] = useState("");
  const [pais, setPais] = useState("");
  const [moneda, setMoneda] = useState("");
  const [estado, setEstado] = useState("");
  const [nit, setNit] = useState("");
  // 📸 NUEVO ESTADO: Guarda el string de la foto/logo en Base64
  const [logo, setLogo] = useState(""); 
  const [logoValidation, setLogoValidation] = useState({ isValid: true, message: '', format: '' });
  
  const [empresasList, setEmpresas] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [showRegModal, setShowRegModal] = useState(false);  
  const [showEditModal, setShowEditModal] = useState(false); 

  const API_URL = `${API_BASE_URL}/api/empresas`;

  // 🔄 NUEVA FUNCIÓN: Lector de archivos para pasar la imagen a Base64
  const handleFotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const logoBase64 = reader.result;
        setLogo(logoBase64);
        setLogoValidation(getLogoValidation(logoBase64));
      };
      reader.readAsDataURL(file);
    }
  };

  // =========================================================================
  //  CONTROLADORES CRUD
  // =========================================================================
  const getEmpresas = useCallback(() => {
    Axios.get(API_URL)
    .then((response) => { setEmpresas(response.data || []); })
    .catch((error) => { console.error("Error al obtener empresas", error); });
  }, [API_URL]);

  useEffect(() => { getEmpresas(); }, [getEmpresas]);

  const addEmpresa = () => {
        if (!logoValidation.isValid) {
          Swal.fire({
            icon: 'warning',
            title: 'Logotipo inválido',
            text: logoValidation.message
          });
          return;
        }

    if (!nombre_empresa.trim() || !nit.trim() || !pais.trim() || !moneda.trim() || !estado.trim()) {
      Swal.fire({
        position: "top-end",
        icon: "warning",
        title: 'CAMPOS INCOMPLETOS',
        showConfirmButton: false,
        timer: 3000
      });
      return; 
    }

    // 📝 AUDITORÍA: Obtener datos del usuario actual
    const usuarioData = JSON.parse(localStorage.getItem('usuario')) || {};
    const id_usuario = usuarioData.id_usuario || 0;
    const nombre_usuario = usuarioData.nombre_usuario || 'DESCONOCIDO';

    // ✅ CORREGIDO: Se envía el logo en el cuerpo del POST
    Axios.post(`${API_URL}/crear`, {
      nombre_empresa,
      pais,
      moneda,
      estado,
      nit,
      logo,
      id_empresa_matriz: null,
      id_usuario,
      nombre_usuario
    })
    .then(() => {
      getEmpresas();
      limpiarCampos();
      setShowRegModal(false);
      Swal.fire({
        position: "top-end",
        icon: "success",
        title: `Empresa "${nombre_empresa}" creada con éxito`,
        showConfirmButton: false,
        timer: 3000
      });
    })
    .catch((error) => {
      Swal.fire({
        title: "<strong>Error al registrar</strong>",
        text: error.response?.data?.message || 'Hubo un error en el servidor',
        icon: 'error',
        timer: 3500,
        showConfirmButton: false
      });
    });
  };

  const actualizarEmpresa = () => {
        if (!logoValidation.isValid) {
          Swal.fire({
            icon: 'warning',
            title: 'Logotipo inválido',
            text: logoValidation.message
          });
          return;
        }

    if (!nombre_empresa.trim() || !nit.trim() || !pais.trim() || !moneda.trim() || !estado.trim()) {
      Swal.fire({ icon: 'warning', title: 'Campos incompletos' });
      return;
    }

    // 📝 AUDITORÍA: Obtener datos del usuario actual
    const usuarioData = JSON.parse(localStorage.getItem('usuario')) || {};
    const id_usuario = usuarioData.id_usuario || 0;
    const nombre_usuario = usuarioData.nombre_usuario || 'DESCONOCIDO';

    // ✅ CORREGIDO: Se envía el logo actualizado en el PUT
    Axios.put(`${API_URL}/actualizar`, {
      id_empresa,
      nombre_empresa,
      pais,
      moneda,
      estado,
      nit,
      logo,
      id_empresa_matriz: null,
      id_usuario,
      nombre_usuario
    })
    .then(() => {
      getEmpresas();
      limpiarCampos();
      setShowEditModal(false);
      Swal.fire({
        html: '<strong>¡Éxito!</strong><p>Empresa actualizada correctamente</p>',
        icon: 'success',
        timer: 3000,
        showConfirmButton: false
      });
    })
    .catch((error) => {
      console.error(error);
      Swal.fire({ icon: 'error', title: 'Error al actualizar la empresa' });
    });
  };

  const deleteEmpresa = (val) => {
    Swal.fire({
      title: "Confirmar eliminación",
      html: `<i>¿Desea eliminar la empresa <strong>${val.nombre_empresa}</strong>?</i>`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Sí, eliminarla",
      cancelButtonText: "Cancelar"
    }).then((result) => {
      if (result.isConfirmed) {
        // 📝 AUDITORÍA: Obtener datos del usuario actual
        const usuarioData = JSON.parse(localStorage.getItem('usuario')) || {};
        const id_usuario = usuarioData.id_usuario || 0;
        const nombre_usuario = usuarioData.nombre_usuario || 'DESCONOCIDO';

        Axios.delete(`${API_URL}/delete/${val.id_empresa}`, { data: { id_usuario, nombre_usuario } })
        .then(() => {
          getEmpresas();
          Swal.fire('¡Eliminada!', 'La empresa fue retirada del sistema.', 'success');
        })
        .catch((error) => {
          Swal.fire({
            title: "Operación Bloqueada",
            text: error.response?.data?.message || 'No se pudo eliminar la empresa.',
            icon: 'warning'
          });
        });
      }
    });
  };

  const abrirEditarModal = (val) => {
    setId_empresa(val.id_empresa);
    setNombre_empresa(val.nombre_empresa);
    setPais(val.pais);
    setMoneda(val.moneda);
    setEstado(val.estado);
    setNit(val.nit || "");
    // ✅ Carga el logo existente (si lo tiene) o un string vacío para evitar problemas
    const logoActual = val.logo || "";
    setLogo(logoActual);
    setLogoValidation(getLogoValidation(logoActual));
    setShowEditModal(true);
  };

  const limpiarCampos = () => {
    setId_empresa(""); setNombre_empresa(""); setPais(""); setMoneda(""); setEstado(""); setNit(""); setLogo("");
    setLogoValidation({ isValid: true, message: '', format: '' });
  };

  const obtenerNombreMatriz = (empresa) => {
    if (!empresa.id_empresa_matriz) return 'MATRIZ';
    const matriz = empresasList.find((item) => String(item.id_empresa) === String(empresa.id_empresa_matriz));
    return matriz?.nombre_empresa || 'Sin matriz';
  };

  // Filtrado en tiempo real por nombre de empresa o NIT
  const empresasFiltradas = empresasList.filter((item) => 
    item.nombre_empresa.toLowerCase().includes(busqueda.toLowerCase()) ||
    (item.nit || '').toLowerCase().includes(busqueda.toLowerCase())
  );

  // Cálculo de paginación
  const totalPages = Math.ceil(empresasFiltradas.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const empresasPaginadas = empresasFiltradas.slice(startIndex, endIndex);

  // Resetear página cuando se busca
  const handleBusquedaChange = (e) => {
    setBusqueda(e.target.value);
    setCurrentPage(1);
  };

  return (
    <div className='container mt-4'>
      
      {/* CABECERA */}
      <div className="module-header">
        <div className="row align-items-center bg-light p-3 rounded shadow-sm">
          <div className="col-md-4">
            <h3 className="m-0 text-dark fw-bold">MÓDULO DE EMPRESAS</h3>
          </div>
          <div className="col-md-5">
            <div className="input-group">
              <span className="input-group-text bg-info text-dark">🔍</span>
              <input 
                type="text" 
                className="form-control" 
                placeholder="Buscar por nombre corporativo o NIT..." 
                value={busqueda}
                onChange={handleBusquedaChange}
              />
            </div>
          </div>
          <div className="col-md-3 text-end">
            <button 
              className="btn btn-info fw-bold w-100 text-dark" 
              onClick={() => { limpiarCampos(); setShowRegModal(true); }}
            >
              ➕ AGREGAR NUEVA EMPRESA
            </button>
          </div>
        </div>
      </div>
      
      {/* TABLA DE EMPRESAS */}
      <table className="table table-striped table-bordered align-middle shadow-sm">
        <thead className="table-dark">
          <tr>
            <th>ID EMPRESA</th>
            <th>LOGO</th> {/* ✅ NUEVA COLUMNA */}
            <th>NOMBRE CORPORATIVO</th>
            <th>NIT</th>
            <th>TIPO</th>
            <th>EMPRESA MATRIZ</th>
            <th>PAÍS</th>
            <th>MONEDA REGISTRO</th>
            <th>FECHA REGISTRO</th>
            <th>ESTADO</th>
            <th>OPCIONES</th>
          </tr>
        </thead>
        <tbody>
          {empresasPaginadas.length > 0 ? (
            empresasPaginadas.map((val, index) => (
              <tr key={val.id_empresa}>
                <th>#{startIndex + index + 1}</th>
                {/* 🎨 NUEVO ENTORNO: Visualizador del Logo */}
                <td>
                  {val.logo ? (
                    <img src={val.logo} alt="Logo" className="rounded shadow-sm" style={{ width: '55px', height: '40px', objectFit: 'contain', backgroundColor: '#fdfdfd' }} />
                  ) : (
                    <span className="text-muted" style={{ fontSize: '11px' }}>Sin logo</span>
                  )}
                </td>
                <td className="fw-bold text-secondary">{val.nombre_empresa.toUpperCase()}</td>
                <td><span className="fw-bold text-dark">{val.nit || 'C/F'}</span></td>
                <td>
                  <span className={`badge ${val.id_empresa_matriz ? 'bg-primary' : 'bg-success'}`}>
                    {val.id_empresa_matriz ? 'PROYECTO' : 'MATRIZ'}
                  </span>
                </td>
                <td><span className="text-muted fw-semibold">{obtenerNombreMatriz(val)}</span></td>
                <td>{val.pais}</td>
                <td><span className="badge bg-light text-dark border fw-bold">{val.moneda}</span></td>
                <td>{new Date(val.fecha_registro).toLocaleDateString() + ' ' + new Date(val.fecha_registro).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                <td>
                  <span className={`badge ${val.estado === 'activo' ? 'bg-success' : 'bg-danger'}`}>
                    {val.estado.toUpperCase()}
                  </span>
                </td>
                <td>
                  <div className="btn-group" role="group">
                    <button type="button" onClick={() => abrirEditarModal(val)} className="btn btn-warning btn-sm m-1 fw-bold text-dark">EDITAR</button>
                    <button type="button" onClick={() => deleteEmpresa(val)} className="btn btn-danger btn-sm m-1 fw-bold">ELIMINAR</button>
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="11" className="text-center text-muted py-3">No se encontraron empresas dadas de alta.</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* PAGINACIÓN */}
      {empresasFiltradas.length > itemsPerPage && (
        <div className="d-flex justify-content-between align-items-center mt-4 p-3 bg-light rounded">
          <span className="text-muted fw-bold">
            Mostrando {startIndex + 1}-{Math.min(endIndex, empresasFiltradas.length)} de {empresasFiltradas.length} empresas
          </span>
          <nav>
            <ul className="pagination m-0">
              <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                <button className="page-link" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
                  «« Primera
                </button>
              </li>
              <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                <button className="page-link" onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage === 1}>
                  « Anterior
                </button>
              </li>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <li key={page} className={`page-item ${currentPage === page ? 'active' : ''}`}>
                  <button className="page-link" onClick={() => setCurrentPage(page)}>
                    {page}
                  </button>
                </li>
              ))}
              <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                <button className="page-link" onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage === totalPages}>
                  Siguiente »
                </button>
              </li>
              <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                <button className="page-link" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>
                  Última »»
                </button>
              </li>
            </ul>
          </nav>
        </div>
      )}

      {/* MODAL 1: REGISTRO */}
      {showRegModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content shadow-lg">
              <div className="modal-header bg-info text-dark">
                <h5 className="modal-title fw-bold">Dar de Alta Empresa</h5>
                <button type="button" className="btn-close" onClick={() => { setShowRegModal(false); limpiarCampos(); }}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-bold">Nombre de la Empresa:</label>
                  <input type="text" value={nombre_empresa} onChange={(e) => setNombre_empresa(e.target.value)} className="form-control" placeholder="Ej: Corporación Inmobiliaria del Oriente" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">NIT (Número de Identificación Tributaria):</label>
                  <input type="text" value={nit} onChange={(e) => setNit(e.target.value)} className="form-control" placeholder="Ej: 1234567890123" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">País:</label>
                  <input type="text" value={pais} onChange={(e) => setPais(e.target.value)} className="form-control" placeholder="Ej: Guatemala" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Moneda del Sistema:</label>
                  <select value={moneda} onChange={(e) => setMoneda(e.target.value)} className="form-select">
                    <option value="" disabled>-- Seleccione Moneda Base --</option>
                    <option value="GTQ">Quetzales (GTQ)</option>
                    <option value="USD">Dólares (USD)</option>
                    <option value="MXN">Pesos Mexicanos (MXN)</option>
                  </select>
                </div>
                
                {/* 📷 NUEVA ENTRADA: Archivo de Imagen */}
                <div className="mb-3">
                  <label className="form-label fw-bold">Logotipo o Imagen Institucional:</label>
                  <input type="file" accept="image/*" onChange={handleFotoChange} className="form-control" />
                  {!logoValidation.isValid && (
                    <div className="alert alert-warning mt-2 mb-0 py-2">
                      <strong>⚠️ Logo no válido:</strong> {logoValidation.message}
                    </div>
                  )}
                  {logoValidation.isValid && logoValidation.format && (
                    <small className="text-success d-block mt-2">Formato detectado: {logoValidation.format.toUpperCase()}</small>
                  )}
                  {logo && (
                    <div className="mt-2 text-center bg-light p-2 border rounded">
                      <img src={logo} alt="Previsualización Logo" className="img-thumbnail" style={{ maxHeight: '100px', objectFit: 'contain' }} />
                    </div>
                  )}
                </div>

                <div className="mb-3">
                  <label className="form-label fw-bold">Estado Operativo:</label>
                  <select value={estado} onChange={(e) => setEstado(e.target.value)} className="form-select">
                    <option value="" disabled>-- Seleccione Estado --</option>
                    <option value="activo">Activo (Operando)</option>
                    <option value="inactivo">Inactivo (Suspendido)</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowRegModal(false); limpiarCampos(); }}>Cancelar</button>
                <button type="button" className="btn btn-info fw-bold text-dark" onClick={addEmpresa}>Guardar Configuración</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: EDICIÓN */}
      {showEditModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content shadow-lg">
              <div className="modal-header bg-warning text-dark">
                <h5 className="modal-title fw-bold">Modificar Empresa #{id_empresa}</h5>
                <button type="button" className="btn-close" onClick={() => { setShowEditModal(false); limpiarCampos(); }}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-bold">Nombre de la Empresa:</label>
                  <input type="text" value={nombre_empresa} onChange={(e) => setNombre_empresa(e.target.value)} className="form-control" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">NIT (Número de Identificación Tributaria):</label>
                  <input type="text" value={nit} onChange={(e) => setNit(e.target.value)} className="form-control" placeholder="Ej: 1234567890123" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">País:</label>
                  <input type="text" value={pais} onChange={(e) => setPais(e.target.value)} className="form-control" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Moneda del Sistema:</label>
                  <select value={moneda} onChange={(e) => setMoneda(e.target.value)} className="form-select">
                    <option value="GTQ">Quetzales (GTQ)</option>
                    <option value="USD">Dólares (USD)</option>
                    <option value="MXN">Pesos Mexicanos (MXN)</option>
                  </select>
                </div>

                {/* 📷 NUEVA ENTRADA: Edición de Imagen */}
                <div className="mb-3">
                  <label className="form-label fw-bold">Modificar Logotipo:</label>
                  <input type="file" accept="image/*" onChange={handleFotoChange} className="form-control" />
                  {!logoValidation.isValid && (
                    <div className="alert alert-warning mt-2 mb-0 py-2">
                      <strong>⚠️ Logo no válido:</strong> {logoValidation.message}
                    </div>
                  )}
                  {logoValidation.isValid && logoValidation.format && (
                    <small className="text-success d-block mt-2">Formato detectado: {logoValidation.format.toUpperCase()}</small>
                  )}
                  {logo && (
                    <div className="mt-2 text-center bg-light p-2 border rounded">
                      <img src={logo} alt="Logo Actual" className="img-thumbnail" style={{ maxHeight: '100px', objectFit: 'contain' }} />
                    </div>
                  )}
                </div>

                <div className="mb-3">
                  <label className="form-label fw-bold">Estado Operativo:</label>
                  <select value={estado} onChange={(e) => setEstado(e.target.value)} className="form-select">
                    <option value="activo">Activo (Operando)</option>
                    <option value="inactivo">Inactivo (Suspendido)</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowEditModal(false); limpiarCampos(); }}>Cancelar</button>
                <button type="button" className="btn btn-warning fw-bold text-dark" onClick={actualizarEmpresa}>Guardar Cambios</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Empresas;