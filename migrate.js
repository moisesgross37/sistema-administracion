const { Pool } = require('pg');
// Usaremos la variable de entorno que Render ya te proporciona
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

const createAdjustmentsTable = async () => {
    // Verificamos que la cadena de conexión exista
    if (!connectionString) {
        console.error('❌ Error: La variable de entorno DATABASE_URL no está definida.');
        return;
    }
    
    const client = await pool.connect();
    try {
        // Esta tabla guardará cada ajuste como un registro único
        await client.query(`
            CREATE TABLE IF NOT EXISTS ajustes_cotizacion (
                id SERIAL PRIMARY KEY,
                quote_id INTEGER REFERENCES quotes(id) ON DELETE CASCADE NOT NULL,
                
                -- Guardará un número positivo (para sumar) o negativo (para restar)
                monto_ajuste NUMERIC NOT NULL, 
                
                -- El motivo o comentario del ajuste
                motivo TEXT NOT NULL,
                
                -- Quién realizó el ajuste
                ajustado_por VARCHAR(255) NOT NULL,
                
                -- La fecha y hora exactas del ajuste
                fecha_ajuste TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        console.log('✅ Tabla "ajustes_cotizacion" verificada/creada exitosamente.');
    } catch (err) {
        console.error('❌ Error al crear la tabla "ajustes_cotizacion":', err);
    } finally {
        client.release();
        pool.end();
    }
};

createAdjustmentsTable();
