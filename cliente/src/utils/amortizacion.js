const numeroSeguro = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const redondearMoneda = (value) => (
  Math.round((numeroSeguro(value, 0) + Number.EPSILON) * 100) / 100
);

// ============================================================================
// SISTEMA LINEAL OFICIAL DE AMORTIZACION (capital fijo + interes fijo)
// ============================================================================
// UNICA formula de calculo de cuotas del sistema (la misma de las tablas PDF
// oficiales). Regla global obligatoria:
//   1) Capital fijo por mes: se amortiza la misma cantidad de capital en cada
//      cuota (Ej: Q170,000 / 24 = Q7,083.67 fijos cada mes).
//   2) Interes fijo por mes: capital inicial financiado x tasa mensual
//      (Ej: Q170,000 x 14% / 12 = Q1,983.33 fijos cada mes).
//   3) Cuota total mensual: capital fijo + interes fijo, identica cada mes
//      (Ej: Q7,083.67 + Q1,983.33 = Q9,067.00).
//   4) El saldo de capital baja linealmente restando el abono fijo y la
//      ultima cuota ajusta el residuo para cerrar exactamente en cero.
// El backend replica esta misma logica en server/utils/amortizacion.js.
// NO usar formulas de interes compuesto / Sistema Frances.
// ============================================================================

// Interes fijo mensual del plan: capital inicial financiado x tasa anual / 12.
export const calcularInteresFijoMensual = (capital, tasaAnual) => {
  const principal = Math.round(Math.max(numeroSeguro(capital, 0), 0));
  const tasa = Math.max(numeroSeguro(tasaAnual, 0), 0);
  return redondearMoneda((principal * (tasa / 100)) / 12);
};

// Cuota fija mensual: techo((capital + interes total del plan) / cuotas).
// Con tasa 0% equivale a techo(capital / cuotas).
export const calcularCuotaFija = (capital, tasaAnual, cuotas) => {
  const principal = Math.round(Math.max(numeroSeguro(capital, 0), 0));
  const plazo = Math.max(parseInt(cuotas || 0, 10), 0);
  const tasa = Math.max(numeroSeguro(tasaAnual, 0), 0);

  if (principal <= 0 || plazo <= 0) return 0;

  const interesTotal = principal * (tasa / 100) * (plazo / 12);
  return Math.ceil((principal + interesTotal) / plazo);
};

// Una cuota personalizada (pactada manualmente) solo se respeta si amortiza
// el plan completo dentro del plazo (regla historica del sistema).
const resolverCuotaFijaPlan = (principal, tasa, plazo, cuotaPersonalizada = 0) => {
  const calculada = calcularCuotaFija(principal, tasa, plazo);
  const totalFinanciado = principal + principal * (Math.max(numeroSeguro(tasa, 0), 0) / 100) * (plazo / 12);
  const personalizada = Math.round(Math.max(numeroSeguro(cuotaPersonalizada, 0), 0));
  const personalizadaValida = personalizada > 0
    && (plazo <= 1 || personalizada * (plazo - 1) < totalFinanciado);
  return personalizadaValida ? personalizada : calculada;
};

export const generarTablaAmortizacion = (capital, tasaAnual, cuotas, cuotaInicial = 0, cuotaFijaPersonalizada = 0) => {
  const principal = Math.round(Math.max(numeroSeguro(capital, 0), 0));
  const plazo = Math.max(parseInt(cuotas || 0, 10), 0);
  const tasa = Math.max(numeroSeguro(tasaAnual, 0), 0);
  const numeroBase = Math.max(parseInt(cuotaInicial || 0, 10), 0);
  if (principal <= 0 || plazo <= 0) return [];

  // Capital fijo e interes fijo identicos en TODAS las cuotas; el capital de
  // la ultima cuota ajusta el saldo para cerrar exactamente en cero.
  const interesMesFijo = calcularInteresFijoMensual(principal, tasa);
  const cuotaFija = resolverCuotaFijaPlan(principal, tasa, plazo, cuotaFijaPersonalizada);
  const tabla = [];
  let saldo = principal;
  let interesAcumulado = 0;

  for (let indice = 1; indice <= plazo; indice += 1) {
    const esUltimaCuota = indice === plazo;
    const interesMes = interesMesFijo;
    const capitalCuota = esUltimaCuota
      ? redondearMoneda(saldo)
      : redondearMoneda(Math.min(Math.max(cuotaFija - interesMes, 0), saldo));
    const pago = esUltimaCuota ? redondearMoneda(capitalCuota + interesMes) : cuotaFija;
    const saldoFinal = redondearMoneda(Math.max(saldo - capitalCuota, 0));
    interesAcumulado = redondearMoneda(interesAcumulado + interesMes);

    tabla.push({
      indice,
      numero_cuota: numeroBase + indice,
      saldo_inicial: saldo,
      capital_cuota: capitalCuota,
      interes_mes: interesMes,
      cuota_estimada: pago,
      saldo_final: saldoFinal,
      interes_acumulado: interesAcumulado
    });
    saldo = saldoFinal;
  }

  return tabla;
};

// Total del plan (capital + intereses): capital + interes fijo mensual x n.
// Coincide con la suma de las cuotas de la tabla de amortizacion.
export const calcularTotalPlanPlano = (capital, tasaAnual, cuotas) => {
  const principal = Math.round(Math.max(numeroSeguro(capital, 0), 0));
  const plazo = Math.max(parseInt(cuotas || 0, 10), 0);
  if (principal <= 0 || plazo <= 0) return 0;
  return redondearMoneda(principal + calcularInteresFijoMensual(principal, tasaAnual) * plazo);
};
