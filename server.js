const axios = require('axios');
const express = require('express');
const { Pool } = require('pg');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = 3002;

// 🚨 IMPORTANTE: Define aquí tu código secreto para autorizar ajustes.
const CODIGO_SECRETO_AJUSTE = '1022'; // ¡Cámbialo por algo seguro!

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// =======================================================
// ============== MÓDULO DE SEGURIDAD Y SESIONES ==============
// =======================================================

app.use(session({
    store: new pgSession({
        pool: pool,
        tableName: 'session'
    }),
    secret: 'un_secreto_para_el_sistema_de_administracion',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 días
    }
}));

const requireLogin = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
};

const requireAdminOrCoord = (req, res, next) => {
    if (!req.session.user || !req.session.user.rol) {
        return res.status(403).send('<h1>Acceso Denegado 🚫</h1><p>Su sesión es inválida o no contiene los permisos necesarios.</p>');
    }
    const userRole = req.session.user.rol.toLowerCase().trim();
    const allowedRoles = ['administrador', 'coordinador'];
    if (allowedRoles.includes(userRole)) {
        next();
    } else {
        res.status(403).send('<h1>Acceso Denegado 🚫</h1><p>No tienes los permisos necesarios para acceder a esta sección.</p>');
    }
};

app.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1 AND estado = $2', [username, 'activo']);
        const user = result.rows[0];
        if (!user) {
            return res.status(401).send('Usuario o contraseña incorrectos.');
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
            if (!user.rol) {
                return res.status(403).send('Acceso denegado. Tu usuario no tiene un rol definido.');
            }
            const userRole = user.rol.toLowerCase().trim();
            const allowedRoles = ['administrador', 'coordinador'];
            if (!allowedRoles.includes(userRole)) {
                return res.status(403).send('Acceso denegado. Este sistema es solo para administradores y coordinadores.');
            }
            req.session.user = { id: user.id, nombre: user.nombre, username: user.username, rol: user.rol };
            res.redirect('/');
        } else {
            res.status(401).send('Usuario o contraseña incorrectos.');
        }
    } catch (err) {
        console.error('Error en el login:', err);
        res.status(500).send('Error en el servidor.');
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/');
        }
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});
app.post('/descartar-cotizacion/:id', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { id } = req.params;
    try {
        const client = await pool.connect();
        await client.query('UPDATE quotes SET is_discarded = TRUE WHERE id = $1', [id]);
        client.release();
        res.redirect('/proyectos-por-activar');
    } catch (error) {
        console.error("Error al descartar cotización:", error);
        res.status(500).send('Error al procesar la solicitud.');
    }
});
// =======================================================
// ============== ESTILOS Y MENÚS DE NAVEGACIÓN ==============
// =======================================================

const commonHtmlHead = `
    <meta charset="UTF-8">
    <title>Panel de Administración</title>
    <style>
        :root {
            --primary: #0056b3;
            --success: #28a745;
            --danger: #dc3545;
            --warning: #ffc107;
            --info: #17a2b8;
            --dark: #2c3e50;
            --light: #f8f9fa;
            --gray: #6c757d;
            --shadow: 0 4px 6px rgba(0,0,0,0.1);
        }

        body { 
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
            margin: 0; 
            background-color: #f0f2f5; 
            color: #333; 
            line-height: 1.5;
        }

        .container { max-width: 1200px; margin: 20px auto; padding: 20px; }
        
        h1, h2 { color: var(--primary); font-weight: 700; }

        /* Navegación y Header */
        nav { 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            margin-bottom: 30px; 
            background-color: #fff; 
            padding: 15px 25px; 
            border-radius: 12px; 
            box-shadow: var(--shadow); 
        }
        nav .links a { margin-right: 25px; text-decoration: none; font-weight: 600; color: var(--primary); transition: color 0.2s; }
        nav .links a:hover { color: #004494; }
        .logout-form button { background: var(--danger); color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 600; }

        /* Dashboard Cards */
        .dashboard { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 25px; }
        .dashboard-card { 
            background-color: #fff; 
            border-radius: 12px; 
            box-shadow: var(--shadow); 
            padding: 25px; 
            text-decoration: none; 
            color: inherit; 
            display: block; 
            transition: transform 0.3s, box-shadow 0.3s; 
            border-top: 5px solid var(--primary);
        }
        .dashboard-card:hover { transform: translateY(-8px); box-shadow: 0 12px 20px rgba(0,0,0,0.15); }
        .dashboard-card h3 { margin: 0 0 12px; color: var(--primary); }

        /* Tablas Profesionales (Efecto de filas flotantes) */
        table { 
            width: 100%; 
            border-collapse: separate; 
            border-spacing: 0 10px; 
            margin-top: 20px; 
        }
        th { 
            background-color: transparent; 
            color: var(--gray); 
            padding: 15px; 
            text-align: left; 
            text-transform: uppercase; 
            font-size: 0.75rem; 
            letter-spacing: 1px;
            border: none;
        }
        td { 
            background-color: white; 
            padding: 18px 15px; 
            border-top: 1px solid #edf2f7; 
            border-bottom: 1px solid #edf2f7;
            vertical-align: middle;
        }
        td:first-child { border-left: 1px solid #edf2f7; border-radius: 10px 0 0 10px; }
        td:last-child { border-right: 1px solid #edf2f7; border-radius: 0 10px 10px 0; }
        
        tr:hover td { background-color: #fdfdfd; transform: scale(1.002); transition: 0.2s; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }

        /* Botones y Badges */
        .btn { 
            padding: 10px 20px; 
            border-radius: 8px; 
            cursor: pointer; 
            font-weight: 600; 
            text-decoration: none; 
            display: inline-flex; 
            align-items: center; 
            transition: all 0.2s;
            border: none;
            font-size: 14px;
        }
        .btn-activar { background-color: var(--success); color: white; box-shadow: 0 2px 4px rgba(40, 167, 69, 0.3); }
        .btn-activar:hover { background-color: #218838; transform: translateY(-1px); }
        
        /* Nuevo botón para Descartar/Ocultar */
        .btn-discard { background-color: #f1f3f5; color: var(--gray); margin-left: 8px; }
        .btn-discard:hover { background-color: #e9ecef; color: var(--danger); }

        /* Badges para Asesores */
        .advisor-badge {
            background-color: #e7f1ff;
            color: var(--primary);
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 0.85rem;
            font-weight: 600;
            display: inline-block;
        }

        /* Formularios y otros */
        .form-container { background: white; padding: 25px; border-radius: 12px; box-shadow: var(--shadow); margin-top: 20px; }
        .form-group label { display: block; margin-bottom: 8px; font-weight: 600; color: var(--dark); }
        textarea { border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px; transition: border-color 0.2s; }
        textarea:focus { border-color: var(--primary); outline: none; }

        .summary-box { background-color: white; padding: 25px; border-radius: 12px; box-shadow: var(--shadow); border-bottom: 4px solid var(--primary); }
        .summary-box .amount { font-size: 28px; letter-spacing: -1px; }
        
        .back-link { 
            text-decoration: none; 
            color: var(--gray); 
            font-weight: 600; 
            display: inline-flex; 
            align-items: center; 
            margin-bottom: 20px; 
            transition: color 0.2s;
        }
        .back-link:hover { color: var(--primary); }
    </style>
`;
const dashboardHeader = (user) => `
    <header class="dashboard-header">
        <h1>Sistema de Administración</h1>
        <div class="user-info">
            <span>Hola, ${user.nombre.split(' ')[0]}</span>
            <form class="logout-form" action="/logout" method="POST" style="display: inline; margin-left: 15px;">
                <button type="submit">Cerrar Sesión</button>
            </form>
        </div>
    </header>
`;

const backToDashboardLink = `<a href="/" class="back-link">🏠 Volver al Panel Principal</a>`;
// =======================================================
// ============== RUTAS DE LA APLICACIÓN ==============
// =======================================================

app.get('/', requireLogin, requireAdminOrCoord, (req, res) => {
    res.send(`
        <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
            <div class="container">
                ${dashboardHeader(req.session.user)}
                <div class="module" style="margin-top: 40px;">
                    <h2>Proyectos y Clientes</h2>
                    <div class="dashboard">
                        <a href="/proyectos-por-activar" class="dashboard-card"><h3>📬 Proyectos por Activar</h3><p>Revisa y activa las cotizaciones formalizadas.</p></a>
                        <a href="/clientes" class="dashboard-card"><h3>🗂️ Clientes con Proyectos Activos</h3><p>Gestiona abonos y gastos de los proyectos.</p></a>
                        <a href="/todos-los-centros" class="dashboard-card"><h3>🏢 Directorio de Centros</h3><p>Consulta la lista completa de centros.</p></a>
                    </div>
                </div>
                <div class="module">
                    <h2>Finanzas y Contabilidad</h2>
                    <div class="dashboard">
                        <a href="/caja-chica" class="dashboard-card"><h3>💰 Caja Chica</h3><p>Gestiona el fondo, gastos y cierres de caja chica.</p></a>
                        <a href="/cuentas-por-pagar" class="dashboard-card"><h3>🧾 Cuentas por Pagar</h3><p>Gestiona las facturas pendientes de tus suplidores.</p></a>
                        <a href="/cuentas-por-cobrar" class="dashboard-card"><h3>📊 Cuentas por Cobrar</h3><p>Consulta un resumen de todas las deudas pendientes.</p></a>
                        <a href="/reporte-gastos" class="dashboard-card"><h3>🧾 Reporte de Gastos</h3><p>Consulta un resumen de todos los gastos de la empresa.</p></a>
                        <a href="/gastos-generales" class="dashboard-card"><h3>💸 Registrar Gasto General</h3><p>Registra desembolsos y gastos administrativos.</p></a>
                        <a href="/suplidores" class="dashboard-card"><h3>🚚 Gestionar Suplidores</h3><p>Añade o edita la información de tus suplidores.</p></a>
                    </div>
                </div>
                <div class="module">
                    <h2>Personal y Pagos</h2>
                    <div class="dashboard">
                        <a href="/gestionar-asesores" class="dashboard-card"><h3>📊 Gestionar Asesores</h3><p>Define asesores, al coordinador y sus tasas de comisión.</p></a>
                        <a href="/pagar-comisiones" class="dashboard-card"><h3>💵 Pagar Comisiones</h3><p>Revisa y marca como pagadas las comisiones pendientes.</p></a>
                        <a href="/empleados" class="dashboard-card"><h3>👥 Gestionar Empleados</h3><p>Añade o edita la información de tu personal.</p></a>
                        <a href="/gestionar-prestamos" class="dashboard-card"><h3>🏦 Gestionar Préstamos</h3><p>Registra y consulta préstamos a colaboradores.</p></a> 
                        <a href="/gestionar-avances" class="dashboard-card"><h3>💰 Gestionar Avances</h3><p>Registra y consulta los avances de sueldo.</p></a>
                        <a href="/generar-nomina" class="dashboard-card"><h3>💵 Generar Nómina</h3><p>Calcula la nómina quincenal de tu equipo.</p></a>
                        <a href="/historial-nomina" class="dashboard-card"><h3>📂 Historial de Nómina</h3><p>Consulta los registros de pagos de nómina anteriores.</p></a>
                    </div>
                </div>
            </div>
        </body></html>
    `);
});
app.get('/todos-los-centros', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM centers ORDER BY name ASC;');
        const centers = result.rows;
        client.release();
        let centersHtml = centers.map(center => `<tr><td>${center.id}</td><td>${center.name}</td><td>${center.contactname || 'No especificado'}</td><td>${center.contactnumber || 'No especificado'}</td></tr>`).join('');
        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
                <div class="container">
                    ${backToDashboardLink}
                    <h2>Directorio de Todos los Centros</h2>
                    <table><thead><tr><th>ID</th><th>Nombre del Centro</th><th>Contacto</th><th>Teléfono</th></tr></thead><tbody>${centersHtml}</tbody></table>
                </div>
            </body></html>`);
    } catch (error) {
        res.status(500).send('<h1>Error al cargar la página ❌</h1>');
    }
});

app.get('/clientes', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query(`SELECT DISTINCT c.* FROM centers c INNER JOIN quotes q ON c.name = q.clientname WHERE q.status = 'activa'`);
        const clients = result.rows;
        client.release();
        let clientsHtml = clients.map(client => `<tr><td>${client.id}</td><td><a href="/proyecto/${client.id}">${client.name}</a></td><td>${client.contactname || 'No especificado'}</td><td>${client.contactnumber || 'No especificado'}</td></tr>`).join('');
        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
                <div class="container">
                    ${backToDashboardLink}
                    <h2>Lista de Clientes con Proyectos Activos</h2>
                    <table><thead><tr><th>ID</th><th>Nombre del Cliente</th><th>Contacto</th><th>Teléfono</th></tr></thead><tbody>${clientsHtml}</tbody></table>
                </div>
            </body></html>`);
    } catch (error) {
        res.status(500).send('<h1>Error al obtener la lista de clientes ❌</h1>');
    }
});

app.get('/proyectos-por-activar', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const client = await pool.connect();
        // SELECT SIMPLE: Trae todo lo formalizado que no esté oculto/descartado
        const result = await client.query(
            `SELECT * FROM quotes 
             WHERE status = 'formalizada' 
             AND (is_discarded IS FALSE OR is_discarded IS NULL)
             ORDER BY createdat ASC`
        );
        const quotes = result.rows;
        client.release();

        let quotesHtml = quotes.map(quote => `
            <tr>
                <td style="font-weight: bold; color: var(--primary);"># ${quote.quotenumber}</td>
                <td style="text-align: center;">
                    <a href="/ver-cotizacion-pdf/${quote.id}" target="_blank" class="btn" style="padding: 5px 10px; font-size: 13px; background-color: var(--gray); color: white;">
                        Ver PDF 📄
                    </a>
                </td>
                <td style="font-weight: 600;">${quote.clientname}</td>
                <td><span class="advisor-badge">${quote.advisorname}</span></td>
                <td>
                    <textarea name="notas_administrativas" rows="2" placeholder="Notas internas..." form="form-activar-${quote.id}"></textarea>
                </td>
                <td style="text-align: center;">
                    <div style="display: flex; gap: 8px; justify-content: center;">
                        <form id="form-activar-${quote.id}" action="/activar-proyecto/${quote.id}" method="POST">
                            <button type="submit" class="btn btn-activar">Activar</button>
                        </form>
                        
                        <form action="/descartar-cotizacion/${quote.id}" method="POST" onsubmit="return confirm('¿Seguro que deseas ocultar esta cotización?');">
                            <button type="submit" class="btn btn-discard" title="Ocultar">✖</button>
                        </form>
                    </div>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--gray);">No hay proyectos pendientes.</td></tr>';

        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
                <div class="container">
                    ${backToDashboardLink}
                    <h2>Proyectos Formalizados por Activar</h2>
                    <table>
                        <thead>
                            <tr>
                                <th># ID</th>
                                <th>Cotización</th>
                                <th>Cliente / Institución</th>
                                <th>Asesor</th>
                                <th>Notas Administrativas</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${quotesHtml}
                        </tbody>
                    </table>
                </div>
            </body></html>`);
    } catch (error) {
        console.error("Error en /proyectos-por-activar:", error);
        res.status(500).send('<h1>Error al cargar la página ❌</h1>');
    }
});
app.post('/activar-proyecto/:id', requireLogin, requireAdminOrCoord, async (req, res) => {
    const quoteId = req.params.id;
    const { notas_administrativas } = req.body;
    try {
        const client = await pool.connect();
        await client.query("UPDATE quotes SET status = 'activa', notas_administrativas = $1 WHERE id = $2", [notas_administrativas, quoteId]);
        client.release();
        res.redirect('/clientes');
    } catch (error) {
        res.status(500).send('<h1>Error al activar el proyecto ❌</h1>');
    }
});

app.get('/ver-cotizacion-pdf/:quoteId', requireLogin, async (req, res) => {
    try {
        const { quoteId } = req.params;
        const gestionApiUrl = `https://be-gestion.onrender.com/api/quote-requests/${quoteId}/pdf`;

        const response = await axios.get(gestionApiUrl, {
            headers: {
                // --- CORRECCIÓN APLICADA AQUÍ ---
                'X-API-Key': 'ProyectoConfeccion2025'
            },
            responseType: 'stream'
        });
        
        res.setHeader('Content-Type', 'application/pdf');
        response.data.pipe(res);

    } catch (error) {
        // Esta línea es la que nos dio el error 401
        console.error("Error en el proxy de PDF:", error.message);
        res.status(500).send("Error al obtener el documento de la cotización.");
    }
});

app.get('/suplidores', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM suppliers ORDER BY name ASC');
        const suppliers = result.rows;
        client.release();
        let suppliersHtml = suppliers.map(s => `<tr><td>${s.id}</td><td>${s.name}</td><td>${s.contact_info || ''}</td></tr>`).join('');
        if (suppliers.length === 0) {
            suppliersHtml = '<tr><td colspan="3">No hay suplidores registrados.</td></tr>';
        }
        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
                <div class="container">
                    ${backToDashboardLink}
                    <h2>Lista de Suplidores</h2>
                    <table><thead><tr><th>ID</th><th>Nombre del Suplidor</th><th>Información de Contacto</th></tr></thead><tbody>${suppliersHtml}</tbody></table>
                    <div class="form-container"><h2>Añadir Nuevo Suplidor</h2><form action="/suplidores" method="POST"><div class="form-group"><label for="name">Nombre:</label><input type="text" id="name" name="name" required></div><div class="form-group"><label for="contact_info">Contacto:</label><textarea id="contact_info" name="contact_info" rows="3"></textarea></div><button type="submit" class="btn">Guardar Suplidor</button></form></div>
                </div>
            </body></html>`);
    } catch (error) {
        res.status(500).send('<h1>Error al cargar la página de suplidores ❌</h1>');
    }
});

app.post('/suplidores', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { name, contact_info } = req.body;
    if (!name) return res.status(400).send("El nombre del suplidor es obligatorio.");
    try {
        const client = await pool.connect();
        await client.query('INSERT INTO suppliers (name, contact_info) VALUES ($1, $2)', [name, contact_info]);
        client.release();
        res.redirect('/suplidores');
    } catch (error) {
        if (error.code === '23505') return res.status(409).send('<h1>Error: Ya existe un suplidor con ese nombre.</h1>');
        res.status(500).send('<h1>Error al guardar el suplidor ❌</h1>');
    }
});
app.get('/proyectos-descartados', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const client = await pool.connect();
        // Traemos solo los que están marcados como descartados
        const result = await client.query(
            `SELECT * FROM quotes 
             WHERE is_discarded IS TRUE 
             ORDER BY createdat DESC`
        );
        const quotes = result.rows;
        client.release();

        let quotesHtml = quotes.map(quote => `
            <tr>
                <td style="font-weight: bold;"># ${quote.quotenumber}</td>
                <td>${quote.clientname}</td>
                <td><span class="advisor-badge">${quote.advisorname}</span></td>
                <td style="text-align: center;">
                    <form action="/restaurar-cotizacion/${quote.id}" method="POST">
                        <button type="submit" class="btn" style="background-color: var(--info); color: white;">
                            Restaurar al Puente ↩️
                        </button>
                    </form>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="4" style="text-align: center; padding: 40px; color: var(--gray);">No hay proyectos en el historial de descartados.</td></tr>';

        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
                <div class="container">
                    <a href="/proyectos-por-activar" class="back-link">↩️ Volver a Proyectos por Activar</a>
                    <h2>Historial de Proyectos Descartados (Pasivos)</h2>
                    <p style="color: var(--gray); margin-bottom: 20px;">Aquí puedes ver y restaurar las cotizaciones que fueron ocultadas del puente principal.</p>
                    <table>
                        <thead>
                            <tr>
                                <th># ID</th>
                                <th>Cliente / Institución</th>
                                <th>Asesor</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${quotesHtml}
                        </tbody>
                    </table>
                </div>
            </body></html>`);
    } catch (error) {
        console.error("Error en /proyectos-descartados:", error);
        res.status(500).send('<h1>Error al cargar el historial ❌</h1>');
    }
});
// =======================================================
//   NUEVAS RUTAS PARA CUENTAS POR PAGAR
// =======================================================

// --- PÁGINA PRINCIPAL DE CUENTAS POR PAGAR ---
app.get('/cuentas-por-pagar', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const client = await pool.connect();
        const [suppliersResult, invoicesResult] = await Promise.all([
            client.query('SELECT * FROM suppliers ORDER BY name ASC'),
            client.query(`
                SELECT f.*, s.name as supplier_name,
                       COALESCE(p.total_pagado, 0) as total_pagado
                FROM facturas_suplidores f
                JOIN suppliers s ON f.supplier_id = s.id
                LEFT JOIN (
                    SELECT factura_id, SUM(amount_paid) as total_pagado 
                    FROM pagos_a_suplidores 
                    GROUP BY factura_id
                ) p ON f.id = p.factura_id
                WHERE f.estado != 'pagada'
                ORDER BY f.fecha_vencimiento ASC NULLS LAST, f.fecha_factura ASC
            `)
        ]);
        client.release();

        const suppliers = suppliersResult.rows;
        const invoices = invoicesResult.rows;

        const totalAdeudado = invoices.reduce((sum, inv) => sum + (parseFloat(inv.monto_total) - parseFloat(inv.total_pagado)), 0);
        
        let suppliersOptionsHtml = suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        let invoicesHtml = invoices.map(inv => {
            const hoy = new Date();
            hoy.setHours(0,0,0,0);
            const fechaVencimiento = inv.fecha_vencimiento ? new Date(inv.fecha_vencimiento) : null;
            let estiloFila = 'style="cursor: pointer;" onclick="window.location.href=\'/factura-suplidor/' + inv.id + '\';"';
            if (fechaVencimiento && fechaVencimiento < hoy) {
                estiloFila = 'style="background-color: #f8d7da; color: #721c24; cursor: pointer;" onclick="window.location.href=\'/factura-suplidor/' + inv.id + '\';"';
            }
            const balance = parseFloat(inv.monto_total) - parseFloat(inv.total_pagado);

            return `<tr ${estiloFila}>
                <td>${inv.supplier_name}</td>
                <td>${inv.numero_factura || 'N/A'}</td>
                <td>${new Date(inv.fecha_factura).toLocaleDateString()}</td>
                <td>${fechaVencimiento ? new Date(fechaVencimiento).toLocaleDateString() : 'N/A'}</td>
                <td>$${parseFloat(inv.monto_total).toFixed(2)}</td>
                <td style="font-weight: bold; color: #dc3545;">$${balance.toFixed(2)}</td>
                <td>${inv.estado.charAt(0).toUpperCase() + inv.estado.slice(1)}</td>
            </tr>`
        }).join('') || '<tr><td colspan="7">No hay cuentas por pagar pendientes.</td></tr>';

        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
                <div class="container">
                    ${backToDashboardLink}
                    <h2>Cuentas por Pagar a Suplidores</h2>
                    <div class="summary">
                        <div class="summary-box" style="grid-column: span 3; margin: auto;">
                            <h3>Total Pendiente de Pago</h3>
                            <p class="amount red">$${totalAdeudado.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                    </div>

                    <div class="form-container">
                        <h3>Registrar Nueva Factura de Suplidor</h3>
                        <form action="/cuentas-por-pagar" method="POST">
                            <div class="form-group"><label>Suplidor:</label><select name="supplier_id" required>${suppliersOptionsHtml}</select></div>
                            <div class="form-group"><label>Número de Factura (Opcional):</label><input type="text" name="numero_factura"></div>
                            <div class="form-group"><label>Fecha de la Factura:</label><input type="date" name="fecha_factura" required></div>
                            <div class="form-group"><label>Fecha de Vencimiento (Opcional):</label><input type="date" name="fecha_vencimiento"></div>
                            <div class="form-group"><label>Monto Total:</label><input type="number" name="monto_total" step="0.01" required></div>
                            <div class="form-group"><label>Descripción / Concepto:</label><textarea name="descripcion" rows="2" required></textarea></div>
                            <button type="submit" class="btn">Guardar Factura</button>
                        </form>
                    </div>

                    <hr style="margin: 40px 0;">
                    <h3>Facturas Pendientes</h3>
                    <table>
                        <thead><tr><th>Suplidor</th><th># Factura</th><th>Fecha Factura</th><th>Fecha Vencimiento</th><th>Monto Total</th><th>Balance Pendiente</th><th>Estado</th></tr></thead>
                        <tbody>${invoicesHtml}</tbody>
                    </table>
                </div>
            </body></html>
        `);
    } catch (error) {
        console.error("Error al cargar la página de cuentas por pagar:", error);
        res.status(500).send('<h1>Error al cargar la página ❌</h1>');
    }
});
// --- RUTA PARA GUARDAR UNA NUEVA FACTURA DE SUPLIDOR ---
app.post('/cuentas-por-pagar', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { supplier_id, numero_factura, fecha_factura, fecha_vencimiento, monto_total, descripcion } = req.body;
    if (!supplier_id || !fecha_factura || !monto_total || !descripcion) {
        return res.status(400).send("El suplidor, fecha, monto y descripción son obligatorios.");
    }
    try {
        const client = await pool.connect();
        await client.query(
            `INSERT INTO facturas_suplidores (supplier_id, numero_factura, fecha_factura, fecha_vencimiento, monto_total, descripcion) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [supplier_id, numero_factura || null, fecha_factura, fecha_vencimiento || null, monto_total, descripcion]
        );
        client.release();
        res.redirect('/cuentas-por-pagar');
    } catch (error) {
        console.error("Error al guardar la factura de suplidor:", error);
        res.status(500).send('<h1>Error al guardar la factura ❌</h1>');
    }
});
// =======================================================
//   NUEVAS RUTAS PARA DETALLES Y PAGOS DE FACTURAS A SUPLIDORES
// =======================================================

// --- PÁGINA DE DETALLE DE UNA FACTURA ESPECÍFICA ---
app.get('/factura-suplidor/:id', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { id } = req.params;
    try {
        const client = await pool.connect();
        const invoiceResult = await client.query(
            `SELECT f.*, s.name as supplier_name 
             FROM facturas_suplidores f
             JOIN suppliers s ON f.supplier_id = s.id 
             WHERE f.id = $1`, [id]);
        
        const paymentsResult = await client.query(
            `SELECT * FROM pagos_a_suplidores WHERE factura_id = $1 ORDER BY payment_date DESC`, [id]);
        client.release();

        if (invoiceResult.rows.length === 0) {
            return res.status(404).send('Factura no encontrada.');
        }

        const invoice = invoiceResult.rows[0];
        const payments = paymentsResult.rows;

        const totalPagado = payments.reduce((sum, p) => sum + parseFloat(p.amount_paid), 0);
        const balancePendiente = parseFloat(invoice.monto_total) - totalPagado;

        let paymentsHtml = payments.map(p => `
            <tr>
                <td>${new Date(p.payment_date).toLocaleDateString()}</td>
                <td>$${parseFloat(p.amount_paid).toFixed(2)}</td>
                <td>${p.payment_method || 'N/A'}</td>
                <td style="text-align:center;">
                    <a href="/recibo-pago-suplidor/${p.id}/pdf" target="_blank" class="btn" style="padding: 5px 10px; font-size: 14px;">Imprimir</a>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="4">No se han registrado pagos para esta factura.</td></tr>';

        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
                <div class="container">
                    <a href="/cuentas-por-pagar" class="back-link">↩️ Volver a Cuentas por Pagar</a>
                    <h2>Detalle de Factura: ${invoice.numero_factura || `ID ${invoice.id}`}</h2>
                    <p><strong>Suplidor:</strong> ${invoice.supplier_name}</p>
                    
                    <div class="summary">
                        <div class="summary-box"><h3>Monto Total</h3><p class="amount">$${parseFloat(invoice.monto_total).toFixed(2)}</p></div>
                        <div class="summary-box"><h3>Total Pagado</h3><p class="amount green">$${totalPagado.toFixed(2)}</p></div>
                        <div class="summary-box"><h3>Balance Pendiente</h3><p class="amount red">$${balancePendiente.toFixed(2)}</p></div>
                    </div>

                    ${balancePendiente > 0 ? `
                    <div class="form-container">
                        <h3>Registrar Nuevo Abono / Pago</h3>
                        <form action="/factura-suplidor/${id}/registrar-pago" method="POST">
                            <div class="form-group"><label>Fecha del Pago:</label><input type="date" name="payment_date" required></div>
                            <div class="form-group"><label>Monto Pagado:</label><input type="number" name="amount_paid" step="0.01" max="${balancePendiente.toFixed(2)}" required></div>
                            <div class="form-group"><label>Método de Pago (Opcional):</label><input type="text" name="payment_method" placeholder="Ej: Transferencia, Efectivo..."></div>
                            <div class="form-group"><label>Notas (Opcional):</label><textarea name="notes" rows="2"></textarea></div>
                            <button type="submit" class="btn">Guardar Pago</button>
                        </form>
                    </div>` : '<h3 style="text-align:center; color: #28a745;">Esta factura ha sido saldada.</h3>'}

                    <hr style="margin: 40px 0;">
                    <h3>Historial de Pagos Realizados</h3>
                    <table>
                        <thead><tr><th>Fecha de Pago</th><th>Monto</th><th>Método</th><th>Acciones</th></tr></thead>
                        <tbody>${paymentsHtml}</tbody>
                    </table>
                </div>
            </body></html>
        `);
    } catch (error) {
        console.error("Error al cargar detalle de factura:", error);
        res.status(500).send('<h1>Error al cargar la página ❌</h1>');
    }
});

// --- RUTA PARA GUARDAR UN PAGO A UNA FACTURA ---
app.post('/factura-suplidor/:facturaId/registrar-pago', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { facturaId } = req.params;
    const { payment_date, amount_paid, payment_method, notes } = req.body;
    
    if (!payment_date || !amount_paid) {
        return res.status(400).send("La fecha y el monto son obligatorios.");
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(
            `INSERT INTO pagos_a_suplidores (factura_id, payment_date, amount_paid, payment_method, notes) 
             VALUES ($1, $2, $3, $4, $5)`,
            [facturaId, payment_date, amount_paid, payment_method || null, notes || null]
        );

        const totalsResult = await client.query(
            `SELECT 
                f.monto_total,
                COALESCE(SUM(p.amount_paid), 0) as total_pagado
             FROM facturas_suplidores f
             LEFT JOIN pagos_a_suplidores p ON f.id = p.factura_id
             WHERE f.id = $1
             GROUP BY f.monto_total`, [facturaId]
        );

        const montoTotal = parseFloat(totalsResult.rows[0].monto_total);
        const totalPagado = parseFloat(totalsResult.rows[0].total_pagado);
        const nuevoEstado = totalPagado >= montoTotal ? 'pagada' : 'pagada parcialmente';

        await client.query(
            `UPDATE facturas_suplidores SET estado = $1 WHERE id = $2`,
            [nuevoEstado, facturaId]
        );

        await client.query('COMMIT');
        res.redirect(`/factura-suplidor/${facturaId}`);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error al registrar el pago:", error);
        res.status(500).send('<h1>Error al registrar el pago ❌</h1>');
    } finally {
        client.release();
    }
});

// --- RUTA PARA GENERAR EL PDF DEL RECIBO DE PAGO A SUPLIDOR ---
app.get('/recibo-pago-suplidor/:pagoId/pdf', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const { pagoId } = req.params;
        const client = await pool.connect();
        const result = await client.query(`
            SELECT p.*, f.numero_factura, f.descripcion, s.name as supplier_name 
            FROM pagos_a_suplidores p
            JOIN facturas_suplidores f ON p.factura_id = f.id
            JOIN suppliers s ON f.supplier_id = s.id
            WHERE p.id = $1`, [pagoId]);
        client.release();

        if (result.rows.length === 0) {
            return res.status(404).send('Pago no encontrado.');
        }
        const pago = result.rows[0];

        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=pago-suplidor-${pago.id}.pdf`);
        doc.pipe(res);

        doc.image(path.join(__dirname, 'plantillas', 'membrete.jpg'), 0, 0, { width: doc.page.width, height: doc.page.height });
        
        doc.y = 280;
        doc.font('Helvetica-Bold').fontSize(20).text('COMPROBANTE DE PAGO A SUPLIDOR', { align: 'center' });
        doc.moveDown(3);

        doc.font('Helvetica').fontSize(11);
        doc.text(`Fecha de Pago: ${new Date(pago.payment_date).toLocaleDateString('es-DO')}`, { align: 'right' });
        doc.moveDown();

        doc.font('Helvetica-Bold').text('PAGADO A: ').font('Helvetica').text(pago.supplier_name);
        doc.moveDown();
        
        const formattedAmount = parseFloat(pago.amount_paid).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        doc.font('Helvetica-Bold').text('MONTO PAGADO: ').font('Helvetica-Bold').fontSize(14).text(`RD$ ${formattedAmount}`);
        doc.moveDown();

        doc.font('Helvetica-Bold').fontSize(11).text('EN CONCEPTO DE:').font('Helvetica').fontSize(10).text(`Abono a factura #${pago.numero_factura || pago.factura_id} (${pago.descripcion})`);
        doc.moveDown(8);

        doc.font('Helvetica').fontSize(10);
        const signatureY = doc.y > 650 ? 700 : doc.y + 80;
        doc.text('___________________________', 70, signatureY);
        doc.font('Helvetica-Bold').text(pago.supplier_name, 70, signatureY + 15);
        doc.font('Helvetica').text('Recibido Conforme (Firma)', 70, signatureY + 30);

        doc.text('___________________________', 350, signatureY, { align: 'right' });
        doc.font('Helvetica-Bold').text('Autorizado por', 350, signatureY + 15, { align: 'right' });

        doc.end();
    } catch (error) {
        console.error("Error al generar el PDF de pago a suplidor:", error);
        res.status(500).send('Error al generar el recibo PDF.');
    }
});
// =======================================================
//   NUEVAS RUTAS PARA CUENTAS POR PAGAR
// =======================================================

// --- PÁGINA PRINCIPAL DE CUENTAS POR PAGAR ---
app.get('/cuentas-por-pagar', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const client = await pool.connect();
        const [suppliersResult, invoicesResult] = await Promise.all([
            client.query('SELECT * FROM suppliers ORDER BY name ASC'),
            client.query(`
                SELECT f.*, s.name as supplier_name,
                       COALESCE(p.total_pagado, 0) as total_pagado
                FROM facturas_suplidores f
                JOIN suppliers s ON f.supplier_id = s.id
                LEFT JOIN (
                    SELECT factura_id, SUM(amount_paid) as total_pagado 
                    FROM pagos_a_suplidores 
                    GROUP BY factura_id
                ) p ON f.id = p.factura_id
                WHERE f.estado != 'pagada'
                ORDER BY f.fecha_vencimiento ASC NULLS LAST, f.fecha_factura ASC
            `)
        ]);
        client.release();

        const suppliers = suppliersResult.rows;
        const invoices = invoicesResult.rows;

        const totalAdeudado = invoices.reduce((sum, inv) => sum + (parseFloat(inv.monto_total) - parseFloat(inv.total_pagado)), 0);
        
        let suppliersOptionsHtml = suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        let invoicesHtml = invoices.map(inv => {
            const hoy = new Date();
            hoy.setHours(0,0,0,0);
            const fechaVencimiento = inv.fecha_vencimiento ? new Date(inv.fecha_vencimiento) : null;
            let estiloFila = 'style="cursor: pointer;" onclick="window.location.href=\'/factura-suplidor/' + inv.id + '\';"';
            if (fechaVencimiento && fechaVencimiento < hoy) {
                estiloFila = 'style="background-color: #f8d7da; color: #721c24; cursor: pointer;" onclick="window.location.href=\'/factura-suplidor/' + inv.id + '\';"'; // Estilo para facturas vencidas
            }
            const balance = parseFloat(inv.monto_total) - parseFloat(inv.total_pagado);

            return `<tr ${estiloFila}>
                <td>${inv.supplier_name}</td>
                <td>${inv.numero_factura || 'N/A'}</td>
                <td>${new Date(inv.fecha_factura).toLocaleDateString()}</td>
                <td>${fechaVencimiento ? new Date(fechaVencimiento).toLocaleDateString() : 'N/A'}</td>
                <td>$${parseFloat(inv.monto_total).toFixed(2)}</td>
                <td style="font-weight: bold; color: #dc3545;">$${balance.toFixed(2)}</td>
                <td>${inv.estado.charAt(0).toUpperCase() + inv.estado.slice(1)}</td>
            </tr>`
        }).join('') || '<tr><td colspan="7">No hay cuentas por pagar pendientes.</td></tr>';

        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
                <div class="container">
                    ${backToDashboardLink}
                    <h2>Cuentas por Pagar a Suplidores</h2>
                    <div class="summary">
                        <div class="summary-box" style="grid-column: span 3; margin: auto;">
                            <h3>Total Pendiente de Pago</h3>
                            <p class="amount red">$${totalAdeudado.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                    </div>

                    <div class="form-container">
                        <h3>Registrar Nueva Factura de Suplidor</h3>
                        <form action="/cuentas-por-pagar" method="POST">
                            <div class="form-group"><label>Suplidor:</label><select name="supplier_id" required>${suppliersOptionsHtml}</select></div>
                            <div class="form-group"><label>Número de Factura (Opcional):</label><input type="text" name="numero_factura"></div>
                            <div class="form-group"><label>Fecha de la Factura:</label><input type="date" name="fecha_factura" required></div>
                            <div class="form-group"><label>Fecha de Vencimiento (Opcional):</label><input type="date" name="fecha_vencimiento"></div>
                            <div class="form-group"><label>Monto Total:</label><input type="number" name="monto_total" step="0.01" required></div>
                            <div class="form-group"><label>Descripción / Concepto:</label><textarea name="descripcion" rows="2" required></textarea></div>
                            <button type="submit" class="btn">Guardar Factura</button>
                        </form>
                    </div>

                    <hr style="margin: 40px 0;">
                    <h3>Facturas Pendientes</h3>
                    <table>
                        <thead><tr><th>Suplidor</th><th># Factura</th><th>Fecha Factura</th><th>Fecha Vencimiento</th><th>Monto Total</th><th>Balance Pendiente</th><th>Estado</th></tr></thead>
                        <tbody>${invoicesHtml}</tbody>
                    </table>
                </div>
            </body></html>
        `);
    } catch (error) {
        console.error("Error al cargar la página de cuentas por pagar:", error);
        res.status(500).send('<h1>Error al cargar la página ❌</h1>');
    }
});

// --- RUTA PARA GUARDAR UNA NUEVA FACTURA DE SUPLIDOR ---
app.post('/cuentas-por-pagar', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { supplier_id, numero_factura, fecha_factura, fecha_vencimiento, monto_total, descripcion } = req.body;
    if (!supplier_id || !fecha_factura || !monto_total || !descripcion) {
        return res.status(400).send("El suplidor, fecha, monto y descripción son obligatorios.");
    }
    try {
        const client = await pool.connect();
        await client.query(
            `INSERT INTO facturas_suplidores (supplier_id, numero_factura, fecha_factura, fecha_vencimiento, monto_total, descripcion) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [supplier_id, numero_factura || null, fecha_factura, fecha_vencimiento || null, monto_total, descripcion]
        );
        client.release();
        res.redirect('/cuentas-por-pagar');
    } catch (error) {
        console.error("Error al guardar la factura de suplidor:", error);
        res.status(500).send('<h1>Error al guardar la factura ❌</h1>');
    }
});

// =======================================================
//   NUEVAS RUTAS PARA DETALLES Y PAGOS DE FACTURAS A SUPLIDORES
// =======================================================

// --- PÁGINA DE DETALLE DE UNA FACTURA ESPECÍFICA ---
app.get('/factura-suplidor/:id', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { id } = req.params;
    try {
        const client = await pool.connect();
        const invoiceResult = await client.query(
            `SELECT f.*, s.name as supplier_name 
             FROM facturas_suplidores f
             JOIN suppliers s ON f.supplier_id = s.id 
             WHERE f.id = $1`, [id]);
        
        const paymentsResult = await client.query(
            `SELECT * FROM pagos_a_suplidores WHERE factura_id = $1 ORDER BY payment_date DESC`, [id]);
        client.release();

        if (invoiceResult.rows.length === 0) {
            return res.status(404).send('Factura no encontrada.');
        }

        const invoice = invoiceResult.rows[0];
        const payments = paymentsResult.rows;

        const totalPagado = payments.reduce((sum, p) => sum + parseFloat(p.amount_paid), 0);
        const balancePendiente = parseFloat(invoice.monto_total) - totalPagado;

        let paymentsHtml = payments.map(p => `
            <tr>
                <td>${new Date(p.payment_date).toLocaleDateString()}</td>
                <td>$${parseFloat(p.amount_paid).toFixed(2)}</td>
                <td>${p.payment_method || 'N/A'}</td>
                <td>
                    <a href="/recibo-pago-suplidor/${p.id}/pdf" target="_blank" class="btn" style="padding: 5px 10px; font-size: 14px;">Imprimir</a>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="4">No se han registrado pagos para esta factura.</td></tr>';

        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
                <div class="container">
                    <a href="/cuentas-por-pagar" class="back-link">↩️ Volver a Cuentas por Pagar</a>
                    <h2>Detalle de Factura: ${invoice.numero_factura || `ID ${invoice.id}`}</h2>
                    <p><strong>Suplidor:</strong> ${invoice.supplier_name}</p>
                    
                    <div class="summary">
                        <div class="summary-box"><h3>Monto Total</h3><p class="amount">$${parseFloat(invoice.monto_total).toFixed(2)}</p></div>
                        <div class="summary-box"><h3>Total Pagado</h3><p class="amount green">$${totalPagado.toFixed(2)}</p></div>
                        <div class="summary-box"><h3>Balance Pendiente</h3><p class="amount red">$${balancePendiente.toFixed(2)}</p></div>
                    </div>

                    <div class="form-container">
                        <h3>Registrar Nuevo Abono / Pago</h3>
                        <form action="/factura-suplidor/${id}/registrar-pago" method="POST">
                            <div class="form-group"><label>Fecha del Pago:</label><input type="date" name="payment_date" required></div>
                            <div class="form-group"><label>Monto Pagado:</label><input type="number" name="amount_paid" step="0.01" max="${balancePendiente.toFixed(2)}" required></div>
                            <div class="form-group"><label>Método de Pago (Opcional):</label><input type="text" name="payment_method" placeholder="Ej: Transferencia, Efectivo..."></div>
                            <div class="form-group"><label>Notas (Opcional):</label><textarea name="notes" rows="2"></textarea></div>
                            <button type="submit" class="btn">Guardar Pago</button>
                        </form>
                    </div>

                    <hr style="margin: 40px 0;">
                    <h3>Historial de Pagos Realizados</h3>
                    <table>
                        <thead><tr><th>Fecha de Pago</th><th>Monto</th><th>Método</th><th>Acciones</th></tr></thead>
                        <tbody>${paymentsHtml}</tbody>
                    </table>
                </div>
            </body></html>
        `);
    } catch (error) {
        console.error("Error al cargar detalle de factura:", error);
        res.status(500).send('<h1>Error al cargar la página ❌</h1>');
    }
});

// --- RUTA PARA GUARDAR UN PAGO A UNA FACTURA ---
app.post('/factura-suplidor/:facturaId/registrar-pago', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { facturaId } = req.params;
    const { payment_date, amount_paid, payment_method, notes } = req.body;
    
    if (!payment_date || !amount_paid) {
        return res.status(400).send("La fecha y el monto son obligatorios.");
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Insertar el nuevo pago
        await client.query(
            `INSERT INTO pagos_a_suplidores (factura_id, payment_date, amount_paid, payment_method, notes) 
             VALUES ($1, $2, $3, $4, $5)`,
            [facturaId, payment_date, amount_paid, payment_method || null, notes || null]
        );

        // 2. Recalcular el total pagado y el balance
        const totalsResult = await client.query(
            `SELECT 
                f.monto_total,
                COALESCE(SUM(p.amount_paid), 0) as total_pagado
             FROM facturas_suplidores f
             LEFT JOIN pagos_a_suplidores p ON f.id = p.factura_id
             WHERE f.id = $1
             GROUP BY f.monto_total`, [facturaId]
        );

        const montoTotal = parseFloat(totalsResult.rows[0].monto_total);
        const totalPagado = parseFloat(totalsResult.rows[0].total_pagado);
        const nuevoEstado = totalPagado >= montoTotal ? 'pagada' : 'pagada parcialmente';

        // 3. Actualizar el estado de la factura
        await client.query(
            `UPDATE facturas_suplidores SET estado = $1 WHERE id = $2`,
            [nuevoEstado, facturaId]
        );

        await client.query('COMMIT');
        res.redirect(`/factura-suplidor/${facturaId}`);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error al registrar el pago:", error);
        res.status(500).send('<h1>Error al registrar el pago ❌</h1>');
    } finally {
        client.release();
    }
});

// --- RUTA PARA GENERAR EL PDF DEL RECIBO DE PAGO A SUPLIDOR ---
app.get('/recibo-pago-suplidor/:pagoId/pdf', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const { pagoId } = req.params;
        const client = await pool.connect();
        const result = await client.query(`
            SELECT p.*, f.numero_factura, f.descripcion, s.name as supplier_name 
            FROM pagos_a_suplidores p
            JOIN facturas_suplidores f ON p.factura_id = f.id
            JOIN suppliers s ON f.supplier_id = s.id
            WHERE p.id = $1`, [pagoId]);
        client.release();

        if (result.rows.length === 0) {
            return res.status(404).send('Pago no encontrado.');
        }
        const pago = result.rows[0];

        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=pago-suplidor-${pago.id}.pdf`);
        doc.pipe(res);

        doc.image(path.join(__dirname, 'plantillas', 'membrete.jpg'), 0, 0, { width: doc.page.width, height: doc.page.height });
        
        doc.y = 280;
        doc.font('Helvetica-Bold').fontSize(20).text('COMPROBANTE DE PAGO A SUPLIDOR', { align: 'center' });
        doc.moveDown(3);

        doc.font('Helvetica').fontSize(11);
        doc.text(`Fecha de Pago: ${new Date(pago.payment_date).toLocaleDateString('es-DO')}`, { align: 'right' });
        doc.moveDown();

        doc.font('Helvetica-Bold').text('PAGADO A: ').font('Helvetica').text(pago.supplier_name);
        doc.moveDown();
        
        const formattedAmount = parseFloat(pago.amount_paid).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        doc.font('Helvetica-Bold').text('MONTO PAGADO: ').font('Helvetica-Bold').fontSize(14).text(`RD$ ${formattedAmount}`);
        doc.moveDown();

        doc.font('Helvetica-Bold').fontSize(11).text('EN CONCEPTO DE:').font('Helvetica').fontSize(10).text(`Abono a factura #${pago.numero_factura || pago.factura_id} (${pago.descripcion})`);
        doc.moveDown(8);

        doc.font('Helvetica').fontSize(10);
        const signatureY = doc.y > 650 ? 700 : doc.y + 80;
        doc.text('___________________________', 70, signatureY);
        doc.font('Helvetica-Bold').text(pago.supplier_name, 70, signatureY + 15);
        doc.font('Helvetica').text('Recibido Conforme (Firma)', 70, signatureY + 30);

        doc.text('___________________________', 350, signatureY, { align: 'right' });
        doc.font('Helvetica-Bold').text('Autorizado por', 350, signatureY + 15, { align: 'right' });

        doc.end();
    } catch (error) {
        console.error("Error al generar el PDF de pago a suplidor:", error);
        res.status(500).send('Error al generar el recibo PDF.');
    }
});


// =======================================================
//   NUEVAS RUTAS PARA GASTOS GENERALES / DESEMBOLSOS
// =======================================================

// --- PÁGINA PARA VER Y AÑADIR GASTOS GENERALES ---
app.get('/gastos-generales', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const client = await pool.connect();
        const [suppliersResult, expensesResult] = await Promise.all([
            client.query('SELECT * FROM suppliers ORDER BY name ASC'),
            client.query(`
                SELECT e.*, s.name as supplier_name 
                FROM expenses e 
                JOIN suppliers s ON e.supplier_id = s.id 
                WHERE e.quote_id IS NULL 
                ORDER BY e.expense_date DESC
            `)
        ]);
        client.release();

        const suppliers = suppliersResult.rows;
        const expenses = expensesResult.rows;

        let suppliersOptionsHtml = suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        let expensesHtml = expenses.map(e => `
            <tr>
                <td>${new Date(e.expense_date).toLocaleDateString()}</td>
                <td>${e.supplier_name}</td>
                <td>${e.description}</td>
                <td>${e.type || ''}</td>
                <td>$${parseFloat(e.amount).toFixed(2)}</td>
                <td>
                    <a href="/desembolso/${e.id}/pdf" target="_blank" class="btn" style="padding: 5px 10px; font-size: 14px;">Imprimir</a>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="6">No hay gastos generales registrados.</td></tr>';

        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
                <div class="container">
                    ${backToDashboardLink}
                    <h2>Gastos Generales y Administrativos</h2>
                    <div class="form-container">
                        <h3>Registrar Nuevo Desembolso</h3>
                        <form action="/gastos-generales" method="POST">
                            <div class="form-group"><label>Fecha:</label><input type="date" name="expense_date" required></div>
                            <div class="form-group"><label>Suplidor:</label><select name="supplier_id" required><option value="">Seleccione un suplidor...</option>${suppliersOptionsHtml}</select></div>
                            <div class="form-group"><label>Monto:</label><input type="number" name="amount" step="0.01" required></div>
                            <div class="form-group"><label>Tipo:</label><select name="type"><option value="">Seleccionar...</option><option value="Con Valor Fiscal">Con Valor Fiscal</option><option value="Sin Valor Fiscal">Sin Valor Fiscal</option></select></div>
                            <div class="form-group"><label>Descripción / Concepto:</label><textarea name="description" rows="2" required></textarea></div>
                            <button type="submit" class="btn">Guardar Gasto</button>
                        </form>
                    </div>
                    <hr style="margin: 40px 0;">
                    <h3>Historial de Gastos Generales</h3>
                    <table>
                        <thead><tr><th>Fecha</th><th>Suplidor</th><th>Descripción</th><th>Tipo</th><th>Monto</th><th>Acciones</th></tr></thead>
                        <tbody>${expensesHtml}</tbody>
                    </table>
                </div>
            </body></html>
        `);
    } catch (error) {
        console.error("Error al cargar la página de gastos generales:", error);
        res.status(500).send('<h1>Error al cargar la página ❌</h1>');
    }
});

// --- RUTA PARA GUARDAR UN NUEVO GASTO GENERAL ---

// =======================================================
//   NUEVAS RUTAS PARA CAJA CHICA
// =======================================================
// =======================================================
//   NUEVAS RUTAS PARA CAJA CHICA (VERSIÓN COMPLETA)
// =======================================================

app.get('/caja-chica', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const client = await pool.connect();
        const activeCycleResult = await client.query("SELECT * FROM caja_chica_ciclos WHERE estado = 'abierto' LIMIT 1");
        
        if (activeCycleResult.rows.length > 0) {
            // --- VISTA CUANDO HAY UN CICLO ABIERTO ---
            const activeCycle = activeCycleResult.rows[0];
            const [suppliersResult, expensesResult] = await Promise.all([
                client.query('SELECT * FROM suppliers ORDER BY name ASC'),
                client.query(`
                    SELECT e.*, s.name as supplier_name 
                    FROM expenses e
                    JOIN suppliers s ON e.supplier_id = s.id
                    WHERE e.caja_chica_ciclo_id = $1 
                    ORDER BY e.expense_date DESC`, 
                    [activeCycle.id]
                )
            ]);
            
            const suppliers = suppliersResult.rows;
            const expenses = expensesResult.rows;
            const totalGastado = expenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
            const balanceActual = parseFloat(activeCycle.fondo_inicial) - totalGastado;
            
            let suppliersOptionsHtml = suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
            let expensesHtml = expenses.map(e => `
                <tr>
                    <td>${new Date(e.expense_date).toLocaleDateString()}</td>
                    <td>${e.supplier_name}</td>
                    <td>${e.description}</td>
                    <td>$${parseFloat(e.amount).toFixed(2)}</td>
                </tr>
            `).join('') || '<tr><td colspan="4">No hay gastos registrados en este ciclo.</td></tr>';

            res.send(`
                <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
                    <div class="container">
                        ${backToDashboardLink}
                        <h2>Gestión de Caja Chica (Ciclo Abierto)</h2>
                        <div class="summary">
                            <div class="summary-box"><h3>Fondo Inicial</h3><p class="amount">$${parseFloat(activeCycle.fondo_inicial).toFixed(2)}</p></div>
                            <div class="summary-box"><h3>Total Gastado</h3><p class="amount orange">$${totalGastado.toFixed(2)}</p></div>
                            <div class="summary-box"><h3>Balance Restante</h3><p class="amount green">$${balanceActual.toFixed(2)}</p></div>
                        </div>
                        <div style="text-align: center; margin-bottom: 20px;">
                            <form action="/caja-chica/cerrar-ciclo" method="POST" onsubmit="return confirm('¿Estás seguro de que deseas cerrar este ciclo de caja? Esta acción no se puede deshacer.');">
                                <input type="hidden" name="cycleId" value="${activeCycle.id}">
                                <input type="hidden" name="total_gastado" value="${totalGastado}">
                                <input type="hidden" name="balance_final" value="${balanceActual}">
                                <button type="submit" class="btn" style="background-color: #dc3545;">Cerrar Ciclo y Generar Reporte</button>
                            </form>
                        </div>
                        <div class="form-container">
                            <h3>Registrar Gasto de Caja Chica</h3>
                            <form action="/caja-chica/nuevo-gasto" method="POST">
                                <input type="hidden" name="cycleId" value="${activeCycle.id}">
                                <div class="form-group"><label>Fecha:</label><input type="date" name="expense_date" required></div>
                                <div class="form-group"><label>Suplidor:</label><select name="supplier_id" required>${suppliersOptionsHtml}</select></div>
                                <div class="form-group"><label>Monto:</label><input type="number" name="amount" step="0.01" required></div>
                                <div class="form-group"><label>Descripción / Concepto:</label><textarea name="description" rows="2" required></textarea></div>
                                <button type="submit" class="btn">Guardar Gasto</button>
                            </form>
                        </div>
                        <hr style="margin: 40px 0;">
                        <h3>Gastos de este Ciclo</h3>
                        <table>
                            <thead><tr><th>Fecha</th><th>Suplidor</th><th>Descripción</th><th>Monto</th></tr></thead>
                            <tbody>${expensesHtml}</tbody>
                        </table>
                    </div>
                </body></html>
            `);

        } else {
            // --- VISTA CUANDO NO HAY CICLOS ABIERTOS ---
            const closedCyclesResult = await client.query("SELECT * FROM caja_chica_ciclos WHERE estado = 'cerrado' ORDER BY fecha_inicio DESC");
            const closedCycles = closedCyclesResult.rows;
            let closedCyclesHtml = closedCycles.map(c => `
                <tr>
                    <td>${new Date(c.fecha_inicio).toLocaleDateString()}</td>
                    <td>${new Date(c.fecha_cierre).toLocaleDateString()}</td>
                    <td>$${parseFloat(c.fondo_inicial).toFixed(2)}</td>
                    <td>$${parseFloat(c.total_gastado).toFixed(2)}</td>
                    <td><a href="/caja-chica/reporte/${c.id}/pdf" target="_blank" class="btn" style="padding: 5px 10px; font-size: 14px;">Ver Reporte</a></td>
                </tr>
            `).join('') || '<tr><td colspan="5">No hay ciclos de caja cerrados.</td></tr>';

            res.send(`
                <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
                    <div class="container">
                        ${backToDashboardLink}
                        <h2>Gestión de Caja Chica</h2>
                        <div class="form-container">
                            <h3>No hay un ciclo de caja chica activo.</h3>
                            <p>Para empezar a registrar gastos, primero debes abrir un nuevo ciclo con un fondo inicial.</p>
                            <form action="/caja-chica/abrir-ciclo" method="POST">
                                <div class="form-group">
                                    <label for="fondo_inicial">Monto del Fondo Inicial:</label>
                                    <input type="number" id="fondo_inicial" name="fondo_inicial" step="0.01" required>
                                </div>
                                <button type="submit" class="btn">Abrir Nuevo Ciclo</button>
                            </form>
                        </div>
                        <hr style="margin: 40px 0;">
                        <h3>Historial de Ciclos Cerrados</h3>
                        <table>
                            <thead><tr><th>Fecha de Inicio</th><th>Fecha de Cierre</th><th>Fondo Inicial</th><th>Total Gastado</th><th>Acciones</th></tr></thead>
                            <tbody>${closedCyclesHtml}</tbody>
                        </table>
                    </div>
                </body></html>
            `);
        }
        client.release();
    } catch (error) {
        console.error("Error al cargar la página de caja chica:", error);
        res.status(500).send('<h1>Error al cargar la página ❌</h1>');
    }
});

app.post('/caja-chica/abrir-ciclo', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { fondo_inicial } = req.body;
    if (!fondo_inicial || parseFloat(fondo_inicial) <= 0) {
        return res.status(400).send("El fondo inicial debe ser un número mayor a cero.");
    }
    try {
        const client = await pool.connect();
        await client.query(
            `INSERT INTO caja_chica_ciclos (fecha_inicio, fondo_inicial, estado) VALUES (NOW(), $1, 'abierto')`,
            [fondo_inicial]
        );
        client.release();
        res.redirect('/caja-chica');
    } catch (error) {
        console.error("Error al abrir ciclo de caja chica:", error);
        res.status(500).send('<h1>Error al abrir el ciclo ❌</h1>');
    }
});

app.post('/caja-chica/nuevo-gasto', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { cycleId, expense_date, supplier_id, amount, description } = req.body;
    if (!cycleId || !expense_date || !supplier_id || !amount || !description) {
        return res.status(400).send("Todos los campos son obligatorios.");
    }
    try {
        const client = await pool.connect();
        await client.query(
            `INSERT INTO expenses (expense_date, supplier_id, amount, description, type, caja_chica_ciclo_id) 
             VALUES ($1, $2, $3, $4, 'Sin Valor Fiscal', $5)`,
            [expense_date, supplier_id, amount, description, cycleId]
        );
        client.release();
        res.redirect('/caja-chica');
    } catch (error) {
        console.error("Error al registrar gasto de caja chica:", error);
        res.status(500).send('<h1>Error al registrar el gasto ❌</h1>');
    }
});

// --- RUTA PARA CERRAR EL CICLO ---
app.post('/caja-chica/cerrar-ciclo', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { cycleId, total_gastado, balance_final } = req.body;
    try {
        const client = await pool.connect();
        await client.query(
            `UPDATE caja_chica_ciclos 
             SET fecha_cierre = NOW(), estado = 'cerrado', total_gastado = $1, balance_final = $2 
             WHERE id = $3`,
            [total_gastado, balance_final, cycleId]
        );
        client.release();
        res.redirect('/caja-chica');
    } catch (error) {
        console.error("Error al cerrar el ciclo de caja chica:", error);
        res.status(500).send('<h1>Error al cerrar el ciclo ❌</h1>');
    }
});

// --- RUTA PARA GENERAR EL REPORTE PDF DEL CIERRE ---
app.get('/caja-chica/reporte/:cycleId/pdf', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { cycleId } = req.params;
    try {
        const client = await pool.connect();
        const cycleResult = await client.query("SELECT * FROM caja_chica_ciclos WHERE id = $1 AND estado = 'cerrado'", [cycleId]);
        if (cycleResult.rows.length === 0) {
            client.release();
            return res.status(404).send('Ciclo de caja no encontrado o no está cerrado.');
        }
        const cycle = cycleResult.rows[0];

        const expensesResult = await client.query(`
            SELECT e.*, s.name as supplier_name 
            FROM expenses e 
            JOIN suppliers s ON e.supplier_id = s.id 
            WHERE e.caja_chica_ciclo_id = $1 
            ORDER BY e.expense_date ASC`, [cycleId]
        );
        client.release();
        const expenses = expensesResult.rows;
        
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=reporte-caja-chica-${cycle.id}.pdf`);
        doc.pipe(res);
        
        doc.image(path.join(__dirname, 'plantillas', 'membrete.jpg'), 0, 0, { width: doc.page.width, height: doc.page.height });
        
        doc.y = 250;
        doc.font('Helvetica-Bold').fontSize(18).text('REPORTE DE CIERRE DE CAJA CHICA', { align: 'center' });
        doc.moveDown(2);

        doc.font('Helvetica').fontSize(11);
        doc.text(`Período del ${new Date(cycle.fecha_inicio).toLocaleDateString()} al ${new Date(cycle.fecha_cierre).toLocaleDateString()}`);
        doc.moveDown(2);

        doc.font('Helvetica-Bold').text('FONDO INICIAL:', { continued: true }).font('Helvetica').text(` $${parseFloat(cycle.fondo_inicial).toFixed(2)}`);
        doc.font('Helvetica-Bold').text('TOTAL GASTADO:', { continued: true }).font('Helvetica').text(` $${parseFloat(cycle.total_gastado).toFixed(2)}`);
        doc.font('Helvetica-Bold').text('BALANCE FINAL:', { continued: true }).font('Helvetica').text(` $${parseFloat(cycle.balance_final).toFixed(2)}`);
        doc.moveDown(2);

        doc.font('Helvetica-Bold').fontSize(14).text('Detalle de Gastos');
        doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
        doc.moveDown();

        expenses.forEach(e => {
            doc.font('Helvetica').fontSize(10);
            doc.text(`${new Date(e.expense_date).toLocaleDateString()} - ${e.supplier_name} - ${e.description}`, { continued: true, width: 450 });
            doc.text(`$${parseFloat(e.amount).toFixed(2)}`, { align: 'right' });
            doc.moveDown(0.5);
        });

        doc.end();
    } catch (error) {
        console.error("Error al generar el reporte de caja chica:", error);
        res.status(500).send('<h1>Error al generar el reporte ❌</h1>');
    }
});
app.post('/gastos-generales', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { expense_date, supplier_id, amount, description, type } = req.body;
    if (!expense_date || !supplier_id || !amount || !description) {
        return res.status(400).send("La fecha, suplidor, monto y descripción son obligatorios.");
    }
    try {
        const client = await pool.connect();
        await client.query(
            `INSERT INTO expenses (expense_date, supplier_id, amount, description, type, quote_id) 
             VALUES ($1, $2, $3, $4, $5, NULL)`,
            [expense_date, supplier_id, amount, description, type]
        );
        client.release();
        res.redirect('/gastos-generales');
    } catch (error) {
        console.error("Error al guardar el gasto general:", error);
        res.status(500).send('<h1>Error al guardar el gasto ❌</h1>');
    }
});

// --- RUTA PARA GENERAR EL PDF DEL RECIBO DE DESEMBOLSO ---
app.get('/desembolso/:expenseId/pdf', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const { expenseId } = req.params;
        const client = await pool.connect();
        const result = await client.query(
            `SELECT e.*, s.name as supplier_name 
             FROM expenses e JOIN suppliers s ON e.supplier_id = s.id 
             WHERE e.id = $1`, 
            [expenseId]
        );
        client.release();

        if (result.rows.length === 0) {
            return res.status(404).send('Desembolso no encontrado.');
        }
        const expense = result.rows[0];

        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=desembolso-${expense.id}.pdf`);
        doc.pipe(res);

        doc.image(path.join(__dirname, 'plantillas', 'membrete.jpg'), 0, 0, { width: doc.page.width, height: doc.page.height });
        
        doc.y = 280; // Bajamos el contenido
        doc.font('Helvetica-Bold').fontSize(20).text('COMPROBANTE DE DESEMBOLSO', { align: 'center' });
        doc.moveDown(3);

        doc.font('Helvetica').fontSize(11);
        doc.text(`Fecha: ${new Date(expense.expense_date).toLocaleDateString('es-DO')}`, { align: 'right' });
        doc.moveDown();

        doc.font('Helvetica-Bold').text('PAGADO A: ').font('Helvetica').text(expense.supplier_name);
        doc.moveDown();
        
        const formattedAmount = parseFloat(expense.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        doc.font('Helvetica-Bold').text('MONTO: ').font('Helvetica-Bold').fontSize(14).text(`RD$ ${formattedAmount}`);
        doc.moveDown();

        doc.font('Helvetica-Bold').fontSize(11).text('POR CONCEPTO DE:').font('Helvetica').fontSize(10).text(expense.description);
        doc.moveDown(8);

        doc.font('Helvetica').fontSize(10);
        
        const signatureY = doc.y > 650 ? 700 : doc.y + 80;

        doc.text('___________________________', 70, signatureY);
        doc.font('Helvetica-Bold').text(expense.supplier_name, 70, signatureY + 15);
        doc.font('Helvetica').text('Recibido Conforme (Firma)', 70, signatureY + 30);

        doc.text('___________________________', 350, signatureY, { align: 'right' });
        doc.font('Helvetica-Bold').text('Autorizado por', 350, signatureY + 15, { align: 'right' });

        doc.end();
    } catch (error) {
        console.error("Error al generar el PDF de desembolso:", error);
        res.status(500).send('Error al generar el recibo PDF.');
    }
});

app.get('/cuentas-por-cobrar', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const client = await pool.connect();
        
        // --- CONSULTA SQL MEJORADA ---
        // Ahora también obtiene la suma de todos los ajustes para cada cotización.
        const result = await client.query(`
            SELECT
                q.id as quote_id,
                q.quotenumber,
                q.clientname,
                q.preciofinalporestudiante,
                q.estudiantesparafacturar,
                COALESCE(p.total_abonado, 0) as total_abonado,
                COALESCE(adj.total_ajustado, 0) as total_ajustado
            FROM quotes q
            LEFT JOIN (
                SELECT quote_id, SUM(amount) as total_abonado
                FROM payments
                GROUP BY quote_id
            ) p ON q.id = p.quote_id
            LEFT JOIN (
                SELECT quote_id, SUM(monto_ajuste) as total_ajustado
                FROM ajustes_cotizacion
                GROUP BY quote_id
            ) adj ON q.id = adj.quote_id
            WHERE q.status = 'activa'
            ORDER BY q.clientname ASC;
        `);
        const projects = result.rows;
        client.release();

        let totalGeneralVenta = 0;
        let totalGeneralAbonado = 0;

        let projectsHtml = projects.map(p => {
            // --- CÁLCULO CORREGIDO ---
            // Se calcula el monto original y se le suman los ajustes.
            const montoOriginal = parseFloat(p.preciofinalporestudiante || 0) * parseFloat(p.estudiantesparafacturar || 0);
            const totalAjustes = parseFloat(p.total_ajustado || 0);
            const totalVenta = montoOriginal + totalAjustes;

            const totalAbonado = parseFloat(p.total_abonado);
            const balancePendiente = totalVenta - totalAbonado;
            totalGeneralVenta += totalVenta;
            totalGeneralAbonado += totalAbonado;
            return `<tr><td>${p.clientname}</td><td>${p.quotenumber}</td><td>$${totalVenta.toFixed(2)}</td><td style="color: green;">$${totalAbonado.toFixed(2)}</td><td style="color: red; font-weight: bold;">$${balancePendiente.toFixed(2)}</td></tr>`;
        }).join('');
        
        const totalGeneralPendiente = totalGeneralVenta - totalGeneralAbonado;

        if (projects.length === 0) {
            projectsHtml = '<tr><td colspan="5">No hay cuentas por cobrar activas.</td></tr>';
        }

        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
                <div class="container">
                    ${backToDashboardLink}
                    <h2>Reporte General de Cuentas por Cobrar</h2>
                    <div class="summary">
                        <div class="summary-box"><h3>Monto Total por Cobrar</h3><p class="amount">$${totalGeneralVenta.toFixed(2)}</p></div>
                        <div class="summary-box"><h3>Total Abonado General</h3><p class="amount green">$${totalGeneralAbonado.toFixed(2)}</p></div>
                        <div class="summary-box"><h3>Balance Pendiente General</h3><p class="amount red">$${totalGeneralPendiente.toFixed(2)}</p></div>
                    </div>
                    <table><thead><tr><th>Cliente</th><th># Cotización</th><th>Monto Total</th><th>Total Abonado</th><th>Balance Pendiente</th></tr></thead><tbody>${projectsHtml}</tbody></table>
                </div>
            </body></html>`);
    } catch (error) {
        console.error("Error al generar reporte de cxc:", error);
        res.status(500).send('<h1>Error al cargar el reporte ❌</h1>');
    }
});
app.get('/reporte-gastos', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const client = await pool.connect();
        
        const result = await client.query(`
            SELECT 
                e.*, 
                s.name as supplier_name, 
                q.clientname,
                cc.id as ciclo_id
            FROM expenses e
            JOIN suppliers s ON e.supplier_id = s.id
            LEFT JOIN quotes q ON e.quote_id = q.id
            LEFT JOIN caja_chica_ciclos cc ON e.caja_chica_ciclo_id = cc.id
            ORDER BY e.expense_date DESC;
        `);
        const expenses = result.rows;
        client.release();

        const totalGastado = expenses.reduce((sum, expense) => sum + parseFloat(expense.amount), 0);
        
        let expensesHtml = expenses.map(e => {
            let origenGasto = '<span style="color:#6c757d; font-style:italic;">Gasto General</span>';
            if (e.clientname) {
                origenGasto = `Proyecto: ${e.clientname}`;
            } else if (e.ciclo_id) {
                origenGasto = `Caja Chica (Ciclo #${e.ciclo_id})`;
            }

            return `<tr>
                        <td>${new Date(e.expense_date).toLocaleDateString()}</td>
                        <td>${origenGasto}</td>
                        <td>${e.supplier_name}</td>
                        <td>${e.description}</td>
                        <td>$${parseFloat(e.amount).toFixed(2)}</td>
                    </tr>`;
        }).join('');

        if (expenses.length === 0) {
            expensesHtml = '<tr><td colspan="5">No hay gastos registrados en el sistema.</td></tr>';
        }

        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
                <div class="container">
                    ${backToDashboardLink}
                    <h2>Reporte General de Gastos</h2>
                    <div class="summary">
                        <div class="summary-box" style="grid-column: span 3; margin: auto;">
                            <h3>Total General Gastado</h3>
                            <p class="amount orange">$${totalGastado.toFixed(2)}</p>
                        </div>
                    </div>
                    <table><thead><tr><th>Fecha</th><th>Origen del Gasto</th><th>Suplidor</th><th>Descripción</th><th>Monto</th></tr></thead><tbody>${expensesHtml}</tbody></table>
                </div>
            </body></html>`);
    } catch (error) {
        console.error("Error al generar el reporte de gastos:", error);
        res.status(500).send('<h1>Error al cargar el reporte ❌</h1>');
    }
});
// =======================================================
//   NUEVAS RUTAS PARA GESTIÓN DE ASESORES Y COMISIONES
// =======================================================

app.get('/gestionar-asesores', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const client = await pool.connect();
        const [advisorsResult, settingsResult] = await Promise.all([
            client.query('SELECT * FROM advisors ORDER BY name ASC'),
            client.query(`SELECT value FROM app_settings WHERE key = 'coordinator_override_rate'`)
        ]);
        client.release();

        const advisors = advisorsResult.rows;
        const coordinatorRate = settingsResult.rows.length > 0 ? parseFloat(settingsResult.rows[0].value) * 100 : 0;

        let advisorsHtml = advisors.map(a => `
            <tr>
                <td>${a.name} ${a.is_coordinator ? '⭐' : ''}</td>
                <td>${(parseFloat(a.commission_rate) * 100).toFixed(2)}%</td>
                <td>${a.is_coordinator ? 'Sí' : 'No'}</td>
                <td>
                    <a href="/asesor/editar/${a.id}" class="btn" style="background-color: #ffc107; color: #212529; padding: 5px 10px; font-size: 14px;">Editar</a>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="4">No hay asesores registrados.</td></tr>';

        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
                <div class="container">
                    ${backToDashboardLink}
                    <h2>Gestionar Asesores y Comisiones</h2>
                    
                    <div class="form-container">
                        <h3>Añadir Nuevo Asesor</h3>
                        <form action="/gestionar-asesores" method="POST">
                            <div class="form-group"><label>Nombre Completo del Asesor:</label><input type="text" name="name" required></div>
                            <div class="form-group"><label>Tasa de Comisión de Venta (%):</label><input type="number" name="commission_rate" step="0.01" placeholder="Ej: 8 para 8%" required></div>
                            <div class="form-group"><input type="checkbox" name="is_coordinator" id="is_coordinator" value="true" style="width: auto; margin-right: 10px;"><label for="is_coordinator" style="display: inline;">Marcar como Coordinador(a)</label></div>
                            <button type="submit" class="btn">Guardar Asesor</button>
                        </form>
                    </div>

                    <div class="form-container" style="margin-top: 20px;">
                        <h3>Configuración General</h3>
                        <form action="/update-settings" method="POST">
                             <div class="form-group">
                                <label>Tasa de Comisión del Coordinador (%):</label>
                                <input type="number" name="coordinator_override_rate" step="0.01" value="${coordinatorRate.toFixed(2)}" required>
                                <input type="hidden" name="key" value="coordinator_override_rate">
                             </div>
                             <button type="submit" class="btn">Actualizar Tasa</button>
                        </form>
                    </div>

                    <hr style="margin: 40px 0;">
                    <h3>Lista de Asesores</h3>
                    <table>
                        <thead><tr><th>Nombre</th><th>Comisión de Venta</th><th>Es Coordinador(a)</th><th>Acciones</th></tr></thead>
                        <tbody>${advisorsHtml}</tbody>
                    </table>
                </div>
            </body></html>
        `);
    } catch (error) {
        console.error("Error al cargar la página de asesores:", error);
        res.status(500).send('<h1>Error al cargar la página ❌</h1>');
    }
});

// --- RUTA PARA MOSTRAR EL FORMULARIO DE EDICIÓN DE UN ASESOR ---
app.get('/asesor/editar/:id', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { id } = req.params;
    try {
        const client = await pool.connect();
        const advisorResult = await client.query('SELECT * FROM advisors WHERE id = $1', [id]);
        client.release();

        if (advisorResult.rows.length === 0) {
            return res.status(404).send('Asesor no encontrado.');
        }
        const advisor = advisorResult.rows[0];
        const commissionRatePercent = (parseFloat(advisor.commission_rate) * 100).toFixed(2);

        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
                <div class="container">
                    <a href="/gestionar-asesores" class="back-link">↩️ Volver a Gestionar Asesores</a>
                    <h2>Editando Asesor: ${advisor.name}</h2>
                    <div class="form-container">
                        <form action="/asesor/editar/${id}" method="POST">
                            <div class="form-group"><label>Nombre Completo del Asesor:</label><input type="text" name="name" value="${advisor.name}" required></div>
                            <div class="form-group"><label>Tasa de Comisión de Venta (%):</label><input type="number" name="commission_rate" step="0.01" value="${commissionRatePercent}" required></div>
                            <div class="form-group"><input type="checkbox" name="is_coordinator" id="is_coordinator" value="true" ${advisor.is_coordinator ? 'checked' : ''} style="width: auto; margin-right: 10px;"><label for="is_coordinator" style="display: inline;">Marcar como Coordinador(a)</label></div>
                            <button type="submit" class="btn">Actualizar Asesor</button>
                        </form>
                    </div>
                </div>
            </body></html>
        `);
    } catch (error) {
        console.error("Error al cargar la página de edición de asesor:", error);
        res.status(500).send('<h1>Error al cargar la página ❌</h1>');
    }
});
// --- RUTA PARA GUARDAR LOS CAMBIOS AL EDITAR UN ASESOR ---
app.post('/asesor/editar/:id', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { id } = req.params;
    const { name, commission_rate, is_coordinator } = req.body;
    if (!name || !commission_rate) {
        return res.status(400).send("El nombre y la tasa de comisión son obligatorios.");
    }

    const rateAsDecimal = parseFloat(commission_rate) / 100;
    const isCoordinatorBool = is_coordinator === 'true';

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Si se marca este asesor como coordinador, nos aseguramos de que sea el único.
        if (isCoordinatorBool) {
            await client.query('UPDATE advisors SET is_coordinator = false WHERE id != $1', [id]);
        }
        await client.query(
            `UPDATE advisors SET name = $1, commission_rate = $2, is_coordinator = $3 WHERE id = $4`,
            [name, rateAsDecimal, isCoordinatorBool, id]
        );
        await client.query('COMMIT');
        res.redirect('/gestionar-asesores');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error al actualizar el asesor:", error);
        if (error.code === '23505') { // Error de valor único duplicado
             return res.status(409).send('<h1>Error: Ya existe otro asesor con ese nombre.</h1>');
        }
        res.status(500).send('<h1>Error al actualizar el asesor ❌</h1>');
    } finally {
        client.release();
    }
});
app.post('/gestionar-asesores', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { name, commission_rate, is_coordinator } = req.body;
    if (!name || !commission_rate) {
        return res.status(400).send("El nombre y la tasa de comisión son obligatorios.");
    }

    const rateAsDecimal = parseFloat(commission_rate) / 100;
    const isCoordinatorBool = is_coordinator === 'true';

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Si se marca este nuevo asesor como coordinador, nos aseguramos de que sea el único.
        if (isCoordinatorBool) {
            await client.query('UPDATE advisors SET is_coordinator = false');
        }
        await client.query(
            `INSERT INTO advisors (name, commission_rate, is_coordinator) VALUES ($1, $2, $3)`,
            [name, rateAsDecimal, isCoordinatorBool]
        );
        await client.query('COMMIT');
        res.redirect('/gestionar-asesores');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error al guardar el asesor:", error);
        if (error.code === '23505') { // Error de valor único duplicado
             return res.status(409).send('<h1>Error: Ya existe un asesor con ese nombre.</h1>');
        }
        res.status(500).send('<h1>Error al guardar el asesor ❌</h1>');
    } finally {
        client.release();
    }
});

app.post('/update-settings', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { key, value } = req.body;
    const rateAsDecimal = parseFloat(value) / 100;
    
    try {
        await pool.query(
            `INSERT INTO app_settings (key, value) VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = $2`,
            [key, rateAsDecimal]
        );
        res.redirect('/gestionar-asesores');
    } catch (error) {
        console.error("Error al actualizar la configuración:", error);
        res.status(500).send('<h1>Error al actualizar la configuración ❌</h1>');
    }
});

app.get('/empleados', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM employees ORDER BY first_name, last_name ASC');
        const employees = result.rows;
        client.release();

        let employeesHtml = employees.map(e => `
            <tr>
                <td>${e.first_name} ${e.last_name}</td>
                <td>${e.cedula || ''}</td>
                <td>$${parseFloat(e.base_salary || 0).toFixed(2)}</td>
                <td>
                    <a href="/empleado/editar/${e.id}" class="btn" style="background-color: #ffc107; color: #212529; padding: 5px 10px; font-size: 14px;">Editar</a>
                    <form action="/empleado/eliminar/${e.id}" method="POST" style="display: inline; margin-left: 10px;" onsubmit="return confirm('¿Estás seguro de que deseas eliminar a este empleado?');">
                        <button type="submit" class="btn" style="background-color: #dc3545; padding: 5px 10px; font-size: 14px;">Eliminar</button>
                    </form>
                </td>
            </tr>
        `).join('');

        if (employees.length === 0) {
            employeesHtml = '<tr><td colspan="4">No hay empleados registrados.</td></tr>';
        }

        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
                <div class="container">
                    ${backToDashboardLink}
                    <h2>Gestión de Personal</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Nombre Completo</th>
                                <th>Cédula</th>
                                <th>Salario Base Mensual</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${employeesHtml}
                        </tbody>
                    </table>
                    <div class="form-container">
                        <h2>Añadir Nuevo Empleado</h2>
                        <form action="/empleados" method="POST">
                            <div class="form-group"><label for="first_name">Nombres:</label><input type="text" id="first_name" name="first_name" required></div>
                            <div class="form-group"><label for="last_name">Apellidos:</label><input type="text" id="last_name" name="last_name" required></div>
                            <div class="form-group"><label for="cedula">Cédula:</label><input type="text" id="cedula" name="cedula"></div>
                            <div class="form-group"><label for="hire_date">Fecha de Ingreso:</label><input type="date" id="hire_date" name="hire_date"></div>
                            <div class="form-group"><label for="base_salary">Salario Base (Mensual):</label><input type="number" id="base_salary" name="base_salary" step="0.01"></div>
                            <div class="form-group"><label for="payment_frequency">Frecuencia de Pago:</label>
                                <select id="payment_frequency" name="payment_frequency">
                                    <option value="quincenal">Quincenal</option>
                                    <option value="mensual">Mensual</option>
                                </select>
                            </div>
                            <div class="form-group"><label for="birth_date">Fecha de Cumpleaños:</label><input type="date" id="birth_date" name="birth_date"></div>
                            <div class="form-group"><label for="address">Dirección:</label><textarea id="address" name="address" rows="3"></textarea></div>
                            <button type="submit" class="btn">Guardar Empleado</button>
                        </form>
                    </div>
                </div>
            </body></html>
        `);
    } catch (error) {
        console.error("Error al obtener empleados:", error);
        res.status(500).send('<h1>Error al cargar la página de empleados ❌</h1>');
    }
});

// =======================================================
//   NUEVAS RUTAS PARA VER Y PAGAR COMISIONES
// =======================================================

app.get('/pagar-comisiones', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const client = await pool.connect();
        const [advisorsResult, commissionsResult] = await Promise.all([
            client.query('SELECT * FROM advisors ORDER BY name ASC'),
            client.query(`
                SELECT c.*, a.name as advisor_name, q.clientname 
                FROM commissions c
                JOIN advisors a ON c.advisor_id = a.id
                JOIN payments p ON c.payment_id = p.id
                JOIN quotes q ON p.quote_id = q.id
                WHERE c.status = 'pendiente' 
                ORDER BY a.name, c.created_at ASC
            `)
        ]);
        client.release();

        const advisors = advisorsResult.rows;
        const commissions = commissionsResult.rows;

        const totalPendiente = commissions.reduce((sum, c) => sum + parseFloat(c.commission_amount), 0);

        let advisorsOptionsHtml = advisors.map(a => `<option value="${a.id}">${a.name}</option>`).join('');

        let commissionsHtml = commissions.map(c => `
            <tr data-advisor-id="${c.advisor_id}">
                <td><input type="checkbox" name="commission_ids" value="${c.id}" class="commission-checkbox"></td>
                <td>${new Date(c.created_at).toLocaleDateString()}</td>
                <td>${c.advisor_name}</td>
                <td>${c.clientname}</td>
                <td>Abono ID #${c.payment_id}</td>
                <td>${c.commission_type === 'venta' ? 'Venta Directa' : 'Coordinación'}</td>
                <td style="font-weight: bold;">$${parseFloat(c.commission_amount).toFixed(2)}</td>
            </tr>
        `).join('') || '<tr><td colspan="7">¡Felicidades! No hay comisiones pendientes de pago.</td></tr>';

        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
                <div class="container">
                    ${backToDashboardLink}
                    <h2>Pagar Comisiones Pendientes</h2>
                    <div class="summary">
                        <div class="summary-box" style="grid-column: span 3; margin: auto;">
                            <h3>Total Pendiente por Pagar</h3>
                            <p class="amount red">$${totalPendiente.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                    </div>

                    <form action="/pagar-comisiones" method="POST">
                        <div class="form-container" style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <label for="advisor-filter" style="font-weight: bold; margin-right: 10px;">Filtrar por Asesor:</label>
                                <select id="advisor-filter" onchange="filterCommissions()">
                                    <option value="all">Todos los Asesores</option>
                                    ${advisorsOptionsHtml}
                                </select>
                            </div>
                            <button type="submit" class="btn btn-activar">Pagar Comisiones Seleccionadas</button>
                        </div>

                        <hr style="margin: 20px 0;">
                        <h3>Comisiones Pendientes</h3>
                        <table id="commissions-table">
                            <thead><tr><th><input type="checkbox" onclick="toggleAll(this)"></th><th>Fecha</th><th>Asesor</th><th>Cliente</th><th>Origen</th><th>Tipo</th><th>Monto Comisión</th></tr></thead>
                            <tbody>${commissionsHtml}</tbody>
                        </table>
                    </form>
                </div>
                <script>
                    function toggleAll(source) {
                        const checkboxes = document.querySelectorAll('.commission-checkbox');
                        for (let i = 0; i < checkboxes.length; i++) {
                            if (checkboxes[i].closest('tr').style.display !== 'none') {
                                checkboxes[i].checked = source.checked;
                            }
                        }
                    }
                    function filterCommissions() {
                        const filter = document.getElementById('advisor-filter').value;
                        const table = document.getElementById('commissions-table');
                        const rows = table.getElementsByTagName('tr');
                        for (let i = 1; i < rows.length; i++) { // Empezar en 1 para saltar el encabezado
                            const advisorId = rows[i].getAttribute('data-advisor-id');
                            if (filter === 'all' || advisorId === filter) {
                                rows[i].style.display = '';
                            } else {
                                rows[i].style.display = 'none';
                            }
                        }
                    }
                </script>
            </body></html>
        `);
    } catch (error) {
        console.error("Error al cargar la página de comisiones:", error);
        res.status(500).send('<h1>Error al cargar la página ❌</h1>');
    }
});

app.post('/pagar-comisiones', requireLogin, requireAdminOrCoord, async (req, res) => {
    let { commission_ids } = req.body;
    if (!commission_ids) {
        return res.redirect('/pagar-comisiones');
    }
    if (!Array.isArray(commission_ids)) {
        commission_ids = [commission_ids];
    }
    
    // Convertimos los IDs a números enteros para la consulta SQL
    const commissionIdsInt = commission_ids.map(id => parseInt(id));

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Obtenemos los detalles de las comisiones que se van a pagar
        const commissionsToPayResult = await client.query(`
            SELECT c.*, a.name as advisor_name, p.quote_id 
            FROM commissions c
            JOIN advisors a ON c.advisor_id = a.id
            JOIN payments p ON c.payment_id = p.id
            WHERE c.id = ANY($1::int[]) AND c.status = 'pendiente'`, 
            [commissionIdsInt]
        );
        const commissionsToPay = commissionsToPayResult.rows;

        if (commissionsToPay.length === 0) {
            // Si por alguna razón no se encontraron comisiones pendientes con esos IDs
            await client.query('ROLLBACK');
            return res.status(404).send('No se encontraron comisiones pendientes válidas para pagar.');
        }

        // 2. Marcamos las comisiones como pagadas
        await client.query(
            `UPDATE commissions SET status = 'pagada', paid_at = NOW() WHERE id = ANY($1::int[])`,
            [commissionIdsInt]
        );

        // 3. Registramos CADA comisión pagada como un GASTO del proyecto correspondiente
        for (const commission of commissionsToPay) {
            const expenseDescription = `Pago comisión ${commission.commission_type} a ${commission.advisor_name} por abono ID #${commission.payment_id}`;
            const expenseAmount = parseFloat(commission.commission_amount);
            const quoteId = commission.quote_id;

            // Buscamos un suplidor llamado "Comisiones Internas" o similar. Si no existe, lo creamos.
            let supplierResult = await client.query('SELECT id FROM suppliers WHERE name = $1', ['Comisiones Internas']);
            let supplierId;
            if (supplierResult.rows.length === 0) {
                const newSupplier = await client.query('INSERT INTO suppliers (name) VALUES ($1) RETURNING id', ['Comisiones Internas']);
                supplierId = newSupplier.rows[0].id;
            } else {
                supplierId = supplierResult.rows[0].id;
            }

            // Insertamos el gasto asociado al proyecto (quote_id)
            await client.query(
                `INSERT INTO expenses (expense_date, supplier_id, amount, description, type, quote_id, caja_chica_ciclo_id) 
                 VALUES (NOW(), $1, $2, $3, 'Sin Valor Fiscal', $4, NULL)`,
                [supplierId, expenseAmount, expenseDescription, quoteId]
            );
        }

        await client.query('COMMIT');
        res.redirect('/pagar-comisiones');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error al procesar pago de comisiones y registrar gastos:", error);
        res.status(500).send('<h1>Error al procesar el pago de comisiones ❌</h1>');
    } finally {
        client.release();
    }
});
app.post('/empleados', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { first_name, last_name, cedula, hire_date, base_salary, payment_frequency, birth_date, address } = req.body;

    if (!first_name || !last_name) {
        return res.status(400).send("El nombre y el apellido son obligatorios.");
    }

    try {
        const client = await pool.connect();
        await client.query(
            `INSERT INTO employees (first_name, last_name, cedula, hire_date, base_salary, payment_frequency, birth_date, address)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [first_name, last_name, cedula || null, hire_date || null, base_salary || null, payment_frequency, birth_date || null, address]
        );
        client.release();
        res.redirect('/empleados');
    } catch (error) {
        console.error("Error al guardar el empleado:", error);
        res.status(500).send('<h1>Error al guardar el empleado ❌</h1>');
    }
});

app.get('/empleado/editar/:id', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const { id } = req.params;
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM employees WHERE id = $1', [id]);
        client.release();

        if (result.rows.length === 0) {
            return res.status(404).send('Empleado no encontrado.');
        }

        const employee = result.rows[0];
        const hireDate = employee.hire_date ? new Date(employee.hire_date).toISOString().split('T')[0] : '';
        const birthDate = employee.birth_date ? new Date(employee.birth_date).toISOString().split('T')[0] : '';

        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
                <div class="container">
                    ${backToDashboardLink}
                    <h2>Editando a ${employee.first_name} ${employee.last_name}</h2>
                    <div class="form-container">
                        <form action="/empleado/editar/${employee.id}" method="POST">
                            <div class="form-group"><label for="first_name">Nombres:</label><input type="text" id="first_name" name="first_name" value="${employee.first_name}" required></div>
                            <div class="form-group"><label for="last_name">Apellidos:</label><input type="text" id="last_name" name="last_name" value="${employee.last_name}" required></div>
                            <div class="form-group"><label for="cedula">Cédula:</label><input type="text" id="cedula" name="cedula" value="${employee.cedula || ''}"></div>
                            <div class="form-group"><label for="hire_date">Fecha de Ingreso:</label><input type="date" id="hire_date" name="hire_date" value="${hireDate}"></div>
                            <div class="form-group"><label for="base_salary">Salario Base (Mensual):</label><input type="number" id="base_salary" name="base_salary" step="0.01" value="${employee.base_salary || ''}"></div>
                            <div class="form-group"><label for="payment_frequency">Frecuencia de Pago:</label>
                                <select id="payment_frequency" name="payment_frequency">
                                    <option value="quincenal" ${employee.payment_frequency === 'quincenal' ? 'selected' : ''}>Quincenal</option>
                                    <option value="mensual" ${employee.payment_frequency === 'mensual' ? 'selected' : ''}>Mensual</option>
                                </select>
                            </div>
                            <div class="form-group"><label for="birth_date">Fecha de Cumpleaños:</label><input type="date" id="birth_date" name="birth_date" value="${birthDate}"></div>
                            <div class="form-group"><label for="address">Dirección:</label><textarea id="address" name="address" rows="3">${employee.address || ''}</textarea></div>
                            <button type="submit" class="btn">Actualizar Empleado</button>
                        </form>
                    </div>
                </div>
            </body></html>
        `);
    } catch (error) {
        console.error("Error al obtener empleado para editar:", error);
        res.status(500).send('<h1>Error al cargar la página de edición ❌</h1>');
    }
});

app.post('/empleado/editar/:id', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const { id } = req.params;
        const { first_name, last_name, cedula, hire_date, base_salary, payment_frequency, birth_date, address } = req.body;

        const client = await pool.connect();
        await client.query(
            `UPDATE employees SET 
                first_name = $1, last_name = $2, cedula = $3, hire_date = $4, base_salary = $5, 
                payment_frequency = $6, birth_date = $7, address = $8 
             WHERE id = $9`,
            [first_name, last_name, cedula || null, hire_date || null, base_salary || null, payment_frequency, birth_date || null, address, id]
        );
        client.release();
        res.redirect('/empleados');
    } catch (error) {
        console.error("Error al actualizar el empleado:", error);
        res.status(500).send('<h1>Error al actualizar el empleado ❌</h1>');
    }
});

app.post('/empleado/eliminar/:id', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const { id } = req.params;
        const client = await pool.connect();
        await client.query('DELETE FROM payroll_records WHERE employee_id = $1', [id]);
        await client.query('DELETE FROM employees WHERE id = $1', [id]);
        client.release();
        res.redirect('/empleados');
    } catch (error) {
        console.error("Error al eliminar el empleado:", error);
        res.status(500).send('<h1>Error al eliminar el empleado ❌</h1>');
    }
});

// =======================================================
//   NUEVAS RUTAS PARA GESTIÓN DE AVANCES A EMPLEADOS
// =======================================================

// --- PÁGINA PRINCIPAL DE GESTIÓN DE AVANCES ---
app.get('/gestionar-avances', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const client = await pool.connect();
        const [employeesResult, advancesResult] = await Promise.all([
            client.query('SELECT id, first_name, last_name FROM employees ORDER BY first_name ASC'),
            client.query(`
                SELECT a.*, e.first_name, e.last_name 
                FROM avances_empleado a
                JOIN employees e ON a.employee_id = e.id
                ORDER BY a.advance_date DESC
            `)
        ]);
        client.release();

        const employees = employeesResult.rows;
        const advances = advancesResult.rows;

        let employeesOptionsHtml = employees.map(e => `<option value="${e.id}">${e.first_name} ${e.last_name}</option>`).join('');
        
        let advancesHtml = advances.map(a => `
            <tr>
                <td>${new Date(a.advance_date).toLocaleDateString()}</td>
                <td>${a.first_name} ${a.last_name}</td>
                <td>$${parseFloat(a.amount).toFixed(2)}</td>
                <td>${a.reason || ''}</td>
                <td style="font-weight: bold; color: ${a.status === 'pendiente' ? '#fd7e14' : '#28a745'};">
                    ${a.status.charAt(0).toUpperCase() + a.status.slice(1)}
                </td>
                <td>
                    <a href="/recibo-avance/${a.id}/pdf" target="_blank" class="btn" style="padding: 5px 10px; font-size: 14px;">Imprimir</a>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="6">No hay avances registrados.</td></tr>';

        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
                <div class="container">
                    ${backToDashboardLink}
                    <h2>Gestionar Avances de Sueldo</h2>
                    <div class="form-container">
                        <h3>Registrar Nuevo Avance</h3>
                        <form action="/gestionar-avances" method="POST">
                            <div class="form-group"><label>Empleado:</label><select name="employee_id" required><option value="">Seleccione un empleado...</option>${employeesOptionsHtml}</select></div>
                            <div class="form-group"><label>Fecha del Avance:</label><input type="date" name="advance_date" required></div>
                            <div class="form-group"><label>Monto del Avance:</label><input type="number" name="amount" step="0.01" required></div>
                            <div class="form-group"><label>Motivo / Concepto:</label><textarea name="reason" rows="2"></textarea></div>
                            <button type="submit" class="btn">Guardar Avance</button>
                        </form>
                    </div>
                    <hr style="margin: 40px 0;">
                    <h3>Historial de Avances</h3>
                    <table>
                        <thead><tr><th>Fecha</th><th>Empleado</th><th>Monto</th><th>Motivo</th><th>Estado</th><th>Acciones</th></tr></thead>
                        <tbody>${advancesHtml}</tbody>
                    </table>
                </div>
            </body></html>
        `);
    } catch (error) {
        console.error("Error al cargar la página de avances:", error);
        res.status(500).send('<h1>Error al cargar la página ❌</h1>');
    }
});
// =======================================================
//   NUEVAS RUTAS PARA GESTIÓN DE PRÉSTAMOS
// =======================================================

// --- PÁGINA PRINCIPAL DE GESTIÓN DE PRÉSTAMOS ---
app.get('/gestionar-prestamos', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const client = await pool.connect();
        // Obtenemos todos los empleados (para el selector) y los préstamos activos con su total pagado
        const [employeesResult, loansResult] = await Promise.all([
            client.query('SELECT id, first_name, last_name FROM employees ORDER BY first_name ASC'),
            client.query(`
                SELECT l.*, e.first_name, e.last_name, 
                       COALESCE(lp.total_pagado, 0) as total_pagado
                FROM loans l
                JOIN employees e ON l.employee_id = e.id
                LEFT JOIN (
                    SELECT loan_id, SUM(amount_paid) as total_pagado 
                    FROM loan_payments 
                    GROUP BY loan_id
                ) lp ON l.id = lp.loan_id
                WHERE l.status = 'activo'
                ORDER BY l.loan_date DESC
            `)
        ]);
        client.release();

        const employees = employeesResult.rows;
        const loans = loansResult.rows;

        let employeesOptionsHtml = employees.map(e => `<option value="${e.id}">${e.first_name} ${e.last_name}</option>`).join('');
        
        let loansHtml = loans.map(l => {
            const balancePendiente = parseFloat(l.loan_amount) - parseFloat(l.total_pagado);
            return `<tr style="cursor: pointer;" onclick="window.location.href='/prestamo/${l.id}';">
                <td>${new Date(l.loan_date).toLocaleDateString()}</td>
                <td>${l.first_name} ${l.last_name}</td>
                <td>$${parseFloat(l.loan_amount).toFixed(2)}</td>
                <td style="font-weight: bold; color: #dc3545;">$${balancePendiente.toFixed(2)}</td>
                <td>${l.reason || ''}</td>
            </tr>`
        }).join('') || '<tr><td colspan="5">No hay préstamos activos registrados.</td></tr>';

        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
                <div class="container">
                    ${backToDashboardLink}
                    <h2>Gestionar Préstamos a Colaboradores</h2>
                    <div class="form-container">
                        <h3>Registrar Nuevo Préstamo</h3>
                        <form action="/gestionar-prestamos" method="POST">
                            <div class="form-group"><label>Colaborador:</label><select name="employee_id" required><option value="">Seleccione...</option>${employeesOptionsHtml}</select></div>
                            <div class="form-group"><label>Fecha del Préstamo:</label><input type="date" name="loan_date" required></div>
                            <div class="form-group"><label>Monto del Préstamo:</label><input type="number" name="loan_amount" step="0.01" required></div>
                            <div class="form-group"><label>Motivo / Concepto (Opcional):</label><textarea name="reason" rows="2"></textarea></div>
                            <button type="submit" class="btn">Guardar Préstamo</button>
                        </form>
                    </div>
                    <hr style="margin: 40px 0;">
                    <h3>Préstamos Activos (Pendientes de Pago)</h3>
                    <table>
                        <thead><tr><th>Fecha Préstamo</th><th>Colaborador</th><th>Monto Original</th><th>Balance Pendiente</th><th>Motivo</th></tr></thead>
                        <tbody>${loansHtml}</tbody>
                    </table>
                </div>
            </body></html>
        `);
    } catch (error) {
        console.error("Error al cargar la página de préstamos:", error);
        res.status(500).send('<h1>Error al cargar la página ❌</h1>');
    }
});

// --- RUTA PARA GUARDAR UN NUEVO PRÉSTAMO ---
app.post('/gestionar-prestamos', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { employee_id, loan_date, loan_amount, reason } = req.body;
    if (!employee_id || !loan_date || !loan_amount) {
        return res.status(400).send("El colaborador, la fecha y el monto son obligatorios.");
    }
    try {
        const client = await pool.connect();
        await client.query(
            `INSERT INTO loans (employee_id, loan_date, loan_amount, reason) VALUES ($1, $2, $3, $4)`,
            [employee_id, loan_date, loan_amount, reason || null]
        );
        client.release();
        res.redirect('/gestionar-prestamos');
    } catch (error) {
        console.error("Error al guardar el préstamo:", error);
        res.status(500).send('<h1>Error al guardar el préstamo ❌</h1>');
    }
});
// --- RUTA PARA GUARDAR UN NUEVO AVANCE ---
app.post('/gestionar-avances', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { employee_id, advance_date, amount, reason } = req.body;
    if (!employee_id || !advance_date || !amount) {
        return res.status(400).send("El empleado, la fecha y el monto son obligatorios.");
    }
    try {
        const client = await pool.connect();
        await client.query(
            `INSERT INTO avances_empleado (employee_id, advance_date, amount, reason) VALUES ($1, $2, $3, $4)`,
            [employee_id, advance_date, amount, reason || null]
        );
        client.release();
        res.redirect('/gestionar-avances');
    } catch (error) {
        console.error("Error al guardar el avance:", error);
        res.status(500).send('<h1>Error al guardar el avance ❌</h1>');
    }
});
// =======================================================
//   NUEVAS RUTAS PARA DETALLES Y PAGOS DE PRÉSTAMOS
// =======================================================

// --- PÁGINA DE DETALLE DE UN PRÉSTAMO ESPECÍFICO ---
app.get('/prestamo/:id', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { id } = req.params;
    try {
        const client = await pool.connect();
        const loanResult = await client.query(
            `SELECT l.*, e.first_name, e.last_name 
             FROM loans l
             JOIN employees e ON l.employee_id = e.id 
             WHERE l.id = $1`, [id]);
        
        const paymentsResult = await client.query(
            `SELECT * FROM loan_payments WHERE loan_id = $1 ORDER BY payment_date DESC`, [id]);
        client.release();

        if (loanResult.rows.length === 0) {
            return res.status(404).send('Préstamo no encontrado.');
        }

        const loan = loanResult.rows[0];
        const payments = paymentsResult.rows;

        const totalPagado = payments.reduce((sum, p) => sum + parseFloat(p.amount_paid), 0);
        const balancePendiente = parseFloat(loan.loan_amount) - totalPagado;

        let paymentsHtml = payments.map(p => `
            <tr>
                <td>${new Date(p.payment_date).toLocaleDateString()}</td>
                <td>$${parseFloat(p.amount_paid).toFixed(2)}</td>
                <td>${p.payment_method || 'N/A'}</td>
                <td>
                    <a href="/recibo-pago-prestamo/${p.id}/pdf" target="_blank" class="btn" style="padding: 5px 10px; font-size: 14px;">Imprimir</a>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="4">No se han registrado pagos para este préstamo.</td></tr>';

        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
                <div class="container">
                    <a href="/gestionar-prestamos" class="back-link">↩️ Volver a Préstamos</a>
                    <h2>Préstamo a: ${loan.first_name} ${loan.last_name}</h2>
                    <p><strong>Fecha del Préstamo:</strong> ${new Date(loan.loan_date).toLocaleDateString()}</p>
                    <p><strong>Motivo:</strong> ${loan.reason || 'No especificado'}</p>
                    
                    <div class="summary">
                        <div class="summary-box"><h3>Monto Original</h3><p class="amount">$${parseFloat(loan.loan_amount).toFixed(2)}</p></div>
                        <div class="summary-box"><h3>Total Pagado</h3><p class="amount green">$${totalPagado.toFixed(2)}</p></div>
                        <div class="summary-box"><h3>Balance Pendiente</h3><p class="amount red">$${balancePendiente.toFixed(2)}</p></div>
                    </div>

                    ${balancePendiente > 0 ? `
                    <div class="form-container">
                        <h3>Registrar Nuevo Abono / Pago</h3>
                        <form action="/prestamo/${id}/registrar-pago" method="POST">
                            <div class="form-group"><label>Fecha del Pago:</label><input type="date" name="payment_date" required></div>
                            <div class="form-group"><label>Monto Pagado:</label><input type="number" name="amount_paid" step="0.01" max="${balancePendiente.toFixed(2)}" required></div>
                            <div class="form-group">
                                <label>Método de Pago:</label>
                                <select name="payment_method">
                                    <option value="Efectivo">Efectivo</option>
                                    <option value="Transferencia">Transferencia</option>
                                    <option value="Descuento Nómina">Descuento Nómina</option>
                                    <option value="Otro">Otro</option>
                                </select>
                            </div>
                            <div class="form-group"><label>Notas (Opcional):</label><textarea name="notes" rows="2"></textarea></div>
                            <button type="submit" class="btn">Guardar Pago</button>
                        </form>
                    </div>` : '<h3 style="text-align:center; color: #28a745;">Este préstamo ha sido saldado.</h3>'}

                    <hr style="margin: 40px 0;">
                    <h3>Historial de Pagos Realizados</h3>
                    <table>
                        <thead><tr><th>Fecha de Pago</th><th>Monto</th><th>Método</th><th>Acciones</th></tr></thead>
                        <tbody>${paymentsHtml}</tbody>
                    </table>
                </div>
            </body></html>
        `);
    } catch (error) {
        console.error("Error al cargar detalle de préstamo:", error);
        res.status(500).send('<h1>Error al cargar la página ❌</h1>');
    }
});

// --- RUTA PARA GUARDAR UN PAGO A UN PRÉSTAMO ---
app.post('/prestamo/:loanId/registrar-pago', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { loanId } = req.params;
    const { payment_date, amount_paid, payment_method, notes } = req.body;
    
    if (!payment_date || !amount_paid) {
        return res.status(400).send("La fecha y el monto son obligatorios.");
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Insertar el nuevo pago
        await client.query(
            `INSERT INTO loan_payments (loan_id, payment_date, amount_paid, payment_method, notes) 
             VALUES ($1, $2, $3, $4, $5)`,
            [loanId, payment_date, amount_paid, payment_method || null, notes || null]
        );

        // 2. Recalcular el total pagado y el balance
        const totalsResult = await client.query(
            `SELECT 
                l.loan_amount,
                COALESCE(SUM(p.amount_paid), 0) as total_pagado
             FROM loans l
             LEFT JOIN loan_payments p ON l.id = p.loan_id
             WHERE l.id = $1
             GROUP BY l.loan_amount`, [loanId]
        );

        const montoTotal = parseFloat(totalsResult.rows[0].loan_amount);
        const totalPagado = parseFloat(totalsResult.rows[0].total_pagado);
        const nuevoEstado = totalPagado >= montoTotal ? 'pagado' : 'activo';

        // 3. Actualizar el estado del préstamo si ya se saldó
        await client.query(
            `UPDATE loans SET status = $1 WHERE id = $2`,
            [nuevoEstado, loanId]
        );

        await client.query('COMMIT');
        res.redirect(`/prestamo/${loanId}`);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error al registrar el pago del préstamo:", error);
        res.status(500).send('<h1>Error al registrar el pago ❌</h1>');
    } finally {
        client.release();
    }
});

// --- RUTA PARA GENERAR EL PDF DEL RECIBO DE PAGO DE PRÉSTAMO ---
app.get('/recibo-pago-prestamo/:pagoId/pdf', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const { pagoId } = req.params;
        const client = await pool.connect();
        const result = await client.query(`
            SELECT p.*, l.loan_amount, e.first_name, e.last_name, e.cedula
            FROM loan_payments p
            JOIN loans l ON p.loan_id = l.id
            JOIN employees e ON l.employee_id = e.id
            WHERE p.id = $1`, [pagoId]);
        client.release();

        if (result.rows.length === 0) {
            return res.status(404).send('Pago de préstamo no encontrado.');
        }
        const pago = result.rows[0];

        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=recibo-prestamo-${pago.id}.pdf`);
        doc.pipe(res);

        doc.image(path.join(__dirname, 'plantillas', 'membrete.jpg'), 0, 0, { width: doc.page.width, height: doc.page.height });
        
        doc.y = 280;
        doc.font('Helvetica-Bold').fontSize(18).text('RECIBO DE ABONO A PRÉSTAMO', { align: 'center' });
        doc.moveDown(3);

        const formattedAmount = parseFloat(pago.amount_paid).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const date = new Date(pago.payment_date).toLocaleDateString('es-DO', { year: 'numeric', month: 'long', day: 'numeric' });

        doc.font('Helvetica').fontSize(12).lineGap(8);
        doc.text(`Por medio de la presente, yo, ${pago.first_name} ${pago.last_name}, portador de la cédula de identidad No. ${pago.cedula || '__________________'}, reconozco haber realizado un abono de RD$ ${formattedAmount}.`, { align: 'justify' });
        doc.moveDown();
        doc.text(`Este abono se aplica al préstamo #00${pago.loan_id} con fecha de ${date}, por concepto de ${pago.payment_method}.`, { align: 'justify' });
        doc.moveDown(8);

        const signatureY = doc.y > 600 ? 650 : doc.y + 100;

        doc.text('___________________________', 70, signatureY);
        doc.font('Helvetica-Bold').text(`${pago.first_name} ${pago.last_name}`, 70, signatureY + 15);
        doc.font('Helvetica').text('Recibido por (Firma)', 70, signatureY + 30);

        doc.end();
    } catch (error) {
        console.error("Error al generar el PDF de pago de préstamo:", error);
        res.status(500).send('Error al generar el recibo PDF.');
    }
});
// --- RUTA PARA GENERAR EL PDF DEL RECIBO DE AVANCE ---
app.get('/recibo-avance/:advanceId/pdf', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const { advanceId } = req.params;
        const client = await pool.connect();
        const result = await client.query(
            `SELECT a.*, e.first_name, e.last_name, e.cedula 
             FROM avances_empleado a 
             JOIN employees e ON a.employee_id = e.id 
             WHERE a.id = $1`, 
            [advanceId]
        );
        client.release();

        if (result.rows.length === 0) {
            return res.status(404).send('Avance no encontrado.');
        }
        const advance = result.rows[0];

        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=avance-${advance.id}.pdf`);
        doc.pipe(res);

        doc.image(path.join(__dirname, 'plantillas', 'membrete.jpg'), 0, 0, { width: doc.page.width, height: doc.page.height });
        
        doc.y = 280;
        doc.font('Helvetica-Bold').fontSize(18).text('RECIBO DE AVANCE DE SUELDO', { align: 'center' });
        doc.moveDown(3);

        const formattedAmount = parseFloat(advance.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const date = new Date(advance.advance_date).toLocaleDateString('es-DO', { year: 'numeric', month: 'long', day: 'numeric' });

        doc.font('Helvetica').fontSize(12).lineGap(8);
        doc.text(`Por medio de la presente, yo, ${advance.first_name} ${advance.last_name}, portador de la cédula de identidad No. ${advance.cedula || '__________________'}, reconozco haber recibido de la empresa la suma de RD$ ${formattedAmount}.`, { align: 'justify' });
        doc.moveDown();
        doc.text(`Este monto corresponde a un avance de mi sueldo, solicitado en fecha ${date}. Entiendo que este valor será descontado de mi próximo pago de nómina.`, { align: 'justify' });
        doc.moveDown(8);

        const signatureY = doc.y > 600 ? 650 : doc.y + 100;

        doc.text('___________________________', 70, signatureY);
        doc.font('Helvetica-Bold').text(`${advance.first_name} ${advance.last_name}`, 70, signatureY + 15);
        doc.font('Helvetica').text('Recibido por (Firma)', 70, signatureY + 30);

        doc.end();
    } catch (error) {
        console.error("Error al generar el PDF de avance:", error);
        res.status(500).send('Error al generar el recibo PDF.');
    }
});


app.get('/generar-nomina', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const client = await pool.connect();
        // Modificamos la consulta para que:
        // 1. Solo traiga empleados que participan en nómina.
        // 2. Traiga la suma de todos sus avances pendientes.
        const result = await client.query(`
            SELECT 
                e.id, e.first_name, e.last_name, e.base_salary, e.payment_frequency,
                COALESCE(a.total_avances, 0) as total_avances_pendientes
            FROM employees e
            LEFT JOIN (
                SELECT employee_id, SUM(amount) as total_avances
                FROM avances_empleado
                WHERE status = 'pendiente'
                GROUP BY employee_id
            ) a ON e.id = a.employee_id
            WHERE e.participa_en_nomina = TRUE
            ORDER BY e.first_name, e.last_name ASC
        `);
        const employees = result.rows;
        client.release();

        let employeesRowsHtml = employees.map(e => {
            const monthlySalary = parseFloat(e.base_salary || 0);
            let salaryForPeriod = monthlySalary;

            if (e.payment_frequency === 'quincenal') {
                salaryForPeriod /= 2;
            }

            // Calculamos el descuento y el pago neto inicial
            const initialDeductions = parseFloat(e.total_avances_pendientes || 0);
            const initialNetPay = salaryForPeriod + 0 - initialDeductions; // 0 para bonos iniciales

            return `
                <tr data-employee-id="${e.id}">
                    <td>${e.first_name} ${e.last_name}</td>
                    <td data-base-salary="${salaryForPeriod.toFixed(2)}">$${salaryForPeriod.toFixed(2)}</td>
                    <td><input type="number" name="bonuses_${e.id}" class="payroll-input" step="0.01" value="0"></td>
                    
                    <td><input type="number" name="deductions_${e.id}" class="payroll-input" step="0.01" value="${initialDeductions.toFixed(2)}"></td>
                    
                    <td class="net-pay" style="font-weight: bold;">$${initialNetPay.toFixed(2)}</td>
                    
                    <td><textarea name="notes_${e.id}" rows="1" style="width: 100%;"></textarea></td>
                </tr>
            `;
        }).join('');

        if (employees.length === 0) {
            employeesRowsHtml = '<tr><td colspan="6">No hay empleados registrados o ninguno participa en la nómina.</td></tr>';
        }

        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
                <div class="container">
                    ${backToDashboardLink}
                    <h2>Generar Nómina Quincenal</h2>
                    <form id="payroll-form" action="/guardar-nomina" method="POST">
                        <div class="form-group">
                            <label for="pay_date">Fecha de Pago:</label>
                            <input type="date" id="pay_date" name="pay_date" required>
                        </div>
                        <table>
                            <thead>
                                <tr>
                                    <th>Empleado</th>
                                    <th>Salario del Período</th>
                                    <th>Bonos (+)</th>
                                    <th>Descuentos (-)</th>
                                    <th>Pago Neto</th>
                                    <th>Notas</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${employeesRowsHtml}
                            </tbody>
                        </table>
                        <button type="submit" class="btn" style="margin-top: 20px;">Guardar y Procesar Nómina</button>
                    </form>
                </div>

                <script>
                    document.querySelectorAll('.payroll-input').forEach(input => {
                        input.addEventListener('input', (event) => {
                            const row = event.target.closest('tr');
                            const baseSalary = parseFloat(row.querySelector('[data-base-salary]').dataset.baseSalary);
                            const bonuses = parseFloat(row.querySelector('input[name^="bonuses"]').value) || 0;
                            const deductions = parseFloat(row.querySelector('input[name^="deductions"]').value) || 0;
                            
                            const netPay = baseSalary + bonuses - deductions;
                            
                            row.querySelector('.net-pay').textContent = '$' + netPay.toFixed(2);
                        });
                    });
                </script>
            </body></html>
        `);
    } catch (error) {
        console.error("Error al generar la página de nómina:", error);
        res.status(500).send('<h1>Error al cargar la página de nómina ❌</h1>');
    }
});

app.post('/guardar-nomina', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { pay_date } = req.body;
    if (!pay_date) {
        return res.status(400).send("La fecha de pago es obligatoria.");
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Obtenemos solo los empleados que participan en nómina
        const employeesResult = await client.query('SELECT id, base_salary, payment_frequency FROM employees WHERE participa_en_nomina = TRUE');
        const employees = employeesResult.rows;

        for (const employee of employees) {
            const employeeId = employee.id;
            
            const monthlySalary = parseFloat(employee.base_salary || 0);
            let salaryForPeriod = monthlySalary;
            if (employee.payment_frequency === 'quincenal') {
                salaryForPeriod /= 2;
            }

            const bonuses = parseFloat(req.body[`bonuses_${employeeId}`] || 0);
            const deductions = parseFloat(req.body[`deductions_${employeeId}`] || 0);
            const notes = req.body[`notes_${employeeId}`] || '';
            const netPay = salaryForPeriod + bonuses - deductions;

            // 1. Insertamos el registro de nómina y obtenemos su nuevo ID
            const payrollInsertResult = await client.query(
                `INSERT INTO payroll_records (employee_id, pay_date, base_salary_paid, bonuses, deductions, net_pay, notes)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING id`, // Devolvemos el ID del registro creado
                [employeeId, pay_date, salaryForPeriod, bonuses, deductions, netPay, notes]
            );

            const newPayrollRecordId = payrollInsertResult.rows[0].id;

            // 2. Si hubo descuentos, actualizamos los avances pendientes de este empleado
            if (deductions > 0) {
                await client.query(
                    `UPDATE avances_empleado 
                     SET status = 'pagado', payroll_record_id = $1 
                     WHERE employee_id = $2 AND status = 'pendiente'`,
                    [newPayrollRecordId, employeeId]
                );
            }
        }

        await client.query('COMMIT');
        res.redirect('/historial-nomina');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error al guardar la nómina:", error);
        res.status(500).send('<h1>Error al guardar la nómina ❌</h1>');
    } finally {
        client.release();
    }
});
app.get('/historial-nomina', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query(`
            SELECT 
                pr.id, pr.pay_date, pr.base_salary_paid, pr.bonuses, pr.deductions, pr.net_pay,
                e.first_name, e.last_name
            FROM payroll_records pr
            JOIN employees e ON pr.employee_id = e.id
            ORDER BY pr.pay_date DESC, e.last_name ASC;
        `);
        const records = result.rows;
        client.release();

        let recordsHtml = records.map(r => `
            <tr>
                <td>${new Date(r.pay_date).toLocaleDateString()}</td>
                <td>${r.first_name} ${r.last_name}</td>
                <td>$${parseFloat(r.base_salary_paid).toFixed(2)}</td>
                <td>$${parseFloat(r.bonuses).toFixed(2)}</td>
                <td>$${parseFloat(r.deductions).toFixed(2)}</td>
                <td style="font-weight: bold;">$${parseFloat(r.net_pay).toFixed(2)}</td>
                <td>
                    <a href="/recibo-nomina/${r.id}/pdf" target="_blank" class="btn" style="padding: 5px 10px; font-size: 14px;">
                        Imprimir
                    </a>
                </td>
            </tr>
        `).join('');

        if (records.length === 0) {
            recordsHtml = '<tr><td colspan="7">No hay registros de nómina guardados.</td></tr>';
        }

        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
                <div class="container">
                    ${backToDashboardLink}
                    <h2>Historial de Pagos de Nómina</h2>
                    <table>
                        <thead><tr><th>Fecha de Pago</th><th>Empleado</th><th>Salario Pagado</th><th>Bonos</th><th>Descuentos</th><th>Pago Neto</th><th>Acciones</th></tr></thead>
                        <tbody>${recordsHtml}</tbody>
                    </table>
                </div>
            </body></html>
        `);
    } catch (error) {
        console.error("Error al obtener el historial de nómina:", error);
        res.status(500).send('<h1>Error al cargar el historial ❌</h1>');
    }
});

// =======================================================
// NUEVA RUTA PARA GENERAR PDF DE RECIBO DE NÓMINA
// =======================================================
app.get('/recibo-nomina/:recordId/pdf', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const { recordId } = req.params;
        const client = await pool.connect();
        const result = await client.query(`
            SELECT 
                pr.*,
                e.first_name, e.last_name, e.cedula
            FROM payroll_records pr
            JOIN employees e ON pr.employee_id = e.id
            WHERE pr.id = $1
        `, [recordId]);
        client.release();

        if (result.rows.length === 0) {
            return res.status(404).send('Registro de nómina no encontrado.');
        }
        const record = result.rows[0];

        const doc = new PDFDocument({ size: 'letter', margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=recibo-nomina-${record.first_name}-${record.last_name}-${record.id}.pdf`);
        doc.pipe(res);

        const backgroundImagePath = path.join(__dirname, 'plantillas', 'membrete.jpg');
        if (fs.existsSync(backgroundImagePath)) {
            doc.image(backgroundImagePath, 0, 0, { width: doc.page.width, height: doc.page.height });
        }
        
        doc.font('Helvetica-Bold').fontSize(16).text('VOLANTE DE PAGO DE NÓMINA', { align: 'center', y: 250 });
        doc.moveDown(2);

        const startY = doc.y;
        doc.font('Helvetica').fontSize(11);
        doc.text(`Nombre del Empleado:`, 70, startY).text(`${record.first_name} ${record.last_name}`, 200, startY);
        doc.text(`Cédula:`, 70, startY + 20).text(record.cedula || 'N/A', 200, startY + 20);
        doc.text(`Fecha de Pago:`, 70, startY + 40).text(new Date(record.pay_date).toLocaleDateString('es-DO'), 200, startY + 40);
        doc.moveDown(4);

        doc.moveTo(70, doc.y).lineTo(doc.page.width - 70, doc.y).stroke();
        doc.moveDown();

        doc.font('Helvetica-Bold').text('INGRESOS', 70, doc.y);
        doc.font('Helvetica').text('Salario Base del Período', 90, doc.y + 20).text(`$${parseFloat(record.base_salary_paid).toFixed(2)}`, 400, doc.y, { align: 'right' });
        doc.text('Bonos / Ingresos Adicionales', 90, doc.y + 15).text(`$${parseFloat(record.bonuses).toFixed(2)}`, 400, doc.y, { align: 'right' });
        doc.moveDown(2);

        doc.font('Helvetica-Bold').text('DEDUCCIONES', 70, doc.y);
        doc.font('Helvetica').text('Descuentos / Avances', 90, doc.y + 20).text(`$${parseFloat(record.deductions).toFixed(2)}`, 400, doc.y, { align: 'right' });
        doc.moveDown(2);

        // --- INICIO DE LA MODIFICACIÓN ---
        // Añadimos la sección de Notas si existen
        if (record.notes && record.notes.trim() !== '') {
            doc.font('Helvetica-Bold').text('NOTAS:', 70, doc.y);
            doc.font('Helvetica').fontSize(10).text(record.notes, 90, doc.y + 15, {
                width: doc.page.width - 160, // Ancho del texto
                align: 'left'
            });
            doc.moveDown(2); // Espacio extra
        }
        // --- FIN DE LA MODIFICACIÓN ---

        doc.moveTo(70, doc.y).lineTo(doc.page.width - 70, doc.y).stroke();
        doc.moveDown();

        doc.font('Helvetica-Bold').fontSize(14).text('MONTO NETO A PAGAR:', 70, doc.y).text(`RD$ ${parseFloat(record.net_pay).toFixed(2)}`, 350, doc.y, { align: 'right' });
        doc.moveDown(5);
        
        doc.font('Helvetica').fontSize(10);
        doc.text('___________________________', 70, doc.y + 50);
        doc.text('Firma del Empleado', 70, doc.y + 5);

        doc.end();

    } catch (error) {
        console.error("Error al generar recibo de nómina:", error);
        res.status(500).send('Error al generar el recibo PDF.');
    }
});

app.get('/proyecto/:id', requireLogin, requireAdminOrCoord, async (req, res) => {
    const centerId = req.params.id;
    try {
        const client = await pool.connect();
        
        const quoteResult = await client.query(
            `SELECT q.*, c.name as centerName FROM quotes q LEFT JOIN centers c ON q.clientname = c.name WHERE c.id = $1 AND q.status = 'activa' ORDER BY q.createdat DESC LIMIT 1`,
            [centerId]
        );
        
        if (quoteResult.rows.length === 0) {
            const centerResult = await client.query('SELECT name FROM centers WHERE id = $1', [centerId]);
            const centerName = centerResult.rows.length > 0 ? centerResult.rows[0].name : "Cliente Desconocido";
            client.release();
            return res.status(404).send(`<h1>${centerName}</h1><p>No se encontró un proyecto activo para este cliente.</p><a href="/clientes">Volver a la lista</a>`);
        }
        const quote = quoteResult.rows[0];
        
        const [paymentsResult, expensesResult, suppliersResult, adjustmentsResult] = await Promise.all([
            client.query(`SELECT * FROM payments WHERE quote_id = $1 ORDER BY payment_date DESC`, [quote.id]),
            client.query(`SELECT e.*, s.name as supplier_name FROM expenses e JOIN suppliers s ON e.supplier_id = s.id WHERE e.quote_id = $1 ORDER BY e.expense_date DESC`, [quote.id]),
            client.query('SELECT * FROM suppliers ORDER BY name ASC'),
            client.query(`SELECT * FROM ajustes_cotizacion WHERE quote_id = $1 ORDER BY fecha_ajuste ASC`, [quote.id])
        ]);
        
        client.release();
        const payments = paymentsResult.rows;
        const expenses = expensesResult.rows;
        const suppliers = suppliersResult.rows;
        
        const montoOriginal = parseFloat(quote.preciofinalporestudiante || 0) * parseFloat(quote.estudiantesparafacturar || 0);
        const totalAjustes = adjustmentsResult.rows.reduce((sum, adj) => sum + parseFloat(adj.monto_ajuste), 0);
        const totalVenta = montoOriginal + totalAjustes;

        const totalAbonado = payments.reduce((sum, payment) => sum + parseFloat(payment.amount), 0);
        const totalGastado = expenses.reduce((sum, expense) => sum + parseFloat(expense.amount), 0);
        const balancePendiente = totalVenta - totalAbonado;
        const rentabilidad = totalAbonado - totalGastado;

        let adjustmentsHtml = adjustmentsResult.rows.map(adj => `
            <tr>
                <td>${new Date(adj.fecha_ajuste).toLocaleString('es-DO')}</td>
                <td style="color: ${adj.monto_ajuste >= 0 ? 'green' : 'red'}; font-weight: bold;">
                    ${adj.monto_ajuste >= 0 ? '+' : ''}$${parseFloat(adj.monto_ajuste).toFixed(2)}
                </td>
                <td>${adj.motivo}</td>
                <td>${adj.ajustado_por}</td>
            </tr>
        `).join('') || '<tr><td colspan="4">No se han realizado ajustes.</td></tr>';

        let paymentsHtml = payments.map(p => `
            <tr>
                <td>${new Date(p.payment_date).toLocaleDateString()}</td>
                <td>$${parseFloat(p.amount).toFixed(2)}</td>
                <td>${p.students_covered || 'N/A'}</td>
                <td>${p.comment || ''}</td>
                <td style="text-align: center;">
                    <a href="/recibo-pago/${p.id}/pdf?v=${Date.now()}" target="_blank" class="btn" style="padding: 5px 10px; font-size: 12px; background-color: #17a2b8;">
                        Recibo
                    </a>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="5">No hay pagos registrados.</td></tr>';
        
        // --- INICIO DE LA MODIFICACIÓN ---
        let expensesHtml = expenses.map(e => `
            <tr>
                <td>${new Date(e.expense_date).toLocaleDateString()}</td>
                <td>${e.supplier_name}</td>
                <td>${e.description}</td>
                <td>$${parseFloat(e.amount).toFixed(2)}</td>
                <td>${e.type || ''}</td>
                <td style="text-align: center;">
                    <a href="/desembolso/${e.id}/pdf" target="_blank" class="btn" style="padding: 5px 10px; font-size: 14px;">Imprimir</a>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="6">No hay gastos registrados.</td></tr>'; // colspan ahora es 6
        // --- FIN DE LA MODIFICACIÓN ---

        let suppliersOptionsHtml = suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

        res.send(`
            <!DOCTYPE html><html lang="es">
            <head>
                ${commonHtmlHead.replace('<title>Panel de Administración</title>', `<title>Proyecto ${quote.clientname}</title>`)}
                <style>.admin-notes { background-color: #fff3cd; border-left: 5px solid #ffeeba; padding: 15px; margin: 20px 0; border-radius: 5px; }</style>
            </head>
            <body>
                <div class="container" style="max-width: 900px;">
                    ${backToDashboardLink}
                    <div class="header" style="border-bottom: 2px solid #007bff; padding-bottom: 10px; margin-bottom: 20px;">
                        <h1>${quote.clientname}</h1>
                        <p>
                            Cotización #${quote.quotenumber} &bull; Asesor: ${quote.advisorname}
                            <a href="/ver-cotizacion-pdf/${quote.id}" target="_blank" class="btn" style="padding: 5px 10px; font-size: 12px; background-color: #6c757d; margin-left: 20px;">
                                Ver Cotización Original 📄
                            </a>
                        </p>
                    </div>
                    ${quote.notas_administrativas ? `<div class="admin-notes"><strong>Notas Administrativas:</strong><br>${quote.notas_administrativas.replace(/\n/g, '<br>')}</div>` : ''}
                    <div class="summary">
                        <div class="summary-box">
                            <div class="header-with-button">
                                <h3 style="margin:0;">Monto Total Venta</h3>
                                <button onclick="abrirModalAjuste()" style="padding: 3px 8px; font-size: 12px;" class="btn">Ajustar</button>
                            </div>
                            <p class="amount">$${totalVenta.toFixed(2)}</p>
                        </div>
                        <div class="summary-box"><h3>Total Abonado</h3><p class="amount green">$${totalAbonado.toFixed(2)}</p></div>
                        <div class="summary-box"><h3>Total Gastado</h3><p class="amount orange">$${totalGastado.toFixed(2)}</p></div>
                        <div class="summary-box"><h3>Rentabilidad Actual</h3><p class="amount ${rentabilidad >= 0 ? 'blue' : 'red'}">$${rentabilidad.toFixed(2)}</p></div>
                    </div>
                    
                    <hr style="margin: 40px 0;">
                    <h2>Historial de Ajustes al Monto de Venta</h2>
                    <table>
                        <thead><tr><th>Fecha</th><th>Ajuste (+/-)</th><th>Motivo</th><th>Realizado por</th></tr></thead>
                        <tbody>${adjustmentsHtml}</tbody>
                    </table>

                    <hr style="margin: 40px 0;">
                    <h2><span style="color: #28a745;">Ingresos</span> (Abonos Realizados)</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Monto</th>
                                <th>Estudiantes Cubiertos</th>
                                <th>Comentario</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>${paymentsHtml}</tbody>
                    </table>
                    <button class="btn btn-toggle" onclick="toggleForm('payment-form-container')">Registrar Nuevo Abono</button>
                    <div id="payment-form-container" class="payment-form" style="display: none;">
                        <h2>Nuevo Abono</h2>
                        <form action="/proyecto/${quote.id}/nuevo-pago" method="POST"><input type="hidden" name="centerId" value="${centerId}"><div class="form-group"><label>Fecha:</label><input type="date" name="payment_date" required></div><div class="form-group"><label>Monto:</label><input type="number" name="amount" step="0.01" required></div><div class="form-group"><label>Estudiantes Cubiertos:</label><input type="number" name="students_covered"></div><div class="form-group"><label>Comentario:</label><textarea name="comment" rows="2"></textarea></div><button type="submit" class="btn">Guardar Abono</button></form>
                    </div>
                    <hr style="margin: 40px 0;">
                    <h2><span style="color: #dc3545;">Egresos</span> (Gastos del Proyecto)</h2>
                    
                    <table>
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Suplidor</th>
                                <th>Descripción</th>
                                <th>Monto</th>
                                <th>Tipo</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>${expensesHtml}</tbody>
                    </table>
                    <button class="btn btn-toggle btn-gasto" onclick="toggleForm('expense-form-container')">Registrar Nuevo Gasto</button>
                    <div id="expense-form-container" class="expense-form" style="display: none;">
                        <h2>Nuevo Gasto</h2>
                        <form action="/proyecto/${quote.id}/nuevo-gasto" method="POST"><input type="hidden" name="centerId" value="${centerId}"><div class="form-group"><label>Fecha:</label><input type="date" name="expense_date" required></div><div class="form-group"><label>Suplidor:</label><select name="supplier_id" required><option value="">Seleccione un suplidor...</option>${suppliersOptionsHtml}</select></div><div class="form-group"><label>Monto:</label><input type="number" name="amount" step="0.01" required></div><div class="form-group"><label>Tipo:</label><select name="type"><option value="">Seleccionar...</option><option value="Con Valor Fiscal">Con Valor Fiscal</option><option value="Sin Valor Fiscal">Sin Valor Fiscal</option></select></div><div class="form-group"><label>Descripción:</label><textarea name="description" rows="2" required></textarea></div><button type="submit" class="btn">Guardar Gasto</button></form>
                    </div>
                </div>
                <script>
                    function toggleForm(id) { const el = document.getElementById(id); el.style.display = el.style.display === 'none' || el.style.display === '' ? 'block' : 'none'; }
                    
                    async function abrirModalAjuste() {
                        const monto_ajuste_str = prompt("Introduce el monto a ajustar (ej: 500 para sumar, -250 para restar):");
                        if (monto_ajuste_str === null) return;

                        const motivo = prompt("Introduce el motivo del ajuste:");
                        if (motivo === null || !motivo.trim()) {
                            alert("Error: Se requiere un motivo para el ajuste.");
                            return;
                        }

                        const codigo_secreto = prompt("Introduce el código de seguridad para confirmar:");
                        if (codigo_secreto === null) return;

                        const monto_ajuste = parseFloat(monto_ajuste_str);
                        if (isNaN(monto_ajuste)) {
                            alert("Error: El monto debe ser un número válido.");
                            return;
                        }

                        try {
                            const response = await fetch('/proyecto/${quote.id}/ajustar-monto', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ monto_ajuste, motivo, codigo_secreto })
                            });
                            const result = await response.json();
                            if (response.ok && result.success) {
                                alert('¡Ajuste guardado con éxito!');
                                window.location.reload();
                            } else {
                                alert('Error al guardar: ' + (result.message || 'Respuesta no válida del servidor.'));
                            }
                        } catch (error) {
                            console.error('Error en fetch:', error);
                            alert('Hubo un error de conexión. Inténtalo de nuevo.');
                        }
                    }
                </script>
            </body></html>`);
    } catch (error) {
        console.error("Error al obtener detalle del proyecto:", error);
        res.status(500).send('<h1>Error al obtener los detalles del proyecto ❌</h1>');
    }
});
app.post('/proyecto/:id/nuevo-pago', requireLogin, requireAdminOrCoord, async (req, res) => {
    const quoteId = req.params.id;
    const { centerId, payment_date, amount, students_covered, comment } = req.body;
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Guardar el abono del cliente
        const paymentResult = await client.query(
            `INSERT INTO payments (quote_id, payment_date, amount, students_covered, comment) 
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [quoteId, payment_date, amount, students_covered || null, comment]
        );
        const newPaymentId = paymentResult.rows[0].id;

        // --- INICIO DE LA LÓGICA DE COMISIONES ---

        // 2. Obtener la información necesaria: nombre del asesor de la cotización
        const quoteResult = await client.query('SELECT advisorname FROM quotes WHERE id = $1', [quoteId]);
        const advisorName = quoteResult.rows[0].advisorname;

        // 3. Buscar al asesor en nuestra nueva tabla de asesores
        const advisorResult = await client.query('SELECT * FROM advisors WHERE name = $1', [advisorName]);

        if (advisorResult.rows.length > 0) {
            const advisor = advisorResult.rows[0];
            const baseAmount = parseFloat(amount);
            
            // 4. Calcular y guardar la comisión de venta del asesor
            const advisorCommissionRate = parseFloat(advisor.commission_rate);
            const advisorCommissionAmount = baseAmount * advisorCommissionRate;

            await client.query(
                `INSERT INTO commissions (payment_id, advisor_id, commission_type, base_amount, commission_rate, commission_amount)
                 VALUES ($1, $2, 'venta', $3, $4, $5)`,
                [newPaymentId, advisor.id, baseAmount, advisorCommissionRate, advisorCommissionAmount]
            );
            
            // 5. Si el vendedor NO es el coordinador, calcular la comisión del coordinador
            if (!advisor.is_coordinator) {
                const coordinatorRateResult = await client.query(`SELECT value FROM app_settings WHERE key = 'coordinator_override_rate'`);
                const coordinatorResult = await client.query(`SELECT * FROM advisors WHERE is_coordinator = true LIMIT 1`);

                if (coordinatorRateResult.rows.length > 0 && coordinatorResult.rows.length > 0) {
                    const coordinator = coordinatorResult.rows[0];
                    const coordinatorCommissionRate = parseFloat(coordinatorRateResult.rows[0].value);
                    const coordinatorCommissionAmount = baseAmount * coordinatorCommissionRate;

                    await client.query(
                        `INSERT INTO commissions (payment_id, advisor_id, commission_type, base_amount, commission_rate, commission_amount)
                         VALUES ($1, $2, 'coordinador', $3, $4, $5)`,
                        [newPaymentId, coordinator.id, baseAmount, coordinatorCommissionRate, coordinatorCommissionAmount]
                    );
                }
            }
        }
        // --- FIN DE LA LÓGICA DE COMISIONES ---

        await client.query('COMMIT');
        res.redirect(`/proyecto/${centerId}`);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error al guardar el pago y procesar comisiones:", error);
        res.status(500).send('<h1>Error al guardar el pago ❌</h1>');
    } finally {
        client.release();
    }
});
app.post('/proyecto/:id/nuevo-gasto', requireLogin, requireAdminOrCoord, async (req, res) => {
    const quoteId = req.params.id;
    const { centerId, expense_date, supplier_id, amount, description, type } = req.body;
    if (!expense_date || !supplier_id || !amount || !description) {
        return res.status(400).send("La fecha, suplidor, monto y descripción son obligatorios.");
    }
    try {
        const client = await pool.connect();
        await client.query(
            `INSERT INTO expenses (quote_id, expense_date, supplier_id, amount, description, type) VALUES ($1, $2, $3, $4, $5, $6)`,
            [quoteId, expense_date, supplier_id, amount, description, type]
        );
        client.release();
        res.redirect(`/proyecto/${centerId}`);
    } catch (error) {
        console.error("Error al guardar el gasto:", error);
        res.status(500).send('<h1>Error al guardar el gasto ❌</h1>');
    }
});

// =======================================================
// NUEVA RUTA PARA GUARDAR LOS AJUSTES DE MONTO
// =======================================================
app.post('/proyecto/:quoteId/ajustar-monto', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { quoteId } = req.params;
    const { monto_ajuste, motivo, codigo_secreto } = req.body;
    const ajustado_por = req.session.user.nombre;

    if (codigo_secreto !== CODIGO_SECRETO_AJUSTE) {
        return res.status(403).json({ success: false, message: 'Código de seguridad incorrecto.' });
    }

    const monto = parseFloat(monto_ajuste);
    if (isNaN(monto) || !motivo || !motivo.trim()) {
        return res.status(400).json({ success: false, message: 'El monto debe ser un número y el motivo es obligatorio.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Insertar el nuevo ajuste en el historial
        await client.query(
            `INSERT INTO ajustes_cotizacion (quote_id, monto_ajuste, motivo, ajustado_por) 
             VALUES ($1, $2, $3, $4)`,
            [quoteId, monto, motivo, ajustado_por]
        );
        
        await client.query('COMMIT');
        res.json({ success: true, message: 'Ajuste guardado correctamente.' });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error al guardar el ajuste de monto:", error);
        res.status(500).json({ success: false, message: 'Error en el servidor al guardar el ajuste.' });
    } finally {
        client.release();
    }
});
// =======================================================
//   NUEVA RUTA PARA GENERAR RECIBOS DE PAGO EN PDF
// =======================================================

// --- Función Auxiliar para convertir número a letras ---
function numeroALetras(num) {
    const unidades = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
    const decenas = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
    const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
    const especiales = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];

    function convertir(n) {
        if (n < 10) return unidades[n];
        if (n < 20) return especiales[n - 10];
        if (n < 100) {
            const u = n % 10;
            const d = Math.floor(n / 10);
            return decenas[d] + (u > 0 ? ' Y ' + unidades[u] : '');
        }
        if (n < 1000) {
            const c = Math.floor(n / 100);
            const resto = n % 100;
            return (n === 100 ? 'CIEN' : centenas[c]) + (resto > 0 ? ' ' + convertir(resto) : '');
        }
        if (n < 1000000) {
            const miles = Math.floor(n / 1000);
            const resto = n % 1000;
            return (miles === 1 ? 'MIL' : convertir(miles) + ' MIL') + (resto > 0 ? ' ' + convertir(resto) : '');
        }
        return '';
    }

    const numeroEntero = Math.floor(num);
    const centavos = Math.round((num - numeroEntero) * 100);
    const letras = convertir(numeroEntero);

    return `${letras} PESOS DOMINICANOS ${centavos.toString().padStart(2, '0')}/100`;
}


app.get('/recibo-pago/:paymentId/pdf', requireLogin, async (req, res) => {
    console.log(`[${new Date().toLocaleTimeString()}] -> Solicitud recibida para generar recibo.`);
    try {
        const { paymentId } = req.params;
        const client = await pool.connect();
        
        const paymentResult = await client.query(
            `SELECT p.*, q.clientname, q.quotenumber 
             FROM payments p 
             JOIN quotes q ON p.quote_id = q.id 
             WHERE p.id = $1`,
            [paymentId]
        );
        client.release();

        if (paymentResult.rows.length === 0) {
            console.warn(`[${new Date().toLocaleTimeString()}] -> ADVERTENCIA: No se encontró el pago con ID: ${paymentId}`);
            return res.status(404).send('Recibo no encontrado.');
        }
        const payment = paymentResult.rows[0];
        console.log(`[${new Date().toLocaleTimeString()}] -> Pago encontrado. ID: ${payment.id}, Cliente: ${payment.clientname}`);

        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({ size: 'A4', margin: 50 });

        const nombreArchivo = `RECIBO-${payment.id}-${Date.now()}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=${nombreArchivo}`);
        console.log(`[${new Date().toLocaleTimeString()}] -> Creando PDF con nombre de archivo: ${nombreArchivo}`);
        
        doc.pipe(res);

        const backgroundImagePath = path.join(__dirname, 'plantillas', 'membrete.jpg');
        doc.image(backgroundImagePath, 0, 0, { width: doc.page.width, height: doc.page.height });
        
        const yPosition = 320;
        
        // --- PRUEBA CLAVE ---
        console.log(`✅✅✅ CONFIRMACIÓN DE POSICIÓN Y: ${yPosition} ✅✅✅`);
        doc.y = yPosition; // <-- PASO 1: Establecemos la posición Y de forma explícita.
        doc.font('Helvetica-Bold').fontSize(20).text('RECIBO DE PAGO', { align: 'center' }); // <-- PASO 2: Escribimos el texto.
        // --- FIN DE PRUEBA ---
        
        doc.moveDown(3);
        doc.font('Helvetica-Bold').fontSize(11).text(`RECIBO No.:`, 320, doc.y, { continued: true }).font('Helvetica').text(` REC-${String(payment.id).padStart(4, '0')}`);
        doc.font('Helvetica-Bold').text(`FECHA:`, { continued: true }).font('Helvetica').text(` ${new Date(payment.payment_date).toLocaleDateString('es-DO')}`);
        doc.y = doc.y - 30;
        doc.font('Helvetica-Bold').text('RECIBIDO DE:', 60, doc.y);
        doc.font('Helvetica').fontSize(14).text(payment.clientname);
        doc.moveDown(2);
        doc.font('Helvetica-Bold').fontSize(11).text('LA SUMA DE:');
        doc.font('Helvetica').fontSize(10).text(numeroALetras(payment.amount));
        doc.moveDown(2);
        doc.font('Helvetica-Bold').fontSize(11).text('POR CONCEPTO DE:');
        const concepto = payment.comment || `Abono a cotización #${payment.quotenumber}`;
        doc.font('Helvetica').fontSize(10).text(concepto);
        doc.moveDown(4);

        const formattedAmount = parseFloat(payment.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        doc.font('Helvetica-Bold').fontSize(16).text(`MONTO: RD$ ${formattedAmount}`, { align: 'right' });

        doc.moveDown(8);
        doc.font('Helvetica').fontSize(10);
        doc.text('___________________________', 60, doc.y, { align: 'left' });
        doc.text('Recibido por', { align: 'left' });

        console.log(`[${new Date().toLocaleTimeString()}] -> PDF finalizado y enviado al navegador.`);

        doc.end();

    } catch (error) {
        console.error(`[${new Date().toLocaleTimeString()}] -> !!! ERROR CATASTRÓFICO AL GENERAR RECIBO:`, error);
        res.status(500).send('Error al generar el recibo.');
    }
});

app.listen(PORT, () => {
    console.log(`✅ Servidor de Administración corriendo en http://localhost:${PORT}`);
});
