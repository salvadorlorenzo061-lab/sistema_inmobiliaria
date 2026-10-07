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
// El frontend replica esta misma logica en cliente/src/utils/amortizacion.js.
// No agregar formulas alternativas (interes plano / partes iguales).
// ============================================================================

const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const redondear2 = (value) => Math.round((toNumber(value, 0) + Number.EPSILON) * 100) / 100;

// Cuota fija nivelada del Sistema Frances. Con tasa 0% la cuota es capital / n.
const calcularCuotaFrancesa = (capital = 0, tasaAnual = 0, cuotas = 0) => {
    const principal = Math.round(Math.max(toNumber(capital, 0), 0));
    const plazo = Math.max(parseInt(cuotas || 0, 10), 0);
    const tasa = Math.max(toNumber(tasaAnual, 0), 0);

    if (principal <= 0 || plazo <= 0) return 0;

    const tasaMensual = tasa / 100 / 12;
    if (tasaMensual <= 0) return redondear2(principal / plazo);

    const factor = Math.pow(1 + tasaMensual, plazo);
    return redondear2(principal * (tasaMensual * factor) / (factor - 1));
};

// Una cuota personalizada (pactada manualmente) solo se respeta si amortiza:
// debe superar el interes del primer mes (saldo inicial * tasa mensual).
const resolverCuotaFijaPlan = (capital = 0, tasaAnual = 0, cuotas = 0, cuotaPersonalizada = 0) => {
    const principal = Math.round(Math.max(toNumber(capital, 0), 0));
    const plazo = Math.max(parseInt(cuotas || 0, 10), 0);
    const tasa = Math.max(toNumber(tasaAnual, 0), 0);
    const calculada = calcularCuotaFrancesa(principal, tasa, plazo);
    const personalizada = redondear2(Math.max(toNumber(cuotaPersonalizada, 0), 0));
    const interesPrimerMes = redondear2(principal * (tasa / 100 / 12));
    const personalizadaValida = personalizada > 0 && (plazo <= 1 || personalizada > interesPrimerMes);
    return personalizadaValida ? personalizada : calculada;
};

// Tabla completa del plan: interes sobre saldo insoluto y ultima cuota de ajuste.
const generarTablaFrancesa = (capital = 0, tasaAnual = 0, cuotas = 0, cuotaInicial = 0, cuotaPersonalizada = 0) => {
    const principal = Math.round(Math.max(toNumber(capital, 0), 0));
    const plazo = Math.max(parseInt(cuotas || 0, 10), 0);
    const tasa = Math.max(toNumber(tasaAnual, 0), 0);
    const numeroBase = Math.max(parseInt(cuotaInicial || 0, 10), 0);
    if (principal <= 0 || plazo <= 0) return [];

    const tasaMensual = tasa / 100 / 12;
    const cuotaFija = resolverCuotaFijaPlan(principal, tasa, plazo, cuotaPersonalizada);
    const tabla = [];
    let saldo = principal;
    let interesAcumulado = 0;

    for (let indice = 1; indice <= plazo; indice += 1) {
        const esUltima = indice === plazo;
        const interesMes = redondear2(saldo * tasaMensual);
        const capitalCuota = esUltima
            ? redondear2(saldo)
            : redondear2(Math.min(Math.max(cuotaFija - interesMes, 0), saldo));
        const pago = redondear2(capitalCuota + interesMes);
        const saldoFinal = redondear2(Math.max(saldo - capitalCuota, 0));
        interesAcumulado = redondear2(interesAcumulado + interesMes);

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

// Total del plan (capital + intereses). Coincide con la formula SQL de abajo.
const calcularTotalPlanFrances = (capital = 0, tasaAnual = 0, cuotas = 0, cuotaPersonalizada = 0) => {
    const principal = Math.round(Math.max(toNumber(capital, 0), 0));
    const plazo = Math.max(parseInt(cuotas || 0, 10), 0);
    if (principal <= 0 || plazo <= 0) return 0;
    return redondear2(resolverCuotaFijaPlan(principal, tasaAnual, plazo, cuotaPersonalizada) * plazo);
};

// Expresion SQL (MySQL) de la cuota francesa, para los recalculos de saldo.
const sqlCuotaFrancesa = (capitalExpr, tasaAnualExpr, cuotasExpr) => {
    const tasa = `COALESCE(${tasaAnualExpr}, 0)`;
    const r = `(${tasa} / 100 / 12)`;
    const n = `GREATEST(COALESCE((${cuotasExpr}), 1), 1)`;
    const p = `GREATEST(COALESCE((${capitalExpr}), 0), 0)`;
    return `IF(${tasa} > 0, ROUND(${p} * ((${r}) * POWER(1 + ${r}, ${n})) / (POWER(1 + ${r}, ${n}) - 1), 2), ROUND(${p} / ${n}, 2))`;
};

// Total del plan en SQL: cuota francesa * numero de cuotas.
const sqlTotalPlanFrancesa = (capitalExpr, tasaAnualExpr, cuotasExpr) => {
    const n = `GREATEST(COALESCE((${cuotasExpr}), 1), 1)`;
    return `ROUND(${sqlCuotaFrancesa(capitalExpr, tasaAnualExpr, cuotasExpr)} * ${n}, 2)`;
};

module.exports = {
    toNumber,
    redondear2,
    calcularCuotaFrancesa,
    resolverCuotaFijaPlan,
    generarTablaFrancesa,
    calcularTotalPlanFrances,
    sqlCuotaFrancesa,
    sqlTotalPlanFrancesa
};
