import React, { useEffect, useState } from 'react';
import { generarPdfContrato } from '../utils/contractPdfGenerator';

/**
 * Componente para mostrar previsualización de PDF en tiempo real
 * Actualiza automáticamente cuando cambian los datos
 */
function PdfPreview({ datosContrato, datosResidente, mostrar = true }) {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!mostrar || !datosContrato.codigo_contrato || !datosResidente.id_residente) {
      return;
    }

    setCargando(true);
    try {
      // Generar PDF
      const doc = generarPdfContrato(datosContrato, datosResidente);
      
      // Convertir a blob y crear URL
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      
      // Limpiar URL anterior
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
      
      setPdfUrl(url);
    } catch (error) {
      console.error('Error al generar PDF preview:', error);
    } finally {
      setCargando(false);
    }
  }, [datosContrato, datosResidente, mostrar, pdfUrl]);

  if (!mostrar) {
    return null;
  }

  if (!datosContrato.codigo_contrato || !datosResidente.id_residente) {
    return (
      <div className="alert alert-info mt-3">
        <strong>ℹ️ Vista Previa del PDF:</strong> Completa los datos del contrato y residente para ver la previsualización
      </div>
    );
  }

  if (cargando) {
    return (
      <div className="alert alert-warning mt-3">
        <div className="spinner-border spinner-border-sm me-2" role="status">
          <span className="visually-hidden">Generando PDF...</span>
        </div>
        Generando PDF con los datos del residente...
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="card shadow-sm">
        <div className="card-header bg-info text-white fw-bold">
          📄 PREVISUALIZACIÓN DEL CONTRATO LEGAL
        </div>
        <div className="card-body p-0" style={{ height: '600px', overflow: 'auto' }}>
          {pdfUrl ? (
            <iframe
              src={pdfUrl}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                borderRadius: '0 0 0.25rem 0.25rem'
              }}
              title="Previsualización PDF"
            />
          ) : (
            <div className="alert alert-warning m-3">
              No se pudo generar la previsualización del PDF
            </div>
          )}
        </div>
        <div className="card-footer text-muted small">
          ✅ PDF actualizado en tiempo real - Los datos mostrados incluyen:
          <br />
          • Residente: <strong>{datosResidente.nombre || 'N/A'}</strong>
          • Identificación: <strong>{datosResidente.numero_identificacion || 'N/A'}</strong>
          • Código Contrato: <strong>{datosContrato.codigo_contrato || 'N/A'}</strong>
          • Monto: <strong>Q. {parseFloat(datosContrato.monto_total || 0).toLocaleString('es-GT', { minimumFractionDigits: 2 })}</strong>
          • Cuotas: <strong>{datosContrato.cuotas_pactadas || 'N/A'}</strong>
        </div>
      </div>
    </div>
  );
}

export default PdfPreview;
