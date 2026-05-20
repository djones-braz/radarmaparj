// ==========================================
// CONFIGURAÇÃO E ESTADO
// ==========================================
const UI = {
    loadingOverlay: document.getElementById('loading-overlay'),
    filtersPanel: document.getElementById('filters-panel'),
    btnToggleFilters: document.getElementById('btn-toggle-filters'),
    btnCloseFilters: document.getElementById('btn-close-filters'),
    btnCenterMap: document.getElementById('btn-center-map'),
    filterCheckboxes: document.querySelectorAll('.radar-filter'),
    filterAllToggle: document.getElementById('filter-all'),
    filterBadge: document.getElementById('filter-badge'),
    totalCountSpan: document.getElementById('total-radars-count'),
    toast: document.getElementById('notification-toast'),
    toastIcon: document.getElementById('toast-icon'),
    toastMsg: document.getElementById('toast-msg'),
    searchForm: document.getElementById('search-form'),
    searchInput: document.getElementById('search-input')
};

const CONFIG = {
    SPREADSHEET_FIXOS: "https://docs.google.com/spreadsheets/d/1KgpLldzIPdEsEN1K2ox7oVo4SBegZ3RsdIRbCq4_Jb0/export?format=csv",
    SPREADSHEET_PORTATEIS: "https://docs.google.com/spreadsheets/d/1UEMPYtUwSplcpWkNyNO0F4ETBiPjzLxsFgbXqsxTRzE/export?format=csv",
    MAP_CENTER: [-22.9068, -43.1729],
    MAP_ZOOM: 9
};

const AppState = {
    map: null,
    layerGroups: {
        'fixo-ativo': L.layerGroup(),
        'fixo-inativo': L.layerGroup(),
        'portatil-ativo': L.layerGroup(),
        'portatil-inativo': L.layerGroup()
    },
    markersData: [],
    routeLine: null,
    isPanelOpen: false,
    toastTimeout: null
};

// ==========================================
// MÓDULO DE ROTA E FILTRAGEM
// ==========================================

async function drawRoute(start, end) {
    showToast("A calcular a melhor rota...", "info");
    const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
            const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);

            if (AppState.routeLine) AppState.map.removeLayer(AppState.routeLine);

            AppState.routeLine = L.polyline(coords, {
                color: '#3b82f6',
                weight: 6,
                opacity: 0.8,
                dashArray: '10, 10',
                lineJoin: 'round'
            }).addTo(AppState.map);

            AppState.map.fitBounds(AppState.routeLine.getBounds(), { padding: [50, 50], animate: true });

            // Lógica de destaque de radares na rota
            highlightRadarsOnRoute(coords);

            const distanceKm = (data.routes[0].distance / 1000).toFixed(1);
            showToast(`Rota traçada: ${distanceKm} km. Radares na rota destacados!`, "success");
        }
    } catch (err) {
        showToast("Erro ao conectar com servidor de rotas.", "error");
    }
}

function highlightRadarsOnRoute(routeCoords) {
    const BUFFER_METERS = 500;
    const radaresNaRota = [];

    // Limpa filtros para isolar apenas os radares da rota
    UI.filterAllToggle.checked = false;
    UI.filterCheckboxes.forEach(cb => cb.checked = false);
    
    // Remove todos os radares do mapa primeiro
    Object.values(AppState.layerGroups).forEach(group => {
        if (AppState.map.hasLayer(group)) AppState.map.removeLayer(group);
    });

    AppState.markersData.forEach(radar => {
        const radarLatLng = radar.marker.getLatLng();
        let isClose = false;

        for (let i = 0; i < routeCoords.length; i += 5) {
            const dist = AppState.map.distance(radarLatLng, routeCoords[i]);
            if (dist < BUFFER_METERS) {
                isClose = true;
                break;
            }
        }

        if (isClose) {
            radar.marker.addTo(AppState.map);
            radaresNaRota.push(radar);
        }
    });

    if (radaresNaRota.length === 0) {
        showToast("Nenhum radar detectado na sua rota.", "info");
    }
}

// ==========================================
// MÓDULO DE UI E MAPA
// ==========================================

function initUI() {
    UI.btnToggleFilters.addEventListener('click', toggleFiltersPanel);
    UI.btnCloseFilters.addEventListener('click', toggleFiltersPanel);
    UI.btnCenterMap.addEventListener('click', () => {
        if (AppState.map) AppState.map.setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);
    });

    UI.searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        let query = UI.searchInput.value.trim();
        if (!query) return;

        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
            const data = await res.json();
            if (data.length > 0) {
                AppState.map.setView([data[0].lat, data[0].lon], 14);
            }
        } catch (err) {
            showToast("Erro ao pesquisar.", "error");
        }
    });

    setupFiltersLogic();
}

function toggleFiltersPanel() {
    AppState.isPanelOpen = !AppState.isPanelOpen;
    const action = AppState.isPanelOpen ? 'remove' : 'add';
    const classVal = window.innerWidth < 768 ? 'translate-y-full' : 'translate-x-full';
    UI.filtersPanel.classList[action](classVal);
}

function setupFiltersLogic() {
    const updateMapLayers = () => {
        UI.filterCheckboxes.forEach(cb => {
            if (cb.checked) AppState.map.addLayer(AppState.layerGroups[cb.value]);
            else AppState.map.removeLayer(AppState.layerGroups[cb.value]);
        });
    };

    UI.filterCheckboxes.forEach(cb => cb.addEventListener('change', updateMapLayers));
    UI.filterAllToggle.addEventListener('change', (e) => {
        UI.filterCheckboxes.forEach(cb => cb.checked = e.target.checked);
        updateMapLayers();
    });
}

function showToast(message, type = 'info') {
    UI.toastMsg.textContent = message;
    UI.toast.classList.remove('opacity-0');
    UI.toast.classList.add('opacity-100');
    clearTimeout(AppState.toastTimeout);
    AppState.toastTimeout = setTimeout(() => {
        UI.toast.classList.remove('opacity-100');
        UI.toast.classList.add('opacity-0');
    }, 3000);
}

function initMap() {
    AppState.map = L.map('map', { zoomControl: false, tap: false }).setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);
    L.control.zoom({ position: 'bottomleft' }).addTo(AppState.map);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19
    }).addTo(AppState.map);

    for (let key in AppState.layerGroups) {
        AppState.layerGroups[key].addTo(AppState.map);
    }
}

async function fetchAndPlotData() {
    try {
        const [fixos, portateis] = await Promise.all([
            fetchCSV(CONFIG.SPREADSHEET_FIXOS, 'fixo'),
            fetchCSV(CONFIG.SPREADSHEET_PORTATEIS, 'portatil')
        ]);
        
        processMapMarkers([...fixos, ...portateis]);
        removeLoadingScreen();
    } catch (error) {
        removeLoadingScreen();
    }
}

function fetchCSV(url, defaultType) {
    return new Promise((resolve) => {
        Papa.parse(url, {
            download: true,
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: (results) => {
                const data = results.data.map(row => {
                    const normalized = { tipo_origem: defaultType };
                    for (let key in row) {
                        const cleanKey = String(key).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
                        normalized[cleanKey] = row[key];
                    }
                    return normalized;
                });
                resolve(data);
            }
        });
    });
}

function processMapMarkers(dataArray) {
    dataArray.forEach(radar => {
        const lat = parseFloat(String(radar.lat || radar.latitude || 0).replace(',', '.'));
        const lng = parseFloat(String(radar.lng || radar.lon || 0).replace(',', '.'));
        if (isNaN(lat) || isNaN(lng)) return;

        const status = String(radar.status || '').toLowerCase().includes('inativo') ? 'inativo' : 'ativo';
        const categoryKey = `${radar.tipo_origem}-${status}`;
        
        const marker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: 'custom-div-icon',
                html: `<div class="radar-marker radar-${radar.tipo_origem} ${status}"><i class="fa-solid ${radar.tipo_origem === 'fixo' ? 'fa-video' : 'fa-camera'}"></i></div>`,
                iconSize: [38, 38]
            })
        });

        AppState.markersData.push({ marker, category: categoryKey });
        marker.addTo(AppState.layerGroups[categoryKey]);
    });
}

function removeLoadingScreen() {
    UI.loadingOverlay.classList.add('opacity-0');
    setTimeout(() => UI.loadingOverlay.style.display = 'none', 500);
}

document.addEventListener('DOMContentLoaded', () => {
    initUI();
    initMap();
    fetchAndPlotData();
});
