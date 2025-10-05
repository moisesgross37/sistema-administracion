const axios = require('axios');
const express = require('express');
const { Pool } = require('pg');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const PORT = 3002;

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
        res.status(403).send('<h1>Acceso Denied 🚫</h1><p>No tienes los permisos necesarios para acceder a esta sección.</p>');
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

// =======================================================
// ============== ESTILOS Y MENÚS DE NAVEGACIÓN ==============
// =======================================================

const commonHtmlHead = `
    <meta charset="UTF-8">
    <title>Panel de Administración</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; margin: 0; background-color: #f4f4f9; color: #333; }
        .container { max-width: 1100px; margin: 20px auto; padding: 20px; }
        h1, h2 { color: #0056b3; }
        nav { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; background-color: #fff; padding: 15px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        nav .links a { margin-right: 20px; text-decoration: none; font-weight: 600; color: #007bff; font-size: 16px; }
        .logout-form button { background: #dc3545; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer; font-weight: 600; }
        .dashboard-header { display: flex; justify-content: space-between; align-items: center; }
        .dashboard { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; }
        .module h2 { border-bottom: 2px solid #dee2e6; padding-bottom: 10px; margin-top: 0; }
        .module { margin-bottom: 30px; }
        .dashboard-card { background-color: #fff; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); padding: 20px; text-decoration: none; color: inherit; display: block; transition: transform 0.2s, box-shadow 0.2s; }
        .dashboard-card:hover { transform: translateY(-5px); box-shadow: 0 4px 15px rgba(0,0,0,0.15); }
        .dashboard-card h3 { margin: 0 0 10px; color: #0056b3; }
        .dashboard-card p { margin: 0; color: #6c757d; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; background-color: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        th, td { padding: 12px 15px; border: 1px solid #ddd; text-align: left; vertical-align: middle; }
        thead { background-color: #007bff; color: white; }
        tbody tr:nth-child(even) { background-color: #f2f2f2; }
        .btn { background-color: #007bff; color: white; padding: 10px 15px; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; text-decoration: none; display: inline-block; }
        .btn-activar { background-color: #28a745; }
        .btn-toggle { background-color: #17a2b8; }
        .btn-gasto { background-color: #ffc107; color: #212529; }
        .form-container, .payment-form, .expense-form { background: #e9ecef; padding: 20px; border-radius: 8px; margin-top: 15px; }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
        .form-group input, .form-group textarea, .form-group select { width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ccc; box-sizing: border-box; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; text-align: center; margin: 30px 0; }
        .summary-box { background-color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .summary-box h3 { margin: 0 0 10px; color: #007bff; font-size: 1em; }
        .summary-box .amount { font-size: 24px; font-weight: bold; }
        .green { color: #28a745; }
        .red { color: #dc3545; }
        .blue { color: #007bff; }
        .orange { color: #fd7e14; }
        .back-link { display: inline-block; margin-bottom: 20px; font-weight: 600; text-decoration: none; color: #007bff; background-color: #fff; padding: 10px 15px; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
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
                        <a href="/cuentas-por-cobrar" class="dashboard-card"><h3>📊 Cuentas por Cobrar</h3><p>Consulta un resumen de todas las deudas pendientes.</p></a>
                        <a href="/reporte-gastos" class="dashboard-card"><h3>🧾 Reporte de Gastos</h3><p>Consulta un resumen de todos los gastos de la empresa.</p></a>
                        <a href="/suplidores" class="dashboard-card"><h3>🚚 Gestionar Suplidores</h3><p>Añade o edita la información de tus suplidores.</p></a>
                    </div>
                </div>
                <div class="module">
                    <h2>Nómina</h2>
                    <div class="dashboard">
                        <a href="/empleados" class="dashboard-card"><h3>👥 Gestionar Empleados</h3><p>Añade o edita la información de tu personal.</p></a>
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

// =======================================================================
// ============== RUTA DE PROYECTOS POR ACTIVAR (VERSIÓN FINAL) ==============
// =======================================================================
app.get('/proyectos-por-activar', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query(
            `SELECT q.* FROM quotes q
             INNER JOIN centers c ON q.clientname = c.name 
             WHERE q.status = 'formalizada' 
             ORDER BY q.createdat ASC`
        );
        const quotes = result.rows;
        client.release();

        let quotesHtml = quotes.map(quote => `
            <tr>
                <td>${quote.quotenumber}</td>
                
                <td style="text-align: center;">
                    <a href="/ver-cotizacion-pdf/${quote.id}" target="_blank" class="btn" style="padding: 5px 10px; font-size: 14px; background-color: #6c757d;">
                        Ver PDF 📄
                    </a>
                </td>

                <td>${quote.clientname}</td>
                <td>${quote.advisorname}</td>
                <td>
                    <textarea name="notas_administrativas" rows="3" placeholder="Añadir notas internas..." form="form-activar-${quote.id}" style="width: 100%; box-sizing: border-box;"></textarea>
                </td>
                <td style="text-align: center; vertical-align: middle;">
                    <form id="form-activar-${quote.id}" action="/activar-proyecto/${quote.id}" method="POST">
                        <button type="submit" class="btn btn-activar">Activar Proyecto</button>
                    </form>
                </td>
            </tr>
        `).join('');

        if (quotes.length === 0) {
            quotesHtml = '<tr><td colspan="6">No hay proyectos pendientes de activación.</td></tr>';
        }

        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
                <div class="container">
                    ${backToDashboardLink}
                    <h2>Proyectos Formalizados por Activar</h2>
                    <table>
                        <thead>
                            <tr>
                                <th># Cotización</th>
                                <th>Cotización</th> <th>Cliente</th>
                                <th>Asesor</th>
                                <th>Notas Internas</th>
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

// =======================================================
// ============== NUEVA RUTA PROXY PARA PDFs ==============
// =======================================================
app.get('/ver-cotizacion-pdf/:quoteId', requireLogin, async (req, res) => {
    try {
        const { quoteId } = req.params;

        // URL real de tu aplicación "Proyecto Gestión" en Render
        const gestionApiUrl = `https://be-gestion.onrender.com/api/quote-requests/${quoteId}/pdf`;

        const response = await axios.get(gestionApiUrl, {
            headers: {
                // Esta es la llave secreta que el otro servidor espera
                'X-API-Key': 'MI_LLAVE_SECRETA_12345'
            },
            responseType: 'stream' // Muy importante para manejar archivos
        });

        // Le decimos al navegador del usuario que estamos enviando un PDF
        res.setHeader('Content-Type', 'application/pdf');

        // Enviamos el PDF que recibimos del otro servidor directamente al navegador
        response.data.pipe(res);

    } catch (error) {
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

app.get('/cuentas-por-cobrar', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query(`
            SELECT
                q.id as quote_id, q.quotenumber, q.clientname, q.preciofinalporestudiante, q.estudiantesparafacturar,
                COALESCE(SUM(p.amount), 0) as total_abonado
            FROM quotes q
            LEFT JOIN payments p ON q.id = p.quote_id
            WHERE q.status = 'activa'
            GROUP BY q.id
            ORDER BY q.clientname ASC;
        `);
        const projects = result.rows;
        client.release();

        let totalGeneralVenta = 0;
        let totalGeneralAbonado = 0;

        let projectsHtml = projects.map(p => {
            const totalVenta = parseFloat(p.preciofinalporestudiante || 0) * parseFloat(p.estudiantesparafacturar || 0);
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
            SELECT e.*, s.name as supplier_name, q.clientname
            FROM expenses e
            JOIN suppliers s ON e.supplier_id = s.id
            JOIN quotes q ON e.quote_id = q.id
            ORDER BY e.expense_date DESC;
        `);
        const expenses = result.rows;
        client.release();

        const totalGastado = expenses.reduce((sum, expense) => sum + parseFloat(expense.amount), 0);
        let expensesHtml = expenses.map(e => {
            return `<tr><td>${new Date(e.expense_date).toLocaleDateString()}</td><td>${e.clientname}</td><td>${e.supplier_name}</td><td>${e.description}</td><td>${e.type || ''}</td><td style="font-weight: bold;">$${parseFloat(e.amount).toFixed(2)}</td></tr>`;
        }).join('');

        if (expenses.length === 0) {
            expensesHtml = '<tr><td colspan="6">No hay gastos registrados en el sistema.</td></tr>';
        }

        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
                <div class="container">
                    ${backToDashboardLink}
                    <h2>Reporte General de Gastos</h2>
                    <div class="summary">
                        <div class="summary-box" style="grid-column: span 2; margin: auto;">
                            <h3>Total General Gastado</h3>
                            <p class="amount orange">$${totalGastado.toFixed(2)}</p>
                        </div>
                    </div>
                    <table><thead><tr><th>Fecha</th><th>Proyecto (Cliente)</th><th>Suplidor</th><th>Descripción</th><th>Tipo</th><th>Monto</th></tr></thead><tbody>${expensesHtml}</tbody></table>
                </div>
            </body></html>`);
    } catch (error) {
        console.error("Error al generar el reporte de gastos:", error);
        res.status(500).send('<h1>Error al cargar el reporte ❌</h1>');
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

app.get('/generar-nomina', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT id, first_name, last_name, base_salary, payment_frequency FROM employees ORDER BY first_name, last_name ASC');
        const employees = result.rows;
        client.release();

        let employeesRowsHtml = employees.map(e => {
            const monthlySalary = parseFloat(e.base_salary || 0);
            let salaryForPeriod = monthlySalary;

            if (e.payment_frequency === 'quincenal') {
                salaryForPeriod /= 2;
            }

            return `
                <tr data-employee-id="${e.id}">
                    <td>${e.first_name} ${e.last_name}</td>
                    <td data-base-salary="${salaryForPeriod.toFixed(2)}">$${salaryForPeriod.toFixed(2)}</td>
                    <td><input type="number" name="bonuses_${e.id}" class="payroll-input" step="0.01" value="0"></td>
                    <td><input type="number" name="deductions_${e.id}" class="payroll-input" step="0.01" value="0"></td>
                    <td class="net-pay" style="font-weight: bold;">$${salaryForPeriod.toFixed(2)}</td>
                    <td><textarea name="notes_${e.id}" rows="1" style="width: 100%;"></textarea></td>
                </tr>
            `;
        }).join('');

        if (employees.length === 0) {
            employeesRowsHtml = '<tr><td colspan="6">No hay empleados registrados. Primero añada empleados en "Gestionar Empleados".</td></tr>';
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

        const employeesResult = await client.query('SELECT id, base_salary FROM employees');
        const employees = employeesResult.rows;

        for (const employee of employees) {
            const employeeId = employee.id;
            const baseSalary = parseFloat(employee.base_salary || 0);
            const bonuses = parseFloat(req.body[`bonuses_${employeeId}`] || 0);
            const deductions = parseFloat(req.body[`deductions_${employeeId}`] || 0);
            const notes = req.body[`notes_${employeeId}`] || '';
            
            const netPay = baseSalary + bonuses - deductions;

            await client.query(
                `INSERT INTO payroll_records (employee_id, pay_date, base_salary_paid, bonuses, deductions, net_pay, notes)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [employeeId, pay_date, baseSalary, bonuses, deductions, netPay, notes]
            );
        }

        await client.query('COMMIT');
        
        res.redirect('/');

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
                pr.*,
                e.first_name,
                e.last_name
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
                <td><button class="btn" disabled>Imprimir</button></td>
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
                        <thead>
                            <tr>
                                <th>Fecha de Pago</th>
                                <th>Empleado</th>
                                <th>Salario Pagado</th>
                                <th>Bonos</th>
                                <th>Descuentos</th>
                                <th>Pago Neto</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${recordsHtml}
                        </tbody>
                    </table>
                </div>
            </body></html>
        `);
    } catch (error) {
        console.error("Error al obtener el historial de nómina:", error);
        res.status(500).send('<h1>Error al cargar el historial ❌</h1>');
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
        
        const [paymentsResult, expensesResult, suppliersResult] = await Promise.all([
            client.query(`SELECT * FROM payments WHERE quote_id = $1 ORDER BY payment_date DESC`, [quote.id]),
            client.query(`SELECT e.*, s.name as supplier_name FROM expenses e JOIN suppliers s ON e.supplier_id = s.id WHERE e.quote_id = $1 ORDER BY e.expense_date DESC`, [quote.id]),
            client.query('SELECT * FROM suppliers ORDER BY name ASC')
        ]);
        
        client.release();
        const payments = paymentsResult.rows;
        const expenses = expensesResult.rows;
        const suppliers = suppliersResult.rows;
        
        const totalVenta = parseFloat(quote.preciofinalporestudiante || 0) * parseFloat(quote.estudiantesparafacturar || 0);
        const totalAbonado = payments.reduce((sum, payment) => sum + parseFloat(payment.amount), 0);
        const totalGastado = expenses.reduce((sum, expense) => sum + parseFloat(expense.amount), 0);
        const balancePendiente = totalVenta - totalAbonado;
        const rentabilidad = totalAbonado - totalGastado;

        let paymentsHtml = payments.map(p => `<tr><td>${new Date(p.payment_date).toLocaleDateString()}</td><td>$${parseFloat(p.amount).toFixed(2)}</td><td>${p.students_covered || 'N/A'}</td><td>${p.comment || ''}</td></tr>`).join('') || '<tr><td colspan="4">No hay pagos registrados.</td></tr>';
        let expensesHtml = expenses.map(e => `<tr><td>${new Date(e.expense_date).toLocaleDateString()}</td><td>${e.supplier_name}</td><td>${e.description}</td><td>$${parseFloat(e.amount).toFixed(2)}</td><td>${e.type || ''}</td></tr>`).join('') || '<tr><td colspan="5">No hay gastos registrados.</td></tr>';
        let suppliersOptionsHtml = suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

        res.send(`
            <!DOCTYPE html><html lang="es">
            <head>
                ${commonHtmlHead.replace('<title>Panel de Administración</title>', '<title>Detalle del Proyecto</title>')}
                <style>.admin-notes { background-color: #fff3cd; border-left: 5px solid #ffeeba; padding: 15px; margin: 20px 0; border-radius: 5px; }</style>
            </head>
            <body>
                <div class="container" style="max-width: 900px;">
                    ${backToDashboardLink}
                    <div class="header" style="border-bottom: 2px solid #007bff; padding-bottom: 10px; margin-bottom: 20px;"><h1>${quote.clientname}</h1><p>Cotización #${quote.quotenumber} &bull; Asesor: ${quote.advisorname}</p></div>
                    ${quote.notas_administrativas ? `<div class="admin-notes"><strong>Notas Administrativas:</strong><br>${quote.notas_administrativas.replace(/\n/g, '<br>')}</div>` : ''}
                    <div class="summary">
                        <div class="summary-box"><h3>Monto Total Venta</h3><p class="amount">$${totalVenta.toFixed(2)}</p></div>
                        <div class="summary-box"><h3>Total Abonado</h3><p class="amount green">$${totalAbonado.toFixed(2)}</p></div>
                        <div class="summary-box"><h3>Total Gastado</h3><p class="amount orange">$${totalGastado.toFixed(2)}</p></div>
                        <div class="summary-box"><h3>Rentabilidad Actual</h3><p class="amount ${rentabilidad >= 0 ? 'blue' : 'red'}">$${rentabilidad.toFixed(2)}</p></div>
                    </div>
                    <hr style="margin: 40px 0;">
                    <h2><span style="color: #28a745;">Ingresos</span> (Abonos Realizados)</h2>
                    <table><thead><tr><th>Fecha</th><th>Monto</th><th>Estudiantes Cubiertos</th><th>Comentario</th></tr></thead><tbody>${paymentsHtml}</tbody></table>
                    <button class="btn btn-toggle" onclick="toggleForm('payment-form-container')">Registrar Nuevo Abono</button>
                    <div id="payment-form-container" class="payment-form" style="display: none;">
                        <h2>Nuevo Abono</h2>
                        <form action="/proyecto/${quote.id}/nuevo-pago" method="POST"><input type="hidden" name="centerId" value="${centerId}"><div class="form-group"><label>Fecha:</label><input type="date" name="payment_date" required></div><div class="form-group"><label>Monto:</label><input type="number" name="amount" step="0.01" required></div><div class="form-group"><label>Estudiantes Cubiertos:</label><input type="number" name="students_covered"></div><div class="form-group"><label>Comentario:</label><textarea name="comment" rows="2"></textarea></div><button type="submit" class="btn">Guardar Abono</button></form>
                    </div>
                    <hr style="margin: 40px 0;">
                    <h2><span style="color: #dc3545;">Egresos</span> (Gastos del Proyecto)</h2>
                    <table><thead><tr><th>Fecha</th><th>Suplidor</th><th>Descripción</th><th>Monto</th><th>Tipo</th></tr></thead><tbody>${expensesHtml}</tbody></table>
                    <button class="btn btn-toggle btn-gasto" onclick="toggleForm('expense-form-container')">Registrar Nuevo Gasto</button>
                    <div id="expense-form-container" class="expense-form" style="display: none;">
                        <h2>Nuevo Gasto</h2>
                        <form action="/proyecto/${quote.id}/nuevo-gasto" method="POST"><input type="hidden" name="centerId" value="${centerId}"><div class="form-group"><label>Fecha:</label><input type="date" name="expense_date" required></div><div class="form-group"><label>Suplidor:</label><select name="supplier_id" required><option value="">Seleccione un suplidor...</option>${suppliersOptionsHtml}</select></div><div class="form-group"><label>Monto:</label><input type="number" name="amount" step="0.01" required></div><div class="form-group"><label>Tipo:</label><select name="type"><option value="">Seleccionar...</option><option value="Con Valor Fiscal">Con Valor Fiscal</option><option value="Sin Valor Fiscal">Sin Valor Fiscal</option></select></div><div class="form-group"><label>Descripción:</label><textarea name="description" rows="2" required></textarea></div><button type="submit" class="btn">Guardar Gasto</button></form>
                    </div>
                </div>
                <script>function toggleForm(id) { const el = document.getElementById(id); el.style.display = el.style.display === 'none' || el.style.display === '' ? 'block' : 'none'; }</script>
            </body></html>`);
    } catch (error) {
        console.error("Error al obtener detalle del proyecto:", error);
        res.status(500).send('<h1>Error al obtener los detalles del proyecto ❌</h1>');
    }
});

app.post('/proyecto/:id/nuevo-pago', requireLogin, requireAdminOrCoord, async (req, res) => {
    const quoteId = req.params.id;
    const { centerId, payment_date, amount, students_covered, comment } = req.body;
    try {
        const client = await pool.connect();
        await client.query(`INSERT INTO payments (quote_id, payment_date, amount, students_covered, comment) VALUES ($1, $2, $3, $4, $5)`, [quoteId, payment_date, amount, students_covered || null, comment]);
        client.release();
        res.redirect(`/proyecto/${centerId}`);
    } catch (error) {
        console.error("Error al guardar el pago:", error);
        res.status(500).send('<h1>Error al guardar el pago ❌</h1>');
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

app.listen(PORT, () => {
    console.log(`✅ Servidor de Administración corriendo en http://localhost:${PORT}`);
});
