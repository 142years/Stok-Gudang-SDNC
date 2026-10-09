// Scanner barcode / serial number
// ===== Scanner barcode / serial number — langsung scan, tanpa klik kolom pencarian =====
// Scanner fisik bekerja seperti keyboard: mengetik semua karakter dengan sangat cepat lalu Enter.
//  - Fokus di mana saja (selain kolom isian lain & popup): ketikan cepat dikenali sebagai scan.
//  - Hasil langsung tampil; kolom cari dibiarkan KOSONG dan tetap fokus, jadi scan berikutnya langsung jalan.
//  - Ketikan manual (lambat) tetap berfungsi sebagai pencarian biasa.
// Urutan pencocokan: serial number unit -> barcode -> kode barang persis -> pencarian teks.
const SCAN_MAX_GAP = 70; // ms: jeda maksimum antar karakter agar dianggap scanner (manusia jauh lebih lambat)
const SCAN_MIN_LEN = 4; // panjang minimum bila diakhiri Enter/Tab
const SCAN_IDLE_MIN_LEN = 8; // panjang minimum bila scanner tidak mengirim Enter
const SCAN_IDLE_MS = 130; // tanpa ketikan selama ini -> scan dianggap selesai
let scanBuf = '',
  scanLast = 0,
  scanMaxGap = 0,
  scanViaBody = false,
  scanTimer = null;
const scanIdx = { bcRef: null, byBarcode: null, itemsRef: null, itemsLen: -1, byCode: null };

// Barcode angka dibandingkan tanpa nol di depan (UPC-A 12 digit vs EAN-13 sering terbaca beda)
function normBarcode(s) {
  const t = String(s || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
  if (!/^\d+$/.test(t)) return t;
  return t.replace(/^0+/, '') || t;
}

function scanIndex() {
  if (scanIdx.bcRef !== BARCODE_MAP) {
    const m = new Map();
    Object.keys(BARCODE_MAP).forEach((code) => {
      const k = normBarcode(BARCODE_MAP[code]);
      if (!k) return;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(code);
    });
    scanIdx.byBarcode = m;
    scanIdx.bcRef = BARCODE_MAP;
  }
  if (catalog && (scanIdx.itemsRef !== catalog.items || scanIdx.itemsLen !== catalog.items.length)) {
    const m = new Map();
    catalog.items.forEach((it) => m.set(String(it.code).trim().toUpperCase(), it));
    scanIdx.byCode = m;
    scanIdx.itemsRef = catalog.items;
    scanIdx.itemsLen = catalog.items.length;
  }
  return scanIdx;
}

function resolveScan(raw) {
  const q = String(raw).trim();
  if (!q || !catalog) return null;
  const idx = scanIndex();
  const sI = catalog.serialIndex || {};
  const snKey = sI[q] ? q : sI[q.toUpperCase()] ? q.toUpperCase() : null;
  if (snKey) return { codes: [sI[snKey].code], serial: snKey };
  const bc = idx.byBarcode.get(normBarcode(q));
  if (bc) {
    const codes = bc.filter((c) => idx.byCode.has(String(c).trim().toUpperCase()));
    if (codes.length) return { codes, serial: null };
  }
  const it = idx.byCode.get(q.toUpperCase());
  if (it) return { codes: [it.code], serial: null };
  return null;
}

function runScan(raw) {
  const q = String(raw).trim();
  clearTimeout(searchTimer);
  searchInput.value = '';
  if (!q) return;
  if (!catalog) {
    currentScan = null;
    renderEmpty();
    return;
  }
  const r = resolveScan(q);
  if (r) {
    currentScan = { raw: q, codes: r.codes, serial: r.serial, fresh: true };
  } else {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const found = catalog.items
      .filter((it) => words.every((w) => getItemSearchHay(it).includes(w)))
      .slice(0, RESULT_LIMIT);
    currentScan = { raw: q, codes: found.map((it) => it.code), serial: null, fresh: true };
  }
  renderScanResult();
  const ok = currentScan.codes.length > 0;
  try {
    if (navigator.vibrate) navigator.vibrate(ok ? 25 : [70, 40, 70]);
  } catch (e) {}
  const top = resultsEl.getBoundingClientRect().top;
  if (top < 60 || top > window.innerHeight * 0.7) resultsEl.scrollIntoView({ block: 'start' });
  if (document.activeElement !== searchInput) searchInput.focus({ preventScroll: true });
}

function renderScanResult() {
  const s = currentScan;
  const byCode = scanIndex().byCode;
  const items = s.codes.map((c) => byCode.get(String(c).trim().toUpperCase())).filter(Boolean);
  if (!items.length) {
    resultsEl.innerHTML = `<div class="empty"><b>Tidak ditemukan</b><br/>Barcode / SN <span class="barcode-val">${escapeHtml(s.raw)}</span> tidak ada di data hari ini.<br/>Scan ulang, atau ketik nama barang.</div>`;
    footNote.textContent = '';
    return;
  }
  let note = '';
  if (s.serial && staffMode && catalog.serialIndex[s.serial]) {
    note = `<div class="scan-note">SN <span class="barcode-val">${escapeHtml(s.serial)}</span><br/>${fifoNoteHtml(catalog.serialIndex[s.serial])}</div>`;
  }
  resultsEl.innerHTML = note + items.map(renderItem).join('');
  if (s.fresh) {
    const first = resultsEl.querySelector('.card');
    if (first) first.classList.add('scan-hit');
    s.fresh = false;
  }
  footNote.textContent = items.length > 1 ? `${items.length} barang cocok dengan barcode ini.` : '';
}

function scanReset() {
  scanBuf = '';
  scanMaxGap = 0;
  scanViaBody = false;
  clearTimeout(scanTimer);
  scanTimer = null;
}
function scanIsFast(minLen) {
  return scanBuf.length >= minLen && scanMaxGap <= SCAN_MAX_GAP;
}
function scanBurstActive() {
  return scanBuf.length >= 3 && scanMaxGap <= SCAN_MAX_GAP && Date.now() - scanLast < 250;
}
function scanBlocked() {
  return (
    pinOverlay.classList.contains('show') ||
    deleteOverlay.classList.contains('show') ||
    soModalOverlay.classList.contains('show') ||
    (typeof notaIsOpen === 'function' && notaIsOpen()) ||
    (typeof leasingIsOpen === 'function' && leasingIsOpen())
  );
}
function isOtherField(el) {
  if (!el || el === searchInput) return false;
  const t = el.tagName;
  return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || el.isContentEditable;
}

// Dipanggil saat ketikan berhenti
function scanIdle() {
  scanTimer = null;
  const buf = scanBuf,
    viaBody = scanViaBody,
    fast = scanIsFast(SCAN_IDLE_MIN_LEN);
  scanBuf = '';
  scanMaxGap = 0;
  scanViaBody = false;
  if (!buf) return;
  if (fast) {
    runScan(buf);
    return;
  } // scanner tanpa Enter
  if (viaBody) {
    // ketikan manual saat fokus bukan di kolom cari -> arahkan ke kolom cari
    searchInput.focus({ preventScroll: true });
    searchInput.value = buf;
    searchInput.setSelectionRange(buf.length, buf.length);
    currentScan = null;
    doSearch();
  }
}

document.addEventListener('keydown', function (e) {
  if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (scanBlocked() || isOtherField(e.target)) {
    scanReset();
    return;
  }
  const inSearch = e.target === searchInput;
  const key = e.key;

  if (key === 'Enter' || key === 'Tab') {
    if (scanIsFast(SCAN_MIN_LEN)) {
      e.preventDefault();
      const code = scanBuf;
      scanReset();
      runScan(code);
      return;
    }
    scanReset();
    if (key === 'Enter' && inSearch) {
      // Enter manual di kolom cari: kalau persis barcode / SN / kode barang, perlakukan sebagai scan
      const v = searchInput.value.trim();
      if (v && resolveScan(v)) {
        e.preventDefault();
        runScan(v);
      } else if (v) {
        clearTimeout(searchTimer);
        currentScan = null;
        doSearch();
      }
    }
    return;
  }

  if (key.length !== 1) return; // Shift, Backspace, panah, dll tidak mengganggu
  // Spasi pada tombol yang sedang fokus tetap dipakai untuk menekan tombol itu
  if (key === ' ' && !scanBuf && !inSearch && e.target && e.target !== document.body && e.target.tagName !== 'HTML')
    return;

  const now = Date.now();
  if (scanBuf && now - scanLast > 400) scanReset();
  if (scanBuf) scanMaxGap = Math.max(scanMaxGap, now - scanLast);
  scanBuf += key;
  scanLast = now;
  if (!inSearch) {
    e.preventDefault();
    scanViaBody = true;
  }
  clearTimeout(scanTimer);
  scanTimer = setTimeout(scanIdle, SCAN_IDLE_MS);
});
