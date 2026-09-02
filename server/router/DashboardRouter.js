const express = require('express');
const db = require('../Conexion');
const router = express.Router();
const cors = require('cors');

router.use(cors());

const queryAsync = (sql, params = []) => new Promise((resolve, reject) => {
  db.query(sql, params, (err, rows) => {
    if (err) return reject(err);
    return resolve(rows || []);
  });
});

const normalizarPeriodo = (periodo = 'mensual') => {
  const valor = String(periodo || 'mensual').trim().toLowerCase();
  if (['semanal', 'quincenal', 'mensual'].includes(valor)) {
    return valor;
  }
  return 'mensual';
};

const obtenerRangoFecha = (periodo) => {
  const ahora = new Date();
  const inicio = new Date(ahora);
  const fin = new Date(ahora);

  if (periodo === 'semanal') {
    inicio.setDate(ahora.getDate() - 6);
  } else if (periodo === 'quincenal') {
    inicio.setDate(ahora.getDate() - 14);
  } else {
    inicio.setMonth(ahora.getMonth() - 1);
  }

  inicio.setHours(0, 0, 0, 0);
  fin.setHours(23, 59, 59, 999);

  return {
    periodo,
    inicio: inicio.toISOString().slice(0, 19).replace('T', ' '),
    fin: fin.toISOString().slice(0, 19).replace('T', ' '),
    etiqueta: periodo === 'semanal' ? 'Últimos 7 días' : periodo === 'quincenal' ? 'Últimos 15 días' : 'Último mes'
  };
};

router.get('/resumen', async (req, res) => {
  try {
    const periodo = normalizarPeriodo(req.query.periodo);
    const rango = obtenerRangoFecha(periodo);

    const [
      resumenGeneral,
      topCobradores,
      topMora,
      facturasPorUsuario,
      contratosEstado,
      clientesEstado
    ] = await Promise.all([
      queryAsync(`
        SELECT
          COALESCE(SUM(CASE WHEN pd.tipo_concepto = 'cuota_terreno' THEN pd.subtotal ELSE 0 END), 0) AS total_cobrado,
          COALESCE(SUM(CASE WHEN pd.tipo_concepto = 'mora' THEN pd.subtotal ELSE 0 END), 0) AS total_mora,
          COUNT(DISTINCT CASE WHEN pd.tipo_concepto = 'cuota_terreno' THEN p.id_contrato END) AS contratos_con_cobro,
          COUNT(DISTINCT CASE WHEN pd.tipo_concepto = 'cuota_terreno' AND COALESCE(pd.numero_cuota_afectada, 0) > 0 THEN CONCAT(p.id_contrato, '-', pd.numero_cuota_afectada) END) AS cuotas_financiadas_cobradas
        FROM pagos p
        INNER JOIN pagos_detalle pd ON pd.id_pago = p.id_pago
        WHERE p.fecha_pago >= ? AND p.fecha_pago <= ?
      `, [rango.inicio, rango.fin]),

      queryAsync(`
        SELECT
          u.nombre AS nombre,
          COUNT(DISTINCT CASE WHEN pd.tipo_concepto = 'cuota_terreno' AND COALESCE(pd.numero_cuota_afectada, 0) > 0 THEN CONCAT(p.id_contrato, '-', pd.numero_cuota_afectada) END) AS cuotas_financiadas,
          COALESCE(SUM(CASE WHEN pd.tipo_concepto = 'cuota_terreno' THEN pd.subtotal ELSE 0 END), 0) AS total_recaudado
        FROM pagos p
        LEFT JOIN usuarios u ON u.id_usuario = p.id_usuario
        LEFT JOIN pagos_detalle pd ON pd.id_pago = p.id_pago
        WHERE p.fecha_pago >= ? AND p.fecha_pago <= ?
        GROUP BY p.id_usuario, u.nombre
        ORDER BY total_recaudado DESC, cuotas_financiadas DESC
        LIMIT 5
      `, [rango.inicio, rango.fin]),

      queryAsync(`
        SELECT
          u.nombre AS nombre,
          COALESCE(SUM(CASE WHEN pd.tipo_concepto = 'mora' THEN pd.subtotal ELSE 0 END), 0) AS total_mora
        FROM pagos p
        LEFT JOIN usuarios u ON u.id_usuario = p.id_usuario
        LEFT JOIN pagos_detalle pd ON pd.id_pago = p.id_pago
        WHERE p.fecha_pago >= ? AND p.fecha_pago <= ?
          AND pd.tipo_concepto = 'mora'
        GROUP BY p.id_usuario, u.nombre
        ORDER BY total_mora DESC
        LIMIT 5
      `, [rango.inicio, rango.fin]),

      queryAsync(`
        SELECT
          COALESCE(u.nombre, 'Sin asignación') AS nombre,
          COUNT(*) AS total_facturas,
          SUM(CASE WHEN fh.estado_factura = 'ANULADA' THEN 1 ELSE 0 END) AS anuladas,
          SUM(CASE WHEN fh.estado_factura = 'EMITIDA' THEN 1 ELSE 0 END) AS emitidas,
          COALESCE(SUM(CASE WHEN fh.estado_factura = 'EMITIDA' THEN fh.subtotal ELSE 0 END), 0) AS monto_emitido
        FROM facturas_historial fh
        LEFT JOIN usuarios u ON u.id_usuario = fh.id_usuario
        WHERE fh.fecha_evento >= ? AND fh.fecha_evento <= ?
        GROUP BY fh.id_usuario, u.nombre
        ORDER BY total_facturas DESC, emitidas DESC
        LIMIT 8
      `, [rango.inicio, rango.fin]),

      queryAsync(`
        SELECT
          COUNT(*) AS total_contratos,
          SUM(CASE WHEN estado = 'activo' THEN 1 ELSE 0 END) AS activos,
          SUM(CASE WHEN estado = 'inactivo' THEN 1 ELSE 0 END) AS inactivos,
          SUM(CASE WHEN COALESCE(mora.tiene_mora, 0) = 1 THEN 1 ELSE 0 END) AS con_mora,
          SUM(CASE WHEN COALESCE(mora.tiene_mora, 0) = 0 AND estado = 'activo' THEN 1 ELSE 0 END) AS al_dia
        FROM contratos_residentes c
        LEFT JOIN (
          SELECT id_contrato,
                 MAX(CASE WHEN estado != 'pagado' THEN 1 ELSE 0 END) AS tiene_mora
          FROM morosidad
          GROUP BY id_contrato
        ) mora ON mora.id_contrato = c.id_contrato
      `),

      queryAsync(`
        SELECT
          COUNT(*) AS total_clientes,
          SUM(CASE WHEN COALESCE(mora.tiene_mora, 0) = 0 THEN 1 ELSE 0 END) AS clientes_al_dia,
          SUM(CASE WHEN COALESCE(mora.tiene_mora, 0) = 1 THEN 1 ELSE 0 END) AS clientes_atrasados,
          SUM(CASE WHEN COALESCE(mora.tiene_mora, 0) = 0 THEN 1 ELSE 0 END) AS clientes_sin_mora,
          SUM(CASE WHEN COALESCE(mora.tiene_mora, 0) = 1 THEN 1 ELSE 0 END) AS clientes_con_mora
        FROM residentes r
        LEFT JOIN (
          SELECT c.id_residente,
                 MAX(CASE WHEN m.estado != 'pagado' THEN 1 ELSE 0 END) AS tiene_mora
          FROM contratos_residentes c
          LEFT JOIN morosidad m ON m.id_contrato = c.id_contrato
          GROUP BY c.id_residente
        ) mora ON mora.id_residente = r.id_residente
      `)
    ]);

    const resumen = resumenGeneral[0] || {};
    const contratos = contratosEstado[0] || {};
    const clientes = clientesEstado[0] || {};

    const totalFacturasEmitidas = (facturasPorUsuario || []).reduce((sum, item) => sum + Number(item.emitidas || 0), 0);
    const totalFacturasAnuladas = (facturasPorUsuario || []).reduce((sum, item) => sum + Number(item.anuladas || 0), 0);

    const payload = {
      periodo,
      rango: {
        inicio: rango.inicio,
        fin: rango.fin,
        etiqueta: rango.etiqueta
      },
      resumen: {
        total_cobrado: Number(resumen.total_cobrado || 0),
        total_mora: Number(resumen.total_mora || 0),
        cuotas_financiadas_cobradas: Number(resumen.cuotas_financiadas_cobradas || 0),
        contratos_con_cobro: Number(resumen.contratos_con_cobro || 0),
        clientes_activos: Number(clientes.total_clientes || 0),
        clientes_al_dia: Number(clientes.clientes_al_dia || 0),
        clientes_atrasados: Number(clientes.clientes_atrasados || 0),
        clientes_sin_mora: Number(clientes.clientes_sin_mora || 0),
        clientes_con_mora: Number(clientes.clientes_con_mora || 0),
        total_facturas_emitidas: totalFacturasEmitidas,
        total_facturas_anuladas: totalFacturasAnuladas,
        total_contratos: Number(contratos.total_contratos || 0),
        contratos_activos: Number(contratos.activos || 0),
        contratos_inactivos: Number(contratos.inactivos || 0),
        contratos_con_mora: Number(contratos.con_mora || 0),
        contratos_al_dia: Number(contratos.al_dia || 0)
      },
      top_cobradores: (topCobradores || []).map((fila) => ({
        nombre: fila.nombre || 'Sin asignación',
        cuotas_financiadas: Number(fila.cuotas_financiadas || 0),
        total_recaudado: Number(fila.total_recaudado || 0)
      })),
      top_cobradores_mora: (topMora || []).map((fila) => ({
        nombre: fila.nombre || 'Sin asignación',
        total_mora: Number(fila.total_mora || 0)
      })),
      facturas_por_usuario: (facturasPorUsuario || []).map((fila) => ({
        nombre: fila.nombre || 'Sin asignación',
        total_facturas: Number(fila.total_facturas || 0),
        emitidas: Number(fila.emitidas || 0),
        anuladas: Number(fila.anuladas || 0),
        monto_emitido: Number(fila.monto_emitido || 0)
      })),
      clientes_estado: {
        clientes_al_dia: Number(clientes.clientes_al_dia || 0),
        clientes_atrasados: Number(clientes.clientes_atrasados || 0),
        clientes_sin_mora: Number(clientes.clientes_sin_mora || 0),
        clientes_con_mora: Number(clientes.clientes_con_mora || 0)
      },
      contratos_estado: {
        total_contratos: Number(contratos.total_contratos || 0),
        activos: Number(contratos.activos || 0),
        inactivos: Number(contratos.inactivos || 0),
        con_mora: Number(contratos.con_mora || 0),
        al_dia: Number(contratos.al_dia || 0)
      },
      chart_clientes: [
        { label: 'Clientes al día', value: Number(clientes.clientes_al_dia || 0), color: '#198754' },
        { label: 'Clientes atrasados', value: Number(clientes.clientes_atrasados || 0), color: '#fd7e14' },
        { label: 'Sin mora', value: Number(clientes.clientes_sin_mora || 0), color: '#0d6efd' },
        { label: 'Con mora', value: Number(clientes.clientes_con_mora || 0), color: '#dc3545' }
      ],
      chart_contratos: [
        { label: 'Activos', value: Number(contratos.activos || 0), color: '#0d6efd' },
        { label: 'Inactivos', value: Number(contratos.inactivos || 0), color: '#6c757d' },
        { label: 'Con mora', value: Number(contratos.con_mora || 0), color: '#dc3545' },
        { label: 'Al día', value: Number(contratos.al_dia || 0), color: '#198754' }
      ]
    };

    return res.status(200).json(payload);
  } catch (error) {
    console.error('Error al generar el dashboard financiero:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo generar el dashboard financiero.',
      detail: error?.message || 'Error interno.'
    });
  }
});

module.exports = router;
