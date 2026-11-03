// 📄 UTILIDADES DE PAGINACIÓN - Reutilizable en todos los módulos

/**
 * Calcula los datos paginados de una lista filtrada
 * @param {Array} items - Lista de items filtrados
 * @param {Number} currentPage - Página actual (1-indexed)
 * @param {Number} itemsPerPage - Items por página (default: 10)
 * @returns {Object} { paginatedItems, totalPages, startIndex, endIndex }
 */
export const getPaginatedData = (items, currentPage, itemsPerPage = 10) => {
  const safeItems = Array.isArray(items) ? items : [];
  const safeItemsPerPage = Math.max(Number(itemsPerPage) || 10, 1);
  const totalPages = Math.ceil(safeItems.length / safeItemsPerPage);
  const effectiveTotalPages = Math.max(totalPages, 1);
  const safeCurrentPage = Math.min(Math.max(Number(currentPage) || 1, 1), effectiveTotalPages);
  const startIndex = safeItems.length ? (safeCurrentPage - 1) * safeItemsPerPage : 0;
  const endIndex = startIndex + safeItemsPerPage;
  const paginatedItems = safeItems.slice(startIndex, endIndex);

  return {
    paginatedItems,
    totalPages,
    startIndex,
    endIndex,
    itemsCount: safeItems.length,
    currentPage: safeCurrentPage
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
  totalItems,
  itemLabel = 'registros',
  className = ''
}) => {
  const effectiveTotalPages = Math.max(1, totalPages || 0);
  const safeCurrentPage = Math.min(Math.max(currentPage || 1, 1), effectiveTotalPages);
  const totalCount = Number.isFinite(Number(itemsCount)) ? Number(itemsCount) : Number(totalItems || 0);
  const hasData = totalCount > 0;
  const visibleStart = hasData ? startIndex + 1 : 0;
  const visibleEnd = hasData ? Math.min(endIndex, totalCount) : 0;
  const goToPage = (page) => {
    const targetPage = Math.min(Math.max(Number(page) || 1, 1), effectiveTotalPages);
    onPageChange(targetPage);
  };

  // Ventana de paginas: 1 ... actual-1, actual, actual+1 ... ultima
  const paginasVisibles = [];
  const agregarPagina = (valor) => {
    if (paginasVisibles[paginasVisibles.length - 1] !== valor) paginasVisibles.push(valor);
  };
  for (let pagina = 1; pagina <= effectiveTotalPages; pagina += 1) {
    const cercana = Math.abs(pagina - safeCurrentPage) <= 1;
    if (pagina === 1 || pagina === effectiveTotalPages || cercana) {
      agregarPagina(pagina);
    } else {
      agregarPagina(pagina < safeCurrentPage ? 'inicio...' : 'fin...');
    }
  }

  return (
    <div className={`pagination-bar d-flex justify-content-between align-items-center flex-wrap gap-2 mt-4 p-3 bg-light rounded ${className}`.trim()}>
      <span className="text-muted fw-bold pagination-summary">
        Mostrando {visibleStart}-{visibleEnd} de {totalCount} {itemLabel}
      </span>
      <nav aria-label="Paginación">
        <ul className="pagination pagination-sm m-0 flex-wrap justify-content-center">
          <li className={`page-item ${safeCurrentPage === 1 ? 'disabled' : ''}`}>
            <button type="button" className="page-link" onClick={() => goToPage(1)} disabled={safeCurrentPage === 1} aria-label="Primera página">
              ««
            </button>
          </li>
          <li className={`page-item ${safeCurrentPage === 1 ? 'disabled' : ''}`}>
            <button type="button" className="page-link" onClick={() => goToPage(safeCurrentPage - 1)} disabled={safeCurrentPage === 1} aria-label="Página anterior">
              «
            </button>
          </li>
          {paginasVisibles.map((page) => (
            typeof page === 'string' ? (
              <li key={page} className="page-item disabled">
                <span className="page-link">…</span>
              </li>
            ) : (
              <li key={page} className={`page-item ${safeCurrentPage === page ? 'active' : ''}`}>
                <button type="button" className="page-link" onClick={() => goToPage(page)}>
                  {page}
                </button>
              </li>
            )
          ))}
          <li className={`page-item ${safeCurrentPage === effectiveTotalPages ? 'disabled' : ''}`}>
            <button type="button" className="page-link" onClick={() => goToPage(safeCurrentPage + 1)} disabled={safeCurrentPage === effectiveTotalPages} aria-label="Página siguiente">
              »
            </button>
          </li>
          <li className={`page-item ${safeCurrentPage === effectiveTotalPages ? 'disabled' : ''}`}>
            <button type="button" className="page-link" onClick={() => goToPage(effectiveTotalPages)} disabled={safeCurrentPage === effectiveTotalPages} aria-label="Última página">
              »»
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
};
