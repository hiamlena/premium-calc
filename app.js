/* app.js – TransTime Calculators logic (fixed build) */
(function () {
  "use strict";

  // ===== Guard: prevent double init (important if script accidentally included twice) =====
  if (window.__TT_CALC_APPJS_INIT__) return;
  window.__TT_CALC_APPJS_INIT__ = true;

  // ===== Helpers =====
  function $(id) { return document.getElementById(id); }

  function num(v, def = 0) {
    const n = parseFloat(v);
    return isFinite(n) ? n : def;
  }

  function fmtL(n) { return isFinite(n) ? Math.round(n).toLocaleString('ru-RU') + ' л' : '—'; }
  function fmtKg(n) { return isFinite(n) ? Math.round(n).toLocaleString('ru-RU') + ' кг' : '—'; }

  function fmtT(n) {
    if (!isFinite(n)) return '—';
    const val = Number(n.toFixed(3));
    return val.toLocaleString('ru-RU', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' т';
  }

  function fmtM3(n) {
    if (!isFinite(n)) return '—';
    const val = Number(n.toFixed(3));
    return val.toLocaleString('ru-RU', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' м³';
  }

  function fmtT2(n) {
    if (!isFinite(n)) return '—';
    const val = Number(n.toFixed(2));
    return val.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' т';
  }

  function fmtM3_3(n) {
    if (!isFinite(n)) return '—';
    const val = Number(n.toFixed(3));
    return val.toLocaleString('ru-RU', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' м³';
  }

  function roundTo(n, dec = 3) {
    if (!isFinite(n)) return NaN;
    const factor = Math.pow(10, dec);
    return Math.round(n * factor) / factor;
  }

  function setInputValue(input, value, dec = 3) {
    if (!input) return;
    if (!isFinite(value)) input.value = '';
    else input.value = String(dec >= 0 ? roundTo(value, dec) : value);
  }

  function getTractorSelects() {
    const primary = $("tractorSelect");
    const fallback = $("truck");
    const set = [];
    if (primary) set.push(primary);
    if (fallback && fallback !== primary) set.push(fallback);
    return set;
  }

  function getTrailerSelects() {
    const primary = $("trailerSelect");
    const fallback = $("trailer");
    const set = [];
    if (primary) set.push(primary);
    if (fallback && fallback !== primary) set.push(fallback);
    return set;
  }

  function getTrailerPlateInput() {
    // максимально широкая совместимость по id/name
    return $('trailerPlate')
      || $('trailer_plate')
      || $('trailerNumber')
      || $('trailer_number')
      || document.querySelector('[name="trailerPlate"]')
      || document.querySelector('[name="trailer_plate"]')
      || document.querySelector('[name="trailerNumber"]')
      || document.querySelector('[name="trailer_number"]')
      || null;
  }

  // авто-заполнение номера прицепа + запрет ввода + скрытие блока (полностью)
  function syncAndHideTrailerPlate(selectedTrailer) {
    const inp = getTrailerPlateInput();
    if (!inp) return;

    inp.value = (selectedTrailer && selectedTrailer.name) ? selectedTrailer.name : '';
    inp.readOnly = true;
    inp.setAttribute('readonly', '');
    inp.disabled = true;

    // 1) прячем само поле гарантированно
    inp.style.display = 'none';

    // 2) пытаемся спрятать “строку/группу” вокруг
    const wrap =
      (inp.closest && inp.closest('.field, .form-group, .form-row, .row, .grid, .input-row, .control, .control-row, .line')) || null;

    if (wrap) {
      wrap.style.display = 'none';
      return;
    }

    // 3) если нет классов — прячем родителя (обычно это div-обёртка с label)
    if (inp.parentElement) {
      inp.parentElement.style.display = 'none';
    }
  }

  function fillSelectOptions(selectEl, items, selectedValue) {
    if (!selectEl) return;
    const prev = selectEl.value;
    selectEl.innerHTML = '';
    if (!items.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '—';
      selectEl.appendChild(opt);
      selectEl.value = '';
      selectEl.disabled = true;
      return;
    }
    selectEl.disabled = false;
    items.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.value;
      opt.textContent = item.label;
      selectEl.appendChild(opt);
    });

    let target = selectedValue;
    const hasTarget = items.some(item => item.value === target);
    if (!hasTarget) {
      if (items.some(item => item.value === prev)) target = prev;
      else target = items[0]?.value || '';
    }
    if (typeof target === 'string') selectEl.value = target;
  }

  function getGlobalTypeSelect() { return $('cargoType') || $('cargoTypeCommon'); }
  function getGlobalRhoInput() { return $('cargoRho') || $('rhoCommon'); }
  function getProductModalElement() { return $('modalProduct') || $('productModal'); }
  function getProductForm() { return $('mp_form'); }
  function getProductNameInput() { return $('mp_name') || $('prod_name'); }
  function getProductRhoInput() { return $('mp_rho') || $('prod_rho'); }
  function getProductCancelButton() { return $('mp_cancel') || $('prod_cancel'); }
  function getProductSaveButton() { return $('prod_save'); }

  let toastTimer = null;
  function showToast(message, type = 'ok') {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('warn', 'error');
    if (type === 'warn') el.classList.add('warn');
    else if (type === 'error') el.classList.add('error');
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.classList.remove('show'); }, 2500);
  }

  let productModalKeyHandler = null;

  function setupCargoLayout() {
    const addBtn = $('btnAddProduct');
    if (addBtn) {
      addBtn.textContent = '+';
      addBtn.setAttribute('aria-label', 'Добавить груз');
      addBtn.setAttribute('title', 'Добавить груз');
    }
  }

  function updateTankSectionVisibility() {
    const section = $('tankSection');
    const isTanker = app.trailerState?.type === 'tanker';
    if (!section) return;
    section.style.display = isTanker ? 'block' : 'none';
    const table = section.querySelector('table');
    if (table) table.style.display = app.singleCargo ? 'none' : 'table';
  }

  // ===== Data =====
  const defaultProducts = [
    { key: "diesel", label: "Дизельное топливо (ДТ)", rho: 0.84 },
    { key: "gas92", label: "Бензин АИ-92", rho: 0.74 },
    { key: "gas95", label: "Бензин АИ-95", rho: 0.75 },
    { key: "molasses", label: "Патока", rho: 1.40 },
    { key: "syrup", label: "Сироп сахарный", rho: 1.30 },
    { key: "wine", label: "Вино", rho: 0.99 },
    { key: "ethanol96", label: "Спирт этиловый (96%)", rho: 0.789 },
    { key: "methanol", label: "Метанол", rho: 0.792 },
    { key: "vinyl_acetate", label: "Винилацетат мономер (VAM)", rho: 0.934 },
    { key: "butyl_acetate", label: "Бутилацетат", rho: 0.882 },
    { key: "methyl_acetate", label: "Метилацетат", rho: 0.932 },
    { key: "ethyl_acetate", label: "Этил ацетат", rho: 0.902 },
    { key: "n_butanol", label: "н-Бутанол", rho: 0.810 },
    { key: "acetic_acid_glacial", label: "Уксусная кислота (ледяная)", rho: 1.049 },
    { key: "sulfuric_acid_96", label: "Серная кислота (96–98%)", rho: 1.830 },
    { key: "heavy_oil", label: "Тяжёлые масла", rho: 0.93 },
    { key: "formalin37", label: "Формалин 37%", rho: 1.09 }
  ];

  const defaultTrucks = [
    "В 010 СЕ 123", "М 020 АМ 123", "Е 030 ВК 123", "Е 040 ВК 123", "Т 050 ВТ 93", "Н 060 ВТ 123", "С 070 УА 93",
    "Р 100 СА 93", "Н 200 НУ 23", "У 300 ХА 93", "Х 400 СХ 93",
    "О 600 РВ 93",
    "В 800 ТУ 93", "В 900 ТУ 93", "С 101 ОХ 123", "Е 202 УО 93", "А 303 ЕР 123", "Т 404 РС 123", "Р 505 МВ 123", "У 606 МВ 123", "О 707 СУ 123", "У 808 РУ 123", "У 909 СН 123", "Е 111 КС 123", "Р 212 СН 23", "Т 313 РУ 93", "Н 414 РВ 93", "Х 515 ТМ 93", "У 616 СН 123", "Р 919 ВК 93", "У 616 СН 123",
    "С 999 РХ 123", "А 444 АУ 23", "О 555 КК 123",
    "Т 777 АК 123", "Н 888 РС 123"
  ];

  const defaultTrailers = [
    { id: "ER8977_23", name: "ЕР 8977 23", type: "platform", axles: 3, tareKg: 5900, positions: 4 },
    { id: "EU2938_23", name: "ЕУ 2938 23", type: "tanker", axles: 3, tareKg: 7300, compartmentsLiters: [12000, 6500, 12500] },
    { id: "MM8442_23", name: "ММ 8442 23", type: "tanker", axles: 4, tareKg: 7800, compartmentsLiters: [29340] },
    { id: "MM8041_23", name: "ММ 8041 23", type: "tanker", axles: 4, tareKg: 7800, compartmentsLiters: [29310] },
    { id: "MO7958_23", name: "МО 7958 23", type: "tanker", axles: 4, tareKg: 7800, compartmentsLiters: [13000, 7000, 13000] },
    { id: "MA2567_23", name: "МА 2567 23", type: "tanker", axles: 4, tareKg: 7800, compartmentsLiters: [9000, 8000, 10000] },
    { id: "MN9545_23", name: "МН 9545 23", type: "tanker", axles: 4, tareKg: 7800, compartmentsLiters: [9000, 8000, 10000] },
    { id: "MK6187_23", name: "МК 6187 23", type: "tanker", axles: 4, tareKg: 7800, compartmentsLiters: [11000, 6000, 13000] },
    { id: "MO0310_23", name: "МО 0310 23", type: "tanker", axles: 4, tareKg: 7800, compartmentsLiters: [7500, 11000, 7500, 6000] },
    { id: "MO1891_23", name: "МО 1891 23", type: "tanker", axles: 4, tareKg: 7800, compartmentsLiters: [9000, 8000, 13000] },
    { id: "MM8413_23", name: "ММ 8413 23", type: "tanker", axles: 4, tareKg: 7800, compartmentsLiters: [29340] },
    { id: "EU9285_23", name: "ЕУ 9285 23", type: "tanker", axles: 3, tareKg: 7300, compartmentsLiters: [3000, 13850, 11750] },
    { id: "EU2937_23", name: "ЕУ 2937 23", type: "tanker", axles: 3, tareKg: 7300, compartmentsLiters: [3000, 13850, 11750] },
    { id: "MR3376_23", name: "МР 3376 23", type: "tanker", axles: 3, tareKg: 7300, compartmentsLiters: [3000, 13850, 11750] },
    { id: "MA8877_23", name: "МА 8877 23", type: "tanker", axles: 4, tareKg: 7800, compartmentsLiters: [9000, 5000, 12000] },
    { id: "MN6880_23", name: "МН 6880 23", type: "tanker", axles: 4, tareKg: 7800, compartmentsLiters: [29130] },
    { id: "EU8672_23", name: "ЕУ 8672 23", type: "tanker", axles: 4, tareKg: 7800, compartmentsLiters: [12500, 7500, 7500, 12500] },
    { id: "MM8488_23", name: "ММ 8488 23", type: "tanker", axles: 4, tareKg: 7800, compartmentsLiters: [29130] },
    { id: "MM4239_23", name: "ММ 4239 23", type: "tanker", axles: 4, tareKg: 7800, compartmentsLiters: [9000, 4000, 6000, 11000] },
    { id: "MA8880_23", name: "МА 8880 23", type: "tanker", axles: 4, tareKg: 7800, compartmentsLiters: [9000, 4000, 6000, 11000] },
    { id: "MK6180_23", name: "МК 6180 23", type: "tanker", axles: 4, tareKg: 7800, compartmentsLiters: [13500, 7500, 7500, 9350] },
    { id: "EU5123_23", name: "ЕУ 5123 23", type: "tanker", axles: 4, tareKg: 7800, compartmentsLiters: [11000, 7500, 10000] },
    { id: "MK5737_23", name: "МК 5737 23", type: "tanker", axles: 4, tareKg: 7800, compartmentsLiters: [30000] },
    { id: "ET0683_23", name: "ЕТ 0683 23", type: "tanker", axles: 3, tareKg: 7300, compartmentsLiters: [22000] },
    { id: "MO0882_23", name: "МО 0882 23", type: "tanker", axles: 4, tareKg: 7800, compartmentsLiters: [10365, 6925, 10450] },
    { id: "MA2562_23", name: "МА 2562 23", type: "tanker", axles: 4, tareKg: 7800, compartmentsLiters: [9000, 8000, 9000] },
    { id: "MU5054_23", name: "МУ 5054 23", type: "tanker", axles: 4, tareKg: 7800, compartmentsLiters: [11422, 4556, 12653] },
    { id: "MK5702_23", name: "МК 5702 23", type: "tanker", axles: 4, tareKg: 7800, compartmentsLiters: [9750, 7500, 7500, 7500] },
    { id: "EU5224_23", name: "ЕУ 5224 23", type: "tanker", axles: 4, tareKg: 7800, compartmentsLiters: [11000, 5500, 4500, 11000] },
    { id: "MM6410_23", name: "ММ 6410 23", type: "tanker", axles: 4, tareKg: 7800, compartmentsLiters: [10000, 7000, 5000, 10000] },
    { id: "ET3627_23", name: "ЕТ 3627 23", type: "tanker", axles: 4, tareKg: 7800, compartmentsLiters: [10500, 5000, 6500, 10000] },
    { id: "MA3650_23", name: "МА 3650 23", type: "tanker", axles: 4, tareKg: 7800, compartmentsLiters: [9000, 8000, 12000] }
  ];

  const {
    BASE_PRODUCTS = defaultProducts,
    BASE_TRUCKS = defaultTrucks,
    BASE_TRAILERS = defaultTrailers
  } = window.vigardData || {};

  const LS_KEYS = {
    custom: 'vigard_custom_trailers_v1',
    products: 'vigard_custom_products_v1',
    trucks: 'vigard_custom_trucks_v1',
    truckAxlesMap: 'vigard_truck_axles_map_v1',
    state: 'vigard_state_v7',
    legacyStates: ['vigard_state_v6', 'vigard_state_v5', 'vigard_state_v4']
  };

  // === Products
  function sanitizeProduct(item) {
    if (!item) return null;
    const key = (typeof item.key === 'string' && item.key.trim()) ? item.key.trim() : null;
    const label = (typeof item.label === 'string' && item.label.trim()) ? item.label.trim() : null;
    const rhoVal = num(item.rho, NaN);
    if (!key || !label || !Number.isFinite(rhoVal) || rhoVal <= 0) return null;
    return { key, label, rho: Number(rhoVal.toFixed(3)) };
  }

  function getAllProducts() {
    let custom = [];
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEYS.products) || '[]');
      if (Array.isArray(raw)) custom = raw;
    } catch (e) { }
    const baseList = Array.isArray(BASE_PRODUCTS) ? BASE_PRODUCTS : [];
    const sanitized = new Map();
    baseList.map(sanitizeProduct).filter(Boolean).forEach(item => { sanitized.set(item.key, item); });
    custom.map(sanitizeProduct).filter(Boolean).forEach(item => { sanitized.set(item.key, item); });
    return [...sanitized.values()];
  }

  function addCustomProduct(label, rho) {
    const key = ('custom_' + label).toLowerCase().replace(/\s+/g, '_').replace(/[^\wа-яё_-]/gi, '');
    const list = (() => {
      try {
        const raw = JSON.parse(localStorage.getItem(LS_KEYS.products) || '[]');
        return Array.isArray(raw) ? raw : [];
      } catch (e) { return []; }
    })();
    const existingIndex = list.findIndex(item => item.key === key);
    if (existingIndex >= 0) list.splice(existingIndex, 1);
    const normalized = { key, label, rho: Number(Number(rho).toFixed(3)) };
    list.push(normalized);
    try { localStorage.setItem(LS_KEYS.products, JSON.stringify(list)); } catch (e) { }
    return key;
  }

  // === Trucks
  function getAllTrucks() {
    let custom = [];
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEYS.trucks) || '[]');
      custom = Array.isArray(raw) ? raw : [];
    } catch (e) { custom = []; }
    return [...BASE_TRUCKS, ...custom];
  }

  function getTruckAxles(plate) {
    try {
      const map = JSON.parse(localStorage.getItem(LS_KEYS.truckAxlesMap) || '{}');
      return map[plate] || null;
    } catch (e) { return null; }
  }

  function setTruckAxles(plate, axles) {
    if (!plate) return;
    let map = {};
    try { map = JSON.parse(localStorage.getItem(LS_KEYS.truckAxlesMap) || '{}'); } catch (e) { }
    map[plate] = axles;
    localStorage.setItem(LS_KEYS.truckAxlesMap, JSON.stringify(map));
  }

  // === Trailers
  function getAllTrailers() {
    let custom = [];
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEYS.custom) || '[]');
      custom = Array.isArray(raw) ? raw : [];
    } catch (e) { custom = []; }
    return [...BASE_TRAILERS, ...custom];
  }

  function renderTrailerSelect(selectedId) {
    const selects = getTrailerSelects();
    if (!selects.length) return;
    const trailers = getAllTrailers();
    const options = trailers.map(t => ({ value: t.id, label: t.name }));
    let effective = selectedId;
    if (!effective || !trailers.some(t => t.id === effective)) {
      effective = trailers[0]?.id || '';
    }
    selects.forEach(sel => fillSelectOptions(sel, options, effective));
    app.selectedTrailerId = trailers.length ? (effective || null) : null;
  }

  function renderTractorSelect(selected) {
    const selects = getTractorSelects();
    if (!selects.length) return;
    const trucks = getAllTrucks();
    const options = trucks.map(n => ({ value: n, label: n }));
    let effective = selected;
    if (!effective || !trucks.includes(effective)) effective = trucks[0] || '';
    selects.forEach(sel => fillSelectOptions(sel, options, effective));
    app.tractorPlate = trucks.length ? (effective || '') : '';
  }

  function setTrailerInfo(t) {
    const info = $('trailerInfo'); if (!info) return;
    if (!t) { info.textContent = ''; return; }
    if (t.type === 'tanker') {
      info.innerHTML = `Тип: цистерна · Оси: ${t.axles} · Тара: ${t.tareKg || '—'} кг · Отсеки: ${t.compartmentsLiters.join(' / ')} л (∑ ${t.compartmentsLiters.reduce((a, b) => a + b, 0)} л)`;
    } else {
      info.innerHTML = `Тип: площадка · Оси: ${t.axles} · Тара: ${t.tareKg || '—'} кг · Позиции: ${t.positions || 4}`;
    }
  }

  // === Tanker table
  function densityOptionsHtml(selectedKey) {
    const list = getAllProducts();
    if (!list.length) return '<option value="">—</option>';
    return list.map(d => `<option value="${d.key}" ${d.key === selectedKey ? 'selected' : ''}>${d.label}</option>`).join('');
  }

  function buildTankRows(state) {
    const tb = $('tankBody'); if (!tb) return;
    tb.innerHTML = '';
    const thead = $('tankHeadRow');
    const single = !!app.singleCargo;
    if (thead) {
      if (single) thead.innerHTML = '<th>Отсек</th><th>Литры</th><th>Тонны</th><th>м³</th>';
      else thead.innerHTML = '<th>Отсек</th><th>Тип груза</th><th>ρ (кг/л)</th><th>Литры</th><th>Тонны</th><th>м³</th>';
    }
    const caps = state.caps || [];
    state.rows.forEach((row, idx) => {
      const tr = document.createElement('tr');
      const capText = caps[idx] ?? '—';
      const liters = isFinite(row.liters) ? row.liters : 0;
      const tons = isFinite(row.tons) ? row.tons : 0;
      const m3 = isFinite(liters) ? liters / 1000 : 0;

      if (single) {
        tr.innerHTML = `
          <td><span class="pill">#${idx + 1}</span><div class="cap">лимит ${capText} л</div></td>
          <td><input class="inpL" type="number" step="0.001" value="${liters ?? 0}"></td>
          <td><input class="inpT" type="number" step="0.001" value="${tons ?? 0}"></td>
          <td><span class="outM3">${isFinite(m3) ? m3.toFixed(3) : '0.000'}</span></td>`;
      } else {
        tr.innerHTML = `
          <td><span class="pill">#${idx + 1}</span><div class="cap">лимит ${capText} л</div></td>
          <td><select class="selType">${densityOptionsHtml(row.typeKey || 'diesel')}</select></td>
          <td><input class="inpRho" type="number" step="0.001" value="${row.rho ?? 0.84}"></td>
          <td><input class="inpL" type="number" step="0.001" value="${liters ?? 0}"></td>
          <td><input class="inpT" type="number" step="0.001" value="${tons ?? 0}"></td>
          <td><span class="outM3">${isFinite(m3) ? m3.toFixed(3) : '0.000'}</span></td>`;
      }
      tb.appendChild(tr);
      if (!single) {
        const selType = tr.querySelector('.selType');
        if (selType) selType.value = row.typeKey || 'diesel';
      }
    });
  }

  function ensureRowsMatchCaps(state) {
    if (!Array.isArray(state.caps)) state.caps = [];
    const need = state.caps.length;
    while (state.rows.length < need) state.rows.push({ typeKey: 'diesel', rho: 0.84, liters: 0, tons: 0 });
    while (state.rows.length > need) state.rows.pop();
  }

  function tankerFromPreset(compartments) {
    const caps = Array.isArray(compartments) ? compartments : [0];
    return { caps: [...caps], rows: caps.map(() => ({ typeKey: 'diesel', rho: 0.84, liters: 0, tons: 0 })) };
  }

  function applyGlobalCargoToRows() {
    if (!app.trailerState || app.trailerState.type !== 'tanker') return;
    const rows = app.trailerState.rows || [];
    rows.forEach(row => {
      row.typeKey = app.singleCargoTypeKey || row.typeKey || 'diesel';
      const rhoVal = num(app.singleCargoRho, row.rho || 0);
      row.rho = (Number.isFinite(rhoVal) && rhoVal > 0) ? rhoVal : (row.rho || 0.84);
    });
  }

  function renderSingleCargoControls() {
    setupCargoLayout();
    const products = getAllProducts();
    const hasTanker = app.trailerState?.type === 'tanker';
    const panel = $('globalCargoPanel');
    if (panel) panel.style.display = hasTanker ? 'block' : 'none';

    const mode = $('chkAllSame');
    if (mode) {
      mode.checked = !!app.singleCargo;
      mode.disabled = !hasTanker;
    }

    const typeSelect = getGlobalTypeSelect();
    if (typeSelect) {
      if (products.length) {
        typeSelect.innerHTML = products.map(p => `<option value="${p.key}">${p.label}</option>`).join('');
        if (!products.some(p => p.key === app.singleCargoTypeKey)) app.singleCargoTypeKey = products[0]?.key || '';
        if (app.singleCargoTypeKey) typeSelect.value = app.singleCargoTypeKey;
      } else {
        typeSelect.innerHTML = '<option value="">—</option>';
        typeSelect.value = '';
        app.singleCargoTypeKey = '';
      }
      typeSelect.disabled = !hasTanker || !products.length;
    }

    const product = products.find(p => p.key === app.singleCargoTypeKey);
    if (product && (!Number.isFinite(app.singleCargoRho) || app.singleCargoRho <= 0)) {
      app.singleCargoRho = product.rho;
    }
    if (!product && (!Number.isFinite(app.singleCargoRho) || app.singleCargoRho <= 0)) {
      app.singleCargoRho = NaN;
    }

    const rhoInput = getGlobalRhoInput();
    if (rhoInput) {
      if (!rhoInput.matches(':focus')) {
        rhoInput.value = (Number.isFinite(app.singleCargoRho) && app.singleCargoRho > 0) ? String(app.singleCargoRho) : '';
      }
      rhoInput.disabled = !hasTanker;
    }

    const addBtn = $('btnAddProduct');
    if (addBtn) {
      addBtn.disabled = !hasTanker;
      addBtn.textContent = '+';
      addBtn.setAttribute('aria-label', 'Добавить груз');
      addBtn.setAttribute('title', 'Добавить груз');
    }

    updateTankSectionVisibility();
  }

  // === Platform table
  function buildPlatRows(state) {
    const tb = $('platBody'); if (!tb) return;
    tb.innerHTML = '';
    const n = state.positions || 4;
    for (let i = 0; i < n; i++) {
      const tr = document.createElement('tr');
      const kgVal = num(state.masses?.[i], NaN);
      const tonsVal = Number.isFinite(kgVal) ? roundTo(kgVal / 1000, 3) : NaN;
      const valueStr = Number.isFinite(tonsVal) ? String(tonsVal) : '';
      tr.innerHTML = `<td><span class="pill">#${i + 1}</span></td><td><input class="inpMass" type="number" step="0.001" value="${valueStr}"></td>`;
      tb.appendChild(tr);
    }
  }

  // ===== State =====
  let app = {
    tractorAxles: 2,
    tractorPlate: null,
    selectedTrailerId: null,
    trailerState: null,

    distanceMode: 'manual',   // 'manual' | 'maps'
    provider: 'google',       // 'google' | 'yandex'
    distanceKm: 0,
    ratePerKm: 0,
    trips: 1,
    routeFrom: '',
    routeTo: '',
    avoidTolls: false,
    truckMode: true,
    avoidScales: false,

    singleCargo: true,
    singleCargoTypeKey: 'diesel',
    singleCargoRho: 0.84,

    lastLoadRequest: null,

    totalMassT: '',
    totalVolM3: '',

    cargoTargetT: 0,

    pendingOverflowToast: false,
    lastOverflowLiters: 0
  };

  if (app.distanceMode === 'gmaps') app.distanceMode = 'maps';

  function normalizeLoadedState(raw) {
    const normalized = { ...raw };

    normalized.singleCargo = raw.singleCargo !== false;
    const typeKey = (typeof raw.singleCargoTypeKey === 'string' && raw.singleCargoTypeKey.trim()) ? raw.singleCargoTypeKey.trim() : 'diesel';
    normalized.singleCargoTypeKey = typeKey;

    const rhoNum = Number(raw.singleCargoRho);
    normalized.singleCargoRho = (Number.isFinite(rhoNum) && rhoNum > 0) ? rhoNum : 0.84;

    const modeRaw = raw.distanceMode === 'gmaps' ? 'maps' : raw.distanceMode;
    normalized.distanceMode = modeRaw === 'maps' ? 'maps' : 'manual';
    normalized.provider = raw.provider === 'yandex' ? 'yandex' : 'google';
    normalized.avoidTolls = !!raw.avoidTolls;
    normalized.truckMode = raw.truckMode !== false;
    normalized.avoidScales = !!raw.avoidScales;

    normalized.totalMassT = (raw.totalMassT !== undefined && raw.totalMassT !== null) ? String(raw.totalMassT) : '';
    normalized.totalVolM3 = (raw.totalVolM3 !== undefined && raw.totalVolM3 !== null) ? String(raw.totalVolM3) : '';

    const targetT = num(raw.cargoTargetT, NaN);
    normalized.cargoTargetT = (Number.isFinite(targetT) && targetT >= 0) ? targetT : 0;

    const leftoverLiters = num(raw.lastOverflowLiters, NaN);
    normalized.lastOverflowLiters = (Number.isFinite(leftoverLiters) && leftoverLiters > 0) ? leftoverLiters : 0;
    normalized.pendingOverflowToast = false;

    const reqRaw = raw.lastLoadRequest;
    if (reqRaw && typeof reqRaw === 'object') {
      const liters = num(reqRaw.liters, NaN);
      const kg = num(reqRaw.kg ?? reqRaw.massKg, NaN);
      const tons = num(reqRaw.tons, NaN);
      const m3 = num(reqRaw.m3, NaN);
      const rhoVal = num(reqRaw.rho, NaN);

      normalized.lastLoadRequest = {
        source: reqRaw.source || reqRaw.kind || '',
        liters: Number.isFinite(liters) ? liters : (Number.isFinite(m3) ? m3 * 1000 : (Number.isFinite(kg) && Number.isFinite(rhoVal) && rhoVal > 0 ? kg / rhoVal : NaN)),
        kg: Number.isFinite(kg) ? kg : (Number.isFinite(tons) ? tons * 1000 : (Number.isFinite(liters) && Number.isFinite(rhoVal) && rhoVal > 0 ? liters * rhoVal : NaN)),
        tons: Number.isFinite(tons) ? tons : (Number.isFinite(kg) ? kg / 1000 : NaN),
        m3: Number.isFinite(m3) ? m3 : (Number.isFinite(liters) ? liters / 1000 : NaN),
        rho: (Number.isFinite(rhoVal) && rhoVal > 0) ? rhoVal : NaN
      };
    } else {
      normalized.lastLoadRequest = null;
    }

    if (raw.trailerState && raw.trailerState.type === 'tanker') {
      const caps = Array.isArray(raw.trailerState.caps) ? raw.trailerState.caps.map(c => num(c, 0)) : [];
      const rows = Array.isArray(raw.trailerState.rows) ? raw.trailerState.rows.map(row => {
        const tKey = (typeof row?.typeKey === 'string' && row.typeKey.trim()) ? row.typeKey.trim() : 'diesel';
        const rhoVal = num(row?.rho, NaN);
        const litersVal = Math.max(0, num(row?.liters, 0));
        const tonsRaw = num(row?.tons, NaN);
        const kgRaw = num(row?.kg, NaN);
        const tonsVal = Number.isFinite(tonsRaw) ? tonsRaw : (Number.isFinite(kgRaw) ? kgRaw / 1000 : 0);
        return {
          typeKey: tKey,
          rho: (Number.isFinite(rhoVal) && rhoVal > 0) ? rhoVal : 0.84,
          liters: litersVal,
          tons: Math.max(0, tonsVal)
        };
      }) : [];
      normalized.trailerState = { ...raw.trailerState, type: 'tanker', caps, rows };
    } else if (raw.trailerState && raw.trailerState.type === 'platform') {
      const masses = Array.isArray(raw.trailerState.masses) ? raw.trailerState.masses.map(m => Math.max(0, num(m, 0))) : [];
      normalized.trailerState = { ...raw.trailerState, type: 'platform', positions: raw.trailerState.positions || 4, masses };
    }

    return normalized;
  }

  function loadState() {
    try {
      let raw = localStorage.getItem(LS_KEYS.state);
      if (!raw && Array.isArray(LS_KEYS.legacyStates)) {
        for (const key of LS_KEYS.legacyStates) {
          if (!key) continue;
          raw = localStorage.getItem(key);
          if (raw) break;
        }
      }
      if (raw) {
        const s = JSON.parse(raw);
        if (s) app = { ...app, ...normalizeLoadedState(s) };
      }
    } catch (e) { }
  }

  function saveState() {
    try { localStorage.setItem(LS_KEYS.state, JSON.stringify(app)); } catch (e) { }
    if (Array.isArray(LS_KEYS.legacyStates)) {
      LS_KEYS.legacyStates.forEach(key => { try { localStorage.removeItem(key); } catch (e) { } });
    }
  }

  // ===== Bulk distribute helpers =====
  function getTankRows() {
    const tb = $('tankBody');
    return tb ? [...tb.querySelectorAll('tr')] : [];
  }

  function distributeByVolumeLiters(totalLiters, opts = {}) {
    if (!app.trailerState || app.trailerState.type !== 'tanker') return;
    const rawValue = (typeof totalLiters === 'number') ? totalLiters : parseFloat(totalLiters);
    if (!Number.isFinite(rawValue)) { showToast('Введите валидное значение', 'warn'); return; }
    if (rawValue < 0) { showToast('Отрицательные значения запрещены', 'warn'); return; }

    const litersRequested = Math.max(0, rawValue);
    if (litersRequested === 0) { app.lastLoadRequest = null; recalc(); return; }

    const { source = 'volume_liters', recordRequest = true } = opts;
    const rows = getTankRows();
    if (!rows.length) { app.pendingOverflowToast = false; return; }

    const single = !!app.singleCargo;
    const globalRho = num(app.singleCargoRho, NaN);
    if (single && (!Number.isFinite(globalRho) || globalRho <= 0)) {
      app.pendingOverflowToast = false;
      showToast('Введите валидную ρ', 'warn');
      return;
    }

    if (single) {
      rows.forEach(tr => {
        const litersInput = tr.querySelector('.inpL');
        const tonsInput = tr.querySelector('.inpT');
        if (litersInput) setInputValue(litersInput, 0, 3);
        if (tonsInput) setInputValue(tonsInput, 0, 3);
      });
    }

    let remainingLiters = litersRequested;
    let allocatedLiters = 0;
    let allocatedKg = 0;

    rows.forEach((tr, idx) => {
      if (remainingLiters <= 0) return;
      const litersInput = tr.querySelector('.inpL');
      const tonsInput = tr.querySelector('.inpT');

      const rho = single ? globalRho : num(tr.querySelector('.inpRho')?.value, NaN);
      const capRaw = num(app.trailerState.caps[idx], 0);
      const cap = isFinite(capRaw) ? Math.max(0, capRaw) : 0;

      const currentLiters = single ? 0 : Math.max(0, num(litersInput?.value, 0));
      const freeLiters = Math.max(0, cap - currentLiters);
      if (freeLiters <= 0) return;

      const addLiters = Math.min(remainingLiters, freeLiters);
      const newLiters = currentLiters + addLiters;

      setInputValue(litersInput, newLiters, 3);
      if (Number.isFinite(rho) && rho > 0 && tonsInput) {
        setInputValue(tonsInput, newLiters * rho / 1000, 3);
        allocatedKg += addLiters * rho;
      } else if (Number.isFinite(rho) && rho > 0) {
        allocatedKg += addLiters * rho;
      }

      allocatedLiters += addLiters;
      remainingLiters -= addLiters;
    });

    if (recordRequest) {
      const avgRho = (allocatedLiters > 0 && allocatedKg > 0) ? (allocatedKg / allocatedLiters) : (single ? globalRho : NaN);
      const rhoForRequest = (Number.isFinite(avgRho) && avgRho > 0) ? avgRho : (single ? globalRho : NaN);
      const requestKg = Number.isFinite(rhoForRequest) ? litersRequested * rhoForRequest : NaN;
      const requestTons = Number.isFinite(requestKg) ? requestKg / 1000 : NaN;
      app.lastLoadRequest = { source, liters: litersRequested, kg: requestKg, tons: requestTons, m3: litersRequested / 1000, rho: rhoForRequest };
    }

    app.pendingOverflowToast = true;
    recalc();
  }

  function distributeByMassTons(totalTons) {
    if (!app.trailerState || app.trailerState.type !== 'tanker') return;
    const rawValue = (typeof totalTons === 'number') ? totalTons : parseFloat(totalTons);
    if (!Number.isFinite(rawValue)) { showToast('Введите валидное значение', 'warn'); return; }
    if (rawValue < 0) { showToast('Отрицательные значения запрещены', 'warn'); return; }

    const tonsRequested = Math.max(0, rawValue);
    const kgRequested = tonsRequested * 1000;
    if (kgRequested <= 0) { app.lastLoadRequest = null; recalc(); return; }

    const rows = getTankRows();
    if (!rows.length) { app.pendingOverflowToast = false; return; }

    const single = !!app.singleCargo;
    const globalRho = num(app.singleCargoRho, NaN);
    if (single && (!Number.isFinite(globalRho) || globalRho <= 0)) {
      app.pendingOverflowToast = false;
      showToast('Введите валидную ρ', 'warn');
      return;
    }

    if (single) {
      rows.forEach(tr => {
        const litersInput = tr.querySelector('.inpL');
        const tonsInput = tr.querySelector('.inpT');
        if (litersInput) setInputValue(litersInput, 0, 3);
        if (tonsInput) setInputValue(tonsInput, 0, 3);
      });
    }

    let remainingKg = kgRequested;
    let allocatedKg = 0;
    let allocatedLiters = 0;

    rows.forEach((tr, idx) => {
      if (remainingKg <= 0) return;
      const litersInput = tr.querySelector('.inpL');
      const tonsInput = tr.querySelector('.inpT');
      const rho = single ? globalRho : num(tr.querySelector('.inpRho')?.value, NaN);
      if (!Number.isFinite(rho) || rho <= 0) return;

      const capRaw = num(app.trailerState.caps[idx], 0);
      const cap = isFinite(capRaw) ? Math.max(0, capRaw) : 0;

      const currentLiters = single ? 0 : Math.max(0, num(litersInput?.value, 0));
      const freeLiters = Math.max(0, cap - currentLiters);
      if (freeLiters <= 0) return;

      const freeKg = freeLiters * rho;
      if (freeKg <= 0) return;

      const addKg = Math.min(remainingKg, freeKg);
      const addLiters = addKg / rho;
      const newLiters = currentLiters + addLiters;

      setInputValue(litersInput, newLiters, 3);
      if (tonsInput) setInputValue(tonsInput, newLiters * rho / 1000, 3);

      allocatedKg += addKg;
      allocatedLiters += addLiters;
      remainingKg -= addKg;
    });

    const avgRho = (allocatedLiters > 0 && allocatedKg > 0) ? (allocatedKg / allocatedLiters) : (single ? globalRho : NaN);
    const rhoForRequest = (Number.isFinite(avgRho) && avgRho > 0) ? avgRho : (single ? globalRho : NaN);
    let requestLiters = (Number.isFinite(rhoForRequest) && rhoForRequest > 0) ? (kgRequested / rhoForRequest) : allocatedLiters;
    if (!Number.isFinite(requestLiters) || requestLiters < 0) requestLiters = allocatedLiters;

    app.lastLoadRequest = { source: 'mass_tons', liters: requestLiters, kg: kgRequested, tons: tonsRequested, m3: requestLiters / 1000, rho: rhoForRequest };
    app.pendingOverflowToast = true;
    recalc();
  }

  function fillCompartmentMax() {
    if (!app.trailerState || app.trailerState.type !== 'tanker') return;
    const rows = getTankRows();
    if (!rows.length) return;

    const single = !!app.singleCargo;
    const globalRho = num(app.singleCargoRho, NaN);
    if (single && (!Number.isFinite(globalRho) || globalRho <= 0)) {
      app.pendingOverflowToast = false;
      showToast('Введите валидную ρ', 'warn');
      return;
    }

    let totalLiters = 0;
    let totalKg = 0;

    rows.forEach((tr, idx) => {
      const litersInput = tr.querySelector('.inpL');
      const tonsInput = tr.querySelector('.inpT');
      const rho = single ? globalRho : num(tr.querySelector('.inpRho')?.value, NaN);

      const capRaw = num(app.trailerState.caps[idx], 0);
      const cap = isFinite(capRaw) ? Math.max(0, capRaw) : 0;

      setInputValue(litersInput, cap, 3);

      if (Number.isFinite(rho) && rho > 0) {
        const tonsVal = cap * rho / 1000;
        if (tonsInput) setInputValue(tonsInput, tonsVal, 3);
        totalKg += cap * rho;
      } else if (tonsInput) {
        setInputValue(tonsInput, NaN);
      }

      totalLiters += cap;
    });

    const avgRho = (totalLiters > 0 && totalKg > 0) ? (totalKg / totalLiters) : (single ? globalRho : NaN);
    const rhoForRequest = (Number.isFinite(avgRho) && avgRho > 0) ? avgRho : (single ? globalRho : NaN);
    const kgVal = Number.isFinite(rhoForRequest) ? totalLiters * rhoForRequest : NaN;

    app.lastLoadRequest = { source: 'fill_max', liters: totalLiters, kg: kgVal, tons: Number.isFinite(kgVal) ? kgVal / 1000 : NaN, m3: totalLiters / 1000, rho: rhoForRequest };
    app.pendingOverflowToast = true;
    recalc();
  }

  function clearCompartments() {
    if (!app.trailerState || app.trailerState.type !== 'tanker') return;
    app.lastLoadRequest = null;
    app.pendingOverflowToast = false;

    getTankRows().forEach(tr => {
      const l = tr.querySelector('.inpL');
      const t = tr.querySelector('.inpT');
      if (l) l.value = '';
      if (t) t.value = '';
    });

    if (Array.isArray(app.trailerState.rows)) {
      app.trailerState.rows.forEach(row => { row.liters = 0; row.tons = 0; });
    }

    recalc();
  }

  // ===== Init / Render =====
  function selectTrailer(id) {
    const all = getAllTrailers();
    if (!all.length) {
      app.selectedTrailerId = null;
      app.trailerState = null;
      app.lastLoadRequest = null;
      renderCurrent();
      saveState();
      return;
    }
    const t = all.find(x => x.id === id) || all[0];
    app.selectedTrailerId = t.id;
    app.lastLoadRequest = null;

    if (t.type === 'tanker') {
      app.trailerState = { type: 'tanker', ...tankerFromPreset(t.compartmentsLiters) };
    } else {
      app.trailerState = { type: 'platform', positions: t.positions || 4, masses: Array(t.positions || 4).fill(0) };
    }

    renderCurrent();
    saveState();
  }

  function renderCurrent() {
    setupCargoLayout();

    const trailers = getAllTrailers();
    const t = trailers.find(x => x.id === app.selectedTrailerId) || trailers[0] || null;
    if (t) app.selectedTrailerId = t.id;

    setTrailerInfo(t);
    syncAndHideTrailerPlate(t);
    renderTrailerSelect(app.selectedTrailerId);

    const trucks = getAllTrucks();
    if (!app.tractorPlate || !trucks.includes(app.tractorPlate)) app.tractorPlate = trucks[0] || '';
    renderTractorSelect(app.tractorPlate);

    const storedAx = getTruckAxles(app.tractorPlate);
    app.tractorAxles = storedAx || app.tractorAxles || 2;
    if ($('tractorAxles')) $('tractorAxles').value = String(app.tractorAxles || 2);

    const provEl = $('provider'); if (provEl) provEl.value = app.provider || 'google';

    const isMaps = (app.distanceMode === 'maps' || app.distanceMode === 'gmaps');
    if ($('distanceMode')) $('distanceMode').value = isMaps ? 'maps' : 'manual';

    if ($('distanceKm')) $('distanceKm').value = Number.isFinite(app.distanceKm) ? String(app.distanceKm) : '';
    if ($('ratePerKm')) $('ratePerKm').value = Number.isFinite(app.ratePerKm) ? String(app.ratePerKm) : '';
    if ($('trips')) $('trips').value = Number.isFinite(app.trips) ? String(app.trips) : '1';

    if ($('routeFrom')) $('routeFrom').value = app.routeFrom || '';
    if ($('routeTo')) $('routeTo').value = app.routeTo || '';

    if ($('avoidTolls')) $('avoidTolls').checked = !!app.avoidTolls;
    if ($('truckMode')) $('truckMode').checked = !!app.truckMode;
    if ($('avoidScales')) $('avoidScales').checked = !!app.avoidScales;

    if ($('gmapsRow')) $('gmapsRow').style.display = isMaps ? 'grid' : 'none';
    if ($('gmapsNote')) $('gmapsNote').style.display = isMaps ? 'block' : 'none';
    if ($('mapsNote')) $('mapsNote').style.display = isMaps ? 'block' : 'none';

    const cargoTargetEl = $('cargoTargetT');
    if (cargoTargetEl && cargoTargetEl !== document.activeElement) {
      cargoTargetEl.value = (Number.isFinite(app.cargoTargetT) && app.cargoTargetT > 0) ? String(app.cargoTargetT) : '';
    }

    const platformSection = $('platformSection');
    if (platformSection) platformSection.style.display = 'none';

    if (app.trailerState?.type === 'tanker') {
      ensureRowsMatchCaps(app.trailerState);
      if (app.singleCargo) applyGlobalCargoToRows();
      buildTankRows(app.trailerState);
    } else if (app.trailerState?.type === 'platform') {
      if (platformSection) platformSection.style.display = 'block';
      buildPlatRows(app.trailerState);
    } else {
      if ($('fitSummary')) $('fitSummary').textContent = '';
    }

    updateTankSectionVisibility();
    renderSingleCargoControls();

    recalc();
  }

  // ===== Recalc =====
  function recalc() {
    if (!app.trailerState) return;
    const tstate = app.trailerState;
    const warns = [];

    let totalLiters = 0;
    let totalKg = 0;

    // sync tractor selects
    const tractorSelects = getTractorSelects();
    if (tractorSelects.length) {
      const active = document.activeElement;
      let value = '';
      if (active && tractorSelects.includes(active)) value = active.value;
      if (!value) value = tractorSelects[0].value;
      if (value) app.tractorPlate = value;
      tractorSelects.forEach(sel => { if (sel.value !== app.tractorPlate) sel.value = app.tractorPlate; });
    }

    if (tstate.type === 'tanker') {
      const tb = $('tankBody');
      const rows = tb ? [...tb.querySelectorAll('tr')] : [];
      const active = document.activeElement;
      const single = !!app.singleCargo;
      const products = getAllProducts();
      const capsList = Array.isArray(tstate.caps) ? tstate.caps : [];
      const capacityTotal = capsList.reduce((acc, cap) => {
        const val = num(cap, NaN);
        return acc + (Number.isFinite(val) ? Math.max(0, val) : 0);
      }, 0);

      if (single && (!Number.isFinite(app.singleCargoRho) || app.singleCargoRho <= 0)) {
        warns.push('Укажите корректную плотность для общего груза (>0)');
      }

      rows.forEach((tr, i) => {
        const row = tstate.rows[i] || {};
        const litersInput = tr.querySelector('.inpL');
        const tonsInput = tr.querySelector('.inpT');
        const m3Cell = tr.querySelector('.outM3');
        const typeSelect = tr.querySelector('.selType');

        let typeKey = single ? (app.singleCargoTypeKey || row.typeKey || 'diesel') : (typeSelect?.value || row.typeKey || 'diesel');
        if (products.length && !products.some(p => p.key === typeKey)) typeKey = products[0]?.key || typeKey;
        if (!single && typeSelect && typeSelect.value !== typeKey) typeSelect.value = typeKey;

        let rho = single ? num(app.singleCargoRho, row.rho || 0.84) : num(tr.querySelector('.inpRho')?.value, row.rho || 0.84);
        if ((!Number.isFinite(rho) || rho <= 0) && !single) {
          const dict = products.find(d => d.key === typeKey);
          if (dict) {
            rho = dict.rho;
            const rhoInput = tr.querySelector('.inpRho');
            if (rhoInput) setInputValue(rhoInput, rho, 3);
          }
        }
        if (!Number.isFinite(rho) || rho <= 0) warns.push(`Отсек #${i + 1}: укажите плотность (>0)`);

        let liters = num(litersInput?.value, NaN);
        let tons = num(tonsInput?.value, NaN);
        if (!Number.isFinite(liters)) liters = 0;
        if (!Number.isFinite(tons)) tons = 0;
        if (liters < 0) { warns.push(`Отсек #${i + 1}: отрицательные литры`); liters = 0; }
        if (tons < 0) { warns.push(`Отсек #${i + 1}: отрицательная масса`); tons = 0; }

        if (Number.isFinite(rho) && rho > 0) {
          if (active === tonsInput) liters = Math.max(0, tons * 1000 / rho);
          else tons = Math.max(0, liters * rho / 1000);

          setInputValue(litersInput, liters, 3);
          setInputValue(tonsInput, tons, 3);
        } else {
          setInputValue(litersInput, liters, 3);
          setInputValue(tonsInput, tons, 3);
        }

        const m3 = liters / 1000;
        if (m3Cell) m3Cell.textContent = Number.isFinite(m3) ? roundTo(m3, 3).toFixed(3) : '0.000';

        const capRaw = num(tstate.caps[i], NaN);
        if (Number.isFinite(capRaw)) {
          const capLimit = Math.max(0, capRaw);
          if (liters > capLimit) {
            warns.push(`Переполнение отсека #${i + 1}: ${Math.round(liters).toLocaleString('ru-RU')} л > лимита ${Math.round(capLimit).toLocaleString('ru-RU')} л`);
          }
        }

        tstate.rows[i] = { typeKey, rho: (Number.isFinite(rho) && rho > 0) ? rho : 0, liters, tons };
        totalLiters += liters;
        totalKg += tons * 1000;
      });

      const totalM3 = totalLiters / 1000;
      const totalTons = totalKg / 1000;

      const req = app.lastLoadRequest;
      let leftoverLiters = 0;
      let leftoverKg = 0;
      let leftoverTons = 0;
      let leftoverM3 = 0;

      const avgRhoTotal = (totalLiters > 0 && totalKg > 0) ? (totalKg / totalLiters) : (single ? num(app.singleCargoRho, NaN) : NaN);

      if (req && Number.isFinite(req.liters)) {
        leftoverLiters = Math.max(0, req.liters - totalLiters);
        if (Number.isFinite(req.kg)) leftoverKg = Math.max(0, req.kg - totalKg);
        if ((!Number.isFinite(leftoverKg) || leftoverKg <= 0) && Number.isFinite(req.rho) && req.rho > 0) {
          leftoverKg = Math.max(0, leftoverLiters * req.rho);
        }
        if (Number.isFinite(req.tons)) leftoverTons = Math.max(0, req.tons - totalTons);
        else leftoverTons = leftoverKg / 1000;

        if (Number.isFinite(req.m3)) leftoverM3 = Math.max(0, req.m3 - totalM3);
        else leftoverM3 = leftoverLiters / 1000;

        if (req.liters > capacityTotal) {
          warns.push(`Общий объём превышает лимит цистерны: ${Math.round(req.liters).toLocaleString('ru-RU')} л > ${Math.round(capacityTotal).toLocaleString('ru-RU')} л`);
        }
      }

      const actualOverflow = Math.max(0, totalLiters - capacityTotal);
      if (actualOverflow > 0 && actualOverflow > leftoverLiters) {
        leftoverLiters = actualOverflow;
        if (Number.isFinite(avgRhoTotal) && avgRhoTotal > 0) {
          leftoverKg = leftoverLiters * avgRhoTotal;
          leftoverTons = leftoverKg / 1000;
        }
        leftoverM3 = leftoverLiters / 1000;
      }

      const sumL = $('sumL');
      const sumKg = $('sumKg');
      if (sumL) sumL.textContent = fmtL(totalLiters);
      if (sumKg) sumKg.textContent = fmtKg(totalKg);

      const totalsLine = $('totalsLine');
      if (totalsLine) {
        totalsLine.textContent =
          `Всего: ${fmtL(totalLiters)} / ${fmtKg(totalKg)} / ${fmtT2(totalTons)} / ${fmtM3_3(totalM3)} · ` +
          `Не поместилось: ${fmtL(leftoverLiters)} / ${fmtKg(leftoverKg)} / ${fmtT2(leftoverTons)} / ${fmtM3_3(leftoverM3)}`;
      }

      const fitSummary = $('fitSummary');
      if (fitSummary) {
        const parts = [];
        parts.push(`Всего: ${fmtT(totalTons)} (${fmtKg(totalKg)})`);
        parts.push(`Объём: ${fmtM3(totalM3)} (${fmtL(totalLiters)})`);
        if (leftoverLiters > 0) parts.push(`Не поместилось: ${fmtM3(leftoverM3)} (${fmtL(leftoverLiters)})`);
        fitSummary.textContent = parts.join(' · ');
      }

      if (app.pendingOverflowToast) {
        app.pendingOverflowToast = false;
        if (leftoverLiters > 0) {
          showToast(`Не поместилось: ${Math.round(leftoverLiters).toLocaleString('ru-RU')} л`, 'warn');
          app.lastOverflowLiters = leftoverLiters;
        } else {
          app.lastOverflowLiters = 0;
        }
        saveState();
      }

      // mini-brief
      const brief = $('brief');
      if (brief) {
        const tName = (() => {
          const trailers = getAllTrailers();
          const t = trailers.find(x => x.id === app.selectedTrailerId) || trailers[0] || null;
          return t ? t.name : '';
        })();

        const p = (getAllProducts().find(x => x.key === app.singleCargoTypeKey) || {}).label || '';
        const rhoText = Number.isFinite(app.singleCargoRho) ? String(app.singleCargoRho).replace('.', ',') : '';
        const lines = [];
        if (tName) lines.push(`Прицеп: ${tName}`);
        if (app.tractorPlate) lines.push(`Тягач: ${app.tractorPlate}`);
        if (p) lines.push(`Груз: ${p}`);
        if (rhoText) lines.push(`ρ: ${rhoText} кг/л`);
        lines.push(`Масса: ${fmtT2(totalTons)} (${fmtKg(totalKg)})`);
        lines.push(`Объём: ${fmtM3_3(totalM3)} (${fmtL(totalLiters)})`);
        if (leftoverLiters > 0) lines.push(`Не поместилось: ${fmtM3_3(leftoverM3)} (${fmtL(leftoverLiters)})`);
        brief.value = lines.join('\n');
      }
    }

    // ===== Platform mode =====
    if (tstate.type === 'platform') {
      const platformSection = $('platformSection');
      if (platformSection) platformSection.style.display = 'block';

      const tb = $('platBody');
      const rows = tb ? [...tb.querySelectorAll('tr')] : [];
      let totalT = 0;

      rows.forEach((tr, i) => {
        const inp = tr.querySelector('.inpMass');
        let tons = num(inp?.value, NaN);
        if (!Number.isFinite(tons)) tons = 0;
        if (tons < 0) { warns.push(`Позиция #${i + 1}: отрицательная масса`); tons = 0; }
        if (inp) setInputValue(inp, tons, 3);
        totalT += tons;
        if (Array.isArray(tstate.masses)) tstate.masses[i] = tons * 1000;
      });

      const sumKg = $('sumKg');
      const sumL = $('sumL');
      if (sumL) sumL.textContent = '—';
      if (sumKg) sumKg.textContent = fmtKg(totalT * 1000);

      const totalsLine = $('totalsLine');
      if (totalsLine) totalsLine.textContent = `Всего: ${fmtKg(totalT * 1000)} / ${fmtT2(totalT)} · Позиции: ${rows.length}`;

      const fitSummary = $('fitSummary');
      if (fitSummary) fitSummary.textContent = `Всего: ${fmtT(totalT)} (${fmtKg(totalT * 1000)})`;
    }

    // ===== Warnings =====
    const warnBox = $('warnBox');
    if (warnBox) {
      warnBox.style.display = warns.length ? 'block' : 'none';
      warnBox.innerHTML = warns.map(w => `<div>• ${w}</div>`).join('');
    }

    // ===== Delivery cost calc (if present on page) =====
    const distanceModeEl = $('distanceMode');
    const providerEl = $('provider');
    const distanceKmEl = $('distanceKm');
    const ratePerKmEl = $('ratePerKm');
    const tripsEl = $('trips');

    const costOut = $('costOut');
    const costOut2 = $('costOut2');
    const distanceOut = $('distanceOut');
    const tripsOut = $('tripsOut');

    const mode = distanceModeEl ? distanceModeEl.value : app.distanceMode;
    app.distanceMode = (mode === 'maps') ? 'maps' : 'manual';

    if (providerEl) app.provider = (providerEl.value === 'yandex') ? 'yandex' : 'google';

    let distanceValid = false, rateValid = false, tripsValid = false, costValid = false;
    let distanceText = '', rateText = '', tripsText = '', costText = '';
    let cost = 0;

    if (distanceKmEl) {
      app.distanceKm = num(distanceKmEl.value, 0);
      distanceValid = Number.isFinite(app.distanceKm) && app.distanceKm > 0;
    }
    if (ratePerKmEl) {
      app.ratePerKm = num(ratePerKmEl.value, 0);
      rateValid = Number.isFinite(app.ratePerKm) && app.ratePerKm > 0;
    }
    if (tripsEl) {
      app.trips = Math.max(1, Math.round(num(tripsEl.value, 1)));
      tripsEl.value = String(app.trips);
      tripsValid = Number.isFinite(app.trips) && app.trips > 0;
    }

    if (distanceValid) distanceText = `${app.distanceKm.toLocaleString('ru-RU')} км`;
    if (rateValid) rateText = `${app.ratePerKm.toLocaleString('ru-RU')} ₽/км`;
    if (tripsValid) tripsText = `${app.trips.toLocaleString('ru-RU')} рейс(ов)`;

    if (distanceValid && rateValid && tripsValid) {
      cost = app.distanceKm * app.ratePerKm * app.trips;
      costValid = Number.isFinite(cost) && cost >= 0;
      costText = costValid ? `${Math.round(cost).toLocaleString('ru-RU')} ₽` : '—';
    } else {
      costText = '—';
      costValid = false;
    }

    if (costOut) costOut.textContent = costText;
    if (costOut2) costOut2.textContent = costText;
    if (distanceOut) distanceOut.textContent = distanceText || '—';
    if (tripsOut) tripsOut.textContent = tripsText || '—';

    // ===== Trips by target tonnage (tonnage page) =====
    const cargoTargetEl = $('cargoTargetT');
    const tripsNeedOut = $('tripsNeedOut');
    if (cargoTargetEl) {
      const v = num(cargoTargetEl.value, NaN);
      if (Number.isFinite(v) && v >= 0) app.cargoTargetT = v;
      else if (cargoTargetEl.value === '') app.cargoTargetT = 0;

      if (tripsNeedOut) {
        const perTrip = (tstate.type === 'tanker') ? (totalKg / 1000) : (tstate.type === 'platform' ? (totalKg / 1000) : 0);
        if (app.cargoTargetT > 0 && perTrip > 0) {
          tripsNeedOut.textContent = Math.ceil(app.cargoTargetT / perTrip).toLocaleString('ru-RU');
        } else {
          tripsNeedOut.textContent = '—';
        }
      }
    }

    saveState();
  }

  // ===== Bindings =====
  function bind() {
    // trailer select
    const trailerSelects = getTrailerSelects();
    trailerSelects.forEach(sel => {
      sel.addEventListener('change', () => { selectTrailer(sel.value); });
    });

    // tractor selects
    const tractorSelects = getTractorSelects();
    tractorSelects.forEach(sel => {
      sel.addEventListener('change', () => {
        app.tractorPlate = sel.value;
        const ax = getTruckAxles(app.tractorPlate);
        if (ax && $('tractorAxles')) $('tractorAxles').value = String(ax);
        renderCurrent();
        saveState();
      });
    });

    const tractorAxlesEl = $('tractorAxles');
    if (tractorAxlesEl) {
      tractorAxlesEl.addEventListener('change', () => {
        app.tractorAxles = parseInt(tractorAxlesEl.value, 10) || 2;
        if (app.tractorPlate) setTruckAxles(app.tractorPlate, app.tractorAxles);
        recalc();
      });
    }

    // single cargo toggle
    const chk = $('chkAllSame');
    if (chk) {
      chk.addEventListener('change', () => {
        app.singleCargo = !!chk.checked;
        renderCurrent();
        saveState();
      });
    }

    const typeSelect = getGlobalTypeSelect();
    if (typeSelect) {
      typeSelect.addEventListener('change', () => {
        app.singleCargoTypeKey = typeSelect.value || '';
        const product = getAllProducts().find(p => p.key === app.singleCargoTypeKey);
        if (product) {
          app.singleCargoRho = product.rho;
          const rhoInput = getGlobalRhoInput();
          if (rhoInput) rhoInput.value = String(product.rho);
        }
        renderCurrent();
        saveState();
      });
    }

    const rhoInput = getGlobalRhoInput();
    if (rhoInput) {
      rhoInput.addEventListener('input', () => { app.singleCargoRho = num(rhoInput.value, NaN); recalc(); });
      rhoInput.addEventListener('change', () => { app.singleCargoRho = num(rhoInput.value, NaN); recalc(); saveState(); });
    }

    // buttons
    const clearBtn = $('clearAll');
    if (clearBtn) clearBtn.addEventListener('click', clearCompartments);

    const fillBtn = $('fillMax');
    if (fillBtn) fillBtn.addEventListener('click', fillCompartmentMax);

    const btnDistributeMass = $('btnDistributeMass');
    if (btnDistributeMass) {
      btnDistributeMass.addEventListener('click', () => {
        const v = $('totalMassT')?.value;
        distributeByMassTons(v);
      });
    }

    const btnDistributeM3 = $('btnDistributeM3');
    if (btnDistributeM3) {
      btnDistributeM3.addEventListener('click', () => {
        const v = $('totalVolM3')?.value;
        const liters = num(v, NaN) * 1000;
        distributeByVolumeLiters(liters, { source: 'volume_m3' });
      });
    }

    // delivery inputs
    const distanceModeEl = $('distanceMode');
    if (distanceModeEl) {
      distanceModeEl.addEventListener('change', () => {
        app.distanceMode = (distanceModeEl.value === 'maps') ? 'maps' : 'manual';
        renderCurrent();
        saveState();
      });
    }

    const providerEl = $('provider');
    if (providerEl) providerEl.addEventListener('change', () => { app.provider = (providerEl.value === 'yandex') ? 'yandex' : 'google'; saveState(); });

    const distanceKmEl = $('distanceKm');
    if (distanceKmEl) distanceKmEl.addEventListener('input', () => { recalc(); });

    const ratePerKmEl = $('ratePerKm');
    if (ratePerKmEl) ratePerKmEl.addEventListener('input', () => { recalc(); });

    const tripsEl = $('trips');
    if (tripsEl) tripsEl.addEventListener('input', () => { recalc(); });

    const avoidTolls = $('avoidTolls');
    if (avoidTolls) avoidTolls.addEventListener('change', () => { app.avoidTolls = !!avoidTolls.checked; saveState(); });

    const truckMode = $('truckMode');
    if (truckMode) truckMode.addEventListener('change', () => { app.truckMode = !!truckMode.checked; saveState(); });

    const avoidScales = $('avoidScales');
    if (avoidScales) avoidScales.addEventListener('change', () => { app.avoidScales = !!avoidScales.checked; saveState(); });

    const routeFrom = $('routeFrom');
    if (routeFrom) routeFrom.addEventListener('input', () => { app.routeFrom = routeFrom.value || ''; saveState(); });

    const routeTo = $('routeTo');
    if (routeTo) routeTo.addEventListener('input', () => { app.routeTo = routeTo.value || ''; saveState(); });

    const cargoTargetEl = $('cargoTargetT');
    if (cargoTargetEl) {
      cargoTargetEl.addEventListener('input', () => {
        const v = num(cargoTargetEl.value, NaN);
        if (Number.isFinite(v) && v >= 0) app.cargoTargetT = v;
        recalc();
      });
      cargoTargetEl.addEventListener('change', () => {
        const v = num(cargoTargetEl.value, NaN);
        if (Number.isFinite(v) && v >= 0) app.cargoTargetT = v;
        else if (cargoTargetEl.value === '') app.cargoTargetT = 0;
        recalc();
        saveState();
      });
    }

    // tanker table live inputs
    const tankBody = $('tankBody');
    if (tankBody) {
      tankBody.addEventListener('input', (e) => {
        const el = e.target;
        if (!el) return;
        if (el.classList.contains('inpL') || el.classList.contains('inpT') || el.classList.contains('inpRho')) recalc();
      });
      tankBody.addEventListener('change', (e) => {
        const el = e.target;
        if (!el) return;
        if (el.classList.contains('selType') || el.classList.contains('inpRho')) { recalc(); saveState(); }
      });
    }

    // platform table live inputs
    const platBody = $('platBody');
    if (platBody) {
      platBody.addEventListener('input', (e) => {
        const el = e.target;
        if (el && el.classList.contains('inpMass')) recalc();
      });
    }

    // product modal (if exists)
    const modal = getProductModalElement();
    const form = getProductForm();
    const nameInp = getProductNameInput();
    const rhoInp = getProductRhoInput();
    const cancelBtn = getProductCancelButton();
    const saveBtn = getProductSaveButton();
    const addBtn = $('btnAddProduct');

    function closeModal() {
      if (modal) modal.style.display = 'none';
      if (productModalKeyHandler) {
        document.removeEventListener('keydown', productModalKeyHandler);
        productModalKeyHandler = null;
      }
    }

    function openModal() {
      if (!modal) return;
      modal.style.display = 'block';
      if (nameInp) nameInp.value = '';
      if (rhoInp) rhoInp.value = '';
      if (nameInp) nameInp.focus();
      productModalKeyHandler = (ev) => { if (ev.key === 'Escape') closeModal(); };
      document.addEventListener('keydown', productModalKeyHandler);
    }

    if (addBtn) addBtn.addEventListener('click', () => { openModal(); });
    if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); closeModal(); });

    function saveProductFromModal() {
      const label = (nameInp?.value || '').trim();
      const rhoVal = num(rhoInp?.value, NaN);
      if (!label) { showToast('Введите название', 'warn'); return; }
      if (!Number.isFinite(rhoVal) || rhoVal <= 0) { showToast('Введите корректную плотность', 'warn'); return; }
      const key = addCustomProduct(label, rhoVal);
      app.singleCargoTypeKey = key;
      app.singleCargoRho = rhoVal;
      closeModal();
      renderCurrent();
      saveState();
      showToast('Груз добавлен');
    }

    if (form) {
      form.addEventListener('submit', (e) => { e.preventDefault(); saveProductFromModal(); });
    } else if (saveBtn) {
      saveBtn.addEventListener('click', () => { saveProductFromModal(); });
    }
  }

  // ===== Maps integration (optional) =====
  function maybeInitMaps() {
    // Placeholder: current build keeps UI but does not require external API keys here.
  }

  function boot() {
    loadState();
    setupCargoLayout();

    const trailers = getAllTrailers();
    if (trailers.length) {
      if (!app.selectedTrailerId || !trailers.some(t => t.id === app.selectedTrailerId)) app.selectedTrailerId = trailers[0].id;
    }

    const trucks = getAllTrucks();
    if (trucks.length) {
      if (!app.tractorPlate || !trucks.includes(app.tractorPlate)) app.tractorPlate = trucks[0];
    }

    selectTrailer(app.selectedTrailerId);
    bind();
    maybeInitMaps();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();
