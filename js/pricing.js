// Harga dari Price List Manual

// ===== Price List Manual =====
// Sumber: file "Manual Serial Number / ACC / PriceList" (kolom: #, Item Description, Barcode/Imei, Price, WhsCode).
// Fungsinya melengkapi harga barang yang TIDAK punya harga di Price List utama (umumnya barang INDENT
// dari cabang lain). Harga dari Price List utama TIDAK PERNAH ditimpa — file ini hanya mengisi yang kosong.
// Disimpan ringkas (satu harga per deskripsi / barcode), bukan 96 ribu baris mentah.
let MANUAL_PRICE = { byDesc: {}, byBarcode: {} };
let manualPriceMeta = null; // { fileName, updatedAt, products, rows }

function normDesc(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Return { price, source } -> source: 'pl' (Price List utama) | 'manual' | null
function getEffectivePrice(it) {
  if (it && Number(it.price) > 0) return { price: Number(it.price), source: 'pl' };
  const m = lookupManualPrice(it);
  if (m) return { price: m, source: 'manual' };
  return { price: it && it.price !== undefined ? it.price : null, source: null };
}

function lookupManualPrice(it, store) {
  if (!it) return null;
  const mp = store || MANUAL_PRICE;
  // 1) lewat barcode kode barang (paling presisi), 2) lewat deskripsi persis
  const bcs = getBarcodes(it.code);
  if (bcs) {
    for (const b of bcs) {
      const p = mp.byBarcode && mp.byBarcode[String(b).trim()];
      if (p > 0) return p;
    }
  }
  if (it.desc && it.desc !== '(tanpa nama)') {
    const p = mp.byDesc && mp.byDesc[normDesc(it.desc)];
    if (p > 0) return p;
  }
  return null;
}
