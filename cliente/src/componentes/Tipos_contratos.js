import { useState, useEffect, useCallback } from 'react';
import Axios from "axios";
import 'bootstrap/dist/css/bootstrap.min.css';
import Swal from 'sweetalert2';
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { API_BASE_URL } from '../config';
import { getPaginatedData, PaginationControls } from '../utils/paginationUtils';

function TiposContrato() {
  const [id_tipo_contrato, setId_tipo_contrato] = useState(""); 
  const [nombre_contrato, setNombre_contrato] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [interes_moratorio, setInteres_moratorio] = useState("");
  const [estado, setEstado] = useState("activo");
  const [imagen, setImagen] = useState("");
  
  const [contratosList, setContratosList] = useState([]);
  const [busqueda, setBusqueda] = useState("");

  const [showRegModal, setShowRegModal] = useState(false);  
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10; 

  const API_URL = `${API_BASE_URL}/api/tipos_contratos`;
  const getNombreContrato = (item = {}) => item.nombre_contrato || item.nombre_tipo_contrato || '';

  // =========================================================================
  // 📄 REPORTE EN PDF: DOCUMENTO DE ESPECIFICACIÓN DE CONTRATO
  // =========================================================================
  const descargarPDFIndividual = (val) => {
    const doc = new jsPDF();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(40, 40, 40);
    doc.text("EMPRESA INMOBILIARIA S.A.", 14, 20);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text("Estructura de Modelos de Contratos Legalizados", 14, 25);

    doc.setFillColor(245, 247, 250); 
    doc.rect(130, 12, 66, 20, "F");  

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(41, 128, 185);  
    doc.text("FICHA DE CONTRATO", 133, 18);
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0); 
    doc.text(`ID REF: CTR-${val.id_tipo_contrato}`, 133, 26);

    doc.line(14, 35, 196, 35); 

    autoTable(doc, {
      startY: 45,
      head: [['REQUERIMIENTO ESTRUCTURAL', 'DETALLES DEL MODELO']],
      body: [
        ['ID CONTRATO', `CONTRATO-TIPO-${val.id_tipo_contrato}`],
        ['NOMBRE DEL MODELO', (val.nombre_contrato || 'N/A').toUpperCase()],
        ['DESCRIPCIÓN OPERATIVA', val.descripcion || 'Sin descripción técnica'],
        ['INTERÉS MORATORIO (%)', `${Number(val.interes_moratorio || 0).toFixed(2)} %`],
      ],
      theme: 'striped',
      headStyles: { fillColor: [41, 128, 185], fontSize: 10 },
      styles: { fontSize: 9.5, cellPadding: 5 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 60, textColor: [50, 50, 50] },
        1: { cellWidth: 122 }
      }
    });

    doc.save(`Ficha_Contrato_${val.id_tipo_contrato}.pdf`);
  };

  const handleImagenChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImagen(reader.result);
      reader.readAsDataURL(file);
    }
  };

  // =========================================================================
  //   CONTROLADORES CRUD
  // =========================================================================
  const getContratos = useCallback(() => {
    Axios.get(API_URL)
    .then((response) => { setContratosList(response.data); })
    .catch((error) => { console.error("Error al obtener contratos", error); });
  }, [API_URL]);

  useEffect(() => { getContratos(); }, [getContratos]);

  const add = () => {
    if (!nombre_contrato.trim() || !descripcion.trim()) {
      Swal.fire({
        position: "top-end",
        icon: "warning",
        title: 'FALTAN CAMPOS OBLIGATORIOS',
        text: 'Nombre y Descripción son requeridos',
        showConfirmButton: false,
        timer: 3000
      });
      return; 
    }

    Axios.post(`${API_URL}/crear`, {
      nombre_contrato,
      descripcion,
      interes_moratorio: interes_moratorio || 0,
      estado,
      imagen
    })
    .then(() => {
      getContratos();
      limpiarCampos();
      setShowRegModal(false);
      Swal.fire({
        position: "top-end",
        icon: "success",
        title: `¡Guardado!`,
        text: `El tipo de contrato se registró con éxito.`,
        showConfirmButton: false,
        timer: 3000
      });
    })
    .catch((error) => {
      Swal.fire({
        icon: 'error',
        title: "Error al guardar",
        text: error.response?.data?.message || 'Hubo un error en el sistema'
      });
    });
  };

  const actualizar = () => {
    if (!id_tipo_contrato || !nombre_contrato.trim() || !descripcion.trim()) {
      Swal.fire({ icon: 'warning', title: 'Campos obligatorios incompletos' });
      return;
    }

    Axios.put(`${API_URL}/actualizar`, {
      id_tipo_contrato,
      nombre_contrato,
      descripcion,
      interes_moratorio: interes_moratorio || 0,
      estado,
      imagen
    })
    .then(() => {
      getContratos();
      limpiarCampos();
      setShowEditModal(false);
      Swal.fire({
        icon: 'success',
        title: '¡Actualizado!',
        text: 'Registro modificado correctamente en la base de datos.',
        timer: 3000,
        showConfirmButton: false
      });
    })
    .catch((error) => {
      Swal.fire({ 
        icon: 'error', 
        title: 'Error al actualizar', 
        text: error.response?.data?.message || 'No se pudo completar la operación.' 
      });
    });
  };

  const deleteContrato = (val) => {
    Swal.fire({
      title: "Confirmar eliminación",
      html: `¿Desea eliminar permanentemente el contrato: <b>${val.nombre_contrato}</b>?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Sí, eliminar!",
      cancelButtonText: "Cancelar"
    }).then((result) => {
      if (result.isConfirmed) {
        Axios.delete(`${API_URL}/delete/${val.id_tipo_contrato}`)
        .then(() => {
          getContratos();
          Swal.fire('¡Eliminado!', 'El registro fue borrado.', 'success');
        })
        .catch(err => {
          Swal.fire({ icon: 'error', title: 'No se puede eliminar', text: err.response?.data || 'Error del sistema' });
        });
      }
    });
  };

  const limpiarCampos = () => {
    setId_tipo_contrato("");
    setNombre_contrato("");
    setDescripcion("");
    setInteres_moratorio("");
    setEstado("activo");
    setImagen("");
  };

  const abrirEditarModal = (val) => {
    setId_tipo_contrato(val.id_tipo_contrato);
    setNombre_contrato(getNombreContrato(val));
    setDescripcion(val.descripcion || "");
    setInteres_moratorio(val.interes_moratorio || "");
    setEstado(val.estado || "activo");
    setImagen(val.imagen || "");
    setShowEditModal(true);
  };

  const contratosFiltrados = contratosList.filter((item) => 
    getNombreContrato(item).toLowerCase().includes(busqueda.toLowerCase()) ||
    item.descripcion?.toLowerCase().includes(busqueda.toLowerCase())
  );

  const handleBusquedaChange = (e) => {
    setBusqueda(e.target.value);
    setCurrentPage(1);
  };

  const { paginatedItems: contratosPaginados, totalPages, startIndex, endIndex } = getPaginatedData(contratosFiltrados, currentPage, itemsPerPage);

  return (
    <div className='container mt-4'>
      <div className="module-header">
      {/* CABECERA */}
      <div className="row align-items-center bg-light p-3 rounded shadow-sm">
        <div className="col-md-4">
          <h3 className="m-0 text-dark fw-bold">TIPOS DE CONTRATO</h3>
        </div>
        <div className="col-md-5">
          <div className="input-group">
            <span className="input-group-text bg-primary text-white">🔍</span>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Buscar por nombre o descripción..." 
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
            ➕ NUEVO TIPO CONTRATO
          </button>
        </div>
      </div>
      </div>
      
      {/* TABLA */}
      <table className="table table-striped table-bordered align-middle shadow-sm">
        <thead className="table-dark">
          <tr>
            <th>ID</th>
            <th>IMAGEN</th>
            <th>NOMBRE DEL CONTRATO</th>
            <th>DESCRIPCIÓN</th>
            <th>INTERÉS MORATORIO</th>
            <th>ACCIONES</th>
          </tr>
        </thead>
        <tbody>
          {contratosPaginados.length > 0 ? (
            contratosPaginados.map((val) => (
              <tr key={val.id_tipo_contrato}>
                <td className="fw-bold">{val.id_tipo_contrato}</td>
                <td>
                  {val.imagen ? (
                    <img src={val.imagen} alt={getNombreContrato(val)} style={{ width: '60px', height: '45px', objectFit: 'cover', borderRadius: '6px' }} />
                  ) : (
                    <span className="text-muted">Sin imagen</span>
                  )}
                </td>
                <td className="fw-bold text-primary">{getNombreContrato(val)}</td>
                <td>{val.descripcion}</td>
                <td className="fw-bold text-danger">
                  {Number(val.interes_moratorio || 0).toFixed(2)} %
                </td>
                <td>
                  <div className="btn-group" role="group">
                    <button type="button" onClick={() => abrirEditarModal(val)} className="btn btn-info btn-sm m-1 fw-bold">ACTUALIZAR</button>
                    <button type="button" onClick={() => deleteContrato(val)} className="btn btn-danger btn-sm m-1 fw-bold">ELIMINAR</button>
                    <button type="button" onClick={() => descargarPDFIndividual(val)} className="btn btn-secondary btn-sm m-1 fw-bold">📄 PDF</button>
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="6" className="text-center text-muted py-3">No hay tipos de contrato registrados.</td>
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
        itemsCount={contratosFiltrados.length}
      />

      {/* 1. MODAL REGISTRO */}
      {showRegModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content shadow-lg">
              <div className="modal-header bg-success text-white">
                <h5 className="modal-title fw-bold">Registrar Tipo de Contrato</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => { setShowRegModal(false); limpiarCampos(); }}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-bold">Nombre del Contrato:</label>
                  <input type="text" value={nombre_contrato} onChange={(e) => setNombre_contrato(e.target.value)} className="form-control" placeholder="Ej: Contrato de Promesa de Compraventa" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Descripción / Términos Generales:</label>
                  <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="form-control" placeholder="Escribe las especificaciones del modelo de contrato..." rows="3"></textarea>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Porcentaje de Interés Moratorio (%):</label>
                  <input type="number" value={interes_moratorio} onChange={(e) => setInteres_moratorio(e.target.value)} className="form-control" placeholder="0.00" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Imagen del tipo de contrato:</label>
                  <input type="file" accept="image/*" onChange={handleImagenChange} className="form-control" />
                  {imagen && <img src={imagen} alt="Vista previa" className="mt-2 rounded" style={{ maxHeight: '120px', objectFit: 'cover' }} />}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowRegModal(false); limpiarCampos(); }}>Cancelar</button>
                <button type="button" className="btn btn-success fw-bold" onClick={add}>Guardar Contrato</button>
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
                <h5 className="modal-title fw-bold">Actualizar Modelo #{id_tipo_contrato}</h5>
                <button type="button" className="btn-close" onClick={() => { setShowEditModal(false); limpiarCampos(); }}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-bold">Nombre del Contrato:</label>
                  <input type="text" value={nombre_contrato} onChange={(e) => setNombre_contrato(e.target.value)} className="form-control" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Descripción:</label>
                  <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="form-control" rows="3"></textarea>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Interés Moratorio (%):</label>
                  <input type="number" value={interes_moratorio} onChange={(e) => setInteres_moratorio(e.target.value)} className="form-control" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Imagen del tipo de contrato:</label>
                  <input type="file" accept="image/*" onChange={handleImagenChange} className="form-control" />
                  {imagen ? <img src={imagen} alt="Vista previa" className="mt-2 rounded" style={{ maxHeight: '120px', objectFit: 'cover' }} /> : null}
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

export default TiposContrato;