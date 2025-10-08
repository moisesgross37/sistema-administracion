const { Pool } = require('pg');
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

const createCommissionsModuleTables = async () => {
    if (!connectionString) {
        console.error('❌ Error: La variable de entorno DATABASE_URL no está definida.');
        return;
    }
    
    const client = await pool.connect();
    try {
        // Tabla para gestionar asesores y sus tasas de comisión
        await client.query(`
            CREATE TABLE IF NOT EXISTS advisors (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL,
                commission_rate NUMERIC NOT NULL,
                is_coordinator BOOLEAN DEFAULT FALSE NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        console.log('✅ Tabla "advisors" verificada/creada exitosamente.');

        // Tabla para configuraciones generales de la aplicación
        await client.query(`
            CREATE TABLE IF NOT EXISTS app_settings (
                key VARCHAR(50) PRIMARY KEY,
                value VARCHAR(255) NOT NULL
            );
        `);
        console.log('✅ Tabla "app_settings" verificada/creada exitosamente.');

        // Insertar la configuración inicial para la tasa del coordinador (solo si no existe)
        await client.query(`
            INSERT INTO app_settings (key, value) 
            VALUES ('coordinator_override_rate', '0.03') 
            ON CONFLICT (key) DO NOTHING;
        `);
        console.log('✅ Configuración "coordinator_override_rate" asegurada.');

        // Tabla para el historial de todas las comisiones generadas
        await client.query(`
            CREATE TABLE IF NOT EXISTS commissions (
                id SERIAL PRIMARY KEY,
                payment_id INTEGER REFERENCES payments(id) ON DELETE CASCADE NOT NULL,
                advisor_id INTEGER REFERENCES advisors(id) ON DELETE RESTRICT NOT NULL,
                commission_type VARCHAR(50) NOT NULL, -- 'venta' o 'coordinador'
                base_amount NUMERIC NOT NULL,
                commission_rate NUMERIC NOT NULL,
                commission_amount NUMERIC NOT NULL,
                status VARCHAR(50) DEFAULT 'pendiente' NOT NULL, -- 'pendiente' o 'pagada'
                created_at TIMESTAMPTZ DEFAULT NOW(),
                paid_at TIMESTAMPTZ
            );
        `);
        console.log('✅ Tabla "commissions" verificada/creada exitosamente.');

    } catch (err) {
        console.error('❌ Error al crear las tablas del módulo de comisiones:', err);
    } finally {
        client.release();
        pool.end();
    }
};

createCommissionsModuleTables();
