import { useState, useEffect, useCallback } from 'react';
import Axios from "axios";
import 'bootstrap/dist/css/bootstrap.min.css';
import Swal from 'sweetalert2';
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { API_BASE_URL } from '../config';
import { getPaginatedData, PaginationControls } from '../utils/paginationUtils';
import { CONTRACT_TEMPLATES } from '../utils/contractTemplates';

function Residentes() {
  const [id_residente, setId_residente] = useState("");
  const [id_empresa, setId_empresa] = useState("");
  const [nombre, setNombre] = useState("");
  const [dpi, setDpi] = useState("");
  const [nit, setNit] = useState("");
  const [telefono, setTelefono] = useState("");
  const [correo, setCorreo] = useState("");
  const [fecha_nacimiento, setFecha_nacimiento] = useState(""); // ✅ NUEVO ESTADO
  const [estado_civil, setEstado_civil] = useState("soltero");
  const [profesion, setProfesion] = useState("");
  const [nacionalidad, setNacionalidad] = useState("guatemalteco");
  const [direccion_notificacion, setDireccion_notificacion] = useState("");
  const [direccion_residencia, setDireccion_residencia] = useState("");
  const [foto, setFoto] = useState(""); 
  const [estado, setEstado] = useState("");
  const [formatoContratoPreferido, setFormatoContratoPreferido] = useState('FORMATO_01');
  
  const [fotoObligatoria, setFotoObligatoria] = useState("no"); 
  const [residentesList, setResidentes] = useState([]);
  const [empresasList, setEmpresasList] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [showRegModal, setShowRegModal] = useState(false);  
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10; 

  const API_URL = `${API_BASE_URL}/api/residentes`;

  const handleFotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => { setFoto(reader.result); };
      reader.readAsDataURL(file);
    }
  };

  const descargarPDFIndividual = (val) => {
    const doc = new jsPDF();

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

    doc.setFillColor(245, 247, 250); 
    doc.rect(130, 12, 66, 26, "F");  

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(41, 128, 185);  
    doc.text("EXPEDIENTE INTEGRAL", 133, 18);
    
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0); 
    doc.text(`ID REGISTRO: #${val.id_residente}`, 133, 24); 
    
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.text(`Empresa: ${val.id_empresa}`, 133, 30);
    doc.text(`Fecha Ref: ${new Date().toLocaleDateString()}`, 133, 34);

    doc.setDrawColor(200, 200, 200);
    doc.line(14, 42, 196, 42); 

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    doc.text("DATOS GENERALES DEL RESIDENTE", 14, 49);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text(`Nombre Completo:   ${val.nombre.toUpperCase()}`, 14, 56);
    doc.text(`Correo Oficial:          ${val.correo}`, 14, 61);
    doc.text(`Estado del Acceso:    ${val.estado.toUpperCase()}`, 14, 66); 

    const generarEstructuraPDF = () => {
      autoTable(doc, {
        startY: 88, 
        head: [['PARÁMETRO', 'VALOR ASIGNADO']],
        body: [
          ['CÓDIGO RESIDENTE', `RES-${val.id_residente}`],
          ['NOMBRE COMPLETO', val.nombre.toUpperCase()],
          ['DPI / IDENTIFICACIÓN', val.dpi],
          ['TELÉFONO', val.telefono],
          ['CORREO ELECTRÓNICO', val.correo],
          ['FECHA NACIMIENTO', val.fecha_nacimiento ? new Date(val.fecha_nacimiento).toLocaleDateString() : 'No registrada'],
          ['ESTADO CIVIL', val.estado_civil || 'No registrado'],
          ['PROFESIÓN', val.profesion || 'No registrada'],
          ['NACIONALIDAD', val.nacionalidad || 'No registrada'],
          ['DIRECCIÓN NOTIFICACIÓN', val.direccion_notificacion],
          ['ESTADO OPERATIVO', val.estado.toUpperCase()],
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
      doc.text("Nota de seguridad: Esta ficha contiene datos confidenciales del residente.", 14, finalY);
      
      doc.save(`Ficha_Residente_${val.nombre.replace(/\s+/g, '_')}.pdf`);
    };

    if (val.foto && val.foto.startsWith("data:image")) {
      const img = new Image();
      img.src = val.foto;
      img.onload = function () {
        try {
          doc.addImage(img, 'JPEG', 155, 45, 35, 35, undefined, 'FAST');
          doc.setDrawColor(41, 128, 185);
          doc.setLineWidth(0.5);
          doc.rect(155, 45, 35, 35);
        } catch (error) { console.error(error); }
        generarEstructuraPDF();
      };
      img.onerror = function () {
        dibujarPlaceholderFoto();
        generarEstructuraPDF();
      };
    } else {
      dibujarPlaceholderFoto();
      generarEstructuraPDF();
    }

    function dibujarPlaceholderFoto() {
      doc.setFillColor(230, 235, 240);
      doc.rect(155, 45, 35, 35, "F");
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text("SIN FOTO", 165, 63);
    }
  };

  const getResidentes = useCallback(() => {
    Axios.get(API_URL)
    .then((response) => { setResidentes(response.data); })
    .catch((error) => { console.error("Error al obtener residentes", error); });
  }, [API_URL]);

  useEffect(() => {
    getResidentes();
    Axios.get(`${API_BASE_URL}/api/empresas`)
      .then(res => setEmpresasList(Array.isArray(res.data) ? res.data : []))
      .catch(() => setEmpresasList([]));
  }, [getResidentes]);

  const add = () => {
    if (!id_empresa || !nombre.trim() || !dpi.trim() || !nit.trim() || !telefono || !correo.trim() || !fecha_nacimiento || !estado_civil.trim() || !profesion.trim() || !nacionalidad.trim() || !direccion_notificacion.trim() || !direccion_residencia.trim() || !estado.trim()) {
      Swal.fire({ position: "top-end", icon: "warning", title: 'DATOS INCOMPLETOS', showConfirmButton: false, timer: 3000 });
      return; 
    }

    if (fotoObligatoria === "si" && !foto) {
      Swal.fire({ icon: "warning", title: "FOTOGRAFÍA REQUERIDA", text: "Ha configurado que la foto es obligatoria." });
      return;
    }

    Axios.post(`${API_URL}/crear`, {
      id_empresa,
      nombre,
      dpi,
      nit,
      telefono,
      correo,
      fecha_nacimiento,
      estado_civil,
      profesion,
      nacionalidad,
      direccion_notificacion,
      direccion_residencia,
      foto,
      estado,
      formato_contrato_preferido: formatoContratoPreferido
    })
    .then((response) => {
      const preferencias = JSON.parse(localStorage.getItem('residentes_formato_preferido') || '{}');
      preferencias[String(response.data.id_residente)] = formatoContratoPreferido;
      localStorage.setItem('residentes_formato_preferido', JSON.stringify(preferencias));

      getResidentes();
      limpiarCampos();
      setShowRegModal(false);
      Swal.fire({
        position: "top-end",
        icon: "success",
        title: 'Residente creado correctamente',
        html: `Número de identificación asignado:<br><strong>${response.data.numero_identificacion || 'Sin asignar'}</strong>`,
        showConfirmButton: false,
        timer: 4000
      });
    })
    .catch((error) => {
      Swal.fire({ title: "<strong>No se registró!</strong>", text: error.response?.data?.message || 'Hubo un error en el sistema', icon: 'warning', timer: 3000, showConfirmButton: false });
    });
  };

  const actualizar = () => {
    if (!id_residente || !nombre.trim() || !dpi.trim() || !nit.trim() || !telefono || !correo.trim() || !fecha_nacimiento || !estado_civil.trim() || !profesion.trim() || !nacionalidad.trim() || !direccion_notificacion.trim() || !direccion_residencia.trim() || !estado.trim()) {
      Swal.fire({ icon: 'warning', title: 'Campos incompletos' });
      return;
    }

    if (fotoObligatoria === "si" && !foto) {
      Swal.fire({ icon: "warning", title: "FOTOGRAFÍA REQUERIDA", text: "La foto está marcada como obligatoria." });
      return;
    }

    Axios.put(`${API_URL}/actualizar`, {
      id_residente,
      id_empresa,
      nombre,
      dpi,
      nit,
      telefono,
      correo,
      fecha_nacimiento,
      estado_civil,
      profesion,
      nacionalidad,
      direccion_notificacion,
      direccion_residencia,
      foto,
      estado,
      formato_contrato_preferido: formatoContratoPreferido
    })
    .then(() => {
      const preferencias = JSON.parse(localStorage.getItem('residentes_formato_preferido') || '{}');
      preferencias[String(id_residente)] = formatoContratoPreferido;
      localStorage.setItem('residentes_formato_preferido', JSON.stringify(preferencias));

      getResidentes();
      limpiarCampos();
      setShowEditModal(false);
      Swal.fire({ html: '<strong>¡Éxito!</strong><p>Residente actualizado correctamente</p>', icon: 'success', timer: 3000, showConfirmButton: false });
    })
    .catch((error) => {
      console.error(error);
      Swal.fire({ icon: 'error', title: 'Error al actualizar' });
    });
  };

  const deteleResidente = (val) => {
    Swal.fire({
      title: "Confirmar eliminación",
      html: `¿Desea eliminar a <strong>${val.nombre}</strong>?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Sí, eliminarlo!",
      cancelButtonText: "Cancelar"
    }).then((result) => {
      if (result.isConfirmed) {
        Axios.delete(`${API_URL}/delete/${val.id_residente}`)
        .then(() => {
          getResidentes();
          Swal.fire('¡Eliminado!', val.nombre + ' fue eliminado.', 'success');
        })
        .catch(err => console.error(err));
      }
    });
  };

  const limpiarCampos = () => {
    setId_residente(""); 
    setId_empresa(""); 
    setNombre("");
    setDpi("");
    setNit("");
    setTelefono("");
    setCorreo("");
    setFecha_nacimiento(""); 
    setEstado_civil("soltero");
    setProfesion("");
    setNacionalidad("guatemalteco");
    setDireccion_notificacion("");
    setDireccion_residencia("");
    setFoto("");
    setEstado("");
    setFormatoContratoPreferido('FORMATO_01');
    setFotoObligatoria("no");
  };

  const abrirEditarModal = (val) => {
    setId_residente(val.id_residente);
    setId_empresa(val.id_empresa);
    setNombre(val.nombre);
    setDpi(val.dpi);
    setNit(val.nit || "");
    setTelefono(val.telefono);
    setCorreo(val.correo);
    setFecha_nacimiento(val.fecha_nacimiento ? val.fecha_nacimiento.split('T')[0] : ""); 
    setEstado_civil(val.estado_civil || 'soltero');
    setProfesion(val.profesion || '');
    setNacionalidad(val.nacionalidad || 'guatemalteco');
    setDireccion_notificacion(val.direccion_notificacion);
    setDireccion_residencia(val.direccion_residencia || "");
    setFoto(val.foto || "");
    setEstado(val.estado);
    const preferencias = JSON.parse(localStorage.getItem('residentes_formato_preferido') || '{}');
    setFormatoContratoPreferido(val.formato_contrato_preferido || preferencias[String(val.id_residente)] || 'FORMATO_01');
    setFotoObligatoria("no");
    setShowEditModal(true);
  };

  const asignarIdentificacion = (val) => {
    Swal.fire({
      title: `Asignar identificación a ${val.nombre}`,
      text: 'Se generará y asignará un número de identificación único a este residente.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Generar y Asignar',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        Axios.post(`${API_URL}/asignar-identificacion/${val.id_residente}`)
          .then((res) => {
            getResidentes();
            Swal.fire({ icon: 'success', title: 'Número asignado', text: res.data.numero_identificacion, timer: 3500, showConfirmButton: false });
          })
          .catch((err) => {
            Swal.fire({ icon: 'warning', title: 'No se pudo asignar', text: err.response?.data?.message || 'Error desconocido' });
          });
      }
    });
  };

  // ✅ FILTRADO CORREGIDO E IMPLEMENTADO AQUÍ:
  const residentesFiltrados = residentesList.filter((res) => 
    res.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    (res.numero_identificacion?.toLowerCase().includes(busqueda.toLowerCase()) ?? false)
  );

  // Paginación utilizando el listado ya filtrado
  const { paginatedItems: residentesPaginados, totalPages, startIndex, endIndex } = getPaginatedData(residentesFiltrados, currentPage, itemsPerPage);

  const handleBusquedaChange = (e) => {
    setBusqueda(e.target.value);
    setCurrentPage(1); // Reiniciar a la primera página con cada nueva búsqueda
  };

  return (
    <div className='mt-4 residentes-view residentes-ejemplo'>
      <div className="module-header">
        <div className="row align-items-center bg-light p-3 rounded shadow-sm">
          <div className="col-md-4">
            <h3 className="m-0 text-dark fw-bold">GESTIÓN DE RESIDENTES</h3>
          </div>
          <div className="col-md-5">
            <div className="input-group">
              <span className="input-group-text bg-primary text-white">🔍</span>
              <input 
                type="text" 
                className="form-control" 
                placeholder="Buscar por nombre o identificación..." 
                value={busqueda}
                onChange={handleBusquedaChange}
              />
            </div>
          </div>
          <div className="col-md-3 text-end">
            <button className="btn btn-success fw-bold w-100" onClick={() => { limpiarCampos(); setShowRegModal(true); }}>
              ➕ AGREGAR RESIDENTE
            </button>
          </div>
        </div>
      </div>
      
      <div className="tabla-residentes-wrapper mt-3">
        <table className="table table-striped table-bordered align-middle shadow-sm tabla-residentes" style={{ marginBottom: '0' }}>
          <thead className="table-dark">
            <tr>
              <th>ID</th>
              <th>FOTO</th>
             
              <th>NOMBRE</th>
              <th>IDENTIFICACIÓN</th>
              <th>DPI</th>
              <th>TELÉFONO</th>
              <th>CORREO</th>
              <th>FECHA NACIMIENTO</th>
              <th>ESTADO</th>
              <th>OPCIONES</th>
            </tr>
          </thead>
          <tbody>
            {residentesPaginados.length > 0 ? (
              residentesPaginados.map((val) => (
                <tr key={val.id_residente}>
                  <th>{val.id_residente}</th>
                  <td>
                    {val.foto ? (
                      <img src={val.foto} alt="Miniatura" className="rounded-circle shadow-sm" style={{ width: '45px', height: '45px', objectFit: 'cover' }} />
                    ) : (
                      <span className="text-muted" style={{ fontSize: '11px' }}>Sin foto</span>
                    )}
                  </td>
                 
                  <td>{val.nombre}</td>
                  <td><span className="fw-bold text-primary">{val.numero_identificacion || <span className="text-danger">Sin asignar</span>}</span></td>
                  <td>{val.dpi}</td>
                  <td>{val.telefono}</td>
                  <td>{val.correo}</td>
                  <td>{val.fecha_nacimiento}</td>
                  <td>
                    <span className={`badge ${val.estado === 'activo' ? 'bg-success' : val.estado === 'inactivo' ? 'bg-danger' : 'bg-warning'}`}>
                      {val.estado ? val.estado.toUpperCase() : 'PENDIENTE'}
                    </span>
                  </td>
                  <td className="residentes-opciones-cell">
                    <div className="residentes-actions" role="group">
                      <button type="button" onClick={() => abrirEditarModal(val)} className="btn btn-sm fw-bold btn-residente-editar">EDITAR</button>
                      <button type="button" onClick={() => deteleResidente(val)} className="btn btn-sm fw-bold btn-residente-eliminar">ELIMINAR</button>
                      <button type="button" onClick={() => descargarPDFIndividual(val)} className="btn btn-sm fw-bold btn-residente-pdf">PDF</button>
                      {!val.numero_identificacion && (
                        <button type="button" onClick={() => asignarIdentificacion(val)} className="btn btn-sm fw-bold btn-residente-asignar">ASIGNAR ID</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="10" className="text-center text-muted py-3">No se encontraron residentes coincidentes.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        startIndex={startIndex}
        endIndex={endIndex}
        itemsCount={residentesFiltrados.length}
        itemLabel="residentes"
        className="paginacion-residentes"
      />

      {/* 1. MODAL REGISTRO */}
      {showRegModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-scrollable">
            <div className="modal-content shadow-lg">
              <div className="modal-header bg-success text-white">
                <h5 className="modal-title fw-bold">Registrar Residente</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => { setShowRegModal(false); limpiarCampos(); }}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-bold">Empresa:</label>
                  <select value={id_empresa} onChange={(e) => setId_empresa(e.target.value)} className="form-select">
                    <option value="">-- Seleccione una empresa --</option>
                    {empresasList.map(emp => (
                      <option key={emp.id_empresa} value={emp.id_empresa}>{emp.nombre_empresa}</option>
                    ))}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Nombre Completo:</label>
                  <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} className="form-control" placeholder="Nombre completo" />
                </div>
                <div className="mb-3 bg-light p-2 border rounded">
                  <small className="text-muted">El sistema asignará automáticamente un número de identificación único al guardar el residente.</small>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">DPI:</label>
                  <input type="text" value={dpi} onChange={(e) => setDpi(e.target.value)} className="form-control" placeholder="Ingrese número de DPI" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">NIT:</label>
                  <input type="text" value={nit} onChange={(e) => setNit(e.target.value)} className="form-control" placeholder="Ingrese número de NIT" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Teléfono:</label>
                  <input type="text" value={telefono} onChange={(e) => setTelefono(e.target.value)} className="form-control" placeholder="Número telefónico" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Correo:</label>
                  <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} className="form-control" placeholder="Correo electrónico" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Fecha de Nacimiento:</label>
                  <input type="date" value={fecha_nacimiento} onChange={(e) => setFecha_nacimiento(e.target.value)} className="form-control" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Estado Civil:</label>
                  <select value={estado_civil} onChange={(e) => setEstado_civil(e.target.value)} className="form-select">
                    <option value="soltero">Soltero(a)</option>
                    <option value="casado">Casado(a)</option>
                    <option value="union_libre">Unión libre</option>
                    <option value="divorciado">Divorciado(a)</option>
                    <option value="viudo">Viudo(a)</option>
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Profesión u Oficio:</label>
                  <input type="text" value={profesion} onChange={(e) => setProfesion(e.target.value)} className="form-control" placeholder="Ej: Comerciante" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Nacionalidad:</label>
                  <input type="text" value={nacionalidad} onChange={(e) => setNacionalidad(e.target.value)} className="form-control" placeholder="Ej: guatemalteco" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Dirección de Notificación:</label>
                  <input type="text" value={direccion_notificacion} onChange={(e) => setDireccion_notificacion(e.target.value)} className="form-control" placeholder="Dirección completa" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Dirección de Residencia:</label>
                  <input type="text" value={direccion_residencia} onChange={(e) => setDireccion_residencia(e.target.value)} className="form-control" placeholder="Dirección del domicilio del residente" />
                </div>
                <div className="mb-3 bg-light p-2 border rounded">
                  <label className="form-label fw-bold text-primary">¿Es obligatorio subir fotografía?</label>
                  <select value={fotoObligatoria} onChange={(e) => setFotoObligatoria(e.target.value)} className="form-select">
                    <option value="no">No, es opcional</option>
                    <option value="si">Sí, es totalmente obligatoria</option>
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Fotografía del Residente:</label>
                  <input type="file" accept="image/*" onChange={handleFotoChange} className="form-control" />
                  {foto && (
                    <div className="mt-2 text-center">
                      <img src={foto} alt="Previsualización" className="img-thumbnail" style={{ maxHeight: '130px' }} />
                    </div>
                  )}
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
                  <label className="form-label fw-bold">Formato de contrato sugerido (X):</label>
                  <select value={formatoContratoPreferido} onChange={(e) => setFormatoContratoPreferido(e.target.value)} className="form-select">
                    {CONTRACT_TEMPLATES.map((template) => (
                      <option key={template.id} value={template.id}>{template.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowRegModal(false); limpiarCampos(); }}>Cancelar</button>
                <button type="button" className="btn btn-success fw-bold" onClick={add}>Guardar Residente</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. MODAL EDICIÓN */}
      {showEditModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-scrollable">
            <div className="modal-content shadow-lg">
              <div className="modal-header bg-warning text-dark">
                <h5 className="modal-title fw-bold">Actualizar Residente #{id_residente}</h5>
                <button type="button" className="btn-close" onClick={() => { setShowEditModal(false); limpiarCampos(); }}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-bold">Empresa:</label>
                  <select value={id_empresa} onChange={(e) => setId_empresa(e.target.value)} className="form-select">
                    <option value="">-- Seleccione una empresa --</option>
                    {empresasList.map(emp => (
                      <option key={emp.id_empresa} value={emp.id_empresa}>{emp.nombre_empresa}</option>
                    ))}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Nombre:</label>
                  <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} className="form-control" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">DPI:</label>
                  <input type="text" value={dpi} onChange={(e) => setDpi(e.target.value)} className="form-control" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">NIT:</label>
                  <input type="text" value={nit} onChange={(e) => setNit(e.target.value)} className="form-control" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Teléfono:</label>
                  <input type="text" value={telefono} onChange={(e) => setTelefono(e.target.value)} className="form-control" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Correo:</label>
                  <input type="text" value={correo} onChange={(e) => setCorreo(e.target.value)} className="form-control" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Fecha de Nacimiento:</label>
                  <input type="date" value={fecha_nacimiento} onChange={(e) => setFecha_nacimiento(e.target.value)} className="form-control" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Estado Civil:</label>
                  <select value={estado_civil} onChange={(e) => setEstado_civil(e.target.value)} className="form-select">
                    <option value="soltero">Soltero(a)</option>
                    <option value="casado">Casado(a)</option>
                    <option value="union_libre">Unión libre</option>
                    <option value="divorciado">Divorciado(a)</option>
                    <option value="viudo">Viudo(a)</option>
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Profesión u Oficio:</label>
                  <input type="text" value={profesion} onChange={(e) => setProfesion(e.target.value)} className="form-control" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Nacionalidad:</label>
                  <input type="text" value={nacionalidad} onChange={(e) => setNacionalidad(e.target.value)} className="form-control" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Dirección de Notificación:</label>
                  <input type="text" value={direccion_notificacion} onChange={(e) => setDireccion_notificacion(e.target.value)} className="form-control" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Dirección de Residencia:</label>
                  <input type="text" value={direccion_residencia} onChange={(e) => setDireccion_residencia(e.target.value)} className="form-control" />
                </div>
                <div className="mb-3 bg-light p-2 border rounded">
                  <label className="form-label fw-bold text-primary">¿Es obligatorio subir fotografía?</label>
                  <select value={fotoObligatoria} onChange={(e) => setFotoObligatoria(e.target.value)} className="form-select">
                    <option value="no">No, es opcional</option>
                    <option value="si">Sí, es totalmente obligatoria</option>
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Actualizar Fotografía:</label>
                  <input type="file" accept="image/*" onChange={handleFotoChange} className="form-control" />
                  {foto && (
                    <div className="mt-2 text-center">
                      <img src={foto} alt="Previsualización" className="img-thumbnail" style={{ maxHeight: '130px' }} />
                    </div>
                  )}
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
                <button type="button" className="btn btn-warning fw-bold" onClick={actualizar}>Actualizar Cambios</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Residentes;