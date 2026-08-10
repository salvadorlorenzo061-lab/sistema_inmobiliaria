import jsPDF from 'jspdf';

const normalizarTexto = (valor, fallback = '') => String(valor || fallback).trim();

const formatearMoneda = (valor) => Number(valor || 0).toLocaleString('es-GT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const formatearFechaLarga = (fecha = new Date()) => new Intl.DateTimeFormat('es-GT', {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
}).format(fecha);

export const generarPdfFiniquito = (contrato = {}) => {
  const doc = new jsPDF('p', 'mm', 'letter');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 18;
  const marginRight = 18;
  const textWidth = pageWidth - marginLeft - marginRight;
  let y = 22;

  const drawBorder = () => {
    doc.setDrawColor(180, 140, 0);
    doc.setLineWidth(1.5);
    doc.rect(10, 10, pageWidth - 20, pageHeight - 20);
    doc.setLineWidth(0.5);
    doc.rect(12, 12, pageWidth - 24, pageHeight - 24);
  };

  const addParagraph = (text, spacing = 4) => {
    const lines = doc.splitTextToSize(text, textWidth);
    doc.setFont('Times', 'normal');
    doc.setFontSize(11);
    doc.text(lines, marginLeft, y, { align: 'justify', maxWidth: textWidth, lineHeightFactor: 1.35 });
    y += (lines.length * 5.2) + spacing;
  };

  const codigo = normalizarTexto(contrato.codigo_contrato, `CONTRATO-${contrato.id_contrato || ''}`);
  const comprador = normalizarTexto(contrato.nombre_residente, 'PARTE COMPRADORA').toUpperCase();
  const identificacion = normalizarTexto(contrato.numero_identificacion, 'NO REGISTRADA');
  const empresa = normalizarTexto(contrato.nombre_marca_pdf || contrato.nombre_empresa_marca, 'LA PARTE VENDEDORA').toUpperCase();
  const proyecto = normalizarTexto(contrato.nombre_proyecto_pdf || contrato.nombre_proyecto, 'PROYECTO INMOBILIARIO').toUpperCase();
  const monto = formatearMoneda(contrato.monto_total);
  const fechaEmision = formatearFechaLarga(new Date());

  drawBorder();
  doc.setFont('Times', 'bold');
  doc.setFontSize(16);
  doc.text('FINIQUITO DE PAGO', pageWidth / 2, y, { align: 'center' });
  y += 10;
  doc.setFontSize(11);
  doc.text(`CONTRATO ${codigo}`, pageWidth / 2, y, { align: 'center' });
  y += 14;

  addParagraph(
    `En la ciudad de Guatemala, el ${fechaEmision}, ${empresa}, en su calidad de parte vendedora, ` +
    `hace constar que ${comprador}, identificado con el numero ${identificacion}, ha cancelado en su totalidad ` +
    `las obligaciones de pago correspondientes al contrato identificado con el codigo ${codigo}.`
  );

  addParagraph(
    `El contrato relacionado corresponde al proyecto ${proyecto}, por un precio contractual registrado de ` +
    `Q ${monto}. En consecuencia, se extiende el presente FINIQUITO DE PAGO como constancia de que no existe ` +
    `saldo pendiente por capital, cuotas ordinarias o intereses contractuales vinculados a dicha obligacion, ` +
    `segun los registros verificados por la parte vendedora a la fecha de emision.`
  );

  addParagraph(
    `Este finiquito acredita exclusivamente la cancelacion de las obligaciones de pago del contrato indicado. ` +
    `No sustituye la escritura publica, inscripcion registral, entrega material ni cualquier otro acto legal que ` +
    `corresponda realizar conforme al contrato y a la legislacion aplicable.`
  );

  addParagraph(
    `Para constancia, las partes aceptan el contenido del presente documento y lo firman en dos ejemplares del ` +
    `mismo tenor, quedando uno en poder de cada parte.`
  );

  y = Math.max(y + 22, 178);
  doc.setDrawColor(40, 40, 40);
  doc.line(marginLeft, y, marginLeft + 72, y);
  doc.line(pageWidth - marginRight - 72, y, pageWidth - marginRight, y);
  y += 7;
  doc.setFont('Times', 'bold');
  doc.setFontSize(10);
  doc.text(empresa, marginLeft + 36, y, { align: 'center', maxWidth: 72 });
  doc.text(comprador, pageWidth - marginRight - 36, y, { align: 'center', maxWidth: 72 });
  y += 11;
  doc.setFont('Times', 'normal');
  doc.text('PARTE VENDEDORA', marginLeft + 36, y, { align: 'center' });
  doc.text('PARTE COMPRADORA', pageWidth - marginRight - 36, y, { align: 'center' });

  y += 30;
  doc.line((pageWidth / 2) - 38, y, (pageWidth / 2) + 38, y);
  y += 7;
  doc.text('TESTIGO / REPRESENTANTE AUTORIZADO', pageWidth / 2, y, { align: 'center' });

  return doc;
};

export const descargarPdfFiniquito = (contrato = {}) => {
  const doc = generarPdfFiniquito(contrato);
  const codigo = normalizarTexto(contrato.codigo_contrato, 'contrato').replace(/[^A-Za-z0-9_-]/g, '_');
  doc.save(`Finiquito_${codigo}.pdf`);
};