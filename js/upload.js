// Upload & pembacaan file Excel (Serial Number, Stock Available, Barcode, Price List Reborn, Skema Leasing)
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

// Kolom file "Stock Available": #, Warehouse Code, Item No., Item Description, Available, In Stock, Allocated, Item Cost
// Satu file ini memuat stok SEMUA gudang:
//  - gudang SDNC yang terdaftar di STOCK_OWN_WAREHOUSES (js/stock-config.js) -> stok sendiri ("own": Available & Allocated)
//  - gudang SDNC lain (demo/rusak) -> tidak dihitung
//  - gudang cabang lain -> "map" (dipakai untuk status INDENT)
// Kolom Item Cost (harga pokok) sengaja tidak dibaca.
function parseStockAvailRows(rows) {
  const map = {};
  const descMap = {};
  const own = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[2]) continue;
    const whcode = r[1] ? String(r[1]).trim() : '';
    const itemCode = String(r[2]).trim();
    const desc = r[3] ? String(r[3]).trim() : '';
    const available = Number(r[4]) || 0;
    const allocated = Number(r[6]) || 0;
    if (desc && !descMap[itemCode]) descMap[itemCode] = desc;
    if (!whcode) continue;
    const wh = whcode.toUpperCase();
    if (wh.startsWith('SDNC')) {
      if (STOCK_OWN_WAREHOUSES.includes(wh)) {
        const a = Math.max(0, available),
          l = Math.max(0, allocated);
        if (a > 0 || l > 0) {
          if (!own[itemCode]) own[itemCode] = { a: 0, l: 0 };
          own[itemCode].a += a;
          own[itemCode].l += l;
        }
      }
      continue; // SDNC.DEM / SDNC.RUS dst: tidak dihitung
    }
    if (available <= 0) continue;
    if (!map[itemCode]) map[itemCode] = {};
    map[itemCode][whcode] = (map[itemCode][whcode] || 0) + available;
  }
  return { map, descMap, own };
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

// Jumlah barang ber-stok di katalog yang belum punya harga Retail di file Reborn (hanya informasi).
function countStockedWithoutRebornPrice(parsed) {
  if (!(catalog && catalog.items)) return null;
  const store = { byCode: parsed.byCode };
  return catalog.items.filter((it) => (it.available > 0 || it.allocatedOwn > 0) && !lookupRebornPrice(it, store)).length;
}

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
  const applyOwn = stockAvailOwn !== null; // null = data Stock Available lama (belum ada stok sendiri): jangan ubah
  catalog.items.forEach((it) => {
    existingCodes.add(it.code);
    // snOthers null = memang tidak ada di SN (bukan 'tidak diketahui'); hanya katalog lama tanpa field ini yang pakai others
    const base = it.snOthers !== undefined ? it.snOthers : it.others || null;
    it.others = mergeOthers(base, stockAvailMap[it.code]);
    if (applyOwn) {
      const o = stockAvailOwn[it.code];
      it.available = o ? o.a : 0;
      it.allocatedOwn = o ? o.l : 0;
      it.inOwnList = !!o;
    }
  });
  // Barang yang ada di Stock Available (stok sendiri atau cabang lain) tapi belum ada di katalog
  const extraCodes = new Set(Object.keys(stockAvailMap));
  if (applyOwn) Object.keys(stockAvailOwn).forEach((c) => extraCodes.add(c));
  extraCodes.forEach((code) => {
    if (existingCodes.has(code)) return;
    const o = applyOwn ? stockAvailOwn[code] : null;
    catalog.items.push({
      code,
      desc: stockAvailDesc[code] || '(tanpa nama)',
      price: null,
      available: o ? o.a : 0,
      allocatedOwn: o ? o.l : 0,
      others: stockAvailMap[code] || null,
      snOthers: null,
      otherUnits: null,
      ownUnits: null,
      inOwnList: !!o,
      fromStockAvail: true,
    });
  });
  // Buang barang yang HANYA muncul karena Stock Available, kalau datanya sudah tidak ada
  catalog.items = catalog.items.filter((it) => !(it.fromStockAvail && !it.others && !(it.available > 0 || it.allocatedOwn > 0)));
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

async function tryBuildCatalogFromSn() {
  if (!pendingSnRows) return;
  try {
    const name = pendingSnName;
    catalog = buildCatalog(pendingSnRows, name);
    recomputeOthersWithStockAvail(); // isi stok sendiri & cabang lain dari Stock Available sebelum disimpan
    const result = await saveCatalogToCloud('inventory:latest', catalog);
    renderMeta();
    statusEl.textContent = result.ok
      ? `Data berhasil disinkron ke cloud (${name}) — semua pengguna link akan melihat data ini.`
      : `GAGAL sinkron ke cloud: ${result.message} — Data cuma tersimpan di device ini.`;
    openFifo.clear();
    openBranches.clear();
    if (searchInput.value.trim()) doSearch();
    else renderEmpty();
  } catch (err) {
    statusEl.textContent = 'Gagal memproses data: ' + err.message;
  } finally {
    pendingSnRows = null;
    pendingSnName = null;
  }
}

async function readLeasingFile(file) {
  if (/\.csv$/i.test(file.name)) throw new Error('File skema leasing harus .xlsx (butuh info kolom tersembunyi).');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellStyles: true });
  const name = wb.SheetNames.find((n) => /rekap/i.test(n)) || wb.SheetNames[0];
  return leasingParseSheet(XLSX, wb.Sheets[name]);
}

async function detectAndProcessFile(file) {
  const rows = await readSheetFile(file);

  if (leasingIsSheetRows(rows)) {
    setCheckBadge(leasingCheckBadge, 'loading', 'Membaca skema leasing...');
    const parsed = await readLeasingFile(file);
    if (!parsed || !parsed.items.length) {
      const msg = 'Tidak ada produk yang terbaca dari file skema leasing.';
      setCheckBadge(leasingCheckBadge, 'bad', `✗ ${msg}`);
      return { type: 'leasing', ok: false, message: msg };
    }
    const st = parsed.stats;
    const summary =
      `${st.products} produk, ${st.programs} program` +
      (st.hiddenPrograms ? ` (${st.hiddenPrograms} disembunyikan di Excel)` : '') +
      (st.conflicts ? `, ${st.conflicts} baris ganda berbeda isi` : '');
    LEASING = { programs: parsed.programs, items: parsed.items, note: parsed.note };
    leasingMeta = {
      fileName: file.name,
      updatedAt: new Date().toISOString(),
      products: st.products,
      programs: st.programs,
      hiddenPrograms: st.hiddenPrograms,
      conflicts: st.conflicts,
    };
    setCheckBadge(leasingCheckBadge, 'loading', 'Menyimpan ke server...');
    const result = await saveCatalogToCloud('leasing:latest', {
      programs: LEASING.programs,
      items: LEASING.items,
      note: LEASING.note,
      meta: leasingMeta,
    });
    if (result.ok) {
      setCheckBadge(leasingCheckBadge, 'ok', `✓ ${file.name}`);
      leasingCheckBadge.title = summary;
    } else {
      setCheckBadge(leasingCheckBadge, 'bad', `✗ Gagal simpan ke server: ${result.message}`);
    }
    if (typeof leasingRefresh === 'function') leasingRefresh();
    return { type: 'leasing', ok: result.ok, message: result.message || '', summary };
  }

  if (validatePlRows(rows)) {
    return {
      type: 'pl',
      ok: false,
      message: 'File Price List sudah tidak dipakai — stok diambil dari Stock Available, harga dari Price List Reborn',
    };
  }
  if (validateSnRows(rows)) {
    pendingSnRows = rows;
    pendingSnName = file.name;
    setCheckBadge(snCheckBadge, 'ok', `✓ ${file.name}`);
    return { type: 'sn', ok: true };
  }
  if (validateStockAvailRows(rows)) {
    const { map, descMap, own } = parseStockAvailRows(rows);
    stockAvailMap = map;
    stockAvailDesc = descMap;
    stockAvailOwn = own;
    stockAvailMeta = { fileName: file.name, updatedAt: new Date().toISOString() };
    setCheckBadge(stockAvailCheckBadge, 'loading', 'Menyimpan ke server...');
    const result = await saveCatalogToCloud('stockavail:latest', {
      map: stockAvailMap,
      descMap: stockAvailDesc,
      own: stockAvailOwn,
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
    const missing = countStockedWithoutRebornPrice(parsed);
    const summary =
      missing === null
        ? `${parsed.rows} harga Retail dibaca`
        : `${parsed.rows} harga Retail dibaca, ${missing} barang ber-stok belum punya harga`;
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

  // Katalog (Serial Number) disimpan lewat jalur ini, setelah semua file selesai dibaca,
  // supaya stok dari Stock Available yang diupload bersamaan sudah ikut terpakai.
  // Fungsi ini sendiri yang menulis status akhir (berhasil/gagal) ke statusEl.
  const snPending = !!pendingSnRows;
  if (snPending) {
    await tryBuildCatalogFromSn();
  }
  recomputeOthersWithStockAvail();

  // Jangan timpa pesan sinkron yang baru saja ditulis tryBuildCatalogFromSn di atas
  if (!snPending) {
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
