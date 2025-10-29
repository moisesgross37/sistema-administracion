const { Pool } = require('pg');
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

const migrateLoansModule = async () => {
    if (!connectionString) {
        console.error('❌ Error: La variable de entorno DATABASE_URL no está definida.');
        return;
    }
    
    const client = await pool.connect();
    try {
        // 1. Modificar la tabla 'employees' para añadir la opción de nómina
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT FROM pg_attribute WHERE attrelid = 'employees'::regclass AND attname = 'participa_en_nomina') THEN
                    ALTER TABLE employees ADD COLUMN participa_en_nomina BOOLEAN NOT NULL DEFAULT TRUE;
                END IF;
            END $$;
        `);
        console.log('✅ Columna "participa_en_nomina" en la tabla "employees" asegurada.');

        // 2. Crear la tabla para guardar los préstamos
        await client.query(`
            CREATE TABLE IF NOT EXISTS loans (
                id SERIAL PRIMARY KEY,
                employee_id INTEGER REFERENCES employees(id) ON DELETE RESTRICT NOT NULL,
                loan_date DATE NOT NULL,
                loan_amount NUMERIC NOT NULL,
                reason TEXT,
                status VARCHAR(50) DEFAULT 'activo' NOT NULL, -- 'activo', 'pagado'
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        console.log('✅ Tabla "loans" verificada/creada exitosamente.');

        // 3. Crear la tabla para los pagos a los préstamos
        await client.query(`
            CREATE TABLE IF NOT EXISTS loan_payments (
                id SERIAL PRIMARY KEY,
                loan_id INTEGER REFERENCES loans(id) ON DELETE CASCADE NOT NULL,
                payment_date DATE NOT NULL,
                amount_paid NUMERIC NOT NULL,
                payment_method VARCHAR(100), -- 'Descuento Nómina', 'Transferencia', 'Efectivo', etc.
                notes TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        console.log('✅ Tabla "loan_payments" verificada/creada exitosamente.');

    } catch (err) {
        console.error('❌ Error al preparar la base de datos para Préstamos:', err);
    } finally {
        client.release();
        pool.end();
    }
};

migrateLoansModule();
