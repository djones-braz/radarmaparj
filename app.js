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
    // ATUALIZAÇÃO CRUCIAL: Usando a API de Visualização do Google (gviz) que é à prova de bloqueios para planilhas públicas
    SPREADSHEET_FIXOS: "https://docs.google.com/spreadsheets/d/1KgpLldzIPdEsEN1K2ox7oVo4SBegZ3RsdIRbCq4_Jb0/gviz/tq?tqx=out:csv",
    SPREADSHEET_PORTATEIS: "https://docs.google.com/spreadsheets/d/1UEMPYtUwSplcpWkNyNO0F4ETBiPjzLxsFgbXqsxTRzE/gviz/tq?tqx=out:csv",
    MAP_CENTER: [-22.9068, -43.1729], // Rio de Janeiro
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

// ==========================================
// MÓDULO DE UI E INTERAÇÃO
// ==========================================

function initUI() {
    UI.btnToggleFilters.addEventListener('click', toggleFiltersPanel);
    UI.btnCloseFilters.addEventListener('click', toggleFiltersPanel);
    
    UI.btnCenterMap.addEventListener('click', () => {
        if (AppState.map) {
            AppState.map.setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM, { animate: true, duration: 1 });
        }
    });

    UI.searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        let query = UI.searchInput.value.trim();
        if (!query) return;

        showToast("Buscando local...", "info");
        
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
                showToast("Endereço não encontrado. Tente ser mais específico.", "error");
            }
        } catch (err) {
            console.error("Erro na pesquisa OSM:", err);
            showToast("Erro ao comunicar com o servidor de pesquisa.", "error");
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

function setupFiltersLogic() {
    const updateMapLayers = () => {
        let activeCount = 0;
        
        UI.filterCheckboxes.forEach(cb => {
            const layerId = cb.value;
            const isChecked = cb.checked;
            
            if (isChecked) {
                AppState.map.addLayer(AppState.layerGroups[layerId]);
                activeCount++;
            } else {
                AppState.map.removeLayer(AppState.layerGroups[layerId]);
            }
        });

        UI.filterBadge.textContent = activeCount;
        if (activeCount === 0) UI.filterBadge.classList.add('hidden');
        else UI.filterBadge.classList.remove('hidden');

        UI.filterAllToggle.checked = (activeCount === UI.filterCheckboxes.length);
    };

    UI.filterCheckboxes.forEach(cb => {
        cb.addEventListener('change', updateMapLayers);
    });

    UI.filterAllToggle.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        UI.filterCheckboxes.forEach(cb => {
            cb.checked = isChecked;
        });
        updateMapLayers();
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

// ==========================================
// MÓDULO DE MAPA E DADOS
// ==========================================

function initMap() {
    AppState.map = L.map('map', { 
        zoomControl: false,
        tap: false
    }).setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);
    
    L.control.zoom({ position: 'bottomleft' }).addTo(AppState.map);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(AppState.map);

    for (let key in AppState.layerGroups) {
        AppState.layerGroups[key].addTo(AppState.map);
    }
}

async function fetchAndPlotData() {
    try {
        // Busca os dados das planilhas de forma robusta
        const [fixosData, portateisData] = await Promise.all([
            fetchCSV(CONFIG.SPREADSHEET_FIXOS, 'fixo'),
            fetchCSV(CONFIG.SPREADSHEET_PORTATEIS, 'portatil')
        ]);

        const allData = [...fixosData, ...portateisData];
        const validPointsCount = processMapMarkers(allData);
        
        if (UI.totalCountSpan) {
            UI.totalCountSpan.textContent = validPointsCount;
        }

        // Força a atualização visual do mapa depois que os dados carregam
        if (AppState.map) {
            AppState.map.invalidateSize();
        }

        setTimeout(removeLoadingScreen, 800);

    } catch (error) {
        console.error("Erro fatal ao carregar dados:", error);
        showToast("Erro de rede ao conectar com as Planilhas", "error");
        removeLoadingScreen();
    }
}

// NOVA FUNÇÃO DE DOWNLOAD: Muito mais robusta, usa o 'fetch' nativo antes de passar para o PapaParse
async function fetchCSV(url, defaultType) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("HTTP error " + response.status);
        
        const csvText = await response.text();

        // Se o Google enviou uma página de erro/login HTML ao invés do CSV
        if (csvText.trim().toLowerCase().startsWith('<!doctype html>') || csvText.includes('<html')) {
            console.warn(`Acesso negado ou redirecionamento na planilha de ${defaultType}s.`);
            return [];
        }

        return new Promise((resolve) => {
            Papa.parse(csvText, {
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                complete: function(results) {
                    const cleanData = results.data.map(row => {
                        const normalized = { tipo_origem: defaultType };
                        for (let key in row) {
                            if (row.hasOwnProperty(key) && key) {
                                // Limpeza pesada de cabeçalhos
                                const cleanKey = String(key).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
                                normalized[cleanKey] = row[key];
                            }
                        }
                        return normalized;
                    });
                    resolve(cleanData);
                },
                error: function(error) {
                    console.error(`Erro PapaParse:`, error);
                    resolve([]);
                }
            });
        });
    } catch (e) {
        console.error(`Erro ao baixar a planilha ${defaultType}:`, e);
        return [];
    }
}

function processMapMarkers(dataArray) {
    for (let key in AppState.layerGroups) {
        AppState.layerGroups[key].clearLayers();
    }

    let plottedCount = 0;
    let missingCoordsCount = 0;

    dataArray.forEach(radar => {
        const latRaw = radar.lat || radar.latitude || radar.y;
        const lngRaw = radar.lng || radar.lon || radar.longitude || radar.x || radar.long;

        const latStr = latRaw !== undefined && latRaw !== null ? String(latRaw).replace(',', '.') : null;
        const lngStr = lngRaw !== undefined && lngRaw !== null ? String(lngRaw).replace(',', '.') : null;
        
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);

        if (isNaN(lat) || isNaN(lng)) {
            missingCoordsCount++;
            return;
        }
        
        plottedCount++;

        const tipo = radar.tipo_origem || 'fixo';
        const isInativo = String(radar.status || '').toLowerCase().includes('inativo');
        const status = isInativo ? 'inativo' : 'ativo';
        const categoryKey = `${tipo}-${status}`;

        const iconClass = tipo === 'fixo' ? 'fa-video' : 'fa-camera';
        const styleClass = `radar-${tipo} ${status}`;

        const customIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div class="radar-marker ${styleClass}"><i class="fa-solid ${iconClass}"></i></div>`,
            iconSize: [38, 38],
            iconAnchor: [19, 19],
            popupAnchor: [0, -19]
        });

        const rodoviaBase = radar.rodovia || 'Via não identificada';
        const km = radar.km !== undefined ? ` - KM ${radar.km}` : '';
        const rodovia = `${rodoviaBase}${km}`;
        
        const localidade = radar.localidade || radar.local || radar.municipio || 'Local não informado';
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
                        <p class="text-[10px] text-secondary uppercase font-bold tracking-wider">${localidade}</p>
                    </div>
                </div>
                
                <div class="space-y-2 mb-3">
                    <div class="flex items-center gap-2 text-sm text-secondary">
                        <div class="w-5 text-center"><i class="fa-solid fa-road text-slate-400"></i></div>
                        <span class="font-medium text-dark truncate">${rodovia}</span>
                    </div>
                    <div class="flex items-center gap-2 text-sm text-secondary">
                        <div class="w-5 text-center"><i class="fa-solid fa-gauge-high text-slate-400"></i></div>
                        <span>Limite: <strong class="text-dark">${limite}</strong></span>
                    </div>
                </div>

                <div class="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold ${statusConfig.bg} ${statusConfig.color}">
                    <i class="fa-solid ${statusConfig.icon}"></i> ${statusConfig.text}
                </div>
            </div>
        `;

        const marker = L.marker([lat, lng], { icon: customIcon })
                        .bindPopup(popupHtml, { closeButton: false, className: 'modern-popup' });
        
        if (AppState.layerGroups[categoryKey]) {
            marker.addTo(AppState.layerGroups[categoryKey]);
        }
    });
    
    if (plottedCount === 0 && missingCoordsCount > 0) {
        setTimeout(() => {
            showToast(`Atenção: Nenhum radar com coordenadas válidas encontrado.`, "error");
        }, 4500);
    }
    
    return plottedCount;
}

function removeLoadingScreen() {
    if (UI.loadingOverlay) {
        UI.loadingOverlay.classList.add('opacity-0');
        setTimeout(() => {
            UI.loadingOverlay.style.display = 'none';
        }, 500);
    }
}

// ==========================================
// INICIALIZAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    if (typeof L === 'undefined' || typeof Papa === 'undefined') {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.innerHTML = `
                <div style="background: #fee2e2; border: 2px solid #ef4444; border-radius: 12px; padding: 24px; text-align: center; max-width: 400px; color: #991b1b; font-family: sans-serif; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);">
                    <h2 style="margin-top: 0; font-size: 1.25rem; font-weight: bold;">Erro Estrutural Detectado</h2>
                    <p style="font-size: 0.875rem; margin-bottom: 16px;">O navegador não conseguiu carregar as bibliotecas do mapa.</p>
                </div>
            `;
            const loaderDiv = overlay.querySelector('.loader');
            if (loaderDiv) loaderDiv.style.display = 'none';
        }
        return;
    }

    initUI();
    initMap();
    fetchAndPlotData();
});
