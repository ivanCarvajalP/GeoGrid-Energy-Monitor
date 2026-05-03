// index.js
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors()); // Permite peticiones desde tu frontend
app.use(express.json());

// Configuración de la conexión a PostgreSQL/PostGIS
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'proyectofinal_webmapping',
    password: 'root',
    port: 5432,
});

// Endpoint para obtener las subestaciones en formato GeoJSON
app.get('/api/subestaciones', async (req, res) => {
    try {
        // PostGIS hace el trabajo pesado: ST_AsGeoJSON convierte la geometría
        const query = `
            SELECT jsonb_build_object(
                'type',     'FeatureCollection',
                'features', jsonb_agg(features.feature)
            ) as geojson
            FROM (
              SELECT jsonb_build_object(
                'type',       'Feature',
                'geometry',   ST_AsGeoJSON(geom)::jsonb,
                'properties', to_jsonb(inputs) - 'geom'
              ) AS feature
              FROM (SELECT nombre, voltaje, estado, geom FROM subestaciones_energia) inputs
            ) features;
        `;
        
        const { rows } = await pool.query(query);
        res.json(rows[0].geojson);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error en el servidor de base de datos');
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`API REST corriendo en el puerto ${PORT}`);
});