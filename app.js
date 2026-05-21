/* RadarMapa RJ — Etapa 3.1
 * Nesta etapa extra: modo Iniciar Rota com acompanhamento por GPS,
 * centralização automática e alertas de proximidade de radares.
 */

const CONFIG = {
  SPREADSHEET_RADARES:
    'https://docs.google.com/spreadsheets/d/14ilHut0E_9GuvmPBRIHmFcnKtmymUZAAMWoER871W-4/export?format=csv&gid=665119197',

  MAP_CENTER: [-22.9068, -43.1729],
  MAP_ZOOM: 8,
  MAX_ZOOM: 19,
  RJ_BOUNDS: [
    [-23.40, -44.90],
    [-20.70, -40.70],
  ],

  NOMINATIM_URL: 'https://nominatim.openstreetmap.org/search',
  OSRM_ROUTE_URL: 'https://router.project-osrm.org/route/v1/driving',
};

const AppState = {
  map: null,
  radarLayer: null,
  routeRadarLayer: null,
  allRadars: [],
  visibleRadars: [],
  routeRadars: [],
  markersById: new Map(),
  toastTimer: null,
  isPanelOpen: false,

  userLocation: null,
  userMarker: null,
  destinationLocation: null,
  destinationMarker: null,
  routeLine: null,
  routeCoordinates: [],
  lastRouteMeta: null,

  geocodeCache: new Map(),

  navigationWatchId: null,
  isNavigating: false,
  alertedRadarIds: new Set(),
  audioContext: null,
  wakeLock: null,
  lastUserPositionAt: null,
};

const UI = {};

document.addEventListener('DOMContentLoaded', () => {
  cacheElements();

  if (!window.L || !window.Papa) {
    showFatalError('Bibliotecas necessárias não foram carregadas. Verifique Leaflet e PapaParse.');
    return;
  }

  initMap();
  bindUIEvents();
  loadRadarData();
});

function cacheElements() {
  UI.loadingOverlay = document.getElementById('loadingOverlay');

  UI.filterPanel = document.getElementById('filterPanel');
  UI.btnOpenPanel = document.getElementById('btnOpenPanel');
  UI.btnTogglePanel = document.getElementById('btnTogglePanel');
  UI.btnClosePanel = document.getElementById('btnClosePanel');
  UI.btnFitVisible = document.getElementById('btnFitVisible');
  UI.btnLocateUser = document.getElementById('btnLocateUser');

  UI.routeSearchForm = document.getElementById('routeSearchForm');
  UI.destinationInput = document.getElementById('destinationInput');
  UI.btnClearRouteSearch = document.getElementById('btnClearRouteSearch');
  UI.btnClearRoute = document.getElementById('btnClearRoute');
  UI.btnStartNavigation = document.getElementById('btnStartNavigation');
  UI.btnStopNavigation = document.getElementById('btnStopNavigation');

  UI.routeSummary = document.getElementById('routeSummary');
  UI.routeTitle = document.getElementById('routeTitle');
  UI.routeDistance = document.getElementById('routeDistance');
  UI.routeDuration = document.getElementById('routeDuration');
  UI.routeRadarCount = document.getElementById('routeRadarCount');
  UI.routeActiveCount = document.getElementById('routeActiveCount');
  UI.routeInactiveCount = document.getElementById('routeInactiveCount');
  UI.routeFixedCount = document.getElementById('routeFixedCount');
  UI.routePortableCount = document.getElementById('routePortableCount');
  UI.routeBufferLabel = document.getElementById('routeBufferLabel');
  UI.routeRadarList = document.getElementById('routeRadarList');
  UI.btnShowRouteRadars = document.getElementById('btnShowRouteRadars');
  UI.navigationStatus = document.getElementById('navigationStatus');
  UI.navigationStatusTitle = document.getElementById('navigationStatusTitle');
  UI.navigationStatusText = document.getElementById('navigationStatusText');

  UI.filterStatuses = Array.from(document.querySelectorAll('.filter-status'));
  UI.filterTypes = Array.from(document.querySelectorAll('.filter-type'));
  UI.filterCity = document.getElementById('filterCity');
  UI.filterHighway = document.getElementById('filterHighway');
  UI.filterInspection = document.getElementById('filterInspection');
  UI.filterOnlyRoute = document.getElementById('filterOnlyRoute');
  UI.routeBuffer = document.getElementById('routeBuffer');
  UI.alertDistance = document.getElementById('alertDistance');
  UI.btnFocusRoute = document.getElementById('btnFocusRoute');
  UI.btnSelectAll = document.getElementById('btnSelectAll');

  UI.filterBadge = document.getElementById('filterBadge');
  UI.visibleCount = document.getElementById('visibleCount');
  UI.totalCount = document.getElementById('totalCount');

  UI.statActive = document.getElementById('statActive');
  UI.statInactive = document.getElementById('statInactive');
  UI.statFixed = document.getElementById('statFixed');
  UI.statPortable = document.getElementById('statPortable');

  UI.toast = document.getElementById('toast');
  UI.toastIcon = document.getElementById('toastIcon');
  UI.toastMessage = document.getElementById('toastMessage');
}

function initMap() {
  AppState.map = L.map('map', {
    zoomControl: false,
    preferCanvas: true,
  }).setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);

  L.control.zoom({ position: 'bottomleft' }).addTo(AppState.map);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: CONFIG.MAX_ZOOM,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(AppState.map);

  AppState.radarLayer = L.layerGroup().addTo(AppState.map);
  AppState.routeRadarLayer = L.layerGroup().addTo(AppState.map);

  AppState.map.on('contextmenu', (event) => {
    setDestination(event.latlng.lat, event.latlng.lng, 'Local marcado no mapa');
  });
}

function bindUIEvents() {
  UI.btnOpenPanel.addEventListener('click', openPanel);
  UI.btnTogglePanel.addEventListener('click', togglePanel);
  UI.btnClosePanel.addEventListener('click', closePanel);
  UI.btnFitVisible.addEventListener('click', fitVisibleRadars);
  UI.btnLocateUser.addEventListener('click', () => locateUser({ center: true }));

  UI.routeSearchForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = UI.destinationInput.value.trim();

    if (!query) {
      showToast('Digite um destino para calcular a rota.', 'warning');
      return;
    }

    await searchDestinationAndRoute(query);
  });

  UI.destinationInput.addEventListener('input', () => {
    UI.btnClearRouteSearch.classList.toggle('is-visible', UI.destinationInput.value.trim().length > 0);
  });

  UI.btnClearRouteSearch.addEventListener('click', () => {
    clearRoute();
    UI.destinationInput.value = '';
    UI.btnClearRouteSearch.classList.remove('is-visible');
    UI.destinationInput.focus();
  });

  UI.btnClearRoute.addEventListener('click', clearRoute);
  UI.btnStartNavigation.addEventListener('click', startNavigation);
  UI.btnStopNavigation.addEventListener('click', () => stopNavigation(true));
  UI.btnShowRouteRadars.addEventListener('click', () => {
    if (!AppState.routeCoordinates.length) return;
    UI.filterOnlyRoute.checked = true;
    applyFilters({ fitBounds: true });
    openPanel();
  });

  UI.btnFocusRoute.addEventListener('click', () => {
    fitRouteAndRadars();
  });

  UI.routeRadarList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-radar-id]');
    if (!button) return;
    focusRadar(button.dataset.radarId);
  });

  [...UI.filterStatuses, ...UI.filterTypes].forEach((checkbox) => {
    checkbox.addEventListener('change', applyFilters);
  });

  UI.filterCity.addEventListener('change', () => {
    refreshDependentHighways();
    applyFilters();
  });

  UI.filterHighway.addEventListener('change', applyFilters);
  UI.filterInspection.addEventListener('change', applyFilters);
  UI.filterOnlyRoute.addEventListener('change', () => applyFilters({ fitBounds: true }));

  UI.routeBuffer.addEventListener('change', () => {
    if (!AppState.routeCoordinates.length) return;
    updateRouteRadars();
    AppState.alertedRadarIds.clear();
    applyFilters({ fitBounds: false });
    updateRouteSummary();
    renderRouteRadarList();
    if (AppState.isNavigating && AppState.userLocation) {
      checkRadarProximity(AppState.userLocation);
    }
  });

  UI.alertDistance.addEventListener('change', () => {
    AppState.alertedRadarIds.clear();
    if (AppState.isNavigating && AppState.userLocation) {
      checkRadarProximity(AppState.userLocation);
    }
  });

  UI.btnSelectAll.addEventListener('click', () => {
    UI.filterStatuses.forEach((checkbox) => (checkbox.checked = true));
    UI.filterTypes.forEach((checkbox) => (checkbox.checked = true));
    UI.filterCity.value = 'all';
    UI.filterHighway.value = 'all';
    UI.filterInspection.value = 'all';
    UI.filterOnlyRoute.checked = false;
    refreshDependentHighways();
    applyFilters();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePanel();
  });

  window.addEventListener('resize', debounce(() => {
    if (AppState.map) AppState.map.invalidateSize();
  }, 120));
}

async function loadRadarData() {
  showLoading(true);

  try {
    const rows = await fetchCSV(CONFIG.SPREADSHEET_RADARES);
    const radars = normalizeRadarRows(rows);

    AppState.allRadars = radars;

    buildMarkers(radars);
    populateFilterOptions(radars);
    updateStats(radars);
    applyFilters({ fitBounds: true });

    showToast(`Base carregada: ${radars.length} radares encontrados.`, 'success');
  } catch (error) {
    console.error(error);
    showToast('Não foi possível carregar a planilha de radares.', 'error');
  } finally {
    showLoading(false);
  }
}

function fetchCSV(url) {
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors && results.errors.length > 0) {
          console.warn('Avisos do PapaParse:', results.errors);
        }
        resolve(results.data || []);
      },
      error: (error) => reject(error),
    });
  });
}

function normalizeRadarRows(rows) {
  return rows
    .map(normalizeRowKeys)
    .map(mapRadarRecord)
    .filter(Boolean);
}

function normalizeRowKeys(row) {
  const output = {};

  Object.entries(row).forEach(([key, value]) => {
    const cleanKey = normalizeKey(key);
    if (!cleanKey) return;
    output[cleanKey] = typeof value === 'string' ? value.trim() : value;
  });

  return output;
}

function mapRadarRecord(row, index) {
  const displayFlag = normalizeText(row.exibir_app || 'sim');
  if (displayFlag && ['nao', 'não', 'false', '0', 'n'].includes(displayFlag)) return null;

  const latitude = parseCoordinate(row.latitude || row.lat || row.y);
  const longitude = parseCoordinate(row.longitude || row.lng || row.lon || row.long || row.x);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (!isCoordinateInsideRJ(latitude, longitude)) {
    console.warn('Coordenada fora do intervalo esperado para RJ:', row.id, latitude, longitude);
  }

  const status = normalizeStatus(row.status);
  const tipoRadar = normalizeRadarType(row.tipo_radar || row.tipo || row.tipo_origem);
  const category = `${tipoRadar}-${status}`;

  const id = sanitizeId(row.id || `${tipoRadar}-${row.rodovia || 'sem-rodovia'}-${row.km || index}`);
  const municipio = cleanDisplay(row.municipio || 'Não informado');
  const localidade = cleanDisplay(row.localidade || municipio || 'Não informado');
  const rodovia = cleanDisplay(row.rodovia || 'Não identificada').toUpperCase();
  const km = cleanDisplay(row.km || '');
  const tipoEquipamento = cleanDisplay(row.tipo_equipamento || row.tipoequipamento || 'Não informado');
  const tipoFiscalizacao = cleanDisplay(row.tipo_fiscalizacao || row.tipofiscalizacao || 'Não informado');
  const velocidade = cleanDisplay(row.velocidade_kmh || row.velocidadekmh || row.velocidade || row.velocidadedefiscalizacao || 'NA');

  const searchableText = normalizeText([
    id,
    tipoRadar,
    status,
    rodovia,
    km,
    municipio,
    localidade,
    tipoEquipamento,
    tipoFiscalizacao,
    velocidade,
  ].join(' '));

  return {
    id,
    status,
    tipoRadar,
    category,
    rodovia,
    km,
    municipio,
    localidade,
    tipoEquipamento,
    tipoFiscalizacao,
    velocidade,
    latitude,
    longitude,
    fonteUrl: cleanDisplay(row.fonte_url || row.fonte || ''),
    estudoUrl: cleanDisplay(row.estudo_tecnico_url || row.estudotecnico_url || ''),
    observacao: cleanDisplay(row.observacao || ''),
    searchableText,
    isOnRoute: false,
    distanceToRouteMeters: null,
  };
}

function buildMarkers(radars) {
  AppState.markersById.clear();

  radars.forEach((radar) => {
    const marker = L.marker([radar.latitude, radar.longitude], {
      icon: createRadarIcon(radar),
      title: `${formatRadarType(radar.tipoRadar)} — ${radar.rodovia} KM ${radar.km}`,
    }).bindPopup(createPopupHtml(radar), {
      className: 'modern-popup',
      closeButton: true,
      autoPan: true,
    });

    marker.radarId = radar.id;
    AppState.markersById.set(radar.id, marker);
  });
}

function refreshRadarMarker(radar) {
  const marker = AppState.markersById.get(radar.id);
  if (!marker) return;

  marker.setIcon(createRadarIcon(radar));
  marker.setPopupContent(createPopupHtml(radar));
}

function createRadarIcon(radar) {
  const statusClass = radar.status === 'ativo' ? 'is-active' : 'is-inactive';
  const typeClass = radar.tipoRadar === 'portatil' ? 'is-portable' : 'is-fixed';
  const routeClass = radar.isOnRoute ? 'is-route' : '';
  const iconClass = radar.tipoRadar === 'portatil' ? 'fa-camera' : 'fa-video';

  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div class="radar-marker ${statusClass} ${typeClass} ${routeClass}" aria-hidden="true"><i class="fa-solid ${iconClass}"></i></div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -20],
  });
}

function createPopupHtml(radar) {
  const statusText = radar.status === 'ativo' ? 'Ativo' : 'Inativo';
  const statusIcon = radar.status === 'ativo' ? 'fa-circle-check' : 'fa-circle-xmark';
  const typeIcon = radar.tipoRadar === 'portatil' ? 'fa-camera' : 'fa-video';
  const speedText = formatSpeed(radar.velocidade);
  const fiscalizacaoText = formatInspection(radar);

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${radar.latitude},${radar.longitude}`;
  const routeInfo = radar.isOnRoute
    ? `<li><i class="fa-solid fa-route"></i><span><strong>Na rota</strong> — aprox. ${Math.round(radar.distanceToRouteMeters)} m do trajeto</span></li>`
    : '';

  return `
    <article class="popup-card">
      <header class="popup-header">
        <div class="popup-icon ${radar.status}">
          <i class="fa-solid ${typeIcon}"></i>
        </div>
        <div>
          <h3 class="popup-title">${escapeHTML(formatRadarType(radar.tipoRadar))}</h3>
          <p class="popup-subtitle">${escapeHTML(radar.municipio)}</p>
        </div>
      </header>

      <ul class="popup-list">
        <li>
          <i class="fa-solid fa-road"></i>
          <span><strong>${escapeHTML(radar.rodovia)}</strong>${radar.km ? ` — KM ${escapeHTML(radar.km)}` : ''}</span>
        </li>
        <li>
          <i class="fa-solid fa-location-dot"></i>
          <span>${escapeHTML(radar.localidade)}</span>
        </li>
        <li>
          <i class="fa-solid fa-gauge-high"></i>
          <span>${escapeHTML(speedText)}</span>
        </li>
        <li>
          <i class="fa-solid fa-scale-balanced"></i>
          <span>${escapeHTML(fiscalizacaoText)}</span>
        </li>
        <li>
          <i class="fa-solid fa-microchip"></i>
          <span>${escapeHTML(radar.tipoEquipamento)}</span>
        </li>
        ${routeInfo}
      </ul>

      <div class="status-pill ${radar.status}">
        <i class="fa-solid ${statusIcon}"></i>
        ${escapeHTML(statusText)}
      </div>

      <footer class="popup-footer">
        <span>${radar.latitude.toFixed(5)}, ${radar.longitude.toFixed(5)}</span>
        <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer">Ver no Maps</a>
      </footer>
    </article>
  `;
}

function populateFilterOptions(radars) {
  fillSelect(UI.filterCity, uniqueSorted(radars.map((radar) => radar.municipio)), 'Todos os municípios');
  fillSelect(UI.filterHighway, uniqueSorted(radars.map((radar) => radar.rodovia)), 'Todas as rodovias');
  fillSelect(UI.filterInspection, uniqueSorted(radars.map((radar) => radar.tipoFiscalizacao)), 'Todos os tipos');
}

function refreshDependentHighways() {
  const selectedCity = UI.filterCity.value;
  const selectedHighway = UI.filterHighway.value;

  const filtered = AppState.allRadars.filter((radar) => {
    return selectedCity === 'all' || radar.municipio === selectedCity;
  });

  const highways = uniqueSorted(filtered.map((radar) => radar.rodovia));
  fillSelect(UI.filterHighway, highways, 'Todas as rodovias');

  if (highways.includes(selectedHighway)) UI.filterHighway.value = selectedHighway;
}

function fillSelect(select, values, defaultText) {
  select.innerHTML = '';

  const defaultOption = document.createElement('option');
  defaultOption.value = 'all';
  defaultOption.textContent = defaultText;
  select.appendChild(defaultOption);

  values.forEach((value) => {
    if (!value) return;
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function applyFilters(options = {}) {
  const activeStatuses = getCheckedValues(UI.filterStatuses);
  const activeTypes = getCheckedValues(UI.filterTypes);
  const selectedCity = UI.filterCity.value;
  const selectedHighway = UI.filterHighway.value;
  const selectedInspection = UI.filterInspection.value;
  const onlyRoute = UI.filterOnlyRoute.checked && !UI.filterOnlyRoute.disabled;

  const filtered = AppState.allRadars.filter((radar) => {
    const matchStatus = activeStatuses.includes(radar.status);
    const matchType = activeTypes.includes(radar.tipoRadar);
    const matchCity = selectedCity === 'all' || radar.municipio === selectedCity;
    const matchHighway = selectedHighway === 'all' || radar.rodovia === selectedHighway;
    const matchInspection = selectedInspection === 'all' || radar.tipoFiscalizacao === selectedInspection;
    const matchRoute = !onlyRoute || radar.isOnRoute;

    return matchStatus && matchType && matchCity && matchHighway && matchInspection && matchRoute;
  });

  AppState.visibleRadars = filtered;
  renderVisibleMarkers(filtered);
  updateCounters(filtered);
  updateFilterBadge();

  if (options.fitBounds) fitVisibleRadars({ silent: true });
}

function renderVisibleMarkers(radars) {
  AppState.radarLayer.clearLayers();

  radars.forEach((radar) => {
    const marker = AppState.markersById.get(radar.id);
    if (marker) marker.addTo(AppState.radarLayer);
  });
}

function updateCounters(visibleRadars) {
  UI.visibleCount.textContent = visibleRadars.length;
  UI.totalCount.textContent = AppState.allRadars.length;
}

function updateStats(radars) {
  UI.statActive.textContent = radars.filter((radar) => radar.status === 'ativo').length;
  UI.statInactive.textContent = radars.filter((radar) => radar.status === 'inativo').length;
  UI.statFixed.textContent = radars.filter((radar) => radar.tipoRadar === 'fixo').length;
  UI.statPortable.textContent = radars.filter((radar) => radar.tipoRadar === 'portatil').length;
}

function updateFilterBadge() {
  let activeCount = 0;

  const allStatusesChecked = UI.filterStatuses.every((checkbox) => checkbox.checked);
  const allTypesChecked = UI.filterTypes.every((checkbox) => checkbox.checked);

  if (!allStatusesChecked) activeCount += 1;
  if (!allTypesChecked) activeCount += 1;
  if (UI.filterCity.value !== 'all') activeCount += 1;
  if (UI.filterHighway.value !== 'all') activeCount += 1;
  if (UI.filterInspection.value !== 'all') activeCount += 1;
  if (UI.filterOnlyRoute.checked && !UI.filterOnlyRoute.disabled) activeCount += 1;

  UI.filterBadge.textContent = activeCount;
  UI.filterBadge.style.display = activeCount > 0 ? 'grid' : 'none';
}

function fitVisibleRadars(options = {}) {
  const markers = AppState.visibleRadars
    .map((radar) => AppState.markersById.get(radar.id))
    .filter(Boolean);

  if (markers.length === 0) {
    AppState.map.setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);
    if (!options.silent) showToast('Nenhum radar visível para centralizar.', 'warning');
    return;
  }

  const bounds = L.latLngBounds(markers.map((marker) => marker.getLatLng()));

  if (AppState.routeLine) {
    bounds.extend(AppState.routeLine.getBounds());
  }

  AppState.map.fitBounds(bounds, {
    padding: [46, 46],
    maxZoom: 13,
    animate: true,
  });

  if (!options.silent) showToast('Mapa ajustado aos itens visíveis.', 'success');
}

/* Geolocalização, busca e rota */

async function searchDestinationAndRoute(query) {
  showToast('Buscando destino...', 'info');

  try {
    const destination = await geocodeDestination(query);

    if (!destination) {
      showToast('Destino não encontrado. Tente informar cidade e estado.', 'warning');
      return;
    }

    setDestination(destination.lat, destination.lon, destination.label);

    const origin = AppState.userLocation || (await locateUser({ center: false, silent: false }));

    if (!origin) {
      AppState.map.setView([destination.lat, destination.lon], 14);
      showToast('Destino definido. Permita o GPS para calcular a rota.', 'warning');
      return;
    }

    await drawRoute(origin, [destination.lat, destination.lon]);
  } catch (error) {
    console.error(error);
    showToast('Erro ao buscar destino ou calcular rota.', 'error');
  }
}

async function geocodeDestination(query) {
  const normalizedQuery = normalizeText(query);
  if (AppState.geocodeCache.has(normalizedQuery)) {
    return AppState.geocodeCache.get(normalizedQuery);
  }

  const attempts = [
    query,
    `${query}, Rio de Janeiro, Brasil`,
  ];

  for (const attempt of attempts) {
    const url = new URL(CONFIG.NOMINATIM_URL);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('q', attempt);
    url.searchParams.set('countrycodes', 'br');
    url.searchParams.set('limit', '1');
    url.searchParams.set('addressdetails', '1');

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) continue;

    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      const item = data[0];
      const result = {
        lat: Number.parseFloat(item.lat),
        lon: Number.parseFloat(item.lon),
        label: item.display_name || attempt,
      };

      AppState.geocodeCache.set(normalizedQuery, result);
      return result;
    }
  }

  AppState.geocodeCache.set(normalizedQuery, null);
  return null;
}

function locateUser(options = {}) {
  const { center = true, silent = false } = options;

  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      showToast('Seu navegador não oferece suporte a GPS.', 'error');
      resolve(null);
      return;
    }

    if (!silent) showToast('Solicitando localização do dispositivo...', 'info');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        const location = [lat, lon];

        AppState.userLocation = location;
        setUserMarker(location);

        if (center) {
          AppState.map.setView(location, 15, { animate: true });
        }

        if (!silent) showToast('Localização encontrada.', 'success');
        resolve(location);
      },
      (error) => {
        console.warn(error);

        if (error.code === 1) {
          showToast('Permissão de GPS negada. Libere o acesso à localização no navegador.', 'error');
        } else if (error.code === 2) {
          showToast('Não foi possível obter sinal de GPS no momento.', 'warning');
        } else {
          showToast('Tempo esgotado ao tentar obter a localização.', 'warning');
        }

        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60000,
      }
    );
  });
}

function setUserMarker(location) {
  if (AppState.userMarker) {
    AppState.map.removeLayer(AppState.userMarker);
  }

  AppState.userMarker = L.marker(location, {
    icon: L.divIcon({
      className: 'custom-location-icon',
      html: `<div class="location-marker ${AppState.isNavigating ? 'is-following' : ''}"><i class="fa-solid fa-location-crosshairs"></i></div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      popupAnchor: [0, -18],
    }),
  }).addTo(AppState.map).bindPopup('<strong>Você está aqui</strong>');
}

function setDestination(lat, lon, label) {
  const destination = [lat, lon];
  AppState.destinationLocation = destination;

  if (AppState.destinationMarker) {
    AppState.map.removeLayer(AppState.destinationMarker);
  }

  AppState.destinationMarker = L.marker(destination, {
    icon: L.divIcon({
      className: 'custom-location-icon',
      html: '<div class="destination-marker"><i class="fa-solid fa-flag-checkered"></i></div>',
      iconSize: [34, 34],
      iconAnchor: [17, 34],
      popupAnchor: [0, -32],
    }),
  }).addTo(AppState.map).bindPopup(`<strong>Destino</strong><br>${escapeHTML(label)}`);

  UI.routeTitle.textContent = shortenLabel(label);
}

async function drawRoute(start, end) {
  if (AppState.isNavigating) {
    stopNavigation(false);
  }

  showToast('Calculando rota...', 'info');

  const url = `${CONFIG.OSRM_ROUTE_URL}/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson&steps=false&alternatives=false`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`OSRM respondeu com status ${response.status}`);
  }

  const data = await response.json();

  if (!data.routes || data.routes.length === 0) {
    showToast('Não foi possível calcular uma rota de carro para este destino.', 'warning');
    return;
  }

  const route = data.routes[0];
  const latLngCoords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);

  if (AppState.routeLine) {
    AppState.map.removeLayer(AppState.routeLine);
  }

  AppState.routeCoordinates = latLngCoords;
  AppState.lastRouteMeta = {
    distanceMeters: route.distance,
    durationSeconds: route.duration,
  };

  AppState.routeLine = L.polyline(latLngCoords, {
    color: '#2563eb',
    weight: 6,
    opacity: 0.86,
    lineJoin: 'round',
  }).addTo(AppState.map);

  updateRouteRadars();
  updateRouteSummary();
  updateNavigationButtons();
  applyFilters();

  const bounds = AppState.routeLine.getBounds();
  AppState.map.fitBounds(bounds, {
    padding: [60, 60],
    animate: true,
  });

  showToast(`Rota calculada: ${formatDistance(route.distance)}.`, 'success');
}

function updateRouteRadars() {
  const buffer = Number.parseFloat(UI.routeBuffer.value || '300');

  AppState.allRadars.forEach((radar) => {
    radar.isOnRoute = false;
    radar.distanceToRouteMeters = null;
  });

  if (!AppState.routeCoordinates.length) {
    AppState.routeRadars = [];
    AppState.allRadars.forEach(refreshRadarMarker);
    return;
  }

  const routeLine = createTurfLine(AppState.routeCoordinates);

  AppState.routeRadars = AppState.allRadars
    .map((radar) => {
      const distance = calculateDistanceToRouteMeters(
        [radar.latitude, radar.longitude],
        AppState.routeCoordinates,
        routeLine
      );

      radar.distanceToRouteMeters = distance;
      radar.isOnRoute = Number.isFinite(distance) && distance <= buffer;

      return radar;
    })
    .filter((radar) => radar.isOnRoute)
    .sort((a, b) => {
      if (a.distanceToRouteMeters !== b.distanceToRouteMeters) {
        return a.distanceToRouteMeters - b.distanceToRouteMeters;
      }
      return a.rodovia.localeCompare(b.rodovia, 'pt-BR', { numeric: true });
    });

  AppState.allRadars.forEach(refreshRadarMarker);
}

function updateRouteSummary() {
  if (!AppState.lastRouteMeta) {
    UI.routeSummary.classList.remove('is-visible');
    UI.routeSummary.setAttribute('aria-hidden', 'true');
    return;
  }

  UI.routeDistance.textContent = formatDistance(AppState.lastRouteMeta.distanceMeters);
  UI.routeDuration.textContent = formatDuration(AppState.lastRouteMeta.durationSeconds);
  UI.routeRadarCount.textContent = String(AppState.routeRadars.length);

  const routeStats = getRouteRadarStats();
  UI.routeActiveCount.textContent = routeStats.active;
  UI.routeInactiveCount.textContent = routeStats.inactive;
  UI.routeFixedCount.textContent = routeStats.fixed;
  UI.routePortableCount.textContent = routeStats.portable;
  UI.routeBufferLabel.textContent = `até ${formatDistance(Number.parseFloat(UI.routeBuffer.value || '300'))}`;

  renderRouteRadarList();

  UI.filterOnlyRoute.disabled = false;
  UI.btnFocusRoute.disabled = false;
  UI.btnStartNavigation.disabled = false;
  UI.routeSummary.classList.add('is-visible');
  UI.routeSummary.setAttribute('aria-hidden', 'false');
}

function clearRoute() {
  stopNavigation(false);

  if (AppState.routeLine) {
    AppState.map.removeLayer(AppState.routeLine);
    AppState.routeLine = null;
  }

  if (AppState.destinationMarker) {
    AppState.map.removeLayer(AppState.destinationMarker);
    AppState.destinationMarker = null;
  }

  AppState.destinationLocation = null;
  AppState.routeCoordinates = [];
  AppState.routeRadars = [];
  AppState.lastRouteMeta = null;

  AppState.allRadars.forEach((radar) => {
    radar.isOnRoute = false;
    radar.distanceToRouteMeters = null;
    refreshRadarMarker(radar);
  });

  UI.filterOnlyRoute.checked = false;
  UI.filterOnlyRoute.disabled = true;
  UI.btnFocusRoute.disabled = true;
  UI.btnStartNavigation.disabled = true;
  UI.btnStopNavigation.disabled = true;
  UI.routeActiveCount.textContent = '0';
  UI.routeInactiveCount.textContent = '0';
  UI.routeFixedCount.textContent = '0';
  UI.routePortableCount.textContent = '0';
  UI.routeRadarList.innerHTML = '<li class="empty-list">Calcule uma rota para listar os radares próximos.</li>';
  setNavigationStatus('Navegação parada', 'Calcule uma rota e toque em “Iniciar rota”.', 'idle');
  UI.routeSummary.classList.remove('is-visible');
  UI.routeSummary.setAttribute('aria-hidden', 'true');

  applyFilters();
  showToast('Rota removida do mapa.', 'info');
}


function getRouteRadarStats() {
  return {
    active: AppState.routeRadars.filter((radar) => radar.status === 'ativo').length,
    inactive: AppState.routeRadars.filter((radar) => radar.status === 'inativo').length,
    fixed: AppState.routeRadars.filter((radar) => radar.tipoRadar === 'fixo').length,
    portable: AppState.routeRadars.filter((radar) => radar.tipoRadar === 'portatil').length,
  };
}

function renderRouteRadarList() {
  if (!AppState.routeCoordinates.length) {
    UI.routeRadarList.innerHTML = '<li class="empty-list">Calcule uma rota para listar os radares próximos.</li>';
    return;
  }

  if (AppState.routeRadars.length === 0) {
    UI.routeRadarList.innerHTML = '<li class="empty-list">Nenhum radar encontrado dentro da distância configurada.</li>';
    return;
  }

  const topItems = AppState.routeRadars.slice(0, 20);

  UI.routeRadarList.innerHTML = topItems.map((radar, index) => {
    const icon = radar.tipoRadar === 'portatil' ? 'fa-camera' : 'fa-video';
    const statusClass = radar.status === 'ativo' ? 'active' : 'inactive';
    const distance = formatDistance(radar.distanceToRouteMeters);
    const title = `${radar.rodovia}${radar.km ? ` KM ${radar.km}` : ''}`;
    const subtitle = `${formatRadarType(radar.tipoRadar)} • ${radar.municipio}`;

    return `
      <li>
        <button type="button" data-radar-id="${escapeHTML(radar.id)}" aria-label="Abrir radar ${escapeHTML(title)}">
          <span class="route-item-icon ${statusClass}">
            <i class="fa-solid ${icon}"></i>
          </span>
          <span class="route-item-main">
            <strong>${index + 1}. ${escapeHTML(title)}</strong>
            <span>${escapeHTML(subtitle)}</span>
          </span>
          <span class="route-item-distance">${escapeHTML(distance)}</span>
        </button>
      </li>
    `;
  }).join('');

  if (AppState.routeRadars.length > topItems.length) {
    UI.routeRadarList.insertAdjacentHTML(
      'beforeend',
      `<li class="empty-list">+ ${AppState.routeRadars.length - topItems.length} radares adicionais dentro do buffer.</li>`
    );
  }
}

function focusRadar(radarId) {
  const radar = AppState.allRadars.find((item) => item.id === radarId);
  const marker = AppState.markersById.get(radarId);

  if (!radar || !marker) return;

  UI.filterOnlyRoute.checked = false;
  applyFilters();

  AppState.map.setView([radar.latitude, radar.longitude], 16, { animate: true });
  marker.openPopup();
}

function fitRouteAndRadars() {
  if (!AppState.routeLine) {
    showToast('Calcule uma rota primeiro.', 'warning');
    return;
  }

  const bounds = AppState.routeLine.getBounds();

  AppState.routeRadars.forEach((radar) => {
    bounds.extend([radar.latitude, radar.longitude]);
  });

  AppState.map.fitBounds(bounds, {
    padding: [62, 62],
    animate: true,
  });
}



async function startNavigation() {
  if (!AppState.routeLine || !AppState.destinationLocation) {
    showToast('Calcule uma rota antes de iniciar o acompanhamento.', 'warning');
    return;
  }

  if (!navigator.geolocation) {
    showToast('Este navegador não oferece suporte a acompanhamento por GPS.', 'error');
    return;
  }

  AppState.isNavigating = true;
  AppState.alertedRadarIds.clear();
  updateNavigationButtons();
  setNavigationStatus('Iniciando rota...', 'Solicitando GPS, áudio e alertas do dispositivo.', 'active');

  await prepareNotificationPermission();
  await prepareWakeLock();
  prepareAudioContext();

  const firstPosition = await locateUser({ center: true, silent: false });

  if (!firstPosition) {
    AppState.isNavigating = false;
    updateNavigationButtons();
    setNavigationStatus('Navegação não iniciada', 'Não foi possível obter a localização atual.', 'alert');
    return;
  }

  checkRadarProximity(firstPosition);

  if (AppState.navigationWatchId !== null) {
    navigator.geolocation.clearWatch(AppState.navigationWatchId);
  }

  AppState.navigationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      const location = [position.coords.latitude, position.coords.longitude];
      const accuracy = Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null;

      AppState.userLocation = location;
      AppState.lastUserPositionAt = Date.now();
      setUserMarker(location);

      AppState.map.setView(location, Math.max(AppState.map.getZoom(), 15), {
        animate: true,
        duration: 0.45,
      });

      updateNavigationProgress(location, accuracy);
      checkRadarProximity(location);
    },
    (error) => {
      console.warn(error);
      setNavigationStatus('Sinal de GPS instável', 'O acompanhamento continua tentando receber sua localização.', 'alert');
      showToast('Sinal de GPS instável no momento.', 'warning');
    },
    {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 3000,
    }
  );

  setNavigationStatus('Rota iniciada', 'Acompanhando sua posição no mapa e monitorando radares próximos.', 'active');
  showToast('Rota iniciada. Alertas de proximidade ativados.', 'success');
}

function stopNavigation(showMessage = true) {
  if (AppState.navigationWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(AppState.navigationWatchId);
  }

  AppState.navigationWatchId = null;
  AppState.isNavigating = false;
  releaseWakeLock();
  updateNavigationButtons();

  if (AppState.userLocation) {
    setUserMarker(AppState.userLocation);
  }

  setNavigationStatus('Navegação parada', 'Toque em “Iniciar rota” para acompanhar novamente.', 'idle');

  if (showMessage) {
    showToast('Acompanhamento da rota encerrado.', 'info');
  }
}

function updateNavigationButtons() {
  UI.btnStartNavigation.disabled = AppState.isNavigating || !AppState.routeLine;
  UI.btnStopNavigation.disabled = !AppState.isNavigating;
}

function updateNavigationProgress(location, accuracy) {
  const destinationDistance = AppState.destinationLocation
    ? haversineDistanceMeters(location, AppState.destinationLocation)
    : null;

  const nearest = getNearestRouteRadar(location);
  const accuracyText = accuracy ? `GPS ±${Math.round(accuracy)} m` : 'GPS ativo';

  if (nearest) {
    setNavigationStatus(
      'Rota em acompanhamento',
      `Próximo radar: ${nearest.radar.rodovia}${nearest.radar.km ? ` KM ${nearest.radar.km}` : ''} em ${formatDistance(nearest.distance)}. Destino a ${formatDistance(destinationDistance)}. ${accuracyText}.`,
      'active'
    );
  } else {
    setNavigationStatus(
      'Rota em acompanhamento',
      `Destino a ${formatDistance(destinationDistance)}. ${accuracyText}. Nenhum radar próximo dentro do buffer atual.`,
      'active'
    );
  }
}

function checkRadarProximity(location) {
  const alertDistance = Number.parseFloat(UI.alertDistance.value || '300');
  const candidates = AppState.routeRadars.length ? AppState.routeRadars : AppState.allRadars;

  const nearby = candidates
    .map((radar) => ({
      radar,
      distance: haversineDistanceMeters(location, [radar.latitude, radar.longitude]),
    }))
    .filter((item) => Number.isFinite(item.distance) && item.distance <= alertDistance)
    .sort((a, b) => a.distance - b.distance);

  if (!nearby.length) return;

  const closest = nearby[0];

  if (AppState.alertedRadarIds.has(closest.radar.id)) {
    return;
  }

  AppState.alertedRadarIds.add(closest.radar.id);
  triggerRadarProximityAlert(closest.radar, closest.distance);
}

function getNearestRouteRadar(location) {
  const candidates = AppState.routeRadars.length ? AppState.routeRadars : AppState.allRadars;

  const nearest = candidates
    .map((radar) => ({
      radar,
      distance: haversineDistanceMeters(location, [radar.latitude, radar.longitude]),
    }))
    .filter((item) => Number.isFinite(item.distance))
    .sort((a, b) => a.distance - b.distance)[0];

  return nearest || null;
}

function triggerRadarProximityAlert(radar, distance) {
  const message = `Atenção: ${formatRadarType(radar.tipoRadar).toLowerCase()} ${radar.status} a ${formatDistance(distance)} — ${radar.rodovia}${radar.km ? ` KM ${radar.km}` : ''}.`;

  setNavigationStatus('Alerta de radar próximo', message, 'alert');
  showToast(message, 'warning');
  playAlertSound();
  vibrateAlert();
  showSystemNotification('Radar próximo', message);

  const marker = AppState.markersById.get(radar.id);
  if (marker) {
    marker.openPopup();
  }
}

function setNavigationStatus(title, text, mode = 'idle') {
  UI.navigationStatusTitle.textContent = title;
  UI.navigationStatusText.textContent = text;

  UI.navigationStatus.classList.remove('is-active', 'is-alert');

  if (mode === 'active') {
    UI.navigationStatus.classList.add('is-active');
  }

  if (mode === 'alert') {
    UI.navigationStatus.classList.add('is-alert');
  }
}

async function prepareNotificationPermission() {
  if (!('Notification' in window)) return;

  if (Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch (error) {
      console.warn('Permissão de notificação não concedida.', error);
    }
  }
}

function showSystemNotification(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    new Notification(title, {
      body,
      icon: './icon-192.png',
      tag: 'radarmaparj-alerta-radar',
      renotify: true,
    });
  } catch (error) {
    console.warn('Não foi possível exibir notificação do sistema.', error);
  }
}

function prepareAudioContext() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!AppState.audioContext) {
      AppState.audioContext = new AudioContextClass();
    }

    if (AppState.audioContext.state === 'suspended') {
      AppState.audioContext.resume();
    }
  } catch (error) {
    console.warn('Áudio não disponível.', error);
  }
}

function playAlertSound() {
  try {
    prepareAudioContext();
    const ctx = AppState.audioContext;
    if (!ctx) return;

    const now = ctx.currentTime;

    [0, 0.22, 0.44].forEach((offset) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, now + offset);

      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.14);

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.16);
    });
  } catch (error) {
    console.warn('Falha ao tocar alerta sonoro.', error);
  }
}

function vibrateAlert() {
  if (!navigator.vibrate) return;

  try {
    navigator.vibrate([220, 120, 220, 120, 350]);
  } catch (error) {
    console.warn('Vibração não disponível.', error);
  }
}

async function prepareWakeLock() {
  if (!('wakeLock' in navigator)) return;

  try {
    AppState.wakeLock = await navigator.wakeLock.request('screen');

    AppState.wakeLock.addEventListener('release', () => {
      AppState.wakeLock = null;
    });
  } catch (error) {
    console.warn('Wake Lock não disponível.', error);
  }
}

async function releaseWakeLock() {
  if (!AppState.wakeLock) return;

  try {
    await AppState.wakeLock.release();
  } catch (error) {
    console.warn('Falha ao liberar Wake Lock.', error);
  } finally {
    AppState.wakeLock = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && AppState.isNavigating && !AppState.wakeLock) {
    prepareWakeLock();
  }
});


/* Painel e feedback */

function openPanel() {
  AppState.isPanelOpen = true;
  UI.filterPanel.classList.add('is-open');
  UI.filterPanel.setAttribute('aria-hidden', 'false');
  setTimeout(() => AppState.map.invalidateSize(), 260);
}

function closePanel() {
  AppState.isPanelOpen = false;
  UI.filterPanel.classList.remove('is-open');
  UI.filterPanel.setAttribute('aria-hidden', 'true');
  setTimeout(() => AppState.map.invalidateSize(), 260);
}

function togglePanel() {
  AppState.isPanelOpen ? closePanel() : openPanel();
}

function showLoading(visible) {
  UI.loadingOverlay.classList.toggle('is-hidden', !visible);
}

function showFatalError(message) {
  UI.loadingOverlay.innerHTML = `
    <div class="loading-card">
      <strong>Erro ao iniciar o RadarMapa RJ</strong>
      <span>${escapeHTML(message)}</span>
    </div>
  `;
}

function showToast(message, type = 'info') {
  clearTimeout(AppState.toastTimer);

  UI.toast.className = `toast ${type}`;
  UI.toastMessage.textContent = message;

  if (type === 'success') UI.toastIcon.className = 'fa-solid fa-circle-check';
  else if (type === 'error') UI.toastIcon.className = 'fa-solid fa-triangle-exclamation';
  else if (type === 'warning') UI.toastIcon.className = 'fa-solid fa-circle-exclamation';
  else UI.toastIcon.className = 'fa-solid fa-circle-info';

  UI.toast.classList.add('is-visible');

  AppState.toastTimer = setTimeout(() => {
    UI.toast.classList.remove('is-visible');
  }, 3600);
}

/* Helpers */

function getCheckedValues(checkboxes) {
  return checkboxes.filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value);
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => {
    return a.localeCompare(b, 'pt-BR', { sensitivity: 'base', numeric: true });
  });
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, ' ');
}

function normalizeStatus(value) {
  const text = normalizeText(value);
  return text.includes('inativo') ? 'inativo' : 'ativo';
}

function normalizeRadarType(value) {
  const text = normalizeText(value);
  return text.includes('port') ? 'portatil' : 'fixo';
}

function cleanDisplay(value) {
  const text = String(value ?? '').trim();
  return text || '';
}

function sanitizeId(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseCoordinate(value) {
  if (value === null || value === undefined) return Number.NaN;

  const text = String(value)
    .trim()
    .replace(/\s+/g, '')
    .replace(',', '.');

  const number = Number.parseFloat(text);
  return Number.isFinite(number) ? number : Number.NaN;
}

function isCoordinateInsideRJ(latitude, longitude) {
  const [[south, west], [north, east]] = CONFIG.RJ_BOUNDS;
  return latitude >= south && latitude <= north && longitude >= west && longitude <= east;
}

function formatRadarType(type) {
  return type === 'portatil' ? 'Radar Portátil' : 'Radar Fixo';
}

function formatSpeed(value) {
  const text = String(value || '').trim();

  if (!text || normalizeText(text) === 'na' || normalizeText(text) === 'n/a') {
    return 'Velocidade: não aplicável';
  }

  const number = Number.parseFloat(text.replace(',', '.'));
  if (Number.isFinite(number)) return `Velocidade fiscalizada: ${number} km/h`;

  if (text.toLowerCase().includes('km')) return `Velocidade fiscalizada: ${text}`;
  return `Velocidade fiscalizada: ${text} km/h`;
}

function formatInspection(radar) {
  const inspection = radar.tipoFiscalizacao || 'Não informado';
  const normalized = normalizeText(inspection);

  if (normalized.includes('avanco') || normalized.includes('sinal')) {
    return 'Fiscalização: avanço de sinal';
  }

  if (normalized.includes('acostamento')) {
    return 'Fiscalização: transitar pelo acostamento';
  }

  if (normalized.includes('velocidade')) {
    return 'Fiscalização: excesso de velocidade';
  }

  return `Fiscalização: ${inspection}`;
}

function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function debounce(callback, wait = 200) {
  let timer;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), wait);
  };
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '--';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '--';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining > 0 ? `${hours}h${String(remaining).padStart(2, '0')}` : `${hours}h`;
}

function shortenLabel(label) {
  const text = String(label || 'Destino definido');
  const parts = text.split(',').map((part) => part.trim()).filter(Boolean);
  return parts.slice(0, 3).join(', ') || text;
}


function haversineDistanceMeters(pointA, pointB) {
  if (!pointA || !pointB) return Number.NaN;

  const radius = 6371000;
  const lat1 = pointA[0] * Math.PI / 180;
  const lat2 = pointB[0] * Math.PI / 180;
  const deltaLat = (pointB[0] - pointA[0]) * Math.PI / 180;
  const deltaLng = (pointB[1] - pointA[1]) * Math.PI / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return radius * c;
}

function calculateDistanceToRouteMeters(point, line, turfLine) {
  if (window.turf && turfLine && typeof window.turf.pointToLineDistance === 'function') {
    try {
      const turfPoint = window.turf.point([point[1], point[0]]);
      return window.turf.pointToLineDistance(turfPoint, turfLine, { units: 'meters' });
    } catch (error) {
      console.warn('Falha no cálculo com Turf.js. Usando cálculo aproximado.', error);
    }
  }

  return approximateDistanceToPolylineMeters(point, line);
}

function createTurfLine(line) {
  if (!window.turf || typeof window.turf.lineString !== 'function') return null;

  try {
    return window.turf.lineString(line.map(([lat, lng]) => [lng, lat]));
  } catch (error) {
    console.warn('Não foi possível criar linha Turf.js.', error);
    return null;
  }
}

function approximateDistanceToPolylineMeters(point, line) {
  if (!Array.isArray(line) || line.length === 0) return Number.POSITIVE_INFINITY;

  let minDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < line.length - 1; i += 1) {
    const distance = distancePointToSegmentMeters(point, line[i], line[i + 1]);
    if (distance < minDistance) minDistance = distance;
  }

  return minDistance;
}

function distancePointToSegmentMeters(point, start, end) {
  const latRef = point[0] * Math.PI / 180;
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos(latRef);

  const px = point[1] * metersPerDegLng;
  const py = point[0] * metersPerDegLat;
  const ax = start[1] * metersPerDegLng;
  const ay = start[0] * metersPerDegLat;
  const bx = end[1] * metersPerDegLng;
  const by = end[0] * metersPerDegLat;

  const dx = bx - ax;
  const dy = by - ay;

  if (dx === 0 && dy === 0) {
    return Math.hypot(px - ax, py - ay);
  }

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const closestX = ax + t * dx;
  const closestY = ay + t * dy;

  return Math.hypot(px - closestX, py - closestY);
}
