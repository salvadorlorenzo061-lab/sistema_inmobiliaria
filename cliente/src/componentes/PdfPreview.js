import React, { useEffect, useRef, useState } from 'react';
import { generarPdfContrato } from '../utils/contractPdfGenerator';
import { getContractTemplateLabel, resolveContractTemplateId } from '../utils/contractTemplates';

const getSupportedLogoFormat = (logoData = '') => {
  if (!logoData || typeof logoData !== 'string') {
    return null;
  }

  const match = logoData.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,/i);
  if (!match) {
    return null;
  }

  const mimeType = match[1].toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp'].includes(mimeType)) {
    return mimeType;
  }

  return null;
};

/**
 * Componente para mostrar previsualización de PDF en tiempo real
 * Actualiza automáticamente cuando cambian los datos
 */
function PdfPreview({ datosContrato, datosResidente, mostrar = true, refreshKey = 0 }) {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [logoWarning, setLogoWarning] = useState('');
  const lastPdfUrlRef = useRef(null);
  const renderTokenRef = useRef(0);
  const datosContratoRef = useRef(datosContrato);
  const datosResidenteRef = useRef(datosResidente);
  const formatoSeleccionado = getContractTemplateLabel(resolveContractTemplateId(datosContrato.formato_contrato));
  const brandingMode = datosContrato.modo_marca_empresa || (datosContrato.mostrar_nombre_empresa ? 'logo_y_nombre' : 'solo_logo');
  const showLogoInFooter = ['solo_logo', 'logo_y_nombre', 'logo_centrado'].includes(brandingMode);
  const showNameInFooter = ['logo_y_nombre', 'solo_nombre'].includes(brandingMode);

  useEffect(() => {
    datosContratoRef.current = datosContrato;
    datosResidenteRef.current = datosResidente;
  }, [datosContrato, datosResidente]);

  useEffect(() => {
    const renderToken = ++renderTokenRef.current;
    const contratoActual = datosContratoRef.current;
    const residenteActual = datosResidenteRef.current;

    if (!mostrar || !contratoActual.codigo_contrato || !residenteActual.id_residente) {
      if (lastPdfUrlRef.current) {
        URL.revokeObjectURL(lastPdfUrlRef.current);
        lastPdfUrlRef.current = null;
      }
      setPdfUrl(null);
      setLogoWarning('');
      return;
    }

    const logoData = contratoActual.empresa_logo || '';
    if (logoData) {
      const logoFormat = getSupportedLogoFormat(logoData);
      if (!logoFormat) {
        setLogoWarning('El logotipo de la empresa tiene un formato inválido o no soportado. Usa PNG, JPG o WEBP en Base64.');
      } else {
        setLogoWarning('');
      }
    } else {
      setLogoWarning('');
    }

    setCargando(true);
    setPdfUrl(null);
    try {
      // Generar PDF
      const doc = generarPdfContrato(contratoActual, residenteActual);
      
      // Convertir a blob y crear URL
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      
      // Limpiar URL anterior
      if (lastPdfUrlRef.current) {
        URL.revokeObjectURL(lastPdfUrlRef.current);
      }
      if (renderToken !== renderTokenRef.current) {
        URL.revokeObjectURL(url);
        return;
      }

      lastPdfUrlRef.current = url;
      
      setPdfUrl(url);
    } catch (error) {
      console.error('Error al generar PDF preview:', error);
      setPdfUrl(null);
      if (contratoActual.empresa_logo) {
        setLogoWarning('No se pudo renderizar el logotipo en el PDF. Verifica el archivo de logo de la empresa.');
      }
    } finally {
      if (renderToken === renderTokenRef.current) {
        setCargando(false);
      }
    }
  }, [refreshKey, mostrar]);

  useEffect(() => {
    return () => {
      if (lastPdfUrlRef.current) {
        URL.revokeObjectURL(lastPdfUrlRef.current);
      }
    };
  }, []);

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
        {logoWarning && (
          <div className="alert alert-warning m-3 mb-0">
            <strong>⚠️ Aviso de logotipo:</strong> {logoWarning}
            {datosContrato.empresa_nombre && (
              <>
                <br />
                <strong>Empresa:</strong> {datosContrato.empresa_nombre}
              </>
            )}
          </div>
        )}
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
          {showLogoInFooter && datosContrato.empresa_logo && (
            <div className="mb-2 d-flex align-items-center">
              <img
                src={datosContrato.empresa_logo}
                alt="Logo empresa"
                style={{ width: '45px', height: '30px', objectFit: 'contain', marginRight: '8px', backgroundColor: '#fff', borderRadius: '4px' }}
              />
              {showNameInFooter && datosContrato.empresa_nombre && (
                <span><strong>{datosContrato.empresa_nombre}</strong></span>
              )}
            </div>
          )}
          {!showLogoInFooter && showNameInFooter && datosContrato.empresa_nombre && (
            <div className="mb-2"><strong>{datosContrato.empresa_nombre}</strong></div>
          )}
          ✅ PDF actualizado en tiempo real - Los datos mostrados incluyen:
          <br />
          • Residente: <strong>{datosResidente.nombre || 'N/A'}</strong>
          • Identificación: <strong>{datosResidente.numero_identificacion || 'N/A'}</strong>
          • Código Contrato: <strong>{datosContrato.codigo_contrato || 'N/A'}</strong>
          {datosContrato.empresa_id && (
            <>
              <br />
              • Empresa PDF (ID): <strong>{datosContrato.empresa_id}</strong>
            </>
          )}
          • Formato: <strong>{formatoSeleccionado}</strong>
          • Monto: <strong>Q. {parseFloat(datosContrato.monto_total || 0).toLocaleString('es-GT', { minimumFractionDigits: 2 })}</strong>
          • Cuotas: <strong>{datosContrato.cuotas_pactadas || 'N/A'}</strong>
        </div>
      </div>
    </div>
  );
}

export default PdfPreview;
