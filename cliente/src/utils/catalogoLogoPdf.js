import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export const getLogoValidation = (logoData = '') => {
  if (!logoData) return { isValid: true, message: '', format: '' };
  if (typeof logoData !== 'string') {
    return { isValid: false, message: 'El logo no tiene un formato válido.', format: '' };
  }

  const match = logoData.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,/i);
  if (!match) {
    return { isValid: false, message: 'Logo inválido: debe estar en Base64 (data:image/...).', format: '' };
  }

  const format = match[1].toLowerCase();
  if (!['png', 'jpg', 'jpeg', 'webp'].includes(format)) {
    return { isValid: false, message: 'Formato no soportado para PDF. Usa PNG, JPG o WEBP.', format };
  }
  return { isValid: true, message: '', format };
};

export const leerImagenComoBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const formatoImagenPdf = (dataUrl) => {
  const match = String(dataUrl || '').match(/^data:image\/([a-zA-Z0-9+.-]+);base64,/i);
  const f = (match?.[1] || 'png').toUpperCase();
  return f === 'JPG' ? 'JPEG' : f;
};

// datos: [[etiqueta, valor]]; tabla opcional con detalle relacionado.
export const generarPdfFicha = ({ titulo, logo, datos, tablaTitulo, tablaEncabezados, tablaFilas, nombreArchivo }) => {
  const doc = new jsPDF('p', 'mm', 'letter');
  const pageWidth = doc.internal.pageSize.getWidth();

  if (logo && getLogoValidation(logo).isValid) {
    try {
      doc.addImage(logo, formatoImagenPdf(logo), 14, 10, 36, 22, undefined, 'FAST');
    } catch {
      // logo ilegible: se omite
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(28, 46, 64);
  doc.text('GRUPO DE INVERSIONES', pageWidth / 2, 18, { align: 'center' });
  doc.setFontSize(12);
  doc.text(titulo, pageWidth / 2, 26, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Fecha: ${new Date().toLocaleDateString('es-GT')}`, pageWidth - 14, 12, { align: 'right' });

  autoTable(doc, {
    startY: 38,
    body: datos.map(([etiqueta, valor]) => [etiqueta, String(valor ?? '')]),
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2.5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55, fillColor: [244, 246, 248] } }
  });

  if (Array.isArray(tablaFilas)) {
    const y = doc.lastAutoTable.finalY + 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(tablaTitulo || 'Detalle', 14, y);
    autoTable(doc, {
      startY: y + 3,
      head: [tablaEncabezados],
      body: tablaFilas.length ? tablaFilas : [[{ content: 'Sin registros.', colSpan: tablaEncabezados.length, styles: { halign: 'center' } }]],
      theme: 'grid',
      headStyles: { fillColor: [28, 46, 64], fontSize: 8 },
      styles: { fontSize: 8 }
    });
  }

  doc.save(nombreArchivo);
};
