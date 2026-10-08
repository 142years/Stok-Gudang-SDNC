// Harga dari Price List Reborn

// ===== Price List Reborn =====
// Sumber: file "Reborn_PriceList" (kolom: #, Item No., Item Description, Retail, Gro-1 ... Gro-6, Retail-AMT).
// Yang dipakai HANYA kolom "Retail", dicocokkan lewat kode barang (Item No.).
// Fungsinya melengkapi harga barang yang TIDAK punya harga di Price List utama (umumnya barang
// dari cabang lain / status INDENT). Harga dari Price List utama TIDAK PERNAH ditimpa — file ini
// hanya mengisi yang kosong. Menggantikan file lama "Manual Serial Number / ACC / PriceList".
// Disimpan ringkas: hanya barang dengan harga Retail > 0.
let REBORN_PRICE = { byCode: {} };
let rebornPriceMeta = null; // { fileName, updatedAt, products, rows }

function normCode(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Return { price, source } -> source: 'pl' (Price List utama) | 'reborn' | null
function getEffectivePrice(it) {
  if (it && Number(it.price) > 0) return { price: Number(it.price), source: 'pl' };
  const m = lookupRebornPrice(it);
  if (m) return { price: m, source: 'reborn' };
  return { price: it && it.price !== undefined ? it.price : null, source: null };
}

function lookupRebornPrice(it, store) {
  if (!it || !it.code) return null;
  const byCode = (store || REBORN_PRICE).byCode || {};
  const p = byCode[normCode(it.code)];
  return p > 0 ? p : null;
}
