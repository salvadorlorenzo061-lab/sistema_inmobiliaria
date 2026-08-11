const numeroSeguro = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const redondearMoneda = (value) => (
  Math.round((numeroSeguro(value, 0) + Number.EPSILON) * 100) / 100
);

const obtenerPlazoMeses = (cuotas) => Math.max(parseInt(cuotas || 0, 10), 0);

const obtenerPlazoAnios = (cuotas) => (
  redondearMoneda(obtenerPlazoMeses(cuotas) / 12)
);

export const calcularInteresTotalContrato = (capital, tasaAnual, cuotas) => {
  const principal = redondearMoneda(Math.max(numeroSeguro(capital, 0), 0));
  const interesAnual = Math.max(numeroSeguro(tasaAnual, 0), 0) / 100;
  const plazoAnios = obtenerPlazoAnios(cuotas);

  if (principal <= 0 || plazoAnios <= 0 || interesAnual <= 0) return 0;
  return redondearMoneda(principal * interesAnual * plazoAnios);
};

export const calcularCuotaFija = (capital, tasaAnual, cuotas) => {
  const principal = redondearMoneda(Math.max(numeroSeguro(capital, 0), 0));
  const plazo = obtenerPlazoMeses(cuotas);
  const interesTotal = calcularInteresTotalContrato(principal, tasaAnual, plazo);
  const totalFinanciado = redondearMoneda(principal + interesTotal);

  if (principal <= 0 || plazo <= 0) return 0;
  return Math.round(totalFinanciado / plazo);
};

export const generarTablaAmortizacion = (capital, tasaAnual, cuotas, cuotaInicial = 0) => {
  const principal = redondearMoneda(Math.max(numeroSeguro(capital, 0), 0));
  const plazo = obtenerPlazoMeses(cuotas);
  const cuotaFija = calcularCuotaFija(principal, tasaAnual, plazo);
  const numeroBase = Math.max(parseInt(cuotaInicial || 0, 10), 0);
  const interesTotal = calcularInteresTotalContrato(principal, tasaAnual, plazo);
  const tabla = [];
  let saldoCapital = principal;
  let saldoInteres = interesTotal;
  let interesAcumulado = 0;

  for (let indice = 1; indice <= plazo; indice += 1) {
    const esUltimaCuota = indice === plazo;
    const capitalCuota = esUltimaCuota
      ? redondearMoneda(saldoCapital)
      : Math.min(Math.round(principal / plazo), redondearMoneda(saldoCapital));
    const interes = esUltimaCuota
      ? redondearMoneda(saldoInteres)
      : Math.min(Math.round(interesTotal / plazo), redondearMoneda(saldoInteres));
    const pago = esUltimaCuota
      ? redondearMoneda(capitalCuota + interes)
      : cuotaFija;
    const saldoFinal = redondearMoneda(Math.max(saldoCapital - capitalCuota, 0));
    interesAcumulado = redondearMoneda(interesAcumulado + interes);

    tabla.push({
      indice,
      numero_cuota: numeroBase + indice,
      saldo_inicial: redondearMoneda(saldoCapital),
      capital_cuota: capitalCuota,
      interes_mes: interes,
      cuota_estimada: pago,
      saldo_final: saldoFinal,
      interes_acumulado: interesAcumulado
    });
    saldoCapital = saldoFinal;
    saldoInteres = redondearMoneda(Math.max(saldoInteres - interes, 0));
  }

  return tabla;
};
