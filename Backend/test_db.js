const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'proyectofinal_webmapping',
    password: 'root',
    port: 5432,
});

async function test() {
    try {
        console.log("Columnas de sistema_de_transmision_energia:");
        const res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'sistema_de_transmision_energia'");
        console.log(res.rows);
    } catch(err) {
        console.error("ERROR:", err);
    } finally {
        pool.end();
    }
}
test();
