const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors()); 
app.use(express.json()); // Necesario para procesar el body de peticiones POST

// Configuración de la conexión
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'proyectofinal_webmapping',
    password: 'root',
    port: 5432,
});

// 1. ENDPOINT GET: Obtener subestaciones y transformarlas a 4326 para Leaflet
app.get('/api/subestaciones', async (req, res) => {
    try {
        const query = `
            SELECT jsonb_build_object(
                'type',     'FeatureCollection',
                'features', jsonb_agg(features.feature)
            ) as geojson
            FROM (
              SELECT jsonb_build_object(
                'type',       'Feature',
                'geometry',   ST_AsGeoJSON(ST_Transform(geom, 4326))::jsonb,
                'properties', to_jsonb(inputs) - 'geom'
              ) AS feature
              FROM (
                  SELECT ogc_fid, nombre_subestacion, tension, vigencia, geom 
                  FROM vista_subestaciones_medellin
              ) inputs
            ) features;
        `;
        const { rows } = await pool.query(query);
        res.json(rows[0].geojson);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error en el servidor');
    }
});

// 2. ENDPOINT GET: Obtener líneas de transmisión y transformarlas a 4326
app.get('/api/lineas', async (req, res) => {
    try {
        const query = `
            SELECT jsonb_build_object(
                'type',     'FeatureCollection',
                'features', jsonb_agg(features.feature)
            ) as geojson
            FROM (
              SELECT jsonb_build_object(
                'type',       'Feature',
                'geometry',   ST_AsGeoJSON(ST_Transform(geom, 4326))::jsonb,
                'properties', to_jsonb(inputs) - 'geom'
              ) AS feature
              FROM (
                  SELECT ogc_fid, nombre_circuito, tension, geom 
                  FROM vista_lineas_medellin
              ) inputs
            ) features;
        `;
        const { rows } = await pool.query(query);
        res.json(rows[0].geojson);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error en el servidor consultando lineas');
    }
});

// 3. Endpoint para guardar el reporte (según requerimiento de la rúbrica)
app.post('/api/reporte', async (req, res) => {
    const { usuario, id_equipo, nombre_equipo, lng, lat } = req.body;
    try {
        const query = `
            INSERT INTO REPORTE (usuario, id_equipo, nombre_equipo, geom)
            VALUES ($1, $2, $3, ST_Transform(ST_SetSRID(ST_MakePoint($4, $5), 4326), 3116))
        `;
        await pool.query(query, [usuario, id_equipo, nombre_equipo, lng, lat]);
        res.status(200).send({ mensaje: 'Reporte guardado' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error al guardar reporte');
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`API REST corriendo en el puerto ${PORT}`);
});