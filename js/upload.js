// Upload & pembacaan file Excel (PL, SN, Stock Available, Barcode, Price List Manual)
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

function validateManualPriceRows(rows) {
  return rows && rows.length > 0 && headerContainsAll(rows[0], ['item description', 'barcode/imei', 'price']);
}

// Kolom: #, Item Description, Barcode/Imei, Price, WhsCode
// Satu harga per deskripsi = harga yang paling sering muncul (abaikan harga 0 / kosong).
function parseManualPriceRows(rows) {
  const descCount = {}; // { DESC: { harga: jumlah } }
  const bcCount = {}; // { barcode: { harga: jumlah } }
  let used = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[1]) continue;
    const price = Number(r[3]);
    if (!(price > 0)) continue;
    used++;
    const d = normDesc(r[1]);
    (descCount[d] = descCount[d] || {})[price] = ((descCount[d] || {})[price] || 0) + 1;
    // "barcode-serial" -> ambil barcode-nya saja. Baris tanpa tanda "-" hanya IMEI/serial/barcode tunggal, tidak dipakai sebagai kunci.
    const raw = r[2] ? String(r[2]).trim() : '';
    const dash = raw.indexOf('-');
    if (dash > 0) {
      const bc = raw.slice(0, dash).trim();
      if (/^\d{6,}$/.test(bc)) (bcCount[bc] = bcCount[bc] || {})[price] = ((bcCount[bc] || {})[price] || 0) + 1;
    }
  }
  function pickMode(counts) {
    let best = null,
      bestN = -1;
    Object.keys(counts).forEach((p) => {
      const n = counts[p];
      if (n > bestN || (n === bestN && Number(p) > best)) {
        best = Number(p);
        bestN = n;
      }
    });
    return best;
  }
  const byDesc = {},
    byBarcode = {};
  let ambiguous = 0;
  Object.keys(descCount).forEach((d) => {
    byDesc[d] = pickMode(descCount[d]);
    if (Object.keys(descCount[d]).length > 1) ambiguous++;
  });
  Object.keys(bcCount).forEach((b) => {
    byBarcode[b] = pickMode(bcCount[b]);
  });
  return { byDesc, byBarcode, ambiguous, rows: used };
}

// Bandingkan harga file manual dengan Price List utama yang sudah ada di catalog:
//  - comparable: barang yang punya harga di PL utama DAN di file manual
//  - match / mismatch: harga sama / beda
//  - fill: barang TANPA harga di PL utama yang sekarang bisa terisi dari file manual
//  - stillMissing: barang tanpa harga di PL utama dan tetap tidak ada di file manual
function reconcileManualPrices(parsed) {
  const store = { byDesc: parsed.byDesc, byBarcode: parsed.byBarcode };
  const res = {
    comparable: 0,
    match: 0,
    mismatch: 0,
    fill: 0,
    stillMissing: 0,
    samples: [],
    hasCatalog: !!(catalog && catalog.items),
  };
  if (!res.hasCatalog) return res;
  catalog.items.forEach((it) => {
    const m = lookupManualPrice(it, store);
    if (Number(it.price) > 0) {
      if (m) {
        res.comparable++;
        if (Math.round(m) === Math.round(Number(it.price))) res.match++;
        else {
          res.mismatch++;
          if (res.samples.length < 3)
            res.samples.push(`${it.desc}: PL ${fmtRupiah(it.price)} vs manual ${fmtRupiah(m)}`);
        }
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

function readSheetFile(file) {
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
// Return: nama slot ('pl'/'sn'/'stockavail'/'barcode') kalau dikenali, atau null kalau tidak.
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
  if (validateManualPriceRows(rows)) {
    setCheckBadge(manualPriceCheckBadge, 'loading', 'Mencocokkan dengan Price List...');
    const parsed = parseManualPriceRows(rows);
    const rec = reconcileManualPrices(parsed);
    const ratio = rec.comparable ? rec.match / rec.comparable : 1;
    const MIN_COMPARABLE = 20,
      MIN_RATIO = 0.9;
    const summary = rec.hasCatalog
      ? `${rec.match}/${rec.comparable} harga sama dengan Price List, ${rec.fill} barang tanpa harga bisa terisi, ${rec.stillMissing} masih kosong`
      : 'belum ada data Price List untuk dibandingkan';
    // Tidak sesuai -> jangan dipakai sama sekali
    if (rec.comparable >= MIN_COMPARABLE && ratio < MIN_RATIO) {
      const msg = `Harga tidak sesuai Price List (${rec.match}/${rec.comparable} sama). Contoh: ${rec.samples.join(' | ')}`;
      setCheckBadge(manualPriceCheckBadge, 'bad', `✗ ${msg}`);
      return { type: 'manualprice', ok: false, message: msg };
    }
    MANUAL_PRICE = { byDesc: parsed.byDesc, byBarcode: parsed.byBarcode };
    manualPriceMeta = {
      fileName: file.name,
      updatedAt: new Date().toISOString(),
      products: Object.keys(parsed.byDesc).length,
      rows: parsed.rows,
    };
    setCheckBadge(manualPriceCheckBadge, 'loading', 'Menyimpan ke server...');
    const result = await saveCatalogToCloud('manualprice:latest', {
      byDesc: MANUAL_PRICE.byDesc,
      byBarcode: MANUAL_PRICE.byBarcode,
      meta: manualPriceMeta,
    });
    if (result.ok) {
      setCheckBadge(manualPriceCheckBadge, 'ok', `✓ ${file.name}`);
      manualPriceCheckBadge.title = summary;
    } else {
      setCheckBadge(manualPriceCheckBadge, 'bad', `✗ Gagal simpan ke server: ${result.message}`);
    }
    return { type: 'manualprice', ok: result.ok, message: result.message || '', summary };
  }
  return { type: null, ok: false };
}

multiFileInput.addEventListener('change', async function (e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  try {
    await ensureXlsxLoaded();
  } catch (err) {
    statusEl.textContent = err.message;
    e.target.value = '';
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
  e.target.value = '';
});
