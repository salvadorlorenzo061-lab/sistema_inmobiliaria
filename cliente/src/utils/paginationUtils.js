// 📄 UTILIDADES DE PAGINACIÓN - Reutilizable en todos los módulos

/**
 * Calcula los datos paginados de una lista filtrada
 * @param {Array} items - Lista de items filtrados
 * @param {Number} currentPage - Página actual (1-indexed)
 * @param {Number} itemsPerPage - Items por página (default: 10)
 * @returns {Object} { paginatedItems, totalPages, startIndex, endIndex }
 */
export const getPaginatedData = (items, currentPage, itemsPerPage = 10) => {
  const totalPages = Math.ceil(items.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedItems = items.slice(startIndex, endIndex);

  return {
    paginatedItems,
    totalPages,
    startIndex,
    endIndex,
    itemsCount: items.length
  };
};

/**
 * Componente reutilizable de controles de paginación
 */
export const PaginationControls = ({ 
  currentPage, 
  totalPages, 
  onPageChange, 
  startIndex, 
  endIndex, 
  itemsCount,
  itemLabel = 'registros',
  className = ''
}) => {
  const effectiveTotalPages = Math.max(1, totalPages || 0);
  const safeCurrentPage = Math.min(Math.max(currentPage || 1, 1), effectiveTotalPages);
  const hasData = itemsCount > 0;
  const visibleStart = hasData ? startIndex + 1 : 0;
  const visibleEnd = hasData ? Math.min(endIndex, itemsCount) : 0;

  return (
    <div className={`d-flex justify-content-between align-items-center mt-4 p-3 bg-light rounded ${className}`.trim()}>
      <span className="text-muted fw-bold">
        Mostrando {visibleStart}-{visibleEnd} de {itemsCount} {itemLabel}
      </span>
      <nav>
        <ul className="pagination m-0">
          <li className={`page-item ${safeCurrentPage === 1 ? 'disabled' : ''}`}>
            <button className="page-link" onClick={() => onPageChange(1)} disabled={safeCurrentPage === 1}>
              «« Primera
            </button>
          </li>
          <li className={`page-item ${safeCurrentPage === 1 ? 'disabled' : ''}`}>
            <button className="page-link" onClick={() => onPageChange(safeCurrentPage - 1)} disabled={safeCurrentPage === 1}>
              « Anterior
            </button>
          </li>
          {Array.from({ length: effectiveTotalPages }, (_, i) => i + 1).map((page) => (
            <li key={page} className={`page-item ${safeCurrentPage === page ? 'active' : ''}`}>
              <button className="page-link" onClick={() => onPageChange(page)}>
                {page}
              </button>
            </li>
          ))}
          <li className={`page-item ${safeCurrentPage === effectiveTotalPages ? 'disabled' : ''}`}>
            <button className="page-link" onClick={() => onPageChange(safeCurrentPage + 1)} disabled={safeCurrentPage === effectiveTotalPages}>
              Siguiente »
            </button>
          </li>
          <li className={`page-item ${safeCurrentPage === effectiveTotalPages ? 'disabled' : ''}`}>
            <button className="page-link" onClick={() => onPageChange(effectiveTotalPages)} disabled={safeCurrentPage === effectiveTotalPages}>
              Última »»
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
};
