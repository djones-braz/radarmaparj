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
    toastTimeout: null
};

document.addEventListener('DOMContentLoaded', () => {
    if (typeof L === 'undefined' || typeof Papa === 'undefined') {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.innerHTML = `<div style="background:#fee2e2; border:2px solid #ef4444; border-radius:12px; padding:24px; text-align:center; color:#991b1b; font-family:sans-serif;"><h2>Erro Estrutural Detectado</h2></div>`;
        }
        return;
    }

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
    
    // Adicionado para suportar o botão do menu superior na versão mobile
    if(UI.btnMenu) {
        UI.btnMenu.addEventListener('click', toggleFiltersPanel);
    }
    
    UI.btnCenterMap.addEventListener('click', () => {
        if (AppState.map) {
            AppState.map.setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM, { animate: true, duration: 1 });
        }
    });

    UI.filterCity.addEventListener('change', applyLocationFilters);
    UI.filterHighway.addEventListener('change', applyLocationFilters);

    UI.searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        let query = UI.searchInput.value.trim();
        if (!query) return;

        showToast("A pesquisar local...", "info");
        
        try {
            let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=br&viewbox=-45.0,-20.0,-40.0,-24.0&bounded=0&limit=1`;
            let response = await fetch(url);
            let data = await response.json();

            if (!data || data.length === 0) {
                url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Rio de Janeiro')}&countrycodes=br&limit=1`;
                response = await fetch(url);
                data = await response.json();
            }

            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);
                const zoomLevel = data[0].class === 'highway' || data[0].class === 'building' ? 17 : 14;
                
                AppState.map.setView([lat, lon], zoomLevel, { animate: true, duration: 1.5 });
                showToast("Local encontrado!", "success");
            } else {
                showToast("Endereço não encontrado.", "error");
            }
        } catch (err) {
            showToast("Erro ao comunicar com o servidor.", "error");
        }
    });

    setupFiltersLogic();
}

function toggleFiltersPanel() {
    AppState.isPanelOpen = !AppState.isPanelOpen;
    if (AppState.isPanelOpen) {
        UI.filtersPanel.classList.remove('translate-y-full', 'md:translate-x-full');
    } else {
        UI.filtersPanel.classList.add('translate-y-full', 'md:translate-x-full');
    }
}

function populateSelect(selectElement, optionsArray, defaultText) {
    selectElement.innerHTML = `<option value="all">${defaultText}</option>`;
    optionsArray.forEach(opt => {
        if (!opt) return;
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        selectElement.appendChild(option);
    });
}

function applyLocationFilters() {
    for (let key in AppState.layerGroups) {
        AppState.layerGroups[key].clearLayers();
    }

    const selectedCity = UI.filterCity.value;
    const selectedHighway = UI.filterHighway.value;
    let hasVisibleMarkers = false;

    AppState.markersData.forEach(data => {
        const matchCity = selectedCity === 'all' || data.city === selectedCity;
        const matchHighway = selectedHighway === 'all' || data.highway === selectedHighway;

        if (matchCity && matchHighway) {
            data.marker.addTo(AppState.layerGroups[data.categoryKey]);
            hasVisibleMarkers = true;
        }
    });

    updateMapVisibility();
    
    if ((selectedCity !== 'all' || selectedHighway !== 'all') && hasVisibleMarkers) {
        let bounds = L.latLngBounds();
        for (let key in AppState.layerGroups) {
            let group = AppState.layerGroups[key];
            if (AppState.map.hasLayer(group)) {
                group.eachLayer(function (layer) {
                    bounds.extend(layer.getLatLng());
                });
            }
        }
        if (bounds.isValid()) {
            AppState.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: true, duration: 1 });
        }
        
        let text = selectedCity !== 'all' ? selectedCity : selectedHighway;
        showToast(`A focar radares em ${text}`, 'success');
    }
}

function updateMapVisibility() {
    let activeCategories = 0;
    let totalVisibleMarkers = 0;

    UI.filterCheckboxes.forEach(cb => {
        const layerId = cb.value;
        const isChecked = cb.checked;
        
        if (isChecked) {
            AppState.map.addLayer(AppState.layerGroups[layerId]);
            activeCategories++;
            totalVisibleMarkers += AppState.layerGroups[layerId].getLayers().length;
        } else {
            AppState.map.removeLayer(AppState.layerGroups[layerId]);
        }
    });

    UI.filterBadge.textContent = activeCategories;
    if (activeCategories === 0) UI.filterBadge.classList.add('hidden');
    else UI.filterBadge.classList.remove('hidden');

    UI.filterAllToggle.checked = (activeCategories === UI.filterCheckboxes.length);
    
    if (UI.totalCountSpan) {
        UI.totalCountSpan.textContent = totalVisibleMarkers;
    }
}

function setupFiltersLogic() {
    UI.filterCheckboxes.forEach(cb => {
        cb.addEventListener('change', updateMapVisibility);
    });

    UI.filterAllToggle.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        UI.filterCheckboxes.forEach(cb => {
            cb.checked = isChecked;
        });
        updateMapVisibility();
    });
}

function showToast(message, type = 'info') {
    UI.toastMsg.textContent = message;
    
    UI.toastIcon.className = ''; 
    if (type === 'success') UI.toastIcon.className = 'fa-solid fa-circle-check text-success';
    else if (type === 'error') UI.toastIcon.className = 'fa-solid fa-triangle-exclamation text-danger';
    else UI.toastIcon.className = 'fa-solid fa-circle-info text-primary';

    UI.toast.classList.remove('opacity-0');
    UI.toast.classList.add('opacity-100');

    clearTimeout(AppState.toastTimeout);
    AppState.toastTimeout = setTimeout(() => {
        UI.toast.classList.remove('opacity-100');
        UI.toast.classList.add('opacity-0');
    }, 3000);
}

function initMap() {
    AppState.map = L.map('map', { 
        zoomControl: false,
        tap: false 
    }).setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);
    
    L.control.zoom({ position: 'bottomleft' }).addTo(AppState.map);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(AppState.map);

    for (let key in AppState.layerGroups) {
        AppState.layerGroups[key].addTo(AppState.map);
    }
}

async function fetchAndPlotData() {
    try {
        const [fixosData, portateisData] = await Promise.all([
            fetchCSV(CONFIG.SPREADSHEET_FIXOS, 'fixo'),
            fetchCSV(CONFIG.SPREADSHEET_PORTATEIS, 'portatil')
        ]);

        const allData = [...fixosData, ...portateisData];
        processMapMarkers(allData);

        if (AppState.map) {
            AppState.map.invalidateSize();
        }

        setTimeout(removeLoadingScreen, 800);

    } catch (error) {
        showToast("Erro ao conectar com as Planilhas", "error");
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
            complete: function(results) {
                const cleanData = results.data.map(row => {
                    const normalized = { tipo_origem: defaultType };
                    for (let key in row) {
                        if (row.hasOwnProperty(key) && key) {
                            const cleanKey = String(key).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
                            normalized[cleanKey] = row[key];
                        }
                    }
                    return normalized;
                });
                resolve(cleanData);
            },
            error: function(error) {
                resolve([]);
            }
        });
    });
}

function processMapMarkers(dataArray) {
    for (let key in AppState.layerGroups) {
        AppState.layerGroups[key].clearLayers();
    }
    AppState.markersData = [];

    const citiesSet = new Set();
    const highwaysSet = new Set();

    dataArray.forEach(radar => {
        const latRaw = radar.lat || radar.latitude || radar.y;
        const lngRaw = radar.lng || radar.lon || radar.longitude || radar.x || radar.long;

        if (typeof latRaw === 'string' && (latRaw.toLowerCase().includes('erro') || latRaw.toLowerCase().includes('encontrado'))) {
             return;
        }

        const latStr = latRaw !== undefined && latRaw !== null ? String(latRaw).replace(',', '.') : null;
        const lngStr = lngRaw !== undefined && lngRaw !== null ? String(lngRaw).replace(',', '.') : null;
        
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);

        if (isNaN(lat) || isNaN(lng)) {
            return;
        }

        const tipo = radar.tipo_origem || 'fixo';
        const isInativo = String(radar.status || '').toLowerCase().includes('inativo');
        const status = isInativo ? 'inativo' : 'ativo';
        const categoryKey = `${tipo}-${status}`;

        const rodoviaRaw = radar.rodovia ? String(radar.rodovia).trim().toUpperCase() : 'NÃO IDENTIFICADA';
        const municipioRaw = radar.municipio || radar.localidade || radar.local || 'NÃO INFORMADO';
        const cidadeRaw = String(municipioRaw).trim().toUpperCase();

        if (rodoviaRaw !== 'NÃO IDENTIFICADA') highwaysSet.add(rodoviaRaw);
        if (cidadeRaw !== 'NÃO INFORMADO') citiesSet.add(cidadeRaw);

        const iconClass = tipo === 'fixo' ? 'fa-video' : 'fa-camera';
        const styleClass = `radar-${tipo} ${status}`;

        const customIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div class="radar-marker ${styleClass}"><i class="fa-solid ${iconClass}"></i></div>`,
            iconSize: [38, 38],
            iconAnchor: [19, 19],
            popupAnchor: [0, -19]
        });

        const km = radar.km !== undefined ? ` - KM ${radar.km}` : '';
        const rodoviaFormatada = `${rodoviaRaw}${km}`;
        const limite = radar.velocidadedefiscalizacao || radar.limite || '--';
        const tipoText = tipo === 'fixo' ? 'Radar Fixo' : 'Radar Portátil';
        
        const statusConfig = status === 'ativo' 
            ? { color: 'text-success', bg: 'bg-success/10', icon: 'fa-check-circle', text: 'Operando' }
            : { color: 'text-slate-500', bg: 'bg-slate-100', icon: 'fa-power-off', text: 'Inativo' };

        const popupHtml = `
            <div class="p-4 min-w-[220px] font-sans">
                <div class="flex items-center gap-2 border-b border-slate-100 pb-2 mb-3">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs shadow-md ${tipo === 'fixo' ? (status === 'ativo' ? 'bg-danger' : 'bg-slate-400') : (status === 'ativo' ? 'bg-warning' : 'bg-slate-300')}">
                        <i class="fa-solid ${iconClass}"></i>
                    </div>
                    <div>
                        <h4 class="font-bold text-dark text-base m-0 leading-tight">${tipoText}</h4>
                        <p class="text-[10px] text-secondary uppercase font-bold tracking-wider">${cidadeRaw}</p>
                    </div>
                </div>
                
                <div class="space-y-2 mb-3">
                    <div class="flex items-center gap-2 text-sm text-secondary">
                        <div class="w-5 text-center"><i class="fa-solid fa-road text-slate-400"></i></div>
                        <span class="font-medium text-dark truncate">${rodoviaFormatada}</span>
                    </div>
                    <div class="flex items-center gap-2 text-sm text-secondary">
                        <div class="w-5 text-center"><i class="fa-solid fa-gauge-high text-slate-400"></i></div>
                        <span>Limite: <strong class="text-dark">${limite}</strong></span>
                    </div>
                </div>

                <div class="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold ${statusConfig.bg} ${statusConfig.color} mb-3">
                    <i class="fa-solid ${statusConfig.icon}"></i> ${statusConfig.text}
                </div>
                
                <!-- NOVO: Ferramenta de Depuração e Correção de Rota -->
                <div class="border-t border-slate-100 pt-2 flex items-center justify-between text-[10px] text-slate-400">
                    <span title="Coordenadas cadastradas">${lat.toFixed(4)}, ${lng.toFixed(4)}</span>
                    <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}" target="_blank" class="text-primary hover:text-blue-700 flex items-center gap-1 font-medium transition-colors">
                        <i class="fa-solid fa-map-location-dot"></i> Ver no Maps
                    </a>
                </div>
            </div>
        `;

        const marker = L.marker([lat, lng], { icon: customIcon })
                        .bindPopup(popupHtml, { closeButton: false, className: 'modern-popup' });
        
        AppState.markersData.push({
            marker: marker,
            categoryKey: categoryKey,
            city: cidadeRaw,
            highway: rodoviaRaw
        });
    });
    
    populateSelect(UI.filterCity, Array.from(citiesSet).sort(), "Todas as Cidades");
    populateSelect(UI.filterHighway, Array.from(highwaysSet).sort(), "Todas as Rodovias");

    // Exibir no mapa consoante a seleção
    applyLocationFilters();
}

function removeLoadingScreen() {
    if (UI.loadingOverlay) {
        UI.loadingOverlay.classList.add('opacity-0');
        setTimeout(() => {
            UI.loadingOverlay.style.display = 'none';
        }, 500);
    }
}
