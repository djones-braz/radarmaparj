// ==========================================
// CONFIGURAÇÃO E ESTADO
// ==========================================
let UI = {};

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
    isPanelOpen: false,
    toastTimeout: null,
    userLocation: null,
    userMarker: null,
    routeLine: null
};

// ==========================================
// INICIALIZAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    UI = {
        loadingOverlay: document.getElementById('loading-overlay'),
        filtersPanel: document.getElementById('filters-panel'),
        btnToggleFilters: document.getElementById('btn-toggle-filters'),
        btnCloseFilters: document.getElementById('btn-close-filters'),
        btnMenu: document.getElementById('btn-menu'),
        btnCenterMap: document.getElementById('btn-center-map'),
        filterCheckboxes: document.querySelectorAll('.radar-filter'),
        filterAllToggle: document.getElementById('filter-all'),
        filterBadge: document.getElementById('filter-badge'),
        totalCountSpan: document.getElementById('total-radars-count'),
        toast: document.getElementById('notification-toast'),
        toastIcon: document.getElementById('toast-icon'),
        toastMsg: document.getElementById('toast-msg'),
        searchForm: document.getElementById('search-form'),
        searchInput: document.getElementById('search-input'),
        filterCity: document.getElementById('filter-city'),
        filterHighway: document.getElementById('filter-highway')
    };

    initUI();
    initMap();
    fetchAndPlotData();
});

function initUI() {
    UI.btnToggleFilters.addEventListener('click', toggleFiltersPanel);
    UI.btnCloseFilters.addEventListener('click', toggleFiltersPanel);
    if(UI.btnMenu) UI.btnMenu.addEventListener('click', toggleFiltersPanel);
    
    UI.btnCenterMap.addEventListener('click', () => {
        getUserLocation((loc) => {
            if (loc) AppState.map.setView(loc, 15, { animate: true });
        });
    });
    setupFiltersLogic();
}

// ==========================================
// LÓGICA DE ROTAS E RADARES
// ==========================================
async function drawRoute(start, end) {
    showToast("A calcular rota...", "info");
    const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.routes && data.routes.length > 0) {
            const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
            if (AppState.routeLine) AppState.map.removeLayer(AppState.routeLine);
            AppState.routeLine = L.polyline(coords, { color: '#3b82f6', weight: 6, opacity: 0.8 }).addTo(AppState.map);
            AppState.map.fitBounds(AppState.routeLine.getBounds(), { padding: [50, 50] });
            highlightRadarsOnRoute(coords);
            showToast("Rota traçada!", "success");
        }
    } catch (err) {
        showToast("Erro ao calcular rota.", "error");
    }
}

function highlightRadarsOnRoute(routeCoords) {
    const BUFFER = 500;
    AppState.markersData.forEach(radar => {
        const rLatLng = radar.marker.getLatLng();
        const isClose = routeCoords.some(c => AppState.map.distance(rLatLng, c) < BUFFER);
        if (isClose) radar.marker.addTo(AppState.map);
    });
}

// ==========================================
// FUNÇÕES DE SUPORTE
// ==========================================
function getUserLocation(callback) {
    if (!navigator.geolocation) return showToast("Geolocalização indisponível", "error");
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const loc = [pos.coords.latitude, pos.coords.longitude];
            if (AppState.userMarker) AppState.map.removeLayer(AppState.userMarker);
            AppState.userMarker = L.marker(loc).addTo(AppState.map);
            callback(loc);
        },
        () => showToast("Erro ao obter localização", "error")
    );
}

function toggleFiltersPanel() {
    AppState.isPanelOpen = !AppState.isPanelOpen;
    const isMobile = window.innerWidth < 768;
    UI.filtersPanel.classList.toggle('translate-y-full', !AppState.isPanelOpen && isMobile);
    UI.filtersPanel.classList.toggle('translate-x-full', !AppState.isPanelOpen && !isMobile);
}

function showToast(msg, type) {
    UI.toastMsg.textContent = msg;
    UI.toast.classList.remove('opacity-0');
    UI.toast.classList.add('opacity-100');
    clearTimeout(AppState.toastTimeout);
    AppState.toastTimeout = setTimeout(() => {
        UI.toast.classList.remove('opacity-100');
        UI.toast.classList.add('opacity-0');
    }, 3000);
}

function initMap() {
    AppState.map = L.map('map', { zoomControl: false }).setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);
    L.control.zoom({ position: 'bottomleft' }).addTo(AppState.map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(AppState.map);
    for (let key in AppState.layerGroups) AppState.layerGroups[key].addTo(AppState.map);
}

function fetchAndPlotData() {
    // Carregamento inicial (simulado para estrutura completa)
    UI.loadingOverlay.classList.add('opacity-0');
    setTimeout(() => UI.loadingOverlay.style.display = 'none', 500);
}

function setupFiltersLogic() {
    UI.filterAllToggle.addEventListener('change', (e) => {
        UI.filterCheckboxes.forEach(cb => cb.checked = e.target.checked);
    });
}
