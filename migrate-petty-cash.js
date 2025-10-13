const { Pool } = require('pg');
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

const migratePettyCash = async () => {
    if (!connectionString) {
        console.error('❌ Error: La variable de entorno DATABASE_URL no está definida.');
        return;
    }
    
    const client = await pool.connect();
    try {
        // 1. Crear la tabla para guardar los ciclos de caja chica
        await client.query(`
            CREATE TABLE IF NOT EXISTS caja_chica_ciclos (
                id SERIAL PRIMARY KEY,
                fecha_inicio DATE NOT NULL,
                fecha_cierre DATE,
                fondo_inicial NUMERIC NOT NULL,
                total_gastado NUMERIC DEFAULT 0,
                balance_final NUMERIC,
                estado VARCHAR(50) NOT NULL -- 'abierto' o 'cerrado'
            );
        `);
        console.log('✅ Tabla "caja_chica_ciclos" verificada/creada exitosamente.');

        // 2. Añadir la columna a la tabla 'expenses' para vincular un gasto a un ciclo.
        // Se ejecuta de forma segura para no dar error si la columna ya existe.
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT FROM pg_attribute WHERE attrelid = 'expenses'::regclass AND attname = 'caja_chica_ciclo_id') THEN
                    ALTER TABLE expenses ADD COLUMN caja_chica_ciclo_id INTEGER REFERENCES caja_chica_ciclos(id) ON DELETE SET NULL;
                END IF;
            END $$;
        `);
        console.log('✅ Columna "caja_chica_ciclo_id" en la tabla "expenses" asegurada.');

    } catch (err) {
        console.error('❌ Error al preparar la base de datos para Caja Chica:', err);
    } finally {
        client.release();
        pool.end();
    }
};

migratePettyCash();
