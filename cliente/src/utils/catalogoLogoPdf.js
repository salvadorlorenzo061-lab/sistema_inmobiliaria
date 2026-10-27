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

// filas: [{ logo, celdas: [...] }]; la primera columna del PDF es el logo.
export const generarPdfListadoConLogo = ({ titulo, encabezados, filas, nombreArchivo }) => {
  const doc = new jsPDF('l', 'mm', 'letter');
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(28, 46, 64);
  doc.text('GRUPO DE INVERSIONES', pageWidth / 2, 14, { align: 'center' });
  doc.setFontSize(12);
  doc.text(titulo, pageWidth / 2, 21, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Fecha: ${new Date().toLocaleDateString('es-GT')}   |   Registros: ${filas.length}`, pageWidth / 2, 26, { align: 'center' });

  autoTable(doc, {
    startY: 30,
    head: [['Logo', ...encabezados]],
    body: filas.map((fila) => ['', ...fila.celdas]),
    theme: 'grid',
    headStyles: { fillColor: [28, 46, 64], fontSize: 8 },
    styles: { fontSize: 8, valign: 'middle', minCellHeight: 14 },
    columnStyles: { 0: { cellWidth: 24 } },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 0) return;
      const logo = filas[data.row.index]?.logo;
      if (!logo || !getLogoValidation(logo).isValid) return;
      try {
        doc.addImage(logo, formatoImagenPdf(logo), data.cell.x + 2, data.cell.y + 1.5, 20, 11, undefined, 'FAST');
      } catch {
        // logo ilegible: se deja la celda vacia
      }
    }
  });

  doc.save(nombreArchivo);
};
