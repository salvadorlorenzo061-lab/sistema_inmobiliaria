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
  const tasa = Math.max(numeroSeguro(tasaAnual, 0), 0);

  if (principal <= 0 || plazo <= 0) return 0;
  if (tasa <= 0) return Math.ceil(principal / plazo);

  const anios = Math.max(plazo / 12, 1);
  const interesTotal = principal * (tasa / 100) * anios;
  const cuotaFija = (principal + interesTotal) / plazo;
  // Las cuotas regulares no manejan centavos. Se redondean hacia arriba y la
  // diferencia se compensa exactamente en la última cuota del contrato.
  return Math.ceil(cuotaFija);
};

export const generarTablaAmortizacion = (capital, tasaAnual, cuotas, cuotaInicial = 0) => {
  const principal = Math.round(Math.max(numeroSeguro(capital, 0), 0));
  const plazo = Math.max(parseInt(cuotas || 0, 10), 0);
  const tasa = Math.max(numeroSeguro(tasaAnual, 0), 0);
  const cuotaFija = calcularCuotaFija(principal, tasa, plazo);
  const numeroBase = Math.max(parseInt(cuotaInicial || 0, 10), 0);
  const tabla = [];
  let saldo = principal;
  let interesAcumulado = 0;

  for (let indice = 1; indice <= plazo; indice += 1) {
    const interesMes = Math.round(principal * (tasa / 100) / 12);
    const capitalCuota = Math.max(cuotaFija - interesMes, 0);
    const pago = Math.round(cuotaFija);
    const saldoFinal = Math.round(Math.max(saldo - capitalCuota, 0));
    interesAcumulado = Math.round(interesAcumulado + interesMes);

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
