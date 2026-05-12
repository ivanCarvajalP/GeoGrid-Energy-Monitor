// 1. Inicializar Mapa
const map = L.map('map').setView([6.2442, -75.5812], 12);

// Capa Base principal (Modo Claro - CartoDB Positron)
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
}).addTo(map);

// Añadir Escala requerida
L.control.scale({ position: 'bottomleft', metric: true, imperial: false }).addTo(map);

// Variables globales
const markers = L.markerClusterGroup();
let lineasLayerGroup = L.layerGroup(); // Grupo para las líneas eléctricas

window.bufferLayer = null; // Capa temporal para dibujar el buffer
window.routeControl = null; // Control de ruta temporal

let dataSubestaciones = null;
let dataLineas = null;
let voltajesSet = new Set();
let filtroActivo = null; // null significa "Mostrar Todo"

// --- 3. Añadir MiniMap ---
const osmUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const osm2 = new L.TileLayer(osmUrl, { minZoom: 0, maxZoom: 13, attribution: '© CARTO' });
const miniMap = new L.Control.MiniMap(osm2, { toggleDisplay: true, minimized: false }).addTo(map);

// --- 4. Funciones de Funcionalidad ---

// Función para guardar reporte
async function enviarReporte(id, nombre, lat, lng) {
    const usuario = document.getElementById('nombreOperador').value;
    
    if(!usuario) {
        alert("Por favor ingrese el nombre del operador arriba.");
        return;
    }

    try {
        const response = await fetch('http://localhost:3000/api/reporte', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                usuario: usuario,
                id_equipo: id || 'N/A',
                nombre_equipo: nombre,
                lat: lat,
                lng: lng
            })
        });

        if(response.ok) {
            alert(`Reporte guardado exitosamente para: ${nombre}`);
        } else {
            alert('Error al guardar en la base de datos.');
        }
    } catch (error) {
        console.error('Error de red:', error);
    }
}

// Función para crear el análisis espacial (Buffer)
function analizarImpacto(lat, lng, nombre) {
    if (window.bufferLayer) map.removeLayer(window.bufferLayer);

    const point = turf.point([lng, lat]);
    const buffer = turf.buffer(point, 500, { units: 'meters' }); // Análisis en metros

    window.bufferLayer = L.geoJSON(buffer, {
        style: { color: 'red', fillColor: 'red', fillOpacity: 0.2, weight: 2 }
    }).addTo(map);
    
    alert("Simulando área de afectación de 500m para: " + nombre);
}

// Función para trazar ruta usando Leaflet Routing Machine y la ubicación del usuario
function trazarRuta(destLat, destLng) {
    // Si ya existe una ruta trazada, la eliminamos
    if (window.routeControl) {
        map.removeControl(window.routeControl);
    }

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const userLat = position.coords.latitude;
                const userLng = position.coords.longitude;
                
                window.routeControl = L.Routing.control({
                    waypoints: [
                        L.latLng(userLat, userLng),
                        L.latLng(destLat, destLng)
                    ],
                    routeWhileDragging: false,
                    showAlternatives: false,
                    language: 'es',
                    createMarker: function(i, wp, nWps) {
                        if (i === 0) {
                            return L.marker(wp.latLng).bindPopup("<b>Tu ubicación</b>");
                        } else {
                            return L.marker(wp.latLng).bindPopup("<b>Destino</b>");
                        }
                    }
                }).addTo(map);
            }, 
            (error) => {
                console.error("Error obteniendo ubicación:", error);
                alert("No se pudo obtener tu ubicación. Asegúrate de dar permisos de geolocalización al navegador.");
            }
        );
    } else {
        alert("La geolocalización no es soportada por este navegador.");
    }
}

// --- Función para definir estilo semántico y grosor de líneas ---
function obtenerEstiloLinea(tension, isCasing = false, vigencia = '', observacion = '') {
    // 1. Jerarquía por Grosor
    let weight = 1; // Baja tensión
    if (tension >= 230) weight = 4;
    else if (tension >= 110) weight = 2.5;

    // 3. Paleta de Colores
    let color = '#333333'; // Gris oscuro para baja tensión
    if (tension >= 500) color = '#800080'; // Púrpura oscuro
    else if (tension >= 230) color = '#CC3300'; // Naranja quemado
    else if (tension >= 110) color = '#0000CD'; // Azul intenso

    // 2. Técnica de "Casing"
    if (isCasing) {
        return {
            color: '#ffffff', // Borde blanco (Casing)
            weight: weight + 2.5, // Más ancho que la línea de color
            opacity: 1
        };
    }

    // 4. Patrones para Circuitos Especiales
    let dashArray = null;
    let str = (vigencia + " " + observacion).toLowerCase();
    if (str.includes("fuera") || str.includes("construcci") || str.includes("proyect")) {
        dashArray = "6, 6"; // Punteado
    }

    return {
        color: color,
        weight: weight,
        opacity: 0.9,
        dashArray: dashArray
    };
}

// --- Renderizar Capas en base al Filtro ---
function renderizarCapas() {
    markers.clearLayers();
    lineasLayerGroup.clearLayers();

    // Renderizar subestaciones filtradas
    if (dataSubestaciones) {
        const geojsonSub = L.geoJSON(dataSubestaciones, {
            filter: function(feature) {
                if (!filtroActivo) return true;
                return feature.properties.tension == filtroActivo;
            },
            onEachFeature: (feature, layer) => {
                const { nombre_subestacion, tension, ogc_fid } = feature.properties;
                // Para puntos, geometry es [lng, lat]
                const [lng, lat] = feature.geometry.coordinates;

                layer.bindPopup(`
                    <div style="text-align:center;">
                        <b>Subestación:</b> ${nombre_subestacion || 'Desconocida'}<br>
                        <b>Tensión:</b> ${tension || 'N/A'} kV<br>
                        <hr>
                        <button class="popup-btn popup-btn-buffer" onclick="analizarImpacto(${lat}, ${lng}, '${nombre_subestacion}')">Ver Buffer (500m)</button>
                        <button class="popup-btn popup-btn-route" onclick="trazarRuta(${lat}, ${lng})">Calcular Ruta</button>
                        <button class="popup-btn popup-btn-report" onclick="enviarReporte('${ogc_fid}', '${nombre_subestacion}', ${lat}, ${lng})">Reportar Mantenimiento</button>
                    </div>
                `);
            }
        });
        markers.addLayer(geojsonSub);
    }

    // Renderizar lineas filtradas
    if (dataLineas) {
        // Capa Casing (borde blanco inferior)
        const geojsonLinCasing = L.geoJSON(dataLineas, {
            filter: function(feature) {
                if (!filtroActivo) return true;
                return feature.properties.tension == filtroActivo;
            },
            style: function(feature) {
                return obtenerEstiloLinea(feature.properties.tension, true, feature.properties.vigencia, feature.properties.observacion);
            },
            interactive: false // Ignora clics para que pasen a la línea superior
        });

        // Capa Color principal
        const geojsonLinColor = L.geoJSON(dataLineas, {
            filter: function(feature) {
                if (!filtroActivo) return true;
                return feature.properties.tension == filtroActivo;
            },
            style: function(feature) {
                return obtenerEstiloLinea(feature.properties.tension, false, feature.properties.vigencia, feature.properties.observacion);
            },
            onEachFeature: (feature, layer) => {
                const { nombre_circuito, tension, vigencia, observacion } = feature.properties;
                let estado = vigencia || 'Operativo';
                if(observacion) estado += ` (${observacion})`;
                
                layer.bindPopup(`
                    <div style="text-align:center;">
                        <b>Circuito (Línea):</b> ${nombre_circuito || 'Desconocido'}<br>
                        <b>Tensión:</b> ${tension || 'N/A'} kV<br>
                        <b>Estado:</b> ${estado}
                    </div>
                `);
            }
        });
        lineasLayerGroup.addLayer(geojsonLinCasing);
        lineasLayerGroup.addLayer(geojsonLinColor);
    }
}

// --- Crear botones de filtro dinámicos ---
function generarFiltros() {
    const container = document.getElementById('filter-pills-container');
    container.innerHTML = ''; // Limpiar

    // Botón "Todos"
    const btnTodos = document.createElement('div');
    btnTodos.className = 'filter-pill active';
    btnTodos.innerText = 'Todos';
    btnTodos.onclick = () => aplicarFiltro(null, btnTodos);
    container.appendChild(btnTodos);

    // Botones dinámicos ordenados descendente
    const voltajesArray = Array.from(voltajesSet).sort((a, b) => b - a);
    
    voltajesArray.forEach(voltaje => {
        const btn = document.createElement('div');
        btn.className = 'filter-pill';
        btn.innerText = `${voltaje} kV`;
        btn.onclick = () => aplicarFiltro(voltaje, btn);
        container.appendChild(btn);
    });
}

function aplicarFiltro(voltaje, element) {
    filtroActivo = voltaje;
    
    // Actualizar UI de pastillas
    document.querySelectorAll('.filter-pill').forEach(el => el.classList.remove('active'));
    element.classList.add('active');

    // Renderizar
    renderizarCapas();
}

// --- 5. Carga de los Datos ---
async function cargarDatos() {
    try {
        // Cargar Subestaciones
        const resSub = await fetch('http://localhost:3000/api/subestaciones');
        dataSubestaciones = await resSub.json();

        // Cargar Lineas
        const resLin = await fetch('http://localhost:3000/api/lineas');
        dataLineas = await resLin.json();

        // Calcular conteos para las Tarjetas de Resumen
        let countSub = 0;
        let countLin = 0;

        // Llenar buscador y extraer voltajes de subestaciones
        const datalist = document.getElementById('listaSubestaciones');
        if (dataSubestaciones && dataSubestaciones.features) {
            countSub = dataSubestaciones.features.length;
            dataSubestaciones.features.forEach(f => {
                const props = f.properties;
                if(props.tension) voltajesSet.add(props.tension);
                
                if (props.nombre_subestacion) {
                    const option = document.createElement('option');
                    option.value = props.nombre_subestacion;
                    datalist.appendChild(option);
                }
            });
        }

        // Extraer voltajes de líneas
        if (dataLineas && dataLineas.features) {
            countLin = dataLineas.features.length;
            dataLineas.features.forEach(f => {
                const props = f.properties;
                if(props.tension) voltajesSet.add(props.tension);
            });
        }

        // Actualizar UI
        document.getElementById('count-subestaciones').innerText = countSub;
        document.getElementById('count-lineas').innerText = countLin;

        // Añadir las capas al mapa
        map.addLayer(markers);
        map.addLayer(lineasLayerGroup);

        generarFiltros();
        renderizarCapas();

        // Evento de búsqueda del buscador
        document.getElementById('buscadorSubestacion').addEventListener('input', function(e) {
            const query = e.target.value.trim();
            if (!query) return;

            // Iterar sobre las subestaciones renderizadas
            markers.eachLayer(layer => {
                if (layer.feature.properties.nombre_subestacion === query) {
                    const latLng = layer.getLatLng();
                    map.flyTo(latLng, 16); 
                    markers.zoomToShowLayer(layer, function() {
                        layer.openPopup(); 
                    });
                }
            });
        });

    } catch (error) {
        console.error("Error cargando datos:", error);
    }
}

// Iniciar aplicación
cargarDatos();
