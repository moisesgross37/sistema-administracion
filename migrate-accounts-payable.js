const { Pool } = require('pg');
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

const createAccountsPayableTables = async () => {
    if (!connectionString) {
        console.error('❌ Error: La variable de entorno DATABASE_URL no está definida.');
        return;
    }
    
    const client = await pool.connect();
    try {
        // Tabla para guardar las facturas recibidas de los suplidores
        await client.query(`
            CREATE TABLE IF NOT EXISTS facturas_suplidores (
                id SERIAL PRIMARY KEY,
                supplier_id INTEGER REFERENCES suppliers(id) ON DELETE RESTRICT NOT NULL,
                numero_factura VARCHAR(100),
                fecha_factura DATE NOT NULL,
                fecha_vencimiento DATE,
                monto_total NUMERIC NOT NULL,
                descripcion TEXT,
                estado VARCHAR(50) DEFAULT 'pendiente' NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        console.log('✅ Tabla "facturas_suplidores" verificada/creada exitosamente.');

        // Tabla para registrar los pagos que se hacen a esas facturas
        await client.query(`
            CREATE TABLE IF NOT EXISTS pagos_a_suplidores (
                id SERIAL PRIMARY KEY,
                factura_id INTEGER REFERENCES facturas_suplidores(id) ON DELETE CASCADE NOT NULL,
                payment_date DATE NOT NULL,
                amount_paid NUMERIC NOT NULL,
                payment_method VARCHAR(100),
                notes TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        console.log('✅ Tabla "pagos_a_suplidores" verificada/creada exitosamente.');

    } catch (err) {
        console.error('❌ Error al crear las tablas de cuentas por pagar:', err);
    } finally {
        client.release();
        pool.end();
    }
};

createAccountsPayableTables();
