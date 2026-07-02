const express = require("express");
const db = require('../Conexion'); 
const router = express.Router();
const cors = require('cors');
const { registrarAuditoria, obtenerIP } = require('../auditingMiddleware');

router.use(cors());

const NOMBRES_MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const queryAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
        if (err) return reject(err);
        return resolve(rows || []);
    });
});

const parseFecha = (value) => {
    const d = value ? new Date(value) : null;
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
};

const labelMes = (date) => `${NOMBRES_MESES[date.getMonth()]} ${date.getFullYear()}`;

const calcularMorasAutomaticas = async () => {
    const contratos = await queryAsync(`
        SELECT
            c.id_contrato,
            c.codigo_contrato,
            c.fecha_compra,
            c.fecha_firma,
            c.dia_pago_limite,
            c.monto_cuota,
            c.monto_total,
            c.estado,
            COALESCE(tc.interes_moratorio, 0) AS interes_moratorio
        FROM contratos_residentes c
        LEFT JOIN tipos_contrato tc ON tc.id_tipo_contrato = c.id_tipo_contrato
        WHERE c.estado = 'activo'
    `);

    if (!contratos.length) {
        return { generated: 0, examinedContracts: 0 };
    }

    const pagosRows = await queryAsync(`
        SELECT DISTINCT p.id_contrato, pd.mes_pagado
        FROM pagos p
        INNER JOIN pagos_detalle pd ON pd.id_pago = p.id_pago
        WHERE pd.tipo_concepto = 'cuota_terreno'
          AND pd.mes_pagado IS NOT NULL
          AND pd.mes_pagado != ''
    `);

    const moraExistenteRows = await queryAsync(`
        SELECT id_contrato, mes_atrasado
        FROM morosidad
    `);

    const pagosPorContrato = new Map();
    pagosRows.forEach((r) => {
        const key = String(r.id_contrato);
        if (!pagosPorContrato.has(key)) pagosPorContrato.set(key, new Set());
        pagosPorContrato.get(key).add(String(r.mes_pagado || '').trim());
    });

    const morasExistentesPorContrato = new Map();
    moraExistenteRows.forEach((r) => {
        const key = String(r.id_contrato);
        if (!morasExistentesPorContrato.has(key)) morasExistentesPorContrato.set(key, new Set());
        morasExistentesPorContrato.get(key).add(String(r.mes_atrasado || '').trim());
    });

    const hoy = new Date();
    const inserts = [];

    contratos.forEach((contrato) => {
        const saldoPendiente = Number(contrato.monto_total || 0);
        const montoCuota = Number(contrato.monto_cuota || 0);
        const interesMoratorio = Number(contrato.interes_moratorio || 0);

        if (saldoPendiente <= 0 || montoCuota <= 0) {
            return;
        }

        const inicioRaw = parseFecha(contrato.fecha_compra) || parseFecha(contrato.fecha_firma);
        if (!inicioRaw) {
            return;
        }

        const diaPagoLimite = Math.max(1, Math.min(28, Number(contrato.dia_pago_limite || 5)));
        const inicio = new Date(inicioRaw.getFullYear(), inicioRaw.getMonth(), 1);
        const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1);

        const pagadosSet = pagosPorContrato.get(String(contrato.id_contrato)) || new Set();
        const morasSet = morasExistentesPorContrato.get(String(contrato.id_contrato)) || new Set();

        while (cursor <= hoy) {
            const etiquetaMes = labelMes(cursor);

            const fechaVencimiento = new Date(cursor.getFullYear(), cursor.getMonth(), diaPagoLimite);
            const vencido = hoy > fechaVencimiento;

            if (vencido && !pagadosSet.has(etiquetaMes) && !morasSet.has(etiquetaMes)) {
                const msPorDia = 1000 * 60 * 60 * 24;
                const diasRetraso = Math.max(Math.floor((hoy - fechaVencimiento) / msPorDia), 1);
                const moraCalculada = interesMoratorio > 0
                    ? Number((montoCuota * (interesMoratorio / 100)).toFixed(2))
                    : 0;

                inserts.push([
                    contrato.id_contrato,
                    etiquetaMes,
                    moraCalculada,
                    diasRetraso,
                    'pendiente'
                ]);

                morasSet.add(etiquetaMes);
            }

            cursor.setMonth(cursor.getMonth() + 1);
        }
    });

    if (!inserts.length) {
        return { generated: 0, examinedContracts: contratos.length };
    }

    await queryAsync(
        'INSERT INTO morosidad (id_contrato, mes_atrasado, monto_mora, dias_retraso, estado) VALUES ?',
        [inserts]
    );

    return { generated: inserts.length, examinedContracts: contratos.length };
};

router.get("/", (req, res) => {
    const sql = `
        SELECT
            m.*, 
            c.codigo_contrato,
            r.nombre AS nombre_residente,
            r.numero_identificacion
        FROM morosidad m
        LEFT JOIN contratos_residentes c ON c.id_contrato = m.id_contrato
        LEFT JOIN residentes r ON r.id_residente = c.id_residente
        ORDER BY m.id_morosidad DESC
    `;

    db.query(sql, (err, result) => {
        if (err) return res.status(500).send("Error");
        return res.send(result);
    });
});

router.post('/generar-automatico', async (req, res) => {
    try {
        const data = await calcularMorasAutomaticas();
        return res.status(200).json({
            success: true,
            message: 'Generación automática de mora finalizada',
            ...data
        });
    } catch (error) {
        console.error('Error al generar mora automática:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo generar mora automática.' });
    }
});

// Endpoint extra para la creación manual si la necesitas
router.post("/crear", (req, res) => {
    const { id_contrato, mes_atrasado, monto_mora, dias_retraso, estado } = req.body;
    db.query(
        'INSERT INTO morosidad (id_contrato, mes_atrasado, monto_mora, dias_retraso, estado) VALUES (?, ?, ?, ?, ?)',
        [id_contrato, mes_atrasado, monto_mora, dias_retraso, estado],
        (err, result) => {
            if (err) res.status(500).send("Error al generar mora");
            else res.status(200).send("Mora generada");
        }
    );
});

router.put("/actualizar-estado", (req, res) => {
    const { id_morosidad, estado } = req.body;
    db.query('UPDATE morosidad SET estado = ? WHERE id_morosidad = ?', [estado, id_morosidad], (err, result) => {
        if (err) res.status(500).send("Error");
        else res.status(200).send("Estado actualizado");
    });
});

module.exports = router;