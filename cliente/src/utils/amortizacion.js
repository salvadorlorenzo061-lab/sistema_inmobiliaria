const numeroSeguro = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const redondearMoneda = (value) => (
  Math.round((numeroSeguro(value, 0) + Number.EPSILON) * 100) / 100
);

export const calcularCuotaFija = (capital, tasaAnual, cuotas) => {
  const principal = Math.round(Math.max(numeroSeguro(capital, 0), 0));
  const plazo = Math.max(parseInt(cuotas || 0, 10), 0);
  const tasaMensual = Math.max(numeroSeguro(tasaAnual, 0), 0) / 100 / 12;

  if (principal <= 0 || plazo <= 0) return 0;
  if (tasaMensual <= 0) return Math.round(principal / plazo);

  const factor = Math.pow(1 + tasaMensual, plazo);
  const denominador = factor - 1;
  if (!Number.isFinite(factor) || Math.abs(denominador) < 1e-12) {
    return Math.round(principal / plazo);
  }

  return Math.round(principal * ((tasaMensual * factor) / denominador));
};

export const generarTablaAmortizacion = (capital, tasaAnual, cuotas, cuotaInicial = 0) => {
  const principal = Math.round(Math.max(numeroSeguro(capital, 0), 0));
  const plazo = Math.max(parseInt(cuotas || 0, 10), 0);
  const tasaMensual = Math.max(numeroSeguro(tasaAnual, 0), 0) / 100 / 12;
  const cuotaFija = calcularCuotaFija(principal, tasaAnual, plazo);
  const numeroBase = Math.max(parseInt(cuotaInicial || 0, 10), 0);
  const tabla = [];
  let saldo = principal;
  let interesAcumulado = 0;

  for (let indice = 1; indice <= plazo; indice += 1) {
    const interes = Math.round(saldo * tasaMensual);
    const capitalCuota = indice === plazo
      ? saldo
      : Math.round(Math.min(Math.max(cuotaFija - interes, 0), saldo));
    const pago = Math.round(capitalCuota + interes);
    const saldoFinal = Math.round(Math.max(saldo - capitalCuota, 0));
    interesAcumulado = Math.round(interesAcumulado + interes);

    tabla.push({
      indice,
      numero_cuota: numeroBase + indice,
      saldo_inicial: saldo,
      capital_cuota: capitalCuota,
      interes_mes: interes,
      cuota_estimada: pago,
      saldo_final: saldoFinal,
      interes_acumulado: interesAcumulado
    });
    saldo = saldoFinal;
  }

  return tabla;
};