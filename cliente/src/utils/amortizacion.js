const numeroSeguro = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const redondearMoneda = (value) => (
  Math.round((numeroSeguro(value, 0) + Number.EPSILON) * 100) / 100
);

// ============================================================================
// SISTEMA LINEAL OFICIAL (cuota absoluta fija + ajuste residual final)
// ============================================================================
// UNICA formula de calculo de cuotas del sistema (la misma de las tablas PDF
// oficiales). Regla global obligatoria:
//   1) Interes fijo mensual: capital original x tasa anual / 12.
//   2) Cuota mensual pactada; el excedente sobre el interes amortiza capital.
//   3) La ultima cuota usa el saldo residual y ajusta el interes para cerrar
//      el saldo en cero sin cambiar el total del plan.
// El backend replica esta misma logica en server/utils/amortizacion.js.
// NO usar formulas de interes compuesto / Sistema Frances.
// ============================================================================

// Interes fijo mensual del plan: capital inicial financiado x tasa anual / 12.
export const calcularInteresFijoMensual = (capital, tasaAnual) => {
  const principal = redondearMoneda(Math.max(numeroSeguro(capital, 0), 0));
  const tasa = Math.max(numeroSeguro(tasaAnual, 0), 0);
  return redondearMoneda((principal * (tasa / 100)) / 12);
};

// Total exacto del plan: capital + interes total (sin redondear cuotas).
export const calcularTotalPlanPlano = (capital, tasaAnual, cuotas) => {
  const principal = redondearMoneda(Math.max(numeroSeguro(capital, 0), 0));
  const plazo = Math.max(parseInt(cuotas || 0, 10), 0);
  const tasa = Math.max(numeroSeguro(tasaAnual, 0), 0);
  if (principal <= 0 || plazo <= 0) return 0;
  return redondearMoneda(principal + principal * (tasa / 100) * (plazo / 12));
};

// Cuota fija mensual ENTERA: piso(total del plan / cuotas). La ultima cuota
// absorbe el residuo con decimales.
export const calcularCuotaFija = (capital, tasaAnual, cuotas) => {
  const plazo = Math.max(parseInt(cuotas || 0, 10), 0);
  const total = calcularTotalPlanPlano(capital, tasaAnual, plazo);
  if (total <= 0 || plazo <= 0) return 0;
  const entera = Math.floor(total / plazo);
  return entera > 0 ? entera : redondearMoneda(total / plazo);
};

export const validarCuotaPersonalizada = (capital, tasaAnual, cuotas, cuotaPersonalizada) => {
  const principal = redondearMoneda(Math.max(numeroSeguro(capital, 0), 0));
  const tasa = Math.max(numeroSeguro(tasaAnual, 0), 0);
  const plazo = Math.max(parseInt(cuotas || 0, 10), 0);
  const personalizada = Math.round(Math.max(numeroSeguro(cuotaPersonalizada, 0), 0));
  if (personalizada <= 0 || principal <= 0 || plazo <= 1) return false;

  const interesMensual = calcularInteresFijoMensual(principal, tasa);
  const capitalPorCuota = redondearMoneda(personalizada - interesMensual);
  return capitalPorCuota > 0 && redondearMoneda(capitalPorCuota * (plazo - 1)) < principal;
};

// La cuota manual debe cubrir el interes fijo y dejar saldo positivo para la
// ultima cuota dentro del plazo acordado.
const resolverCuotaFijaPlan = (principal, tasa, plazo, cuotaPersonalizada = 0) => {
  const calculada = calcularCuotaFija(principal, tasa, plazo);
  const personalizada = Math.round(Math.max(numeroSeguro(cuotaPersonalizada, 0), 0));
  const personalizadaValida = personalizada !== calculada
    && validarCuotaPersonalizada(principal, tasa, plazo, personalizada);
  return personalizadaValida ? personalizada : calculada;
};

export const generarTablaAmortizacion = (capital, tasaAnual, cuotas, cuotaInicial = 0, cuotaFijaPersonalizada = 0) => {
  const principal = redondearMoneda(Math.max(numeroSeguro(capital, 0), 0));
  const plazo = Math.max(parseInt(cuotas || 0, 10), 0);
  const tasa = Math.max(numeroSeguro(tasaAnual, 0), 0);
  const numeroBase = Math.max(parseInt(cuotaInicial || 0, 10), 0);
  if (principal <= 0 || plazo <= 0) return [];

  // Cuotas automaticas y manuales comparten el mismo reparto de capital e interes.
  const cuotaFija = resolverCuotaFijaPlan(principal, tasa, plazo, cuotaFijaPersonalizada);
  const totalPlan = calcularTotalPlanPlano(principal, tasa, plazo);
  const interesMensualFijo = calcularInteresFijoMensual(principal, tasa);
  const capitalRegular = redondearMoneda(cuotaFija - interesMensualFijo);
  const tabla = [];
  let saldo = principal;
  let interesAcumulado = 0;

  for (let indice = 1; indice <= plazo; indice += 1) {
    const esUltimaCuota = indice === plazo;
    const capitalCuota = esUltimaCuota
      ? redondearMoneda(saldo)
      : redondearMoneda(Math.min(capitalRegular, saldo));
    // La ultima cuota recarga el residuo decimal del plan.
    const pago = esUltimaCuota ? redondearMoneda(totalPlan - cuotaFija * (plazo - 1)) : cuotaFija;
    const interesMes = !esUltimaCuota
      ? interesMensualFijo
      : redondearMoneda(Math.max(pago - capitalCuota, 0));
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
