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

// --- LOGIN BLINDADO Y SEGURO (POR ID) ---
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    let client;
    try {
        client = await pool.connect();
        
        // 1. Buscamos al usuario (Sin importar mayúsculas/minúsculas)
        // Usamos ILIKE para que si escribes 'moises' o 'Moises' te encuentre igual.
        const result = await client.query('SELECT * FROM users WHERE username ILIKE $1', [username]);
        
        if (result.rows.length > 0) {
            const user = result.rows[0];
            
            // 2. VERIFICAR LA CONTRASEÑA (La que ya tienes, no ha cambiado)
            const match = await bcrypt.compare(password, user.password);
            
            if (match) {
                // 3. EL FILTRO VIP POR ID (MÁS SEGURO)
                // ID 1 = Moises, ID 2 = Wander, ID 14 = Yubelis
                const idsPermitidos = [1, 2, 14];
                
                if (!idsPermitidos.includes(user.id)) {
                    req.session.error = '⛔ Lo sentimos, tu usuario no tiene permiso para entrar a este sistema.';
                    return res.redirect('/login');
                }

                // 4. SI PASA, LE ASIGNAMOS SU ROL CORRECTO
                req.session.userId = user.id;
                req.session.user = user;
                
                // Aseguramos que el sistema sepa que son Jefes
                if (user.id === 1 || user.id === 2) { 
                    req.session.user.rol = 'administrador'; 
                } else if (user.id === 14) {
                    req.session.user.rol = 'coordinador';
                }

                // Guardamos la sesión explícitamente antes de redirigir
                return req.session.save(() => {
                    res.redirect('/');
                });
            }
        }
        
        req.session.error = 'Usuario o contraseña incorrectos';
        res.redirect('/login');
        
    } catch (err) {
        console.error("Error en Login:", err);
        req.session.error = 'Error de servidor';
        res.redirect('/login');
    } finally {
        if (client) client.release();
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

app.get('/', requireLogin, requireAdminOrCoord, async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        
        // SEGURIDAD DE ROL
        const userRol = (req.session.user.rol || req.session.user.role || '').toLowerCase();
        const isAdmin = userRol.includes('admin'); // Solo Admin ve finanzas

        let financialCardHtml = ''; 

        if (isAdmin) {
            const CYCLE_START = '2025-08-01'; // Inicio de Temporada

            // Función ULTRA SEGURA (Mejorada para limpiar comas por si SQL envía texto)
            const safeFloat = (val) => {
                if (!val) return 0;
                const strVal = val.toString().replace(/,/g, ''); // Quitamos comas si existen
                const n = parseFloat(strVal);
                return isNaN(n) ? 0 : n;
            };

            // 1. CONSULTA DE VENTAS Y COBROS (Entradas)
            const ingresosRes = await client.query(`
                SELECT 
                    (SELECT COALESCE(SUM((preciofinalporestudiante - COALESCE(aporte_institucion, 0)) * estudiantesparafacturar), 0) 
                     FROM quotes WHERE status = 'activa' AND createdat >= $1) as venta_contratada,
                    (SELECT COALESCE(SUM(amount), 0) 
                     FROM payments WHERE payment_date >= $1) as total_cobrado
            `, [CYCLE_START]);

            // 2. CONSULTAS DE GASTOS (Usamos la misma táctica ganadora del reporte: GROUP BY)
            const expensesRes = await client.query(`SELECT TO_CHAR(expense_date, 'YYYY-MM') as mes, SUM(amount) as total FROM expenses WHERE expense_date >= $1 GROUP BY 1`, [CYCLE_START]);
            const payrollRes = await client.query(`SELECT TO_CHAR(pay_date, 'YYYY-MM') as mes, SUM(net_pay) as total FROM payroll_records WHERE pay_date >= $1 GROUP BY 1`, [CYCLE_START]);
            const commRes = await client.query(`SELECT TO_CHAR(created_at, 'YYYY-MM') as mes, SUM(commission_amount) as total FROM commissions WHERE status = 'pagada' AND created_at >= $1 GROUP BY 1`, [CYCLE_START]);

            const ventaTotal = safeFloat(ingresosRes.rows[0].venta_contratada);
            const cobradoTotal = safeFloat(ingresosRes.rows[0].total_cobrado);
            
            // Sumamos los pedazos mensuales aquí mismo, replicando el reporte
            const operativo = expensesRes.rows.reduce((sum, row) => sum + safeFloat(row.total), 0);
            const nomina = payrollRes.rows.reduce((sum, row) => sum + safeFloat(row.total), 0);
            const comisiones = commRes.rows.reduce((sum, row) => sum + safeFloat(row.total), 0);
            
            const gastoTotalCiclo = operativo + nomina + comisiones; 
            
            // NUEVOS CÁLCULOS
            const pendienteCobrar = ventaTotal - cobradoTotal; // Lo que deben los colegios
            const disponibilidad = cobradoTotal - gastoTotalCiclo; // La caja real

            const hoy = new Date();
            const inicioCiclo = new Date(CYCLE_START);
            const diferenciaTiempo = hoy - inicioCiclo;
            const mesesPasados = Math.max(1, diferenciaTiempo / (1000 * 60 * 60 * 24 * 30.44)); 
            
            const promedioGastoMensual = gastoTotalCiclo / mesesPasados;
            const mesesVida = promedioGastoMensual > 0 ? (disponibilidad / promedioGastoMensual) : 0;
            

            let colorInv = mesesVida >= 6 ? '#1cc88a' : (mesesVida >= 3 ? '#f6c23e' : '#e74a3b');
            let mensajeAlerta = mesesVida >= 6 ? "✅ Finanzas Saludables" : (mesesVida >= 3 ? "⚠️ Precaución de Liquidez" : "🛑 ALERTA: Liquidez Baja");

            financialCardHtml = `
                <div class="card" style="margin-top:20px; border-top: 4px solid #4e73df; padding: 25px; background: #fff; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-radius: 8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #f8f9fc; padding-bottom:15px; margin-bottom:20px;">
                        <h3 style="margin:0; color: #2c3e50; font-size: 1.3rem;">📊 Diagnóstico Financiero (Ciclo 25-26)</h3>
                        <div style="text-align: right;">
                            <div style="font-size:12px; font-weight:bold; color:${colorInv}; background:${colorInv}15; padding:6px 12px; border-radius:20px; display:inline-block; border: 1px solid ${colorInv}40;">
                                ${mensajeAlerta} (Cobertura: ${mesesVida.toFixed(1)} Meses)
                            </div>
                            <a href="/analisis-gastos-mensual" style="display:block; margin-top:5px; font-size:11px; color:#4e73df; text-decoration:none;">🔍 Análisis de Gastos</a>
                        </div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 15px;">
                        
                        <div style="text-align: center; padding: 15px 10px; background: #f8f9fc; border-radius: 8px; border: 1px solid #eaecf4;">
                            <div style="color:#858796; font-size: 10px; font-weight:bold; text-transform:uppercase; letter-spacing: 0.5px;">1. Venta Contratada</div>
                            <div style="font-size: 1.2rem; font-weight:bold; color:#5a5c69; margin-top:8px;">RD$ ${(ventaTotal/1000000).toFixed(2)}M</div>
                            <div style="font-size: 11px; color: #a1a3b5; margin-top:4px;">${ventaTotal.toLocaleString('en-US', {maximumFractionDigits:0})}</div>
                        </div>

                        <div style="text-align: center; padding: 15px 10px; background: #eaffea; border-radius: 8px; border: 1px solid #b7eeb7; position: relative;">
                            <div style="position: absolute; left: -12px; top: 35%; font-size: 18px; color: #ccc;">➡️</div>
                            <div style="color:#28a745; font-size: 10px; font-weight:bold; text-transform:uppercase; letter-spacing: 0.5px;">2. Total Cobrado</div>
                            <div style="font-size: 1.2rem; font-weight:bold; color:#28a745; margin-top:8px;">RD$ ${(cobradoTotal/1000000).toFixed(2)}M</div>
                            <div style="font-size: 11px; color: #5cb85c; margin-top:4px;">${cobradoTotal.toLocaleString('en-US', {maximumFractionDigits:0})}</div>
                        </div>

                        <div style="text-align: center; padding: 15px 10px; background: #fffbe6; border-radius: 8px; border: 1px solid #fceeb5;">
                            <div style="color:#d69e2e; font-size: 10px; font-weight:bold; text-transform:uppercase; letter-spacing: 0.5px;">Pendiente por Cobrar</div>
                            <div style="font-size: 1.2rem; font-weight:bold; color:#b7791f; margin-top:8px;">RD$ ${(pendienteCobrar/1000000).toFixed(2)}M</div>
                            <div style="font-size: 11px; color: #d69e2e; margin-top:4px;">${pendienteCobrar.toLocaleString('en-US', {maximumFractionDigits:0})}</div>
                        </div>

                        <div style="text-align: center; padding: 15px 10px; background: #fff5f5; border-radius: 8px; border: 1px solid #fed7d7; position: relative;">
                            <div style="position: absolute; left: -12px; top: 35%; font-size: 18px; color: #ccc;">➖</div>
                            <div style="color:#e74a3b; font-size: 10px; font-weight:bold; text-transform:uppercase; letter-spacing: 0.5px;">3. Total Gastado</div>
                            <div style="font-size: 1.2rem; font-weight:bold; color:#e74a3b; margin-top:8px;">RD$ ${(gastoTotalCiclo/1000000).toFixed(2)}M</div>
                            <div style="font-size: 11px; color: #f56565; margin-top:4px;">${gastoTotalCiclo.toLocaleString('en-US', {maximumFractionDigits:0})}</div>
                        </div>

                        <div style="text-align: center; padding: 15px 10px; background: ${disponibilidad >= 0 ? '#e3f2fd' : '#fff5f5'}; border-radius: 8px; border: 2px solid ${disponibilidad >= 0 ? '#4e73df' : '#e74a3b'}; position: relative; box-shadow: 0 2px 4px rgba(78,115,223,0.1);">
                            <div style="position: absolute; left: -12px; top: 35%; font-size: 18px; color: #ccc;">🟰</div>
                            <div style="color:${disponibilidad >= 0 ? '#0d47a1' : '#c53030'}; font-size: 11px; font-weight:900; text-transform:uppercase; letter-spacing: 0.5px;">Caja Real Actual</div>
                            <div style="font-size: 1.3rem; font-weight:900; color:${disponibilidad >= 0 ? '#4e73df' : '#e74a3b'}; margin-top:8px;">RD$ ${(disponibilidad/1000000).toFixed(2)}M</div>
                            <div style="font-size: 12px; color: ${disponibilidad >= 0 ? '#4e73df' : '#e74a3b'}; margin-top:4px; font-weight:bold;">${disponibilidad.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits:2})}</div>
                        </div>

                    </div>
                </div>
            `;
        }

        // VISTA PRINCIPAL
        res.send(`
        <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
            <div class="container">
                ${dashboardHeader(req.session.user)}
                ${financialCardHtml} 

                <div class="module" style="margin-top: 30px;">
                    <h2 style="color:#4e73df; border-bottom: 2px solid #e3e6f0; padding-bottom: 10px;">📂 Gestión de Proyectos</h2>
                    <div class="dashboard">
                        <a href="/proyectos-por-activar" class="dashboard-card"><h3>📬 Proyectos por Activar</h3><p>Activa cotizaciones.</p></a>
                        <a href="/clientes" class="dashboard-card"><h3>🗂️ Clientes Activos</h3><p>Ver proyectos.</p></a>
                        <a href="/todos-los-centros" class="dashboard-card"><h3>🏢 Directorio Centros</h3><p>Lista colegios.</p></a>
                    </div>
                </div>

                <div class="module">
                    <h2 style="color:#f6c23e; border-bottom: 2px solid #e3e6f0; padding-bottom: 10px;">💰 Finanzas y Contabilidad</h2>
                    <div class="dashboard">
                        <a href="/caja-chica" class="dashboard-card"><h3>💵 Caja Chica</h3><p>Control efectivo.</p></a>
                        <a href="/cuentas-por-cobrar" class="dashboard-card"><h3>📊 Cuentas por Cobrar</h3><p>Abonos pendientes.</p></a>
                        <a href="/cuentas-por-pagar" class="dashboard-card"><h3>🧾 Cuentas por Pagar</h3><p>Facturas suplidores.</p></a>
                        <a href="/gastos-generales" class="dashboard-card"><h3>💸 Registrar Gasto</h3><p>Salidas generales.</p></a>
                        <a href="/reporte-gastos" class="dashboard-card"><h3>📉 Reporte de Gastos</h3><p>Resumen salidas.</p></a>
                        <a href="/suplidores" class="dashboard-card"><h3>🚚 Suplidores</h3><p>Proveedores.</p></a>
                    </div>
                </div>

                <div class="module" style="margin-bottom: 50px;">
                    <h2 style="color:#1cc88a; border-bottom: 2px solid #e3e6f0; padding-bottom: 10px;">👥 Personal y Nómina</h2>
                    <div class="dashboard">
                        <a href="/super-nomina" class="dashboard-card" style="border-top: 4px solid #1cc88a;"><h3>💰 Control Nómina</h3><p>Pagos quincenales.</p></a>
                        <a href="/historial-nomina" class="dashboard-card"><h3>📂 Historial Nómina</h3><p>Recibos anteriores.</p></a>
                        <a href="/gestionar-prestamos" class="dashboard-card" style="border-top: 4px solid #e74a3b;"><h3>🏦 Préstamos</h3><p>Adelantos.</p></a>
                        <a href="/pagar-comisiones" class="dashboard-card"><h3>💵 Pagar Comisiones</h3><p>Liquidación asesores.</p></a>
                        <a href="/gestionar-asesores" class="dashboard-card"><h3>⚖️ Config. Comisiones</h3><p>Ajustar % ganancia.</p></a>
                        <a href="/empleados" class="dashboard-card"><h3>👥 Equipo</h3><p>Datos empleados.</p></a>
                        
                        <a href="/usuarios" class="dashboard-card" style="border-left: 5px solid #6610f2; background:#f8f9fc;">
                            <h3 style="color:#6610f2;">🔑 Gestionar Accesos</h3>
                            <p>Usuarios y roles.</p>
                        </a>
                    </div>
                </div>
            </div>
        </body></html>`);
    } catch (e) { res.status(500).send("Error Dashboard: " + e.message); } finally { if (client) client.release(); }
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
    let client;
    try {
        client = await pool.connect();
        
        // 🛑 PUENTE INTOCABLE: Buscamos directamente las cotizaciones que YA activaste ('activa')
        const result = await client.query(`
            SELECT id, clientname, advisorname, quotenumber 
            FROM quotes 
            WHERE status = 'activa' 
            ORDER BY clientname ASC
        `);
        const projects = result.rows;

        // Extraer los asesores únicos para llenar el menú desplegable automáticamente
        const asesoresUnicos = [...new Set(projects.map(p => p.advisorname).filter(Boolean))].sort();
        const opcionesAsesores = asesoresUnicos.map(a => `<option value="${a}">${a}</option>`).join('');

        // Le agregamos la clase "project-row" y el "data-asesor" a cada fila para el buscador combinado
        let projectsHtml = projects.map(proj => `
            <tr class="project-row" data-asesor="${proj.advisorname || 'no asignado'}" style="transition: background 0.2s;" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='white'">
                <td style="font-weight: bold; color: #4e73df; padding: 15px; border-bottom: 1px solid #eaeaea;"># ${proj.quotenumber}</td>
                <td style="padding: 15px; border-bottom: 1px solid #eaeaea;">
                    <a href="/proyecto-detalle/${proj.id}" style="text-decoration: none; font-weight: 600; color: #2c3e50;">
                        ${proj.clientname}
                    </a>
                </td>
                <td style="padding: 15px; border-bottom: 1px solid #eaeaea;">
                    <span style="background: #e3f2fd; color: #0d47a1; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold;">${proj.advisorname || 'No asignado'}</span>
                </td>
                <td style="text-align: center; padding: 15px; border-bottom: 1px solid #eaeaea;">
                    <a href="/proyecto-detalle/${proj.id}" style="text-decoration: none; background: #f8f9fa; color: #495057; border: 1px solid #ced4da; border-radius: 4px; padding: 6px 12px; font-size: 13px; font-weight: bold; transition: 0.2s; display: inline-block;">
                        Ver Proyecto 📂
                    </a>
                </td>
            </tr>
        `).join('') || '<tr id="no-results"><td colspan="4" style="text-align: center; padding: 40px; color: #6c757d; font-size: 16px;">No hay proyectos activos.</td></tr>';

        // Renderizamos la vista unificada con el diseño de la Fase 1
        res.send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                ${commonHtmlHead}
            </head>
            <body style="background-color: #f4f6f9;">
                <div class="container" style="max-width: 1200px; margin: 0 auto; padding-top: 20px; padding-bottom: 40px;">
                    <div style="margin-bottom: 20px;">${backToDashboardLink}</div>
                    
                    <h2 style="margin-bottom: 20px; color: #2c3e50; font-size: 24px;">Proyectos y Centros Activos</h2>
                    
                    <div style="background: white; padding: 15px; border-radius: 8px; border: 1px solid #eaeaea; margin-bottom: 20px; display: flex; gap: 15px; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <div style="flex: 1; position: relative;">
                            <span style="position: absolute; left: 12px; top: 12px; color: #adb5bd;">🔍</span>
                            <input type="text" id="buscadorTexto" placeholder="Buscar por nombre de centro o ID..." style="width: 100%; padding: 10px 10px 10px 35px; border: 1px solid #ced4da; border-radius: 6px; font-size: 14px; outline: none; box-sizing: border-box; transition: border-color 0.2s;">
                        </div>
                        <div style="width: 250px; position: relative;">
                            <span style="position: absolute; left: 12px; top: 12px; color: #adb5bd;">👤</span>
                            <select id="filtroAsesor" style="width: 100%; padding: 10px 10px 10px 35px; border: 1px solid #ced4da; border-radius: 6px; font-size: 14px; outline: none; background: white; color: #495057; cursor: pointer;">
                                <option value="todos">Todos los asesores</option>
                                ${opcionesAsesores}
                            </select>
                        </div>
                    </div>

                    <div style="background: white; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden; border: 1px solid #eaeaea;">
                        
                        <div style="background: #3b82f6; color: white; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center;">
                            <h3 style="margin: 0; font-size: 18px;">Listado de Centros</h3>
                            <span style="background: white; color: #3b82f6; padding: 5px 15px; border-radius: 20px; font-size: 13px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">${projects.length} En Curso</span>
                        </div>

                        <table id="tablaCentros" style="width: 100%; border-collapse: collapse; text-align: left;">
                            <thead style="background: #f8f9fa;">
                                <tr style="border-bottom: 2px solid #dee2e6;">
                                    <th style="padding: 15px; font-size: 13px; color: #495057;">ID Cotización</th>
                                    <th style="padding: 15px; font-size: 13px; color: #495057;">Nombre del Cliente / Proyecto</th>
                                    <th style="padding: 15px; font-size: 13px; color: #495057;">Asesor</th>
                                    <th style="padding: 15px; font-size: 13px; color: #495057; text-align: center;">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${projectsHtml}
                            </tbody>
                        </table>
                    </div>
                </div>

                <script>
                    const buscadorTexto = document.getElementById('buscadorTexto');
                    const filtroAsesor = document.getElementById('filtroAsesor');

                    function aplicarFiltros() {
                        let texto = buscadorTexto.value.toLowerCase();
                        let asesorSeleccionado = filtroAsesor.value.toLowerCase();
                        let filas = document.querySelectorAll('.project-row');
                        
                        filas.forEach(function(fila) {
                            let textoFila = fila.textContent.toLowerCase();
                            let asesorFila = fila.getAttribute('data-asesor').toLowerCase();
                            
                            // Verifica si cumple con la búsqueda de texto
                            let cumpleTexto = texto === '' || textoFila.includes(texto);
                            // Verifica si cumple con el selector de asesor
                            let cumpleAsesor = asesorSeleccionado === 'todos' || asesorFila === asesorSeleccionado;
                            
                            // Solo se muestra si cumple ambas condiciones
                            if (cumpleTexto && cumpleAsesor) {
                                fila.style.display = '';
                            } else {
                                fila.style.display = 'none';
                            }
                        });
                    }

                    // Escuchar ambos eventos
                    buscadorTexto.addEventListener('keyup', aplicarFiltros);
                    filtroAsesor.addEventListener('change', aplicarFiltros);
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        console.error("Error en /clientes:", error);
        res.status(500).send('<h1>Error al obtener la lista ❌</h1>');
    } finally {
        if (client) client.release(); // Escudo de seguridad para evitar caídas del servidor
    }
});


app.get('/proyectos-por-activar', requireLogin, requireAdminOrCoord, async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        
        // SELECT SIMPLE: Intocable.
        const result = await client.query(
            `SELECT * FROM quotes 
             WHERE status = 'formalizada' 
             AND (is_discarded IS FALSE OR is_discarded IS NULL)
             ORDER BY createdat ASC`
        );
        const quotes = result.rows;

        // Extraer los asesores únicos para llenar el menú desplegable automáticamente
        const asesoresUnicos = [...new Set(quotes.map(q => q.advisorname).filter(Boolean))].sort();
        const opcionesAsesores = asesoresUnicos.map(a => `<option value="${a}">${a}</option>`).join('');

        // Agregamos data-asesor en el <tr> para que el filtro de JavaScript lo lea fácilmente
        let quotesHtml = quotes.map(quote => `
            <tr class="proyecto-row" data-asesor="${quote.advisorname || ''}" style="transition: background 0.2s;" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='white'">
                <td style="font-weight: bold; color: #4e73df;"># ${quote.quotenumber}</td>
                <td style="text-align: center;">
                    <a href="/ver-cotizacion-pdf/${quote.id}" target="_blank" style="text-decoration: none; padding: 6px 12px; font-size: 12px; background-color: #f8f9fa; color: #495057; border: 1px solid #ced4da; border-radius: 4px; font-weight: bold; transition: 0.2s;">
                        📄 Ver PDF
                    </a>
                </td>
                <td style="font-weight: 600; color: #2c3e50;">${quote.clientname}</td>
                <td><span style="background: #e3f2fd; color: #0d47a1; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold;">${quote.advisorname}</span></td>
                <td>
                    <textarea name="notas_administrativas" rows="2" placeholder="Escribe notas internas aquí..." form="form-activar-${quote.id}" style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 12px; outline: none; resize: vertical; box-sizing: border-box;"></textarea>
                </td>
                <td style="text-align: center;">
                    <div style="display: flex; gap: 8px; justify-content: center; align-items: center;">
                        <form id="form-activar-${quote.id}" action="/activar-proyecto/${quote.id}" method="POST" style="margin: 0;">
                            <button type="submit" style="background: #28a745; color: white; border: none; padding: 8px 15px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 13px; box-shadow: 0 2px 4px rgba(40,167,69,0.2);">✅ Activar</button>
                        </form>
                        
                        <form action="/descartar-cotizacion/${quote.id}" method="POST" onsubmit="return confirm('¿Seguro que deseas archivar esta cotización?');" style="margin: 0;">
                            <button type="submit" title="Archivar Proyecto" style="background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; padding: 8px 12px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 13px;">📦 Archivar</button>
                        </form>
                    </div>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #6c757d; font-size: 16px;">No hay proyectos pendientes de activación.</td></tr>';

        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head>
            <body style="background-color: #f4f6f9;">
                <div class="container" style="max-width: 1200px; margin: 0 auto; padding-top: 20px;">
                    <div style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
                        ${backToDashboardLink}
                        <a href="/proyectos-descartados" style="text-decoration: none; background-color: #6c757d; color: white; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                            📦 Ver Archivo (Descartados)
                        </a>
                    </div>
                    
                    <div style="background: white; padding: 15px; border-radius: 8px; border: 1px solid #eaeaea; margin-bottom: 20px; display: flex; gap: 15px; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <div style="flex: 1; position: relative;">
                            <span style="position: absolute; left: 12px; top: 12px; color: #adb5bd;">🔍</span>
                            <input type="text" id="buscadorTexto" placeholder="Buscar centro o ID de cotización..." style="width: 100%; padding: 10px 10px 10px 35px; border: 1px solid #ced4da; border-radius: 6px; font-size: 14px; outline: none; box-sizing: border-box; transition: border-color 0.2s;">
                        </div>
                        <div style="width: 250px; position: relative;">
                            <span style="position: absolute; left: 12px; top: 12px; color: #adb5bd;">👤</span>
                            <select id="filtroAsesor" style="width: 100%; padding: 10px 10px 10px 35px; border: 1px solid #ced4da; border-radius: 6px; font-size: 14px; outline: none; background: white; color: #495057; cursor: pointer;">
                                <option value="todos">Todos los asesores</option>
                                ${opcionesAsesores}
                            </select>
                        </div>
                    </div>

                    <div style="background: white; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden; border: 1px solid #eaeaea;">
                        
                        <div style="background: #3b82f6; color: white; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center;">
                            <h3 style="margin: 0; font-size: 18px;">Proyectos Formalizados por Activar</h3>
                            <span style="background: white; color: #3b82f6; padding: 5px 15px; border-radius: 20px; font-size: 13px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">${quotes.length} Pendientes</span>
                        </div>

                        <table style="width: 100%; border-collapse: collapse; text-align: left;">
                            <thead>
                                <tr style="background-color: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                                    <th style="padding: 15px; font-size: 13px; color: #495057;"># ID</th>
                                    <th style="padding: 15px; font-size: 13px; color: #495057; text-align: center;">Cotización</th>
                                    <th style="padding: 15px; font-size: 13px; color: #495057;">Cliente / Institución</th>
                                    <th style="padding: 15px; font-size: 13px; color: #495057;">Asesor</th>
                                    <th style="padding: 15px; font-size: 13px; color: #495057;">Notas Administrativas</th>
                                    <th style="padding: 15px; font-size: 13px; color: #495057; text-align: center;">Acciones</th>
                                </tr>
                            </thead>
                            <tbody id="tablaProyectos">
                                ${quotesHtml}
                            </tbody>
                        </table>
                    </div>
                </div>

                <script>
                    const buscadorTexto = document.getElementById('buscadorTexto');
                    const filtroAsesor = document.getElementById('filtroAsesor');

                    function aplicarFiltros() {
                        let texto = buscadorTexto.value.toLowerCase();
                        let asesorSeleccionado = filtroAsesor.value.toLowerCase();
                        let filas = document.querySelectorAll('.proyecto-row');
                        
                        filas.forEach(function(fila) {
                            let textoFila = fila.textContent.toLowerCase();
                            let asesorFila = fila.getAttribute('data-asesor').toLowerCase();
                            
                            // Verifica si cumple con la búsqueda de texto
                            let cumpleTexto = texto === '' || textoFila.includes(texto);
                            // Verifica si cumple con el selector de asesor
                            let cumpleAsesor = asesorSeleccionado === 'todos' || asesorFila === asesorSeleccionado;
                            
                            // Solo se muestra si cumple ambas condiciones
                            if (cumpleTexto && cumpleAsesor) {
                                fila.style.display = '';
                            } else {
                                fila.style.display = 'none';
                            }
                        });
                    }

                    // Escuchar ambos eventos
                    buscadorTexto.addEventListener('keyup', aplicarFiltros);
                    filtroAsesor.addEventListener('change', aplicarFiltros);
                </script>
            </body></html>`);
    } catch (error) {
        console.error("Error en /proyectos-por-activar:", error);
        res.status(500).send('<h1>Error al cargar la página ❌</h1>');
    } finally {
        if (client) client.release();
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
app.post('/cuentas-por-pagar', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { 
        supplier_id, 
        numero_factura, 
        expense_date, 
        fecha_vencimiento, 
        amount, 
        description, 
        isPaid 
    } = req.body;

    if (!supplier_id || !expense_date || !amount) {
        return res.status(400).send("Faltan datos obligatorios (Suplidor, Fecha o Monto).");
    }

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN'); // Iniciamos transacción para seguridad

        const status = (isPaid === 'true') ? 'Pagada' : 'Pendiente';
        const paid_amount = (isPaid === 'true') ? amount : 0;
        const fund_source = (isPaid === 'true') ? 'Banco' : null;

        // 1. Insertamos en la tabla de Gastos/Facturas
        const insertRes = await client.query(
            `INSERT INTO expenses (
                supplier_id, numero_factura, expense_date, fecha_vencimiento, 
                amount, paid_amount, description, status, type, fund_source
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
            [
                supplier_id, numero_factura || null, expense_date, fecha_vencimiento || null, 
                amount, paid_amount, description || '', status, 'Factura Suplidor', fund_source
            ]
        );

        // 2. NUEVO: Si es pago al contado, creamos el registro en el historial de pagos automáticamente
        if (isPaid === 'true') {
            const newExpenseId = insertRes.rows[0].id;
            await client.query(
                `INSERT INTO payment_history (expense_id, amount_paid, payment_method, fund_source, payment_date) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [newExpenseId, amount, 'Pago Contado', 'Banco', expense_date]
            );
        }

        await client.query('COMMIT');
        res.redirect('/cuentas-por-pagar');
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error("Error en Cuentas por Pagar:", error);
        res.status(500).send('<h1>Error al registrar la factura ❌</h1>');
    } finally {
        if (client) client.release();
    }
});
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
// RUTA PARA BORRAR ASESOR
app.post('/borrar-asesor/:id', requireLogin, requireAdminOrCoord, async (req, res) => {
    const advisorId = req.params.id;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Verificamos si el asesor tiene comisiones ligadas
        const checkUsage = await client.query(
            'SELECT id FROM commissions WHERE advisor_id = $1 LIMIT 1', 
            [advisorId]
        );

        if (checkUsage.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.send('<script>alert("No se puede borrar este asesor porque ya tiene comisiones registradas. Primero debes borrar sus comisiones."); window.location.href="/gestionar-asesores";</script>');
        }

        // 2. Si está limpio, procedemos a borrar
        await client.query('DELETE FROM advisors WHERE id = $1', [advisorId]);
        
        await client.query('COMMIT');
        res.redirect('/gestionar-asesores');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error al borrar asesor:", error);
        res.status(500).send('Error interno al intentar borrar el asesor.');
    } finally {
        client.release();
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
// --- RUTA CORREGIDA PARA GENERAR REQUISICIÓN DE PAGO (PCOE) ---
app.get('/cuentas-por-pagar/requisicion/:id/pdf', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { id } = req.params;
    let client;
    try {
        client = await pool.connect();
        
        // Usamos la tabla 'expenses' que es la que tú tienes realmente
        const query = `
            SELECT e.*, s.name as supplier_name 
            FROM expenses e
            JOIN suppliers s ON e.supplier_id = s.id
            WHERE e.id = $1
        `;
        const result = await client.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).send('Factura no encontrada en la base de datos.');
        }
        const factura = result.rows[0];

        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=requisicion-${factura.id}.pdf`);
        doc.pipe(res);

        // 1. Membrete
        const logoPath = path.join(__dirname, 'plantillas', 'membrete.jpg');
        if (fs.existsSync(logoPath)) {
            doc.image(logoPath, 0, 0, { width: doc.page.width, height: doc.page.height });
        }

        doc.y = 220;
        doc.font('Helvetica-Bold').fontSize(18).text('REQUISICIÓN DE PAGO', { align: 'center' });
        doc.moveDown();

        // 2. Información Técnica de la Factura
        doc.rect(50, doc.y, 500, 100).stroke();
        const startY = doc.y + 15;
        
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('SUPLIDOR:', 70, startY);
        doc.text('CONCEPTO:', 70, startY + 20);
        doc.text('FACTURA NO:', 70, startY + 40);
        doc.text('FECHA REGISTRO:', 70, startY + 60);

        doc.font('Helvetica');
        doc.text(factura.supplier_name, 170, startY);
        doc.text(factura.description || 'Sin concepto detallado', 170, startY + 20);
        doc.text(factura.numero_factura || 'N/A', 170, startY + 40);
        doc.text(new Date(factura.expense_date).toLocaleDateString(), 170, startY + 60);

        // 3. Monto a Pagar
        doc.moveDown(6);
        doc.fontSize(14).font('Helvetica-Bold').text('MONTO TOTAL A PAGAR:', { continued: true });
        doc.fontSize(18).fillColor('#e74a3b').text(` RD$ ${parseFloat(factura.amount).toLocaleString('en-US', {minimumFractionDigits: 2})}`);
        doc.fillColor('black'); // Reset color

        // 4. Firmas de Autorización
        doc.moveDown(10);
        const footerY = doc.y;
        
        doc.moveTo(50, footerY).lineTo(230, footerY).stroke();
        doc.fontSize(10).text('SOLICITADO POR', 50, footerY + 10, { width: 180, align: 'center' });

        doc.moveTo(320, footerY).lineTo(500, footerY).stroke();
        doc.text('RECIBIDO POR (ADMIN)', 320, footerY + 10, { width: 180, align: 'center' });

        doc.end();
    } catch (error) {
        console.error("Error al generar requisición:", error);
        res.status(500).send('Error al generar el documento: ' + error.message);
    } finally {
        if (client) client.release();
    }
});
// =============================================================
// 🚀 PASO 2: VISUALIZACIÓN DE CUENTAS POR PAGAR (CONSOLIDADO ACORDEÓN)
// =============================================================
app.get('/cuentas-por-pagar', requireLogin, requireAdminOrCoord, async (req, res) => {
    let client;
    try {
        client = await pool.connect();

        const safeNum = (val) => {
            const num = parseFloat(val);
            return isNaN(num) ? 0.00 : num;
        };

        const commRes = await client.query(`
            SELECT COALESCE(SUM(commission_amount), 0) as total 
            FROM commissions 
            WHERE status = 'pendiente'
        `);
        const deudaComisiones = safeNum(commRes.rows[0].total);

        const summaryRes = await client.query(`
            SELECT s.id, s.name, SUM(e.amount - COALESCE(e.paid_amount, 0)) as total_deuda
            FROM expenses e
            JOIN suppliers s ON e.supplier_id = s.id
            WHERE e.quote_id IS NULL 
            AND (e.amount - COALESCE(e.paid_amount, 0)) > 0
            GROUP BY s.id, s.name
            ORDER BY total_deuda DESC
        `);

        const invoicesRes = await client.query(`
            SELECT e.*, s.name as supplier_name 
            FROM expenses e 
            JOIN suppliers s ON e.supplier_id = s.id 
            WHERE e.quote_id IS NULL
            AND (e.amount - COALESCE(e.paid_amount, 0)) > 0
            ORDER BY e.expense_date ASC
        `);
        
        const historyRes = await client.query("SELECT * FROM payment_history ORDER BY payment_date DESC");
        const suppliersRes = await client.query("SELECT id, name FROM suppliers ORDER BY name ASC");
        
        // --- NUEVA CONSULTA: COLEGIOS ACTIVOS PARA EL SELECTOR ---
        const projectsRes = await client.query("SELECT id, clientname, quotenumber FROM quotes WHERE status = 'activa' ORDER BY clientname ASC");

        let summaryCards = `
            <div class="summary-box" style="border-top: 4px solid #e74a3b; min-width: 220px; text-align:center; padding: 15px; background: white; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                <small style="color:#e74a3b; font-weight:bold;">Comisiones Internas (Asesores)</small>
                <div style="font-weight:bold; font-size:1.2rem; margin:10px 0; color: #5a5c69;">RD$ ${deudaComisiones.toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
                <a href="/pagar-comisiones" class="btn" style="padding:4px 8px; font-size:10px; background:#ffebeb; color:#e74a3b; text-decoration:none;">Ver Detalle</a>
            </div>
        `;

        summaryCards += summaryRes.rows.map(s => `
            <div class="summary-box" style="border-top: 4px solid #4e73df; min-width: 220px; text-align:center; padding: 15px; background: white; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                <small style="color:gray;">${s.name}</small>
                <div style="font-weight:bold; font-size:1.2rem; margin:10px 0; color: #5a5c69;">RD$ ${safeNum(s.total_deuda).toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
                <a href="/reporte-suplidor-pdf/${s.id}" target="_blank" class="btn" style="padding:4px 8px; font-size:10px; background:#eef2ff; color:#4e73df; text-decoration:none;">🖨️ Estado de Cuenta PDF</a>
            </div>`).join('');

        // --- GENERACIÓN DE TABLA CONSOLIDADA (ACORDEÓN REDISEÑADO) ---
        let acordeonHtml = summaryRes.rows.map(suplidor => {
            const susFacturas = invoicesRes.rows.filter(i => i.supplier_id === suplidor.id);
            const facturasHtml = susFacturas.map(i => {
                const montoOriginal = safeNum(i.amount);
                const yaPagado = safeNum(i.paid_amount);
                const pendiente = montoOriginal - yaPagado;
                const hoy = new Date();
                const vencimiento = i.fecha_vencimiento ? new Date(i.fecha_vencimiento) : null;
                const diffDias = vencimiento ? Math.ceil((vencimiento - hoy) / (1000 * 60 * 60 * 24)) : null;

                let colorAlerta = '#6c757d'; 
                let mensajeAlerta = '';
                let bgFila = 'transparent';

                if (vencimiento) {
                    if (diffDias < 0) {
                        colorAlerta = '#e74a3b'; 
                        bgFila = '#fff5f5';
                        mensajeAlerta = `⚠️ VENCIDA (${Math.abs(diffDias)} días)`;
                    } else if (diffDias <= 3) {
                        colorAlerta = '#f6c23e'; 
                        bgFila = '#fffbe6';
                        mensajeAlerta = `⏳ Vence pronto`;
                    } else {
                        colorAlerta = '#1cc88a'; 
                        mensajeAlerta = `✅ A tiempo`;
                    }
                }

                const misAbonos = historyRes.rows.filter(h => h.expense_id === i.id);
                // Abonos ahora son texto limpio, no cajas verdes gigantes
                const abonosHtml = misAbonos.map(a => `
                    <div style="font-size:11px; color:#1cc88a; margin-top:3px; padding-left: 5px; border-left: 2px solid #1cc88a;">
                        ↘ Abonado: <b>$${safeNum(a.amount_paid).toLocaleString('en-US', {minimumFractionDigits: 2})}</b> (${a.fund_source})
                        <a href="/imprimir-abono-suplidor/${a.id}" target="_blank" style="color:#4e73df; text-decoration:none; margin-left:3px;" title="Ver Recibo">[🖨️]</a>
                    </div>`).join('');
                
                return `
                <tr style="background-color: ${bgFila}; border-bottom: 1px solid #eaeaea;">
                    <td style="border-left: 4px solid ${colorAlerta}; padding: 15px; width: 15%;">
                        <div style="font-weight:bold; color: #2c3e50; font-size: 13px;">${new Date(i.expense_date).toLocaleDateString()}</div>
                        <div style="font-size:10px; color:${colorAlerta}; font-weight:bold; margin-top:4px;">${mensajeAlerta}</div>
                    </td>
                    <td style="padding: 15px; width: 25%;">
                        ${i.numero_factura ? `<div style="font-size:12px; color:#858796; margin-bottom:3px;">Factura: <strong style="color:#4e73df;">${i.numero_factura}</strong></div>` : ''}
                        <div style="font-size:13px; color:#495057;">${i.description || '-'}</div>
                    </td>
                    <td style="padding: 15px; width: 25%;">
                        <div style="font-size:12px; color:#555; font-weight:600;">Original: $${montoOriginal.toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
                        ${abonosHtml}
                    </td>
                    <td style="text-align:right; padding: 15px; width: 15%; border-right: 1px dashed #dee2e6;">
                        <div style="font-size:10px; color:#858796; text-transform:uppercase; font-weight:bold;">Pendiente</div>
                        <div style="font-weight:bold; color:#e74a3b; font-size:1.3rem;">$${pendiente.toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
                    </td>
                    <td style="padding: 15px; width: 20%; background: #f8f9fc;">
                        <form action="/cuentas-por-pagar/abonar" method="POST" style="display:flex; flex-direction:column; gap:6px; margin:0;">
                            <input type="hidden" name="expenseId" value="${i.id}">
                            <div style="display:flex; gap:5px;">
                                <input type="number" name="paymentAmount" step="0.01" max="${pendiente.toFixed(2)}" placeholder="$ Abono" required style="width:100%; padding:8px; font-size:12px; border:1px solid #ced4da; border-radius:4px; outline:none;">
                                <select name="fundSource" style="padding:8px; font-size:12px; border:1px solid #ced4da; border-radius:4px; outline:none;">
                                    <option value="Banco">Banco</option>
                                    <option value="Caja Chica">Efectivo</option>
                                </select>
                            </div>
                            <button type="submit" style="padding:8px; background:#1cc88a; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px; transition: 0.2s;">Pagar a Factura</button>
                        </form>
                    </td>
                </tr>`;
            }).join('');

            return `
            <tr style="background-color: white; border-bottom: 2px solid #e3e6f0; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#f8f9fc'" onmouseout="this.style.background='white'" onclick="toggleFacturas('suplidor-${suplidor.id}')">
                <td style="padding: 15px;">
                    <strong style="font-size: 16px; color: #2c3e50;">🏢 ${suplidor.name}</strong>
                    <div style="font-size: 12px; color: #858796; margin-top: 4px;">📌 ${susFacturas.length} factura(s) pendiente(s)</div>
                </td>
                <td style="padding: 15px; text-align: right;">
                    <span style="font-size: 18px; font-weight: bold; color: #e74a3b;">
                        RD$ ${safeNum(suplidor.total_deuda).toLocaleString('en-US', {minimumFractionDigits: 2})}
                    </span>
                </td>
                <td style="padding: 15px; text-align: center;">
                    <button type="button" class="btn" style="background: #eaecf4; color: #4e73df; font-weight: bold; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer;">
                        Ver Facturas ⬇️
                    </button>
                </td>
            </tr>
            <tr id="suplidor-${suplidor.id}" style="display: none; background-color: #fafbfc;">
                <td colspan="3" style="padding: 0; border-bottom: 3px solid #4e73df;">
                    <table style="width: 100%; border-collapse: collapse;">
                        ${facturasHtml}
                    </table>
                </td>
            </tr>`;
        }).join('') || '<tr><td colspan="3" style="text-align:center; padding:40px; color:#888;">🙌 No hay deudas pendientes registradas.</td></tr>';
        res.send(`
    <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head>
    <body style="background-color: #f4f6f9;">
        <div class="container" style="max-width: 1350px;">
            <div style="margin-bottom: 20px;">${backToDashboardLink}</div>
            <h1 style="color: #2c3e50; margin-bottom: 25px;">Cuentas por Pagar a Suplidores</h1>

            <div style="display: flex; gap: 15px; overflow-x: auto; padding-bottom: 15px; margin-bottom: 30px;">
                ${summaryCards}
            </div>

            <div style="display: grid; grid-template-columns: 400px 1fr; gap: 30px;">
                
                <div class="form-container" style="background: white; padding: 25px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #eaeaea; height: fit-content;">
                    <h3 style="margin-top:0; color: #4e73df; font-size: 18px; border-bottom: 2px solid #f8f9fa; padding-bottom: 15px; margin-bottom: 20px;">➕ Registrar Factura a Crédito</h3>
                    
                    <form action="/nuevo-gasto-general" method="POST">
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label style="font-weight: 600; font-size: 13px; color: #495057; display:block; margin-bottom: 5px;">Suplidor:</label>
                            <select name="supplier_id" id="suplidor-cxp" required style="width:100%;">
                                <option value="">Seleccione...</option>
                                ${suppliersRes.rows.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                            </select>
                        </div>
                        
                        <div class="form-group" style="background: #f0f8ff; padding: 15px; border-radius: 8px; border: 1px dashed #6495ed; margin-bottom: 15px;">
                            <label style="font-weight: 700; font-size: 13px; color: #0056b3; display:block; margin-bottom: 5px;">🔗 Asignar a Proyecto (Opcional):</label>
                            <p style="margin: 0 0 10px 0; font-size: 11px; color: #6c757d;">Asigna esta deuda a un colegio para afectar su rentabilidad de inmediato.</p>
                            <select name="quote_id" id="proyecto-cxp" style="width:100%;">
                                <option value="">Ninguno (Gasto Administrativo)</option>
                                ${projectsRes.rows.map(p => `<option value="${p.id}">${p.clientname} (#${p.quotenumber})</option>`).join('')}
                            </select>
                        </div>

                        <div class="form-group" style="margin-bottom: 15px;">
                            <label style="font-weight: 600; font-size: 13px; color: #495057; display:block; margin-bottom: 5px;">Número de Factura:</label>
                            <input type="text" name="numero_factura" placeholder="Ej: B0100000123" style="width:100%; padding:10px; border: 1px solid #ced4da; border-radius: 6px; box-sizing:border-box;">
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                            <div class="form-group">
                                <label style="font-weight: 600; font-size: 13px; color: #495057; display:block; margin-bottom: 5px;">Fecha Factura:</label>
                                <input type="date" name="expense_date" required style="width:100%; padding:10px; border: 1px solid #ced4da; border-radius: 6px; box-sizing:border-box;">
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; font-size: 13px; color: #495057; display:block; margin-bottom: 5px;">Vencimiento:</label>
                                <input type="date" name="fecha_vencimiento" style="width:100%; padding:10px; border: 1px solid #ced4da; border-radius: 6px; box-sizing:border-box;">
                            </div>
                        </div>
                        
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label style="font-weight: 600; font-size: 13px; color: #495057; display:block; margin-bottom: 5px;">Monto Total ($):</label>
                            <input type="number" name="amount" step="0.01" required style="width:100%; padding:10px; border: 1px solid #ced4da; border-radius: 6px; box-sizing:border-box; font-weight:bold; color:#e74a3b;">
                        </div>
                        
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label style="font-weight: 600; font-size: 13px; color: #495057; display:block; margin-bottom: 5px;">Concepto / Detalle:</label>
                            <textarea name="description" rows="2" style="width:100%; padding:10px; border: 1px solid #ced4da; border-radius: 6px; box-sizing:border-box; resize:vertical; font-family:inherit;"></textarea>
                        </div>

                        <button type="submit" class="btn btn-activar" style="width:100%; padding: 12px; font-size: 15px; font-weight: bold; margin-top:10px; background:#4e73df; color:white; border:none; border-radius:6px; cursor:pointer; box-shadow: 0 4px 6px rgba(78,115,223,0.2);">💾 Guardar Deuda</button>
                    </form>
                </div>

                <div class="card" style="padding: 25px; background: white; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #eaeaea;">
                    <h3 style="margin:0; margin-bottom:20px; color: #2c3e50; font-size: 18px;">Estado de Cuentas Consolidadas</h3>
                    <div style="overflow-x: auto;">
                        <table class="modern-table" style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background: #f8f9fc; text-align: left;">
                                    <th style="padding:15px; border-bottom: 2px solid #e3e6f0; color: #6c757d; font-size:12px; text-transform:uppercase;">Suplidor / Empresa</th>
                                    <th style="padding:15px; text-align:right; border-bottom: 2px solid #e3e6f0; color: #6c757d; font-size:12px; text-transform:uppercase;">Deuda Total Acumulada</th>
                                    <th style="padding:15px; text-align:center; border-bottom: 2px solid #e3e6f0; color: #6c757d; font-size:12px; text-transform:uppercase;">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${acordeonHtml}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <link href="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css" rel="stylesheet" />
        <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js"></script>
        <style>
            .select2-container .select2-selection--single { height: 40px !important; border: 1px solid #ced4da !important; border-radius: 6px !important; display: flex; align-items: center; }
            .select2-container--default .select2-selection--single .select2-selection__arrow { height: 38px !important; }
            .select2-container--default .select2-selection--single .select2-selection__rendered { color: #495057; font-family: inherit; font-size: 13px; }
        </style>

        <script>
            // ACTIVAR BUSCADORES INTELIGENTES
            $(document).ready(function() {
                $('#suplidor-cxp').select2({ placeholder: "🔍 Buscar suplidor...", width: '100%' });
                $('#proyecto-cxp').select2({ placeholder: "🔍 Buscar colegio...", width: '100%' });
            });

            // ACORDEÓN DE FACTURAS
            function toggleFacturas(idFilas) {
                const elemento = document.getElementById(idFilas);
                if (elemento.style.display === "none") {
                    elemento.style.display = "table-row";
                } else {
                    elemento.style.display = "none";
                }
            }
        </script>
    </body></html>`
        );
    } catch (e) {
        console.error("Error Cuentas x Pagar:", e);
        res.status(500).send("Error: " + e.message);
    } finally {
        if (client) client.release();
    }
});

// 1. RUTA PARA CREAR LA DEUDA (CON SOPORTE PARA ASIGNAR PROYECTO)
app.post('/nuevo-gasto-general', requireLogin, requireAdminOrCoord, async (req, res) => {
    // Recibimos los datos del formulario, incluyendo el nuevo quote_id
    const { supplier_id, numero_factura, expense_date, fecha_vencimiento, amount, description, quote_id } = req.body;
    
    // Si se seleccionó un proyecto, usamos su ID; de lo contrario, se guarda como NULL (Deuda pura de la empresa)
    const proyectoAsignado = quote_id ? quote_id : null;
    const montoLimpio = parseFloat(amount) || 0;

    let client;
    try {
        client = await pool.connect();
        
        // INSERTAMOS EN LA TABLA 'EXPENSES'
        // Cambiamos el NULL fijo al final por la variable $7 (proyectoAsignado)
        await client.query(`
            INSERT INTO expenses 
            (supplier_id, numero_factura, expense_date, fecha_vencimiento, amount, paid_amount, description, createdat, quote_id)
            VALUES ($1, $2, $3, $4, $5, 0, $6, NOW(), $7)
        `, [supplier_id, numero_factura, expense_date, fecha_vencimiento, montoLimpio, description, proyectoAsignado]);

        // Éxito: volvemos a la lista
        res.redirect('/cuentas-por-pagar');

    } catch (e) {
        console.error("Error al guardar cuenta por pagar:", e);
        res.send(`
            <div style="font-family:sans-serif; padding:20px; text-align:center;">
                <h3 style="color:#e74a3b;">⚠️ Error Técnico</h3>
                <p>${e.message}</p>
                <a href="/cuentas-por-pagar">Volver a intentar</a>
            </div>
        `);
    } finally {
        if (client) client.release();
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
//   RUTAS PARA GASTOS GENERALES / DESEMBOLSOS
// =======================================================

// --- 1. PÁGINA PARA VER Y AÑADIR GASTOS GENERALES (CON BUSCADORES INTELIGENTES) ---
app.get('/gastos-generales', requireLogin, requireAdminOrCoord, async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        
        const [suppliersResult, expensesResult, projectsResult] = await Promise.all([
            client.query('SELECT * FROM suppliers ORDER BY name ASC'),
            client.query(`
                SELECT e.*, s.name as supplier_name 
                FROM expenses e 
                JOIN suppliers s ON e.supplier_id = s.id 
                WHERE e.quote_id IS NULL 
                ORDER BY e.expense_date DESC
            `),
            client.query(`SELECT id, clientname, quotenumber FROM quotes WHERE status = 'activa' ORDER BY clientname ASC`)
        ]);

        const suppliers = suppliersResult.rows;
        const expenses = expensesResult.rows;
        const projects = projectsResult.rows;

        let suppliersOptionsHtml = suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        let projectsOptionsHtml = projects.map(p => `<option value="${p.id}">${p.clientname} (#${p.quotenumber})</option>`).join('');
      
        let expensesHtml = expenses.map(e => {
            const montoLimpio = isNaN(parseFloat(e.amount)) ? 0 : parseFloat(e.amount);
            const badgeColor = e.type === 'Con Valor Fiscal' ? 'background: #e3f2fd; color: #0d47a1;' : 'background: #f8f9fa; color: #6c757d; border: 1px solid #dee2e6;';
            
            return `
                <tr style="transition: background 0.2s;" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='white'">
                    <td style="padding: 15px; border-bottom: 1px solid #eaeaea; color: #495057;">${new Date(e.expense_date).toLocaleDateString()}</td>
                    <td style="padding: 15px; border-bottom: 1px solid #eaeaea; font-weight: 600; color: #2c3e50;">${e.supplier_name}</td>
                    <td style="padding: 15px; border-bottom: 1px solid #eaeaea; color: #495057;">${e.description}</td>
                    <td style="padding: 15px; border-bottom: 1px solid #eaeaea;"><span style="font-size: 11px; padding: 4px 8px; border-radius: 4px; font-weight: bold; ${badgeColor}">${e.type || 'N/A'}</span></td>
                    <td style="padding: 15px; border-bottom: 1px solid #eaeaea; font-weight: bold; color: #e74a3b;">$${montoLimpio.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    <td style="padding: 15px; border-bottom: 1px solid #eaeaea; text-align: center;">
                        <a href="/desembolso/${e.id}/pdf" target="_blank" style="background-color: #5a5c69; color: white; padding: 6px 12px; font-size: 12px; font-weight: bold; text-decoration: none; border-radius: 4px; display: inline-block; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">📄 Imprimir</a>
                    </td>
                </tr>`;
        }).join('') || '<tr><td colspan="6" style="text-align: center; padding: 30px; color: #6c757d; font-size: 15px;">No hay gastos generales registrados.</td></tr>';

        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head>
            <body style="background-color: #f4f6f9;">
                <div class="container" style="max-width: 1050px; padding-bottom: 50px; padding-top: 20px;">
                    <div style="margin-bottom: 20px;">${backToDashboardLink}</div>
                    
                    <h2 style="color: #2c3e50; margin-bottom: 25px; font-size: 24px;">Gastos Generales y Administrativos</h2>
                    
                    <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #eaeaea; margin-bottom: 40px;">
                        <h3 style="margin-top: 0; color: #4e73df; font-size: 18px; border-bottom: 2px solid #f8f9fa; padding-bottom: 15px; margin-bottom: 25px;">💵 Registrar Nuevo Desembolso</h3>
                        
                        <form action="/gastos-generales" method="POST">
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                                
                                <div style="display: flex; flex-direction: column;">
                                    <label style="font-weight: 600; font-size: 13px; margin-bottom: 8px; color: #495057;">Fecha del Gasto:</label>
                                    <input type="date" name="expense_date" required style="padding: 12px; border: 1px solid #ced4da; border-radius: 6px; outline: none; font-family: inherit;">
                                </div>
                                
                                <div style="display: flex; flex-direction: column;">
                                    <label style="font-weight: 600; font-size: 13px; margin-bottom: 8px; color: #495057;">Suplidor:</label>
                                    <select name="supplier_id" id="suplidor-select" required style="width: 100%;">
                                        <option value="">Seleccione un suplidor...</option>
                                        ${suppliersOptionsHtml}
                                    </select>
                                </div>
                                
                                <div style="grid-column: span 2; background: #f0f8ff; padding: 20px; border-radius: 8px; border: 1px dashed #6495ed;">
                                    <label style="font-weight: 700; font-size: 14px; margin-bottom: 5px; color: #0056b3; display: block;">🔗 Asignar a Proyecto (Opcional):</label>
                                    <p style="margin: 0 0 12px 0; font-size: 12px; color: #6c757d;">Si seleccionas un colegio, este gasto afectará directamente su rentabilidad y no aparecerá en el historial de abajo.</p>
                                    <select name="quote_id" id="proyecto-select" style="width: 100%;">
                                        <option value="">Ninguno (Dejar como Gasto Administrativo General)</option>
                                        ${projectsOptionsHtml}
                                    </select>
                                </div>

                                <div style="display: flex; flex-direction: column;">
                                    <label style="font-weight: 600; font-size: 13px; margin-bottom: 8px; color: #495057;">Monto ($):</label>
                                    <input type="number" name="amount" step="0.01" required style="padding: 12px; border: 1px solid #ced4da; border-radius: 6px; outline: none; font-family: inherit;" placeholder="Ej: 1500.00">
                                </div>
                                
                                <div style="display: flex; flex-direction: column;">
                                    <label style="font-weight: 600; font-size: 13px; margin-bottom: 8px; color: #495057;">Tipo de Comprobante:</label>
                                    <select name="type" style="padding: 12px; border: 1px solid #ced4da; border-radius: 6px; outline: none; font-family: inherit; background: white;">
                                        <option value="Sin Valor Fiscal">Sin Valor Fiscal</option>
                                        <option value="Con Valor Fiscal">Con Valor Fiscal</option>
                                    </select>
                                </div>
                                
                                <div style="grid-column: span 2; display: flex; flex-direction: column;">
                                    <label style="font-weight: 600; font-size: 13px; margin-bottom: 8px; color: #495057;">Descripción / Concepto:</label>
                                    <textarea name="description" rows="2" required style="padding: 12px; border: 1px solid #ced4da; border-radius: 6px; outline: none; font-family: inherit; resize: vertical;" placeholder="Detalla el motivo del gasto..."></textarea>
                                </div>
                            </div>
                            
                            <div style="margin-top: 25px; text-align: right;">
                                <button type="submit" style="background-color: #28a745; color: white; padding: 12px 35px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 15px; box-shadow: 0 4px 6px rgba(40,167,69,0.2); transition: 0.2s;">✅ Guardar Gasto</button>
                            </div>
                        </form>
                    </div>
                    
                    <h3 style="color: #2c3e50; margin-bottom: 15px; font-size: 18px;">Historial de Gastos Generales</h3>
                    <div style="background: white; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden; border: 1px solid #eaeaea;">
                        <table style="width: 100%; border-collapse: collapse; text-align: left;">
                            <thead style="background-color: #f8f9fa;">
                                <tr style="border-bottom: 2px solid #dee2e6;">
                                    <th style="padding: 15px; font-size: 12px; text-transform: uppercase; color: #6c757d;">Fecha</th>
                                    <th style="padding: 15px; font-size: 12px; text-transform: uppercase; color: #6c757d;">Suplidor</th>
                                    <th style="padding: 15px; font-size: 12px; text-transform: uppercase; color: #6c757d;">Descripción</th>
                                    <th style="padding: 15px; font-size: 12px; text-transform: uppercase; color: #6c757d;">Tipo</th>
                                    <th style="padding: 15px; font-size: 12px; text-transform: uppercase; color: #6c757d;">Monto</th>
                                    <th style="padding: 15px; font-size: 12px; text-transform: uppercase; color: #6c757d; text-align: center;">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>${expensesHtml}</tbody>
                        </table>
                    </div>
                </div>

                <link href="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css" rel="stylesheet" />
                <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
                <script src="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js"></script>
                <style>
                    /* Ajustes visuales para que el buscador coincida con tu diseño moderno */
                    .select2-container .select2-selection--single {
                        height: 44px !important;
                        border: 1px solid #ced4da !important;
                        border-radius: 6px !important;
                        display: flex;
                        align-items: center;
                    }
                    .select2-container--default .select2-selection--single .select2-selection__arrow {
                        height: 42px !important;
                    }
                    .select2-container--default .select2-selection--single .select2-selection__rendered {
                        color: #495057;
                        font-family: inherit;
                        font-size: 14px;
                    }
                </style>
                <script>
                    $(document).ready(function() {
                        $('#suplidor-select').select2({
                            placeholder: "🔍 Escribe para buscar un suplidor...",
                            width: '100%'
                        });
                        $('#proyecto-select').select2({
                            placeholder: "🔍 Escribe para buscar un colegio...",
                            width: '100%'
                        });
                    });
                </script>
            </body></html>
        `);
    } catch (error) {
        console.error("Error al cargar la página de gastos generales:", error);
        res.status(500).send('<h1>Error al cargar la página ❌</h1>');
    } finally {
        if (client) client.release();
    }
});


// --- 2. RUTA PARA GUARDAR EL GASTO ---
app.post('/gastos-generales', requireLogin, requireAdminOrCoord, async (req, res) => {
    // Agregamos quote_id a lo que recibimos del formulario
    const { expense_date, supplier_id, amount, description, type, quote_id } = req.body;
    
    // Validaciones
    if (!expense_date || !supplier_id || !amount || !description) {
        return res.status(400).send("La fecha, suplidor, monto y descripción son obligatorios.");
    }

    // Transformamos el quote_id. Si está vacío, es null (Gasto general). Si tiene algo, va al colegio.
    const proyectoAsignado = quote_id ? quote_id : null;

    let client;
    try {
        client = await pool.connect();
        
        // Reemplazamos el NULL fijo por nuestra variable proyectoAsignado ($6)
        await client.query(
            `INSERT INTO expenses (expense_date, supplier_id, amount, description, type, quote_id, status, paid_amount) 
             VALUES ($1, $2, $3, $4, $5, $6, 'Pagada', $3)`,
            [expense_date, supplier_id, amount, description, type, proyectoAsignado]
        );
        
        res.redirect('/gastos-generales');

    } catch (error) {
        console.error("Error al guardar el gasto general:", error);
        res.status(500).send('<h1>Error al guardar el gasto ❌</h1>');
    } finally {
        if (client) client.release(); 
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

               <div style="text-align: center; margin: 30px 0; background: #fff5f5; padding: 25px; border-radius: 15px; border: 2px dashed #e74a3b;">
    <p style="color: #c0392b; font-size: 14px; margin-bottom: 15px;">
        <b>⚠️ ATENCIÓN COORDINADORA:</b> Presiona este botón solo si ya revisaste los gastos y deseas archivar este ciclo para iniciar uno nuevo en cero.
    </p>
    <form action="/caja-chica/cerrar-ciclo" method="POST" onsubmit="return confirm('¿Estás segura de que deseas CERRAR el ciclo actual y archivar los gastos?')">
        <input type="hidden" name="cycleId" value="${cycle.id}">
        <button type="submit" class="btn" style="background: #e74a3b; color: white; padding: 18px 40px; border-radius: 10px; font-weight: bold; border: none; cursor: pointer; font-size: 16px; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
            🔒 CERRAR AUDITORÍA Y REINICIAR CAJA
        </button>
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
app.post('/caja-chica/cerrar-ciclo', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { cycleId } = req.body;
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // 1. ACTUALIZAR EL ESTADO DEL CICLO USANDO EL NOMBRE CORRECTO DE LA TABLA
        await client.query(
            "UPDATE caja_chica_ciclos SET estado = 'cerrado', fecha_cierre = CURRENT_TIMESTAMP WHERE id = $1", 
            [cycleId]
        );

        // 2. REGISTRAR EL REPOSICIÓN (Opcional: Si manejas una tabla de movimientos)
        // Puedes agregar aquí un insert si necesitas dejar rastro de quién cerró.

        await client.query('COMMIT');
        
        // CAMBIA ESTO: En lugar de res.json, enviamos un pequeño script de éxito
        res.send(`
            <script>
                alert("✅ ¡Ciclo cerrado con éxito! La auditoría ha sido archivada.");
                window.location.href = "/caja-chica";
            </script>
        `);

    } catch (e) {
        if (client) await client.query('ROLLBACK');
        console.error("Error al cerrar caja:", e.message);
        res.status(500).send("Error: " + e.message);
    } finally {
        if (client) client.release();
    }
});

app.post('/caja-chica/nuevo-gasto', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { cycleId, expense_date, supplier_id, amount, description } = req.body;
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // 1. Obtener fondo y gastos (Añadimos validación de existencia)
        const cycleRes = await client.query("SELECT fondo_inicial FROM caja_chica_ciclos WHERE id = $1", [cycleId]);
        
        if (cycleRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).send("Error: El ciclo de caja chica no existe.");
        }

        const expensesRes = await client.query("SELECT SUM(amount) as total FROM expenses WHERE caja_chica_ciclo_id = $1", [cycleId]);
        
        const fondoInicial = parseFloat(cycleRes.rows[0].fondo_inicial || 0);
        const totalGastado = parseFloat(expensesRes.rows[0].total || 0);
        const montoNuevoGasto = parseFloat(amount || 0);
        const balanceDisponible = fondoInicial - totalGastado;

        // 2. EL ESCUDO: ¿Hay dinero suficiente?
        if (montoNuevoGasto > balanceDisponible) {
            await client.query('ROLLBACK');
            // Usamos un script de alerta para no sacar al usuario de su pantalla
            return res.send(`
                <script>
                    alert('⚠️ FONDOS INSUFICIENTES\\n\\nDisponible: RD$ ${balanceDisponible.toLocaleString('en-US', {minimumFractionDigits:2})}\\nIntento de gasto: RD$ ${montoNuevoGasto.toLocaleString('en-US', {minimumFractionDigits:2})}\\n\\nPor favor, solicita una reposición.');
                    window.history.back();
                </script>
            `);
        }

        // 3. Registro con vinculación total al sistema de reportes
        await client.query(
            `INSERT INTO expenses (
                caja_chica_ciclo_id, 
                expense_date, 
                supplier_id, 
                amount, 
                paid_amount, 
                description, 
                type, 
                status, 
                fund_source
            ) VALUES ($1, $2, $3, $4, $4, $5, 'Caja Chica', 'Pagada', 'Caja Chica')`,
            [cycleId, expense_date, supplier_id, montoNuevoGasto, description]
        );

        await client.query('COMMIT');
        res.redirect('/caja-chica');

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error("Error en Escudo Caja Chica:", error);
        res.status(500).send("Error crítico al registrar el gasto.");
    } finally {
        if (client) client.release();
    }
});// --- RUTA PARA GENERAR EL REPORTE PDF DEL CIERRE (CORREGIDA) ---
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

        // ==========================================
        // 🟢 NUEVA LÓGICA DE CÁLCULO AUTOMÁTICO
        // ==========================================
        let sumaGastos = 0;
        expenses.forEach(e => {
            sumaGastos += parseFloat(e.amount || 0);
        });

        const fondoInicial = parseFloat(cycle.fondo_inicial || 0);
        const balanceFinal = fondoInicial - sumaGastos;
        // ==========================================

        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=reporte-caja-chica-${cycle.id}.pdf`);
        doc.pipe(res);
        
        // Membrete
        if (fs.existsSync(path.join(__dirname, 'plantillas', 'membrete.jpg'))) {
            doc.image(path.join(__dirname, 'plantillas', 'membrete.jpg'), 0, 0, { width: doc.page.width, height: doc.page.height });
        }
        
        doc.y = 250;
        doc.font('Helvetica-Bold').fontSize(18).text('REPORTE DE CIERRE DE CAJA CHICA', { align: 'center' });
        doc.moveDown(2);

        doc.font('Helvetica').fontSize(11);
        doc.text(`Período del ${new Date(cycle.fecha_inicio).toLocaleDateString()} al ${new Date(cycle.fecha_cierre).toLocaleDateString()}`);
        doc.moveDown(2);

        // USAMOS LAS VARIABLES CALCULADAS ARRIBA
        doc.font('Helvetica-Bold').text('FONDO INICIAL:', { continued: true }).font('Helvetica').text(` RD$ ${fondoInicial.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
        doc.font('Helvetica-Bold').text('TOTAL GASTADO:', { continued: true }).font('Helvetica').text(` RD$ ${sumaGastos.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
        doc.font('Helvetica-Bold').text('BALANCE FINAL:', { continued: true }).font('Helvetica').text(` RD$ ${balanceFinal.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
        doc.moveDown(2);

        doc.font('Helvetica-Bold').fontSize(14).text('Detalle de Gastos');
        doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
        doc.moveDown();

        expenses.forEach(e => {
            doc.font('Helvetica').fontSize(10);
            const fecha = new Date(e.expense_date).toLocaleDateString();
            const monto = parseFloat(e.amount || 0).toLocaleString('en-US', {minimumFractionDigits: 2});
            
            doc.text(`${fecha} - ${e.supplier_name} - ${e.description}`, { continued: true, width: 450 });
            doc.text(`RD$ ${monto}`, { align: 'right' });
            doc.moveDown(0.5);
        });

        doc.end();
    } catch (error) {
        console.error("Error al generar el reporte de caja chica:", error);
        res.status(500).send('<h1>Error al generar el reporte ❌</h1>');
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
    const { advisor } = req.query; 
    let client;
    try {
        client = await pool.connect();
        const advisorsRes = await client.query("SELECT DISTINCT advisorname FROM quotes WHERE status = 'activa' ORDER BY advisorname");

        // 1. CONSULTA SQL (Igual que antes, pero asegurando COALESCE)
        let query = `
            SELECT 
                q.id, q.clientname, q.quotenumber, q.advisorname,
                (COALESCE(q.preciofinalporestudiante * q.estudiantesparafacturar, 0) + 
                 COALESCE((SELECT SUM(monto_ajuste) FROM ajustes_cotizacion WHERE quote_id = q.id), 0)) as venta_total,
                COALESCE((SELECT SUM(amount) FROM payments WHERE quote_id = q.id), 0) as total_cobrado,
                COALESCE((SELECT SUM(amount) FROM expenses WHERE quote_id = q.id), 0) as total_gastado,
                (SELECT MAX(payment_date) FROM payments WHERE quote_id = q.id) as ultimo_pago
            FROM quotes q
            WHERE q.status = 'activa' 
              AND q.createdat >= '2025-08-01'
        `;

        const params = [];
        if (advisor) {
            params.push(advisor);
            query += ` AND q.advisorname = $1`;
        }
        query += ` ORDER BY ultimo_pago ASC NULLS FIRST`;

        const result = await client.query(query, params);
        
        // 2. ESCUDO ANTI-NAN
        const safeNum = (val) => {
            const n = parseFloat(val);
            return isNaN(n) ? 0 : n;
        };

        let globalVenta = 0, globalCobrado = 0, globalGastado = 0;
        const hoy = new Date();
        const proyectosConDeuda = [];
        const proyectosSaldados = [];

        result.rows.forEach(p => {
            const venta = safeNum(p.venta_total);
            const cobrado = safeNum(p.total_cobrado);
            const gastado = safeNum(p.total_gastado);
            const deuda = venta - cobrado;

            // Acumuladores Globales
            globalVenta += venta;
            globalCobrado += cobrado;
            globalGastado += gastado;

            // Cálculo de Inactividad
            let diasInactivo = 0;
            let estadoInactividad = 'ok'; // ok, warning, danger, new

            if (p.ultimo_pago) {
                const ultPago = new Date(p.ultimo_pago);
                diasInactivo = Math.floor((hoy - ultPago) / (1000 * 60 * 60 * 24));
                
                if (diasInactivo > 45) estadoInactividad = 'danger'; // Rojo si pasaron 45 días
                else if (diasInactivo > 30) estadoInactividad = 'warning'; // Amarillo
            } else {
                estadoInactividad = 'new'; // Nunca ha pagado
            }

            const item = { ...p, venta, cobrado, deuda, diasInactivo, estadoInactividad };

            if (deuda > 1.00) { proyectosConDeuda.push(item); } 
            else { proyectosSaldados.push(item); }
        });

        // 3. GENERADOR DE FILAS CON ESTADO MEJORADO
        const generarFilas = (lista) => lista.map(p => {
            let badgeHtml = '';
            
            // Lógica visual de inactividad
            if (p.estadoInactividad === 'new') {
                badgeHtml = `<span style="background:#eef2ff; color:#4e73df; padding:4px 8px; border-radius:12px; font-size:10px; font-weight:bold;">🆕 Sin Pagos</span>`;
            } else if (p.estadoInactividad === 'danger') {
                badgeHtml = `<span style="background:#ffebeb; color:#e74a3b; padding:4px 8px; border-radius:12px; font-size:10px; font-weight:bold;">⚠️ ${p.diasInactivo} días</span>`;
            } else if (p.estadoInactividad === 'warning') {
                badgeHtml = `<span style="background:#fff3cd; color:#856404; padding:4px 8px; border-radius:12px; font-size:10px; font-weight:bold;">⏳ ${p.diasInactivo} días</span>`;
            } else {
                badgeHtml = `<span style="background:#e6fffa; color:#2c7a7b; padding:4px 8px; border-radius:12px; font-size:10px; font-weight:bold;">🟢 Al día (${p.diasInactivo}d)</span>`;
            }

            return `
                <tr>
                    <td><b>${p.clientname}</b><br><small style="color:#858796;">${p.quotenumber} | ${p.advisorname}</small></td>
                    <td style="text-align:right;">RD$ ${p.venta.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                    <td style="text-align:right; color:#1cc88a;">RD$ ${p.cobrado.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                    <td style="text-align:right; color:${p.deuda > 0 ? '#e74a3b' : '#1cc88a'}; font-weight:bold;">RD$ ${p.deuda.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    <td style="text-align:center;">${badgeHtml}</td>
                    <td style="text-align:center;"><a href="/proyecto-detalle/${p.id}" class="btn" style="padding:5px 10px; font-size:11px; background:#4e73df; color:white; border-radius:4px; text-decoration:none;">🔍 Ver</a></td>
                </tr>`;
        }).join('');

        // CÁLCULO DE LA TEMPERATURA REAL (Flujo de Caja)
        const flujoDeCaja = globalCobrado - globalGastado;
        const colorFlujo = flujoDeCaja >= 0 ? '#1cc88a' : '#e74a3b'; // Verde si hay dinero, Rojo si estamos en déficit

        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}
                <style>
                    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-bottom: 25px; }
                    .stat-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border-left: 5px solid #4e73df; }
                    .stat-title { font-size: 0.8rem; font-weight: bold; text-transform: uppercase; margin-bottom: 5px; }
                    .stat-value { font-size: 1.5rem; font-weight: bold; color: #5a5c69; }
                    .section-header { background: #f8f9fc; padding: 12px; margin: 30px 0 10px 0; border-radius: 5px; border-left: 5px solid #e74a3b; color: #5a5c69; font-weight: bold; }
                </style>
            </head><body>
                <div class="container" style="max-width:1400px;">
                    ${backToDashboardLink}
                    <h2 style="margin-top:20px; margin-bottom: 20px;">Reporte de Cobros y Flujo (2025-2026)</h2>

                    <div class="stat-grid">
                        <div class="stat-card">
                            <div class="stat-title" style="color:#4e73df;">Venta Total Contratada</div>
                            <div class="stat-value">RD$ ${globalVenta.toLocaleString('en-US', {maximumFractionDigits: 0})}</div>
                        </div>
                        <div class="stat-card" style="border-left-color:#1cc88a;">
                            <div class="stat-title" style="color:#1cc88a;">Total Cobrado (Entradas)</div>
                            <div class="stat-value">RD$ ${globalCobrado.toLocaleString('en-US', {maximumFractionDigits: 0})}</div>
                        </div>
                        <div class="stat-card" style="border-left-color:#f6c23e;">
                            <div class="stat-title" style="color:#f6c23e;">Total Gastado (Salidas)</div>
                            <div class="stat-value">RD$ ${globalGastado.toLocaleString('en-US', {maximumFractionDigits: 0})}</div>
                        </div>
                        <div class="stat-card" style="border-left-color:${colorFlujo}; background: ${flujoDeCaja < 0 ? '#fff5f5' : 'white'};">
                            <div class="stat-title" style="color:${colorFlujo};">Disponibilidad Real (Caja)</div>
                            <div class="stat-value" style="color:${colorFlujo};">RD$ ${flujoDeCaja.toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
                            <small style="color:gray; font-size:10px;">(Cobrado - Gastado)</small>
                        </div>
                    </div>

                    <div style="margin-bottom:20px; background:white; padding:15px; border-radius:8px; display:inline-flex; align-items:center; gap:20px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); width: 100%; justify-content: space-between; box-sizing: border-box;">
                        <form action="/cuentas-por-cobrar" method="GET" style="display:inline-flex; align-items:center; gap:10px; margin: 0;">
                            <label style="font-weight:bold; color:#5a5c69;">Filtrar por Asesor:</label>
                            <select name="advisor" onchange="this.form.submit()" style="padding:8px; border:1px solid #ddd; border-radius:4px; outline: none; cursor:pointer;">
                                <option value="">-- Ver Todos --</option>
                                ${advisorsRes.rows.map(a => `<option value="${a.advisorname}" ${advisor === a.advisorname ? 'selected' : ''}>${a.advisorname}</option>`).join('')}
                            </select>
                        </form>

                        <a href="/imprimir-cuentas-cobrar${advisor ? '?advisor=' + encodeURIComponent(advisor) : ''}" target="_blank" class="btn" style="background-color: #e74a3b; color: white; padding: 10px 20px; font-weight: bold; border-radius: 6px; text-decoration: none; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 4px rgba(231,74,59,0.2); transition: 0.2s;">
                            🖨️ Imprimir Reporte de Cobros
                        </a>
                    </div>

                    <div class="section-header">⚠️ CUENTAS CON DEUDA PENDIENTE</div>
                    <table class="modern-table">
                        <thead><tr><th>Proyecto / Asesor</th><th style="text-align:right;">Venta</th><th style="text-align:right;">Cobrado</th><th style="text-align:right;">Pendiente</th><th style="text-align:center;">Estado Pagos</th><th style="text-align:center;">Acción</th></tr></thead>
                        <tbody>${generarFilas(proyectosConDeuda) || '<tr><td colspan="6" style="text-align:center; padding:20px;">🎉 ¡Excelente! No hay cuentas pendientes.</td></tr>'}</tbody>
                    </table>

                    <div class="section-header" style="border-left-color:#1cc88a; margin-top:50px; opacity:0.8;">✅ PROYECTOS SALDADOS (HISTÓRICO)</div>
                    <table class="modern-table" style="opacity:0.8;">
                        <thead><tr><th>Proyecto / Asesor</th><th style="text-align:right;">Venta</th><th style="text-align:right;">Cobrado</th><th style="text-align:right;">Balance</th><th style="text-align:center;">Estado Pagos</th><th style="text-align:center;">Acción</th></tr></thead>
                        <tbody>${generarFilas(proyectosSaldados) || '<tr><td colspan="6" style="text-align:center;">No hay proyectos saldados aún.</td></tr>'}</tbody>
                    </table>
                </div>
            </body></html>`);
    } catch (e) { res.status(500).send("Error: " + e.message); } finally { if (client) client.release(); }
});

// =============================================================
// 🖨️ RUTA PARA IMPRIMIR REPORTE DE CUENTAS POR COBRAR (PDF)
// =============================================================
app.get('/imprimir-cuentas-cobrar', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { advisor } = req.query;
    let client;
    try {
        client = await pool.connect();
        
        // Misma consulta segura que en la pantalla web
        let query = `
            SELECT 
                q.clientname, q.quotenumber, q.advisorname,
                (COALESCE(q.preciofinalporestudiante * q.estudiantesparafacturar, 0) + 
                 COALESCE((SELECT SUM(monto_ajuste) FROM ajustes_cotizacion WHERE quote_id = q.id), 0)) as venta,
                COALESCE((SELECT SUM(amount) FROM payments WHERE quote_id = q.id), 0) as cobrado,
                (SELECT MAX(payment_date) FROM payments WHERE quote_id = q.id) as ultimo_pago
            FROM quotes q
            WHERE q.status = 'activa' AND q.createdat >= '2025-08-01'
        `;
        
        const params = [];
        if (advisor) {
            params.push(advisor);
            query += ` AND q.advisorname = $1`;
        }
        query += ` ORDER BY ultimo_pago ASC NULLS FIRST`;

        const result = await client.query(query, params);

        const safeNum = (val) => { const n = parseFloat(val); return isNaN(n) ? 0 : n; };
        const formatMoney = (val) => 'RD$ ' + parseFloat(val).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits:2});

        const hoy = new Date();
        const proyectos = [];
        let totalDeudaGeneral = 0;

        result.rows.forEach(p => {
            const v = safeNum(p.venta);
            const c = safeNum(p.cobrado);
            const deuda = v - c;
            
            if (deuda > 1.00) { // Solo imprimimos los que deben dinero
                let diasInactivo = 0;
                let msjActividad = 'Sin Pagos';
                if (p.ultimo_pago) {
                    diasInactivo = Math.floor((hoy - new Date(p.ultimo_pago)) / (1000 * 60 * 60 * 24));
                    msjActividad = `Hace ${diasInactivo} días`;
                }
                
                proyectos.push({ ...p, deuda, msjActividad, diasInactivo });
                totalDeudaGeneral += deuda;
            }
        });

        // Configuración del PDF
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Reporte_Cobros_${advisor ? advisor.replace(/\s+/g, '_') : 'General'}.pdf"`);
        doc.pipe(res);

        // ENCABEZADO
        doc.rect(0, 0, 600, 110).fill('#2c3e50'); // Fondo azul corporativo
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20).text('REPORTE DE CUENTAS POR COBRAR', 40, 35);
        doc.fontSize(12).font('Helvetica').text(`Filtro: ${advisor || 'TODOS LOS ASESORES'}`, 40, 65);
        doc.fontSize(10).text(`Fecha de emisión: ${new Date().toLocaleString('es-DO')}`, 40, 80);

        // CAJA DE TOTAL GENERAL
        doc.rect(380, 25, 170, 60).fill('#e74a3b'); 
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10).text('DEUDA TOTAL PENDIENTE', 380, 40, { width: 170, align: 'center' });
        doc.fontSize(14).text(formatMoney(totalDeudaGeneral), 380, 55, { width: 170, align: 'center' });

        doc.moveDown(4);

        // TABLA DE COLEGIOS
        doc.rect(40, doc.y, 515, 20).fill('#f8f9fc');
        let startY = doc.y + 6;
        doc.fillColor('#6c757d').font('Helvetica-Bold').fontSize(9);
        doc.text('COLEGIO / PROYECTO', 50, startY, { width: 180 });
        if(!advisor) doc.text('ASESOR', 240, startY, { width: 90 }); // Solo mostramos columna asesor si no hay filtro
        doc.text('ÚLTIMO PAGO', !advisor ? 330 : 260, startY, { width: 80 });
        doc.text('DEUDA ACTUAL', 450, startY, { width: 95, align: 'right' });
        doc.y += 15;

        doc.font('Helvetica').fontSize(9).fillColor('#495057');

        if (proyectos.length === 0) {
            doc.moveDown(2);
            doc.text('No hay cuentas pendientes bajo este criterio.', 50, doc.y);
        } else {
            proyectos.forEach((p, index) => {
                if (doc.y > 750) { 
                    doc.addPage(); 
                    doc.y = 40; // Resetear Y en nueva página
                }
                
                doc.moveDown(0.5);
                const currentY = doc.y;
                
                // Alertar en rojo si tiene más de 45 días sin pagar
                const isWarning = p.diasInactivo > 45 || p.msjActividad === 'Sin Pagos';
                const textColor = isWarning ? '#e74a3b' : '#495057';
                
                doc.fillColor(textColor).font(isWarning ? 'Helvetica-Bold' : 'Helvetica');
                
                doc.text(`${p.clientname} (#${p.quotenumber})`, 50, currentY, { width: 180 });
                if(!advisor) doc.text(p.advisorname.split(' ')[0], 240, currentY, { width: 90 }); // Solo el primer nombre del asesor
                doc.text(p.msjActividad, !advisor ? 330 : 260, currentY, { width: 80 });
                
                doc.fillColor('#e74a3b').font('Helvetica-Bold')
                   .text(formatMoney(p.deuda), 450, currentY, { width: 95, align: 'right' });
                
                doc.moveTo(40, doc.y + 6).lineTo(555, doc.y + 6).lineWidth(0.5).strokeColor('#eaeaea').stroke();
                doc.y += 3;
            });
        }

        // PIE DE PÁGINA
        const totalColegios = proyectos.length;
        doc.moveDown(1);
        doc.fillColor('#858796').font('Helvetica-Oblique').fontSize(8);
        doc.text(`Total de proyectos con deuda: ${totalColegios}`, 40, doc.y);

        doc.end();
    } catch (e) { 
        res.status(500).send("Error generando PDF: " + e.message); 
    } finally { 
        if (client) client.release(); 
    }
});

// =============================================================
// 📊 REPORTE DE GASTOS (FUSIÓN: AUDITORÍA + VISUALIZACIÓN DE PROYECTOS)
// =============================================================
app.get('/reporte-gastos', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { startDate, endDate, cycleId, missingDesc } = req.query;
    let client;
    try {
        client = await pool.connect();
        
        // --- 1. FUNCIÓN DE SEGURIDAD (ADIÓS NaN) ---
        const safeNum = (val) => {
            const num = parseFloat(val);
            return isNaN(num) ? 0.00 : num;
        };

        // --- 2. SELECTOR DE CICLOS (SE QUEDA IGUAL) ---
        const cyclesRes = await client.query("SELECT id, fecha_inicio FROM caja_chica_ciclos ORDER BY id DESC LIMIT 15");
        const cycleOptions = cyclesRes.rows.map(c => 
            `<option value="${c.id}" ${cycleId == c.id ? 'selected' : ''}>Ciclo #${c.id} (${new Date(c.fecha_inicio).toLocaleDateString()})</option>`
        ).join('');

        // --- 3. COMPARATIVA MENSUAL (CORREGIDA PARA NO DAR NaN) ---
        const compRes = await client.query(`
            SELECT 
                SUM(CASE WHEN date_trunc('month', expense_date) = date_trunc('month', current_date) THEN paid_amount ELSE 0 END) as mes_actual,
                SUM(CASE WHEN date_trunc('month', expense_date) = date_trunc('month', current_date - interval '1 month') THEN paid_amount ELSE 0 END) as mes_pasado
            FROM expenses`);
        
        const comp = compRes.rows[0];
        const mesActual = safeNum(comp.mes_actual);
        const mesPasado = safeNum(comp.mes_pasado);
        
        // Evitamos división por cero para que no salga Infinity o NaN
        let variacion = 0;
        if (mesPasado > 0) {
            variacion = ((mesActual - mesPasado) / mesPasado * 100).toFixed(1);
        } else if (mesActual > 0) {
            variacion = 100; // Si antes era 0 y ahora hay gastos, subió 100%
        }

        // --- 4. CONSULTA DINÁMICA (MEJORADA CON PROYECTOS) ---
        // Agregamos LEFT JOIN quotes para saber el nombre del colegio
        let whereClause = "WHERE e.paid_amount > 0"; 
        const params = [];

        if (startDate) { params.push(startDate); whereClause += ` AND e.expense_date >= $${params.length}`; }
        if (endDate) { params.push(endDate); whereClause += ` AND e.expense_date <= $${params.length}`; }
        if (cycleId) { params.push(cycleId); whereClause += ` AND e.caja_chica_ciclo_id = $${params.length}`; }
        if (missingDesc === 'true') { whereClause += ` AND (e.description IS NULL OR e.description = '')`; }

        // AQUÍ ESTÁ LA MEJORA CLAVE: Traemos 'q.clientname'
        const tableQuery = `
            SELECT e.*, s.name as supplier_name, q.clientname as nombre_proyecto
            FROM expenses e 
            LEFT JOIN suppliers s ON e.supplier_id = s.id 
            LEFT JOIN quotes q ON e.quote_id = q.id
            ${whereClause} 
            ORDER BY e.expense_date DESC`;
        
        const expensesRes = await client.query(tableQuery, params);
        
        // --- 5. GRÁFICO (AGREGAMOS CATEGORÍA 'PROYECTO') ---
        const chartQuery = `
            SELECT 
                CASE 
                    WHEN quote_id IS NOT NULL THEN 'Gastos de Proyectos' -- Nueva categoría
                    WHEN description ILIKE '%fiscal%' THEN 'Con Valor Fiscal'
                    WHEN caja_chica_ciclo_id IS NOT NULL THEN 'Caja Chica Admin'
                    ELSE 'Facturas Admin'
                END as categoria,
                SUM(paid_amount) as total
            FROM expenses e
            ${whereClause}
            GROUP BY categoria`;
        
        const chartRes = await client.query(chartQuery, params);
        const labels = chartRes.rows.map(r => r.categoria);
        const totals = chartRes.rows.map(r => safeNum(r.total));
        const granTotal = totals.reduce((a, b) => a + b, 0);

        res.send(`
            <!DOCTYPE html><html lang="es"><head>
                ${commonHtmlHead}
                <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
            </head><body>
                <div class="container" style="max-width: 1300px;">
                    <div style="margin-bottom: 20px;">${backToDashboardLink}</div>
                    
                    <div class="card">
                        <h1>Auditoría y Análisis de Flujo Real</h1>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 15px; margin-bottom: 25px;">
                            <div class="summary-box" style="border-top: 5px solid var(--primary);">
                                <small>EFECTIVO EJECUTADO MES</small>
                                <div style="font-size:1.6rem; font-weight:bold;">RD$ ${mesActual.toLocaleString('en-US')}</div>
                            </div>
                            <div class="summary-box" style="border-top: 5px solid #858796;">
                                <small>MES ANTERIOR</small>
                                <div style="font-size:1.6rem; font-weight:bold;">RD$ ${mesPasado.toLocaleString('en-US')}</div>
                            </div>
                            <div class="summary-box" style="border-top: 5px solid ${variacion > 0 ? '#e74a3b' : '#1cc88a'};">
                                <small>VARIACIÓN</small>
                                <div style="font-size:1.6rem; font-weight:bold; color: ${variacion > 0 ? '#e74a3b' : '#1cc88a'};">
                                    ${variacion > 0 ? '▲' : '▼'} ${variacion}%
                                </div>
                            </div>
                        </div>

                        <div style="background:#f8f9fc; padding:20px; border-radius:12px; display:grid; grid-template-columns: repeat(4, 1fr) auto auto; gap:15px; align-items:end; margin-bottom:20px;">
                            <div class="form-group"><label>Desde:</label><input type="date" id="startDate" value="${startDate || ''}"></div>
                            <div class="form-group"><label>Hasta:</label><input type="date" id="endDate" value="${endDate || ''}"></div>
                            <div class="form-group"><label>Ciclo:</label><select id="cycleId"><option value="">-- Todos --</option>${cycleOptions}</select></div>
                            <div class="form-group">
                                <label>Auditoría:</label>
                                <select id="missingDesc">
                                    <option value="false">Todos</option>
                                    <option value="true" ${missingDesc === 'true' ? 'selected' : ''}>Sin Descripción</option>
                                </select>
                            </div>
                            <button class="btn btn-primary" onclick="filtrar()">🔍 Filtrar</button>
                            <button class="btn" style="background: #1cc88a; color: white;" onclick="exportarExcel()">📊 Excel</button>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 350px; gap: 30px; margin-top: 20px;">
                        <div>
                            <div class="summary-box" style="margin-bottom:20px; border-left: 8px solid var(--danger);">
                                <small>TOTAL PAGADO EN ESTE PERIODO:</small>
                                <div class="amount" style="font-size:2.2rem; color:var(--danger);">RD$ ${safeNum(granTotal).toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
                            </div>
                            <div class="card">
                                <table class="modern-table">
                                    <thead><tr><th>Fecha</th><th>Detalle / Origen</th><th style="text-align:right;">Monto Pagado</th></tr></thead>
                                    <tbody>
                                        ${expensesRes.rows.map(e => {
                                            // Lógica visual para distinguir Proyecto vs Admin
                                            let etiqueta = '';
                                            if (e.nombre_proyecto) {
                                                etiqueta = `<span style="font-size:10px; background:#e3f2fd; color:#0d47a1; padding:2px 6px; border-radius:4px; font-weight:bold;">🏫 ${e.nombre_proyecto}</span>`;
                                            } else {
                                                etiqueta = `<span style="font-size:10px; background:#f3e5f5; color:#7b1fa2; padding:2px 6px; border-radius:4px;">🏢 Admin / Oficina</span>`;
                                            }

                                            return `
                                            <tr>
                                                <td>${new Date(e.expense_date).toLocaleDateString()}</td>
                                                <td>
                                                    ${etiqueta}<br>
                                                    <b>${e.supplier_name || 'Varios'}</b><br>
                                                    <small style="color:#555;">${e.description || '<span style="color:red;">⚠️ Sin descripción</span>'}</small><br>
                                                    <span style="font-size:10px; color:#888;">📍 ${e.fund_source || 'Banco'}</span>
                                                </td>
                                                <td style="text-align:right; font-weight:bold;">$${safeNum(e.paid_amount).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                                            </tr>`;
                                        }).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div class="card" style="text-align:center;">
                            <h3>Distribución de Salidas</h3>
                            <canvas id="myChart"></canvas>
                        </div>
                    </div>
                </div>

                <script>
                    function filtrar() {
                        const s = document.getElementById('startDate').value;
                        const e = document.getElementById('endDate').value;
                        const c = document.getElementById('cycleId').value;
                        const m = document.getElementById('missingDesc').value;
                        window.location.href = \`/reporte-gastos?startDate=\${s}&endDate=\${e}&cycleId=\${c}&missingDesc=\${m}\`;
                    }

                    function exportarExcel() {
                        const s = document.getElementById('startDate').value;
                        const e = document.getElementById('endDate').value;
                        const c = document.getElementById('cycleId').value;
                        const m = document.getElementById('missingDesc').value;
                        window.location.href = \`/reporte-gastos/excel?startDate=\${s}&endDate=\${e}&cycleId=\${c}&missingDesc=\${m}\`;
                    }

                    const ctx = document.getElementById('myChart').getContext('2d');
                    new Chart(ctx, {
                        type: 'doughnut',
                        data: {
                            labels: ${JSON.stringify(labels)},
                            datasets: [{
                                data: ${JSON.stringify(totals)},
                                backgroundColor: ['#4e73df', '#1cc88a', '#f6c23e', '#e74a3b'],
                            }]
                        },
                        options: { plugins: { legend: { position: 'bottom' } } }
                    });
                </script>
            </body></html>`);
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
        <td style="display: flex; gap: 8px;">
            <a href="/asesor/editar/${a.id}" class="btn" style="background-color: #ffc107; color: #212529; padding: 5px 10px; font-size: 14px; text-decoration: none; border-radius: 4px;">Editar</a>
            
            <form action="/borrar-asesor/${a.id}" method="POST" style="margin: 0;" onsubmit="return confirm('¿Estás seguro de que deseas eliminar a ${a.name}? Esta acción no se puede deshacer.');">
                <button type="submit" class="btn" style="background-color: #dc3545; color: white; padding: 5px 10px; font-size: 14px; border: none; border-radius: 4px; cursor: pointer;">
                    Borrar
                </button>
            </form>
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
        // Filtramos para que solo traiga los activos o los que aún tienen el campo vacío (null) por ser registros viejos
const result = await client.query("SELECT * FROM employees WHERE estado = 'activo' OR estado IS NULL ORDER BY first_name, last_name ASC");
        const employees = result.rows;
        client.release();

        let employeesHtml = employees.map(e => `
            <tr>
                <td>${e.first_name} ${e.last_name}</td>
                <td>${e.cedula || ''}</td>
                <td>$${parseFloat(e.base_salary || 0).toFixed(2)}</td>
                <td>
                    <a href="/empleado/editar/${e.id}" class="btn" style="background-color: #ffc107; color: #212529; padding: 5px 10px; font-size: 14px;">Editar</a>
                    <form action="/empleado/desactivar/${e.id}" method="POST" style="display: inline; margin-left: 10px;" onsubmit="return confirm('¿Estás seguro de que deseas desactivar a este empleado? Su historial se mantendrá intacto.');">
    <button type="submit" class="btn" style="background-color: #fd7e14; color: white; padding: 5px 10px; font-size: 14px;">Desactivar</button>
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
                    <div class="form-container" style="background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); margin-top: 40px;">
    <h2 style="margin-top: 0; color: #2c3e50; border-bottom: 2px solid #f0f0f0; padding-bottom: 15px; margin-bottom: 25px; font-size: 22px;">Añadir Nuevo Empleado</h2>
    
    <form action="/empleados" method="POST" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
        <div style="display: flex; flex-direction: column;">
            <label style="font-weight: 600; font-size: 13px; color: #555; margin-bottom: 8px;">Nombres:</label>
            <input type="text" id="first_name" name="first_name" required style="padding: 12px; border: 1px solid #dce1e6; border-radius: 6px; font-size: 14px; outline: none; transition: border-color 0.3s;">
        </div>
        
        <div style="display: flex; flex-direction: column;">
            <label style="font-weight: 600; font-size: 13px; color: #555; margin-bottom: 8px;">Apellidos:</label>
            <input type="text" id="last_name" name="last_name" required style="padding: 12px; border: 1px solid #dce1e6; border-radius: 6px; font-size: 14px; outline: none;">
        </div>
        
        <div style="display: flex; flex-direction: column;">
            <label style="font-weight: 600; font-size: 13px; color: #555; margin-bottom: 8px;">Cédula:</label>
            <input type="text" id="cedula" name="cedula" style="padding: 12px; border: 1px solid #dce1e6; border-radius: 6px; font-size: 14px; outline: none;">
        </div>
        
        <div style="display: flex; flex-direction: column;">
            <label style="font-weight: 600; font-size: 13px; color: #555; margin-bottom: 8px;">Fecha de Ingreso:</label>
            <input type="date" id="hire_date" name="hire_date" style="padding: 12px; border: 1px solid #dce1e6; border-radius: 6px; font-size: 14px; outline: none; color: #495057;">
        </div>
        
        <div style="display: flex; flex-direction: column;">
            <label style="font-weight: 600; font-size: 13px; color: #555; margin-bottom: 8px;">Salario Base (Mensual):</label>
            <div style="position: relative;">
                <span style="position: absolute; left: 12px; top: 12px; color: #6c757d; font-weight: bold;">RD$</span>
                <input type="number" id="base_salary" name="base_salary" step="0.01" style="padding: 12px 12px 12px 45px; border: 1px solid #dce1e6; border-radius: 6px; font-size: 14px; width: 100%; box-sizing: border-box; outline: none;">
            </div>
        </div>
        
        <div style="display: flex; flex-direction: column;">
            <label style="font-weight: 600; font-size: 13px; color: #555; margin-bottom: 8px;">Frecuencia de Pago:</label>
            <select id="payment_frequency" name="payment_frequency" style="padding: 12px; border: 1px solid #dce1e6; border-radius: 6px; font-size: 14px; outline: none; background-color: white; color: #495057;">
                <option value="quincenal">Quincenal</option>
                <option value="mensual">Mensual</option>
            </select>
        </div>
        
        <div style="display: flex; flex-direction: column;">
            <label style="font-weight: 600; font-size: 13px; color: #555; margin-bottom: 8px;">Fecha de Cumpleaños:</label>
            <input type="date" id="birth_date" name="birth_date" style="padding: 12px; border: 1px solid #dce1e6; border-radius: 6px; font-size: 14px; outline: none; color: #495057;">
        </div>
        
        <div style="grid-column: span 2; display: flex; flex-direction: column;">
            <label style="font-weight: 600; font-size: 13px; color: #555; margin-bottom: 8px;">Dirección:</label>
            <textarea id="address" name="address" rows="2" style="padding: 12px; border: 1px solid #dce1e6; border-radius: 6px; font-size: 14px; outline: none; resize: vertical;"></textarea>
        </div>
        
        <div style="grid-column: span 2; text-align: right; margin-top: 10px;">
            <button type="submit" class="btn" style="background-color: #007bff; color: white; padding: 14px 35px; border-radius: 8px; font-weight: bold; font-size: 15px; border: none; cursor: pointer; box-shadow: 0 4px 6px rgba(0,123,255,0.2); transition: background-color 0.2s;">💾 Guardar Empleado</button>
        </div>
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
    if (!commission_ids) return res.redirect('/pagar-comisiones');
    if (!Array.isArray(commission_ids)) commission_ids = [commission_ids];
    
    const commissionIdsInt = commission_ids.map(id => parseInt(id));
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Obtenemos detalles profundos para el PDF (Aporte, Base y Abono)
        const detailsResult = await client.query(`
            SELECT c.*, a.name as advisor_name, q.clientname, q.quotenumber, q.id as quote_id,
                   p.amount as monto_abono_original, 
                   p.monto_aporte_retenido, 
                   p.base_comisionable
            FROM commissions c
            JOIN advisors a ON c.advisor_id = a.id
            JOIN payments p ON c.payment_id = p.id
            JOIN quotes q ON p.quote_id = q.id
            WHERE c.id = ANY($1::int[]) AND c.status = 'pendiente'`, 
            [commissionIdsInt]
        );

        if (detailsResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).send('No se encontraron comisiones válidas.');
        }

        const commissionsToPay = detailsResult.rows;

        // 2. Marcamos como PAGADAS
        await client.query(
            `UPDATE commissions SET status = 'pagada', paid_at = NOW() WHERE id = ANY($1::int[])`,
            [commissionIdsInt]
        );

        // 3. REGISTRO DE GASTO AUTOMÁTICO EN EL CENTRO
        for (const comm of commissionsToPay) {
            const descGasto = `Pago comisión ${comm.commission_type} a ${comm.advisor_name} (Abono #${comm.payment_id})`;
            
            // Buscamos o creamos el suplidor "Comisiones Internas"
            let supRes = await client.query('SELECT id FROM suppliers WHERE name = $1', ['Comisiones Internas']);
            let supplierId = supRes.rows.length > 0 ? supRes.rows[0].id : 
                (await client.query('INSERT INTO suppliers (name) VALUES ($1) RETURNING id', ['Comisiones Internas'])).rows[0].id;

            await client.query(
                `INSERT INTO expenses (expense_date, supplier_id, amount, description, type, quote_id) 
                 VALUES (NOW(), $1, $2, $3, 'Sin Valor Fiscal', $4)`,
                [supplierId, comm.commission_amount, descGasto, comm.quote_id]
            );
        }

        await client.query('COMMIT');

        // 4. GENERACIÓN DEL PDF DETALLADO (TRANSPARENCIA)
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
res.setHeader('Content-Disposition', `inline; filename=recibo_comisiones_${Date.now()}.pdf`);
        doc.pipe(res);

        // Membrete (Usando tu plantilla actual)
        const logoPath = path.join(__dirname, 'plantillas', 'membrete.jpg');
        if (fs.existsSync(logoPath)) doc.image(logoPath, 0, 0, { width: doc.page.width, height: doc.page.height });

        doc.y = 250;
        doc.font('Helvetica-Bold').fontSize(16).text('COMPROBANTE DE PAGO DE COMISIONES', { align: 'center' });
        doc.moveDown();

        commissionsToPay.forEach((c, index) => {
            doc.fontSize(10).font('Helvetica-Bold').text(`PAGO #${index + 1} - PROYECTO: ${c.clientname}`);
            doc.font('Helvetica').fontSize(9);
            doc.text(`Asesor: ${c.advisor_name} | Tipo: ${c.commission_type}`);
            doc.moveDown(0.5);
            
            // --- DESGLOSE DE TRANSPARENCIA SOLICITADO POR MOISÉS ---
            doc.text(`Monto Abono Original: RD$ ${parseFloat(c.monto_abono_original).toFixed(2)}`);
            doc.fillColor('red').text(`(-) Aporte Institucional Retenido: RD$ ${parseFloat(c.monto_aporte_retenido).toFixed(2)}`);
            doc.fillColor('black').text(`(=) Base Real Comisionable: RD$ ${parseFloat(c.base_comisionable).toFixed(2)}`);
            doc.text(`Tasa aplicada: ${(parseFloat(c.commission_rate) * 100).toFixed(2)}%`);
            doc.font('Helvetica-Bold').text(`TOTAL COMISIÓN: RD$ ${parseFloat(c.commission_amount).toFixed(2)}`, { align: 'right' });
            doc.moveDown();
            doc.text('----------------------------------------------------------------------------------------------------');
            doc.moveDown();
        });

        // NOTA AL PIE PARA EL ASESOR
        doc.moveDown(2);
        doc.fontSize(8).font('Helvetica-Oblique').fillColor('gray');
        doc.text('Este recibo detalla la resta del Aporte Institucional sobre cada abono antes del cálculo de comisión.', { align: 'center' });
        doc.text('El asesor acepta este cálculo como base neta de su gestión comercial.', { align: 'center' });

        doc.end();

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error("Error en pago de comisiones:", error);
        res.status(500).send('Error al procesar el pago.');
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

app.post('/empleado/desactivar/:id', requireLogin, requireAdminOrCoord, async (req, res) => {
    try {
        const { id } = req.params;
        const client = await pool.connect();
        
        // Cambiamos el estado en lugar de borrar
        await client.query("UPDATE employees SET estado = 'desactivado' WHERE id = $1", [id]);
        
        client.release();
        
        // Redirigimos a la tabla de empleados para refrescar la vista
        res.redirect('/empleados');

    } catch (error) {
        console.error("Error al desactivar el empleado:", error);
        res.status(500).send('<h1>Error interno al intentar desactivar al empleado ❌</h1>');
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
// --- PÁGINA PRINCIPAL DE GESTIÓN DE PRÉSTAMOS (MODERNA Y SEPARADA) ---
app.get('/gestionar-prestamos', requireLogin, requireAdminOrCoord, async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        
        // MEJORA 1 Y 2: Filtramos el dropdown para empleados activos y usamos LEFT JOIN con COALESCE en los préstamos
        const [employeesResult, loansResult] = await Promise.all([
            client.query("SELECT id, first_name, last_name FROM employees WHERE estado = 'activo' OR estado IS NULL ORDER BY first_name ASC"),
            client.query(`
                SELECT l.*, 
                       COALESCE(e.first_name || ' ' || e.last_name, 'Empleado Eliminado') as colaborador, 
                       COALESCE(lp.total_pagado, 0) as total_pagado,
                       (l.loan_amount - COALESCE(lp.total_pagado, 0)) as balance_pendiente
                FROM loans l
                LEFT JOIN employees e ON l.employee_id = e.id
                LEFT JOIN (
                    SELECT loan_id, SUM(amount_paid) as total_pagado 
                    FROM loan_payments 
                    GROUP BY loan_id
                ) lp ON l.id = lp.loan_id
                ORDER BY l.loan_date DESC
            `)
        ]);

        const employees = employeesResult.rows;
        const allLoans = loansResult.rows;

        // 2. Filtramos los préstamos en Activos (con deuda) y Pagados (balance 0)
        const prestamosActivos = allLoans.filter(l => l.balance_pendiente > 0);
        const prestamosPagados = allLoans.filter(l => l.balance_pendiente <= 0);

        let employeesOptionsHtml = employees.map(e => `<option value="${e.id}">${e.first_name} ${e.last_name}</option>`).join('');
        
        // 3. Generamos las filas HTML para los Activos
        let activosHtml = prestamosActivos.map(l => `
            <tr style="cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='white'" onclick="window.location.href='/prestamo/${l.id}';">
                <td>${new Date(l.loan_date).toLocaleDateString('es-DO')}</td>
                <td style="font-weight: bold;">${l.colaborador}</td>
                <td>RD$ ${parseFloat(l.loan_amount).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                <td style="font-weight: bold; color: #dc3545; font-size: 1.1em;">RD$ ${parseFloat(l.balance_pendiente).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                <td style="color: #6c757d; font-style: italic;">${l.reason || 'Sin motivo especificado'}</td>
            </tr>
        `).join('') || '<tr><td colspan="5" style="text-align:center; padding: 20px;">No hay préstamos activos registrados.</td></tr>';

        // 4. Generamos las filas HTML para los Pagados (Diseño más sutil)
        let pagadosHtml = prestamosPagados.map(l => `
            <tr style="cursor: pointer; background: #fdfdfd;" onclick="window.location.href='/prestamo/${l.id}';">
                <td style="color: #6c757d;">${new Date(l.loan_date).toLocaleDateString('es-DO')}</td>
                <td style="color: #6c757d;">${l.colaborador}</td>
                <td style="color: #6c757d;">RD$ ${parseFloat(l.loan_amount).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                <td style="font-weight: bold; color: #28a745;">¡Saldado!</td>
                <td style="color: #adb5bd; font-style: italic;">${l.reason || '-'}</td>
            </tr>
        `).join('') || '<tr><td colspan="5" style="text-align:center; padding: 20px; color: #6c757d;">No hay historial de préstamos pagados.</td></tr>';

        // 5. Renderizamos la Vista con CSS Inyectado para el Formulario Grid
        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}
            <style>
                .modern-form {
                    background: white;
                    padding: 30px;
                    border-radius: 12px;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.05);
                    border: 1px solid #eaeaea;
                }
                .form-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 20px;
                    margin-bottom: 20px;
                }
                .form-group label {
                    display: block;
                    font-weight: 600;
                    margin-bottom: 8px;
                    color: #495057;
                }
                .form-group input, .form-group select, .form-group textarea {
                    width: 100%;
                    padding: 10px 12px;
                    border: 1px solid #ced4da;
                    border-radius: 6px;
                    font-size: 14px;
                    box-sizing: border-box;
                    transition: border-color 0.2s;
                }
                .form-group input:focus, .form-group select:focus {
                    border-color: #4e73df;
                    outline: none;
                }
                .full-width {
                    grid-column: 1 / -1;
                }
                .btn-primary {
                    background: #4e73df;
                    color: white;
                    padding: 12px 25px;
                    border: none;
                    border-radius: 6px;
                    font-size: 16px;
                    font-weight: bold;
                    cursor: pointer;
                    width: 100%;
                    transition: background 0.3s;
                }
                .btn-primary:hover { background: #2e59d9; }
                .table-container {
                    background: white;
                    border-radius: 10px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.03);
                    overflow: hidden;
                    margin-bottom: 40px;
                }
                table { width: 100%; border-collapse: collapse; }
                th { background: #f8f9fa; padding: 15px; text-align: left; color: #495057; border-bottom: 2px solid #dee2e6; }
                td { padding: 15px; border-bottom: 1px solid #eaeaea; }
            </style>
            </head><body>
                <div class="container" style="max-width: 1000px; padding-bottom: 50px;">
                    <div style="margin-bottom: 20px;">${backToDashboardLink}</div>
                    <h1 style="color: #2c3e50; margin-bottom: 30px;">🏦 Gestión de Préstamos</h1>
                    
                    <div class="modern-form">
                        <h3 style="margin-top: 0; color: #4e73df; border-bottom: 2px solid #f8f9fa; padding-bottom: 10px;">Registrar Nuevo Préstamo</h3>
                        <form action="/gestionar-prestamos" method="POST">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label>👤 Colaborador:</label>
                                    <select name="employee_id" required>
                                        <option value="">Seleccione un colaborador...</option>
                                        ${employeesOptionsHtml}
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>📅 Fecha del Préstamo:</label>
                                    <input type="date" name="loan_date" required>
                                </div>
                                <div class="form-group">
                                    <label>💰 Monto (RD$):</label>
                                    <input type="number" name="loan_amount" step="0.01" placeholder="Ej: 5000.00" required>
                                </div>
                                <div class="form-group full-width">
                                    <label>📝 Motivo / Concepto (Opcional):</label>
                                    <textarea name="reason" rows="2" placeholder="Ej: Avance de sueldo para emergencia..."></textarea>
                                </div>
                            </div>
                            <button type="submit" class="btn-primary">Registrar Préstamo</button>
                        </form>
                    </div>

                    <h3 style="margin-top: 50px; color: #dc3545;">🔴 Préstamos Activos (Con Deuda)</h3>
                    <div class="table-container">
                        <table>
                            <thead><tr><th>Fecha</th><th>Colaborador</th><th>Monto Original</th><th>Balance Pendiente</th><th>Motivo</th></tr></thead>
                            <tbody>${activosHtml}</tbody>
                        </table>
                    </div>

                    <h3 style="margin-top: 40px; color: #28a745;">✅ Historial de Préstamos Saldados</h3>
                    <div class="table-container" style="opacity: 0.8;">
                        <table>
                            <thead><tr><th>Fecha</th><th>Colaborador</th><th>Monto Original</th><th>Estado</th><th>Motivo</th></tr></thead>
                            <tbody>${pagadosHtml}</tbody>
                        </table>
                    </div>
                </div>
            </body></html>
        `);
    } catch (error) {
        console.error("Error al cargar la página de préstamos:", error);
        res.status(500).send('<h1>Error al cargar la página ❌</h1>');
    } finally {
        if (client) client.release();
    }
});

// --- RUTA PARA IMPRIMIR VALE DE PRÉSTAMO (CORREGIDA) ---
app.get('/prestamo/:id/print', requireLogin, async (req, res) => {
    const loanId = req.params.id;
    let client;
    try {
        client = await pool.connect();
        
        // Buscamos los datos. OJO: La columna del monto es 'loan_amount'
        const loanRes = await client.query(`
            SELECT l.*, e.first_name, e.last_name, e.cedula 
            FROM loans l
            JOIN employees e ON l.employee_id = e.id
            WHERE l.id = $1`, [loanId]);

        if (loanRes.rows.length === 0) return res.status(404).send("Préstamo no encontrado");
        
        const loan = loanRes.rows[0];
        const doc = new PDFDocument();

        // Construimos el nombre completo
        const fullName = `${loan.first_name} ${loan.last_name}`;

        const filename = `VALE-PRESTAMO-${fullName.replace(/ /g, '_')}.pdf`;
        res.setHeader('Content-disposition', 'inline; filename="' + filename + '"');
        res.setHeader('Content-type', 'application/pdf');
        doc.pipe(res);

        // --- DISEÑO DEL VALE ---
        
        doc.fontSize(20).text('VALE DE PRÉSTAMO / AVANCE', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text('Fecha: ' + new Date(loan.loan_date).toLocaleDateString(), { align: 'right' });
        doc.moveDown(2);

        doc.fontSize(12).text('Yo, ', { continued: true });
        doc.font('Helvetica-Bold').text(fullName, { continued: true });
        doc.font('Helvetica').text(', portador de la cédula No. ', { continued: true });
        doc.font('Helvetica-Bold').text(loan.cedula || '_________________', { continued: true });
        doc.font('Helvetica').text(', por medio de la presente certifico haber recibido la suma de:');
        
        doc.moveDown();
        
        // --- AQUÍ ESTABA EL ERROR (CORREGIDO) ---
        // Usamos loan.loan_amount en vez de loan.amount
        const montoReal = parseFloat(loan.loan_amount || 0); 
        
        doc.fontSize(16).font('Helvetica-Bold').text(`RD$ ${montoReal.toLocaleString('en-US', {minimumFractionDigits: 2})}`, { align: 'center' });
        doc.moveDown();
        
        doc.fontSize(12).font('Helvetica').text('Por concepto de:');
        doc.fontSize(12).font('Helvetica-Oblique').text(loan.reason || 'Préstamo personal', { indent: 20 });
        doc.moveDown(2);

        doc.text('Autorizo formalmente a la empresa a descontar este monto de mi salario mediante las cuotas acordadas o de mis prestaciones laborales en caso de terminación de contrato antes de saldar la deuda.');
        
        doc.moveDown(4);

        // Firmas
        const lineY = doc.y;
        doc.lineWidth(1).moveTo(50, lineY).lineTo(250, lineY).stroke();
        doc.lineWidth(1).moveTo(350, lineY).lineTo(550, lineY).stroke();

        doc.fontSize(10).text('Firma del Empleado (Recibido)', 50, lineY + 10, { width: 200, align: 'center' });
        doc.text('Autorizado Por (Empresa)', 350, lineY + 10, { width: 200, align: 'center' });

        doc.end();

    } catch (e) {
        console.error(e);
        res.status(500).send("Error al generar PDF");
    } finally {
        if (client) client.release();
    }
});

// --- RUTA PARA GUARDAR UN NUEVO PRÉSTAMO ---
app.post('/gestionar-prestamos', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { employee_id, loan_date, loan_amount, reason } = req.body;
    let client;
    try {
        client = await pool.connect();

        // ESCUDO 1: Validar que el empleado esté activo antes de prestarle dinero
        const empCheck = await client.query("SELECT estado FROM employees WHERE id = $1", [employee_id]);
        if (empCheck.rows.length === 0 || empCheck.rows[0].estado === 'desactivado') {
            return res.status(400).send('<h1>Error: No se puede registrar un préstamo a un empleado desactivado o inexistente. ❌</h1>');
        }

        // ESCUDO 2: Sanitización numérica estricta
        const montoLimpio = parseFloat(String(loan_amount).replace(/[^0-9.-]+/g, "")) || 0;
        if (montoLimpio <= 0) {
            return res.status(400).send('<h1>Error: El monto del préstamo debe ser mayor a 0. ❌</h1>');
        }

        const result = await client.query(
            `INSERT INTO loans (employee_id, loan_date, loan_amount, reason, status) 
             VALUES ($1, $2, $3, $4, 'activo') RETURNING id`,
            [employee_id, loan_date, montoLimpio, reason || null]
        );
        const newLoanId = result.rows[0].id;
        
        // Redirigimos al detalle del préstamo recién creado para imprimir el comprobante
        res.redirect(`/prestamo/${newLoanId}?nuevo=true`);
    } catch (error) {
        console.error("Error al guardar el préstamo:", error);
        res.status(500).send('<h1>Error al guardar el préstamo ❌</h1>');
    } finally {
        if (client) client.release(); // CORRECCIÓN CRÍTICA: Asegura la liberación de la conexión siempre
    }
});

// --- RUTA PARA GUARDAR UN NUEVO AVANCE ---
app.post('/gestionar-avances', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { employee_id, advance_date, amount, reason } = req.body;
    if (!employee_id || !advance_date || !amount) {
        return res.status(400).send("El empleado, la fecha y el monto son obligatorios.");
    }
    let client;
    try {
        client = await pool.connect();

        // ESCUDO 1: Validar que el empleado esté activo antes de registrar un avance
        const empCheck = await client.query("SELECT estado FROM employees WHERE id = $1", [employee_id]);
        if (empCheck.rows.length === 0 || empCheck.rows[0].estado === 'desactivado') {
            return res.status(400).send('<h1>Error: No se puede registrar un avance a un empleado desactivado o inexistente. ❌</h1>');
        }

        // ESCUDO 2: Sanitización numérica
        const montoLimpio = parseFloat(String(amount).replace(/[^0-9.-]+/g, "")) || 0;
        if (montoLimpio <= 0) {
            return res.status(400).send('<h1>Error: El monto del avance debe ser mayor a 0. ❌</h1>');
        }

        await client.query(
            `INSERT INTO avances_empleado (employee_id, advance_date, amount, reason) VALUES ($1, $2, $3, $4)`,
            [employee_id, advance_date, montoLimpio, reason || null]
        );
        
        res.redirect('/gestionar-avances');
    } catch (error) {
        console.error("Error al guardar el avance:", error);
        res.status(500).send('<h1>Error al guardar el avance ❌</h1>');
    } finally {
        if (client) client.release(); // CORRECCIÓN CRÍTICA: Asegura la liberación de la conexión siempre
    }
});

// --- PÁGINA DE DETALLE DE UN PRÉSTAMO ESPECÍFICO ---
app.get('/prestamo/:id', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { id } = req.params;
    let client;
    try {
        client = await pool.connect();
        
        // CORRECCIÓN: LEFT JOIN y COALESCE para que la pantalla no explote si el empleado fue borrado en el pasado
        const loanResult = await client.query(`
            SELECT l.*, COALESCE(e.first_name || ' ' || e.last_name, 'Empleado Eliminado') as colaborador 
            FROM loans l
            LEFT JOIN employees e ON l.employee_id = e.id 
            WHERE l.id = $1
        `, [id]);
        
        const paymentsResult = await client.query(`
            SELECT * FROM loan_payments 
            WHERE loan_id = $1 
            ORDER BY payment_date DESC
        `, [id]);

        if (loanResult.rows.length === 0) {
            return res.status(404).send('<h1>Error: Préstamo no encontrado. ❌</h1>');
        }

        const loan = loanResult.rows[0];
        const payments = paymentsResult.rows;

        // CORRECCIÓN: Aseguramos que si viene un null o vacío en la DB lo maneje como 0
        const totalPagado = payments.reduce((sum, p) => sum + parseFloat(p.amount_paid || 0), 0);
        const balancePendiente = parseFloat(loan.loan_amount || 0) - totalPagado;

        let paymentsHtml = payments.map(p => `
            <tr>
                <td>${new Date(p.payment_date).toLocaleDateString('es-DO')}</td>
                <td>RD$ ${parseFloat(p.amount_paid || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                <td><span class="badge" style="background: #e3f2fd; color: #0d47a1; padding: 3px 8px; border-radius: 4px; font-size: 12px;">${p.payment_method || 'N/A'}</span></td>
                <td>
                    <a href="/recibo-pago-prestamo/${p.id}/pdf" target="_blank" class="btn" style="padding: 5px 10px; font-size: 14px; text-decoration: none;">Imprimir</a>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="4" style="text-align:center; padding: 15px; color: gray;">No se han registrado pagos para este préstamo.</td></tr>';

        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
                <div class="container" style="max-width: 900px; padding-top: 40px; padding-bottom: 50px;">
                    <a href="/gestionar-prestamos" class="back-link" style="text-decoration:none; font-weight:bold; color:#4e73df;">↩️ Volver a Préstamos</a>
                    
                    <h2 style="color: #2c3e50; margin-top: 20px;">Préstamo a: ${loan.colaborador}</h2>
                    
                    <div style="margin-bottom: 20px;">
                        <a href="/prestamo/${loan.id}/print" target="_blank" class="btn" style="background-color: #4e73df; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 14px; display: inline-block;">
                            🖨️ Imprimir Vale para Firma
                        </a>
                    </div>
                    
                    <p><strong>Fecha del Préstamo:</strong> ${new Date(loan.loan_date).toLocaleDateString('es-DO')}</p>
                    <p><strong>Motivo:</strong> ${loan.reason || 'No especificado'}</p>
                    
                    <div class="summary" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 30px 0;">
                        <div class="summary-box" style="background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #6c757d;">
                            <h3 style="margin: 0; font-size: 12px; color: #6c757d;">Monto Original</h3>
                            <p class="amount" style="margin: 5px 0 0 0; font-size: 18px; font-weight: bold;">RD$ ${parseFloat(loan.loan_amount).toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
                        </div>
                        <div class="summary-box" style="background: #f4fbf7; padding: 15px; border-radius: 8px; border-left: 4px solid #28a745;">
                            <h3 style="margin: 0; font-size: 12px; color: #28a745;">Total Pagado</h3>
                            <p class="amount green" style="margin: 5px 0 0 0; font-size: 18px; font-weight: bold; color: #28a745;">RD$ ${totalPagado.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
                        </div>
                        <div class="summary-box" style="background: #fff5f5; padding: 15px; border-radius: 8px; border-left: 4px solid #dc3545;">
                            <h3 style="margin: 0; font-size: 12px; color: #dc3545;">Balance Pendiente</h3>
                            <p class="amount red" style="margin: 5px 0 0 0; font-size: 18px; font-weight: bold; color: #dc3545;">RD$ ${balancePendiente.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
                        </div>
                    </div>

                    ${balancePendiente > 0 && loan.colaborador !== 'Empleado Eliminado' ? `
                    <div class="form-container" style="background: white; padding: 25px; border-radius: 10px; border: 1px solid #eaeaea; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
                        <h3 style="margin-top: 0; color: #4e73df;">Registrar Nuevo Abono / Pago</h3>
                        <form action="/prestamo/${id}/registrar-pago" method="POST" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div class="form-group" style="display: flex; flex-direction: column;">
                                <label style="font-weight: 600; font-size: 13px; margin-bottom: 5px;">Fecha del Pago:</label>
                                <input type="date" name="payment_date" required style="padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                            </div>
                            <div class="form-group" style="display: flex; flex-direction: column;">
                                <label style="font-weight: 600; font-size: 13px; margin-bottom: 5px;">Monto Pagado:</label>
                                <input type="number" name="amount_paid" step="0.01" max="${balancePendiente.toFixed(2)}" required style="padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                            </div>
                            <div class="form-group" style="display: flex; flex-direction: column; grid-column: span 2;">
                                <label style="font-weight: 600; font-size: 13px; margin-bottom: 5px;">Método de Pago:</label>
                                <select name="payment_method" style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; background: white;">
                                    <option value="Efectivo">Efectivo</option>
                                    <option value="Transferencia">Transferencia</option>
                                    <option value="Descuento Nómina">Descuento Nómina</option>
                                    <option value="Otro">Otro</option>
                                </select>
                            </div>
                            <div class="form-group" style="display: flex; flex-direction: column; grid-column: span 2;">
                                <label style="font-weight: 600; font-size: 13px; margin-bottom: 5px;">Notas (Opcional):</label>
                                <textarea name="notes" rows="2" style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; resize: vertical;"></textarea>
                            </div>
                            <div style="grid-column: span 2; text-align: right;">
                                <button type="submit" class="btn" style="background: #4e73df; color: white; padding: 10px 25px; border: none; border-radius: 5px; font-weight: bold; cursor: pointer;">Guardar Pago</button>
                            </div>
                        </form>
                    </div>` : balancePendiente <= 0 ? 
                        '<h3 style="text-align:center; color: #28a745; background: #f4fbf7; padding: 15px; border-radius: 6px;">✅ Este préstamo ha sido saldado.</h3>' : 
                        '<h3 style="text-align:center; color: #dc3545; background: #fff5f5; padding: 15px; border-radius: 6px;">⚠️ No se pueden registrar abonos a un empleado eliminado.</h3>'
                    }

                    <hr style="margin: 40px 0; border: 0; border-top: 1px solid #eee;">
                    <h3 style="color: #2c3e50;">Historial de Pagos Realizados</h3>
                    <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                        <thead>
                            <tr style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                                <th style="padding: 12px; text-align: left;">Fecha de Pago</th>
                                <th style="padding: 12px; text-align: left;">Monto</th>
                                <th style="padding: 12px; text-align: left;">Método</th>
                                <th style="padding: 12px; text-align: left;">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>${paymentsHtml}</tbody>
                    </table>
                </div>
            </body></html>
        `);
    } catch (error) {
        console.error("Error al cargar detalle de préstamo:", error);
        res.status(500).send('<h1>Error al cargar la página ❌</h1>');
    } finally {
        if (client) client.release(); // CORRECCIÓN CRÍTICA: La liberación ahora está garantizada siempre
    }
});

// --- RUTA PARA GUARDAR UN PAGO A UN PRÉSTAMO ---
app.post('/prestamo/:loanId/registrar-pago', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { loanId } = req.params;
    const { payment_date, amount_paid, payment_method, notes } = req.body;
    
    if (!payment_date || !amount_paid) {
        return res.status(400).send("La fecha y el monto son obligatorios.");
    }

    let client; // Declaración segura fuera del try
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // ESCUDO 1: Sanitización numérica del abono
        const montoAbono = parseFloat(String(amount_paid).replace(/[^0-9.-]+/g, "")) || 0;
        if (montoAbono <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).send('<h1>Error: El monto del abono debe ser mayor a 0. ❌</h1>');
        }

        // ESCUDO 2: Verificar existencia del préstamo y saldo real ANTES de insertar
        const checkResult = await client.query(`
            SELECT l.loan_amount, COALESCE(SUM(p.amount_paid), 0) as total_pagado
            FROM loans l
            LEFT JOIN loan_payments p ON l.id = p.loan_id
            WHERE l.id = $1
            GROUP BY l.loan_amount
        `, [loanId]);

        if (checkResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).send('<h1>Error: Préstamo no encontrado o eliminado. ❌</h1>');
        }

        const montoOriginal = parseFloat(checkResult.rows[0].loan_amount);
        const totalPagadoAntes = parseFloat(checkResult.rows[0].total_pagado);
        const balancePendiente = montoOriginal - totalPagadoAntes;

        // ESCUDO 3: Evitar sobrepagos maliciosos o accidentales
        if (montoAbono > balancePendiente) {
            await client.query('ROLLBACK');
            return res.status(400).send(`<h1>Error: El pago (RD$ ${montoAbono.toFixed(2)}) supera el balance pendiente real (RD$ ${balancePendiente.toFixed(2)}). ❌</h1>`);
        }

        // 1. Insertar el nuevo pago de forma segura
        await client.query(
            `INSERT INTO loan_payments (loan_id, payment_date, amount_paid, payment_method, notes) 
             VALUES ($1, $2, $3, $4, $5)`,
            [loanId, payment_date, montoAbono, payment_method || null, notes || null]
        );

        // 2. Calcular el nuevo estado matemáticamente sin re-consultar la base de datos
        const nuevoTotalPagado = totalPagadoAntes + montoAbono;
        const nuevoEstado = nuevoTotalPagado >= montoOriginal ? 'pagado' : 'activo';

        // 3. Actualizar el estado del préstamo
        await client.query(
            `UPDATE loans SET status = $1 WHERE id = $2`,
            [nuevoEstado, loanId]
        );

        await client.query('COMMIT');
        res.redirect(`/prestamo/${loanId}`);

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error("Error al registrar el pago del préstamo:", error);
        res.status(500).send('<h1>Error al registrar el pago ❌</h1>');
    } finally {
        if (client) client.release(); // CORRECCIÓN CRÍTICA: Solo se ejecuta si client fue exitosamente asignado
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
                   <form id="payroll-form">
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
    // 1. Lógica visual: Actualizar el neto cuando se escribe
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

    // 2. Lógica de Envío: Armar el JSON y enviar a la Súper Nómina
    document.getElementById('payroll-form').addEventListener('submit', async (e) => {
        e.preventDefault(); // Evita que la página recargue

        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true; 
        submitBtn.textContent = 'Procesando... ⏳';

        const payDate = document.getElementById('pay_date').value;
        const nominaArray = [];

        // Recorremos cada fila para armar el paquete (Sin backticks problemáticos)
        document.querySelectorAll('tbody tr[data-employee-id]').forEach(row => {
            const employeeId = row.dataset.employeeId;
            const baseSalary = parseFloat(row.querySelector('[data-base-salary]').dataset.baseSalary) || 0;
            
            // Usamos comillas simples y el signo + para que Node.js no se confunda
            const inputBono = row.querySelector('input[name="bonuses_' + employeeId + '"]');
            const inputDesc = row.querySelector('input[name="deductions_' + employeeId + '"]');
            
            const bonuses = inputBono ? (parseFloat(inputBono.value) || 0) : 0;
            const deductions = inputDesc ? (parseFloat(inputDesc.value) || 0) : 0;
            const netPay = baseSalary + bonuses - deductions;

            nominaArray.push({
                employee_id: employeeId,
                base_salary: baseSalary,
                bonuses: bonuses,
                deductions: deductions,
                loan_deduction: deductions,
                net_pay: netPay,
                extras: []
            });
        });

        // Enviamos el paquete
        try {
            const response = await fetch('/procesar-super-nomina', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pay_date: payDate, nomina: nominaArray })
            });
            
            const result = await response.json();
            
            if (result.success) {
                alert('✅ Nómina procesada con éxito!');
                window.location.href = '/historial-nomina';
            } else {
                alert('❌ Error: ' + result.message);
                submitBtn.disabled = false;
                submitBtn.textContent = 'Guardar y Procesar Nómina';
            }
        } catch (error) {
            alert('❌ Error de conexión al procesar.');
            console.error(error);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Guardar y Procesar Nómina';
        }
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
});// =============================================================
// 📅 HISTORIAL DE NÓMINAS (BLINDADO CONTRA TEXTOS Y CEROS)
// =============================================================
app.get('/historial-nomina', requireLogin, requireAdminOrCoord, async (req, res) => {
    let client;
    try {
        client = await pool.connect();

        // CERO-PROOF SQL: NULLIF convierte textos vacíos en NULL para que COALESCE pueda actuar
        const query = `
            SELECT 
                payroll_id,
                MAX(pay_date) as fecha_pago,
                COUNT(employee_id) as total_empleados,
                SUM(CAST(COALESCE(NULLIF(net_pay::text, ''), '0') AS NUMERIC)) as total_pagado,
                MAX(createdat) as fecha_creacion
            FROM payroll_records
            WHERE payroll_id IS NOT NULL
            GROUP BY payroll_id
            ORDER BY fecha_pago DESC, payroll_id DESC
        `;

        const result = await client.query(query);
        const nominas = result.rows;

        let tarjetasHtml = nominas.map(n => {
            const fechaObj = new Date(n.fecha_pago);
            const fechaTexto = fechaObj.toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' });
            const total = parseFloat(n.total_pagado || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
            
            return `
            <div class="card" style="border-left: 5px solid #4e73df; margin-bottom: 20px; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <h3 style="margin:0; color:#4e73df;">📅 Nómina: ${fechaTexto}</h3>
                        <small style="color:#858796;">Lote ID: ${n.payroll_id}</small>
                        <p style="margin-top:10px; font-weight:bold; font-size: 1.1em;">
                            👥 ${n.total_empleados} Colaboradores | 💰 Total: RD$ ${total}
                        </p>
                    </div>
                    <div>
                        <a href="/ver-detalle-nomina/${n.payroll_id}" class="btn" style="background:#4e73df; color:white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                            Ver Detalle y Recibos ➔
                        </a>
                    </div>
                </div>
            </div>`;
        }).join('');

        res.send(`
            <!DOCTYPE html><html lang="es">
            <head>${commonHtmlHead}</head>
            <body>
                <div class="container" style="max-width: 900px;">
                    <div style="margin-bottom: 20px;">${backToDashboardLink}</div>
                    <h1>🗂️ Archivo de Nóminas</h1>
                    ${tarjetasHtml || '<div class="card" style="text-align:center; padding:40px;"><h3>📭 No hay nóminas registradas.</h3></div>'}
                </div>
            </body></html>
        `);

    } catch (e) {
        console.error(e);
        res.status(500).send("Error en historial: " + e.message);
    } finally {
        if (client) client.release();
    }
});

app.get('/nomina/requisicion', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { id } = req.query; // RECIBE EL ID DEL LOTE
    if (!id) return res.send("⚠️ Error: Falta el ID de nómina.");

    let client;
    try {
        client = await pool.connect();

        // Agrupamos por empleado y sumamos todos sus conceptos para erradicar filas duplicadas.
        // Además, corregimos e.nombre por first_name y last_name para matar los "null".
        const query = `
        SELECT 
            pr.employee_id,
            COALESCE(e.first_name || ' ' || e.last_name, 'Empleado Eliminado') as colaborador,
            SUM(CAST(COALESCE(NULLIF(pr.base_salary_paid::text, ''), '0') AS NUMERIC)) as sueldo_bruto,
            SUM(CAST(COALESCE(NULLIF(pr.bonuses::text, ''), '0') AS NUMERIC)) as incentivos,
            SUM(CAST(COALESCE(NULLIF(pr.loan_deduction::text, ''), '0') AS NUMERIC)) as prestamos, 
            SUM(CAST(COALESCE(NULLIF(pr.deductions::text, ''), '0') AS NUMERIC)) as otros_descuentos,
            SUM(CAST(COALESCE(NULLIF(pr.net_pay::text, ''), '0') AS NUMERIC)) as neto_a_pagar
        FROM payroll_records pr
        LEFT JOIN employees e ON pr.employee_id = e.id
        WHERE CAST(pr.payroll_id AS TEXT) = $1
        GROUP BY pr.employee_id, e.first_name, e.last_name
        ORDER BY colaborador ASC
        `;
        
        const result = await client.query(query, [id]);
        const nomina = result.rows;

        if (nomina.length === 0) return res.send("<h1>No se encontraron datos para este lote.</h1>");

        let t_neto = 0;
        const filasHtml = nomina.map(row => {
            t_neto += parseFloat(row.neto_a_pagar || 0);
            return `
            <tr>
                <td style="text-align:left;"><b>${row.colaborador.trim()}</b></td>
                <td>${parseFloat(row.sueldo_bruto || 0).toFixed(2)}</td>
                <td>${parseFloat(row.incentivos || 0).toFixed(2)}</td>
                <td style="color:red;">${parseFloat(row.prestamos || 0).toFixed(2)}</td>
                <td style="color:red;">${parseFloat(row.otros_descuentos || 0).toFixed(2)}</td>
                <td style="font-weight:bold;">${parseFloat(row.neto_a_pagar || 0).toFixed(2)}</td>
            </tr>`;
        }).join('');

        res.send(`
        <html>
        <head><style>body{font-family:sans-serif;padding:30px;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #ccc;padding:10px;text-align:right;}</style></head>
        <body>
            <h2>Be Eventos - Requisición Lote: ${id}</h2>
            <table>
                <thead><tr><th>Colaborador</th><th>Sueldo</th><th>Bonos</th><th>Préstamos</th><th>Otros</th><th>Neto</th></tr></thead>
                <tbody>${filasHtml}<tr><td colspan="5">TOTAL A PAGAR</td><td>RD$ ${t_neto.toFixed(2)}</td></tr></tbody>
            </table>
            <button onclick="window.print()" style="margin-top: 20px; padding: 10px 20px; font-size: 16px;">🖨️ Imprimir</button>
        </body></html>`);
    } catch (e) { 
        res.status(500).send("Error: " + e.message); 
    } finally { 
        if (client) client.release(); 
    }
});

app.get('/ver-detalle-nomina/:payroll_id', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { payroll_id } = req.params;
    let client;
    try {
        client = await pool.connect();
        
        // CERO-PROOF APLICADO: Usamos LEFT JOIN y COALESCE para atrapar a los borrados del pasado
        const query = `
            SELECT DISTINCT 
                pr.employee_id as id, 
                COALESCE(e.first_name || ' ' || e.last_name, 'Empleado Eliminado') as nombre_completo,
                pr.pay_date
            FROM payroll_records pr
            LEFT JOIN employees e ON pr.employee_id = e.id
            WHERE CAST(pr.payroll_id AS TEXT) = $1
            ORDER BY nombre_completo ASC
        `;
        
        const resDetalle = await client.query(query, [payroll_id.toString().trim()]);
        
        const fechaNomina = resDetalle.rows.length > 0 ? new Date(resDetalle.rows[0].pay_date).toISOString().split('T')[0] : '';

        let filas = resDetalle.rows.map(emp => {
            return `
            <tr>
                <td style="font-weight:bold; padding:15px;">${emp.nombre_completo.trim()}</td>
                <td style="text-align:center;">
                    ${emp.nombre_completo !== 'Empleado Eliminado' ? 
                        `<a href="/ver-recibo/${payroll_id}/${emp.id}" target="_blank" class="btn" style="background:#007bff; color:white; text-decoration:none; padding:5px 15px; font-size:12px; border-radius:4px;">🖨️ Recibo</a>` 
                        : '<span style="color:red; font-size:12px;">Historial no disponible</span>'
                    }
                </td>
            </tr>`;
        }).join('');

        res.send(`
            <!DOCTYPE html><html lang="es">
            <head>${commonHtmlHead}
                <title>Detalle Lote #${payroll_id}</title>
            </head>
            <body>
                <div class="container" style="max-width:900px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                        <a href="/historial-nomina" style="text-decoration:none; color:#007bff; font-weight:bold;">← Volver al Archivo</a>
                        
                        ${payroll_id ? 
                            `<div style="display: flex; gap: 10px;">
                                <a href="/imprimir-todos-recibos/${payroll_id}" target="_blank" class="btn" style="background:#17a2b8; color:white; padding:10px 20px; font-weight:bold; text-decoration:none; border-radius:6px;">
                                    📄 IMPRIMIR TODOS LOS RECIBOS
                                </a>
                                <a href="/nomina/requisicion?id=${payroll_id}" target="_blank" class="btn" style="background:#28a745; color:white; padding:10px 20px; font-weight:bold; text-decoration:none; border-radius:6px;">
                                    🖨️ IMPRIMIR REQUISICIÓN (PDF)
                                </a>
                             </div>` 
                            : ''}
                    </div>

                    <h1 style="margin-top:10px;">Detalle de Pagos: Lote #${payroll_id}</h1>
                    <table class="modern-table" style="background:white; margin-top:30px; width:100%;">
                        <thead><tr><th>Colaborador</th><th style="text-align:center;">Acciones</th></tr></thead>
                        <tbody>${filas || '<tr><td colspan="2">No se encontraron registros.</td></tr>'}</tbody>
                    </table>
                </div>
            </body></html>`);
    } catch (e) { res.status(500).send("Error: " + e.message); } finally { if (client) client.release(); }
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
        
        // --- LÓGICA DE CÁLCULOS PROTEGIDA ---
const montoOriginal = parseFloat(quote.preciofinalporestudiante || 0) * parseFloat(quote.estudiantesparafacturar || 0);

// Escudo para Ajustes
const totalAjustes = adjustmentsResult.rows.reduce((sum, adj) => {
    const val = parseFloat(adj.monto_ajuste);
    return sum + (isNaN(val) ? 0 : val);
}, 0);

const totalVenta = montoOriginal + totalAjustes;

// Escudo para Abonos
const totalAbonado = payments.reduce((sum, p) => {
    const val = parseFloat(p.amount);
    return sum + (isNaN(val) ? 0 : val);
}, 0);

// EL ESCUDO CRÍTICO: Escudo para Gastos (Donde vive el NaN de Griselda)
const totalGastado = expenses.reduce((sum, e) => {
    const val = parseFloat(e.amount);
    return sum + (isNaN(val) ? 0 : val);
}, 0);

const balancePendiente = totalVenta - totalAbonado;
const rentabilidad = totalAbonado - totalGastado;
const rentabilidadProyectada = totalVenta - totalGastado;
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
        
       let expensesHtml = expenses.map(e => {
    const montoLimpio = isNaN(parseFloat(e.amount)) ? 0 : parseFloat(e.amount);
    return `
        <tr>
            <td>${new Date(e.expense_date).toLocaleDateString()}</td>
            <td>${e.supplier_name}</td>
            <td>${e.description}</td>
            <td style="font-weight: bold; color: #dc3545;">$${montoLimpio.toFixed(2)}</td>
            <td>${e.type || ''}</td>
            <td style="text-align: center;">
                <a href="/desembolso/${e.id}/pdf" target="_blank" class="btn" style="padding: 5px 10px; font-size: 14px;">Imprimir</a>
            </td>
        </tr>`;
}).join('') || '<tr><td colspan="6">No hay gastos registrados.</td></tr>';

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
                    // Añade este cuadro al final de la clase "summary"
<div class="summary-box">
    <h3>Rentabilidad Final (Proyectada)</h3>
    <p class="amount" style="color: #4e73df;">$${rentabilidadProyectada.toFixed(2)}</p>
    <small style="color: gray;">Ganancia total al cobrar el 100%</small>
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

        const totalAjustes = adjustmentsResult.rows.reduce((sum, adj) => {
            const val = parseFloat(adj.monto_ajuste);
            return sum + (isNaN(val) ? 0 : val);
        }, 0);

        const totalVenta = montoOriginal + totalAjustes;

        const totalAbonado = payments.reduce((sum, p) => {
            const val = parseFloat(p.amount);
            return sum + (isNaN(val) ? 0 : val);
        }, 0);

        const totalGastado = expenses.reduce((sum, e) => {
            const val = parseFloat(e.amount);
            return sum + (isNaN(val) ? 0 : val);
        }, 0);

        const rentabilidad = totalAbonado - totalGastado;
        
        // --- VERIFICACIÓN DE TRANSACCIONES PARA EL BOTÓN DE REVERTIR ---
        const tieneTransacciones = payments.length > 0 || expenses.length > 0;
        const disabledAttr = tieneTransacciones ? 'disabled title="Debes borrar todos los abonos y gastos antes de revertir"' : '';
        const revertirStyle = tieneTransacciones ? 'background-color: #e0e0e0; color: #9e9e9e; cursor: not-allowed;' : 'background-color: #dc3545; color: white;';

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

        // --- ABONOS CON BOTONES DE EDICIÓN Y ELIMINACIÓN ---
        let paymentsHtml = payments.map(p => `
            <tr>
                <td>${new Date(p.payment_date).toLocaleDateString()}</td>
                <td style="font-weight:600; color:var(--success);">$${parseFloat(p.amount).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                <td>${p.students_covered || 'N/A'}</td>
                <td>${p.comment || ''}</td>
                <td style="text-align: center; display: flex; gap: 5px; justify-content: center;">
                    <a href="/recibo-pago/${p.id}/pdf" target="_blank" class="btn" style="background-color: #4e73df; color:white; padding: 4px 8px; font-size: 11px; font-weight: bold; text-decoration: none; border-radius: 4px;" title="Imprimir Recibo">🖨️</a>
                    
                    <button onclick="editarPago(${p.id}, '${p.amount}', '${p.comment}')" class="btn" style="background-color: #f6c23e; color:white; padding: 4px 8px; font-size: 11px; font-weight: bold; border: none; border-radius: 4px; cursor: pointer;" title="Editar Abono">✏️</button>
                    
                    <form action="/proyecto/${quote.id}/eliminar-pago/${p.id}" method="POST" style="margin:0;" onsubmit="return confirm('ADMINISTRADOR: ¿Seguro que deseas eliminar este abono? La rentabilidad bajará automáticamente.');">
                        <button type="submit" class="btn" style="background-color: #e74a3b; color:white; padding: 4px 8px; font-size: 11px; font-weight: bold; border: none; border-radius: 4px; cursor: pointer;" title="Eliminar Abono">🗑️</button>
                    </form>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="5" style="text-align:center;">No hay pagos registrados.</td></tr>';

        // --- GASTOS CON BOTONES DE EDICIÓN Y ELIMINACIÓN ---
        let expensesHtml = expenses.map(e => {
            const montoLimpio = isNaN(parseFloat(e.amount)) ? 0 : parseFloat(e.amount);
            return `
                <tr>
                    <td>${new Date(e.expense_date).toLocaleDateString()}</td>
                    <td><b>${e.supplier_name}</b></td>
                    <td>${e.description}</td>
                    <td style="font-weight: 700; color: var(--danger);">$${montoLimpio.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    <td><span style="font-size: 10px; background: #f8f9fc; padding: 2px 5px; border-radius: 4px;">${e.type || 'N/A'}</span></td>
                    <td style="text-align: center; display: flex; gap: 5px; justify-content: center;">
                        <a href="/desembolso/${e.id}/pdf" target="_blank" class="btn" style="background-color: #5a5c69; color:white; padding: 4px 8px; font-size: 11px; font-weight: bold; text-decoration: none; border-radius: 4px;" title="Imprimir Comprobante">📄</a>
                        
                        <button onclick="editarGasto(${e.id}, '${e.amount}', '${e.description}')" class="btn" style="background-color: #f6c23e; color:white; padding: 4px 8px; font-size: 11px; font-weight: bold; border: none; border-radius: 4px; cursor: pointer;" title="Editar Gasto">✏️</button>
                        
                        <form action="/proyecto/${quote.id}/eliminar-gasto/${e.id}" method="POST" style="margin:0;" onsubmit="return confirm('ADMINISTRADOR: ¿Seguro que deseas eliminar este gasto? La rentabilidad subirá automáticamente.');">
                            <button type="submit" class="btn" style="background-color: #e74a3b; color:white; padding: 4px 8px; font-size: 11px; font-weight: bold; border: none; border-radius: 4px; cursor: pointer;" title="Eliminar Gasto">🗑️</button>
                        </form>
                    </td>
                </tr>`;
        }).join('') || '<tr><td colspan="6" style="text-align:center;">No hay gastos registrados.</td></tr>';
        
        let suppliersOptionsHtml = suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

        res.send(`
            <!DOCTYPE html><html lang="es">
            <head>
                ${commonHtmlHead.replace('<title>Panel de Administración</title>', `<title>Proyecto ${quote.clientname}</title>`)}
                <style>
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 35px; }
    .summary-box { background: white; padding: 25px 20px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.04); border: 1px solid #eaeaea; position: relative; display: flex; flex-direction: column; justify-content: center; }
    .summary-box h3 { margin: 0 0 10px 0; font-size: 13px; color: #6c757d; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; }
    .summary-box .amount { font-size: 26px; font-weight: 800; margin: 0; color: #2c3e50; }
    .amount.green { color: #28a745 !important; }
    .amount.orange { color: #fd7e14 !important; }
    .amount.blue { color: #4e73df !important; }
    .btn-ajustar-top { position: absolute; top: 15px; right: 15px; font-size: 11px; padding: 4px 8px; background-color: #f8f9fa; color: #495057; border: 1px solid #ced4da; border-radius: 4px; cursor: pointer; font-weight: bold; transition: 0.2s; }
    .btn-ajustar-top:hover { background-color: #e2e6ea; }
    .section-header { display: flex; justify-content: space-between; align-items: center; margin: 40px 0 20px 0; border-bottom: 2px solid #eee; padding-bottom: 10px; }
    .btn-main-action { padding: 12px 25px; font-size: 14px; margin-top: 15px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); border: none; cursor: pointer; border-radius: 6px; font-weight: bold; }
    .modal { display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); }
    .modal-content { background-color: #fefefe; margin: 15% auto; padding: 20px; border: 1px solid #888; width: 400px; border-radius: 10px; }
    
    /* Para que en pantallas pequeñas se pongan de 2 en 2 */
    @media (max-width: 900px) { .summary { grid-template-columns: repeat(2, 1fr); } }
</style>
            </head>
            <body>
                <div class="container">
                    ${backToDashboardLink}
                    <div style="margin-bottom: 30px; position: relative;">
                        <h1 style="margin:0; color: #2c3e50;">${quote.clientname}</h1>
                        <p style="color: #6c757d; margin-bottom: 15px; font-size: 15px;">Cotización #${quote.quotenumber} &bull; Asesor: ${quote.advisorname}</p>
                        
                        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                            <a href="/ver-cotizacion-pdf/${quote.id}" target="_blank" class="btn" style="background-color: #5a5c69; color: white; padding: 8px 16px; font-size: 13px; font-weight: bold; text-decoration: none; border-radius: 6px; display: inline-flex; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">📄 Ver Cotización Original (PDF)</a>
                            <a href="/proyecto-informe/${quote.id}" target="_blank" class="btn" style="background-color: #17a2b8; color: white; padding: 8px 16px; font-size: 13px; font-weight: bold; text-decoration: none; border-radius: 6px; display: inline-flex; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">📊 Imprimir Informe del Proyecto</a>
                            
                            <form action="/revertir-proyecto/${quote.id}" method="POST" style="margin: 0;" onsubmit="return confirm('ADMINISTRADOR: ¿Seguro que deseas desactivar este centro y regresarlo a la bandeja de pendientes?');">
                                <button type="submit" class="btn" ${disabledAttr} style="${revertirStyle} border: none; padding: 8px 16px; font-size: 13px; font-weight: bold; border-radius: 6px; display: inline-flex; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); cursor: ${tieneTransacciones ? 'not-allowed' : 'pointer'};">
                                    ↩️ Revertir a Pendiente
                                </button>
                            </form>
                        </div>
                    </div>

                    <div class="summary">
    <div class="summary-box" style="border-bottom: 4px solid #858796;">
        <button onclick="abrirModalAjuste()" class="btn-ajustar-top" title="Ajustar Venta">⚙️ Ajustar</button>
        <h3>Monto Total Venta</h3>
        <p class="amount">$${totalVenta.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
    </div>
    <div class="summary-box" style="border-bottom: 4px solid #28a745;">
        <h3>Total Abonado</h3>
        <p class="amount green">$${totalAbonado.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
    </div>
    <div class="summary-box" style="border-bottom: 4px solid #fd7e14;">
        <h3>Total Gastado</h3>
        <p class="amount orange">$${totalGastado.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
    </div>
    <div class="summary-box" style="border-bottom: 4px solid #4e73df; background-color: #f8f9fc;">
        <h3>Rentabilidad Actual</h3>
        <p class="amount blue">$${rentabilidad.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
    </div>
</div>
                    <div class="section-header"><h2>Ingresos (Abonos Realizados)</h2></div>
                    <table><thead><tr><th>Fecha</th><th>Monto</th><th>Estudiantes</th><th>Comentario</th><th style="text-align: center;">Acciones</th></tr></thead><tbody>${paymentsHtml}</tbody></table>
                    <button class="btn btn-activar btn-main-action" style="background-color: #28a745; color: white;" onclick="toggleForm('payment-form-container')">+ Registrar Nuevo Abono</button>
                    
                    <div id="payment-form-container" class="form-container" style="display: none; margin-top:20px; padding: 20px; background: white; border-radius: 8px; border: 1px solid #eaeaea;">
                        <h3 style="margin-top:0; color:#4e73df;">Registrar Nuevo Pago Recibido</h3>
                        <form action="/proyecto/${quote.id}/nuevo-pago" method="POST">
                            <input type="hidden" name="centerId" value="${quote.id}"> 
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                                <div class="form-group" style="display:flex; flex-direction:column;"><label style="font-weight:bold; font-size:13px; margin-bottom:5px;">Fecha de Pago:</label><input type="date" name="payment_date" required style="padding:8px; border:1px solid #ccc; border-radius:4px;"></div>
                                <div class="form-group" style="display:flex; flex-direction:column;"><label style="font-weight:bold; font-size:13px; margin-bottom:5px;">Monto Recibido ($):</label><input type="number" name="amount" step="0.01" required style="padding:8px; border:1px solid #ccc; border-radius:4px;"></div>
                                <div class="form-group" style="grid-column: span 2; display:flex; flex-direction:column;"><label style="font-weight:bold; font-size:13px; margin-bottom:5px;">Comentario / Referencia:</label><textarea name="comment" rows="2" style="padding:8px; border:1px solid #ccc; border-radius:4px;"></textarea></div>
                            </div>
                            <button type="submit" class="btn btn-activar" style="background-color: #28a745; color: white; padding: 10px 20px; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; margin-top: 15px;">Confirmar y Guardar Abono</button>
                        </form>
                    </div>

                    <div class="section-header"><h2>Egresos (Gastos del Proyecto)</h2></div>
                    <table><thead><tr><th>Fecha</th><th>Suplidor</th><th>Descripción</th><th>Monto</th><th>Tipo</th><th style="text-align: center;">Acciones</th></tr></thead><tbody>${expensesHtml}</tbody></table>
                    <button class="btn btn-main-action" style="background-color: #fd7e14; color: white;" onclick="toggleForm('expense-form-container')">+ Registrar Nuevo Gasto</button>
                    
                    <div id="expense-form-container" class="form-container" style="display: none; margin-top:20px; padding: 20px; background: white; border-radius: 8px; border: 1px solid #eaeaea;">
                        <h3 style="margin-top:0; color:#fd7e14;">Registrar Nuevo Egreso / Gasto</h3>
                        <form action="/proyecto/${quote.id}/nuevo-gasto" method="POST">
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                                <div class="form-group" style="display:flex; flex-direction:column;"><label style="font-weight:bold; font-size:13px; margin-bottom:5px;">Fecha del Gasto:</label><input type="date" name="expense_date" required style="padding:8px; border:1px solid #ccc; border-radius:4px;"></div>
                                <div class="form-group" style="display:flex; flex-direction:column;"><label style="font-weight:bold; font-size:13px; margin-bottom:5px;">Suplidor:</label><select name="supplier_id" required style="padding:8px; border:1px solid #ccc; border-radius:4px;"><option value="">Seleccione un suplidor...</option>${suppliersOptionsHtml}</select></div>
                                <div class="form-group" style="display:flex; flex-direction:column;"><label style="font-weight:bold; font-size:13px; margin-bottom:5px;">Monto del Gasto ($):</label><input type="number" name="amount" step="0.01" required style="padding:8px; border:1px solid #ccc; border-radius:4px;"></div>
                                <div class="form-group" style="display:flex; flex-direction:column;"><label style="font-weight:bold; font-size:13px; margin-bottom:5px;">Tipo de Comprobante:</label><select name="type" style="padding:8px; border:1px solid #ccc; border-radius:4px;"><option value="Sin Valor Fiscal">Sin Valor Fiscal</option><option value="Con Valor Fiscal">Con Valor Fiscal</option></select></div>
                                <div class="form-group" style="grid-column: span 2; display:flex; flex-direction:column;"><label style="font-weight:bold; font-size:13px; margin-bottom:5px;">Descripción / Detalle:</label><textarea name="description" rows="2" required style="padding:8px; border:1px solid #ccc; border-radius:4px;"></textarea></div>
                            </div>
                            <button type="submit" class="btn" style="background-color: #fd7e14; color: white; padding: 10px 20px; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; margin-top: 15px;">Confirmar y Guardar Gasto</button>
                        </form>
                    </div>

                    <div class="section-header"><h2>Historial de Ajustes al Precio</h2></div>
                    <table><thead><tr><th>Fecha y Hora</th><th>Monto del Ajuste</th><th>Motivo</th><th>Usuario</th></tr></thead><tbody>${adjustmentsHtml}</tbody></table>
                </div>

                <div id="modalEditarPago" class="modal">
                    <div class="modal-content">
                        <h3 style="margin-top:0; color:#f6c23e;">✏️ Editar Abono</h3>
                        <form id="formEditarPago" method="POST">
                            <input type="hidden" id="edit_pago_id" name="pago_id">
                            <div class="form-group" style="margin-bottom:15px;"><label style="font-weight:bold; font-size:13px; display:block; margin-bottom:5px;">Monto Correcto ($):</label><input type="number" id="edit_pago_monto" name="amount" step="0.01" required style="width:100%; padding:8px; box-sizing:border-box;"></div>
                            <div class="form-group" style="margin-bottom:15px;"><label style="font-weight:bold; font-size:13px; display:block; margin-bottom:5px;">Comentario:</label><input type="text" id="edit_pago_comentario" name="comment" style="width:100%; padding:8px; box-sizing:border-box;"></div>
                            <div style="display:flex; justify-content:flex-end; gap:10px;">
                                <button type="button" onclick="document.getElementById('modalEditarPago').style.display='none'" style="padding:8px 15px; cursor:pointer;">Cancelar</button>
                                <button type="submit" style="background-color:#f6c23e; color:white; border:none; padding:8px 15px; font-weight:bold; cursor:pointer;">Guardar Cambios</button>
                            </div>
                        </form>
                    </div>
                </div>

                <div id="modalEditarGasto" class="modal">
                    <div class="modal-content">
                        <h3 style="margin-top:0; color:#f6c23e;">✏️ Editar Gasto</h3>
                        <form id="formEditarGasto" method="POST">
                            <input type="hidden" id="edit_gasto_id" name="gasto_id">
                            <div class="form-group" style="margin-bottom:15px;"><label style="font-weight:bold; font-size:13px; display:block; margin-bottom:5px;">Monto Correcto ($):</label><input type="number" id="edit_gasto_monto" name="amount" step="0.01" required style="width:100%; padding:8px; box-sizing:border-box;"></div>
                            <div class="form-group" style="margin-bottom:15px;"><label style="font-weight:bold; font-size:13px; display:block; margin-bottom:5px;">Descripción:</label><input type="text" id="edit_gasto_desc" name="description" required style="width:100%; padding:8px; box-sizing:border-box;"></div>
                            <div style="display:flex; justify-content:flex-end; gap:10px;">
                                <button type="button" onclick="document.getElementById('modalEditarGasto').style.display='none'" style="padding:8px 15px; cursor:pointer;">Cancelar</button>
                                <button type="submit" style="background-color:#f6c23e; color:white; border:none; padding:8px 15px; font-weight:bold; cursor:pointer;">Guardar Cambios</button>
                            </div>
                        </form>
                    </div>
                </div>

                <script>
                    function toggleForm(id) { 
                        const el = document.getElementById(id); 
                        el.style.display = (el.style.display === 'none' || el.style.display === '') ? 'block' : 'none'; 
                        if(el.style.display === 'block') el.scrollIntoView({ behavior: 'smooth' });
                    }
                    
                    function editarPago(id, monto, comentario) {
                        document.getElementById('edit_pago_id').value = id;
                        document.getElementById('edit_pago_monto').value = monto;
                        document.getElementById('edit_pago_comentario').value = comentario === 'null' ? '' : comentario;
                        document.getElementById('formEditarPago').action = '/proyecto/${quote.id}/editar-pago/' + id;
                        document.getElementById('modalEditarPago').style.display = 'block';
                    }

                    function editarGasto(id, monto, descripcion) {
                        document.getElementById('edit_gasto_id').value = id;
                        document.getElementById('edit_gasto_monto').value = monto;
                        document.getElementById('edit_gasto_desc').value = descripcion;
                        document.getElementById('formEditarGasto').action = '/proyecto/${quote.id}/editar-gasto/' + id;
                        document.getElementById('modalEditarGasto').style.display = 'block';
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
// ============================================================================
// RUTAS DE AUDITORÍA Y CONTROL ESTRICTO (SOLO ADMINISTRADOR)
// ============================================================================

// --- ESCUDO DE SEGURIDAD FINAL ---
const verificarSoloAdmin = (req, res, next) => {
    // Leemos exactamente la ruta que vimos en tu terminal
    const rol = (req.session?.user?.rol || '').toLowerCase();
    
    if (rol === 'administrador' || rol === 'admin') {
        return next(); // Pasa directo, eres tú.
    }
    
    return res.status(403).send(`
        <div style="text-align: center; margin-top: 50px; font-family: Arial;">
            <h1 style="color: #e74a3b;">Acceso Denegado ❌</h1>
            <p>Solo el Administrador principal puede modificar la auditoría financiera.</p>
            <a href="javascript:history.back()" style="padding: 10px 20px; background: #4e73df; color: white; text-decoration: none; border-radius: 5px;">Volver Atrás</a>
        </div>
    `);
};

// --- 1. REVERTIR PROYECTO A PENDIENTE ---
app.post('/revertir-proyecto/:id', requireLogin, verificarSoloAdmin, async (req, res) => {
    const quoteId = req.params.id;
    let client;
    try {
        client = await pool.connect();
        
        // Doble verificación en backend: Asegurar que realmente está en cero
        const check = await client.query(`
            SELECT 
                (SELECT COUNT(*) FROM payments WHERE quote_id = $1) as abonos,
                (SELECT COUNT(*) FROM expenses WHERE quote_id = $1) as gastos
        `, [quoteId]);
        
        if (parseInt(check.rows[0].abonos) > 0 || parseInt(check.rows[0].gastos) > 0) {
            return res.status(400).send('<h1>Alerta de Seguridad: El proyecto aún tiene transacciones. Bórralas primero. ❌</h1>');
        }

        // Reversión segura
        await client.query("UPDATE quotes SET status = 'formalizada' WHERE id = $1", [quoteId]);
        res.redirect('/clientes');
    } catch (error) {
        console.error("Error al revertir:", error);
        res.status(500).send('<h1>Error al revertir el proyecto ❌</h1>');
    } finally {
        if (client) client.release();
    }
});

// --- 2. ELIMINAR ABONO ---
app.post('/proyecto/:quoteId/eliminar-pago/:pagoId', requireLogin, verificarSoloAdmin, async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        await client.query('DELETE FROM payments WHERE id = $1 AND quote_id = $2', [req.params.pagoId, req.params.quoteId]);
        res.redirect(`/proyecto-detalle/${req.params.quoteId}`);
    } catch (error) {
        console.error("Error al eliminar pago:", error);
        res.status(500).send('<h1>Error al eliminar ❌</h1>');
    } finally {
        if (client) client.release();
    }
});

// --- 3. EDITAR ABONO ---
app.post('/proyecto/:quoteId/editar-pago/:pagoId', requireLogin, verificarSoloAdmin, async (req, res) => {
    const { amount, comment } = req.body;
    const montoLimpio = parseFloat(String(amount).replace(/[^0-9.-]+/g, "")) || 0;
    let client;
    try {
        client = await pool.connect();
        await client.query(
            'UPDATE payments SET amount = $1, comment = $2 WHERE id = $3 AND quote_id = $4', 
            [montoLimpio, comment || null, req.params.pagoId, req.params.quoteId]
        );
        res.redirect(`/proyecto-detalle/${req.params.quoteId}`);
    } catch (error) {
        console.error("Error al editar pago:", error);
        res.status(500).send('<h1>Error al editar ❌</h1>');
    } finally {
        if (client) client.release();
    }
});

// --- 4. ELIMINAR GASTO ---
app.post('/proyecto/:quoteId/eliminar-gasto/:gastoId', requireLogin, verificarSoloAdmin, async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        await client.query('DELETE FROM expenses WHERE id = $1 AND quote_id = $2', [req.params.gastoId, req.params.quoteId]);
        res.redirect(`/proyecto-detalle/${req.params.quoteId}`);
    } catch (error) {
        console.error("Error al eliminar gasto:", error);
        res.status(500).send('<h1>Error al eliminar ❌</h1>');
    } finally {
        if (client) client.release();
    }
});

// --- 5. EDITAR GASTO ---
app.post('/proyecto/:quoteId/editar-gasto/:gastoId', requireLogin, verificarSoloAdmin, async (req, res) => {
    const { amount, description } = req.body;
    const montoLimpio = parseFloat(String(amount).replace(/[^0-9.-]+/g, "")) || 0;
    let client;
    try {
        client = await pool.connect();
        await client.query(
            'UPDATE expenses SET amount = $1, description = $2 WHERE id = $3 AND quote_id = $4', 
            [montoLimpio, description, req.params.gastoId, req.params.quoteId]
        );
        res.redirect(`/proyecto-detalle/${req.params.quoteId}`);
    } catch (error) {
        console.error("Error al editar gasto:", error);
        res.status(500).send('<h1>Error al editar ❌</h1>');
    } finally {
        if (client) client.release();
    }
});
// =============================================================
// 📊 GENERAR INFORME IMPRIMIBLE DEL PROYECTO
// =============================================================
app.get('/proyecto-informe/:id', requireLogin, requireAdminOrCoord, async (req, res) => {
    const quoteId = req.params.id;
    let client;
    try {
        client = await pool.connect();
        
        // 1. Buscamos los datos exactos del proyecto
        const quoteResult = await client.query(`SELECT * FROM quotes WHERE id = $1`, [quoteId]);
        if (quoteResult.rows.length === 0) return res.status(404).send('Proyecto no encontrado');
        const quote = quoteResult.rows[0];

        // 2. Buscamos ingresos, egresos y ajustes
        const [paymentsResult, expensesResult, adjustmentsResult] = await Promise.all([
            client.query(`SELECT * FROM payments WHERE quote_id = $1 ORDER BY payment_date ASC`, [quoteId]),
            client.query(`SELECT e.*, s.name as supplier_name FROM expenses e JOIN suppliers s ON e.supplier_id = s.id WHERE e.quote_id = $1 ORDER BY e.expense_date ASC`, [quoteId]),
            client.query(`SELECT * FROM ajustes_cotizacion WHERE quote_id = $1`, [quoteId])
        ]);

        const payments = paymentsResult.rows;
        const expenses = expensesResult.rows;

        // 3. Calculamos los totales (Igual que en tu pantalla principal)
        const montoOriginal = parseFloat(quote.preciofinalporestudiante || 0) * parseFloat(quote.estudiantesparafacturar || 0);
        const totalAjustes = adjustmentsResult.rows.reduce((sum, adj) => sum + (parseFloat(adj.monto_ajuste) || 0), 0);
        const totalVenta = montoOriginal + totalAjustes;
        const totalAbonado = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        const totalGastado = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
        const rentabilidad = totalAbonado - totalGastado;

        // 4. Armamos las tablas de HTML para imprimir
        const rowsAbonos = payments.map(p => `
            <tr>
                <td style="text-align:center;">${new Date(p.payment_date).toLocaleDateString('es-DO')}</td>
                <td>${p.comment || 'Abono general'}</td>
                <td style="text-align:right; color:#27ae60; font-weight:bold;">$${parseFloat(p.amount).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
            </tr>
        `).join('') || '<tr><td colspan="3" style="text-align:center;">No hay abonos registrados</td></tr>';

        const rowsGastos = expenses.map(e => `
            <tr>
                <td style="text-align:center;">${new Date(e.expense_date).toLocaleDateString('es-DO')}</td>
                <td><b>${e.supplier_name}</b> - ${e.description}</td>
                <td style="text-align:center;">${e.type || 'N/A'}</td>
                <td style="text-align:right; color:#c0392b; font-weight:bold;">$${parseFloat(e.amount).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
            </tr>
        `).join('') || '<tr><td colspan="4" style="text-align:center;">No hay gastos registrados</td></tr>';

        // 5. Renderizamos el diseño del PDF/Impresión
        res.send(`
            <!DOCTYPE html><html lang="es"><head>
                <meta charset="UTF-8">
                <title>Informe - ${quote.clientname}</title>
                <style>
                    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; padding: 30px; margin: 0; background: #fff; }
                    .header { text-align: center; border-bottom: 2px solid #2c3e50; padding-bottom: 20px; margin-bottom: 30px; }
                    .header h1 { margin: 0; color: #2c3e50; font-size: 24px; text-transform: uppercase; }
                    .header p { margin: 5px 0 0; color: #7f8c8d; font-size: 14px; }
                    .summary-grid { display: flex; justify-content: space-between; margin-bottom: 40px; }
                    .summary-card { width: 23%; padding: 15px; border: 1px solid #ddd; border-radius: 8px; text-align: center; background: #fdfdfd; }
                    .summary-card h3 { margin: 0 0 10px 0; font-size: 11px; color: #7f8c8d; text-transform: uppercase; letter-spacing: 1px; }
                    .summary-card p { margin: 0; font-size: 20px; font-weight: bold; }
                    
                    /* Colores para las tarjetas */
                    .val-venta { color: #2980b9; }
                    .val-abonado { color: #27ae60; }
                    .val-gastado { color: #e67e22; }
                    .val-renta { color: #8e44ad; }

                    .section-title { font-size: 16px; color: #2c3e50; border-bottom: 1px solid #ccc; padding-bottom: 5px; margin-top: 30px; margin-bottom: 15px; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
                    th, td { border: 1px solid #ddd; padding: 10px; }
                    th { background-color: #f4f6f7; color: #2c3e50; text-transform: uppercase; font-size: 11px; }
                    
                    @media print {
                        .no-print { display: none !important; }
                        body { padding: 0; }
                    }
                </style>
            </head><body>
                <div class="no-print" style="text-align: right; margin-bottom: 20px;">
                    <button onclick="window.print()" style="padding: 10px 20px; background: #4e73df; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">🖨️ Imprimir o Guardar PDF</button>
                    <button onclick="window.close()" style="padding: 10px 20px; background: #e74a3b; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; margin-left: 10px;">❌ Cerrar</button>
                </div>

                <div class="header">
                    <h1>Be Eventos</h1>
                    <h2 style="margin: 10px 0 5px 0; color: #34495e;">INFORME DE RENTABILIDAD DE PROYECTO</h2>
                    <p><strong>Centro:</strong> ${quote.clientname}</p>
                    <p><strong>ID Cotización:</strong> #${quote.quotenumber} | <strong>Asesor:</strong> ${quote.advisorname}</p>
                    <p><strong>Fecha de Emisión:</strong> ${new Date().toLocaleDateString('es-DO')} a las ${new Date().toLocaleTimeString('es-DO')}</p>
                </div>

                <div class="summary-grid">
                    <div class="summary-card">
                        <h3>Monto Total Venta</h3>
                        <p class="val-venta">$${totalVenta.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
                    </div>
                    <div class="summary-card">
                        <h3>Total Recaudado</h3>
                        <p class="val-abonado">$${totalAbonado.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
                    </div>
                    <div class="summary-card">
                        <h3>Total Gastado</h3>
                        <p class="val-gastado">$${totalGastado.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
                    </div>
                    <div class="summary-card">
                        <h3>Rentabilidad Final</h3>
                        <p class="val-renta">$${rentabilidad.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
                    </div>
                </div>

                <div class="section-title">DETALLE DE INGRESOS (ABONOS)</div>
                <table>
                    <thead><tr><th style="width:15%;">Fecha</th><th>Descripción del Abono</th><th style="width:25%;">Monto Recibido</th></tr></thead>
                    <tbody>${rowsAbonos}</tbody>
                </table>

                <div class="section-title">DETALLE DE EGRESOS (GASTOS)</div>
                <table>
                    <thead><tr><th style="width:15%;">Fecha</th><th>Suplidor / Concepto</th><th style="width:20%;">Comprobante</th><th style="width:25%;">Monto Pagado</th></tr></thead>
                    <tbody>${rowsGastos}</tbody>
                </table>

                <div style="margin-top: 50px; text-align: center; color: #7f8c8d; font-size: 11px;">
                    <p>_________________________________________</p>
                    <p>Firma / Sello de Revisión Administrativa</p>
                    <p>Este documento es un informe interno generado por Be Gestion.</p>
                </div>

                <script>
                    // Dispara la ventana de impresión automáticamente al abrir
                    window.onload = function() { window.print(); }
                </script>
            </body></html>
        `);
    } catch (e) {
        console.error(e);
        res.status(500).send("Error al generar el informe");
    } finally {
        if(client) client.release();
    }
});

app.post('/proyecto/:id/nuevo-pago', requireLogin, requireAdminOrCoord, async (req, res) => {
    const quoteId = req.params.id; 
    const { payment_date, amount, students_covered, comment } = req.body;
    
    // --- 1. VALIDACIÓN PREVIA (ESCUDO DE SEGURIDAD) ---
    // Evitamos que entre basura a la base de datos si el monto no es válido.
    if (!amount || isNaN(parseFloat(amount))) {
        return res.status(400).send("Error: El monto ingresado no es válido.");
    }
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // --- 2. DATOS DE LA COTIZACIÓN ---
        const quoteResult = await client.query(
            'SELECT advisorname, clientname, aporte_institucion, preciofinalporestudiante FROM quotes WHERE id = $1', 
            [quoteId]
        );
        
        if (quoteResult.rows.length === 0) {
            throw new Error("Cotización no encontrada");
        }

        const { advisorname, clientname, aporte_institucion, preciofinalporestudiante } = quoteResult.rows[0];

        // --- 3. CÁLCULOS MATEMÁTICOS (VENTA NETA) ---
        const montoAbono = parseFloat(amount);
        // Evitamos división por cero usando lógica segura
        const precioEstudiante = parseFloat(preciofinalporestudiante || 0);
        const factor = (precioEstudiante > 0) ? (montoAbono / precioEstudiante) : 0;
        
        // Calculamos cuánto de este abono pertenece al "Fondo Institucional"
        const montoAporteRetenido = factor * parseFloat(aporte_institucion || 0);
        
        // La comisión se paga sobre lo que queda (Base Comisionable)
        const baseComisionable = montoAbono - montoAporteRetenido;

        // --- 4. INSERTAR EL PAGO ---
        const payRes = await client.query(
            `INSERT INTO payments (quote_id, payment_date, amount, students_covered, comment, monto_aporte_retenido, base_comisionable) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [quoteId, payment_date, montoAbono, students_covered || null, comment, montoAporteRetenido, baseComisionable]
        );
        const newPaymentId = payRes.rows[0].id;

        // --- 5. LÓGICA DE COMISIONES ---
        // A. Comisión del Vendedor (Asesor)
        const advRes = await client.query('SELECT * FROM advisors WHERE name = $1', [advisorname]);
        
        if (advRes.rows.length > 0) {
            const advisor = advRes.rows[0];
            const advisorAmount = baseComisionable * parseFloat(advisor.commission_rate || 0);

            // Insertamos Comisión Venta Directa
            await client.query(
                `INSERT INTO commissions (payment_id, advisor_id, commission_type, base_amount, commission_rate, commission_amount)
                 VALUES ($1, $2, 'venta', $3, $4, $5)`,
                [newPaymentId, advisor.id, baseComisionable, advisor.commission_rate, advisorAmount]
            );
            
            // B. Comisión de Coordinación (CORREGIDO)
            // Si el vendedor NO es coordinador, buscamos a su jefe (o al coordinador general)
            if (!advisor.is_coordinator) {
                
                // PASO CRÍTICO: Buscar al coordinador en la BD antes de usarlo
                // Aquí buscamos al primer asesor que tenga el rol de coordinador activo
                const coordRes = await client.query("SELECT id FROM advisors WHERE is_coordinator = true LIMIT 1");
                const coordinator = coordRes.rows[0];

                if (coordinator) {
                    // Buscamos la tasa de la App o usamos 2% por defecto
                    const rateRes = await client.query(`SELECT value FROM app_settings WHERE key = 'coordinator_override_rate'`);
                    const rawRate = rateRes.rows.length > 0 ? rateRes.rows[0].value : '0.02';
                    const coordRate = !isNaN(parseFloat(rawRate)) ? parseFloat(rawRate) : 0.02;

                    const coordAmount = baseComisionable * coordRate;

                    // Insertamos solo si el cálculo es válido
                    if (!isNaN(coordAmount)) {
                        await client.query(
                            `INSERT INTO commissions (payment_id, advisor_id, commission_type, base_amount, commission_rate, commission_amount)
                             VALUES ($1, $2, 'coordinador', $3, $4, $5)`,
                            [newPaymentId, coordinator.id, baseComisionable, coordRate, coordAmount]
                        );
                    }
                } else {
                    console.warn("AVISO: Se registró el pago pero no se encontró un coordinador activo para asignar comisión.");
                }
            }
        }

        // --- 6. REDIRECCIÓN INTELIGENTE ---
        // Buscamos el ID real del centro para redirigir al usuario a la página correcta
        const centerResult = await client.query(
            'SELECT id FROM centers WHERE name = (SELECT clientname FROM quotes WHERE id = $1)', 
            [quoteId]
        );
        const realCenterId = centerResult.rows.length > 0 ? centerResult.rows[0].id : null;

        await client.query('COMMIT');
        
        if (realCenterId) {
            res.redirect(`/proyecto/${realCenterId}`);
        } else {
            res.redirect('/clientes');
        }

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error("Error al procesar pago:", error);
        // Enviamos un error 500 pero con texto para saber qué pasó
        res.status(500).send(`<h1>Error al guardar el pago</h1><p>${error.message}</p>`);
    } finally {
        if (client) client.release();
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
        
        // CORRECCIÓN 1 Y 2: GROUP BY para consolidar múltiples préstamos y evitar filas duplicadas.
        // Además, añadimos el filtro de estado para excluir a empleados desactivados.
        const employeesRes = await client.query(`
            SELECT e.id, e.first_name, e.last_name, e.base_salary,
                   COALESCE(SUM(l.balance), 0) as balance_prestamo,
                   MAX(l.loan_id) as loan_id
            FROM employees e
            LEFT JOIN (
                SELECT employee_id, id as loan_id,
                       (loan_amount - (SELECT COALESCE(SUM(amount_paid), 0) FROM loan_payments WHERE loan_id = loans.id)) as balance
                FROM loans
                WHERE status = 'activo'
            ) l ON e.id = l.employee_id
            WHERE (e.participa_en_nomina = true OR e.participa_nomina = true)
              AND (e.estado = 'activo' OR e.estado IS NULL)
            GROUP BY e.id, e.first_name, e.last_name, e.base_salary
            ORDER BY e.first_name, e.last_name ASC
        `);

        const employees = employeesRes.rows;
        const quotesRes = await client.query("SELECT id, clientname FROM quotes WHERE status = 'activa' ORDER BY clientname ASC");
        const activeProjects = quotesRes.rows;
        
        // CORRECCIÓN 4 (Parte Frontend): Estructuramos las opciones mapeadas para el buscador <datalist>
        const projectOptions = activeProjects.map(p => `<option data-id="${p.id}" value="${p.clientname}"></option>`).join('');

        let employeesRows = employees.map(emp => {
            // CORRECCIÓN 3: Eliminamos el mapeo dinámico impreciso de llaves. Forzamos first_name y last_name.
            const nombreEmpleado = `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || "No identificado";
            
            const sueldoOriginal = parseFloat(emp.base_salary || 0);
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
                    .extra-row input, .extra-row select, .extra-row input.project-search { padding: 6px; font-size: 12px; border: 1px solid #ddd; border-radius: 5px; width: 100%; box-sizing: border-box; }
                    .btn-delete { color: #ff4d4d; cursor: pointer; font-size: 20px; text-align: center; }
                    th { text-align: left; padding: 10px; background: #f8f9fa; }
                </style>
            </head>
            <body>
                <datalist id="projects-list">
                    ${projectOptions}
                </datalist>

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
                    function addExtraRow(empId) {
                        const container = document.getElementById('extras-container-' + empId);
                        const noExtrasMsg = container.querySelector('.no-extras-msg');
                        if (noExtrasMsg) noExtrasMsg.remove();
                        const div = document.createElement('div');
                        div.className = 'extra-row';
                        
                        // CORRECCIÓN 4: Reemplazamos <select> por un input con enlace a 'projects-list' (autocompletado nativo)
                        div.innerHTML = '<input type="date" class="extra-date">' +
                            '<input type="text" class="project-search" list="projects-list" placeholder="-- Buscar Centro/Colegio --" onchange="syncProjectId(this)">' +
                            '<input type="hidden" class="extra-project" value="">' + // Mantiene el id real para no romper tu backend
                            '<input type="text" class="extra-desc" placeholder="¿Qué hizo?">' +
                            '<input type="number" class="extra-amount" value="0" step="0.01">' +
                            '<div class="btn-delete" onclick="this.parentElement.remove()">×</div>';
                        container.appendChild(div);
                    }

                    // Función intermedia para interceptar el texto del buscador y mapear su ID real
                    function syncProjectId(inputElement) {
                        const value = inputElement.value;
                        const options = document.getElementById('projects-list').options;
                        let idMatch = "";
                        for (let i = 0; i < options.length; i++) {
                            if (options[i].value === value) {
                                idMatch = options[i].getAttribute('data-id');
                                break;
                            }
                        }
                        // Guardamos el ID en el input oculto que ya procesa tu lógica existente
                        inputElement.parentElement.querySelector('.extra-project').value = idMatch;
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
                                        quote_id: ex.querySelector('.extra-project').value, // Lee el ID mapeado correctamente
                                        desc: ex.querySelector('.extra-desc').value,
                                        amount: monto
                                    });
                                    totalExtras += monto;
                                }
                            });

                            if(sueldo > 0 || totalExtras > 0 || deduccion > 0) {
                                payload.push({ 
                                    employee_id: empId, 
                                    base_salary: sueldo,         
                                    bonuses: totalExtras,        
                                    loan_id: loanId, 
                                    loan_deduction: deduccion,
                                    deductions: 0,               
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
            </body></html>
        `);
    } catch (e) { res.status(500).send(e.message); } finally { if (client) client.release(); }
});


app.get('/ver-recibo/:payroll_id/:employee_id', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { payroll_id, employee_id } = req.params;
    let client;
    try {
        client = await pool.connect();
        
        // 1. Obtener datos EXACTOS del registro de nómina
        const recordRes = await client.query(`
            SELECT pr.*, 
                   COALESCE(e.first_name || ' ' || e.last_name, 'Empleado Eliminado') as nombre_completo
            FROM payroll_records pr
            LEFT JOIN employees e ON pr.employee_id = e.id
            WHERE CAST(pr.payroll_id AS TEXT) = $1 AND pr.employee_id = $2
        `, [payroll_id.toString().trim(), employee_id]);
        
        if (recordRes.rows.length === 0) return res.send("<h1>Recibo no encontrado.</h1>");
        const pago = recordRes.rows[0];
        const fechaPago = new Date(pago.pay_date).toLocaleDateString('es-DO');

        // 2. Obtener los extras
        const extrasRes = await client.query(`
            SELECT pe.*, q.clientname 
            FROM payroll_extras pe
            LEFT JOIN quotes q ON pe.quote_id = q.id
            WHERE CAST(pe.payroll_id AS TEXT) = $1 AND pe.employee_id = $2
            ORDER BY pe.payment_date ASC
        `, [payroll_id.toString().trim(), employee_id]);
        
        let filasExtras = extrasRes.rows.map(ex => `
            <tr>
                <td>${new Date(ex.payment_date || pago.pay_date).toLocaleDateString('es-DO')}</td>
                <td>${ex.description || 'Actividad Extra'}</td>
                <td>${ex.clientname || 'Administración'}</td>
                <td style="text-align:right;">RD$ ${parseFloat(ex.amount).toFixed(2)}</td>
            </tr>
        `).join('');

        let filaDeduccion = '';
        const totalDeducido = parseFloat(pago.base_salary_paid || 0) + parseFloat(pago.bonuses || 0) - parseFloat(pago.net_pay || 0);
        if (totalDeducido > 0) {
            filaDeduccion = `
            <tr>
                <td>${fechaPago}</td>
                <td style="color:red; font-weight:bold;">Descuentos / Abono a Préstamo</td>
                <td>---</td>
                <td style="text-align:right; color:red; font-weight:bold;">- RD$ ${totalDeducido.toFixed(2)}</td>
            </tr>`;
        }

        res.send(`
            <!DOCTYPE html><html lang="es">
            <head>
                <meta charset="UTF-8">
                <title>Recibo - ${pago.nombre_completo}</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #333; max-width: 800px; margin: 0 auto; }
                    .recibo-header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 20px; }
                    .info-grid { display: grid; grid-template-columns: 1fr 1fr; margin-bottom: 30px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
                    th { background-color: #f2f2f2; font-weight: bold; }
                    .total-section { margin-top: 30px; text-align: right; font-size: 1.2em; }
                    .btn-print { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; margin-bottom: 20px; font-size: 16px; }
                    .firmas-container { margin-top: 80px; display: grid; grid-template-columns: 1fr 1fr; gap: 50px; }
                    @media print { .btn-print { display: none; } body { padding: 0; } }
                </style>
            </head>
            <body>
                <button class="btn-print" onclick="window.print()">🖨️ Imprimir Recibo Individual</button>
                <div class="recibo-header">
                    <h2>RECIBO DE PAGO DE PERSONAL</h2>
                    <p>Be Eventos - Quincena correspondiente al ${fechaPago}</p>
                </div>
                
                <div class="info-grid">
                    <div><strong>Colaborador:</strong> ${pago.nombre_completo}</div>
                    <div style="text-align:right;"><strong>Lote de Pago:</strong> #${payroll_id}</div>
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
                            <td>${fechaPago}</td>
                            <td>Sueldo Fijo Quincenal</td>
                            <td>---</td>
                            <td style="text-align:right;">RD$ ${parseFloat(pago.base_salary_paid || 0).toFixed(2)}</td>
                        </tr>
                        ${filasExtras}
                        ${filaDeduccion}
                    </tbody>
                </table>

                <div class="total-section">
                    <strong>TOTAL NETO PAGADO:</strong>
                    <span style="color: #28a745; font-weight: bold; margin-left: 20px; font-size: 1.5em;">RD$ ${parseFloat(pago.net_pay || 0).toFixed(2)}</span>
                </div>

                <div class="firmas-container">
                    <div style="border-top: 1px solid #000; text-align: center; padding-top: 10px;">Firma de Be Eventos</div>
                    <div style="border-top: 1px solid #000; text-align: center; padding-top: 10px;">Firma del Colaborador</div>
                </div>
            </body></html>`);

    } catch (e) { res.status(500).send("Error: " + e.message); } finally { if (client) client.release(); }
});

app.get('/imprimir-todos-recibos/:payroll_id', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { payroll_id } = req.params;
    let client;
    try {
        client = await pool.connect();
        
        // 1. Traer todos los pagos de este lote, leyendo de payroll_records para tener los descuentos y totales EXACTOS.
        const recordsRes = await client.query(`
            SELECT pr.*, 
                   COALESCE(e.first_name || ' ' || e.last_name, 'Empleado Eliminado') as nombre_completo
            FROM payroll_records pr
            LEFT JOIN employees e ON pr.employee_id = e.id
            WHERE CAST(pr.payroll_id AS TEXT) = $1
            ORDER BY nombre_completo ASC
        `, [payroll_id.toString().trim()]);
        
        const pagos = recordsRes.rows;
        if (pagos.length === 0) return res.send("<h1>No hay recibos para esta nómina.</h1>");

        // 2. Traer todos los extras de esta nómina de golpe
        const extrasRes = await client.query(`
            SELECT pe.*, q.clientname 
            FROM payroll_extras pe
            LEFT JOIN quotes q ON pe.quote_id = q.id
            WHERE CAST(pe.payroll_id AS TEXT) = $1
        `, [payroll_id.toString().trim()]);
        const todosExtras = extrasRes.rows;

        // 3. Generar el bloque HTML de cada recibo
        let htmlRecibos = '';

        pagos.forEach((pago) => {
            const extrasEmpleado = todosExtras.filter(ex => ex.employee_id === pago.employee_id);
            const fechaPago = new Date(pago.pay_date).toLocaleDateString('es-DO');
            
            let filasExtras = extrasEmpleado.map(ex => `
                <tr>
                    <td>${new Date(ex.payment_date || pago.pay_date).toLocaleDateString('es-DO')}</td>
                    <td>${ex.description || 'Actividad Extra'}</td>
                    <td>${ex.clientname || 'Administración'}</td>
                    <td style="text-align:right;">RD$ ${parseFloat(ex.amount).toFixed(2)}</td>
                </tr>
            `).join('');

            let filaDeduccion = '';
            const totalDeducido = parseFloat(pago.base_salary_paid || 0) + parseFloat(pago.bonuses || 0) - parseFloat(pago.net_pay || 0);
            if (totalDeducido > 0) {
                filaDeduccion = `
                <tr>
                    <td>${fechaPago}</td>
                    <td style="color:red; font-weight:bold;">Descuentos / Abono a Préstamo</td>
                    <td>---</td>
                    <td style="text-align:right; color:red; font-weight:bold;">- RD$ ${totalDeducido.toFixed(2)}</td>
                </tr>`;
            }

            htmlRecibos += `
                <div class="recibo-container">
                    <div class="recibo-header">
                        <h2>RECIBO DE PAGO DE PERSONAL</h2>
                        <p>Be Eventos - Quincena correspondiente al ${fechaPago}</p>
                    </div>
                    
                    <div class="info-grid">
                        <div><strong>Colaborador:</strong> ${pago.nombre_completo}</div>
                        <div style="text-align:right;"><strong>Lote de Pago:</strong> #${payroll_id}</div>
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
                                <td>${fechaPago}</td>
                                <td>Sueldo Fijo Quincenal</td>
                                <td>---</td>
                                <td style="text-align:right;">RD$ ${parseFloat(pago.base_salary_paid || 0).toFixed(2)}</td>
                            </tr>
                            ${filasExtras}
                            ${filaDeduccion}
                        </tbody>
                    </table>

                    <div class="total-section">
                        <strong>TOTAL NETO PAGADO:</strong>
                        <span style="color: #28a745; font-weight: bold; margin-left: 20px; font-size: 1.5em;">RD$ ${parseFloat(pago.net_pay || 0).toFixed(2)}</span>
                    </div>

                    <div class="firmas-container">
                        <div style="border-top: 1px solid #000; text-align: center; padding-top: 10px;">Firma de Be Eventos</div>
                        <div style="border-top: 1px solid #000; text-align: center; padding-top: 10px;">Firma del Colaborador</div>
                    </div>
                </div>
            `;
        });

        res.send(`
            <!DOCTYPE html><html lang="es">
            <head>
                <meta charset="UTF-8">
                <title>Recibos Masivos Lote #${payroll_id}</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 0; color: #333; background: #525659; margin: 0;}
                    .toolbar { background: #fff; padding: 15px; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.2); position: sticky; top: 0; z-index: 100; }
                    .btn-print { background: #28a745; color: white; padding: 12px 30px; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; font-weight: bold; box-shadow: 0 4px 6px rgba(40,167,69,0.3); transition: background 0.3s;}
                    .btn-print:hover { background: #218838; }
                    
                    /* Contenedor individual con salto de página obligatorio */
                    .recibo-container { 
                        background: white; 
                        width: 210mm; /* Ancho A4/Carta */
                        min-height: 140mm; /* Mitad de página para ahorrar papel */
                        margin: 30px auto; 
                        padding: 40px; 
                        box-sizing: border-box;
                        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
                        page-break-after: always; /* MAGIA: Obliga a la impresora a saltar de hoja */
                    }
                    
                    .recibo-header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 20px; }
                    .info-grid { display: grid; grid-template-columns: 1fr 1fr; margin-bottom: 20px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    th, td { border: 1px solid #ddd; padding: 10px; text-align: left; font-size: 14px;}
                    th { background-color: #f2f2f2; font-weight: bold; }
                    .total-section { margin-top: 25px; text-align: right; font-size: 1.2em; }
                    .firmas-container { margin-top: 60px; display: grid; grid-template-columns: 1fr 1fr; gap: 60px; }
                    
                    /* Esconder lo que no debe salir en papel */
                    @media print { 
                        body { background: white; margin: 0; padding: 0;}
                        .toolbar { display: none !important; }
                        .recibo-container { box-shadow: none; margin: 0; padding: 20mm; }
                    }
                </style>
            </head>
            <body>
                <div class="toolbar">
                    <button class="btn-print" onclick="window.print()">🖨️ Imprimir ${pagos.length} Recibos Ahora</button>
                    <p style="margin-top: 10px; color: #666; font-size: 14px; margin-bottom: 0;">Presiona el botón. Cada recibo saldrá perfectamente separado en su propia hoja.</p>
                </div>
                ${htmlRecibos}
            </body></html>`);

    } catch (e) { res.status(500).send("Error: " + e.message); } finally { if (client) client.release(); }
});

// =============================================================
// 🚀 PROCESAR NÓMINA (VERSIÓN 2.0: Con Préstamos y Gastos)
// =============================================================
app.post('/procesar-super-nomina', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { nomina, pay_date } = req.body;
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const batchPayrollId = Date.now(); 
        let totalLote = 0;
        
        // ESCUDO 1: Si el frontend no envía fecha, tomamos la de hoy automáticamente de forma segura
        const fechaNominaSegura = pay_date ? new Date(pay_date) : new Date();

        for (const entry of nomina) {
            // FUNCIÓN SALVAVIDAS: Limpia cualquier texto (RD$, comas, espacios) y lo vuelve un número real
            const limpiarNumero = (valor) => {
                if (!valor) return 0;
                return parseFloat(String(valor).replace(/[^0-9.-]+/g, "")) || 0;
            };

            const sueldoBase = limpiarNumero(entry.base_salary || entry.sueldo);
            const bonos = limpiarNumero(entry.bonuses);
            const prestamoDeduccion = limpiarNumero(entry.loan_deduction);
            
            // Sumamos las deducciones normales y el préstamo por si el frontend no los unió
            const deduccionTotal = limpiarNumero(entry.deductions) + prestamoDeduccion; 

            // ¡EL TRUCO MAGISTRAL! Calculamos el Neto en el servidor para no confiar en la pantalla
            const netPayCalculado = sueldoBase + bonos - deduccionTotal;
            
            totalLote += netPayCalculado;

            // 1. GUARDAR EN PAYROLL_RECORDS (Usando nuestros números limpios y el neto calculado)
            const recordRes = await client.query(
                `INSERT INTO payroll_records 
                (employee_id, pay_date, base_salary_paid, bonuses, deductions, loan_deduction, net_pay, payroll_id) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
                [
                    entry.employee_id, 
                    fechaNominaSegura, 
                    sueldoBase, 
                    bonos, 
                    deduccionTotal,
                    prestamoDeduccion, 
                    netPayCalculado,
                    batchPayrollId
                ]
            );
            
            const newRecordId = recordRes.rows[0].id;

            // 2. Registrar PAGO en la tabla de Préstamos (Si aplica)
            if (entry.loan_id && prestamoDeduccion > 0) {
                await client.query(
                    `INSERT INTO loan_payments (loan_id, payment_date, amount_paid, payment_method, payroll_record_id) 
                     VALUES ($1, CURRENT_DATE, $2, 'Descuento Nómina', $3)`,
                    [entry.loan_id, prestamoDeduccion, newRecordId]
                );
            }

            // 3. Registrar Extras y Vincular a Centros
            if (entry.extras && Array.isArray(entry.extras)) {
                for (const extra of entry.extras) {
                    const montoExtra = limpiarNumero(extra.amount);
                    
                    // ESCUDO 2: Forzar null absoluto si el quote_id viene vacío para evitar el colapso de Postgres
                    let centroId = extra.quote_id || extra.centro_id || extra.proyecto_id;
                    if (String(centroId).trim() === "") centroId = null;

                    if (montoExtra > 0) {
                        await client.query(
                            `INSERT INTO payroll_extras (employee_id, quote_id, amount, description, payroll_id) 
                             VALUES ($1, $2, $3, $4, $5)`,
                            [entry.employee_id, centroId, montoExtra, extra.desc || 'Actividad Extra', batchPayrollId]
                        );
                        
                        // Si es de un centro, creamos el gasto específico del centro
                        if (centroId) {
                            await client.query(
                                `INSERT INTO expenses (quote_id, amount, description, expense_date, supplier_id, type) 
                                 VALUES ($1, $2, $3, CURRENT_DATE, (SELECT id FROM suppliers LIMIT 1), 'Nómina Extra')`,
                                [centroId, montoExtra, `Pago Nómina Extra: ${extra.desc || 'Actividad'}`]
                            );
                        }
                    }
                }
            }
        } // Fin del For

        // 4. CREAR EL GASTO GLOBAL DE NÓMINA (Para que afecte tus finanzas generales)
        if (totalLote > 0) {
            const fechaFormateada = fechaNominaSegura.toLocaleDateString('es-DO');
            await client.query(
                `INSERT INTO expenses (amount, description, expense_date, supplier_id, type, fund_source) 
                 VALUES ($1, $2, $3, (SELECT id FROM suppliers LIMIT 1), 'Nómina', 'Banco')`,
                [totalLote, `Pago Nómina General (${fechaFormateada})`, fechaNominaSegura]
            );
        }

        // 5. Registro Histórico Simple
        await client.query(
            `INSERT INTO payment_history (id, amount_paid, payment_date, payment_method, fund_source) 
             VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4)`,
            [batchPayrollId, totalLote, 'Súper Nómina', 'Banco']
        );

        await client.query('COMMIT');
        res.json({ success: true, payroll_id: batchPayrollId });

    } catch (e) {
        if (client) await client.query('ROLLBACK');
        console.error("Error crítico en nómina:", e.message);
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
        
        const invoicesRes = await client.query(`
            SELECT * FROM expenses 
            WHERE supplier_id = $1 AND status != 'Pagada' 
            ORDER BY expense_date ASC`, [supplierId]);
        
        const historyRes = await client.query(`
            SELECT ph.*, e.description as factura_desc 
            FROM payment_history ph
            JOIN expenses e ON ph.expense_id = e.id
            WHERE e.supplier_id = $1
            ORDER BY ph.payment_date DESC`, [supplierId]);
        
        const invoices = invoicesRes.rows;
        const history = historyRes.rows;
        const totalPendiente = invoices.reduce((sum, i) => sum + (parseFloat(i.amount) - parseFloat(i.paid_amount || 0)), 0);

        const doc = new PDFDocument({ size: 'A4', margin: 40 }); 
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Estado_Cuenta_${supplierRes.rows[0].name.replace(/\s+/g, '_')}.pdf"`);
        doc.pipe(res);

        // --- FUNCIÓN DE AYUDA PARA FORMATO DE MONEDA ---
        const formatMoney = (val) => 'RD$ ' + parseFloat(val).toLocaleString('en-US', {minimumFractionDigits: 2});

        // -----------------------------------------------------------
        // 1. ENCABEZADO CORPORATIVO (Franja Azul + Cuadro Rojo)
        // -----------------------------------------------------------
        doc.rect(0, 0, 600, 110).fill('#2c3e50'); // Fondo Azul Oscuro
        
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22).text('ESTADO DE CUENTA', 40, 35);
        doc.fontSize(12).font('Helvetica').text(`Suplidor: ${supplierRes.rows[0].name}`, 40, 65);
        doc.fontSize(10).text(`Generado: ${new Date().toLocaleString('es-DO')}`, 40, 80);

        // Cuadro Rojo de Total Adeudado
        doc.rect(380, 25, 170, 60).fill('#e74a3b'); 
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11).text('TOTAL ADEUDADO', 380, 40, { width: 170, align: 'center' });
        doc.fontSize(16).text(formatMoney(totalPendiente), 380, 55, { width: 170, align: 'center' });

        doc.moveDown(4); // Bajar el cursor debajo del encabezado

        // -----------------------------------------------------------
        // 2. SECCIÓN FACTURAS PENDIENTES
        // -----------------------------------------------------------
        doc.fillColor('#2c3e50').font('Helvetica-Bold').fontSize(14).text('1. FACTURAS PENDIENTES DE PAGO');
        doc.moveDown(0.5);

        // Cabecera Tabla Facturas
        doc.rect(40, doc.y, 515, 20).fill('#f8f9fc');
        let startY = doc.y + 5;
        doc.fillColor('#6c757d').font('Helvetica-Bold').fontSize(10);
        doc.text('FECHA', 50, startY, { width: 70 });
        doc.text('FACTURA / CONCEPTO', 130, startY, { width: 260 });
        doc.text('BALANCE PENDIENTE', 400, startY, { width: 145, align: 'right' });
        doc.y += 15;

        // Filas Facturas
        doc.font('Helvetica').fontSize(10).fillColor('#495057');
        if (invoices.length === 0) {
            doc.moveDown(1);
            doc.text('No hay facturas pendientes.', 50, doc.y);
        } else {
            invoices.forEach(i => {
                if (doc.y > 750) doc.addPage(); // Paginación automática si la lista es larga
                
                const bal = parseFloat(i.amount) - parseFloat(i.paid_amount || 0);
                const numFact = i.numero_factura ? `Fact: ${i.numero_factura} - ` : '';
                
                doc.moveDown(0.5);
                const currentY = doc.y;
                
                doc.text(new Date(i.expense_date).toLocaleDateString(), 50, currentY, { width: 70 });
                doc.text(`${numFact}${i.description || 'N/A'}`, 130, currentY, { width: 260 });
                
                doc.fillColor('#e74a3b').font('Helvetica-Bold')
                   .text(formatMoney(bal), 400, currentY, { width: 145, align: 'right' });
                
                doc.fillColor('#495057').font('Helvetica'); // Resetear color
                
                // Línea divisoria sutil
                doc.moveTo(40, doc.y + 5).lineTo(555, doc.y + 5).lineWidth(0.5).strokeColor('#eaeaea').stroke();
            });
        }

        // -----------------------------------------------------------
        // 3. SECCIÓN HISTORIAL DE ABONOS
        // -----------------------------------------------------------
        doc.moveDown(3);
        if (doc.y > 700) doc.addPage(); // Evitar que el título quede huérfano al final de la página

        doc.fillColor('#2c3e50').font('Helvetica-Bold').fontSize(14).text('2. HISTORIAL DE ABONOS RECIBIDOS');
        doc.moveDown(0.5);

        // Cabecera Tabla Abonos
        doc.rect(40, doc.y, 515, 20).fill('#f8f9fc');
        startY = doc.y + 5;
        doc.fillColor('#6c757d').font('Helvetica-Bold').fontSize(10);
        doc.text('FECHA PAGO', 50, startY, { width: 80 });
        doc.text('MÉTODO', 140, startY, { width: 80 });
        doc.text('REFERENCIA FACTURA', 230, startY, { width: 180 });
        doc.text('MONTO ABONADO', 420, startY, { width: 125, align: 'right' });
        doc.y += 15;

        // Filas Abonos
        doc.font('Helvetica').fontSize(10).fillColor('#495057');
        if (history.length === 0) {
            doc.moveDown(1);
            doc.text('No hay abonos registrados.', 50, doc.y);
        } else {
            history.forEach(h => {
                if (doc.y > 750) doc.addPage();
                
                doc.moveDown(0.5);
                const currentY = doc.y;
                
                doc.text(new Date(h.payment_date).toLocaleDateString(), 50, currentY, { width: 80 });
                doc.text(h.fund_source || h.payment_method || 'N/A', 140, currentY, { width: 80 });
                doc.text(h.factura_desc || 'Gasto General', 230, currentY, { width: 180 });
                
                doc.fillColor('#1cc88a').font('Helvetica-Bold')
                   .text(formatMoney(h.amount_paid), 420, currentY, { width: 125, align: 'right' });
                
                doc.fillColor('#495057').font('Helvetica'); // Resetear color
                
                doc.moveTo(40, doc.y + 5).lineTo(555, doc.y + 5).lineWidth(0.5).strokeColor('#eaeaea').stroke();
            });
        }

        // Pie de página centrado
        doc.font('Helvetica-Oblique').fontSize(8).fillColor('#b7b9cc');
        doc.text('Este documento es generado automáticamente por el Sistema de Administración.', 40, 780, { align: 'center' });

        doc.end();
    } catch (e) { 
        console.error(e);
        res.status(500).send(e.message); 
    } finally { 
        if (client) client.release(); 
    }
});

// =============================================================
// 💰 RUTA DEFINITIVA PARA ABONAR (CON RECIBO AUTOMÁTICO)
// =============================================================
app.post('/cuentas-por-pagar/abonar', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { expenseId, paymentAmount, fundSource } = req.body;
    let client;
    
    try {
        client = await pool.connect();
        await client.query('BEGIN'); // Iniciamos una transacción segura

        // 1. Guardar el abono y capturar su ID nuevo de inmediato
        const insertRes = await client.query(`
            INSERT INTO payment_history (expense_id, amount_paid, fund_source, payment_date)
            VALUES ($1, $2, $3, NOW())
            RETURNING id
        `, [expenseId, paymentAmount, fundSource || 'Banco']);

        const nuevoAbonoId = insertRes.rows[0].id;

        // 2. Actualizar la factura sumando lo pagado
        await client.query(`
            UPDATE expenses 
            SET paid_amount = COALESCE(paid_amount, 0) + $1,
                status = CASE 
                            WHEN (COALESCE(paid_amount, 0) + $1) >= amount THEN 'Pagada' 
                            ELSE 'Abonada' 
                         END
            WHERE id = $2
        `, [paymentAmount, expenseId]);

        await client.query('COMMIT'); // Guardamos los cambios

        // Redirigimos DIRECTAMENTE a la pantalla del recibo de manera natural (sin bloqueos de Chrome)
        res.redirect('/imprimir-abono-suplidor/' + nuevoAbonoId);

    } catch (e) {
        if (client) await client.query('ROLLBACK'); // Si hay error, cancelamos todo
        console.error("Error al abonar:", e);
        res.status(500).send("Error al registrar el abono: " + e.message);
    } finally {
        if (client) client.release();
    }
});

// =============================================================
// 🖨️ IMPRIMIR COMPROBANTE DE EGRESO (ABONO A SUPLIDOR)
// =============================================================
app.get('/imprimir-abono-suplidor/:id', requireLogin, requireAdminOrCoord, async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const pagoId = req.params.id;

        // Buscamos todos los detalles del pago, de la factura y del suplidor
        const query = `
            SELECT 
                ph.id as pago_id, 
                ph.amount_paid, 
                ph.payment_date, 
                ph.payment_method, 
                ph.fund_source,
                e.description as concepto_gasto, 
                e.numero_factura,
                s.name as suplidor_nombre
            FROM payment_history ph
            JOIN expenses e ON ph.expense_id = e.id
            JOIN suppliers s ON e.supplier_id = s.id
            WHERE ph.id = $1
        `;
        const result = await client.query(query, [pagoId]);

        if (result.rows.length === 0) {
            return res.status(404).send('<h1>Comprobante no encontrado</h1>');
        }

        const pago = result.rows[0];

        // Renderizamos la hoja tamaño carta con líneas de firma
        res.send(`
            <!DOCTYPE html><html lang="es"><head>
                <meta charset="UTF-8">
                <title>Comprobante de Egreso - ${pago.suplidor_nombre}</title>
                <style>
                    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; padding: 40px; margin: 0; background: #fff; }
                    .header { text-align: center; border-bottom: 2px solid #2c3e50; padding-bottom: 20px; margin-bottom: 30px; }
                    .header h1 { margin: 0; color: #2c3e50; font-size: 24px; text-transform: uppercase; }
                    .details-box { border: 1px solid #ddd; padding: 20px; border-radius: 8px; margin-bottom: 30px; background: #fdfdfd; }
                    .details-box p { margin: 10px 0; font-size: 15px; }
                    .monto-gigante { font-size: 32px; font-weight: bold; color: #27ae60; text-align: center; margin: 30px 0; padding: 20px; border: 2px dashed #27ae60; border-radius: 10px; background: #f0fff4; }
                    .firmas { display: flex; justify-content: space-between; margin-top: 100px; text-align: center; font-size: 13px; font-weight: bold; }
                    .firma-linea { border-top: 1px solid #333; width: 40%; padding-top: 8px; }
                    @media print {
                        .no-print { display: none !important; }
                        body { padding: 0; }
                    }
                </style>
            </head><body>
                <div class="no-print" style="text-align: right; margin-bottom: 20px;">
                    <a href="/cuentas-por-pagar" style="padding: 10px 20px; background: #858796; color: white; border-radius: 5px; text-decoration: none; font-weight: bold; margin-right: 10px;">🔙 Volver a Cuentas por Pagar</a>
                    
                    <button onclick="window.print()" style="padding: 10px 20px; background: #4e73df; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">🖨️ Imprimir o Guardar PDF</button>
                </div>

                <div class="header">
                    <h1>Be Eventos</h1>
                    <h2 style="margin: 10px 0 5px 0; color: #34495e;">COMPROBANTE DE EGRESO A SUPLIDOR</h2>
                    <p style="color: #7f8c8d;"><strong>Comprobante de Sistema #</strong> ${pago.pago_id}</p>
                </div>

                <div class="details-box">
                    <p><strong>📅 Fecha y Hora:</strong> ${new Date(pago.payment_date).toLocaleString('es-DO')}</p>
                    <p><strong>🏢 Pagado a (Suplidor):</strong> ${pago.suplidor_nombre}</p>
                    <p><strong>📝 Aplicado a:</strong> ${pago.numero_factura ? `Factura #${pago.numero_factura} - ` : ''}${pago.concepto_gasto}</p>
                    <p><strong>🏦 Fondo Utilizado:</strong> ${pago.fund_source || pago.payment_method || 'N/A'}</p>
                </div>

                <div class="monto-gigante">
                    TOTAL ABONADO: RD$ ${parseFloat(pago.amount_paid).toLocaleString('en-US', {minimumFractionDigits: 2})}
                </div>

                <div class="firmas">
                    <div class="firma-linea">Entregado por (Administración Be Eventos)</div>
                    <div class="firma-linea">Recibido Conforme (Firma / Sello Suplidor)</div>
                </div>

                <div style="margin-top: 40px; text-align: center; color: #95a5a6; font-size: 11px;">
                    <p>Este documento es un comprobante de control interno generado por el sistema Be Gestion.</p>
                </div>

            </body></html>
        `);
    } catch (e) {
        console.error(e);
        res.status(500).send("Error al generar el comprobante");
    } finally {
        if (client) client.release();
    }
});

app.get('/reporte-gastos/excel', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { startDate, endDate, cycleId, missingDesc } = req.query;
    let client;
    try {
        client = await pool.connect();
        
        // 1. Filtros consistentes con el reporte visual (Solo lo PAGADO)
        let whereClause = "WHERE e.paid_amount > 0"; 
        const params = [];
        if (startDate) { params.push(startDate); whereClause += ` AND e.expense_date >= $${params.length}`; }
        if (endDate) { params.push(endDate); whereClause += ` AND e.expense_date <= $${params.length}`; }
        if (cycleId) { params.push(cycleId); whereClause += ` AND e.caja_chica_ciclo_id = $${params.length}`; }
        if (missingDesc === 'true') { whereClause += ` AND (e.description IS NULL OR e.description = '')`; }

        // 2. Consulta con los nuevos campos (Factura y Fuente de Fondo)
        const queryText = `
            SELECT 
                e.expense_date, 
                s.name as supplier, 
                e.numero_factura,
                e.description, 
                e.paid_amount, 
                e.fund_source,
                e.status
            FROM expenses e 
            LEFT JOIN suppliers s ON e.supplier_id = s.id 
            ${whereClause} 
            ORDER BY e.expense_date ASC`;
            
        const result = await client.query(queryText, params);

        // 3. Encabezados profesionales para Contabilidad
        let csvContent = "Fecha,Suplidor,No. Factura,Descripcion,Monto Pagado (RD$),Fuente de Fondo,Estado\n";

        // 4. Limpieza y formateo de filas
        result.rows.forEach(row => {
            const fecha = new Date(row.expense_date).toLocaleDateString();
            const suplidor = (row.supplier || 'Gasto General').replace(/,/g, '');
            const factura = (row.numero_factura || 'N/A').replace(/,/g, '');
            const desc = (row.description || 'Sin detalle').replace(/,/g, '');
            const monto = parseFloat(row.paid_amount).toFixed(2);
            const fuente = row.fund_source || 'Banco';
            const estado = row.status || 'Pagada';
            
            csvContent += `${fecha},${suplidor},${factura},${desc},${monto},${fuente},${estado}\n`;
        });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=Auditoria_Gastos_PCOE.csv');
        
        // Enviamos con BOM para que Excel abra bien los acentos
        res.send("\uFEFF" + csvContent);

    } catch (e) {
        res.status(500).send("Error al exportar: " + e.message);
    } finally {
        if (client) client.release();
    }
});
app.get('/suplidores/:id/estado-de-cuenta', requireLogin, requireAdminOrCoord, async (req, res) => {
    const supplierId = req.params.id;
    let client;
    try {
        client = await pool.connect();

        const supplierRes = await client.query("SELECT * FROM suppliers WHERE id = $1", [supplierId]);
        if (supplierRes.rows.length === 0) return res.status(404).send("Suplidor no encontrado");
        const supplier = supplierRes.rows[0];

        const invoicesRes = await client.query(`
            SELECT e.*, 
                   (SELECT JSON_AGG(ph.*) FROM payment_history ph WHERE ph.expense_id = e.id) as abonos
            FROM expenses e 
            WHERE e.supplier_id = $1 
            ORDER BY e.expense_date DESC`, [supplierId]);

        const facturas = invoicesRes.rows;
        const totalFacturado = facturas.reduce((sum, f) => sum + parseFloat(f.amount), 0);
        const totalPagado = facturas.reduce((sum, f) => sum + parseFloat(f.paid_amount || 0), 0);
        const balanceGeneral = totalFacturado - totalPagado;

        res.send(`
            <!DOCTYPE html><html lang="es"><head>
                <title>Estado de Cuenta - ${supplier.name}</title>
                <style>
                    body { font-family: 'Segoe UI', sans-serif; color: #333; padding: 40px; }
                    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #4e73df; padding-bottom: 20px; margin-bottom: 30px; }
                    .company-info h1 { margin: 0; color: #4e73df; }
                    .summary-box { background: #f8f9fc; padding: 20px; border-radius: 8px; margin-bottom: 30px; display: grid; grid-template-columns: repeat(3, 1fr); text-align: center; }
                    .amount { font-size: 1.4rem; font-weight: bold; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th { background: #4e73df; color: white; padding: 12px; text-align: left; }
                    td { padding: 12px; border-bottom: 1px solid #e3e6f0; font-size: 13px; }
                    .abono-row { font-size: 11px; color: #2c7a7b; background: #f0fff4; }
                    @media print { .no-print { display: none; } }
                </style>
            </head><body>
                <div class="no-print" style="margin-bottom: 20px;">
                    <button onclick="window.print()" style="padding:10px 20px; background:#1cc88a; color:white; border:none; border-radius:5px; cursor:pointer;">🖨️ Imprimir PDF</button>
                    <button onclick="window.history.back()" style="padding:10px 20px; background:#858796; color:white; border:none; border-radius:5px; cursor:pointer;">Volver</button>
                </div>

                <div class="header">
                    <div class="company-info"><h1>PCOE</h1><p>Estado de Cuenta Suplidor</p></div>
                    <div style="text-align: right;">
                        <h2 style="margin:0;">${supplier.name}</h2>
                        <p>Fecha: ${new Date().toLocaleDateString()}</p>
                    </div>
                </div>

                <div class="summary-box">
                    <div><small>FACTURADO</small><div class="amount">RD$ ${totalFacturado.toLocaleString()}</div></div>
                    <div><small>PAGADO</small><div class="amount" style="color: #1cc88a;">RD$ ${totalPagado.toLocaleString()}</div></div>
                    <div><small>BALANCE</small><div class="amount" style="color: #e74a3b;">RD$ ${balanceGeneral.toLocaleString()}</div></div>
                </div>

                <table>
                    <thead><tr><th>Fecha / Ref</th><th>Concepto</th><th>Monto</th><th>Pagado</th><th>Balance</th></tr></thead>
                    <tbody>
                        ${facturas.map(f => {
                            const pendiente = parseFloat(f.amount) - parseFloat(f.paid_amount || 0);
                            return `
                            <tr>
                                <td><b>${new Date(f.expense_date).toLocaleDateString()}</b><br><small>${f.numero_factura || 'N/A'}</small></td>
                                <td>${f.description || 'Gasto'}</td>
                                <td>RD$ ${parseFloat(f.amount).toLocaleString()}</td>
                                <td style="color:#1cc88a;">RD$ ${parseFloat(f.paid_amount || 0).toLocaleString()}</td>
                                <td style="font-weight:bold; color:${pendiente > 0 ? '#e74a3b' : '#1cc88a'};">RD$ ${pendiente.toLocaleString()}</td>
                            </tr>
                            ${f.abonos ? f.abonos.map(a => `
                                <tr class="abono-row">
                                    <td colspan="3" style="text-align:right;">↳ Pago el ${new Date(a.payment_date).toLocaleDateString()} (${a.fund_source})</td>
                                    <td>+ RD$ ${parseFloat(a.amount_paid).toLocaleString()}</td>
                                    <td></td>
                                </tr>`).join('') : ''}`;
                        }).join('')}
                    </tbody>
                </table>
            </body></html>
        `);
    } catch (e) { 
        console.error("Error en reporte:", e);
        res.status(500).send(e.message); 
    } finally { 
        if (client) client.release(); 
    }
});
// ==========================================
// REPORTE GENERAL DE CUENTAS POR COBRAR (SISTEMA PCOE)
// ==========================================
app.get('/reporte-general-cobros', requireLogin, requireAdminOrCoord, async (req, res) => {
    const { advisor } = req.query; // Filtro de asesor desde la URL
    let client;
    try {
        client = await pool.connect();

        // --- A. OBTENER LISTA DE ASESORES PARA EL FILTRO ---
        const advisorsRes = await client.query("SELECT DISTINCT advisorname FROM quotes WHERE status = 'activa' ORDER BY advisorname");

        // --- B. LA SUPER CONSULTA (Actualizada con Gastos) ---
        let query = `
            SELECT 
                q.id, q.clientname, q.quotenumber, q.advisorname, q.status,
                (COALESCE(q.preciofinalporestudiante * q.estudiantesparafacturar, 0) + 
                 COALESCE((SELECT SUM(monto_ajuste) FROM ajustes_cotizacion WHERE quote_id = q.id), 0)) as venta_total,
                COALESCE((SELECT SUM(amount) FROM payments WHERE quote_id = q.id), 0) as total_cobrado,
                COALESCE((SELECT SUM(amount) FROM expenses WHERE quote_id = q.id), 0) as total_gastado,
                (SELECT MAX(payment_date) FROM payments WHERE quote_id = q.id) as ultimo_pago
            FROM quotes q
            WHERE q.status = 'activa' 
              AND q.fecha_creacion >= '2025-08-01'
        `;

        const params = [];
        if (advisor) {
            params.push(advisor);
            query += ` AND q.advisorname = $1`;
        }
        query += ` ORDER BY ultimo_pago ASC NULLS FIRST`;

        const result = await client.query(query, params);
        
        // --- C. PROCESAMIENTO Y ESTADÍSTICAS GLOBALES ---
        let globalVenta = 0, globalCobrado = 0, globalGastado = 0;
        const hoy = new Date();

        const filasHtml = result.rows.map(p => {
            const venta = parseFloat(p.venta_total || 0);
            const cobrado = parseFloat(p.total_cobrado || 0);
            const gastado = parseFloat(p.total_gastado || 0);
            const deuda = venta - cobrado;
            const porcentajeDeuda = venta > 0 ? (deuda / venta) * 100 : 0;
            
            globalVenta += venta;
            globalCobrado += cobrado;
            globalGastado += gastado;

            // Cálculo de días de inactividad
            const ultPago = p.ultimo_pago ? new Date(p.ultimo_pago) : null;
            const diasInactivo = ultPago ? Math.floor((hoy - ultPago) / (1000 * 60 * 60 * 24)) : '---';

            // Lógica de Semáforo (Tus tramos originales)
            let zonaColor, zonaNombre;
            if (porcentajeDeuda > 75) { zonaColor = '#e74a3b'; zonaNombre = 'ZONA ROJA'; }
            else if (porcentajeDeuda > 50) { zonaColor = '#f6c23e'; zonaNombre = 'ZONA NARANJA'; }
            else if (porcentajeDeuda > 25) { zonaColor = '#4e73df'; zonaNombre = 'ZONA AMARILLA'; }
            else { zonaColor = '#1cc88a'; zonaNombre = 'ZONA VERDE'; }

            return `
                <tr style="border-left: 10px solid ${zonaColor};">
                    <td>
                        <b>${p.clientname}</b><br>
                        <small style="color:gray;">${p.quotenumber} | Asesor: ${p.advisorname}</small>
                    </td>
                    <td style="text-align:right;">RD$ ${venta.toLocaleString()}</td>
                    <td style="text-align:right; color:#1cc88a; font-weight:bold;">RD$ ${cobrado.toLocaleString()}</td>
                    <td style="text-align:right; color:${deuda > 0 ? '#e74a3b' : '#1cc88a'}; font-weight:bold;">RD$ ${deuda.toLocaleString()}</td>
                    <td style="text-align:center; font-weight:bold; color:${diasInactivo > 30 ? 'red' : 'inherit'};">
                        ${diasInactivo} ${diasInactivo !== '---' ? 'días' : ''}
                    </td>
                    <td style="text-align:center;">
                        <a href="/proyecto-detalle/${p.id}" class="btn" style="padding:5px 10px; font-size:11px;">🔍 Ver</a>
                        ${deuda <= 0 ? '<span title="Saldo Cero" style="font-size:18px; cursor:help;">🔒</span>' : ''}
                    </td>
                </tr>
            `;
        }).join('');

        const rentabilidadProyectada = globalVenta - globalGastado;

        // --- D. ENVIAR AL NAVEGADOR ---
        res.send(`
            <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}
                <title>Reporte General de Cobros - PCOE</title>
                <style>
                    .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 30px; }
                    .stat-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-top: 5px solid var(--primary); }
                    .stat-card h3 { font-size: 12px; color: gray; margin: 0; text-transform: uppercase; letter-spacing: 1px; }
                    .stat-card div { font-size: 1.5rem; font-weight: bold; margin-top: 10px; }
                </style>
            </head><body>
                <div class="container" style="max-width:1400px;">
                    ${backToDashboardLink}
                    
                    <h1 style="margin-top:20px;">Control General de Cobros</h1>
                    <p>Ciclo: <b>Agosto 2025 - Agosto 2026</b></p>

                    <div class="stat-grid">
                        <div class="stat-card"><h3>Venta Total Esperada</h3><div>RD$ ${globalVenta.toLocaleString()}</div></div>
                        <div class="stat-card" style="border-top-color:#1cc88a;"><h3>Total Recaudado</h3><div style="color:#1cc88a;">RD$ ${globalCobrado.toLocaleString()}</div></div>
                        <div class="stat-card" style="border-top-color:#e74a3b;"><h3>Balance en Calle</h3><div style="color:#e74a3b;">RD$ ${(globalVenta - globalCobrado).toLocaleString()}</div></div>
                        <div class="stat-card" style="border-top-color:#4e73df;"><h3>Ganancia Proyectada</h3><div style="color:#4e73df;">RD$ ${rentabilidadProyectada.toLocaleString()}</div></div>
                    </div>

                    <form action="/reporte-general-cobros" method="GET" style="margin-bottom:20px; background:#f8f9fc; padding:15px; border-radius:8px; display:flex; align-items:center; gap:15px;">
                        <label><b>Filtrar por Asesor:</b></label>
                        <select name="advisor" onchange="this.form.submit()" style="padding:8px; border-radius:5px; border:1px solid #ddd;">
                            <option value="">-- Todos los Asesores --</option>
                            ${advisorsRes.rows.map(a => `<option value="${a.advisorname}" ${advisor === a.advisorname ? 'selected' : ''}>${a.advisorname}</option>`).join('')}
                        </select>
                        <a href="/reporte-general-cobros" style="font-size:12px; color:gray; text-decoration:none;">Limpiar filtros</a>
                    </form>
                    
                    <table class="modern-table">
                        <thead>
                            <tr>
                                <th>Centro / Proyecto</th>
                                <th style="text-align:right;">Venta Total</th>
                                <th style="text-align:right;">Cobrado</th>
                                <th style="text-align:right;">Pendiente</th>
                                <th style="text-align:center;">Inactividad</th>
                                <th style="text-align:center;">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filasHtml || '<tr><td colspan="6" style="text-align:center;">No hay proyectos para este filtro.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </body></html>
        `);

    } catch (e) {
        console.error("Error en reporte cobros:", e);
        res.status(500).send("Error al generar el reporte: " + e.message);
    } finally {
        if (client) client.release();
    }
});
// --- CIERRE FINAL DEL SERVIDOR ---
// --- NUEVO REPORTE: DESGLOSE DE GASTOS MENSUALES ---
app.get('/analisis-gastos-mensual', requireLogin, requireAdminOrCoord, async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const CYCLE_START = '2025-08-01';

        // Consultas
        const expensesRes = await client.query(`SELECT TO_CHAR(expense_date, 'YYYY-MM') as mes, SUM(amount) as total FROM expenses WHERE expense_date >= $1 GROUP BY 1 ORDER BY 1 DESC`, [CYCLE_START]);
        const payrollRes = await client.query(`SELECT TO_CHAR(pay_date, 'YYYY-MM') as mes, SUM(net_pay) as total FROM payroll_records WHERE pay_date >= $1 GROUP BY 1 ORDER BY 1 DESC`, [CYCLE_START]);
        const commRes = await client.query(`SELECT TO_CHAR(created_at, 'YYYY-MM') as mes, SUM(commission_amount) as total FROM commissions WHERE status = 'pagada' AND created_at >= $1 GROUP BY 1 ORDER BY 1 DESC`, [CYCLE_START]);

        // Función ULTRA SEGURA para convertir a número
        const safeFloat = (val) => {
            if (!val) return 0;
            const n = parseFloat(val);
            return isNaN(n) ? 0 : n;
        };

        const mapaMeses = {};
        const sumar = (lista, tipo) => {
            lista.forEach(item => {
                if (!mapaMeses[item.mes]) mapaMeses[item.mes] = { mes: item.mes, operativo: 0, nomina: 0, comision: 0, total: 0 };
                mapaMeses[item.mes][tipo] = safeFloat(item.total);
            });
        };

        sumar(expensesRes.rows, 'operativo');
        sumar(payrollRes.rows, 'nomina');
        sumar(commRes.rows, 'comision');

        const reporte = Object.values(mapaMeses).map(m => {
            m.total = m.operativo + m.nomina + m.comision;
            return m;
        }).sort((a, b) => b.mes.localeCompare(a.mes));

        const totalGlobal = reporte.reduce((sum, m) => sum + m.total, 0);
        const promedioMensual = reporte.length > 0 ? (totalGlobal / reporte.length) : 0;

        // Generar Vista
        const filasHtml = reporte.map(r => `
            <tr>
                <td style="font-weight:bold;">📅 ${r.mes}</td>
                <td style="text-align:right; color:#5a5c69;">RD$ ${r.operativo.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                <td style="text-align:right; color:#4e73df;">RD$ ${r.nomina.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                <td style="text-align:right; color:#1cc88a;">RD$ ${r.comision.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                <td style="text-align:right; font-weight:bold; color:#e74a3b; background:#fff5f5;">RD$ ${r.total.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
            </tr>
        `).join('');

        res.send(`
        <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
            <div class="container" style="max-width:1000px;">
                <div style="margin-bottom:20px;"><a href="/" class="back-link">↩️ Volver al Dashboard</a></div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <h1>📉 Análisis de Gastos Mensuales</h1>
                    <div style="text-align:right; background:#fffbe6; padding:10px 20px; border-radius:8px; border:1px solid #f6c23e;">
                        <small style="color:#856404; font-weight:bold;">PROMEDIO MENSUAL REAL</small>
                        <div style="font-size:1.5rem; font-weight:bold; color:#856404;">RD$ ${promedioMensual.toLocaleString('en-US', {maximumFractionDigits:0})}</div>
                    </div>
                </div>
                <div class="card" style="padding:0; overflow:hidden;">
                    <table class="modern-table" style="margin:0;">
                        <thead style="background:#f8f9fc;"><tr><th>Mes</th><th style="text-align:right;">Gastos Operativos</th><th style="text-align:right;">Nómina</th><th style="text-align:right;">Comisiones</th><th style="text-align:right;">TOTAL</th></tr></thead>
                        <tbody>${filasHtml || '<tr><td colspan="5" style="text-align:center;">No hay datos.</td></tr>'}</tbody>
                        <tfoot style="background:#f1f1f1; font-weight:bold;"><tr><td>TOTAL</td><td colspan="3"></td><td style="text-align:right;">RD$ ${totalGlobal.toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr></tfoot>
                    </table>
                </div>
            </div></body></html>`);
    } catch (e) { res.status(500).send("Error: " + e.message); } finally { if (client) client.release(); }
});
// --- NUEVA RUTA: GESTIÓN DE USUARIOS ---
app.get('/usuarios', requireLogin, requireAdminOrCoord, async (req, res) => {
    // Verificar si es Admin (Seguridad extra)
    const userRol = (req.session.user.rol || req.session.user.role || '').toLowerCase();
    if (userRol !== 'admin' && userRol !== 'administrador') {
        return res.send("<h3>⛔ Acceso Denegado. Solo Administradores.</h3><a href='/'>Volver</a>");
    }

    let client;
    try {
        client = await pool.connect();
        // Traemos usuarios ordenados por ID
        const result = await client.query("SELECT id, username, rol FROM users ORDER BY id ASC");
        
        const filas = result.rows.map(u => `
            <tr>
                <td>${u.id}</td>
                <td><b>${u.username}</b></td>
                <td><span style="background:${u.rol.toLowerCase().includes('admin') ? '#e74a3b' : '#4e73df'}; color:white; padding:3px 8px; border-radius:10px; font-size:11px;">${u.rol}</span></td>
                <td>
                    <button style="opacity:0.5; cursor:not-allowed;">✏️ Editar</button>
                </td>
            </tr>
        `).join('');

        res.send(`
        <!DOCTYPE html><html lang="es"><head>${commonHtmlHead}</head><body>
            <div class="container" style="max-width:800px;">
                <div style="margin-bottom:20px;"><a href="/" class="back-link">↩️ Volver al Dashboard</a></div>
                <h1>🔑 Gestión de Accesos</h1>
                <div class="card">
                    <table class="modern-table">
                        <thead><tr><th>ID</th><th>Usuario</th><th>Rol</th><th>Acciones</th></tr></thead>
                        <tbody>${filas}</tbody>
                    </table>
                    <div style="margin-top:20px; padding:15px; background:#f8f9fc; border-radius:5px; font-size:12px; color:#666;">
                        ℹ️ <b>Nota:</b> Aquí puedes ver quién tiene acceso. Para cambiar contraseñas o crear usuarios nuevos, necesitaremos agregar un formulario de registro seguro.
                    </div>
                </div>
            </div>
        </body></html>`);
    } catch (e) { res.status(500).send("Error Usuarios: " + e.message); } finally { if (client) client.release(); }
});



app.listen(PORT, () => {
    console.log(`✅ Servidor PCOE activo en puerto ${PORT}`);
});
