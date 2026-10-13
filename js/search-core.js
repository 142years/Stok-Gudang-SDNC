// Inti pencarian & filter (tanpa DOM). Dipakai search.js, scanner.js, dan filter-ui.js.

// ---------- pembersihan teks ----------
// HP sering menyisipkan karakter yang tidak terlihat atau berbeda bentuk (angka lebar penuh, spasi nol-lebar,
// strip khusus) saat mengetik, paste, atau dari aplikasi kamera. Semua dinormalkan di sini.
function cleanQuery(s) {
  return String(s === null || s === undefined ? '' : s)
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- teks pencarian per barang ----------
// Disimpan di luar objek barang (WeakMap) supaya TIDAK ikut tersimpan ke server, dan dibuang otomatis
// begitu data barcode berganti (BARCODE_MAP diganti objek baru tiap dimuat/diupload).
let _hayCache = new WeakMap(),
  _hayBarcodes = null;
function getItemSearchHay(it) {
  if (_hayBarcodes !== BARCODE_MAP) {
    _hayCache = new WeakMap();
    _hayBarcodes = BARCODE_MAP;
  }
  let h = _hayCache.get(it);
  if (h !== undefined) return h;
  h = String(it.desc || '') + ' ' + String(it.code || '');
  if (it.ownUnits && it.ownUnits.length) h += ' ' + it.ownUnits.map((u) => u.serial).join(' ');
  const bc = getBarcodes(it.code);
  if (bc && bc.length) h += ' ' + bc.join(' ');
  h = h.toLowerCase();
  _hayCache.set(it, h);
  return h;
}

// ---------- jenis, brand, harga, stok ----------
const _metaCache = new WeakMap();
function itemMeta(it) {
  let m = _metaCache.get(it);
  if (m) return m;
  const parts = String(it.code || '').trim().toUpperCase().split('.');
  m = { cat: parts[0] || '', brand: parts.length > 2 ? parts[1] : '', type: parts.length > 2 ? parts[2].replace(/\d+$/, '') : '' };
  const t = FILTER_TYPES.find((x) => x.test(m, it));
  m.jenis = t ? t.id : 'lainnya';
  _metaCache.set(it, m);
  return m;
}
function brandKey(it) {
  return itemMeta(it).brand || '?';
}
function brandLabel(code) {
  return code === '?' ? 'Lainnya' : FILTER_BRAND_NAMES[code] || code;
}
function jenisLabel(id) {
  const t = FILTER_TYPES.find((x) => x.id === id);
  return t ? t.label : 'Lainnya';
}
function itemPrice(it) {
  const p = getEffectivePrice(it).price;
  return p > 0 ? Number(p) : null;
}
// 0 = READY, 1 = INDENT (ada di cabang lain), 2 = HABIS
function stockGroup(it) {
  if ((it.available || 0) + (it.allocatedOwn || 0) > 0) return 0;
  return it.others ? 1 : 2;
}
function fmtJt(n) {
  if (n >= 1000000) return String(Math.round((n / 1000000) * 10) / 10).replace('.', ',') + ' jt';
  return Math.round(n / 1000) + ' rb';
}

// ---------- filter ----------
function defaultFilters() {
  return { jenis: '', brand: '', min: null, max: null, stock: 'all', sort: 'relevan' };
}
const searchFilters = defaultFilters();
function filtersActive(f) {
  f = f || searchFilters;
  return !!(f.jenis || f.brand || f.min !== null || f.max !== null || f.stock !== 'all');
}
function priceFilterActive(f) {
  f = f || searchFilters;
  return f.min !== null || f.max !== null;
}
// skip = dimensi yang diabaikan ('jenis' | 'brand' | 'harga' | 'stok'), dipakai untuk menghitung jumlah per pilihan
function matchFilters(it, f, skip) {
  const m = itemMeta(it);
  if (skip !== 'jenis' && f.jenis && m.jenis !== f.jenis) return false;
  if (skip !== 'brand' && f.brand && (m.brand || '?') !== f.brand) return false;
  if (skip !== 'stok' && f.stock !== 'all') {
    const g = stockGroup(it);
    if (f.stock === 'ready' && g !== 0) return false;
    if (f.stock === 'ada' && g > 1) return false;
  }
  if (skip !== 'harga' && priceFilterActive(f)) {
    const p = itemPrice(it);
    if (p === null) return false;
    if (f.min !== null && p < f.min) return false;
    if (f.max !== null && p > f.max) return false;
  }
  return true;
}

// ---------- pencarian ----------
function scoreText(it, words) {
  const desc = String(it.desc || '').toLowerCase(),
    code = String(it.code || '').toLowerCase();
  let s = 0;
  words.forEach((w) => {
    if (code === w) s += 100;
    else if (code.startsWith(w)) s += 20;
    if (desc.startsWith(w)) s += 8;
    else if ((' ' + desc).includes(' ' + w)) s += 4;
    else if (desc.includes(w)) s += 2;
    else s += 1;
  });
  return s;
}
function _cmpPrice(a, b, dir) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return dir * (a - b);
}
function _sorter(sort) {
  const byDesc = (x, y) => String(x.it.desc).localeCompare(String(y.it.desc));
  if (sort === 'harga-asc') return (x, y) => _cmpPrice(x.p, y.p, 1) || x.g - y.g || byDesc(x, y);
  if (sort === 'harga-desc') return (x, y) => _cmpPrice(x.p, y.p, -1) || x.g - y.g || byDesc(x, y);
  if (sort === 'stok')
    return (x, y) =>
      (y.it.available || 0) + (y.it.allocatedOwn || 0) - ((x.it.available || 0) + (x.it.allocatedOwn || 0)) || x.g - y.g || byDesc(x, y);
  // relevan: READY dulu, lalu INDENT, lalu HABIS; di dalamnya yang paling cocok dengan kata kunci, lalu harga termurah
  return (x, y) => x.g - y.g || y.s - x.s || _cmpPrice(x.p, y.p, 1) || byDesc(x, y);
}
// Hasil: { exact: barang yang barcode/SN/kodenya PERSIS sama (selalu di atas, tidak kena filter),
//          list: sisanya (sudah difilter & diurutkan), noPrice: jumlah yang cocok tapi tak punya harga }
function runSearch(rawQuery, f) {
  f = f || searchFilters;
  const out = { exact: [], list: [], noPrice: 0 };
  if (!catalog || !catalog.items) return out;
  const qc = cleanQuery(rawQuery);
  const words = qc.toLowerCase().split(' ').filter(Boolean);
  const exactSet = new Set();
  if (words.length === 1 && qc.length >= 4) {
    const r = resolveScan(qc);
    if (r) {
      const byCode = scanIndex().byCode;
      r.codes.forEach((c) => {
        const it = byCode.get(String(c).trim().toUpperCase());
        if (it && !exactSet.has(it)) {
          exactSet.add(it);
          out.exact.push(it);
        }
      });
    }
  }
  const browse = !words.length;
  if (browse && !filtersActive(f)) return out;
  const scored = [];
  const needPrice = priceFilterActive(f);
  for (const it of catalog.items) {
    if (exactSet.has(it)) continue;
    if (!browse) {
      const hay = getItemSearchHay(it);
      let ok = true;
      for (let i = 0; i < words.length; i++) {
        if (!hay.includes(words[i])) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
    }
    if (!matchFilters(it, f)) {
      if (needPrice && matchFilters(it, f, 'harga') && itemPrice(it) === null) out.noPrice++;
      continue;
    }
    scored.push({ it, s: browse ? 0 : scoreText(it, words), g: stockGroup(it), p: itemPrice(it) });
  }
  scored.sort(_sorter(f.sort));
  out.list = scored.map((x) => x.it);
  return out;
}

// Jumlah barang per pilihan jenis & brand, mengikuti kata kunci dan filter lain yang sedang aktif
function facetCounts(rawQuery, f) {
  f = f || searchFilters;
  const jenis = new Map(),
    brand = new Map();
  if (!catalog || !catalog.items) return { jenis, brand };
  const words = cleanQuery(rawQuery).toLowerCase().split(' ').filter(Boolean);
  for (const it of catalog.items) {
    if (words.length) {
      const hay = getItemSearchHay(it);
      if (!words.every((w) => hay.includes(w))) continue;
    }
    if (matchFilters(it, f, 'jenis')) {
      const j = itemMeta(it).jenis;
      jenis.set(j, (jenis.get(j) || 0) + 1);
    }
    if (matchFilters(it, f, 'brand')) {
      const b = brandKey(it);
      brand.set(b, (brand.get(b) || 0) + 1);
    }
  }
  return { jenis, brand };
}
