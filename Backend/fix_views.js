const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'proyectofinal_webmapping',
    password: 'root',
    port: 5432,
});

async function fixViews() {
    try {
        console.log("Recreando vista_subestaciones_medellin...");
        await pool.query(`
            CREATE OR REPLACE VIEW vista_subestaciones_medellin AS
            SELECT 
                s.ogc_fid, 
                s.nombre_subestacion, 
                s.tension, 
                s.vigencia, 
                s.geom
            FROM subestaciones_energia s
            JOIN municipios m ON ST_Intersects(s.geom, m.geom)
            WHERE UPPER(m.mpnombre) LIKE '%MEDEL%';
        `);

        console.log("Recreando vista_lineas_medellin...");
        await pool.query("DROP VIEW IF EXISTS vista_lineas_medellin CASCADE;");
        await pool.query(`
            CREATE OR REPLACE VIEW vista_lineas_medellin AS
            SELECT 
                l.ogc_fid, 
                l.nombre_circuito, 
                l.tension, 
                l.vigencia,
                l.observacion,
                l.geom
            FROM sistema_de_transmision_energia l
            JOIN municipios m ON ST_Intersects(l.geom, m.geom)
            WHERE UPPER(m.mpnombre) LIKE '%MEDEL%';
        `);
        console.log("¡Vistas recreadas exitosamente!");
        
        const countSub = await pool.query("SELECT COUNT(*) FROM vista_subestaciones_medellin");
        console.log("Conteo de vista_subestaciones_medellin:", countSub.rows[0].count);

        const countLin = await pool.query("SELECT COUNT(*) FROM vista_lineas_medellin");
        console.log("Conteo de vista_lineas_medellin:", countLin.rows[0].count);

    } catch(err) {
        console.error("ERROR:", err);
    } finally {
        pool.end();
    }
}
fixViews();
