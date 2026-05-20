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
    isPanelOpen: false,
    toastTimeout: null
};

function initUI() {
    UI.btnToggleFilters.addEventListener('click', toggleFiltersPanel);
    UI.btnCloseFilters.addEventListener('click', toggleFiltersPanel);
    UI.btnCenterMap.addEventListener('click', () => {
        if (AppState.map) AppState.map.setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM, { animate: true, duration: 1 });
    });
    // (Restante da inicialização da UI omitida por brevidade, manter a do seu arquivo original)
}
// ==========================================
// NÚCLEO DE RENDERIZAÇÃO (Com Cores Dinâmicas)
// ==========================================

function processMapMarkers(dataArray) {
    for (let key in AppState.layerGroups) AppState.layerGroups[key].clearLayers();
    let plottedCount = 0;

    dataArray.forEach(radar => {
        const lat = parseFloat(String(radar.lat || radar.latitude || 0).replace(',', '.'));
        const lng = parseFloat(String(radar.lng || radar.lon || 0).replace(',', '.'));
        if (isNaN(lat) || isNaN(lng)) return;

        const status = String(radar.status || '').toLowerCase().includes('inativo') ? 'inativo' : 'ativo';
        const statusColor = status === 'ativo' ? '#22c55e' : '#ef4444'; 
        const categoryKey = `${radar.tipo_origem || 'fixo'}-${status}`;

        const customIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div class="radar-marker" style="border: 3px solid ${statusColor}; background: ${statusColor}20; width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                    <i class="fa-solid ${radar.tipo_origem === 'fixo' ? 'fa-video' : 'fa-camera'}" style="color: ${statusColor}; font-size: 16px;"></i>
                   </div>`,
            iconSize: [38, 38],
            iconAnchor: [19, 19]
        });

        const popupHtml = `
            <div style="border-top: 4px solid ${statusColor}; padding: 12px; min-width: 200px;">
                <h4 style="color: ${statusColor}; font-weight: bold; margin-bottom: 8px;">${status === 'ativo' ? 'Radar Ativo' : 'Radar Inativo'}</h4>
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

// Chame estas funções no seu document.addEventListener('DOMContentLoaded', ...)
