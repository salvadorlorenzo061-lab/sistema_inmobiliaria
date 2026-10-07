const numeroSeguro = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const redondearMoneda = (value) => (
  Math.round((numeroSeguro(value, 0) + Number.EPSILON) * 100) / 100
);

// ============================================================================
// SISTEMA FRANCES DE AMORTIZACION (cuota fija nivelada sobre saldos insolutos)
// ============================================================================
// UNICA formula de calculo de cuotas del sistema. Regla global obligatoria:
//   1) Cuota mensual fija:  Cuota = P * [r(1+r)^n] / [(1+r)^n - 1]
//      con r = tasa anual / 100 / 12  y  n = numero de cuotas.
//   2) Interes del mes  = saldo pendiente actual del capital * r.
//   3) Abono a capital  = cuota fija total - interes del mes.
//   4) Saldo pendiente  = saldo anterior - abono a capital del mes.
//   5) La ultima cuota ajusta el capital restante para cerrar el plan en cero.
// El backend replica esta misma logica en server/utils/amortizacion.js.
// No agregar formulas alternativas (interes plano / partes iguales).
// ============================================================================

// Cuota fija nivelada del Sistema Frances. Con tasa 0% la cuota es capital / n.
export const calcularCuotaFija = (capital, tasaAnual, cuotas) => {
  const principal = Math.round(Math.max(numeroSeguro(capital, 0), 0));
  const plazo = Math.max(parseInt(cuotas || 0, 10), 0);
  const tasa = Math.max(numeroSeguro(tasaAnual, 0), 0);

  if (principal <= 0 || plazo <= 0) return 0;

  const tasaMensual = tasa / 100 / 12;
  if (tasaMensual <= 0) return redondearMoneda(principal / plazo);

  const factor = Math.pow(1 + tasaMensual, plazo);
  return redondearMoneda(principal * (tasaMensual * factor) / (factor - 1));
};

// Una cuota personalizada (pactada manualmente) solo se respeta si amortiza:
// debe superar el interes del primer mes (saldo inicial * tasa mensual).
const resolverCuotaFijaPlan = (principal, tasa, plazo, cuotaPersonalizada = 0) => {
  const calculada = calcularCuotaFija(principal, tasa, plazo);
  const personalizada = redondearMoneda(Math.max(numeroSeguro(cuotaPersonalizada, 0), 0));
  const interesPrimerMes = redondearMoneda(principal * (Math.max(numeroSeguro(tasa, 0), 0) / 100 / 12));
  const personalizadaValida = personalizada > 0 && (plazo <= 1 || personalizada > interesPrimerMes);
  return personalizadaValida ? personalizada : calculada;
};

export const generarTablaAmortizacion = (capital, tasaAnual, cuotas, cuotaInicial = 0, cuotaFijaPersonalizada = 0) => {
  const principal = Math.round(Math.max(numeroSeguro(capital, 0), 0));
  const plazo = Math.max(parseInt(cuotas || 0, 10), 0);
  const tasa = Math.max(numeroSeguro(tasaAnual, 0), 0);
  const numeroBase = Math.max(parseInt(cuotaInicial || 0, 10), 0);
  if (principal <= 0 || plazo <= 0) return [];

  const tasaMensual = tasa / 100 / 12;
  const cuotaFija = resolverCuotaFijaPlan(principal, tasa, plazo, cuotaFijaPersonalizada);
  const tabla = [];
  let saldo = principal;
  let interesAcumulado = 0;

  // Interes de cada cuota = saldo insoluto * tasa mensual (Sistema Frances).
  // El capital de la ultima cuota ajusta el saldo para cerrar exacto en cero.
  for (let indice = 1; indice <= plazo; indice += 1) {
    const esUltimaCuota = indice === plazo;
    const interesMes = redondearMoneda(saldo * tasaMensual);
    const capitalCuota = esUltimaCuota
      ? redondearMoneda(saldo)
      : redondearMoneda(Math.min(Math.max(cuotaFija - interesMes, 0), saldo));
    const pago = redondearMoneda(capitalCuota + interesMes);
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

// Total del plan (capital + intereses) = cuota fija * numero de cuotas.
export const calcularTotalPlanFrances = (capital, tasaAnual, cuotas, cuotaPersonalizada = 0) => {
  const principal = Math.round(Math.max(numeroSeguro(capital, 0), 0));
  const plazo = Math.max(parseInt(cuotas || 0, 10), 0);
  if (principal <= 0 || plazo <= 0) return 0;
  return redondearMoneda(resolverCuotaFijaPlan(principal, numeroSeguro(tasaAnual, 0), plazo, cuotaPersonalizada) * plazo);
};
