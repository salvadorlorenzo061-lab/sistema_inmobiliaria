export const CONTRACT_TEMPLATES = [
  { id: 'FORMATO_01', label: 'Modelo 01 - Inversion Inmobiliaria (texto formato 1)' },
  { id: 'FORMATO_02', label: 'Modelo 02 - Norsur S.A. (texto formato 1)' },
  { id: 'FORMATO_03', label: 'Modelo 03 - Lotes de Inversion Real S.A. (texto formato 1)' },
  { id: 'FORMATO_04', label: 'Modelo 04 - JW S.A. (texto formato 1)' },
  { id: 'FORMATO_05', label: 'Modelo 05 - Corporativo alterno (texto formato 1)' },
  { id: 'FORMATO_06', label: 'Formato 06 - Pendiente de implementar' }
];

const DEFAULT_TEMPLATE_ID = CONTRACT_TEMPLATES[0].id;

const normalizeText = (value = '') => value
  .toString()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim();

export const isValidContractTemplateId = (templateId) =>
  CONTRACT_TEMPLATES.some((template) => template.id === templateId);

export const getContractTemplateLabel = (templateId) => {
  const template = CONTRACT_TEMPLATES.find((item) => item.id === templateId);
  return template ? template.label : CONTRACT_TEMPLATES[0].label;
};

export const resolveContractTemplateId = (input) => {
  if (isValidContractTemplateId(input)) {
    return input;
  }

  const normalized = normalizeText(input);
  if (!normalized) {
    return DEFAULT_TEMPLATE_ID;
  }

  const numberMatch = normalized.match(/(?:formato|plantilla|tipo)?\s*0?(\d{1,2})/);
  if (numberMatch) {
    const number = Number(numberMatch[1]);
    if (number >= 1 && number <= 6) {
      return `FORMATO_${String(number).padStart(2, '0')}`;
    }
  }

  const keywordMap = [
    { keyword: 'promesa', templateId: 'FORMATO_01' },
    { keyword: 'servicios varios', templateId: 'FORMATO_02' },
    { keyword: 'modelo 2', templateId: 'FORMATO_02' },
    { keyword: 'segundo modelo', templateId: 'FORMATO_02' },
    { keyword: 'norsur', templateId: 'FORMATO_02' },
    { keyword: 'lotes de inversion real', templateId: 'FORMATO_03' },
    { keyword: 'inversion real', templateId: 'FORMATO_03' },
    { keyword: 'jw s.a', templateId: 'FORMATO_04' },
    { keyword: 'jw', templateId: 'FORMATO_04' },
    { keyword: 'inversion inmobiliaria', templateId: 'FORMATO_01' },
    { keyword: 'texto formato 1', templateId: 'FORMATO_01' },
    { keyword: 'pendiente', templateId: 'FORMATO_06' },
    { keyword: 'modelo 6', templateId: 'FORMATO_06' }
  ];

  const byKeyword = keywordMap.find((entry) => normalized.includes(entry.keyword));
  if (byKeyword) {
    return byKeyword.templateId;
  }

  return DEFAULT_TEMPLATE_ID;
};
