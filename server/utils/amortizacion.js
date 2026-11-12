// ============================================================================
// SISTEMA LINEAL OFICIAL (cuota absoluta fija + ajuste residual final)
// ============================================================================
// UNICA formula de calculo de cuotas del sistema (la misma de las tablas PDF
// oficiales). Regla global obligatoria:
//   1) Interes fijo mensual: capital original x tasa anual / 12.
//   2) Cuota mensual pactada; normalmente el excedente sobre el interes amortiza capital.
//   3) La ultima cuota usa el saldo residual y ajusta el interes para cerrar
//      el saldo en cero sin cambiar el total del plan.
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
    const total = calcularTotalExactoPlan(principal, tasa, plazo);
    const ultima = redondear2(total - personalizada * (plazo - 1));
    const agotaCapital = redondear2((personalizada - interesMensual) * (plazo - 1)) >= principal;
    const capitalMinimo = redondear2((plazo - 1 + (ultima > 0 ? 1 : 0)) * 0.01);
    return personalizada > interesMensual
        && ultima >= 0
        && (!agotaCapital || principal >= capitalMinimo);
};

// La cuota manual debe cubrir el interes fijo y dejar una ultima cuota no negativa.
const resolverCuotaFijaPlan = (capital = 0, tasaAnual = 0, cuotas = 0, cuotaPersonalizada = 0) => {
    const calculada = calcularCuotaPlana(capital, tasaAnual, cuotas);
    const personalizada = Math.round(Math.max(toNumber(cuotaPersonalizada, 0), 0));
    const personalizadaValida = personalizada !== calculada
        && validarCuotaPersonalizada(capital, tasaAnual, cuotas, personalizada);
    return personalizadaValida ? personalizada : calculada;
};

// Tabla completa: cuotas automaticas y manuales comparten el mismo reparto.
const generarTablaPlana = (capital = 0, tasaAnual = 0, cuotas = 0, cuotaInicial = 0, cuotaPersonalizada = 0) => {
    const principal = redondear2(Math.max(toNumber(capital, 0), 0));
    const plazo = Math.max(parseInt(cuotas || 0, 10), 0);
    const tasa = Math.max(toNumber(tasaAnual, 0), 0);
    const numeroBase = Math.max(parseInt(cuotaInicial || 0, 10), 0);
    if (principal <= 0 || plazo <= 0) return [];

    const cuotaFija = resolverCuotaFijaPlan(principal, tasa, plazo, cuotaPersonalizada);
    const totalPlan = calcularTotalExactoPlan(principal, tasa, plazo);
    const interesMensualFijo = calcularInteresFijoMensual(principal, tasa);
    const capitalRegular = redondear2(cuotaFija - interesMensualFijo);
    const ultimaCuota = redondear2(totalPlan - cuotaFija * (plazo - 1));
    // Solo los planes manuales que antes agotaban el capital anticipadamente
    // redistribuyen capital e interes para conservar el total pactado.
    const redistribuirCapital = plazo > 1 && cuotaFija !== calcularCuotaPlana(principal, tasa, plazo)
        && redondear2(capitalRegular * (plazo - 1)) >= principal;
    const capitalUltimaCuota = redistribuirCapital && ultimaCuota > 0
        ? Math.min(redondear2(principal - (plazo - 1) * 0.01), ultimaCuota, Math.max(0.01, redondear2(principal * ultimaCuota / totalPlan)))
        : 0;
    const capitalCuotasRegulares = redondear2(principal - capitalUltimaCuota);
    const tabla = [];
    let saldo = principal;
    let interesAcumulado = 0;

    for (let indice = 1; indice <= plazo; indice += 1) {
        const esUltima = indice === plazo;
        const capitalCuota = esUltima
            ? redondear2(saldo)
            : redistribuirCapital
                ? redondear2(
                    redondear2(capitalCuotasRegulares * indice / (plazo - 1))
                    - redondear2(capitalCuotasRegulares * (indice - 1) / (plazo - 1))
                )
                : redondear2(Math.min(capitalRegular, saldo));
        // La ultima cuota recarga el residuo decimal del plan.
        const pago = esUltima ? redondear2(totalPlan - cuotaFija * (plazo - 1)) : cuotaFija;
        const interesMes = !esUltima
            ? (redistribuirCapital ? redondear2(pago - capitalCuota) : interesMensualFijo)
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

// Conservar centavos pendientes en planes manuales con ajuste final reducido.
const sqlToleranciaSaldoPlan = (capitalExpr, tasaAnualExpr, cuotasExpr, cuotaExpr) => {
    const principal = `GREATEST(ROUND(COALESCE((${capitalExpr}), 0), 2), 0)`;
    const plazo = `GREATEST(COALESCE((${cuotasExpr}), 1), 1)`;
    const cuota = `ROUND(COALESCE((${cuotaExpr}), 0), 0)`;
    const interes = `ROUND(${principal} * GREATEST(COALESCE((${tasaAnualExpr}), 0), 0) / 1200, 2)`;
    const total = sqlTotalPlanPlano(capitalExpr, tasaAnualExpr, cuotasExpr);
    const automatica = `FLOOR(${total} / ${plazo})`;
    return `(CASE WHEN ${plazo} > 1 AND ${cuota} <> ${automatica}
        AND ${cuota} > ${interes}
        AND ROUND(${total} - ${cuota} * (${plazo} - 1), 2) >= 0
        AND (ROUND((${cuota} - ${interes}) * (${plazo} - 1), 2) < ${principal}
            OR ${principal} >= ROUND((${plazo} - 1
                + CASE WHEN ROUND(${total} - ${cuota} * (${plazo} - 1), 2) > 0 THEN 1 ELSE 0 END) * 0.01, 2))
        AND (ROUND((${cuota} - ${interes}) * (${plazo} - 1), 2) >= ${principal}
            OR ROUND(${total} - ${cuota} * (${plazo} - 1), 2) <= 0.5)
        THEN 0 ELSE 0.5 END)`;
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
    sqlTotalPlanPlano,
    sqlToleranciaSaldoPlan
};
