const express = require('express');
const cors = require('cors');
const app = express();
const { auditRequestMiddleware } = require('./auditingMiddleware');

// 1. Mover CORS arriba para que proteja/permita todas las rutas y formatos de datos
app.use(cors());

// Iniciar el programador de tareas automáticas (Cron Jobs)
require('./notificaciones');

// Aceptar datos pesados como fotos en Base64 (hasta 50 Megabytes)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Auditoría automática global para acciones mutables (POST/PUT/PATCH/DELETE).
app.use(auditRequestMiddleware);

// Importar los enrutadores modulares existentes
const tipos_contratosRouter = require('./router/Tipos_contratosRouter'); 
const residentesRouter = require('./router/ResidentesRouter');      
const usuariosRouter = require('./router/UsuariosRouter');      
const cajaRouter = require('./router/CajaRouter'); 
const resoluciones_facturasRouter = require('./router/Resoluciones_facturasRouter');
const contratosResidentesRouter = require('./router/Contratos_ResidentesRouter'); 
const empresasRouter = require('./router/EmpresasRouter');
const empresaProyectoRouter = require('./router/Empresa_proyectoRouter');
const proyectoRouter = require('./router/ProyectoRouter');
const bitacoraRouter = require('./router/BitacoraRouter'); 
const pagosRouter = require('./router/PagosRouter');
const pagosDetalleRouter = require('./router/Pagos_DetalleRouter');
const cajaIngresosRouter = require('./router/Caja_ingresosRouter');
const asignarCorrelativoRouter = require('./router/Asignar_CorrelativoRouter');

// 🔴 IMPORTAR ENRUTADORES DE LOS NUEVOS MÓDULOS
const anulacionDeudaRouter = require('./router/Anulacion_DeudaRouter');
const morosidadRouter = require('./router/MorosidadRouter');
const serviciosRouter = require('./router/ServiciosRouter');
const rolesRouter = require('./router/RolesRouter');
const pagosExtraordinariosRouter = require('./router/Pagos_ExtraordinariosRouter');
const estadoCuentaRouter = require('./router/Estado_CuentaRouter');


// 2. Declarar los prefijos de la API global existentes
app.use('/api/tipos_contratos', tipos_contratosRouter); 
app.use('/api/usuarios', usuariosRouter);                     
app.use('/api/residentes', residentesRouter);                     
app.use('/api/caja', cajaRouter); 
app.use('/api/resoluciones_facturas', resoluciones_facturasRouter);
app.use('/api/contratos_residentes', contratosResidentesRouter);
app.use('/api/empresas', empresasRouter);
app.use('/api/empresa_proyecto', empresaProyectoRouter);
app.use('/api/proyectos', proyectoRouter);
app.use('/api/bitacora', bitacoraRouter);
app.use('/api/pagos', pagosRouter);
app.use('/api/pagos_detalle', pagosDetalleRouter);
app.use('/api/caja_ingresos', cajaIngresosRouter);
app.use('/api/asignar_correlativo', asignarCorrelativoRouter);

// 🔴 INYECTAR LAS RUTAS DE LOS NUEVOS MÓDULOS A LA API
app.use('/api/anulacion_deuda', anulacionDeudaRouter);
app.use('/api/morosidad', morosidadRouter);
app.use('/api/servicios', serviciosRouter);
app.use('/api/roles', rolesRouter);
app.use('/api/pagos_extraordinarios', pagosExtraordinariosRouter);
app.use('/api/estado_cuenta', estadoCuentaRouter);


// 3. Inicialización del servidor central
app.listen(3001, () => {
    console.log("Servidor central corriendo perfectamente en el puerto 3001");
});