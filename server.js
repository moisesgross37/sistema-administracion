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
});// =======================================================
// ============== ESTILOS Y DISEÑO PROFESIONAL 2026 ==============
// =======================================================

const commonHtmlHead = `
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PCOE - Panel de Control</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #4e73df;
            --bg-body: #f0f2f5;
            --card-shadow: 0 0.15rem 1.75rem 0 rgba(33, 40, 50, 0.15);
            --text-dark: #2e2f37;
            --text-gray: #858796;
        }

        body { 
            font-family: 'Inter', sans-serif; 
            background-color: var(--bg-body); 
            margin: 0; color: #5a5c69; 
        }

        .container { max-width: 1100px; margin: 40px auto; padding: 0 20px; }

        /* ARREGLO DEL DASHBOARD (AFUERA) */
        .module { margin-bottom: 40px; }
        .module h2 { font-size: 1.2rem; color: var(--primary); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 20px; border-bottom: 2px solid #e3e6f0; padding-bottom: 10px; }
        
        .dashboard { 
            display: grid; 
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); 
            gap: 20px; 
        }

        .dashboard-card {
            background: white;
            border-radius: 12px;
            padding: 25px;
            text-decoration: none;
            color: inherit;
            box-shadow: var(--card-shadow);
            border-left: 5px solid var(--primary);
            transition: transform 0.2s, box-shadow 0.2s;
            display: block;
        }
        .dashboard-card:hover { transform: translateY(-5px); box-shadow: 0 1rem 3rem rgba(0,0,0,0.1); }
        .dashboard-card h3 { margin: 0 0 10px; font-size: 1rem; color: var(--primary); }
        .dashboard-card p { margin: 0; font-size: 0.9rem; color: var(--text-gray); }

        /* ARREGLO DEL INTERIOR (ADENTRO) */
        .card, .form-container, .summary-box {
            background: white !important;
            border-radius: 15px !important;
            box-shadow: var(--card-shadow) !important;
            padding: 30px !important;
            margin-bottom: 30px;
            border: none !important;
        }

        /* Tablas Modernas */
        table { width: 100%; border-collapse: separate; border-spacing: 0 10px; }
        th { text-transform: uppercase; font-size: 0.7rem; letter-spacing: 1px; color: var(--text-gray); padding: 10px; text-align: left; }
        td { background: white; padding: 15px; border-top: 1px solid #f1f4f8; border-bottom: 1px solid #f1f4f8; }
        td:first-child { border-left: 1px solid #f1f4f8; border-radius: 10px 0 0 10px; }
        td:last-child { border-right: 1px solid #f1f4f8; border-radius: 0 10px 10px 0; }

        /* Botones Estilo App */
        .btn {
            border-radius: 10px;
            padding: 12px 25px;
            font-weight: 600;
            border: none;
            cursor: pointer;
            transition: 0.2s;
            display: inline-flex;
            align-items: center;
            text-decoration: none;
            justify-content: center;
        }
        .btn-primary { background: var(--primary); color: white; }
        .btn-success { background: #1cc88a; color: white; }

        /* Distribución Horizontal (Grids) */
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .full-width { grid-column: span 2; }
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
        <a href="/super-nomina" class="dashboard-card" style="border-top: 5px solid #28a745;">
            <h3>💰 Control de Nómina</h3>
            <p>Gestiona sueldos, extras y descuentos quincenales.</p>
        </a>
        <a href="/gestionar-prestamos" class="dashboard-card" style="border-top: 5px solid #dc3545;">
            <h3>🏦 Gestión de Préstamos</h3>
            <p>Registra nuevos préstamos y abonos en efectivo (Como Isolina).</p>
        </a>
        <a href="/pagar-comisiones" class="dashboard-card">
            <h3>💵 Pago de Comisiones</h3>
            <p>Revisa y paga las comisiones de tus asesores.</p>
        </a>
        <a href="/empleados" class="dashboard-card">
            <h3>👥 Gestión de Equipo</h3>
            <p>Configura datos de empleados y asesores.</p>
        </a>
        <a href="/historial-nomina" class="dashboard-card">
            <h3>📂 Historial de Pagos</h3>
            <p>Consulta registros y recibos de nóminas anteriores.</p>
        </a>
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
        // Buscamos directamente las cotizaciones que YA activaste ('activa')
        // Sin el INNER JOIN para que Tomas y Lilian aparezcan de inmediato
        const result = await client.query(`
            SELECT id, clientname, advisorname, quotenumber 
            FROM quotes 
            WHERE status = 'activa' 
            ORDER BY clientname ASC
        `);
        const projects = result.rows;
        client.release();

        let projectsHtml = projects.map(proj => `
            <tr>
                <td style="font-weight: bold; color: var(--primary);"># ${proj.quotenumber}</td>
                <td>
                    <a href="/proyecto-detalle/${proj.id}" style="text-decoration: none; font-weight: 600; color: var(--primary);">
                        ${proj.clientname}
                    </a>
                </td>
                <td><span class="advisor-badge">${proj.advisorname || 'No asignado'}</span></td>
                <td style="text-align: center;">
                    <a href="/proyecto-detalle/${proj.id}" class="btn" style="padding: 5px 12px; font-size: 13px;">
                        Ver Proyecto 📂
                    </a>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="4" style="text-align: center; padding: 40px;">No hay proyectos activos.</td></tr>';

        res.send(`<!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body><div class="container">${backToDashboardLink}<h2>Proyectos y Centros Activos</h2><table><thead><tr><th>ID Cotización</th><th>Nombre del Cliente / Proyecto</th><th>Asesor</th><th>Acciones</th></tr></thead><tbody>${projectsHtml}</tbody></table></div></body></html>`);
    } catch (error) {
        console.error("Error en /clientes:", error);
        res.status(500).send('<h1>Error al obtener la lista ❌</h1>');
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
                   <div class="header-with-button" style="display: flex; justify-content: space-between; align-items: center;">
    <h2>Proyectos Formalizados por Activar</h2>
    <a href="/proyectos-descartados" class="btn" style="background-color: var(--gray); color: white; font-size: 13px;">
        Ver Descartados 🗑️
    </a>
</div>
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
app.post('/restaurar-cotizacion/:id', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { id } = req.params;
    try {
        const client = await pool.connect();
        await client.query('UPDATE quotes SET is_discarded = FALSE WHERE id = $1', [id]);
        client.release();
        res.redirect('/proyectos-descartados');
    } catch (error) {
        console.error("Error al restaurar cotización:", error);
        res.status(500).send('Error al procesar la solicitud.');
    }
});
// =======================================================
//   NUEVAS RUTAS PARA CUENTAS POR PAGAR
// =======================================================

// --- PÁGINA PRINCIPAL DE CUENTAS POR PAGAR ---
app.get('/cuentas-por-pagar', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { supplierId } = req.query;
    let client;
    try {
        client = await pool.connect();

        // 1. Resumen de Deuda Total por Suplidor (Calculando el balance real)
        const summaryRes = await client.query(`
            SELECT s.id, s.name, SUM(e.amount - COALESCE(e.paid_amount, 0)) as total_deuda
            FROM expenses e
            JOIN suppliers s ON e.supplier_id = s.id
            WHERE e.status != 'Pagada'
            GROUP BY s.id, s.name
            ORDER BY total_deuda DESC`);

        // 2. Consulta de facturas y del HISTORIAL DE ABONOS
        let queryText = `
            SELECT e.*, s.name as supplier_name 
            FROM expenses e 
            JOIN suppliers s ON e.supplier_id = s.id 
            WHERE e.status != 'Pagada'`;
        
        const params = [];
        if (supplierId) {
            params.push(supplierId);
            queryText += ` AND e.supplier_id = $${params.length}`;
        }

        const invoicesRes = await client.query(queryText + " ORDER BY e.expense_date DESC", params);
        
        // --- ESTA ES LA CONSULTA NUEVA PARA EL HISTORIAL ---
        const historyRes = await client.query("SELECT * FROM payment_history ORDER BY payment_date DESC");
        
        const suppliersRes = await client.query("SELECT id, name FROM suppliers ORDER BY name ASC");

        const summaryCards = summaryRes.rows.map(s => `
            <div class="summary-box" style="border-top: 4px solid var(--primary); min-width: 220px; text-align:center;">
                <small style="color:gray;">${s.name}</small>
                <div style="font-weight:bold; font-size:1.2rem; margin:10px 0;">RD$ ${parseFloat(s.total_deuda).toFixed(2)}</div>
                <a href="/reporte-suplidor-pdf/${s.id}" target="_blank" class="btn" style="padding:4px 8px; font-size:10px; background:#eef2ff; color:var(--primary);">🖨️ Estado de Cuenta PDF</a>
            </div>`).join('');

        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
                <div class="container" style="max-width: 1300px;">
                    <div style="margin-bottom: 20px;">${backToDashboardLink}</div>
                    <h1>Cuentas por Pagar a Suplidores</h1>

                    <div style="display: flex; gap: 15px; overflow-x: auto; padding-bottom: 15px; margin-bottom: 30px;">
                        ${summaryCards || '<p>No hay deudas pendientes actualmente.</p>'}
                    </div>

                    <div style="display: grid; grid-template-columns: 350px 1fr; gap: 30px;">
                        <div class="form-container">
                            <h3>➕ Registrar Factura</h3>
                            <form action="/cuentas-por-pagar" method="POST">
                                <div class="form-group">
                                    <label>Suplidor:</label>
                                    <select name="supplier_id" required>
                                        <option value="">Seleccione...</option>
                                        ${suppliersRes.rows.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                                    </select>
                                </div>
                                <div class="form-group"><label>Monto Total:</label><input type="number" name="amount" step="0.01" required></div>
                                <div class="form-group"><label>Fecha Factura:</label><input type="date" name="expense_date" required></div>
                                <div class="form-group"><label>Concepto:</label><textarea name="description" rows="2"></textarea></div>
                                <button type="submit" class="btn btn-activar" style="width:100%;">💾 Guardar Factura</button>
                            </form>
                        </div>

                        <div class="card">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                                <h3 style="margin:0;">Detalle de Facturas Pendientes</h3>
                                <select id="filter-supplier" onchange="window.location.href='/cuentas-por-pagar?supplierId='+this.value">
                                    <option value="">-- Filtrar por Suplidor --</option>
                                    ${suppliersRes.rows.map(s => `<option value="${s.id}" ${supplierId == s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
                                </select>
                            </div>
                            <table class="modern-table">
                                <thead>
                                    <tr>
                                        <th>Fecha</th>
                                        <th>Suplidor / Concepto</th>
                                        <th style="text-align:right;">Balance e Historial</th>
                                        <th>Acción de Pago</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${invoicesRes.rows.map(i => {
                                        const montoOriginal = parseFloat(i.amount);
                                        const yaPagado = parseFloat(i.paid_amount || 0);
                                        const pendiente = montoOriginal - yaPagado;

                                        // Filtramos los abonos que pertenecen a esta factura específica
                                        const misAbonos = historyRes.rows.filter(h => h.expense_id === i.id);
                                        const abonosHtml = misAbonos.map(a => `
                                            <div style="font-size:10px; color:#2c7a7b; background:#f0fff4; padding:2px 5px; margin-top:2px; border-radius:3px;">
                                                ✅ ${new Date(a.payment_date).toLocaleDateString()}: <b>$${parseFloat(a.amount_paid).toFixed(2)}</b> (${a.payment_method})
                                            </div>
                                        `).join('');
                                        
                                        return `
                                        <tr>
                                            <td>${new Date(i.expense_date).toLocaleDateString()}</td>
                                            <td><b>${i.supplier_name}</b><br><small>${i.description || 'Sin concepto'}</small></td>
                                            <td style="text-align:right;">
                                                <div style="font-size:11px; color:gray;">Total: $${montoOriginal.toFixed(2)}</div>
                                                <div style="font-weight:bold; color:var(--danger); border-bottom:1px solid #eee; padding-bottom:3px;">Pendiente: RD$ ${pendiente.toFixed(2)}</div>
                                                <div style="margin-top:5px; text-align:left;">
                                                    ${abonosHtml || '<span style="font-size:10px; color:gray;">Sin abonos registrados</span>'}
                                                </div>
                                            </td>
                                            <td>
                                                <form action="/cuentas-por-pagar/abonar" method="POST" style="display:flex; flex-direction:column; gap:5px;">
                                                    <input type="hidden" name="expenseId" value="${i.id}">
                                                    <input type="number" name="paymentAmount" step="0.01" max="${pendiente.toFixed(2)}" placeholder="Monto RD$" style="padding:5px; border-radius:5px; border:1px solid #ddd;" required>
                                                    <select name="paymentMethod" style="padding:5px; border-radius:5px; border:1px solid #ddd; font-size:11px;">
                                                        <option value="Transferencia">Transferencia</option>
                                                        <option value="Efectivo">Efectivo</option>
                                                        <option value="Cheque">Cheque</option>
                                                    </select>
                                                    <button type="submit" class="btn btn-activar" style="padding:6px; font-size:11px;">Registrar Abono</button>
                                                </form>
                                            </td>
                                        </tr>`;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </body></html>`);
    } catch (e) { res.status(500).send(e.message); } finally { if (client) client.release(); }
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


app.get('/caja-chica', requireLogin, requireAdminOrCoord, async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const activeCycleResult = await client.query("SELECT * FROM caja_chica_ciclos WHERE estado = 'abierto' LIMIT 1");
        const cycle = activeCycleResult.rows[0];

        const historyRes = await client.query("SELECT * FROM caja_chica_ciclos WHERE estado = 'cerrado' ORDER BY fecha_cierre DESC LIMIT 5");
        const historyHtml = historyRes.rows.map(c => `
            <tr>
                <td>${new Date(c.fecha_cierre).toLocaleDateString()}</td>
                <td style="font-weight:bold;">RD$ ${parseFloat(c.total_gastado).toFixed(2)}</td>
                <td><a href="/caja-chica/reporte/${c.id}/pdf" target="_blank" class="btn btn-info" style="padding:4px 10px; font-size:12px;">🖨️ Ver Reporte PDF</a></td>
            </tr>`).join('') || '<tr><td colspan="3">No hay cierres recientes.</td></tr>';

        let content = "";

        if (!cycle) {
            content = `
                <div class="card" style="max-width: 500px; margin: 0 auto; text-align: center; padding: 40px;">
                    <h2 style="color: var(--primary);">Caja Chica Cerrada</h2>
                    <p style="margin-bottom: 25px;">Ingresa el fondo inicial para abrir un nuevo ciclo.</p>
                    <form action="/caja-chica/abrir-ciclo" method="POST">
                        <div class="form-group">
                            <label>Monto del Fondo Inicial (RD$):</label>
                            <input type="number" name="fondo_inicial" step="0.01" style="font-size: 1.5rem; text-align: center; width: 80%;" required placeholder="0.00">
                        </div>
                        <button type="submit" class="btn btn-activar" style="width: 80%; margin-top: 20px;">🚀 Abrir Nuevo Ciclo</button>
                    </form>
                </div>`;
        } else {
            const [supps, expsData] = await Promise.all([
                client.query("SELECT id, name FROM suppliers ORDER BY name ASC"),
                client.query("SELECT e.*, s.name as supplier_name FROM expenses e JOIN suppliers s ON e.supplier_id = s.id WHERE e.caja_chica_ciclo_id = $1 ORDER BY e.id DESC", [cycle.id])
            ]);
            
            const currentExpenses = expsData.rows;
            const totalGasto = currentExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
            const balanceActual = parseFloat(cycle.fondo_inicial) - totalGasto;

            content = `
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px;">
                    <div class="summary-box" style="border-top: 5px solid var(--primary);"><small>FONDO INICIAL</small><div class="amount">RD$ ${parseFloat(cycle.fondo_inicial).toFixed(2)}</div></div>
                    <div class="summary-box" style="border-top: 5px solid var(--danger);"><small>TOTAL GASTADO</small><div class="amount red">RD$ ${totalGasto.toFixed(2)}</div></div>
                    <div class="summary-box" style="border-top: 5px solid var(--success);"><small>BALANCE DISPONIBLE</small><div class="amount green">RD$ ${balanceActual.toFixed(2)}</div></div>
                </div>

                <div style="text-align: center; margin-bottom: 30px; background: #fff; padding: 25px; border-radius: 15px; border: 1px dashed var(--danger);">
                    <form action="/caja-chica/cerrar-ciclo" method="POST" onsubmit="return confirm('¿Cerrar ciclo ahora?')">
                        <input type="hidden" name="cycleId" value="${cycle.id}">
                        <button type="submit" class="btn" style="background: var(--danger); color: white; padding: 15px 50px; border-radius: 50px; font-weight: bold;">🔒 Cerrar Ciclo y Reponer</button>
                    </form>
                </div>

                <div style="display: grid; grid-template-columns: 350px 1fr; gap: 30px;">
                    <div class="form-container">
                        <h3 style="margin-top:0;">➕ Registrar Gasto</h3>
                        <form action="/caja-chica/nuevo-gasto" method="POST" id="form-gasto">
                            <input type="hidden" name="cycleId" value="${cycle.id}">
                            <div class="form-group"><label>Fecha:</label><input type="date" name="expense_date" value="${new Date().toISOString().split('T')[0]}" required></div>
                            <div class="form-group"><label>Suplidor:</label><select name="supplier_id" required><option value="">Seleccione...</option>${supps.rows.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}</select></div>
                            <div class="form-group"><label>Monto (RD$):</label><input type="number" id="monto-gasto" name="amount" step="0.01" required></div>
                            <div class="form-group"><label>Concepto:</label><textarea name="description" rows="2" required></textarea></div>
                            <button type="submit" class="btn btn-activar" style="width: 100%;">💾 Guardar Gasto</button>
                        </form>
                    </div>

                    <div class="card">
                        <table class="modern-table">
                            <thead><tr><th>Detalle</th><th style="text-align:right;">Monto</th><th>Vale</th></tr></thead>
                            <tbody>
                                ${currentExpenses.map(e => `
                                    <tr>
                                        <td><b>${e.supplier_name}</b><br><small style="color:gray;">${e.description}</small></td>
                                        <td style="text-align:right; font-weight:bold;">RD$ ${parseFloat(e.amount).toFixed(2)}</td>
                                        <td><button onclick="printTicket('${e.supplier_name}', '${e.description}', '${parseFloat(e.amount).toFixed(2)}')" class="btn btn-info" style="padding:4px 10px; font-size:11px;">📄 Vale</button></td>
                                    </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <script>
                    const saldoDisp = ${balanceActual};
                    const inputM = document.getElementById('monto-gasto');
                    
                    // MEJORA: Cambio de color en tiempo real
                    inputM.addEventListener('input', function() {
                        if (parseFloat(this.value) > saldoDisp) {
                            this.style.border = '2px solid red';
                            this.style.backgroundColor = '#fff0f0';
                        } else {
                            this.style.border = '1px solid #ddd';
                            this.style.backgroundColor = '#fff';
                        }
                    });

                    document.getElementById('form-gasto').onsubmit = function(e) {
                        if(parseFloat(inputM.value) > saldoDisp) {
                            alert('🛑 Error: Saldo insuficiente (RD$ ' + saldoDisp.toFixed(2) + ')');
                            e.preventDefault();
                        }
                    };

                    function printTicket(sup, des, amt) {
                        const w = window.open('', '', 'width=600,height=450');
                        w.document.write('<html><body style="font-family:sans-serif; padding:30px; border: 2px solid #000;">');
                        w.document.write('<div style="text-align:center;"><h2>PCOE - VALE DE CAJA CHICA</h2><p>Comprobante de Egreso</p></div><hr>');
                        w.document.write('<p><b>Fecha:</b> ' + new Date().toLocaleDateString() + '</p>');
                        w.document.write('<p><b>Pagado a:</b> ' + sup + '</p>');
                        w.document.write('<p><b>Monto:</b> <span style="font-size:24px;">RD$ ' + amt + '</span></p>');
                        w.document.write('<p><b>Concepto:</b> ' + des + '</p>');
                        w.document.write('<div style="margin-top:80px; display:flex; justify-content:space-between;">');
                        w.document.write('<div style="border-top:1px solid #000; width:180px; text-align:center; padding-top:10px;">Entregado por</div>');
                        w.document.write('<div style="border-top:1px solid #000; width:180px; text-align:center; padding-top:10px;">Recibido por</div>');
                        w.document.write('</div></body></html>');
                        w.document.close();
                        w.print();
                        w.close();
                    }
                </script>`;
        }

        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
                <div class="container" style="max-width: 1200px;">
                    <div style="margin-bottom: 20px;">${backToDashboardLink}</div>
                    <h1>Gestión de Caja Chica</h1>
                    ${content}
                    <div class="card" style="margin-top:40px; opacity: 0.9;">
                        <h4>📜 Historial de Cierres Anteriores</h4>
                        <table class="modern-table"><tbody>${historyHtml}</tbody></table>
                    </div>
                </div>
            </body></html>`);
    } catch (e) { res.status(500).send(e.message); } finally { if (client) client.release(); }
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
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // 1. Obtener el fondo inicial y los gastos actuales de este ciclo
        const cycleRes = await client.query("SELECT fondo_inicial FROM caja_chica_ciclos WHERE id = $1", [cycleId]);
        const expensesRes = await client.query("SELECT SUM(amount) as total FROM expenses WHERE caja_chica_ciclo_id = $1", [cycleId]);
        
        const fondoInicial = parseFloat(cycleRes.rows[0].fondo_inicial);
        const totalGastado = parseFloat(expensesRes.rows[0].total || 0);
        const montoNuevoGasto = parseFloat(amount);
        
        const balanceDisponible = fondoInicial - totalGastado;

        // 2. VALIDACIÓN CRÍTICA: ¿Hay dinero suficiente?
        if (montoNuevoGasto > balanceDisponible) {
            await client.query('ROLLBACK');
            return res.send(`
                <script>
                    alert('⚠️ OPERACIÓN RECHAZADA: El monto (RD$ ${montoNuevoGasto.toFixed(2)}) excede el saldo disponible en caja (RD$ ${balanceDisponible.toFixed(2)}).');
                    window.history.back();
                </script>
            `);
        }

        // 3. Si hay dinero, procedemos a guardar
        await client.query(
            `INSERT INTO expenses (caja_chica_ciclo_id, expense_date, supplier_id, amount, description, type) 
             VALUES ($1, $2, $3, $4, $5, 'Caja Chica')`,
            [cycleId, expense_date, supplier_id, montoNuevoGasto, description]
        );

        await client.query('COMMIT');
        res.redirect('/caja-chica');
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error(error);
        res.status(500).send("Error al registrar el gasto.");
    } finally {
        if (client) client.release();
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
    const { startDate, endDate, cycleId } = req.query;
    let client;
    try {
        client = await pool.connect();
        
        // 1. Consulta para la TABLA (Detalle)
        let queryText = `SELECT e.*, s.name as supplier_name FROM expenses e LEFT JOIN suppliers s ON e.supplier_id = s.id WHERE 1=1`;
        const params = [];
        if (startDate) { params.push(startDate); queryText += ` AND e.expense_date >= $${params.length}`; }
        if (endDate) { params.push(endDate); queryText += ` AND e.expense_date <= $${params.length}`; }
        if (cycleId) { params.push(cycleId); queryText += ` AND e.caja_chica_ciclo_id = $${params.length}`; }
        
        const expensesRes = await client.query(queryText + " ORDER BY e.expense_date DESC", params);
        
        // 2. CONSULTA PARA EL GRÁFICO (Agrupado por Tipo)
        // Aquí sumamos los montos según el 'type' (Caja Chica, Administrativo, Suplidor, etc.)
        let chartQuery = `SELECT type, SUM(amount) as total FROM expenses WHERE 1=1`;
        if (startDate) chartQuery += ` AND expense_date >= '${startDate}'`;
        if (endDate) chartQuery += ` AND expense_date <= '${endDate}'`;
        chartQuery += ` GROUP BY type`;
        
        const chartDataRes = await client.query(chartQuery);
        
        // Preparamos los datos para enviarlos al navegador
        const labels = chartDataRes.rows.map(r => r.type || 'Otros');
        const totals = chartDataRes.rows.map(r => parseFloat(r.total));

        res.send(`
            <!DOCTYPE html><html lang="es"><head>
                ${commonHtmlHead}
                <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
            </head><body>
                <div class="container" style="max-width: 1200px;">
                    <div style="margin-bottom: 20px;">${backToDashboardLink}</div>
                    <h1>Auditoría y Análisis de Gastos</h1>

                    <div style="display: grid; grid-template-columns: 1fr 400px; gap: 30px; margin-top: 20px;">
                        
                        <div>
                            <div class="summary-box" style="margin-bottom: 20px; border-left: 8px solid var(--primary);">
                                <small>TOTAL GASTADO EN EL PERIODO</small>
                                <div class="amount" style="font-size: 2.5rem;">RD$ ${totals.reduce((a, b) => a + b, 0).toLocaleString()}</div>
                            </div>
                            
                            <div class="card">
                                <h3>Detalle de Movimientos</h3>
                                <table class="modern-table">
                                    <thead><tr><th>Fecha</th><th>Detalle</th><th style="text-align:right;">Monto</th></tr></thead>
                                    <tbody>
                                        ${expensesRes.rows.map(e => `<tr><td>${new Date(e.expense_date).toLocaleDateString()}</td><td>${e.supplier_name || 'Gasto'}<br><small>${e.description || ''}</small></td><td style="text-align:right;">$${parseFloat(e.amount).toFixed(2)}</td></tr>`).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div class="card" style="text-align: center;">
                            <h3>Distribución de Gastos</h3>
                            <canvas id="myChart" width="400" height="400"></canvas>
                            <div id="chart-legend" style="margin-top:20px; text-align:left; font-size:12px;"></div>
                        </div>
                    </div>
                </div>

                <script>
                    const ctx = document.getElementById('myChart').getContext('2d');
                    new Chart(ctx, {
                        type: 'doughnut',
                        data: {
                            labels: ${JSON.stringify(labels)},
                            datasets: [{
                                data: ${JSON.stringify(totals)},
                                backgroundColor: ['#4e73df', '#1cc88a', '#36b9cc', '#f6c23e', '#e74a3b'],
                                hoverOffset: 4
                            }]
                        },
                        options: {
                            responsive: true,
                            plugins: {
                                legend: { position: 'bottom' }
                            }
                        }
                    });
                </script>
            </body></html>
        `);
    } catch (e) { res.status(500).send(e.message); } finally { if (client) client.release(); }
});
app.get('/reporte-gastos-pdf', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { startDate, endDate, missingDesc, cycleId } = req.query;
    let client;
    try {
        client = await pool.connect();
        // (La misma lógica SQL de arriba para obtener los datos filtrados)
        let queryText = `SELECT e.*, s.name as supplier_name, q.clientname as project_name FROM expenses e LEFT JOIN suppliers s ON e.supplier_id = s.id LEFT JOIN quotes q ON e.quote_id = q.id WHERE 1=1`;
        const params = [];
        if (startDate) { params.push(startDate); queryText += ` AND e.expense_date >= $${params.length}`; }
        if (endDate) { params.push(endDate); queryText += ` AND e.expense_date <= $${params.length}`; }
        if (cycleId) { params.push(cycleId); queryText += ` AND e.caja_chica_ciclo_id = $${params.length}`; }
        if (missingDesc === 'true') { queryText += ` AND (e.description IS NULL OR e.description = '')`; }
        queryText += ` ORDER BY e.expense_date ASC`;

        const expensesRes = await client.query(queryText, params);
        const expenses = expensesRes.rows;
        const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
        client.release();

        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        doc.pipe(res);

        // Membrete y Título
        doc.font('Helvetica-Bold').fontSize(18).text('REPORTE DETALLADO DE GASTOS', { align: 'center' });
        doc.fontSize(10).text(`Generado el: ${new Date().toLocaleString()}`, { align: 'center' });
        doc.moveDown();

        // Tabla de datos
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('FECHA', 50, doc.y, { width: 70 });
        doc.text('PROYECTO / ORIGEN', 120, doc.y, { width: 150 });
        doc.text('DESCRIPCIÓN', 270, doc.y, { width: 180 });
        doc.text('MONTO', 450, doc.y, { align: 'right' });
        doc.moveDown(0.5);
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(0.5);

        doc.font('Helvetica').fontSize(9);
        expenses.forEach(e => {
            const currentY = doc.y;
            doc.text(new Date(e.expense_date).toLocaleDateString(), 50, currentY);
            doc.text(e.project_name || 'ADMINISTRATIVO', 120, currentY, { width: 140 });
            doc.text(e.description || 'SIN DESCRIPCIÓN', 270, currentY, { width: 170 });
            doc.text(`$${parseFloat(e.amount).toFixed(2)}`, 450, currentY, { align: 'right' });
            doc.moveDown(1.5);
            if (doc.y > 700) doc.addPage();
        });

        doc.moveDown();
        doc.font('Helvetica-Bold').fontSize(12).text(`TOTAL GENERAL: RD$ ${total.toLocaleString('en-US', {minimumFractionDigits: 2})}`, { align: 'right' });

        doc.end();
    } catch (e) { res.status(500).send(e.message); }
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
    let client;
    try {
        client = await pool.connect();
        // Guardamos y pedimos que nos devuelva el ID del nuevo préstamo
        const result = await client.query(
            `INSERT INTO loans (employee_id, loan_date, loan_amount, reason, status) 
             VALUES ($1, $2, $3, $4, 'activo') RETURNING id`,
            [employee_id, loan_date, loan_amount, reason || null]
        );
        const newLoanId = result.rows[0].id;
        client.release();
        
        // Redirigimos al detalle del préstamo recién creado para imprimir el comprobante
        res.redirect(`/prestamo/${newLoanId}?nuevo=true`);
    } catch (error) {
        res.status(500).send('Error al guardar el préstamo');
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
    let client;
    try {
        client = await pool.connect();
        
        // Agrupamos los extras por payroll_id para identificar las quincenas
        const resNomina = await client.query(`
            SELECT payroll_id, 
                   MIN(payment_date) as fecha_lote, 
                   SUM(amount) as total_pagado_extras,
                   COUNT(DISTINCT employee_id) as total_empleados
            FROM payroll_extras 
            GROUP BY payroll_id 
            ORDER BY payroll_id DESC
        `);

        let lotesHtml = resNomina.rows.map(lote => {
            const fecha = new Date(lote.fecha_lote);
            const quincena = fecha.getDate() <= 15 ? "1ra Quincena" : "2da Quincena";
            const mes = fecha.toLocaleString('es-ES', { month: 'long' });
            const año = fecha.getFullYear();

            return `
            <div class="card-nomina" style="display: flex; justify-content: space-between; align-items: center; padding: 20px; border: 1px solid #ddd; border-radius: 10px; margin-bottom: 15px; background: white;">
                <div>
                    <h3 style="margin:0; color:#0056b3;">${quincena} de ${mes} ${año}</h3>
                    <p style="margin:5px 0 0; color:#666;">Fecha de proceso: ${fecha.toLocaleDateString()}</p>
                </div>
                <div style="text-align: center;">
                    <span style="display:block; font-weight:bold;">${lote.total_empleados}</span>
                    <small>Colaboradores</small>
                </div>
                <div>
                    <a href="/ver-detalle-nomina/${lote.payroll_id}" class="btn" style="background:#28a745; color:white; text-decoration:none; padding:10px 20px; border-radius:5px;">Ver Detalle y Recibos</a>
                </div>
            </div>`;
        }).join('');

        res.send(`
            <!DOCTYPE html><html lang="es">
            <head>${commonHtmlHead.replace('<title>Panel de Administración</title>', '<title>Historial de Quincenas</title>')}</head>
            <body>
                <div class="container" style="max-width: 900px;">
                    ${backToDashboardLink}
                    <h1>Archivo Histórico de Nóminas</h1>
                    <p>Selecciona una quincena para ver los pagos detallados e imprimir recibos.</p>
                    <div style="margin-top: 30px;">
                        ${lotesHtml.length > 0 ? lotesHtml : '<p style="text-align:center; padding:50px;">Aún no has procesado ninguna nómina con el nuevo sistema.</p>'}
                    </div>
                </div>
            </body></html>`);
    } catch (e) { res.status(500).send(e.message); } finally { if (client) client.release(); }
});
app.get('/ver-detalle-nomina/:payroll_id', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { payroll_id } = req.params;
    let client;
    try {
        client = await pool.connect();
        
        // Buscamos a todos los empleados que recibieron pago en este lote
        const resDetalle = await client.query(`
            SELECT DISTINCT e.id, e.nombre, e.name, e.salary, e.sueldo
            FROM employees e
            JOIN payroll_extras pe ON e.id = pe.employee_id
            WHERE pe.payroll_id = $1
        `, [payroll_id]);

        let filas = resDetalle.rows.map(emp => {
            const nombre = emp.nombre || emp.name;
            return `
            <tr>
                <td style="font-weight:bold; padding:15px;">${nombre}</td>
                <td style="text-align:center;">
                    <a href="/ver-recibo/${payroll_id}/${emp.id}" target="_blank" class="btn" style="background:#007bff; color:white; text-decoration:none; padding:5px 15px; font-size:12px;">🖨️ Imprimir Recibo Detallado</a>
                </td>
            </tr>`;
        }).join('');

        res.send(`
            <!DOCTYPE html><html lang="es">
            <head>${commonHtmlHead}</head>
            <body>
                <div class="container">
                    <a href="/historial-nomina" style="text-decoration:none; color:#007bff;">← Volver al Archivo</a>
                    <h1 style="margin-top:20px;">Detalle de Pagos: Lote #${payroll_id}</h1>
                    
                    <table style="background:white; margin-top:30px;">
                        <thead>
                            <tr><th>Colaborador</th><th style="text-align:center;">Acciones</th></tr>
                        </thead>
                        <tbody>${filas}</tbody>
                    </table>

                    <div style="margin-top: 80px; border-top: 2px solid #ff4d4d; padding-top: 20px; background: #fff5f5; padding: 25px; border-radius: 12px; border: 1px dashed #ff4d4d;">
                        <h4 style="color: #ff4d4d; margin-top: 0;">⚠️ Zona de Peligro</h4>
                        <p style="font-size: 14px; color: #666; margin-bottom: 20px;">
                            Si detectas un error masivo en este lote, puedes anularlo. 
                            <b>Esta acción eliminará:</b> los recibos de esta quincena, los gastos generados en los proyectos y los abonos a préstamos realizados en esta sesión.
                        </p>
                        <button class="btn" style="background: #ff4d4d; color: white; padding: 12px 25px; font-weight: bold; border-radius: 6px; cursor: pointer; border: none;" onclick="anularLote(${payroll_id})">
                            Anular Nómina Completa
                        </button>
                    </div>
                </div>

                <script>
                    async function anularLote(id) {
                        if(!confirm("¿ESTÁS TOTALMENTE SEGURO? Esta acción es irreversible y borrará todos los registros de esta quincena en la contabilidad y proyectos.")) return;
                        
                        try {
                            const res = await fetch('/anular-nomina/' + id, { method: 'POST' });
                            const result = await res.json();
                            if(result.success) {
                                alert(result.message);
                                window.location.href = "/historial-nomina";
                            } else {
                                alert("Error: " + result.message);
                            }
                        } catch(e) {
                            alert("Error de conexión al intentar anular el lote.");
                        }
                    }
                </script>
            </body></html>`);
    } catch (e) { res.status(500).send(e.message); } finally { if (client) client.release(); }
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

app.get('/proyecto-detalle/:id', requireLogin, requireAdminOrCoord, async (req, res) => {
    const quoteId = req.params.id;
    let client;
    try {
        client = await pool.connect();
        
        const quoteResult = await client.query(
            `SELECT * FROM quotes WHERE id = $1 AND status = 'activa'`,
            [quoteId]
        );
        
        if (quoteResult.rows.length === 0) {
            return res.status(404).send('<h1>Proyecto no encontrado</h1><a href="/clientes">Volver</a>');
        }
        
        const quote = quoteResult.rows[0];

        const [paymentsResult, expensesResult, suppliersResult, adjustmentsResult] = await Promise.all([
            client.query(`SELECT * FROM payments WHERE quote_id = $1 ORDER BY payment_date DESC`, [quote.id]),
            client.query(`SELECT e.*, s.name as supplier_name FROM expenses e JOIN suppliers s ON e.supplier_id = s.id WHERE e.quote_id = $1 ORDER BY e.expense_date DESC`, [quote.id]),
            client.query('SELECT * FROM suppliers ORDER BY name ASC'),
            client.query(`SELECT * FROM ajustes_cotizacion WHERE quote_id = $1 ORDER BY fecha_ajuste ASC`, [quote.id])
        ]);

        const payments = paymentsResult.rows;
        const expenses = expensesResult.rows;
        const suppliers = suppliersResult.rows;
        
        const montoOriginal = parseFloat(quote.preciofinalporestudiante || 0) * parseFloat(quote.estudiantesparafacturar || 0);
        const totalAjustes = adjustmentsResult.rows.reduce((sum, adj) => sum + parseFloat(adj.monto_ajuste), 0);
        const totalVenta = montoOriginal + totalAjustes;
        const totalAbonado = payments.reduce((sum, payment) => sum + parseFloat(payment.amount), 0);
        const totalGastado = expenses.reduce((sum, expense) => sum + parseFloat(expense.amount), 0);
        const rentabilidad = totalAbonado - totalGastado;

        let adjustmentsHtml = adjustmentsResult.rows.map(adj => `
            <tr>
                <td>${new Date(adj.fecha_ajuste).toLocaleString('es-DO')}</td>
                <td style="color: ${adj.monto_ajuste >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight: 700;">
                    ${adj.monto_ajuste >= 0 ? '+' : ''}$${parseFloat(adj.monto_ajuste).toFixed(2)}
                </td>
                <td>${adj.motivo}</td>
                <td>${adj.ajustado_por}</td>
            </tr>
        `).join('') || '<tr><td colspan="4">No hay ajustes registrados.</td></tr>';

        let paymentsHtml = payments.map(p => `
            <tr>
                <td>${new Date(p.payment_date).toLocaleDateString()}</td>
                <td style="font-weight:600; color:var(--success);">$${parseFloat(p.amount).toFixed(2)}</td>
                <td>${p.students_covered || 'N/A'}</td>
                <td>${p.comment || ''}</td>
                <td style="text-align: center;">
                    <a href="/recibo-pago/${p.id}/pdf" target="_blank" class="btn" style="background-color: var(--info); color:white; padding: 6px 12px; font-size: 12px;">Recibo</a>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="5">No hay pagos registrados.</td></tr>';

        let expensesHtml = expenses.map(e => `
            <tr>
                <td>${new Date(e.expense_date).toLocaleDateString()}</td>
                <td>${e.supplier_name}</td>
                <td>${e.description}</td>
                <td style="font-weight: 700; color: var(--danger);">$${parseFloat(e.amount).toFixed(2)}</td>
                <td>${e.type || ''}</td>
                <td style="text-align: center;">
                    <a href="/desembolso/${e.id}/pdf" target="_blank" class="btn" style="background-color: var(--gray); color:white; padding: 6px 12px; font-size: 12px;">Imprimir</a>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="6">No hay gastos registrados.</td></tr>';

        let suppliersOptionsHtml = suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

        res.send(`
            <!DOCTYPE html><html lang="es">
            <head>
                ${commonHtmlHead.replace('<title>Panel de Administración</title>', `<title>Proyecto ${quote.clientname}</title>`)}
                <style>
                    .summary-box { position: relative; padding-top: 35px; }
                    .btn-ajustar-top { position: absolute; top: 15px; right: 15px; font-size: 12px; padding: 5px 12px; background-color: var(--primary); color: white; border-radius: 6px; }
                    .section-header { display: flex; justify-content: space-between; align-items: center; margin: 40px 0 20px 0; border-bottom: 2px solid #eee; padding-bottom: 10px; }
                    .btn-main-action { padding: 12px 25px; font-size: 15px; margin-top: 15px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
                </style>
            </head>
            <body>
                <div class="container">
                    ${backToDashboardLink}
                    <div style="margin-bottom: 30px;">
                        <h1 style="margin:0;">${quote.clientname}</h1>
                        <p style="color: var(--gray);">Cotización #${quote.quotenumber} &bull; Asesor: ${quote.advisorname}</p>
                    </div>

                    <div class="summary">
                        <div class="summary-box">
                            <button onclick="abrirModalAjuste()" class="btn btn-ajustar-top">⚙️ Ajustar Venta</button>
                            <h3>Monto Total Venta</h3>
                            <p class="amount">$${totalVenta.toFixed(2)}</p>
                        </div>
                        <div class="summary-box"><h3>Total Abonado</h3><p class="amount green">$${totalAbonado.toFixed(2)}</p></div>
                        <div class="summary-box"><h3>Total Gastado</h3><p class="amount orange">$${totalGastado.toFixed(2)}</p></div>
                        <div class="summary-box"><h3>Rentabilidad Actual</h3><p class="amount blue">$${rentabilidad.toFixed(2)}</p></div>
                    </div>

                    <div class="section-header"><h2>Ingresos (Abonos Realizados)</h2></div>
                    <table><thead><tr><th>Fecha</th><th>Monto</th><th>Estudiantes</th><th>Comentario</th><th>Acciones</th></tr></thead><tbody>${paymentsHtml}</tbody></table>
                    <button class="btn btn-activar btn-main-action" onclick="toggleForm('payment-form-container')">+ Registrar Nuevo Abono</button>
                    
                    <div id="payment-form-container" class="form-container" style="display: none; margin-top:20px;">
                        <h3>Registrar Nuevo Pago Recibido</h3>
                        <form action="/proyecto/${quote.id}/nuevo-pago" method="POST">
                            <div class="form-group"><label>Fecha de Pago:</label><input type="date" name="payment_date" required></div>
                            <div class="form-group"><label>Monto Recibido ($):</label><input type="number" name="amount" step="0.01" required></div>
                            <div class="form-group"><label>Estudiantes Cubiertos:</label><input type="number" name="students_covered"></div>
                            <div class="form-group"><label>Comentario / Referencia:</label><textarea name="comment" rows="2"></textarea></div>
                            <button type="submit" class="btn btn-activar">Confirmar y Guardar Abono</button>
                        </form>
                    </div>

                    <div class="section-header"><h2>Egresos (Gastos del Proyecto)</h2></div>
                    <table><thead><tr><th>Fecha</th><th>Suplidor</th><th>Descripción</th><th>Monto</th><th>Tipo</th><th>Acciones</th></tr></thead><tbody>${expensesHtml}</tbody></table>
                    <button class="btn btn-main-action" style="background-color: #fd7e14; color: white;" onclick="toggleForm('expense-form-container')">+ Registrar Nuevo Gasto</button>
                    
                    <div id="expense-form-container" class="form-container" style="display: none; margin-top:20px;">
                        <h3>Registrar Nuevo Egreso / Gasto</h3>
                        <form action="/proyecto/${quote.id}/nuevo-gasto" method="POST">
                            <div class="form-group"><label>Fecha del Gasto:</label><input type="date" name="expense_date" required></div>
                            <div class="form-group"><label>Suplidor:</label><select name="supplier_id" required><option value="">Seleccione un suplidor...</option>${suppliersOptionsHtml}</select></div>
                            <div class="form-group"><label>Monto del Gasto ($):</label><input type="number" name="amount" step="0.01" required></div>
                            <div class="form-group"><label>Descripción / Detalle:</label><textarea name="description" rows="2" required></textarea></div>
                            <div class="form-group"><label>Tipo de Comprobante:</label><select name="type"><option value="Sin Valor Fiscal">Sin Valor Fiscal</option><option value="Con Valor Fiscal">Con Valor Fiscal</option></select></div>
                            <button type="submit" class="btn" style="background-color: #fd7e14; color: white;">Confirmar y Guardar Gasto</button>
                        </form>
                    </div>

                    <div class="section-header"><h2>Historial de Ajustes al Precio</h2></div>
                    <table><thead><tr><th>Fecha y Hora</th><th>Monto del Ajuste</th><th>Motivo</th><th>Usuario</th></tr></thead><tbody>${adjustmentsHtml}</tbody></table>
                </div>

                <script>
                    function toggleForm(id) { 
                        const el = document.getElementById(id); 
                        el.style.display = (el.style.display === 'none' || el.style.display === '') ? 'block' : 'none'; 
                        if(el.style.display === 'block') el.scrollIntoView({ behavior: 'smooth' });
                    }
                    
                    async function abrirModalAjuste() {
                        const monto = prompt("Monto a ajustar (ej: 1000 para sumar, -500 para restar):");
                        if (monto === null) return;
                        const motivo = prompt("Motivo del ajuste:");
                        if (!motivo) return alert("El motivo es obligatorio para la auditoría.");
                        const codigo = prompt("Código de seguridad de administrador:");
                        if (!codigo) return;

                        try {
                            const res = await fetch('/proyecto/${quote.id}/ajustar-monto', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ monto_ajuste: parseFloat(monto), motivo, codigo_secreto: codigo })
                            });
                            const data = await res.json();
                            if (data.success) { alert("¡Ajuste aplicado correctamente!"); window.location.reload(); }
                            else { alert("Error: " + data.message); }
                        } catch(e) { alert("Error de conexión al servidor."); }
                    }
                </script>
            </body></html>`);
    } catch (error) {
        console.error("Error crítico:", error);
        if (!res.headersSent) res.status(500).send('Error al cargar el proyecto ❌');
    } finally {
        if (client) client.release();
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
app.get('/super-nomina', requireLogin, requireAdminOrCoord, async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        
        // 1. Buscamos TODOS los empleados que participan en nómina, sin importar su sueldo
        const employeesRes = await client.query(`
            SELECT e.*, 
                   COALESCE(l.balance, 0) as balance_prestamo,
                   l.loan_id
            FROM employees e
            LEFT JOIN (
                SELECT employee_id, id as loan_id,
                       (loan_amount - (SELECT COALESCE(SUM(amount_paid), 0) FROM loan_payments WHERE loan_id = loans.id)) as balance
                FROM loans
                WHERE status = 'activo'
            ) l ON e.id = l.employee_id
            WHERE e.participa_en_nomina = true OR e.participa_nomina = true
            ORDER BY e.id ASC
        `);

        const employees = employeesRes.rows;
        const quotesRes = await client.query("SELECT id, clientname FROM quotes WHERE status = 'activa' ORDER BY clientname ASC");
        const activeProjects = quotesRes.rows;
        const projectOptions = activeProjects.map(p => `<option value="${p.id}">${p.clientname}</option>`).join('');

        let employeesRows = employees.map(emp => {
            const nameKey = Object.keys(emp).find(k => k.toLowerCase().includes('nom') || k.toLowerCase().includes('name'));
            const salaryKey = Object.keys(emp).find(k => k.toLowerCase().includes('sal') || k.toLowerCase().includes('suel'));
            const nombreEmpleado = emp[nameKey] || "No identificado";
            
            // Si el sueldo es 0 o nulo, mostramos 0.00 de forma amigable
            const sueldoOriginal = parseFloat(emp[salaryKey] || 0);
            const sueldoQuincenal = (sueldoOriginal / 2).toFixed(2);
            const balancePrestamo = parseFloat(emp.balance_prestamo || 0);

            return `
            <tr class="employee-row" data-employee-id="${emp.id}" data-salary="${sueldoQuincenal}" data-loan-id="${emp.loan_id || ''}">
                <td style="font-weight:bold; padding: 15px;">${nombreEmpleado}</td>
                <td style="padding: 15px;">
                    ${sueldoOriginal > 0 ? 
                        `<span style="color: #28a745; font-weight: bold;">RD$ ${sueldoQuincenal}</span>` : 
                        `<span style="color: #6c757d; font-style: italic;">Sin sueldo fijo (RD$ 0.00)</span>`}
                </td>
                <td style="background: #fff5f5; border-radius: 8px; padding: 10px;">
                    ${balancePrestamo > 0 ? `
                        <div style="color: #dc3545; font-size: 11px; font-weight: bold;">Balance: RD$ ${balancePrestamo.toFixed(2)}</div>
                        <input type="number" class="loan-deduction" placeholder="Descuento" step="0.01" style="width: 100px; margin-top: 5px; padding: 5px; border: 1px solid #dc3545; border-radius: 4px;">
                    ` : '<span style="color:gray; font-size: 11px;">Sin deuda</span>'}
                </td>
                <td class="extras-container" id="extras-container-${emp.id}" style="padding: 10px;">
                    <div class="no-extras-msg" style="color:gray; font-size:12px; font-style: italic;">Sin actividades adicionales</div>
                </td>
                <td style="text-align:center;">
                    <button class="btn btn-activar" style="padding:8px 15px; border-radius: 20px;" onclick="addExtraRow(${emp.id})">+ Actividad</button>
                </td>
            </tr>`;
        }).join('');

        res.send(`
            <!DOCTYPE html><html lang="es">
            <head>
                ${commonHtmlHead.replace('<title>Panel de Administración</title>', '<title>Super Nómina</title>')}
                <style>
                    .extra-row { display: grid; grid-template-columns: 140px 1.5fr 1.5fr 100px 30px; gap: 8px; margin-bottom: 8px; background: #fdfdfd; padding: 8px; border-radius: 8px; border: 1px solid #eaeaea; align-items: center; }
                    .extra-row input, .extra-row select { padding: 6px; font-size: 12px; border: 1px solid #ddd; border-radius: 5px; }
                    .btn-delete { color: #ff4d4d; cursor: pointer; font-size: 20px; text-align: center; }
                    th { text-align: left; padding: 10px; background: #f8f9fa; }
                </style>
            </head>
            <body>
                <div class="container" style="max-width: 1300px; margin-top: 40px;">
                    <div style="margin-bottom: 20px;">${backToDashboardLink}</div>
                    <h1>Super Nómina Quincenal</h1>
                    <table id="nomina-table" style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr>
                                <th>Colaborador</th>
                                <th>Sueldo Fijo (1/2)</th>
                                <th>Préstamo Activo</th>
                                <th>Detalle Actividades (Fecha - Centro - Descripción - Monto)</th>
                                <th>Acción</th>
                            </tr>
                        </thead>
                        <tbody>${employeesRows}</tbody>
                    </table>
                    <div style="margin-top: 40px; text-align: right; padding-bottom: 50px;">
                        <button id="btn-procesar" class="btn" style="background: #28a745; color: white; padding: 15px 40px; border-radius: 30px;" onclick="procesarNomina()">
                            💾 Procesar y Vincular a Proyectos
                        </button>
                    </div>
                </div>
                <script>
                    const projectOptionsHtml = '${projectOptions}';
                    function addExtraRow(empId) {
                        const container = document.getElementById('extras-container-' + empId);
                        const noExtrasMsg = container.querySelector('.no-extras-msg');
                        if (noExtrasMsg) noExtrasMsg.remove();
                        const div = document.createElement('div');
                        div.className = 'extra-row';
                        div.innerHTML = '<input type="date" class="extra-date">' +
                            '<select class="extra-project"><option value="">-- Oficina --</option>' + projectOptionsHtml + '</select>' +
                            '<input type="text" class="extra-desc" placeholder="¿Qué hizo?">' +
                            '<input type="number" class="extra-amount" value="0" step="0.01">' +
                            '<div class="btn-delete" onclick="this.parentElement.remove()">×</div>';
                        container.appendChild(div);
                    }

                    async function procesarNomina() {
                        const rows = document.querySelectorAll('.employee-row');
                        const payload = [];
                        let resumen = "RESUMEN DE PAGO:\\n\\n";

                        rows.forEach(row => {
                            const empId = row.dataset.employeeId;
                            const loanId = row.dataset.loanId;
                            const nombre = row.querySelector('td').innerText;
                            const sueldo = parseFloat(row.dataset.salary);
                            const inputDeduccion = row.querySelector('.loan-deduction');
                            const deduccion = inputDeduccion ? parseFloat(inputDeduccion.value) || 0 : 0;
                            
                            const extras = [];
                            let totalExtras = 0;
                            row.querySelectorAll('.extra-row').forEach(ex => {
                                const monto = parseFloat(ex.querySelector('.extra-amount').value) || 0;
                                if(monto > 0) {
                                    extras.push({
                                        date: ex.querySelector('.extra-date').value,
                                        quote_id: ex.querySelector('.extra-project').value,
                                        desc: ex.querySelector('.extra-desc').value,
                                        amount: monto
                                    });
                                    totalExtras += monto;
                                }
                            });

                            if(sueldo > 0 || totalExtras > 0 || deduccion > 0) {
                                payload.push({ 
                                    employee_id: empId, 
                                    salary: sueldo, 
                                    loan_id: loanId, 
                                    loan_deduction: deduccion,
                                    extras: extras 
                                });
                                resumen += "- " + nombre + ": RD$ " + (sueldo + totalExtras - deduccion).toFixed(2) + "\\n";
                            }
                        });

                        if(payload.length === 0) return alert("No hay datos para procesar.");

                        if(confirm(resumen + "\\n¿Confirmas el procesamiento de estos pagos?")) {
                            const res = await fetch('/procesar-super-nomina', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ nomina: payload })
                            });
                            const result = await res.json();
                            if(result.success) { 
                                alert("¡Nómina procesada con éxito!"); 
                                window.location.href = "/historial-nomina"; 
                            } else { 
                                alert("Error: " + result.message); 
                            }
                        }
                    }
                </script>
            </body></html>`);
    } catch (e) { res.status(500).send(e.message); } finally { if (client) client.release(); }
});
app.get('/ver-recibo/:payroll_id/:employee_id', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { payroll_id, employee_id } = req.params;
    let client;
    try {
        client = await pool.connect();
        
        // 1. Obtener datos del empleado
        const empRes = await client.query("SELECT * FROM employees WHERE id = $1", [employee_id]);
        const emp = empRes.rows[0];
        const nombreEmp = emp.nombre || emp.name || "Empleado";
        const sueldoBase = (parseFloat(emp.salary || emp.sueldo || 0) / 2).toFixed(2);

        // 2. Obtener todos los extras de ese batch de nómina
        const extrasRes = await client.query(`
            SELECT pe.*, q.clientname 
            FROM payroll_extras pe
            LEFT JOIN quotes q ON pe.quote_id = q.id
            WHERE pe.payroll_id = $1 AND pe.employee_id = $2
            ORDER BY pe.payment_date ASC
        `, [payroll_id, employee_id]);
        
        const extras = extrasRes.rows;
        let totalExtras = 0;

        // 3. Generar las filas de la tabla Excel
        let filasTabla = extras.map(ex => {
            totalExtras += parseFloat(ex.amount);
            return `
                <tr>
                    <td>${new Date(ex.payment_date).toLocaleDateString('es-ES')}</td>
                    <td>${ex.description}</td>
                    <td>${ex.clientname || 'Administración'}</td>
                    <td style="text-align:right;">$${parseFloat(ex.amount).toFixed(2)}</td>
                </tr>`;
        }).join('');

        const totalPagar = (parseFloat(sueldoBase) + totalExtras).toFixed(2);

        res.send(`
            <!DOCTYPE html><html lang="es">
            <head>
                <meta charset="UTF-8">
                <title>Recibo de Pago - ${nombreEmp}</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #333; }
                    .recibo-header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 20px; }
                    .info-grid { display: grid; grid-template-columns: 1fr 1fr; margin-bottom: 30px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
                    th { background-color: #f2f2f2; font-weight: bold; }
                    .total-section { margin-top: 30px; text-align: right; font-size: 1.2em; }
                    .btn-print { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; }
                    @media print { .btn-print { display: none; } }
                </style>
            </head>
            <body>
                <button class="btn-print" onclick="window.print()">🖨️ Imprimir Recibo</button>
                <div class="recibo-header">
                    <h2>RECIBO DE PAGO DE PERSONAL</h2>
                    <p>Quincena correspondiente al ${new Date().toLocaleDateString()}</p>
                </div>
                
                <div class="info-grid">
                    <div><strong>Colaborador:</strong> ${nombreEmp}</div>
                    <div style="text-align:right;"><strong>ID Pago:</strong> #${payroll_id}</div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Descripción / Concepto</th>
                            <th>Centro Educativo</th>
                            <th style="text-align:right;">Monto (RD$)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>${new Date().toLocaleDateString()}</td>
                            <td>Sueldo Fijo Quincenal</td>
                            <td>---</td>
                            <td style="text-align:right;">$${sueldoBase}</td>
                        </tr>
                        ${filasTabla}
                    </tbody>
                </table>

                <div class="total-section">
                    <strong>TOTAL NETO A PAGAR:</strong>
                    <span style="color: #28a745; font-weight: bold; margin-left: 20px; font-size: 1.5em;">$${totalPagar}</span>
                </div>

                <div style="margin-top: 100px; display: grid; grid-template-columns: 1fr 1fr; gap: 50px;">
                    <div style="border-top: 1px solid #000; text-align: center; padding-top: 10px;">Firma del Empleador</div>
                    <div style="border-top: 1px solid #000; text-align: center; padding-top: 10px;">Firma del Colaborador</div>
                </div>
            </body></html>`);

    } catch (e) { res.status(500).send(e.message); } finally { if (client) client.release(); }
});
app.post('/procesar-super-nomina', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { nomina } = req.body;
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const batchPayrollId = Date.now(); 

        for (const entry of nomina) {
            // 1. Registrar Descuento de Préstamo (si existe)
            if (entry.loan_id && entry.loan_deduction > 0) {
                await client.query(
                    `INSERT INTO loan_payments (loan_id, payment_date, amount_paid, payment_method, notes) 
                     VALUES ($1, CURRENT_DATE, $2, 'Descuento Nómina', 'Descuento automático Quincena ID: ${batchPayrollId}')`,
                    [entry.loan_id, entry.loan_deduction]
                );

                // Verificar si se saldó el préstamo
                const checkRes = await client.query(
                    `SELECT loan_amount, (SELECT COALESCE(SUM(amount_paid), 0) FROM loan_payments WHERE loan_id = $1) as pagado 
                     FROM loans WHERE id = $1`, [entry.loan_id]
                );
                if (parseFloat(checkRes.rows[0].pagado) >= parseFloat(checkRes.rows[0].loan_amount)) {
                    await client.query("UPDATE loans SET status = 'pagado' WHERE id = $1", [entry.loan_id]);
                }
            }

            // 2. Registrar Extras y Gastos (Centro u Oficina)
            for (const extra of entry.extras) {
                const montoExtra = parseFloat(extra.amount);
                const fechaActividad = extra.date || new Date().toISOString().split('T')[0];
                
                if (montoExtra > 0) {
                    await client.query(
                        `INSERT INTO payroll_extras (employee_id, quote_id, amount, description, payment_date, payroll_id) 
                         VALUES ($1, $2, $3, $4, $5, $6)`,
                        [entry.employee_id, extra.quote_id || null, montoExtra, extra.desc, fechaActividad, batchPayrollId]
                    );
                    
                    if (extra.quote_id) {
                        // Gasto por Centro
                        await client.query(
                            `INSERT INTO expenses (quote_id, amount, description, expense_date, supplier_id, type) 
                             VALUES ($1, $2, $3, $4, (SELECT id FROM suppliers LIMIT 1), 'Nómina Interna')`,
                            [extra.quote_id, montoExtra, `Nómina (${fechaActividad}): ${extra.desc}`, fechaActividad]
                        );
                    } else {
                        // Gasto Administrativo (Oficina)
                        await client.query(
                            `INSERT INTO expenses (quote_id, amount, description, expense_date, supplier_id, type) 
                             VALUES (NULL, $1, $2, $3, (SELECT id FROM suppliers LIMIT 1), 'Gasto Administrativo')`,
                            [montoExtra, `Pago Administrativo: ${extra.desc}`, fechaActividad]
                        );
                    }
                }
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, payroll_id: batchPayrollId });
    } catch (e) {
        if (client) await client.query('ROLLBACK');
        console.error("Error contable:", e.message);
        res.status(500).json({ success: false, message: e.message });
    } finally {
        if (client) client.release();
    }
});
app.get('/imprimir-desembolso/:id', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { id } = req.params;
    let client;
    try {
        client = await pool.connect();
        const result = await client.query(`
            SELECT l.*, e.nombre, e.name, e.cedula 
            FROM loans l JOIN employees e ON l.employee_id = e.id 
            WHERE l.id = $1`, [id]);
        client.release();
        const loan = result.rows[0];

        res.send(`
            <!DOCTYPE html><html lang="es">
            <head><title>Comprobante de Desembolso</title>
                <style>
                    body { font-family: sans-serif; padding: 50px; line-height: 1.6; }
                    .header { text-align: center; border-bottom: 2px solid #333; margin-bottom: 30px; }
                    .contrato { text-align: justify; margin-bottom: 50px; }
                    .firmas { display: grid; grid-template-columns: 1fr 1fr; gap: 100px; margin-top: 80px; }
                    .linea { border-top: 1px solid #000; text-align: center; padding-top: 10px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>COMPROBANTE DE DESEMBOLSO DE PRÉSTAMO</h1>
                    <p>Referencia del Préstamo: #00${loan.id}</p>
                </div>
                <div class="contrato">
                    <p>Yo, <b>${loan.nombre || loan.name}</b>, identificado con la cédula No. <b>${loan.cedula || '___________'}</b>, 
                    declaro haber recibido de la empresa la suma de <b>RD$ ${parseFloat(loan.loan_amount).toFixed(2)}</b> 
                    en fecha <b>${new Date(loan.loan_date).toLocaleDateString()}</b>.</p>
                    
                    <p>Acepto que dicho monto sea descontado de mis pagos de nómina, bonos o comisiones de forma quincenal, 
                    según los acuerdos establecidos, hasta saldar la totalidad de la deuda.</p>
                    
                    <p><b>Concepto:</b> ${loan.reason || 'Préstamo personal'}</p>
                </div>
                <div class="firmas">
                    <div class="linea">Entregado por (Empresa)</div>
                    <div class="linea">Recibido Conforme (Empleado)</div>
                </div>
                <div style="margin-top: 50px; text-align: center;">
                    <button onclick="window.print()" style="padding: 10px 20px; cursor: pointer;">🖨️ Imprimir para Firma</button>
                </div>
            </body></html>`);
    } catch (e) { res.status(500).send(e.message); }
});
app.post('/anular-nomina/:payroll_id', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { payroll_id } = req.params;
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // 1. Eliminar abonos a préstamos realizados en este lote
        // Buscamos los pagos que tengan la nota de este batch ID
        await client.query(
            "DELETE FROM loan_payments WHERE notes LIKE $1", 
            [`%ID: ${payroll_id}%`]
        );

        // 2. Eliminar los gastos creados en los proyectos (Centros)
        // Buscamos los gastos cuya descripción contenga el ID o el formato de nómina
        await client.query(
            "DELETE FROM expenses WHERE type IN ('Nómina Interna', 'Gasto Administrativo') AND expense_date = (SELECT payment_date FROM payroll_extras WHERE payroll_id = $1 LIMIT 1)",
            [payroll_id]
        );

        // 3. Eliminar el detalle de los extras de nómina
        await client.query("DELETE FROM payroll_extras WHERE payroll_id = $1", [payroll_id]);

        await client.query('COMMIT');
        res.json({ success: true, message: "Lote de nómina anulado completamente." });
    } catch (e) {
        if (client) await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: e.message });
    } finally {
        if (client) client.release();
    }
});
app.get('/reporte-suplidor-pdf/:id', requireLogin, requireAdminOrCoord, async (req, res) => {
    const supplierId = req.params.id;
    let client;
    try {
        client = await pool.connect();
        const supplierRes = await client.query("SELECT name FROM suppliers WHERE id = $1", [supplierId]);
        
        // Buscamos facturas pendientes
        const invoicesRes = await client.query(`
            SELECT * FROM expenses 
            WHERE supplier_id = $1 AND status != 'Pagada' 
            ORDER BY expense_date ASC`, [supplierId]);
        
        // Buscamos TODOS los abonos hechos a este suplidor
        const historyRes = await client.query(`
            SELECT ph.*, e.description as factura_desc 
            FROM payment_history ph
            JOIN expenses e ON ph.expense_id = e.id
            WHERE e.supplier_id = $1
            ORDER BY ph.payment_date DESC`, [supplierId]);
        
        const invoices = invoicesRes.rows;
        const history = historyRes.rows;
        const totalPendiente = invoices.reduce((sum, i) => sum + (parseFloat(i.amount) - parseFloat(i.paid_amount || 0)), 0);

        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        doc.pipe(res);

        // Encabezado
        doc.font('Helvetica-Bold').fontSize(16).text('ESTADO DE CUENTA Y CONCILIACIÓN', { align: 'center' });
        doc.fontSize(12).text(`Suplidor: ${supplierRes.rows[0].name}`, { align: 'center' });
        doc.fontSize(10).font('Helvetica').text(`Generado: ${new Date().toLocaleString()}`, { align: 'center' });
        doc.moveDown(2);

        // SECCIÓN 1: FACTURAS PENDIENTES
        doc.font('Helvetica-Bold').fontSize(12).text('1. FACTURAS PENDIENTES DE PAGO', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(10);
        doc.text('FECHA', 50, doc.y, { width: 70 });
        doc.text('CONCEPTO', 120, doc.y, { width: 230 });
        doc.text('PENDIENTE', 450, doc.y, { align: 'right' });
        doc.moveTo(50, doc.y + 12).lineTo(550, doc.y + 12).stroke();
        doc.moveDown();

        invoices.forEach(i => {
            const bal = parseFloat(i.amount) - parseFloat(i.paid_amount || 0);
            doc.text(new Date(i.expense_date).toLocaleDateString(), 50, doc.y);
            doc.text(i.description || 'N/A', 120, doc.y, { width: 220 });
            doc.text(`RD$ ${bal.toFixed(2)}`, 450, doc.y, { align: 'right' });
            doc.moveDown();
        });

        // SECCIÓN 2: HISTORIAL DE PAGOS REALIZADOS (La gran mejora)
        doc.moveDown(2);
        doc.font('Helvetica-Bold').fontSize(12).text('2. HISTORIAL DE ABONOS RECIBIDOS', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(10);
        doc.text('FECHA PAGO', 50, doc.y, { width: 90 });
        doc.text('MÉTODO', 150, doc.y, { width: 100 });
        doc.text('MONTO ABONADO', 450, doc.y, { align: 'right' });
        doc.moveTo(50, doc.y + 12).lineTo(550, doc.y + 12).stroke();
        doc.moveDown();

        doc.font('Helvetica');
        history.forEach(h => {
            doc.text(new Date(h.payment_date).toLocaleDateString(), 50, doc.y);
            doc.text(h.payment_method || 'Efectivo', 150, doc.y);
            doc.text(`RD$ ${parseFloat(h.amount_paid).toFixed(2)}`, 450, doc.y, { align: 'right' });
            doc.moveDown();
        });

        // TOTAL FINAL
        doc.moveDown(2);
        doc.font('Helvetica-Bold').fontSize(14).fillColor('#c53030')
           .text(`DEUDA TOTAL A LA FECHA: RD$ ${totalPendiente.toFixed(2)}`, { align: 'right' });

        doc.end();
    } catch (e) { res.status(500).send(e.message); } finally { if (client) client.release(); }
});
app.post('/cuentas-por-pagar/abonar', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { expenseId, paymentAmount, paymentMethod } = req.body;
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // 1. Registrar el abono en el historial
        await client.query(
            "INSERT INTO payment_history (expense_id, amount_paid, payment_method) VALUES ($1, $2, $3)",
            [expenseId, paymentAmount, paymentMethod || 'Efectivo']
        );

        // 2. Actualizar el monto pagado acumulado en la factura
        const expenseRes = await client.query("SELECT amount, paid_amount FROM expenses WHERE id = $1", [expenseId]);
        const expense = expenseRes.rows[0];
        const nuevoTotalPagado = parseFloat(expense.paid_amount || 0) + parseFloat(paymentAmount);
        
        // 3. Determinar el nuevo estado
        let nuevoEstado = (nuevoTotalPagado >= parseFloat(expense.amount)) ? 'Pagada' : 'Abonada';

        await client.query(
            "UPDATE expenses SET paid_amount = $1, status = $2 WHERE id = $3",
            [nuevoTotalPagado, nuevoEstado, expenseId]
        );

        await client.query('COMMIT');
        res.redirect('/cuentas-por-pagar');
    } catch (e) {
        if (client) await client.query('ROLLBACK');
        res.status(500).send(e.message);
    } finally {
        if (client) client.release();
    }
});
app.listen(PORT, () => {
    console.log(`✅ Servidor de Administración corriendo en http://localhost:${PORT}`);
});
