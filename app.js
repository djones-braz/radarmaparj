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
    destinationLocation: null,
    destinationMarker: null,
    routeLine: null
};

document.addEventListener('DOMContentLoaded', () => {
    if (typeof L === 'undefined' || typeof Papa === 'undefined') {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.innerHTML = `<div style="background:#fee2e2; padding:24px; text-align:center;"><h2>Erro de Carregamento</h2></div>`;
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
    if(UI.btnMenu) UI.btnMenu.addEventListener('click', toggleFiltersPanel);
    
    UI.btnCenterMap.addEventListener('click', () => {
        showToast("A localizar o seu GPS...", "info");
        getUserLocation((location) => {
            if (location) {
                AppState.map.setView(location, 15, { animate: true });
                if (AppState.destinationLocation) drawRoute(location, AppState.destinationLocation);
            }
        });
    });

    UI.filterCity.addEventListener('change', handleCityChange);
    UI.filterHighway.addEventListener('change', applyLocationFilters);

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
        updateMapVisibility();
        showToast("Rota removida.", "info");
    });

    UI.searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        let query = UI.searchInput.value.trim();
        if (!query) return;

        showToast("A procurar destino...", "info");
        try {
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=br&limit=1`;
            const response = await fetch(url);
            const data = await response.json();

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

function getUserLocation(callback) {
    if (!navigator.geolocation) {
        showToast("GPS não suportado.", "error");
        if (callback) callback(null);
        return;
    }
    navigator.geolocation.getCurrentPosition(position => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        AppState.userLocation = [lat, lon];
        if (AppState.userMarker) AppState.map.removeLayer(AppState.userMarker);
        AppState.userMarker = L.circleMarker([lat, lon], { radius: 8, fillColor: "#3b82f6", color: "#ffffff", weight: 3 }).addTo(AppState.map).bindPopup("Você está aqui");
        if (callback) callback([lat, lon]);
    }, () => showToast("Permissão de GPS negada.", "error"), { enableHighAccuracy: true });
}

function setDestination(lat, lon, title) {
    AppState.destinationLocation = [lat, lon];
    if (AppState.destinationMarker) AppState.map.removeLayer(AppState.destinationMarker);
    AppState.destinationMarker = L.marker([lat, lon]).addTo(AppState.map).bindPopup(title).openPopup();

    if (AppState.userLocation) {
        drawRoute(AppState.userLocation, AppState.destinationLocation);
    } else {
        getUserLocation((loc) => {
            if (loc) drawRoute(loc, AppState.destinationLocation);
            else AppState.map.setView([lat, lon], 15);
        });
    }
}

async function drawRoute(start, end) {
    showToast("A calcular rota...", "info");
    const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.routes && data.routes.length > 0) {
            const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
            if (AppState.routeLine) AppState.map.removeLayer(AppState.routeLine);
            AppState.routeLine = L.polyline(coords, { color: '#3b82f6', weight: 6, dashArray: '10, 10' }).addTo(AppState.map);
            AppState.map.fitBounds(AppState.routeLine.getBounds(), { padding: [50, 50] });
            highlightRadarsOnRoute(coords);
            showToast("Rota traçada e radares filtrados!", "success");
        }
    } catch (err) {
        showToast("Erro ao traçar rota.", "error");
    }
}

function highlightRadarsOnRoute(routeCoords) {
    const BUFFER_METERS = 500;
    // Oculta tudo para aplicar filtro da rota
    UI.filterAllToggle.checked = false;
    UI.filterCheckboxes.forEach(cb => cb.checked = false);
    
    AppState.markersData.forEach(radar => {
        const radarLatLng = radar.marker.getLatLng();
        let isClose = false;
        for (let i = 0; i < routeCoords.length; i += 5) {
            if (AppState.map.distance(radarLatLng, routeCoords[i]) < BUFFER_METERS) {
                isClose = true;
                break;
            }
        }
        if (isClose) {
            radar.marker.addTo(AppState.map);
        } else {
            AppState.map.removeLayer(radar.marker);
        }
    });
}

function clearRoute() {
    if (AppState.routeLine) AppState.map.removeLayer(AppState.routeLine);
    if (AppState.destinationMarker) AppState.map.removeLayer(AppState.destinationMarker);
    AppState.routeLine = null;
    AppState.destinationMarker = null;
    AppState.destinationLocation = null;
    updateMapVisibility();
}

function toggleFiltersPanel() {
    AppState.isPanelOpen = !AppState.isPanelOpen;
    UI.filtersPanel.classList.toggle('translate-y-full', !AppState.isPanelOpen);
    UI.filtersPanel.classList.toggle('md:translate-x-full', !AppState.isPanelOpen);
}

function populateSelect(selectElement, optionsArray, defaultText) {
    selectElement.innerHTML = `<option value="all">${defaultText}</option>`;
    optionsArray.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        selectElement.appendChild(option);
    });
}

function handleCityChange() {
    const selectedCity = UI.filterCity.value;
    const highwaysSet = new Set();
    AppState.markersData.forEach(data => {
        if (selectedCity === 'all' || data.city === selectedCity) {
            if (data.highway !== 'NÃO IDENTIFICADA') highwaysSet.add(data.highway);
        }
    });
    populateSelect(UI.filterHighway, Array.from(highwaysSet).sort(), "Todas as Rodovias");
    applyLocationFilters();
}

function applyLocationFilters() {
    AppState.markersData.forEach(data => {
        const matchCity = UI.filterCity.value === 'all' || data.city === UI.filterCity.value;
        const matchHighway = UI.filterHighway.value === 'all' || data.highway === UI.filterHighway.value;
        if (matchCity && matchHighway) data.marker.addTo(AppState.map);
        else AppState.map.removeLayer(data.marker);
    });
}

function updateMapVisibility() {
    let activeCategories = 0;
    UI.filterCheckboxes.forEach(cb => {
        const isChecked = cb.checked;
        if (isChecked) {
            AppState.layerGroups[cb.value].addTo(AppState.map);
            activeCategories++;
        } else {
            AppState.map.removeLayer(AppState.layerGroups[cb.value]);
        }
    });
    UI.filterBadge.textContent = activeCategories;
    UI.filterBadge.classList.toggle('hidden', activeCategories === 0);
}

function setupFiltersLogic() {
    UI.filterCheckboxes.forEach(cb => cb.addEventListener('change', updateMapVisibility));
    UI.filterAllToggle.addEventListener('change', (e) => {
        UI.filterCheckboxes.forEach(cb => cb.checked = e.target.checked);
        updateMapVisibility();
    });
}

function showToast(message, type = 'info') {
    UI.toastMsg.textContent = message;
    UI.toast.classList.replace('opacity-0', 'opacity-100');
    clearTimeout(AppState.toastTimeout);
    AppState.toastTimeout = setTimeout(() => UI.toast.classList.replace('opacity-100', 'opacity-0'), 3000);
}

function initMap() {
    AppState.map = L.map('map', { zoomControl: false }).setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);
    L.control.zoom({ position: 'bottomleft' }).addTo(AppState.map);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(AppState.map);
    AppState.map.on('contextmenu', (e) => setDestination(e.latlng.lat, e.latlng.lng, "Ponto Marcado"));
}

async function fetchAndPlotData() {
    try {
        const [fixos, portateis] = await Promise.all([fetchCSV(CONFIG.SPREADSHEET_FIXOS, 'fixo'), fetchCSV(CONFIG.SPREADSHEET_PORTATEIS, 'portatil')]);
        processMapMarkers([...fixos, ...portateis]);
        removeLoadingScreen();
    } catch (e) { showToast("Erro ao carregar dados.", "error"); }
}

function fetchCSV(url, defaultType) {
    return new Promise(resolve => {
        Papa.parse(url, { download: true, header: true, complete: (res) => resolve(res.data.map(r => ({...r, tipo_origem: defaultType}))) });
    });
}

function processMapMarkers(dataArray) {
    const citiesSet = new Set(), highwaysSet = new Set();
    dataArray.forEach(radar => {
        const lat = parseFloat(String(radar.lat || 0).replace(',', '.')), lng = parseFloat(String(radar.lng || 0).replace(',', '.'));
        if (isNaN(lat) || isNaN(lng)) return;
        
        const tipo = radar.tipo_origem, status = String(radar.status || '').toLowerCase().includes('inativo') ? 'inativo' : 'ativo';
        const marker = L.marker([lat, lng]).addTo(AppState.layerGroups[`${tipo}-${status}`]);
        
        AppState.markersData.push({ marker, city: String(radar.municipio || '').toUpperCase(), highway: String(radar.rodovia || 'NÃO IDENTIFICADA').toUpperCase() });
        citiesSet.add(String(radar.municipio || '').toUpperCase());
    });
    populateSelect(UI.filterCity, Array.from(citiesSet).filter(Boolean).sort(), "Todas as Cidades");
}

function removeLoadingScreen() {
    UI.loadingOverlay.classList.add('opacity-0');
    setTimeout(() => UI.loadingOverlay.style.display = 'none', 500);
}
