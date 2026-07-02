import { useState, useEffect, useCallback } from 'react';
import Axios from "axios";
import { API_BASE_URL } from '../config';
import 'bootstrap/dist/css/bootstrap.min.css';
import { getPaginatedData, PaginationControls } from '../utils/paginationUtils';

function Bitacora() {
  const [bitacoraList, setBitacoraList] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const API_URL = `${API_BASE_URL}/api/bitacora`;

  const esEstadoFallido = (estado) => {
    const valor = String(estado || '').toLowerCase();
    return ['fallido', 'error', 'advertencia', 'warning', 'failed'].includes(valor);
  };

  const getEtiquetaAccion = (accion) => {
    const valor = String(accion || '').toLowerCase();
    if (['post', 'create', 'creado'].includes(valor)) return 'CREADO';
    if (['put', 'patch', 'update', 'guardado'].includes(valor)) return 'GUARDADO';
    if (['delete', 'eliminado'].includes(valor)) return 'ELIMINADO';
    return (accion || 'N/A').toUpperCase();
  };

  const getBitacora = useCallback(() => {
    Axios.get(API_URL)
    .then((response) => { setBitacoraList(response.data); })
    .catch((error) => { console.error("Error al obtener auditoría", error); });
  }, [API_URL]);

  useEffect(() => { getBitacora(); }, [getBitacora]);

  // Filtrado combinado: Barra de búsqueda + Selector de Estado (Éxito / Fallido)
  const registrosFiltrados = bitacoraList.filter((item) => {
    const coincideBusqueda = 
      (item.nombre_usuario && item.nombre_usuario.toLowerCase().includes(busqueda.toLowerCase())) ||
      (item.accion && item.accion.toLowerCase().includes(busqueda.toLowerCase())) ||
      (item.descripcion && item.descripcion.toLowerCase().includes(busqueda.toLowerCase()));
      
    const coincideEstado = filtroEstado === "todos"
      ? true
      : (filtroEstado === 'fallido'
          ? esEstadoFallido(item.estado)
          : String(item.estado || '').toLowerCase() === filtroEstado.toLowerCase());

    return coincideBusqueda && coincideEstado;
  });

  // Paginación
  const { paginatedItems: registrosPaginados, totalPages, startIndex, endIndex } = getPaginatedData(registrosFiltrados, currentPage, itemsPerPage);

  const handleBusquedaChange = (e) => {
    setBusqueda(e.target.value);
    setCurrentPage(1);
  };

  const handleFiltroChange = (e) => {
    setFiltroEstado(e.target.value);
    setCurrentPage(1);
  };

  return (
    <div className='container mt-4'>
      <div className="module-header">
      {/* CABECERA Y PANEL DE CONTROL */}
      <div className="row align-items-center bg-dark text-white p-3 rounded shadow-sm">
        <div className="col-md-4">
          <h3 className="m-0 fw-bold text-warning">🛡️ BITÁCORA DE AUDITORÍA</h3>
          <small className="text-muted">Historial estricto de operaciones de TI</small>
        </div>
        
        {/* Input de búsqueda */}
        <div className="col-md-5">
          <div className="input-group">
            <span className="input-group-text bg-secondary text-white">🔍</span>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Buscar por usuario, acción o detalles..." 
              value={busqueda}
              onChange={handleBusquedaChange}
            />
          </div>
        </div>

        {/* Filtro por estado del log */}
        <div className="col-md-3">
          <select 
            className="form-select bg-secondary text-white border-0" 
            value={filtroEstado} 
            onChange={handleFiltroChange}
          >
            <option value="todos">👁️ Ver Todos los Estados</option>
            <option value="exitoso">✅ Éxitosos / Correctos</option>
            <option value="fallido">❌ Advertencias / Fallidos</option>
          </select>
        </div>
      </div>
      </div>
      
      {/* TABLA PRINCIPAL DE DATOS */}
      <div className="table-responsive shadow-sm rounded">
        <table className="table table-hover table-striped table-bordered align-middle m-0">
          <thead className="table-secondary text-uppercase fs-7 text-center">
            <tr>
              <th>ID LOG</th>
              <th>FECHA / HORA</th>
              <th>USUARIO ACTOR</th>
              <th>ROL ASOCIADO</th>
              <th>ACCIÓN / MÓDULO</th>
              <th>DESCRIPCIÓN OPERATIVA</th>
              <th>DIRECCIÓN IP</th>
              <th>ESTADO</th>
            </tr>
          </thead>
          <tbody>{registrosPaginados.length > 0 ? registrosPaginados.map((val) => (<tr key={val.id_bitacora} className={(esEstadoFallido(val.estado) || val.estado === null) ? 'table-danger' : ''}><th className="text-center">#{val.id_bitacora}</th><td className="text-center text-nowrap" style={{ fontSize: '0.85rem' }}>{new Date(val.fecha).toLocaleDateString()}<br /><span className="text-muted">{new Date(val.fecha).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</span></td><td><strong className="text-dark">{(val.nombre_usuario || 'DESCONOCIDO').toUpperCase()}</strong><br /><small className="text-muted">ID Empleado: #{val.id_usuario}</small></td><td className="text-center"><span className="badge bg-light text-dark border">{val.nombre_rol || `Rol #${val.id_rol}`}</span></td><td><span className="badge bg-primary text-wrap text-start">{getEtiquetaAccion(val.accion)}</span></td><td style={{ fontSize: '0.9rem' }} className="text-secondary">{val.descripcion || '-'}</td><td className="text-center text-monospace text-muted" style={{ fontSize: '0.85rem' }}><code>{val.ip_direccion || '127.0.0.1'}</code></td><td className="text-center"><span className={`badge rounded-pill ${esEstadoFallido(val.estado) ? 'bg-danger' : 'bg-success'}`}>{esEstadoFallido(val.estado) ? '⚠️ FAIL' : '✅ OK'}</span></td></tr>)) : (<tr><td colSpan="8" className="text-center text-muted py-4 fs-5">No se registran firmas de auditoría bajo los criterios ingresados.</td></tr>)}</tbody>
        </table>
      </div>

      {/* PAGINACIÓN */}
      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        startIndex={startIndex}
        endIndex={endIndex}
        itemsCount={registrosFiltrados.length}
      />

    </div>
  );
}

export default Bitacora;