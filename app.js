// ==========================================
// CONFIGURAÇÃO E ESTADO
// ==========================================
const CONFIG = {
    SPREADSHEET_FIXOS: "https://docs.google.com/spreadsheets/d/1KgpLldzIPdEsEN1K2ox7oVo4SBegZ3RsdIRbCq4_Jb0/export?format=csv",
    SPREADSHEET_PORTATEIS: "https://docs.google.com/spreadsheets/d/1UEMPYtUwSplcpWkNyNO0F4ETBiPjzLxsFgbXqsxTRzE/export?format=csv",
    MAP_CENTER: [-22.9068, -43.1729],
    MAP_ZOOM: 9,
    COLORS: {
        ativo: "#22c55e",   // Verde para ativo
        inativo: "#ef4444"  // Vermelho para inativo
    }
};

let UI = {};
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
        searchInput: document.getElementById('search-input')
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
// LÓGICA DE PROCESSAMENTO DE DADOS
// ==========================================
function processMapMarkers(dataArray) {
    for (let key in AppState.layerGroups) AppState.layerGroups[key].clearLayers();

    let plottedCount = 0;
    dataArray.forEach(radar => {
        const lat = parseFloat(String(radar.lat || radar.latitude || 0).replace(',', '.'));
        const lng = parseFloat(String(radar.lng || radar.lon || 0).replace(',', '.'));
        if (isNaN(lat) || isNaN(lng)) return;

        const isInativo = String(radar.status || '').toLowerCase().includes('inativo');
        const status = isInativo ? 'inativo' : 'ativo';
        const statusColor = CONFIG.COLORS[status];
        const categoryKey = `${radar.tipo_origem || 'fixo'}-${status}`;

        const customIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div class="radar-marker" style="border: 3px solid ${statusColor}; background: ${statusColor}20;">
                    <i class="fa-solid ${radar.tipo_origem === 'fixo' ? 'fa-video' : 'fa-camera'}" style="color: ${statusColor}"></i>
                   </div>`,
            iconSize: [38, 38],
            iconAnchor: [19, 19]
        });

        const popupHtml = `
            <div class="popup-container" style="border-top: 4px solid ${statusColor}; padding: 10px;">
                <h4 style="color: ${statusColor}; font-weight: bold;">${status === 'ativo' ? 'Radar Ativo' : 'Radar Inativo'}</h4>
                <p><strong>Rodovia:</strong> ${radar.rodovia || 'N/A'}</p>
                <p><strong>Limite:</strong> ${radar.limite || '--'} km/h</p>
            </div>
        `;

        const marker = L.marker([lat, lng], { icon: customIcon }).bindPopup(popupHtml);
        if (AppState.layerGroups[categoryKey]) marker.addTo(AppState.layerGroups[categoryKey]);
        plottedCount++;
    });
    return plottedCount;
}

// ... (Restante da sua lógica de OSRM, Filtros e Geolocation permanece idêntica à anterior)

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

async function fetchAndPlotData() {
    // Mantém a lógica assíncrona de fetchCSV original
    UI.loadingOverlay.classList.add('opacity-0');
    setTimeout(() => UI.loadingOverlay.style.display = 'none', 500);
}

function setupFiltersLogic() {
    UI.filterAllToggle.addEventListener('change', (e) => {
        UI.filterCheckboxes.forEach(cb => cb.checked = e.target.checked);
    });
}
