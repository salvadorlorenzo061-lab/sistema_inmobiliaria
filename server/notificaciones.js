const nodemailer = require('nodemailer');
const db = require('./Conexion'); 

//🛠️ CONFIGURACIÓN CON LA NUEVA BANDEJA DE MAILTRAP
const t_email = nodemailer.createTransport({
    host: "sandbox.smtp.mailtrap.io",
    port: 2525,
    auth: {
        user: "290e1dde28b544", // Pega el de la nueva bandeja
        pass: "ff30dbfc7264ee"  // Pega la de la nueva bandeja (sin asteriscos)
    }
});

console.log('⭐⭐⭐⭐⭐⭐¡SÍ, ESTOY EJECUTANDO EL ARCHIVO CORRECTO! ⭐⭐⭐⭐⭐•');

setTimeout(() => {
    const hoy = new Date();
    const mesHoy = hoy.getMonth() + 1;
    const diaHoy = hoy.getDate();

    const queryCumple = 'SELECT nombre, correo FROM residentes WHERE MONTH(fecha_nacimiento) = ? AND DAY(fecha_nacimiento) = ? AND estado = "activo"';

    db.query(queryCumple, [mesHoy, diaHoy], (err, residentesCumple) => {
        if (err) return console.error(err);
        if (!residentesCumple || residentesCumple.length === 0) return;

        residentesCumple.forEach(residente => {
            const opcionesEmail = {
                from: '"Inmobiliaria Express" <centrocpc2020@gmail.com>',
                to: residente.correo,
                subject: '¡Feliz Cumpleaños! 🎂🎉',
                html: `<h1>¡Muchas felicidades siiii, ${residente.nombre}!</h1>`
            };

            t_email.sendMail(opcionesEmail, (error, info) => {
                if (error) {
                    console.error(`❌ Error de credenciales para ${residente.correo}:`, error.message);
                } else {
                    console.log(`📧 ¡ÉXITO TOTAL EN MAILTRAP! Correo enviado a: ${residente.correo}`);
                }
            });
        });
    });
}, 500);

/*DESPUES USAR ESTE */
//PARA USAR DESPUES SOLO DEBEMOS DE QUITAR LO QUE ESTA HARRIBA 
/*const nodemailer = require('nodemailer');
const db = require('./Conexion'); 

// 🛠️ CONFIGURACIÓN SMTP DE MAILTRAP
const t_email = nodemailer.createTransport({
    host: "sandbox.smtp.mailtrap.io",
    port: 2525,
    auth: {
        user: "TU_USER_DE_MAILTRAP", 
        pass: "TU_PASS_DE_MAILTRAP"  
    }
});

console.log('⭐⭐⭐⭐⭐⭐¡SÍ, ESTOY EJECUTANDO EL ARCHIVO CORRECTO! ⭐⭐⭐⭐⭐⭐');

setTimeout(() => {
    const hoy = new Date();
    const mesHoy = hoy.getMonth() + 1;
    const diaHoy = hoy.getDate();

    const queryCumple = 'SELECT nombre, correo FROM residentes WHERE MONTH(fecha_nacimiento) = ? AND DAY(fecha_nacimiento) = ? AND estado = "activo"';

    db.query(queryCumple, [mesHoy, diaHoy], (err, residentesCumple) => {
        if (err) return console.error(err);
        if (!residentesCumple || residentesCumple.length === 0) return;

        console.log(`🎉 ¡Se encontraron ${residentesCumple.length} cumpleañero(s)!`);

        // Usamos el 'indice' para escalonar los envíos
        residentesCumple.forEach((residente, indice) => {
            const opcionesEmail = {
                from: '"Inmobiliaria Express" <centrocpc2020@gmail.com>',
                to: residente.correo,
                subject: '¡Feliz Cumpleaños! 🎂🎉',
                html: `<h1>¡Muchas felicidades, ${residente.nombre}!</h1><p>Prueba exitosa controlando el límite de tiempo.</p>`
            };

            // ⏱️ TRUCO: Multiplicamos el índice por 1500ms. 
            // El primer correo sale al instante (0ms), el segundo a los 1.5s, el tercero a los 3s...
            setTimeout(() => {
                t_email.sendMail(opcionesEmail, (error, info) => {
                    if (error) {
                        console.error(`❌ Error enviando correo a ${residente.correo}:`, error.message);
                    } else {
                        console.log(`📧 ¡ÉXITO TOTAL EN MAILTRAP! Correo enviado a: ${residente.correo}`);
                    }
                });
            }, indice * 1500); 
        });
    });
}, 500);*/