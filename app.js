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

    

    // ESTADOS PARA O SISTEMA DE ROTAS

    userLocation: null,

    userMarker: null,

    destinationLocation: null,

    destinationMarker: null,

    routeLine: null

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

    

    if(UI.btnMenu) {

        UI.btnMenu.addEventListener('click', toggleFiltersPanel);

    }

    

    // Botão de Centrar Mapa (Apenas foca na pessoa ou pede permissão pela 1ª vez)

    UI.btnCenterMap.addEventListener('click', () => {

        showToast("A localizar o seu GPS...", "info");

        getUserLocation((location) => {

            if (location) {

                AppState.map.setView(location, 15, { animate: true });

                if (AppState.destinationLocation) {

                    drawRoute(location, AppState.destinationLocation);

                }

            }

        });

    });

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



            // CHAMADA DA NOVA LÓGICA DE FILTRAGEM DE RADARES

            highlightRadarsOnRoute(coords);



            const distanceKm = (data.routes[0].distance / 1000).toFixed(1);

            const durationMin = Math.round(data.routes[0].duration / 60);



            showToast(`Rota traçada: ${distanceKm} km. Radares na rota destacados!`, "success");

        }

    } catch (err) {

        showToast("Erro ao conectar com servidor de rotas.", "error");

    }

}

// NOVA FUNÇÃO: Filtra radares próximos aos pontos da rota (Buffer de ~500m)

function highlightRadarsOnRoute(routeCoords) {

    const BUFFER_METERS = 500;

    const radaresNaRota = [];



    // Limpa filtros anteriores para mostrar apenas a rota

    UI.filterAllToggle.checked = false;

    UI.filterCheckboxes.forEach(cb => cb.checked = false);

    updateMapVisibility();



    AppState.markersData.forEach(radar => {

        const radarLatLng = radar.marker.getLatLng();

        let isClose = false;



        // Verifica proximidade em relação a cada ponto da linha da rota

        for (let i = 0; i < routeCoords.length; i += 5) { // Pula pontos para performance

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

    UI.filterCity.addEventListener('change', handleCityChange);

    UI.filterHighway.addEventListener('change', applyLocationFilters);



    // Botão dinâmico para limpar a rota na barra de pesquisa

    const clearBtn = document.createElement('button');

    clearBtn.type = 'button';

    clearBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';

    clearBtn.className = 'text-slate-400 hover:text-danger px-2 hidden transition-colors';

    UI.searchInput.parentNode.insertBefore(clearBtn, UI.searchForm.querySelector('button[type="submit"]'));



    UI.searchInput.addEventListener('input', () => {

        if(UI.searchInput.value.trim().length > 0) clearBtn.classList.remove('hidden');

        else clearBtn.classList.add('hidden');

    });



    clearBtn.addEventListener('click', () => {

        clearRoute();

        clearBtn.classList.add('hidden');

        showToast("Rota removida do mapa.", "info");

        if (AppState.userLocation) AppState.map.setView(AppState.userLocation, 14);

        else AppState.map.setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);

    });



    // Pesquisa agora traça destino E chama o GPS automaticamente!

    UI.searchForm.addEventListener('submit', async (e) => {

        e.preventDefault();

        let query = UI.searchInput.value.trim();

        if (!query) return;



        showToast("A procurar destino...", "info");

        

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

                setDestination(parseFloat(data[0].lat), parseFloat(data[0].lon), data[0].display_name);

            } else {

                showToast("Endereço não encontrado.", "error");

            }

        } catch (err) {

            showToast("Erro ao comunicar com o servidor.", "error");

        }

    });



    setupFiltersLogic();

}



// ==========================================

// FUNÇÕES DE GEOLOCALIZAÇÃO E ROTAS

// ==========================================



// NOVA FUNÇÃO: Obtém a localização do usuário com tratamento inteligente de erros

function getUserLocation(callback) {

    if (!navigator.geolocation) {

        showToast("O seu navegador não suporta GPS.", "error");

        if (callback) callback(null);

        return;

    }



    navigator.geolocation.getCurrentPosition(position => {

        const lat = position.coords.latitude;

        const lon = position.coords.longitude;

        AppState.userLocation = [lat, lon];



        if (AppState.userMarker) AppState.map.removeLayer(AppState.userMarker);



        AppState.userMarker = L.circleMarker([lat, lon], {

            radius: 8, fillColor: "#3b82f6", color: "#ffffff", weight: 3, opacity: 1, fillOpacity: 1

        }).addTo(AppState.map).bindPopup("<b>Você está aqui</b>");



        showToast("Localização encontrada!", "success");

        if (callback) callback([lat, lon]);



    }, error => {

        console.error(error);

        if (error.code === 1) { // PERMISSION_DENIED

            showToast("Permissão de GPS negada. Por favor, permita o acesso no seu navegador/celular.", "error");

        } else if (error.code === 2) { // POSITION_UNAVAILABLE

            showToast("Sinal de GPS indisponível no momento.", "error");

        } else { // TIMEOUT ou outros

            showToast("Tempo esgotado ao buscar GPS.", "error");

        }

        if (callback) callback(null);

    }, { enableHighAccuracy: true, timeout: 10000 });

}



function setDestination(lat, lon, title) {

    AppState.destinationLocation = [lat, lon];



    if (AppState.destinationMarker) AppState.map.removeLayer(AppState.destinationMarker);

    

    AppState.destinationMarker = L.marker([lat, lon], {

        icon: L.divIcon({

            className: 'custom-div-icon',

            html: `<div class="w-8 h-8 bg-dark rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white"><i class="fa-solid fa-flag-checkered"></i></div>`,

            iconSize: [32, 32],

            iconAnchor: [16, 32],

            popupAnchor: [0, -16]

        })

    }).addTo(AppState.map).bindPopup(`<div class="text-sm"><b>🏁 Destino:</b><br>${title}</div>`).openPopup();



    if (AppState.userLocation) {

        // Se já sabemos onde ele está, traça a rota

        drawRoute(AppState.userLocation, AppState.destinationLocation);

    } else {

        // AUTOMAÇÃO: Se não sabemos onde está, pede o GPS na hora!

        showToast("Destino definido! Solicitando seu GPS para traçar a rota...", "info");

        getUserLocation((location) => {

            if (location) {

                drawRoute(location, AppState.destinationLocation);

            } else {

                AppState.map.setView([lat, lon], 15, { animate: true, duration: 1 });

            }

        });

    }

}



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



            const distanceKm = (data.routes[0].distance / 1000).toFixed(1);

            const durationMin = Math.round(data.routes[0].duration / 60);



            showToast(`Rota traçada: ${distanceKm} km (~${durationMin} min)`, "success");

        } else {

            showToast("Não foi possível traçar uma rota de carro para este destino.", "warning");

        }

    } catch (err) {

        console.error(err);

        showToast("Erro ao conectar com servidor de rotas OSRM.", "error");

    }

}



function clearRoute() {

    if (AppState.routeLine) {

        AppState.map.removeLayer(AppState.routeLine);

        AppState.routeLine = null;

    }

    if (AppState.destinationMarker) {

        AppState.map.removeLayer(AppState.destinationMarker);

        AppState.destinationMarker = null;

    }

    AppState.destinationLocation = null;

    UI.searchInput.value = '';

}



// ==========================================

// FUNÇÕES DE INTERFACE (FILTROS E UI)

// ==========================================



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



function handleCityChange() {

    const selectedCity = UI.filterCity.value;

    const currentHighway = UI.filterHighway.value;

    

    const highwaysSet = new Set();

    

    AppState.markersData.forEach(data => {

        if (selectedCity === 'all' || data.city === selectedCity) {

            if (data.highway && data.highway !== 'NÃO IDENTIFICADA') {

                highwaysSet.add(data.highway);

            }

        }

    });

    

    populateSelect(UI.filterHighway, Array.from(highwaysSet).sort(), "Todas as Rodovias");

    

    if (currentHighway !== 'all' && highwaysSet.has(currentHighway)) {

        UI.filterHighway.value = currentHighway;

    } else {

        UI.filterHighway.value = 'all';

    }

    

    applyLocationFilters();

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



// ==========================================

// MÓDULO DE MAPA E DADOS BASE

// ==========================================



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



    // Context Menu (Clique com o botão direito) para definir Destino rápido

    AppState.map.on('contextmenu', (e) => {

        setDestination(e.latlng.lat, e.latlng.lng, "Local marcado no mapa");

    });



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
