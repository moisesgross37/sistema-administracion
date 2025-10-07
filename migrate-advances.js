const { Pool } = require('pg');
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

const createAdvancesTable = async () => {
    if (!connectionString) {
        console.error('❌ Error: La variable de entorno DATABASE_URL no está definida.');
        return;
    }
    
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS avances_empleado (
                id SERIAL PRIMARY KEY,
                employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
                advance_date DATE NOT NULL,
                amount NUMERIC NOT NULL,
                reason TEXT,
                
                -- Estado para saber si el avance está pendiente o ya se descontó en una nómina
                status VARCHAR(50) DEFAULT 'pendiente' NOT NULL,
                
                -- En el futuro, aquí podremos guardar el ID de la nómina donde se aplicó el descuento
                payroll_record_id INTEGER REFERENCES payroll_records(id) ON DELETE SET NULL 
            );
        `);
        console.log('✅ Tabla "avances_empleado" verificada/creada exitosamente.');
    } catch (err) {
        console.error('❌ Error al crear la tabla "avances_empleado":', err);
    } finally {
        client.release();
        pool.end();
    }
};

createAdvancesTable();
