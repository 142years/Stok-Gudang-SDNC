// Upload & pembacaan file Excel (PL, SN, Stock Available, Barcode, Price List Reborn)
let xlsxLoadPromise = null;
function ensureXlsxLoaded() {
  if (window.XLSX) return Promise.resolve();
  if (xlsxLoadPromise) return xlsxLoadPromise;
  xlsxLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Gagal memuat pustaka pembaca Excel.'));
    document.head.appendChild(s);
  });
  return xlsxLoadPromise;
}

function headerContainsAll(headerRow, keywords) {
  const joined = (headerRow || []).map((c) => String(c || '').toLowerCase()).join(' | ');
  return keywords.every((k) => joined.includes(k));
}

function validatePlRows(rows) {
  return rows && rows.length > 0 && headerContainsAll(rows[0], ['item no', 'available', 'list price']);
}

function validateSnRows(rows) {
  return rows && rows.length > 0 && headerContainsAll(rows[0], ['serial number', 'admission date', 'status']);
}

function validateStockAvailRows(rows) {
  return rows && rows.length > 0 && headerContainsAll(rows[0], ['warehouse code', 'item no', 'available']);
}

// Kolom file "Stock Available": #, Warehouse Code, Item No., Item Description, Available, In Stock, Allocated
function parseStockAvailRows(rows) {
  const map = {};
  const descMap = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[2]) continue;
    const whcode = r[1] ? String(r[1]).trim() : '';
    const itemCode = String(r[2]).trim();
    const desc = r[3] ? String(r[3]).trim() : '';
    const available = Number(r[4]) || 0;
    if (desc && !descMap[itemCode]) descMap[itemCode] = desc;
    if (!whcode || whcode.toUpperCase().startsWith('SDNC')) continue; // gudang kami sendiri, dilewati
    if (available <= 0) continue;
    if (!map[itemCode]) map[itemCode] = {};
    map[itemCode][whcode] = (map[itemCode][whcode] || 0) + available;
  }
  return { map, descMap };
}

function validateBarcodeRows(rows) {
  return rows && rows.length > 0 && headerContainsAll(rows[0], ['item no', 'bar code']);
}

// Kolom file "Check ItemName & Barcode": #, Active, Inactive, Item No., Item Description, Bar Code, ...
function parseBarcodeRows(rows) {
  const map = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[3]) continue;
    const itemCode = String(r[3]).trim();
    const barcode = r[5] ? String(r[5]).trim() : '';
    if (!barcode) continue;
    map[itemCode] = barcode;
  }
  return map;
}

function validateRebornPriceRows(rows) {
  return rows && rows.length > 0 && headerContainsAll(rows[0], ['item no', 'retail', 'gro-1']);
}

// Kolom file "Reborn_PriceList": #, Item No., Item Description, Retail, Gro-1 ... Gro-6, Retail-AMT
// Yang dipakai hanya kolom "Retail" (dicari lewat nama header, jadi aman kalau urutan kolom bergeser).
// Barang dengan Retail kosong / 0 dilewati.
function parseRebornPriceRows(rows) {
  const head = (rows[0] || []).map((c) => String(c || '').trim().toLowerCase());
  const iCode = head.findIndex((h) => h.startsWith('item no'));
  const iRetail = head.findIndex((h) => h === 'retail');
  const byCode = {};
  let used = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[iCode]) continue;
    const price = Number(r[iRetail]);
    if (!(price > 0)) continue;
    byCode[normCode(r[iCode])] = price;
    used++;
  }
  return { byCode, rows: used };
}

// Ringkasan perbandingan dengan Price List utama yang sudah ada di catalog (hanya informasi,
// tidak memblokir upload):
//  - comparable / match / mismatch: barang yang punya harga di PL utama DAN di file Reborn
//  - fill: barang TANPA harga di PL utama yang sekarang terisi dari file Reborn
//  - stillMissing: barang tanpa harga di PL utama dan tetap tidak ada di file Reborn
function reconcileRebornPrices(parsed) {
  const store = { byCode: parsed.byCode };
  const res = { comparable: 0, match: 0, mismatch: 0, fill: 0, stillMissing: 0, hasCatalog: !!(catalog && catalog.items) };
  if (!res.hasCatalog) return res;
  catalog.items.forEach((it) => {
    const m = lookupRebornPrice(it, store);
    if (Number(it.price) > 0) {
      if (m) {
        res.comparable++;
        if (Math.round(m) === Math.round(Number(it.price))) res.match++;
        else res.mismatch++;
      }
    } else if (m) res.fill++;
    else res.stillMissing++;
  });
  return res;
}

// Gabungkan hasil deteksi cabang lain dari SN dengan data Stock Available.
// Kalau ada cabang yang sama muncul di keduanya, nilai dari Stock Available yang dipakai
// (dianggap lebih lengkap/terbaru), sisanya digabung (union).
function mergeOthers(snOthers, stockOthers) {
  if (!snOthers && !stockOthers) return null;
  const merged = Object.assign({}, snOthers || {}, stockOthers || {});
  return Object.keys(merged).length ? merged : null;
}

// Terapkan ulang data Stock Available ke catalog yang sudah ada, tanpa perlu upload ulang PL/SN.
// Dipanggil setelah upload file Stock Available baru, atau setelah data dimuat dari cloud saat startup.
function recomputeOthersWithStockAvail() {
  if (!catalog || !catalog.items) return;
  const existingCodes = new Set();
  catalog.items.forEach((it) => {
    existingCodes.add(it.code);
    // snOthers null = memang tidak ada di SN (bukan 'tidak diketahui'); hanya katalog lama tanpa field ini yang pakai others
    const base = it.snOthers !== undefined ? it.snOthers : it.others || null;
    it.others = mergeOthers(base, stockAvailMap[it.code]);
  });
  Object.keys(stockAvailMap).forEach((code) => {
    if (existingCodes.has(code)) return;
    catalog.items.push({
      code,
      desc: stockAvailDesc[code] || '(tanpa nama)',
      price: null,
      available: 0,
      allocatedOwn: 0,
      others: stockAvailMap[code],
      snOthers: null,
      otherUnits: null,
      ownUnits: null,
      inOwnList: false,
      fromStockAvail: true,
    });
  });
  // Buang barang yang HANYA muncul karena Stock Available, kalau datanya sudah tidak ada
  catalog.items = catalog.items.filter((it) => !(it.fromStockAvail && !it.others));
  if (searchInput.value.trim()) doSearch();
  else renderEmpty();
}

// Pembaca CSV: mengenali pemisah (; , atau tab), tanda kutip, dan BOM UTF-8.
// Angka dibaca sebagai angka; teks berawalan nol (barcode, SN) dibiarkan sebagai teks.
function parseCsv(text) {
  text = String(text).replace(/^\uFEFF/, '');
  const head = text.split(/\r?\n/, 1)[0] || '';
  const delim = [';', '\t', ','].map((d) => [d, head.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) =>
      r.map((c) => {
        const t = c.trim();
        if (t === '') return null;
        return /^-?(0|[1-9]\d{0,14})([.,]\d+)?$/.test(t) ? Number(t.replace(',', '.')) : t;
      }),
    );
}

function readSheetFile(file) {
  if (/\.csv$/i.test(file.name)) return file.text().then(parseCsv);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function (evt) {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = function () {
      reject(new Error('Gagal membaca file.'));
    };
    reader.readAsArrayBuffer(file);
  });
}

async function tryBuildCatalogFromPending() {
  if (!pendingPlRows || !pendingSnRows) return;
  try {
    const combinedName = `${pendingPlName} + ${pendingSnName}`;
    catalog = buildCatalog(pendingPlRows, pendingSnRows, combinedName);
    const result = await saveCatalogToCloud('inventory:latest', catalog);
    renderMeta();
    statusEl.textContent = result.ok
      ? `Data berhasil disinkron ke cloud (${combinedName}) — semua pengguna link akan melihat data ini.`
      : `GAGAL sinkron ke cloud: ${result.message} — Data cuma tersimpan di device ini.`;
    openFifo.clear();
    openBranches.clear();
    if (searchInput.value.trim()) doSearch();
    else renderEmpty();
  } catch (err) {
    statusEl.textContent = 'Gagal memproses data: ' + err.message;
  } finally {
    pendingPlRows = null;
    pendingSnRows = null;
    pendingPlName = null;
    pendingSnName = null;
  }
}

// Deteksi jenis file berdasarkan header-nya, lalu proses & simpan ke slot yang sesuai.
// Return: nama slot ('pl'/'sn'/'stockavail'/'barcode'/'rebornprice') kalau dikenali, atau null kalau tidak.
async function detectAndProcessFile(file) {
  const rows = await readSheetFile(file);

  if (validatePlRows(rows)) {
    pendingPlRows = rows;
    pendingPlName = file.name;
    setCheckBadge(plCheckBadge, 'ok', `✓ ${file.name}`);
    return { type: 'pl', ok: true };
  }
  if (validateSnRows(rows)) {
    pendingSnRows = rows;
    pendingSnName = file.name;
    setCheckBadge(snCheckBadge, 'ok', `✓ ${file.name}`);
    return { type: 'sn', ok: true };
  }
  if (validateStockAvailRows(rows)) {
    const { map, descMap } = parseStockAvailRows(rows);
    stockAvailMap = map;
    stockAvailDesc = descMap;
    stockAvailMeta = { fileName: file.name, updatedAt: new Date().toISOString() };
    setCheckBadge(stockAvailCheckBadge, 'loading', 'Menyimpan ke server...');
    const result = await saveCatalogToCloud('stockavail:latest', {
      map: stockAvailMap,
      descMap: stockAvailDesc,
      meta: stockAvailMeta,
    });
    if (result.ok) {
      setCheckBadge(stockAvailCheckBadge, 'ok', `✓ ${file.name}`);
    } else {
      setCheckBadge(stockAvailCheckBadge, 'bad', `✗ Gagal simpan ke server: ${result.message}`);
    }
    return { type: 'stockavail', ok: result.ok, message: result.message };
  }
  if (validateBarcodeRows(rows)) {
    BARCODE_MAP = parseBarcodeRows(rows);
    getBarcodes._normIndex = null;
    barcodeMeta = { fileName: file.name, updatedAt: new Date().toISOString() };
    setCheckBadge(barcodeCheckBadge, 'loading', 'Menyimpan ke server...');
    const result = await saveCatalogToCloud('barcode:latest', { map: BARCODE_MAP, meta: barcodeMeta });
    if (result.ok) {
      setCheckBadge(barcodeCheckBadge, 'ok', `✓ ${file.name}`);
    } else {
      setCheckBadge(barcodeCheckBadge, 'bad', `✗ Gagal simpan ke server: ${result.message}`);
    }
    return { type: 'barcode', ok: result.ok, message: result.message };
  }
  if (validateRebornPriceRows(rows)) {
    setCheckBadge(rebornPriceCheckBadge, 'loading', 'Membaca Price List Reborn...');
    const parsed = parseRebornPriceRows(rows);
    if (!parsed.rows) {
      const msg = 'Kolom Retail kosong semua — tidak ada harga yang bisa dipakai.';
      setCheckBadge(rebornPriceCheckBadge, 'bad', `✗ ${msg}`);
      return { type: 'rebornprice', ok: false, message: msg };
    }
    const rec = reconcileRebornPrices(parsed);
    const summary = rec.hasCatalog
      ? `${parsed.rows} harga Retail dibaca, ${rec.fill} barang tanpa harga di Price List utama jadi terisi, ${rec.stillMissing} masih kosong`
      : `${parsed.rows} harga Retail dibaca (belum ada data Price List utama untuk dibandingkan)`;
    REBORN_PRICE = { byCode: parsed.byCode };
    rebornPriceMeta = {
      fileName: file.name,
      updatedAt: new Date().toISOString(),
      products: parsed.rows,
      rows: rows.length - 1,
    };
    setCheckBadge(rebornPriceCheckBadge, 'loading', 'Menyimpan ke server...');
    const result = await saveCatalogToCloud('rebornprice:latest', {
      byCode: REBORN_PRICE.byCode,
      meta: rebornPriceMeta,
    });
    if (result.ok) {
      setCheckBadge(rebornPriceCheckBadge, 'ok', `✓ ${file.name}`);
      rebornPriceCheckBadge.title = summary;
    } else {
      setCheckBadge(rebornPriceCheckBadge, 'bad', `✗ Gagal simpan ke server: ${result.message}`);
    }
    return { type: 'rebornprice', ok: result.ok, message: result.message || '', summary };
  }
  return { type: null, ok: false };
}

// Satu pintu untuk semua cara upload: tombol pilih file dan drag-and-drop
let uploadBusy = false;
async function processUploadFiles(files) {
  if (!files.length) return;
  if (uploadBusy) {
    statusEl.textContent = 'Masih memproses file sebelumnya — tunggu sebentar.';
    return;
  }
  uploadBusy = true;
  try {
    await runUploadFiles(files);
  } finally {
    uploadBusy = false;
  }
}

async function runUploadFiles(files) {
  try {
    if (files.some((f) => !/\.csv$/i.test(f.name))) await ensureXlsxLoaded();
  } catch (err) {
    statusEl.textContent = err.message;
    return;
  }

  const okList = [];
  const failList = [];
  for (const file of files) {
    statusEl.textContent = `Memproses ${file.name}... (${okList.length + failList.length + 1}/${files.length})`;
    try {
      const result = await detectAndProcessFile(file);
      if (!result.type) failList.push(`${file.name} (format tidak dikenali)`);
      else if (!result.ok) failList.push(`${file.name} (${result.message || 'gagal simpan ke server'})`);
      else okList.push(result.summary ? `${file.name} (${result.summary})` : file.name);
    } catch (err) {
      failList.push(`${file.name} (gagal dibaca: ${err.message})`);
    }
  }

  // PL+SN disimpan lewat jalur ini (bukan di dalam detectAndProcessFile) karena baru bisa
  // digabung & disimpan setelah KEDUANYA lengkap. Fungsi ini sendiri yang akan menulis
  // status akhir (berhasil/gagal lengkap dengan pesan error) ke statusEl.
  const plSnPending = !!(pendingPlRows && pendingSnRows);
  if (plSnPending) {
    await tryBuildCatalogFromPending();
  }
  recomputeOthersWithStockAvail();

  // Jangan timpa pesan sinkron PL/SN yang baru saja ditulis tryBuildCatalogFromPending di atas
  if (!plSnPending) {
    if (failList.length) {
      statusEl.textContent = `${okList.length} file berhasil diproses. ${failList.length} file bermasalah: ${failList.join(' | ')}`;
    } else {
      statusEl.textContent = `${okList.length} file berhasil diproses & tersimpan ke server.`;
    }
  } else if (failList.length) {
    statusEl.textContent += ` (${failList.length} file lain bermasalah: ${failList.join(' | ')})`;
  }
}

multiFileInput.addEventListener('change', function (e) {
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  processUploadFiles(files);
});

// ===== Drag & drop =====
const SHEET_FILE_RE = /\.(xlsx|xls|csv)$/i;
const droppedFiles = (e) => Array.from((e.dataTransfer && e.dataTransfer.files) || []);

function bindDropZone(zone, onDrop) {
  ['dragenter', 'dragover'].forEach((t) =>
    zone.addEventListener(t, (e) => {
      e.preventDefault();
      zone.classList.add('over');
    }),
  );
  ['dragleave', 'drop'].forEach((t) =>
    zone.addEventListener(t, (e) => {
      e.preventDefault();
      zone.classList.remove('over');
    }),
  );
  zone.addEventListener('drop', (e) => onDrop(droppedFiles(e)));
}

// Kotak upload utama: boleh banyak file sekaligus (.xlsx, .xls, .csv)
bindDropZone(document.getElementById('dropZone'), (files) => {
  const ok = files.filter((f) => SHEET_FILE_RE.test(f.name));
  if (ok.length) processUploadFiles(ok);
  else statusEl.textContent = 'Format tidak didukung — gunakan .xlsx, .xls, atau .csv.';
});

// Kotak upload Stock Opname: satu file .xlsx (butuh banyak sheet)
bindDropZone(document.getElementById('soDropZone'), (files) => processSoFile(files[0]));

// File yang dijatuhkan di luar kotak: jangan sampai browser berpindah ke file itu.
// Di mode staff (dan popup Stock Opname tertutup), file tetap diproses sebagai upload utama.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.target.closest && e.target.closest('.drop-zone')) return;
  if (!staffMode || soModalOverlay.classList.contains('show')) return;
  const ok = droppedFiles(e).filter((f) => SHEET_FILE_RE.test(f.name));
  if (ok.length) processUploadFiles(ok);
});
