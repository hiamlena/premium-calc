/* PATH: /premium/calc/app/tt-tarirovka.js */
/* TT_TARIROVKA – тарировка (мм↔л) + визуализация цистерны (premium) */

(function(){
  "use strict";
  if (window.TT_TARIROVKA) return;

  const BARRELS_BASE = "/premium/calc/data/barrels/";

  const BARREL_IDS = (Array.isArray(window.TT_TARIROVKA_BARREL_IDS) && window.TT_TARIROVKA_BARREL_IDS.length)
    ? window.TT_TARIROVKA_BARREL_IDS.map(String)
    : [
      "7958","5123","5702","0310","6410","2804","3376","3627","3769","0683",
      "2562","3650","5594","8877","5709","2566"
    ];

  const JSON_URL_FALLBACK = "/premium/calc/data/tarirovka_normalized.json"; // legacy fallback

  let DB = null;
  let LOADING = null;

  let LAST = { trailer: null, tstate: null, recalcFn: null };

  const safeText = (v) => (v === null || v === undefined) ? "" : String(v);
  const normKey  = (s) => safeText(s).toLowerCase().replace(/[^a-z0-9а-яё]+/gi, " ").trim();
  const extract4 = (s) => { const m = safeText(s).match(/(\d{4})/); return m ? m[1] : ""; };

  function num(v, def=0){
    if (typeof v === "string") v = v.replace(/\s+/g, "").replace(",", ".");
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : def;
  }

  function escapeHtml(s){
    s = safeText(s);
    return s.replace(/[&<>"']/g, (ch) => ({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      "\"":"&quot;",
      "'":"&#39;"
    })[ch]);
  }

  function pluralRu(n, one, few, many){
    n = Math.abs(Number(n) || 0);
    const n10 = n % 10;
    const n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && !(n100 >= 12 && n100 <= 14)) return few;
    return many;
  }

  function getCisternId(c){
    if (!c) return "";
    return safeText(c.cistern_id || c.id || c.code || c.name || c.title || "");
  }

  function buildIdCandidates(id){
    const raw4 = extract4(id) || "";
    if (!raw4) return [];
    const n = parseInt(raw4, 10);
    const noZero = Number.isFinite(n) ? String(n) : "";
    const pad4 = Number.isFinite(n) ? String(n).padStart(4, "0") : raw4;

    const set = [];
    const push = (x) => { if (x && !set.includes(x)) set.push(x); };

    push(raw4);
    push(pad4);
    push(noZero);
    return set;
  }

  async function fetchJson(url){
    try{
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) return null;
      return await r.json();
    }catch(e){
      return null;
    }
  }

  async function loadBarrelById(id){
    const candidates = buildIdCandidates(id);
    if (!candidates.length) return null;

    for (const cid of candidates){
      const j = await fetchJson(`${BARRELS_BASE}${cid}.json`);
      if (j) return j;
    }
    return null;
  }

  function normalizeBarrelToCistern(barrel){
    if (!barrel) return null;

    const id = extract4(barrel.id || barrel.cistern_id || barrel.code || barrel.name || "");
    const table = Array.isArray(barrel.table) ? barrel.table : null;
    const sections = Math.max(0, Number(barrel.sections) || 0);

    if (!id || !table || !table.length) return null;

    const inferred = Array.isArray(table[0]?.s) ? table[0].s.length : 0;
    const n = sections || inferred;
    if (!n) return null;

    const compartments = [];
    for (let i=0;i<n;i++){
      const compTable = [];
      for (let k=0;k<table.length;k++){
        const row = table[k];
        const mm = num(row?.mm, 0);
        const sArr = Array.isArray(row?.s) ? row.s : [];
        const l = num(sArr[i], 0);
        compTable.push({ mm, l });
      }
      compTable.sort((a,b) => (a.mm - b.mm));
      compartments.push({ table: compTable });
    }

    return {
      cistern_id: id,
      id: id,
      name: barrel.name || ("Бочка " + id),
      compartments,
      __missing: false
    };
  }

  function makeMissingCistern(id){
    const bid = extract4(id) || safeText(id);
    return {
      cistern_id: bid,
      id: bid,
      name: "Бочка " + bid,
      compartments: [],
      __missing: true
    };
  }

  function addCisternToDB(cis){
    if (!cis) return false;
    if (!DB) DB = { cisterns: [] };
    if (!Array.isArray(DB.cisterns)) DB.cisterns = [];
    const id = normKey(getCisternId(cis));
    if (!id) return false;
    if (DB.cisterns.some(x => normKey(getCisternId(x)) === id)) return false;
    DB.cisterns.unshift(cis);
    return true;
  }

  async function ensureCisternLoadedByTrailer(){
    const hint = getTrailerHintFromDom();
    const id4 = extract4(hint.id || hint.name);
    if (!id4) return null;

    await loadDB();

    const exists = (DB?.cisterns || []).find(x => normKey(getCisternId(x)) === normKey(id4));
    if (exists) return exists;

    const raw = await loadBarrelById(id4);
    const cis = normalizeBarrelToCistern(raw);
    if (!cis) return null;

    addCisternToDB(cis);
    return cis;
  }

  function totalFromCistern(c){
    if (!c || !Array.isArray(c.compartments) || !c.compartments.length) return 0;
    let sum = 0;
    for (let i=0;i<c.compartments.length;i++){
      const comp = c.compartments[i];
      if (!comp) continue;
      const table = Array.isArray(comp.table) ? comp.table : null;
      if (table && table.length){
        const last = table[table.length - 1];
        const L = num(last && last.l, 0);
        if (L > 0) { sum += L; continue; }
      }
      const maxL = num(comp.max_l, 0);
      if (maxL > 0) sum += maxL;
    }
    return Math.max(0, sum);
  }

  function getCisternLabel(c){
    const id = getCisternId(c) || "Тарировка";/* PATH: /premium/calc/app/tt-tarirovka.js */
/* TT_TARIROVKA – тарировка (мм↔л) + визуализация цистерны (premium) */

(function () {
  "use strict";
  if (window.TT_TARIROVKA) return;

  const BARRELS_BASE = "/premium/calc/data/barrels/";

  const BARREL_IDS = (Array.isArray(window.TT_TARIROVKA_BARREL_IDS) && window.TT_TARIROVKA_BARREL_IDS.length)
    ? window.TT_TARIROVKA_BARREL_IDS.map(String)
    : [
        "7958", "5123", "5702", "0310", "6410", "2804", "3376", "3627", "3769", "0683",
        "2562", "3650", "5594", "8877", "5709", "2566"
      ];

  let DB = null;
  let LOADING = null;

  const LAST = { trailer: null, tstate: null, recalcFn: null };

  // === Utils ===
  const safeText = (v) => (v === null || v === undefined ? "" : String(v));
  const normKey = (s) => safeText(s).toLowerCase().replace(/[^a-z0-9а-яё]+/gi, " ").trim();
  const extract4 = (s) => {
    const m = safeText(s).match(/(\d{4})/);
    return m ? m[1] : "";
  };

  function num(v, def = 0) {
    if (typeof v === "string") v = v.replace(/\s+/g, "").replace(",", ".");
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : def;
  }

  function escapeHtml(s) {
    s = safeText(s);
    return s.replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    })[ch]);
  }

  function pluralRu(n, one, few, many) {
    n = Math.abs(Number(n) || 0);
    const n10 = n % 10;
    const n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && !(n100 >= 12 && n100 <= 14)) return few;
    return many;
  }

  // === Cistern ID & Matching ===
  function getCisternId(c) {
    if (!c) return "";
    return safeText(c.cistern_id || c.id || c.code || c.name || "");
  }

  function buildIdCandidates(id) {
    const raw4 = extract4(id) || "";
    if (!raw4) return [];
    const n = parseInt(raw4, 10);
    const noZero = Number.isFinite(n) ? String(n) : "";
    const pad4 = Number.isFinite(n) ? String(n).padStart(4, "0") : raw4;
    return [raw4, pad4, noZero].filter((v, i, a) => v && a.indexOf(v) === i);
  }

  async function fetchJson(url) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      return r.ok ? await r.json() : null;
    } catch (e) {
      console.warn("Fetch failed:", url, e);
      return null;
    }
  }

  async function loadBarrelById(id) {
    const candidates = buildIdCandidates(id);
    for (const cid of candidates) {
      const j = await fetchJson(`${BARRELS_BASE}${cid}.json`);
      if (j) return j;
    }
    return null;
  }

  function normalizeBarrelToCistern(barrel) {
    if (!barrel) return null;
    const id = extract4(barrel.id || barrel.cistern_id || barrel.code || barrel.name || "");
    const table = Array.isArray(barrel.table) ? barrel.table : null;
    if (!id || !table || !table.length) return null;

    const sections = Math.max(0, Number(barrel.sections) || (Array.isArray(table[0]?.s) ? table[0].s.length : 0));
    if (!sections) return null;

    const compartments = [];
    for (let i = 0; i < sections; i++) {
      const compTable = table.map(row => ({
        mm: num(row?.mm, 0),
        l: num(Array.isArray(row?.s) ? row.s[i] : 0, 0)
      })).sort((a, b) => a.mm - b.mm);
      compartments.push({ table: compTable });
    }

    return {
      cistern_id: id,
      id: id,
      name: barrel.name || `Бочка ${id}`,
      compartments,
      __missing: false
    };
  }

  function makeMissingCistern(id) {
    const bid = extract4(id) || safeText(id);
    console.warn(`Тарировка для "${bid}" не найдена`);
    return {
      cistern_id: bid,
      id: bid,
      name: `Бочка ${bid}`,
      compartments: [],
      __missing: true
    };
  }

  function addCisternToDB(cis) {
    if (!cis || !DB) return false;
    const id = normKey(getCisternId(cis));
    if (!id || DB.cisterns.some(c => normKey(getCisternId(c)) === id)) return false;
    DB.cisterns.push(cis); // добавляем в конец, чтобы не нарушать порядок
    return true;
  }

  // === DB Loading ===
  async function loadDB() {
    if (DB) return DB;
    if (LOADING) return LOADING;

    LOADING = (async () => {
      const seen = new Set();
      const ids = BARREL_IDS.map(extract4).filter(id => id && !seen.has(id) && seen.add(id));

      const promises = ids.map(async id => {
        const raw = await loadBarrelById(id);
        return raw ? normalizeBarrelToCistern(raw) : makeMissingCistern(id);
      });

      const cisterns = (await Promise.allSettled(promises))
        .filter(s => s.status === "fulfilled" && s.value)
        .map(s => s.value);

      DB = { cisterns };
      return DB;
    })();

    return LOADING;
  }

  async function ensureCisternLoadedByTrailer() {
    const hint = getTrailerHintFromDom();
    const id4 = extract4(hint.id || hint.name);
    if (!id4) return null;

    await loadDB();
    let cis = DB.cisterns.find(c => normKey(getCisternId(c)) === normKey(id4));
    if (cis) return cis;

    const raw = await loadBarrelById(id4);
    cis = normalizeBarrelToCistern(raw);
    if (cis) addCisternToDB(cis);
    return cis || makeMissingCistern(id4);
  }

  // === Interpolation ===
  function mmToLiters(table, mm) {
    mm = Math.max(0, num(mm));
    if (!Array.isArray(table) || !table.length) return 0;

    const first = table[0];
    if (mm <= num(first?.mm, 0)) return num(first?.l, 0);

    const last = table[table.length - 1];
    if (mm >= num(last?.mm, 0)) return num(last?.l, 0);

    let lo = 0, hi = table.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (num(table[mid]?.mm, 0) <= mm) lo = mid;
      else hi = mid;
    }
    const a = table[lo], b = table[hi];
    const t = (mm - num(a?.mm, 0)) / (num(b?.mm, 0) - num(a?.mm, 0));
    return num(a?.l, 0) + (num(b?.l, 0) - num(a?.l, 0)) * t;
  }

  function litersToMm(table, liters) {
    liters = Math.max(0, num(liters));
    if (!Array.isArray(table) || !table.length) return 0;

    const first = table[0];
    if (liters <= num(first?.l, 0)) return num(first?.mm, 0);

    const last = table[table.length - 1];
    if (liters >= num(last?.l, 0)) return num(last?.mm, 0);

    let lo = 0, hi = table.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (num(table[mid]?.l, 0) <= liters) lo = mid;
      else hi = mid;
    }
    const a = table[lo], b = table[hi];
    const t = (liters - num(a?.l, 0)) / (num(b?.l, 0) - num(a?.l, 0));
    return num(a?.mm, 0) + (num(b?.mm, 0) - num(a?.mm, 0)) * t;
  }

  // === DOM & UI ===
  function ui() {
    const box = document.getElementById("ttTarirovkaBox");
    const sel = document.getElementById("ttCisternSelect");
    const btn = document.getElementById("ttCisternAuto");
    const meta = document.getElementById("ttCisternMeta");
    const svg = document.getElementById("ttTankSvg");
    const grid = document.getElementById("ttMmGrid");
    if (!box || !svg) return null;
    return { box, sel, btn, meta, svg, grid };
  }

  function getLitersInputs() {
    const tb = document.getElementById("tankBody");
    return tb ? Array.from(tb.querySelectorAll(".inpL")) : [];
  }

  function getTrailerSelectEl() {
    return document.getElementById("trailerSelect") || document.getElementById("trailer") || null;
  }

  function getTrailerHintFromDom() {
    const sel = getTrailerSelectEl();
    if (!sel) return { id: "", name: "" };
    const id = safeText(sel.value);
    const opt = sel.options?.[sel.selectedIndex] || null;
    const name = safeText(opt?.textContent || "");
    return { id, name };
  }

  function fillSelect(sel, cisterns, selectedId) {
    const prev = selectedId || sel.value || "";
    const opts = ['<option value="">—</option>'];
    (cisterns || []).forEach(c => {
      const val = escapeHtml(getCisternId(c));
      const label = escapeHtml(getCisternLabel(c));
      const dis = c?.__missing ? " disabled" : "";
      opts.push(`<option value="${val}"${dis}>${label}</option>`);
    });
    sel.innerHTML = opts.join("");
    if (prev) sel.value = prev;
  }

  function getCisternLabel(c) {
    if (!c) return "Тарировка";
    if (c.__missing) return `${getCisternId(c)} · нет файла`;

    const id = getCisternId(c);
    const comps = c.compartments?.length || 0;
    const total = Math.round(totalFromCistern(c) || 0);
    const parts = [id];
    if (comps) parts.push(`${comps} ${pluralRu(comps, "отсек", "отсека", "отсеков")}`);
    if (total) parts.push(`∑ ${total.toLocaleString("ru-RU")} л`);
    return parts.join(" · ");
  }

  function totalFromCistern(c) {
    if (!c?.compartments?.length) return 0;
    return c.compartments.reduce((sum, comp) => {
      const table = comp?.table;
      const L = table?.length ? num(table[table.length - 1].l, 0) : num(comp.max_l, 0);
      return sum + Math.max(0, L);
    }, 0);
  }

  function findCisternStrict(cisterns, trailerLike, tstate) {
    const tid = safeText(trailerLike?.id || "");
    const tname = safeText(trailerLike?.name || "");
    const nkTid = normKey(tid);
    const nkTname = normKey(tname);
    const d4 = extract4(tid || tname);
    const needN = tstate?.caps?.length || 0;

    const candidates = cisterns.filter(c => !c.__missing);
    if (nkTid || nkTname) {
      const byId = candidates.find(c => normKey(getCisternId(c)) === (nkTid || nkTname));
      if (byId && (!needN || byId.compartments.length === needN)) return byId;
    }
    if (d4) {
      const by4 = candidates.find(c => getCisternId(c).includes(d4));
      if (by4 && (!needN || by4.compartments.length === needN)) return by4;
    }
    return candidates[0] || null;
  }

  function resolveCistern(u, list, tstate, source) {
    if (!u) return null;

    if (source === "cistern") {
      const val = u.sel.value;
      return val ? list.find(c => normKey(getCisternId(c)) === normKey(val)) : null;
    }

    const trailerLike = getTrailerHintFromDom();
    return findCisternStrict(list, trailerLike, tstate);
  }

  // === UI Building ===
  function buildMmInputs(grid, n) {
    grid.innerHTML = "";
    grid.style.gridTemplateColumns = `repeat(${Math.min(3, n)}, 1fr)`;
    for (let i = 1; i <= n; i++) {
      const div = document.createElement("div");
      div.className = "field";
      div.innerHTML = `
        <label for="ttMm${i}">Уровень, мм · Отсек ${i}</label>
        <input id="ttMm${i}" type="text" inputmode="decimal" placeholder="1200"/>
      `;
      grid.appendChild(div);
    }
  }

  function buildSvg(svg, n, cis) {
    const W = 1200, padX = 56;
    const y = 78, h = 148;
    const innerW = W - padX * 2;
    const innerPad = 10;
    const x0 = padX + innerPad;
    const y0 = y + innerPad;
    const h0 = h - innerPad * 2;
    const w0 = innerW - innerPad * 2;
    const segW = w0 / n;
    const bulge = Math.max(10, Math.min(26, Math.round(h0 * 0.18)));

    const defs = `<defs>
      <linearGradient id="ttTankShellGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(255,255,255,.14)"/>
        <stop offset="55%" stop-color="rgba(255,255,255,.05)"/>
        <stop offset="100%" stop-color="rgba(0,0,0,.10)"/>
      </linearGradient>
      <linearGradient id="ttLiquidGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(170,200,220,.92)"/>
        <stop offset="55%" stop-color="rgba(120,160,190,.78)"/>
        <stop offset="100%" stop-color="rgba(90,130,165,.70)"/>
      </linearGradient>
      <filter id="ttSoftShadow" x="-20%" y="-40%" width="140%" height="180%">
        <feDropShadow dx="0" dy="7" stdDeviation="7" flood-color="rgba(0,0,0,.42)"/>
      </filter>
      <clipPath id="ttTankInnerClip">
        <rect x="${x0}" y="${y0}" width="${w0}" height="${h0}" rx="10"/>
      </clipPath>
    </defs>`;

    let parts = [defs];
    parts.push(`<g filter="url(#ttSoftShadow)">
      <rect x="${padX}" y="${y}" width="${innerW}" height="${h}" rx="74" fill="url(#ttTankShellGrad)"/>
    </g>`);

    for (let i = 0; i < n; i++) {
      const cx = x0 + segW * i;
      parts.push(`<clipPath id="ttCompClip${i+1}"><rect x="${cx}" y="${y0}" width="${segW}" height="${h0}"/></clipPath>`);
      parts.push(`<g clip-path="url(#ttCompClip${i+1})">
        <rect id="ttFill${i+1}" x="${cx}" y="${y0}" width="${segW}" height="${h0}" fill="url(#ttLiquidGrad)"/>
        <rect id="ttMen${i+1}" x="${cx}" y="${y0}" width="${segW}" height="2" fill="rgba(255,255,255,.22)" opacity="0"/>
      </g>`);
    }

    parts.push(`<g clip-path="url(#ttTankInnerClip)">
      <rect x="${x0}" y="${y0}" width="${w0}" height="${h0}" fill="rgba(255,255,255,.05)" stroke="rgba(255,255,255,.1)"/>
    </g>`);

    for (let i = 1; i < n; i++) {
      const x = x0 + segW * i;
      const bx = x + (i % 2 === 0 ? -1 : 1) * bulge;
      parts.push(`<path d="M ${x} ${y0+8} Q ${bx} ${y0+h0/2} ${x} ${y0+h0-8}" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="2"/>`);
    }

    const topY = y - 26, subY = y - 8;
    for (let i = 0; i < n; i++) {
      const x = x0 + segW * i + 8;
      parts.push(`<text x="${x}" y="${topY}" fill="#eef1f6" font-size="14" font-weight="800">Отсек ${i+1}</text>`);
      parts.push(`<text id="ttCap${i+1}" x="${x}" y="${subY}" fill="#eef1f6aa" font-size="12">`);
    }

    svg.setAttribute("viewBox", `0 0 ${W} 310`);
    svg.innerHTML = parts.join("");

    for (let i = 1; i <= n; i++) {
      const el = svg.querySelector(`#ttCap${i}`);
      if (el) el.textContent = capLabelFromCistern(cis, i - 1);
    }
    for (let i = 1; i <= n; i++) {
      const el = svg.querySelector(`#ttFill${i}`);
      if (el) applyFillToEl(el, 0);
    }
  }

  // === Animation ===
  function applyFillToEl(el, p) {
    const x = num(el.getAttribute("x"), 0);
    const y0 = num(el.getAttribute("y"), 0);
    const h0 = num(el.getAttribute("height"), 0);
    const ty = (1 - Math.max(0, Math.min(1, p))) * h0;
    el.style.transform = `translateY(${ty}px)`;
    el.__tt_p = p;

    const men = el.ownerSVGElement?.querySelector(`#ttMen${el.id.slice(-1)}`);
    if (men) {
      men.style.opacity = p > 0.01 ? "1" : "0";
      men.setAttribute("y", y0 + ty);
    }
  }

  function setFill(svg, idx, percent, opts = {}) {
    const el = svg.querySelector(`#ttFill${idx}`);
    if (!el) return;

    const target = Math.max(0, Math.min(1, num(percent, 0)));
    const cur = Number.isFinite(el.__tt_p) ? el.__tt_p : 0;
    const animate = opts.animate !== false;
    const duration = num(opts.duration, 420);

    if (!animate || Math.abs(target - cur) < 0.002) return applyFillToEl(el, target);

    if (el.__tt_raf) cancelAnimationFrame(el.__tt_raf);
    const start = performance.now();
    const step = now => {
      const t = Math.min(1, (now - start) / duration);
      const k = t * t * t * (t * (t * 6 - 15) + 10);
      const p = cur + (target - cur) * k;
      applyFillToEl(el, p);
      if (t < 1) el.__tt_raf = requestAnimationFrame(step);
      else applyFillToEl(el, target);
    };
    el.__tt_raf = requestAnimationFrame(step);
  }

  // === Sync ===
  function scheduleSyncOnce(tstate) {
    const svg = document.getElementById("ttTankSvg");
    if (!svg) return;
    if (svg.__tt_raf) cancelAnimationFrame(svg.__tt_raf);
    svg.__tt_raf = requestAnimationFrame(() => {
      svg.__tt_raf = 0;
      syncAfterRecalc(tstate);
    });
  }

  function syncMmFromLiters(cis) {
    if (!cis || cis.__missing) return;
    const inputsL = getLitersInputs();
    inputsL.forEach((inp, i) => {
      const mmInp = document.getElementById(`ttMm${i+1}`);
      if (!mmInp || mmInp.matches(":focus")) return;
      const table = cis.compartments?.[i]?.table;
      if (!table) return;
      const mm = mmToLiters(table, num(inp.value, 0));
      mmInp.value = Math.round(mm);
    });
  }

  function syncVisualFromLiters(cis, caps) {
    const u = ui(); if (!u) return;
    const inputsL = getLitersInputs();
    inputsL.forEach((inp, i) => {
      const liters = num(inp.value, 0);
      let p = 0;
      if (cis && !cis.__missing && cis.compartments?.[i]?.table) {
        const table = cis.compartments[i].table;
        const mm = litersToMm(table, liters);
        const maxMm = table[table.length - 1]?.mm || 1;
        p = mm / maxMm;
      } else if (caps?.[i]) {
        p = liters / num(caps[i], 1);
      }
      setFill(u.svg, i + 1, p, { animate: true });
    });
  }

  function syncAfterRecalc(tstate) {
    if (!tstate || tstate.type !== "tanker") return;
    const u = ui();
    if (!u) return;

    loadDB().then(async () => {
      await ensureCisternLoadedByTrailer();
      const list = DB?.cisterns || [];
      fillSelect(u.sel, list, u.sel.value);

      const cis = resolveCistern(u, list, tstate, "auto");
      ensureUiCounts(u, cis, tstate);
      updateMeta(u, cis, tstate);
      syncMmFromLiters(cis);
      syncVisualFromLiters(cis, tstate.caps);
    });
  }

  // === Init ===
  function ensureUiCounts(u, cis, tstate) {
    const n = Math.max(1, computeN(cis, tstate));
    const currentN = u.grid.querySelectorAll("input").length;
    if (n !== currentN) {
      buildSvg(u.svg, n, cis);
      buildMmInputs(u.grid, n);
    } else {
      for (let i = 1; i <= n; i++) {
        const el = u.svg.querySelector(`#ttCap${i}`);
        if (el) el.textContent = capLabelFromCistern(cis, i - 1);
      }
    }
  }

  function computeN(cis, tstate) {
    if (cis && !cis.__missing && cis.compartments?.length) return cis.compartments.length;
    if (tstate?.caps?.length) return tstate.caps.length;
    return Math.max(1, getLitersInputs().length);
  }

  function updateMeta(u, cis, tstate) {
    if (!u) return;
    if (cis?.__missing) {
      u.meta.textContent = `⚠️ ${getCisternId(cis)}: нет тарировки`;
      u.meta.style.color = "#ff6b6b";
      return;
    }
    u.meta.textContent = cis ? getCisternLabel(cis) : `Нет данных — ${tstate?.caps?.length || 0} отсеков`;
    u.meta.style.color = "";
  }

  function capLabelFromCistern(cis, i) {
    if (!cis?.compartments?.[i]) return "";
    const c = cis.compartments[i];
    const table = c.table;
    const maxL = table?.length ? num(table[table.length - 1].l, 0) : num(c.max_l, 0);
    const maxMm = table?.length ? num(table[table.length - 1].mm, 0) : 0;
    const parts = [];
    if (maxL) parts.push(`${Math.round(maxL).toLocaleString("ru-RU")} л`);
    if (maxMm) parts.push(`${Math.round(maxMm).toLocaleString("ru-RU")} мм`);
    return parts.join(" · ");
  }

  // === Events (Delegated) ===
  function bindEvents(tstate, recalcFn) {
    const u = ui();
    if (!u) return;

    // Auto-pick
    u.btn.addEventListener("click", async () => {
      const cis = await ensureCisternLoadedByTrailer();
      if (cis && !cis.__missing) {
        u.sel.value = getCisternId(cis);
        setTrailerSelectToMatchCistern(cis);
      }
      scheduleSyncOnce(tstate);
    });

    // Cistern select
    u.sel.addEventListener("change", () => scheduleSyncOnce(tstate));

    // Trailer select (delegated via change)
    getTrailerSelectEl()?.addEventListener("change", () => scheduleSyncOnce(tstate));

    // Buttons
    ["fillMax", "clearAll", "btnDistributeMass", "btnDistributeM3"].forEach(id => {
      const el = document.getElementById(id);
      el?.addEventListener("click", () => scheduleSyncOnce(tstate));
    });

    // Inputs
    document.addEventListener("input", (e) => {
      const inp = e.target;
      if (inp.classList.contains("inpL") || inp.id.startsWith("ttMm")) {
        scheduleSyncOnce(tstate);
      }
    });
  }

  async function render(trailer, tstate, recalcFn) {
    const u = ui();
    if (!u) return;

    LAST.trailer = trailer;
    LAST.tstate = tstate;
    LAST.recalcFn = recalcFn;

    if (!tstate || tstate.type !== "tanker") {
      u.box.style.display = "none";
      return;
    }
    u.box.style.display = "block";

    await loadDB();
    await ensureCisternLoadedByTrailer();

    const list = DB?.cisterns || [];
    fillSelect(u.sel, list, u.sel.value);

    const cis = resolveCistern(u, list, tstate, "auto");
    ensureUiCounts(u, cis, tstate);
    updateMeta(u, cis, tstate);

    bindEvents(tstate, recalcFn);
    syncMmFromLiters(cis);
    syncVisualFromLiters(cis, tstate.caps);
  }

  window.TT_TARIROVKA = { load: loadDB, render, syncAfterRecalc, mmToLiters, litersToMm };
})();

    if (c && c.__missing) return `${id} · нет файла`;

    const comps = Array.isArray(c?.compartments) ? c.compartments.length : 0;
    const total = totalFromCistern(c);

    const compsText = comps ? `${comps} ${pluralRu(comps, "отсек", "отсека", "отсеков")}` : "";
    const totalText = total ? `∑ ${Math.round(total).toLocaleString("ru-RU")} л` : "";

    const parts = [id];
    if (compsText) parts.push(compsText);
    if (totalText) parts.push(totalText);
    return parts.join(" · ");
  }

  async function loadDB(){
    if (DB) return DB;
    if (LOADING) return LOADING;

    LOADING = (async () => {
      const uniq = [];
      const seen = new Set();
      for (const raw of BARREL_IDS){
        const id = extract4(raw);
        if (!id) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        uniq.push(id);
      }

      const settled = await Promise.allSettled(
        uniq.map(async (id) => {
          const raw = await loadBarrelById(id);
          const cis = normalizeBarrelToCistern(raw);
          return cis || makeMissingCistern(id);
        })
      );

      const cisterns = [];
      for (const s of settled){
        if (s.status !== "fulfilled") continue;
        const cis = s.value;
        if (!cis) continue;
        cisterns.push(cis);
      }

      DB = { cisterns };
      return DB;
    })();

    return LOADING;
  }

  // ===== interpolation =====

  function mmToLiters(table, mm){
    mm = Math.max(0, num(mm, 0));
    if (!Array.isArray(table) || !table.length) return 0;

    const mm0 = num(table[0]?.mm, 0);
    const l0 = num(table[0]?.l, 0);
    if (mm <= mm0) return l0;

    const last = table[table.length - 1];
    const mmL = num(last?.mm, 0);
    const lL = num(last?.l, 0);
    if (mm >= mmL) return lL;

    let lo = 0, hi = table.length - 1;
    while (hi - lo > 1){
      const mid = (lo + hi) >> 1;
      if (num(table[mid]?.mm, 0) <= mm) lo = mid;
      else hi = mid;
    }
    const a = table[lo], b = table[hi];
    const amm = num(a?.mm, 0), bmm = num(b?.mm, 0);
    const al = num(a?.l, 0), bl = num(b?.l, 0);
    const denom = (bmm - amm);
    if (!denom) return al;
    const t = (mm - amm) / denom;
    return al + (bl - al) * t;
  }

  function litersToMm(table, liters){
    liters = Math.max(0, num(liters, 0));
    if (!Array.isArray(table) || !table.length) return 0;

    const l0 = num(table[0]?.l, 0);
    const mm0 = num(table[0]?.mm, 0);
    if (liters <= l0) return mm0;

    const last = table[table.length - 1];
    const lL = num(last?.l, 0);
    const mmL = num(last?.mm, 0);
    if (liters >= lL) return mmL;

    let lo = 0, hi = table.length - 1;
    while (hi - lo > 1){
      const mid = (lo + hi) >> 1;
      if (num(table[mid]?.l, 0) <= liters) lo = mid;
      else hi = mid;
    }
    const a = table[lo], b = table[hi];
    const al = num(a?.l, 0), bl = num(b?.l, 0);
    const amm = num(a?.mm, 0), bmm = num(b?.mm, 0);
    const denom = (bl - al);
    if (!denom) return amm;
    const t = (liters - al) / denom;
    return amm + (bmm - amm) * t;
  }

  // ===== DOM helpers =====

  function ui(){
    const box  = document.getElementById("ttTarirovkaBox");
    const sel  = document.getElementById("ttCisternSelect");
    const btn  = document.getElementById("ttCisternAuto");
    const meta = document.getElementById("ttCisternMeta");
    const svg  = document.getElementById("ttTankSvg");
    const grid = document.getElementById("ttMmGrid");
    if (!box || !svg) return null;
    return { box, sel, btn, meta, svg, grid };
  }

  function getLitersInputs(){
    const tb = document.getElementById("tankBody");
    if (!tb) return [];
    return Array.from(tb.querySelectorAll(".inpL"));
  }

  function getTrailerSelectEl(){
    return document.getElementById("trailerSelect") || document.getElementById("trailer") || null;
  }

  function getTrailerHintFromDom(){
    const sel = getTrailerSelectEl();
    if (!sel) return { id: "", name: "" };
    const id = safeText(sel.value || "");
    const opt = sel.options && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null;
    const name = safeText(opt ? (opt.textContent || "") : "");
    return { id, name };
  }

  function fillSelect(sel, cisterns, selectedId){
    const prev = selectedId || sel.value || "";
    const opts = ['<option value="">—</option>'];
    for (const c of (cisterns || [])){
      const val = escapeHtml(getCisternId(c));
      const label = escapeHtml(getCisternLabel(c));
      const dis = (c && c.__missing) ? " disabled" : "";
      opts.push(`<option value="${val}"${dis}>${label}</option>`);
    }
    sel.innerHTML = opts.join("");
    if (prev) sel.value = prev;
  }

  function pickBestByCompartments(candidates, needN){
    if (!Array.isArray(candidates) || !candidates.length) return null;
    if (!needN) return candidates[0] || null;
    const exact = candidates.find(c => !c.__missing && Array.isArray(c?.compartments) && c.compartments.length === needN);
    if (exact) return exact;
    const firstOk = candidates.find(c => !c.__missing);
    return firstOk || candidates[0] || null;
  }

  function findCisternStrict(cisterns, trailerLike, tstate){
    if (!Array.isArray(cisterns) || !cisterns.length) return null;

    const tid = safeText(trailerLike?.id || "");
    const tname = safeText(trailerLike?.name || "");
    const nkTid = normKey(tid);
    const nkTname = normKey(tname);
    const d4 = extract4(tid || tname);
    const needN = (tstate && Array.isArray(tstate.caps) && tstate.caps.length) ? tstate.caps.length : 0;

    let candidates = [];

    if (nkTid || nkTname){
      candidates = cisterns.filter(c => {
        if (c && c.__missing) return false;
        const nk = normKey(getCisternId(c));
        return (nk && (nk === nkTid || nk === nkTname));
      });
      if (candidates.length) return pickBestByCompartments(candidates, needN);
    }

    if (d4){
      candidates = cisterns.filter(c => {
        if (c && c.__missing) return false;
        return safeText(getCisternId(c)).includes(d4);
      });
      if (candidates.length) return pickBestByCompartments(candidates, needN);
    }

    if (nkTid || nkTname){
      const hint = (nkTid + " " + nkTname).trim();
      candidates = cisterns.filter(c => {
        if (c && c.__missing) return false;
        const nk = normKey(getCisternId(c));
        if (!nk) return false;
        return (hint.includes(nk) || nk.includes(hint));
      });
      if (candidates.length) return pickBestByCompartments(candidates, needN);
    }

    return null;
  }

  function findTrailerOptionForCistern(cis){
    const ts = getTrailerSelectEl();
    if (!ts || !cis || cis.__missing) return null;

    const cid = getCisternId(cis);
    const nkCid = normKey(cid);
    const d4 = extract4(cid);

    const opts = Array.from(ts.options || []);

    let opt = opts.find(o => normKey(o.value || "") === nkCid);
    if (opt) return opt;

    opt = opts.find(o => normKey(o.textContent || "") === nkCid);
    if (opt) return opt;

    if (d4){
      opt = opts.find(o => safeText(o.value || o.textContent || "").includes(d4));
      if (opt) return opt;
    }

    opt = opts.find(o => {
      const t = normKey(o.textContent || "");
      const v = normKey(o.value || "");
      return (t && nkCid.includes(t)) || (t && t.includes(nkCid)) || (v && nkCid.includes(v)) || (v && v.includes(nkCid));
    });
    if (opt) return opt;

    return null;
  }

  function setTrailerSelectToMatchCistern(cis){
    const ts = getTrailerSelectEl();
    if (!ts || !cis || cis.__missing) return false;

    const opt = findTrailerOptionForCistern(cis);
    if (!opt) return false;

    const newVal = safeText(opt.value || "");
    if (!newVal) return false;

    if (ts.value !== newVal){
      ts.value = newVal;
      try{
        ts.dispatchEvent(new Event("change", { bubbles: true }));
      }catch(e){
        try{
          const ev = document.createEvent("Event");
          ev.initEvent("change", true, true);
          ts.dispatchEvent(ev);
        }catch(e2){}
      }
      return true;
    }
    return true;
  }

  // ===== selection resolving =====

  function findCisternBySelectValue(list, selectValue){
    const v = normKey(selectValue);
    if (!v) return null;
    return (list || []).find(c => normKey(getCisternId(c)) === v) || null;
  }

  function resolveCistern(u, list, tstate, source){
    if (!u) return null;

    if (source === "cistern"){
      const picked = findCisternBySelectValue(list, u.sel.value);
      return picked;
    }

    if (source === "auto"){
      const picked = findCisternBySelectValue(list, u.sel.value);
      if (picked) return picked;
    }

    const trailerLike = getTrailerHintFromDom();
    const cis = findCisternStrict(list, trailerLike, tstate);
    if (cis){
      u.sel.value = getCisternId(cis);
      return cis;
    }

    if (source === "trailer") u.sel.value = "";
    return null;
  }

  // ===== UI build =====

  function buildMmInputs(grid, n){
    grid.innerHTML = "";
    grid.style.gridTemplateColumns = `repeat(${Math.min(3, n)}, minmax(0,1fr))`;
    for (let i=1;i<=n;i++){
      const wrap = document.createElement("div");
      wrap.className = "field";
      wrap.innerHTML = `
        <label for="ttMm${i}">Уровень, мм · Отсек ${i}</label>
        <input id="ttMm${i}" type="text" inputmode="decimal" autocomplete="off" placeholder="например 1200"/>
      `;
      grid.appendChild(wrap);
    }
  }

  function computeWeightsFromCistern(cis, n){
    if (cis && !cis.__missing && Array.isArray(cis.compartments) && cis.compartments.length === n){
      const w = cis.compartments.map(c => {
        const table = Array.isArray(c?.table) ? c.table : null;
        if (table && table.length){
          const last = table[table.length - 1];
          const L = num(last && last.l, 0);
          if (L > 0) return L;
        }
        return num(c?.max_l, 0);
      });
      const sum = w.reduce((a,b)=>a+Math.max(0,num(b,0)),0);
      if (sum > 0) return w;
    }
    return new Array(n).fill(1);
  }

  function capLabelFromCistern(cis, i){
    if (!cis || cis.__missing || !Array.isArray(cis.compartments) || !cis.compartments[i]) return "";
    const c = cis.compartments[i];
    const table = Array.isArray(c.table) ? c.table : null;
    const maxL = (table && table.length) ? num(table[table.length - 1].l, 0) : num(c.max_l, 0);
    const maxMm = (table && table.length) ? num(table[table.length - 1].mm, 0) : 0;
    const parts = [];
    if (maxL) parts.push(`${Math.round(maxL).toLocaleString("ru-RU")} л`);
    if (maxMm) parts.push(`${Math.round(maxMm).toLocaleString("ru-RU")} мм`);
    return parts.join(" · ");
  }

  function normalizeWidths(widths, innerW, n){
    widths = widths.map(w => Math.max(1, Math.round(num(w, 0))));
    let sum = widths.reduce((a,b)=>a+b,0);
    if (!sum){
      const base = Math.floor(innerW / n);
      widths = new Array(n).fill(base);
      widths[n-1] += innerW - widths.reduce((a,b)=>a+b,0);
      return widths;
    }

    widths = widths.map(w => Math.max(1, Math.round(w * (innerW / sum))));
    let diff = innerW - widths.reduce((a,b)=>a+b,0);
    if (diff) widths[widths.length-1] += diff;

    // мягкая минималка, чтобы не убивать пропорции
    let minW = Math.max(34, Math.floor(innerW / (n * 6)));
    minW = Math.min(minW, Math.floor(innerW / n));

    let deficit = 0;
    for (let i=0;i<n;i++){
      if (widths[i] < minW){
        deficit += (minW - widths[i]);
        widths[i] = minW;
      }
    }
    if (deficit > 0){
      const order = widths.map((w,i)=>({w,i})).sort((a,b)=>b.w-a.w);
      for (let k=0;k<order.length && deficit>0;k++){
        const i = order[k].i;
        const canTake = Math.max(0, widths[i] - minW);
        const take = Math.min(canTake, deficit);
        widths[i] -= take;
        deficit -= take;
      }
    }

    diff = innerW - widths.reduce((a,b)=>a+b,0);
    if (diff) widths[widths.length-1] += diff;

    return widths;
  }

  // ===== VISUAL: капсула + дуги =====

  function buildSvg(svg, n, cis){
    const W = 1200;
    const padX = 56;

    const y = 78;
    const h = 148;

    const innerW = W - padX * 2;

    const shellRx = Math.round(h / 2);
    const innerPad = 10;

    const x0 = padX + innerPad;
    const y0 = y + innerPad;
    const h0 = h - innerPad * 2;
    const w0 = innerW - innerPad * 2;

    // равные секции (как схема)
    const segW = w0 / n;

    const bulge = Math.max(10, Math.min(26, Math.round(h0 * 0.18)));

    const defs = `
      <defs>
        <linearGradient id="ttTankShellGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(255,255,255,.14)"/>
          <stop offset="55%" stop-color="rgba(255,255,255,.05)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,.10)"/>
        </linearGradient>

        <linearGradient id="ttLiquidGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(170,200,220,.92)"/>
          <stop offset="55%" stop-color="rgba(120,160,190,.78)"/>
          <stop offset="100%" stop-color="rgba(90,130,165,.70)"/>
        </linearGradient>

        <linearGradient id="ttGlassGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="rgba(255,255,255,.16)"/>
          <stop offset="30%" stop-color="rgba(255,255,255,.05)"/>
          <stop offset="70%" stop-color="rgba(255,255,255,.02)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,.05)"/>
        </linearGradient>

        <filter id="ttSoftShadow" x="-20%" y="-40%" width="140%" height="180%">
          <feDropShadow dx="0" dy="7" stdDeviation="7" flood-color="rgba(0,0,0,.42)"/>
        </filter>

        <clipPath id="ttTankInnerClip">
          <rect x="${x0}" y="${y0}" width="${w0}" height="${h0}" rx="${Math.max(10, shellRx - innerPad)}"></rect>
        </clipPath>
      </defs>
    `;

    const parts = [];
    parts.push(defs);

    parts.push(`
      <g filter="url(#ttSoftShadow)">
        <rect x="${padX}" y="${y}" width="${innerW}" height="${h}" rx="${shellRx}"
          fill="url(#ttTankShellGrad)" stroke="rgba(255,255,255,.20)"/>
        <rect x="${x0}" y="${y0}" width="${w0}" height="${h0}" rx="${Math.max(10, shellRx - innerPad)}"
          fill="rgba(255,255,255,.02)" stroke="rgba(255,255,255,.10)"/>
      </g>
    `);

    // клипы отсеков
    for (let i=0;i<n;i++){
      const idx = i + 1;
      const cx = x0 + segW * i;
      parts.push(`
        <clipPath id="ttCompClip${idx}">
          <rect x="${cx}" y="${y0}" width="${segW}" height="${h0}" rx="0"></rect>
        </clipPath>
      `);
    }

    // заливки + мениск
    for (let i=0;i<n;i++){
      const idx = i + 1;
      const cx = x0 + segW * i;

      parts.push(`
        <g clip-path="url(#ttTankInnerClip)">
          <g clip-path="url(#ttCompClip${idx})">
            <rect id="ttFill${idx}"
              data-x="${cx}" data-y0="${y0}" data-h0="${h0}" data-w="${segW}" data-rx="0"
              x="${cx}" y="${y0}" width="${segW}" height="${h0}" rx="0"
              fill="url(#ttLiquidGrad)"></rect>

            <rect id="ttMen${idx}"
              data-x="${cx}" data-y0="${y0}" data-h0="${h0}" data-w="${segW}"
              x="${cx}" y="${y0}" width="${segW}" height="2"
              fill="rgba(255,255,255,.22)" opacity="0"></rect>
          </g>
        </g>
      `);
    }

    // стекло поверх
    parts.push(`
      <g clip-path="url(#ttTankInnerClip)">
        <rect x="${x0}" y="${y0}" width="${w0}" height="${h0}" rx="${Math.max(10, shellRx - innerPad)}"
          fill="url(#ttGlassGrad)" opacity="0.95"></rect>
      </g>
    `);

    // перегородки дугами
    for (let i=1;i<n;i++){
      const xDiv = x0 + segW * i;
      const dir = (i % 2 === 0) ? -1 : 1;
      const bx = xDiv + dir * bulge;

      const path = [
        `M ${xDiv} ${y0 + 8}`,
        `Q ${bx} ${y0 + h0/2} ${xDiv} ${y0 + h0 - 8}`
      ].join(" ");

      parts.push(`<path d="${path}" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="2"/>`);
    }

    // подписи
    const topY = y - 26;
    const subY = y - 8;
    for (let i=0;i<n;i++){
      const idx = i + 1;
      const labelX = x0 + segW * i + 8;
      parts.push(`<text x="${labelX}" y="${topY}" fill="rgba(238,241,246,.88)" font-size="14" font-weight="800">Отсек ${idx}</text>`);
      parts.push(`<text id="ttCap${idx}" x="${labelX}" y="${subY}" fill="rgba(238,241,246,.66)" font-size="12" font-weight="600"></text>`);
    }

    svg.setAttribute("viewBox", `0 0 ${W} 310`);
    svg.innerHTML = parts.join("");

    for (let i=1;i<=n;i++){
      const t = svg.querySelector("#ttCap"+i);
      if (!t) continue;
      t.textContent = capLabelFromCistern(cis, i-1);
    }

    // инициализируем заливки в 0 (чтобы transform появился сразу)
    for (let i=1;i<=n;i++){
      const el = svg.querySelector("#ttFill"+i);
      if (el) applyFillToEl(el, 0);
    }
  }

  // ===== NEW: заливка через transform (красиво) + мениск =====
  function applyFillToEl(el, percent){
    const x  = num(el.getAttribute("data-x"), 0);
    const y0 = num(el.getAttribute("data-y0"), 0);
    const h0 = num(el.getAttribute("data-h0"), 0);
    const w  = num(el.getAttribute("data-w"), 0);

    const p = Math.max(0, Math.min(1, num(percent, 0)));

    el.setAttribute("x", String(x));
    el.setAttribute("y", String(y0));
    el.setAttribute("width", String(w));
    el.setAttribute("height", String(h0));

    const ty = (1 - p) * h0;
    el.style.transformBox = "fill-box";
    el.style.transformOrigin = "0 0";
    el.style.transform = `translateY(${ty}px)`;

    el.__tt_p = p;

    const id = el.id || "";
    const m = id.match(/^ttFill(\d+)$/);
    if (m){
      const men = el.ownerSVGElement && el.ownerSVGElement.querySelector("#ttMen" + m[1]);
      if (men){
        const yMen = y0 + (1 - p) * h0;
        men.setAttribute("x", String(x));
        men.setAttribute("width", String(w));
        men.setAttribute("y", String(Math.max(y0, Math.min(y0 + h0 - 2, yMen))));
        men.style.opacity = (p > 0.01) ? "1" : "0";
      }
    }
  }

  function setFill(svg, idx, percent, opts){
    const el = svg.querySelector("#ttFill"+idx);
    if (!el) return;

    const target = Math.max(0, Math.min(1, num(percent, 0)));
    const cur = Number.isFinite(el.__tt_p) ? el.__tt_p : 0;
    const animate = !!(opts && opts.animate);
    const duration = Math.max(80, Math.min(1400, num(opts && opts.duration, 420)));

    if (!animate || Math.abs(target - cur) < 0.002 || typeof requestAnimationFrame !== "function" || typeof performance === "undefined"){
      applyFillToEl(el, target);
      return;
    }

    if (el.__tt_anim && el.__tt_anim.raf){
      try{ cancelAnimationFrame(el.__tt_anim.raf); }catch(e){}
    }

    const start = performance.now();
    const from = cur;
    const to = target;

    const smootherStep = (t) => t*t*t*(t*(t*6 - 15) + 10);

    const step = (now) => {
      const t = Math.max(0, Math.min(1, (now - start) / duration));
      const k = smootherStep(t);
      const p = from + (to - from) * k;
      applyFillToEl(el, p);
      if (t < 1){
        el.__tt_anim = { raf: requestAnimationFrame(step) };
      } else {
        el.__tt_anim = null;
        applyFillToEl(el, to);
      }
    };

    el.__tt_anim = { raf: requestAnimationFrame(step) };
  }

  function computeN(cis, tstate){
    if (cis && !cis.__missing && Array.isArray(cis.compartments) && cis.compartments.length) return cis.compartments.length;
    if (tstate && Array.isArray(tstate.caps) && tstate.caps.length) return tstate.caps.length;
    const n = getLitersInputs().length;
    return n || 0;
  }

  function updateMeta(u, cis, tstate){
    if (!u) return;

    if (cis && cis.__missing){
      u.meta.textContent = `Выбрано: ${getCisternId(cis)} · нет файла JSON в ${BARRELS_BASE}`;
      return;
    }

    if (cis){
      const id = getCisternId(cis);
      const comps = Array.isArray(cis.compartments) ? cis.compartments.length : 0;
      const total = Math.round(totalFromCistern(cis) || 0);
      u.meta.textContent = `Выбрано: ${id}${comps?` · ${comps} ${pluralRu(comps,"отсек","отсека","отсеков")}`:""}${total?` · ∑ ${total.toLocaleString("ru-RU")} л`:""}`;
    } else {
      const n = (tstate && Array.isArray(tstate.caps) && tstate.caps.length) ? tstate.caps.length : 0;
      u.meta.textContent = `Тарировка не найдена — визуал по отсекам прицепа${n?` · ${n} ${pluralRu(n,"отсек","отсека","отсеков")}`:""}.`;
    }
  }

  function ensureUiCounts(u, cis, tstate){
    const n = Math.max(1, computeN(cis, tstate) || 1);

    const svgHas = u.svg.querySelector("#ttFill1");
    const gridHas = u.grid.querySelector("#ttMm1") || document.getElementById("ttMm1");
    const gridN = u.grid.querySelectorAll("input").length || 0;

    if (!svgHas || !gridHas || (gridHas && n !== gridN)){
      buildSvg(u.svg, n, cis);
      buildMmInputs(u.grid, n);
      bindMmInputsOnce(u.grid, tstate, LAST.recalcFn);
    } else {
      for (let i=1;i<=n;i++){
        const t = u.svg.querySelector("#ttCap"+i);
        if (t) t.textContent = capLabelFromCistern(cis, i-1);
      }
    }

    return n;
  }

  function syncMmFromLiters(cis){
    if (!cis || cis.__missing) return;
    const inputsL = getLitersInputs();
    inputsL.forEach((inp, i) => {
      const mmInp = document.getElementById("ttMm"+(i+1));
      if (!mmInp) return;
      const liters = num(inp.value, 0);
      const table = cis?.compartments?.[i]?.table;
      if (!table) return;
      const mm = litersToMm(table, liters);
      if (!mmInp.matches(":focus")) mmInp.value = String(Math.round(mm));
    });
  }

  function syncVisualFromLiters(cis, caps){
    const u = ui(); if (!u) return;
    const inputsL = getLitersInputs();
    const nSvg = u.svg.querySelectorAll('[id^="ttFill"]').length;

    for (let i=0;i<nSvg;i++){
      const liters = num((inputsL[i] && inputsL[i].value) || 0, 0);
      let p = 0;

      if (cis && !cis.__missing && cis.compartments && cis.compartments[i] && Array.isArray(cis.compartments[i].table)) {
        const table = cis.compartments[i].table;
        const mm = litersToMm(table, liters);
        const maxMm = table.length ? num(table[table.length - 1].mm, 0) : 0;
        p = maxMm > 0 ? mm / maxMm : 0;
      } else {
        const max = Array.isArray(caps) ? num(caps[i], 0) : 0;
        p = max > 0 ? liters / max : 0;
      }

      setFill(u.svg, i+1, p, { animate: true, duration: 520 });
    }
  }

  function scheduleSyncLoop(tstate){
    const run = () => { try { syncAfterRecalc(tstate); } catch(e) {} };
    run();
    if (typeof requestAnimationFrame === "function"){
      requestAnimationFrame(() => requestAnimationFrame(run));
    } else {
      setTimeout(run, 16);
    }
    let t = 0;
    const tick = () => {
      t += 1;
      run();
      if (t < 10) setTimeout(tick, 60);
    };
    setTimeout(tick, 60);
  }

  // NEW: мягкий single-shot sync (чтобы не дёргалось на вводе)
  let __tt_sync_raf = 0;
  function scheduleSyncOnce(tstate){
    if (__tt_sync_raf) return;
    if (typeof requestAnimationFrame !== "function"){
      setTimeout(() => { try{ syncAfterRecalc(tstate); }catch(e){} }, 16);
      return;
    }
    __tt_sync_raf = requestAnimationFrame(() => {
      __tt_sync_raf = 0;
      try{ syncAfterRecalc(tstate); }catch(e){}
    });
  }

  function bindRecalcHooksOnce(tstate){
    const hookIds = ["fillMax", "clearAll", "btnDistributeMass", "btnDistributeM3"];
    hookIds.forEach(id => {
      const el = document.getElementById(id);
      if (!el || el.__tt_hooked) return;
      el.__tt_hooked = true;
      // для кнопок оставляем loop (там реально серия пересчётов)
      el.addEventListener("click", () => scheduleSyncLoop(tstate), true);
    });
  }

  function bindAutoPickButtonOnce(tstate){
    const u = ui();
    if (!u || !u.btn || u.btn.__tt_bound) return;
    u.btn.__tt_bound = true;

    u.btn.addEventListener("click", async () => {
      const u2 = ui(); if (!u2) return;

      const cis = await ensureCisternLoadedByTrailer();
      await loadDB();
      const list = Array.isArray(DB?.cisterns) ? DB.cisterns : [];

      fillSelect(u2.sel, list, u2.sel.value);

      if (cis && !cis.__missing){
        u2.sel.value = getCisternId(cis);
        setTrailerSelectToMatchCistern(cis);
      } else {
        u2.sel.value = "";
      }

      const picked = resolveCistern(u2, list, tstate, "auto");
      ensureUiCounts(u2, picked, tstate);
      updateMeta(u2, picked, tstate);
      syncMmFromLiters(picked);
      syncVisualFromLiters(picked, tstate?.caps);
    }, false);
  }

  function bindTrailerSelectOnce(tstate){
    const ts = getTrailerSelectEl();
    if (!ts || ts.__tt_bound) return;
    ts.__tt_bound = true;

    ts.addEventListener("change", async () => {
      const u = ui(); if (!u) return;

      await ensureCisternLoadedByTrailer();
      await loadDB();

      const list = Array.isArray(DB?.cisterns) ? DB.cisterns : [];
      fillSelect(u.sel, list, u.sel.value);

      const cis = resolveCistern(u, list, tstate, "trailer");
      ensureUiCounts(u, cis, tstate);
      updateMeta(u, cis, tstate);

      const id4 = extract4(getTrailerHintFromDom().id || getTrailerHintFromDom().name);
      if (id4){
        const exact = list.find(x => normKey(getCisternId(x)) === normKey(id4));
        if (exact && !exact.__missing) u.sel.value = getCisternId(exact);
      }

      syncMmFromLiters(cis);
      syncVisualFromLiters(cis, tstate?.caps);
    }, false);
  }

  function bindLitersInputOnce(tstate, recalcFn){
    const tb = document.getElementById("tankBody");
    if (!tb || tb.__tt_bound) return;
    tb.__tt_bound = true;

    tb.addEventListener("input", async (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      if (!t.classList.contains("inpL")) return;

      await ensureCisternLoadedByTrailer();
      await loadDB();

      const u = ui(); if (!u) return;
      const list = Array.isArray(DB?.cisterns) ? DB.cisterns : [];
      const cis = resolveCistern(u, list, tstate, "auto");

      syncMmFromLiters(cis);
      syncVisualFromLiters(cis, tstate?.caps);
      if (typeof recalcFn === "function") recalcFn();

      // было: scheduleSyncLoop(tstate) -> дёргало
      scheduleSyncOnce(tstate);
    }, false);
  }

  function bindMmInputsOnce(gridEl, tstate, recalcFn){
    const grid = gridEl || document.getElementById("ttMmGrid");
    if (!grid) return;

    const mmInputs = Array.from(grid.querySelectorAll('input[id^="ttMm"]'));
    const nSafe = Math.max(1, mmInputs.length || (tstate && Array.isArray(tstate.caps) ? tstate.caps.length : 0) || 1);

    for (let i=1;i<=nSafe;i++){
      const mmInp = document.getElementById("ttMm"+i);
      if (!mmInp || mmInp.__tt_bound) continue;
      mmInp.__tt_bound = true;

      mmInp.addEventListener("input", async () => {
        await ensureCisternLoadedByTrailer();
        await loadDB();

        const u = ui(); if (!u) return;
        const list = Array.isArray(DB?.cisterns) ? DB.cisterns : [];
        const cis = resolveCistern(u, list, tstate, "auto");
        if (!cis || cis.__missing) return;
        const table = cis?.compartments?.[i-1]?.table;
        if (!table) return;

        const liters = mmToLiters(table, mmInp.value);
        const inpL = getLitersInputs()[i-1];
        if (inpL) inpL.value = String((Math.round(liters*1000)/1000).toFixed(3));

        if (typeof recalcFn === "function") recalcFn();

        // было: scheduleSyncLoop(tstate)
        scheduleSyncOnce(tstate);
      }, false);
    }
  }

  async function render(trailer, tstate, recalcFn){
    const u = ui();
    if (!u) return;

    LAST = { trailer: trailer || null, tstate: tstate || null, recalcFn: recalcFn || null };

    if (!tstate || tstate.type !== "tanker"){
      u.box.style.display = "none";
      return;
    }
    u.box.style.display = "block";

    await loadDB();
    await ensureCisternLoadedByTrailer();

    const cisterns = Array.isArray(DB?.cisterns) ? DB.cisterns : [];
    fillSelect(u.sel, cisterns, u.sel.value);

    const cis = resolveCistern(u, cisterns, tstate, "auto");

    ensureUiCounts(u, cis, tstate);
    updateMeta(u, cis, tstate);

    bindAutoPickButtonOnce(tstate);
    bindRecalcHooksOnce(tstate);
    bindLitersInputOnce(tstate, recalcFn);
    bindTrailerSelectOnce(tstate);

    if (!u.sel.__tt_bound){
      u.sel.__tt_bound = true;
      u.sel.addEventListener("change", async () => {
        await loadDB();
        const list = Array.isArray(DB?.cisterns) ? DB.cisterns : [];
        const picked = resolveCistern(u, list, tstate, "cistern");

        if (picked && !picked.__missing) setTrailerSelectToMatchCistern(picked);

        // смена селекта — достаточно once
        scheduleSyncOnce(LAST.tstate);
      }, false);
    }

    syncMmFromLiters(cis);
    syncVisualFromLiters(cis, tstate.caps);
  }

  function syncAfterRecalc(tstate){
    const u = ui();
    if (!u) return;
    if (!tstate || tstate.type !== "tanker"){ u.box.style.display = "none"; return; }

    loadDB().then(async () => {
      await ensureCisternLoadedByTrailer();
      const list = Array.isArray(DB?.cisterns) ? DB.cisterns : [];
      fillSelect(u.sel, list, u.sel.value);

      const cis = resolveCistern(u, list, tstate, "auto");
      ensureUiCounts(u, cis, tstate);
      updateMeta(u, cis, tstate);

      syncMmFromLiters(cis);
      syncVisualFromLiters(cis, tstate.caps);
    });
  }

  window.TT_TARIROVKA = { load: loadDB, render, syncAfterRecalc, mmToLiters, litersToMm };
})();
