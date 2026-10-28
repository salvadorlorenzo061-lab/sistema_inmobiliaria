// ============================================================================
// SISTEMA LINEAL OFICIAL (cuota absoluta fija + ajuste residual final)
// ============================================================================
// UNICA formula de calculo de cuotas del sistema (la misma de las tablas PDF
// oficiales). Regla global obligatoria:
//   1) Capital fijo por mes: se amortiza la misma cantidad de capital en cada
//      cuota (Ej: Q170,000 / 24 = Q7,083.67 fijos cada mes).
//   2) Cuota total mensual absoluta e identica durante todo el plazo.
//   3) Interes regular: cuota fija menos capital regular.
//   4) La ultima cuota usa el capital residual exacto y despeja el interes
//      por diferencia, conservando la cuota fija y cerrando el saldo en cero.
// El frontend replica esta misma logica en cliente/src/utils/amortizacion.js.
// NO usar formulas de interes compuesto / Sistema Frances.
// ============================================================================

const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const redondear2 = (value) => Math.round((toNumber(value, 0) + Number.EPSILON) * 100) / 100;

// Interes fijo mensual del plan: capital inicial financiado x tasa anual / 12.
const calcularInteresFijoMensual = (capital = 0, tasaAnual = 0) => {
    const principal = redondear2(Math.max(toNumber(capital, 0), 0));
    const tasa = Math.max(toNumber(tasaAnual, 0), 0);
    return redondear2((principal * (tasa / 100)) / 12);
};

// Total exacto del plan: capital + interes total (sin redondear cuotas).
const calcularTotalExactoPlan = (capital = 0, tasaAnual = 0, cuotas = 0) => {
    const principal = redondear2(Math.max(toNumber(capital, 0), 0));
    const plazo = Math.max(parseInt(cuotas || 0, 10), 0);
    const tasa = Math.max(toNumber(tasaAnual, 0), 0);
    if (principal <= 0 || plazo <= 0) return 0;
    return redondear2(principal + principal * (tasa / 100) * (plazo / 12));
};

// Cuota fija mensual ENTERA: piso(total del plan / cuotas). La ultima cuota
// absorbe el residuo con decimales.
const calcularCuotaPlana = (capital = 0, tasaAnual = 0, cuotas = 0) => {
    const plazo = Math.max(parseInt(cuotas || 0, 10), 0);
    const total = calcularTotalExactoPlan(capital, tasaAnual, plazo);
    if (total <= 0 || plazo <= 0) return 0;
    const entera = Math.floor(total / plazo);
    return entera > 0 ? entera : redondear2(total / plazo);
};

const validarCuotaPersonalizada = (capital = 0, tasaAnual = 0, cuotas = 0, cuotaPersonalizada = 0) => {
    const principal = redondear2(Math.max(toNumber(capital, 0), 0));
    const tasa = Math.max(toNumber(tasaAnual, 0), 0);
    const plazo = Math.max(parseInt(cuotas || 0, 10), 0);
    const personalizada = Math.round(Math.max(toNumber(cuotaPersonalizada, 0), 0));
    if (personalizada <= 0 || principal <= 0 || plazo <= 1) return false;

    const interesMensual = calcularInteresFijoMensual(principal, tasa);
    const capitalPorCuota = redondear2(personalizada - interesMensual);
    return capitalPorCuota > 0 && redondear2(capitalPorCuota * (plazo - 1)) < principal;
};

// La cuota manual debe cubrir el interes fijo y dejar saldo positivo para la
// ultima cuota dentro del plazo acordado.
const resolverCuotaFijaPlan = (capital = 0, tasaAnual = 0, cuotas = 0, cuotaPersonalizada = 0) => {
    const calculada = calcularCuotaPlana(capital, tasaAnual, cuotas);
    const personalizada = Math.round(Math.max(toNumber(cuotaPersonalizada, 0), 0));
    const personalizadaValida = personalizada !== calculada
        && validarCuotaPersonalizada(capital, tasaAnual, cuotas, personalizada);
    return personalizadaValida ? personalizada : calculada;
};

// Tabla completa: el plan automatico conserva su reparto original; el plan
// manual mantiene el interes mensual y aplica el excedente a capital.
const generarTablaPlana = (capital = 0, tasaAnual = 0, cuotas = 0, cuotaInicial = 0, cuotaPersonalizada = 0) => {
    const principal = redondear2(Math.max(toNumber(capital, 0), 0));
    const plazo = Math.max(parseInt(cuotas || 0, 10), 0);
    const tasa = Math.max(toNumber(tasaAnual, 0), 0);
    const numeroBase = Math.max(parseInt(cuotaInicial || 0, 10), 0);
    if (principal <= 0 || plazo <= 0) return [];

    const cuotaFija = resolverCuotaFijaPlan(principal, tasa, plazo, cuotaPersonalizada);
    const totalPlan = calcularTotalExactoPlan(principal, tasa, plazo);
    const cuotaManualActiva = cuotaFija !== calcularCuotaPlana(principal, tasa, plazo);
    const interesMensualFijo = calcularInteresFijoMensual(principal, tasa);
    const capitalRegular = cuotaManualActiva
        ? redondear2(cuotaFija - interesMensualFijo)
        : (tasa <= 0 ? cuotaFija : redondear2(principal / plazo));
    const tabla = [];
    let saldo = principal;
    let interesAcumulado = 0;

    for (let indice = 1; indice <= plazo; indice += 1) {
        const esUltima = indice === plazo;
        const capitalCuota = esUltima
            ? redondear2(saldo)
            : redondear2(Math.min(capitalRegular, saldo));
        // La ultima cuota recarga el residuo decimal del plan.
        const pago = esUltima ? redondear2(totalPlan - cuotaFija * (plazo - 1)) : cuotaFija;
        const interesMes = cuotaManualActiva && !esUltima
            ? interesMensualFijo
            : redondear2(Math.max(pago - capitalCuota, 0));
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

// Total del plan: capital + interes total exacto.
const calcularTotalPlanPlano = (capital = 0, tasaAnual = 0, cuotas = 0) => (
    calcularTotalExactoPlan(capital, tasaAnual, cuotas)
);

// Expresion SQL (MySQL) de la cuota plana, para migraciones de monto_cuota.
const sqlCuotaPlana = (capitalExpr, tasaAnualExpr, cuotasExpr) => {
    const tasa = `COALESCE(${tasaAnualExpr}, 0)`;
    const n = `GREATEST(COALESCE((${cuotasExpr}), 1), 1)`;
    const p = `GREATEST(COALESCE((${capitalExpr}), 0), 0)`;
    return `GREATEST(FLOOR(ROUND(${p} + ${p} * ${tasa} / 100 * (${n} / 12), 2) / ${n}), 1)`;
};

// Total del plan en SQL: cuota absoluta fija x numero de cuotas.
const sqlTotalPlanPlano = (capitalExpr, tasaAnualExpr, cuotasExpr) => {
    const tasa = `COALESCE(${tasaAnualExpr}, 0)`;
    const n = `GREATEST(COALESCE((${cuotasExpr}), 1), 1)`;
    const p = `GREATEST(COALESCE((${capitalExpr}), 0), 0)`;
    return `ROUND(${p} + ${p} * ${tasa} / 100 * (${n} / 12), 2)`;
};

module.exports = {
    toNumber,
    redondear2,
    calcularInteresFijoMensual,
    calcularCuotaPlana,
    calcularTotalExactoPlan,
    resolverCuotaFijaPlan,
    generarTablaPlana,
    calcularTotalPlanPlano,
    validarCuotaPersonalizada,
    sqlCuotaPlana,
    sqlTotalPlanPlano
};
