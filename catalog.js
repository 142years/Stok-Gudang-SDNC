// Status data, badge upload, dan pembuatan katalog (PL + SN)
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function updateStaleBanner() {
  if (!catalog || !catalog.updatedAt) {
    staleBanner.classList.remove('show');
    return;
  }
  const updated = new Date(catalog.updatedAt);
  const now = new Date();
  if (isNaN(updated.getTime()) || isSameDay(updated, now)) {
    staleBanner.classList.remove('show');
  } else {
    staleBanner.classList.add('show');
  }
}

// Tampilkan badge "✓ nama file" dari data yang tersimpan (cloud/lokal), bukan hanya saat upload.
// Dipanggil saat data dimuat, supaya status tetap terlihat setelah refresh dan di device lain.
function badgeFromMeta(el, name, updatedAt) {
  if (!name) {
    el.className = 'upload-check';
    el.textContent = '';
    el.title = '';
    return;
  }
  setCheckBadge(el, 'ok', `✓ ${name}`);
  const d = updatedAt ? new Date(updatedAt) : null;
  el.title =
    d && !isNaN(d.getTime())
      ? 'Diupload ' + d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
      : '';
}

function refreshUploadBadges() {
  let plName = pendingPlName || null,
    snName = pendingSnName || null;
  if (catalog && catalog.fileName) {
    const parts = String(catalog.fileName).split(' + ');
    if (!plName) plName = parts[0] || null;
    if (!snName) snName = parts.length > 1 ? parts.slice(1).join(' + ') : parts[0];
  }
  const when = catalog ? catalog.updatedAt : null;
  badgeFromMeta(plCheckBadge, plName, when);
  badgeFromMeta(snCheckBadge, snName, when);
  badgeFromMeta(
    stockAvailCheckBadge,
    stockAvailMeta && stockAvailMeta.fileName,
    stockAvailMeta && stockAvailMeta.updatedAt,
  );
  badgeFromMeta(barcodeCheckBadge, barcodeMeta && barcodeMeta.fileName, barcodeMeta && barcodeMeta.updatedAt);
  badgeFromMeta(
    rebornPriceCheckBadge,
    rebornPriceMeta && rebornPriceMeta.fileName,
    rebornPriceMeta && rebornPriceMeta.updatedAt,
  );
}

function renderMeta() {
  if (!catalog) {
    metaDetail.textContent = 'Belum ada data tersimpan';
    updateStaleBanner();
    return;
  }
  const d = new Date(catalog.updatedAt);
  const dateStr = d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  metaDetail.textContent = `Update terakhir ${dateStr} · ${catalog.items.length} item`;
  updateStaleBanner();
}

function renderEmpty() {
  if (!catalog) {
    currentScan = null;
    resultsEl.innerHTML =
      '<div class="empty">Belum ada data tersimpan di server.<br/>Staff gudang: masuk mode Staff lalu upload file Excel hari ini.</div>';
  } else if (currentScan) {
    renderScanResult();
    return;
  } else {
    resultsEl.innerHTML = '<div class="empty">Scan barcode, atau ketik nama / kode barang untuk mulai mencari.</div>';
  }
  footNote.textContent = '';
}

function buildCatalog(plRows, snRows, fileName) {
  const plMap = {};
  for (let i = 1; i < plRows.length; i++) {
    const r = plRows[i];
    if (!r || !r[1]) continue;
    const itemNo = String(r[1]).trim();
    const desc = r[2] ? String(r[2]).trim() : '';
    const whcode = r[3] ? String(r[3]).trim() : '';
    const available = Number(r[5]) || 0;
    const allocated = Number(r[6]) || 0;
    const instock = Number(r[7]) || 0;
    const price = Number(r[8]) || 0;
    if (!plMap[itemNo])
      plMap[itemNo] = { desc: '', price: 0, totalAvailable: 0, totalAllocated: 0, totalInStock: 0, locations: [] };
    plMap[itemNo].totalAvailable += available;
    plMap[itemNo].totalAllocated += allocated;
    plMap[itemNo].totalInStock += instock;
    plMap[itemNo].locations.push({ whcode, available, instock });
    if (desc) plMap[itemNo].desc = desc;
    if (price) plMap[itemNo].price = price;
  }

  const snMap = {};
  const snDesc = {};
  const ownUnitsMap = {};
  const otherUnitsMap = {}; // { itemCode: { whcode: [ {serial, admissionDate, ts} ] } } — SN milik cabang lain
  for (let i = 1; i < snRows.length; i++) {
    const r = snRows[i];
    if (!r || !r[1]) continue;
    const itemCode = String(r[1]).trim();
    const desc = r[2] ? String(r[2]).trim() : '';
    const serial = r[3] ? String(r[3]).trim() : '';
    const admDate = parseIdDate(r[4]);
    const whcode = r[5] ? String(r[5]).trim() : '';
    const status = r[7] ? String(r[7]).trim() : '';
    if (desc && !snDesc[itemCode]) snDesc[itemCode] = desc;

    if (whcode && (status === 'Available' || status === 'Allocated')) {
      if (whcode.startsWith('SDN')) {
        // Gudang sendiri: Allocated tetap ditampilkan (fisik masih bisa ada, alokasi bisa di-cancel untuk dijual)
        if (serial && admDate) {
          if (!ownUnitsMap[itemCode]) ownUnitsMap[itemCode] = [];
          ownUnitsMap[itemCode].push({ serial, whcode, admissionDate: admDate.display, ts: admDate.ts, status });
        }
      } else if (status === 'Available' || status === 'Allocated') {
        // Cabang lain: Available maupun Allocated dihitung ke total (fisik kemungkinan masih ada di
        // cabang itu, sama seperti perlakuan untuk gudang sendiri).
        if (!snMap[itemCode]) snMap[itemCode] = {};
        snMap[itemCode][whcode] = (snMap[itemCode][whcode] || 0) + 1;
        // Simpan nomor SN-nya per cabang (dengan status), supaya bisa dilihat saat barang datang
        if (serial) {
          if (!otherUnitsMap[itemCode]) otherUnitsMap[itemCode] = {};
          if (!otherUnitsMap[itemCode][whcode]) otherUnitsMap[itemCode][whcode] = [];
          otherUnitsMap[itemCode][whcode].push({
            serial,
            admissionDate: admDate ? admDate.display : '',
            ts: admDate ? admDate.ts : 0,
            status,
          });
        }
      }
    }
  }
  Object.keys(otherUnitsMap).forEach((code) => {
    Object.keys(otherUnitsMap[code]).forEach((wh) => {
      otherUnitsMap[code][wh].sort((a, b) => a.ts - b.ts);
    });
  });

  const serialIndex = {};
  Object.keys(ownUnitsMap).forEach((code) => {
    ownUnitsMap[code].sort((a, b) => a.ts - b.ts);
    ownUnitsMap[code].forEach((u, idx) => {
      serialIndex[u.serial] = {
        code,
        desc: snDesc[code] || (plMap[code] ? plMap[code].desc : ''),
        price: plMap[code] ? plMap[code].price : null,
        admissionDate: u.admissionDate,
        whcode: u.whcode,
        status: u.status,
        rank: idx,
        oldestSerial: ownUnitsMap[code][0].serial,
        oldestDate: ownUnitsMap[code][0].admissionDate,
      };
    });
  });

  const allCodes = new Set([
    ...Object.keys(plMap),
    ...Object.keys(snMap),
    ...Object.keys(snDesc),
    ...Object.keys(ownUnitsMap),
    ...Object.keys(stockAvailMap),
  ]);
  const items = [];
  allCodes.forEach((code) => {
    const pl = plMap[code];
    const snOthers = snMap[code] || null;
    items.push({
      code,
      desc: (pl && pl.desc) || snDesc[code] || stockAvailDesc[code] || '(tanpa nama)',
      price: pl ? pl.price : null,
      available: pl ? pl.totalAvailable : 0,
      allocatedOwn: pl ? pl.totalAllocated : 0,
      others: mergeOthers(snOthers, stockAvailMap[code]),
      snOthers: snOthers,
      otherUnits: otherUnitsMap[code] || null,
      ownUnits: ownUnitsMap[code] || null,
      inOwnList: !!pl,
      fromStockAvail: !pl && !snOthers && !ownUnitsMap[code] && !snDesc[code] && !!stockAvailMap[code],
    });
  });

  return { items, serialIndex, updatedAt: new Date().toISOString(), fileName };
}
