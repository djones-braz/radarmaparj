/* RadarMapa RJ — Etapa 1
 * HTML + CSS + JavaScript puro para GitHub Pages.
 * Nesta etapa: mapa, leitura da planilha única, marcadores, filtros e popups.
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
};

const AppState = {
  map: null,
  radarLayer: null,
  allRadars: [],
  visibleRadars: [],
  markersById: new Map(),
  toastTimer: null,
  isPanelOpen: false,
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
  UI.map = document.getElementById('map');

  UI.filterPanel = document.getElementById('filterPanel');
  UI.btnOpenPanel = document.getElementById('btnOpenPanel');
  UI.btnTogglePanel = document.getElementById('btnTogglePanel');
  UI.btnClosePanel = document.getElementById('btnClosePanel');
  UI.btnFitRJ = document.getElementById('btnFitRJ');

  UI.quickSearchForm = document.getElementById('quickSearchForm');
  UI.quickSearchInput = document.getElementById('quickSearchInput');
  UI.btnClearSearch = document.getElementById('btnClearSearch');

  UI.filterStatuses = Array.from(document.querySelectorAll('.filter-status'));
  UI.filterTypes = Array.from(document.querySelectorAll('.filter-type'));
  UI.filterCity = document.getElementById('filterCity');
  UI.filterHighway = document.getElementById('filterHighway');
  UI.filterInspection = document.getElementById('filterInspection');
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
}

function bindUIEvents() {
  UI.btnOpenPanel.addEventListener('click', openPanel);
  UI.btnTogglePanel.addEventListener('click', togglePanel);
  UI.btnClosePanel.addEventListener('click', closePanel);

  UI.btnFitRJ.addEventListener('click', fitVisibleRadars);

  UI.quickSearchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    applyFilters();
  });

  UI.quickSearchInput.addEventListener('input', () => {
    UI.btnClearSearch.classList.toggle('is-visible', UI.quickSearchInput.value.trim().length > 0);
    applyFilters();
  });

  UI.btnClearSearch.addEventListener('click', () => {
    UI.quickSearchInput.value = '';
    UI.btnClearSearch.classList.remove('is-visible');
    applyFilters();
    UI.quickSearchInput.focus();
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

  UI.btnSelectAll.addEventListener('click', () => {
    UI.filterStatuses.forEach((checkbox) => (checkbox.checked = true));
    UI.filterTypes.forEach((checkbox) => (checkbox.checked = true));
    UI.filterCity.value = 'all';
    UI.filterHighway.value = 'all';
    UI.filterInspection.value = 'all';
    UI.quickSearchInput.value = '';
    UI.btnClearSearch.classList.remove('is-visible');
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
    category,
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

function createRadarIcon(radar) {
  const statusClass = radar.status === 'ativo' ? 'is-active' : 'is-inactive';
  const typeClass = radar.tipoRadar === 'portatil' ? 'is-portable' : 'is-fixed';
  const iconClass = radar.tipoRadar === 'portatil' ? 'fa-camera' : 'fa-video';

  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div class="radar-marker ${statusClass} ${typeClass}" aria-hidden="true"><i class="fa-solid ${iconClass}"></i></div>`,
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
        <li><i class="fa-solid fa-road"></i><span><strong>${escapeHTML(radar.rodovia)}</strong>${radar.km ? ` — KM ${escapeHTML(radar.km)}` : ''}</span></li>
        <li><i class="fa-solid fa-location-dot"></i><span>${escapeHTML(radar.localidade)}</span></li>
        <li><i class="fa-solid fa-gauge-high"></i><span>${escapeHTML(speedText)}</span></li>
        <li><i class="fa-solid fa-scale-balanced"></i><span>${escapeHTML(fiscalizacaoText)}</span></li>
        <li><i class="fa-solid fa-microchip"></i><span>${escapeHTML(radar.tipoEquipamento)}</span></li>
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
  const cities = uniqueSorted(radars.map((radar) => radar.municipio));
  const highways = uniqueSorted(radars.map((radar) => radar.rodovia));
  const inspections = uniqueSorted(radars.map((radar) => radar.tipoFiscalizacao));

  fillSelect(UI.filterCity, cities, 'Todos os municípios');
  fillSelect(UI.filterHighway, highways, 'Todas as rodovias');
  fillSelect(UI.filterInspection, inspections, 'Todos os tipos');
}

function refreshDependentHighways() {
  const selectedCity = UI.filterCity.value;
  const selectedHighway = UI.filterHighway.value;

  const filtered = AppState.allRadars.filter((radar) => {
    return selectedCity === 'all' || radar.municipio === selectedCity;
  });

  const highways = uniqueSorted(filtered.map((radar) => radar.rodovia));
  fillSelect(UI.filterHighway, highways, 'Todas as rodovias');

  if (highways.includes(selectedHighway)) {
    UI.filterHighway.value = selectedHighway;
  }
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
  const query = normalizeText(UI.quickSearchInput.value);

  const filtered = AppState.allRadars.filter((radar) => {
    const matchStatus = activeStatuses.includes(radar.status);
    const matchType = activeTypes.includes(radar.tipoRadar);
    const matchCity = selectedCity === 'all' || radar.municipio === selectedCity;
    const matchHighway = selectedHighway === 'all' || radar.rodovia === selectedHighway;
    const matchInspection = selectedInspection === 'all' || radar.tipoFiscalizacao === selectedInspection;
    const matchSearch = !query || radar.searchableText.includes(query);

    return matchStatus && matchType && matchCity && matchHighway && matchInspection && matchSearch;
  });

  AppState.visibleRadars = filtered;
  renderVisibleMarkers(filtered);
  updateCounters(filtered);
  updateFilterBadge();

  if (options.fitBounds) {
    fitVisibleRadars({ silent: true });
  }
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
  if (UI.quickSearchInput.value.trim()) activeCount += 1;

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
  AppState.map.fitBounds(bounds, {
    padding: [42, 42],
    maxZoom: 13,
    animate: true,
  });

  if (!options.silent) showToast('Mapa ajustado aos radares visíveis.', 'success');
}

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
  }, 3300);
}

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
  const normalized = normalizeText(text);

  if (!text || normalized === 'na' || normalized === 'n/a') {
    return 'Velocidade: não aplicável';
  }

  const number = Number.parseFloat(text.replace(',', '.'));
  if (Number.isFinite(number)) {
    return `Velocidade fiscalizada: ${number} km/h`;
  }

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
