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
    // URLs vitais corrigidas: terminar com /export?format=csv para descarregar os dados diretamente
    SPREADSHEET_FIXOS: "https://docs.google.com/spreadsheets/d/1KgpLldzIPdEsEN1K2ox7oVo4SBegZ3RsdIRbCq4_Jb0/export?format=csv",
    SPREADSHEET_PORTATEIS: "https://docs.google.com/spreadsheets/d/1UEMPYtUwSplcpWkNyNO0F4ETBiPjzLxsFgbXqsxTRzE/export?format=csv",
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
    // Alternar o painel
    UI.btnToggleFilters.addEventListener('click', toggleFiltersPanel);
    UI.btnCloseFilters.addEventListener('click', toggleFiltersPanel);
    
    // Ações do Mapa
    UI.btnCenterMap.addEventListener('click', () => {
        if (AppState.map) {
            AppState.map.setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM, { animate: true, duration: 1 });
        }
    });

    // Lógica de pesquisa usando a API Nominatim do OpenStreetMap
    UI.searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        let query = UI.searchInput.value.trim();
        if (!query) return;

        showToast("A pesquisar local...", "info");
        
        try {
            // Sistema de pesquisa aprimorado com Fallback (dupla tentativa)
            // Tentativa 1: Pesquisa inicial com foco no viewbox do RJ
            let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=br&viewbox=-45.0,-20.0,-40.0,-24.0&bounded=0&limit=1`;
            let response = await fetch(url);
            let data = await response.json();

            // Tentativa 2: Se falhar, pesquisa mais flexível sem os limites estritos do viewbox
            if (!data || data.length === 0) {
                url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Rio de Janeiro')}&countrycodes=br&limit=1`;
                response = await fetch(url);
                data = await response.json();
            }

            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);
                // Ajusta o zoom dependendo do tipo de resultado (endereço vs cidade)
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

    // Lógica de configuração dos filtros
    setupFiltersLogic();
}

function toggleFiltersPanel() {
    AppState.isPanelOpen = !AppState.isPanelOpen;
    if (AppState.isPanelOpen) {
        // Abre painel
        if (window.innerWidth < 768) {
            UI.filtersPanel.classList.remove('translate-y-full');
        } else {
            UI.filtersPanel.classList.remove('translate-x-full');
        }
    } else {
        // Fecha painel
        if (window.innerWidth < 768) {
            UI.filtersPanel.classList.add('translate-y-full');
        } else {
            UI.filtersPanel.classList.add('translate-x-full');
        }
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

        // Atualizar o emblema (badge) visual
        UI.filterBadge.textContent = activeCount;
        if (activeCount === 0) UI.filterBadge.classList.add('hidden');
        else UI.filterBadge.classList.remove('hidden');

        // Atualizar o botão "Mostrar todos" para sincronizar com os individuais
        UI.filterAllToggle.checked = (activeCount === UI.filterCheckboxes.length);
    };

    // Ouvintes das Checkboxes
    UI.filterCheckboxes.forEach(cb => {
        cb.addEventListener('change', updateMapLayers);
    });

    // Ouvinte do Master Toggle
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
    
    // Configuração do ícone
    UI.toastIcon.className = ''; 
    if (type === 'success') UI.toastIcon.className = 'fa-solid fa-circle-check text-success';
    else if (type === 'error') UI.toastIcon.className = 'fa-solid fa-triangle-exclamation text-danger';
    else UI.toastIcon.className = 'fa-solid fa-circle-info text-primary';

    // Mostrar
    UI.toast.classList.remove('opacity-0');
    UI.toast.classList.add('opacity-100');

    // Esconder após 3s
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
    // Evitar que o mapa capture eventos de scroll ao interagir com o painel
    AppState.map = L.map('map', { 
        zoomControl: false,
        tap: false // Previne eventos de clique duplicados em navegadores móveis
    }).setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);
    
    // Adicionar controlo de Zoom numa posição melhor
    L.control.zoom({ position: 'bottomleft' }).addTo(AppState.map);

    // Definir Camada de Mosaicos (Tiles Gratuitos Oficiais do OpenStreetMap)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(AppState.map);

    // Adicionar os nossos LayerGroups vazios ao mapa inicialmente
    for (let key in AppState.layerGroups) {
        AppState.layerGroups[key].addTo(AppState.map);
    }
}

async function fetchAndPlotData() {
    try {
        // Executar ambas as requisições em paralelo
        const [fixosData, portateisData] = await Promise.all([
            fetchCSV(CONFIG.SPREADSHEET_FIXOS, 'fixo'),
            fetchCSV(CONFIG.SPREADSHEET_PORTATEIS, 'portatil')
        ]);

        // Combinar dados das duas planilhas
        const allData = [...fixosData, ...portateisData];
        
        // Processar e colocar no mapa
        const validPointsCount = processMapMarkers(allData);
        
        // Atualizar Interface
        UI.totalCountSpan.textContent = validPointsCount;

        setTimeout(removeLoadingScreen, 800);

    } catch (error) {
        console.error("Erro fatal ao carregar dados:", error);
        showToast("Erro ao ligar ao Google Sheets", "error");
        removeLoadingScreen();
    }
}

function fetchCSV(url, defaultType) {
    return new Promise((resolve, reject) => {
        Papa.parse(url, {
            download: true,
            header: true,
            dynamicTyping: true, // Auto converter números
            skipEmptyLines: true,
            complete: function(results) {
                // Verificar se o Google retornou uma página HTML de login em vez de CSV (Erro de planilha privada)
                if (results.data.length > 0 && typeof results.data[0] === 'string' && results.data[0].includes('<!DOCTYPE html>')) {
                    console.warn(`Acesso negado à planilha de ${defaultType}s.`);
                    resolve([]); // Retorna array vazio para não quebrar a Promise.all
                    return;
                }
                
                // Normaliza as chaves (colunas) para evitar erros de digitação na planilha
                const cleanData = results.data.map(row => {
                    const normalized = { tipo_origem: defaultType };
                    for (let key in row) {
                        if (row.hasOwnProperty(key) && key) {
                            // Limpa a chave: minúscula, sem acentos, sem espaços nas bordas
                            const cleanKey = String(key).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
                            normalized[cleanKey] = row[key];
                        }
                    }
                    return normalized;
                });
                resolve(cleanData);
            },
            error: function(error) {
                console.error(`Erro PapaParse em ${defaultType}:`, error);
                resolve([]); // Falhar graciosamente
            }
        });
    });
}

function processMapMarkers(dataArray) {
    // Limpar marcadores existentes se estiver a recarregar
    for (let key in AppState.layerGroups) {
        AppState.layerGroups[key].clearLayers();
    }

    let plottedCount = 0;
    let missingCoordsCount = 0;

    dataArray.forEach(radar => {
        // Procura flexível pelas colunas de coordenadas (aceita lat, latitude, y, etc)
        const latRaw = radar.lat || radar.latitude || radar.y;
        const lngRaw = radar.lng || radar.lon || radar.longitude || radar.x || radar.long;

        // Analisar coordenadas com segurança (lidando com decimais em vírgula ou ponto)
        const latStr = latRaw !== undefined && latRaw !== null ? String(latRaw).replace(',', '.') : null;
        const lngStr = lngRaw !== undefined && lngRaw !== null ? String(lngRaw).replace(',', '.') : null;
        
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);

        if (isNaN(lat) || isNaN(lng)) {
            missingCoordsCount++;
            return; // Ignorar linhas inválidas (coordenadas ausentes)
        }
        
        plottedCount++;

        // Determinar classificação baseada nos dados
        const tipo = radar.tipo_origem || 'fixo'; // Vem do defaultType no fetchCSV
        
        // Status vem da coluna STATUS ("Radar Inativo", "Radar Ativo", etc)
        const isInativo = String(radar.status || '').toLowerCase().includes('inativo');
        const status = isInativo ? 'inativo' : 'ativo';
        
        const categoryKey = `${tipo}-${status}`;

        // Parâmetros de Design
        const iconClass = tipo === 'fixo' ? 'fa-video' : 'fa-camera';
        const styleClass = `radar-${tipo} ${status}`;

        const customIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div class="radar-marker ${styleClass}"><i class="fa-solid ${iconClass}"></i></div>`,
            iconSize: [38, 38],
            iconAnchor: [19, 19],
            popupAnchor: [0, -19]
        });

        // Construção do Conteúdo do Popup
        const rodoviaBase = radar.rodovia || 'Via não identificada';
        const km = radar.km !== undefined ? ` - KM ${radar.km}` : '';
        const rodovia = `${rodoviaBase}${km}`;
        
        const localidade = radar.localidade || radar.local || radar.municipio || 'Local não informado';
        const limite = radar.velocidadedefiscalizacao || radar.limite || '--';
        
        const tipoText = tipo === 'fixo' ? 'Radar Fixo' : 'Radar Portátil';
        
        const statusConfig = status === 'ativo' 
            ? { color: 'text-success', bg: 'bg-success/10', icon: 'fa-check-circle', text: 'A operar' }
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

        // Adicionar ao Leaflet
        const marker = L.marker([lat, lng], { icon: customIcon })
                        .bindPopup(popupHtml, { closeButton: false, className: 'modern-popup' });
        
        if (AppState.layerGroups[categoryKey]) {
            marker.addTo(AppState.layerGroups[categoryKey]);
        }
    });
    
    // Aviso caso a folha não tenha coordenadas
    if (plottedCount === 0 && missingCoordsCount > 0) {
        setTimeout(() => {
            showToast(`Atenção: Faltam as colunas LAT e LNG na folha!`, "error");
        }, 4500);
    }
    
    return plottedCount;
}

function removeLoadingScreen() {
    UI.loadingOverlay.classList.add('opacity-0');
    setTimeout(() => {
        UI.loadingOverlay.style.display = 'none';
    }, 500);
}

// ==========================================
// INICIALIZAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initUI();
    initMap();
    fetchAndPlotData();
});
