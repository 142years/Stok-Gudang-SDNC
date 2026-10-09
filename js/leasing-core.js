// Skema Leasing — pembaca file Excel & pencarian (tanpa DOM, bisa dites di Node)
// Sumber: file "SKEMA_LEASING_*.xlsx" (sheet REKAP). Struktur yang dikenali dari NAMA kolom, bukan posisi:
//   baris judul : BRAND | ITEM NAME | SRP | PRICE AFTER CB | SUB LEASING ... | FEE LEASING | SISA MARGIN | <program 1> | <program 2> ...
//   baris di atasnya : nama lembaga (INDODANA, KREDITPLUS, ...) pada sel gabungan di atas kelompok kolomnya
// Isi sel program: angka = biaya admin (Rp) · ✔ = disubsidi/gratis admin · ❌ = tidak ada subsidi (berlaku kolom Sub Leasing)
// Yang TIDAK disimpan (data internal/margin): SRP, PRICE AFTER CB, FEE LEASING, SISA MARGIN.

const LEASING_KEY = 'leasing:latest';
let LEASING = null; // { programs:[{c,col,g,t,h}], items:[{r,b,n,e,v:[...]}], note }
let leasingMeta = null; // { fileName, updatedAt, products, programs }

function leasingClean(s) {
  return String(s === null || s === undefined ? '' : s).replace(/\s+/g, ' ').trim();
}
function leasingNormName(s) {
  return leasingClean(s).toUpperCase();
}
// Nilai sel -> null untuk kosong/error (#N/A); error di SheetJS bertipe 'e' dan nilainya KODE angka, bukan angka sebenarnya.
function leasingCellValue(cell) {
  if (!cell || cell.t === 'e' || cell.v === undefined || cell.v === null) return null;
  if (cell.t === 'n') return cell.v;
  const s = String(cell.v).trim();
  return s === '' ? null : s;
}
// angka -> angka | ✔ -> 'v' | ❌ -> 'x' | selain itu null
function leasingMark(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (/^[\u2714\u2713\u2705\u2611]/.test(s)) return 'v';
  if (/^[\u274C\u2716\u2717\u2718\u274E]/.test(s)) return 'x';
  return null;
}
function leasingLooksLikeHeader(texts) {
  const j = texts.join(' | ').toLowerCase();
  return j.includes('item name') && j.includes('srp') && j.includes('sub leasing');
}

// Dipakai untuk mengenali file saat upload: baris judul tidak harus di baris pertama.
function leasingIsSheetRows(rows) {
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    if (leasingLooksLikeHeader((rows[i] || []).map((c) => String(c === null || c === undefined ? '' : c)))) return true;
  }
  return false;
}

// XLSX = pustaka SheetJS, ws = worksheet. Hasil: { programs, items, note, stats } atau null bila bukan file skema.
function leasingParseSheet(XLSX, ws) {
  if (!ws || !ws['!ref']) return null;
  const rng = XLSX.utils.decode_range(ws['!ref']);
  const get = (r, c) => leasingCellValue(ws[XLSX.utils.encode_cell({ r, c })]);
  let hr = -1;
  for (let r = rng.s.r; r <= Math.min(rng.s.r + 6, rng.e.r) && hr < 0; r++) {
    const texts = [];
    for (let c = rng.s.c; c <= rng.e.c; c++) texts.push(String(get(r, c) || ''));
    if (leasingLooksLikeHeader(texts)) hr = r;
  }
  if (hr < 0) return null;
  const find = (kw) => {
    for (let c = rng.s.c; c <= rng.e.c; c++) if (String(get(hr, c) || '').toLowerCase().includes(kw)) return c;
    return -1;
  };
  const cName = find('item name'),
    cBrand = find('brand'),
    cE = find('sub leasing'),
    cFee = find('fee leasing'),
    cMargin = find('sisa margin');
  const progStart = Math.max(cE, cFee, cMargin) + 1;
  const hiddenCols = new Set();
  (ws['!cols'] || []).forEach((cd, i) => {
    if (cd && cd.hidden) hiddenCols.add(i);
  });

  const programs = [];
  let group = '';
  for (let c = progStart; c <= rng.e.c; c++) {
    const g = hr > 0 ? leasingClean(get(hr - 1, c)) : '';
    if (g) group = g;
    const title = leasingClean(get(hr, c));
    if (!title) continue;
    programs.push({ c, col: XLSX.utils.encode_col(c), g: group, t: title, h: hiddenCols.has(c) });
  }
  const noteRaw = hr > 0 ? leasingClean(get(hr - 1, rng.s.c)) : '';
  const note = noteRaw.length > 25 ? noteRaw : '';

  const items = [];
  const seen = new Map();
  let dupDropped = 0;
  for (let r = hr + 1; r <= rng.e.r; r++) {
    const name = get(r, cName);
    if (typeof name !== 'string' || !leasingClean(name)) continue; // baris nomor kolom / kosong
    const e = get(r, cE);
    const it = {
      r: r + 1, // nomor baris di Excel, untuk pengecekan manual
      b: leasingClean(get(r, cBrand)),
      n: leasingClean(name),
      e: typeof e === 'number' && e >= 0 ? e : null,
      v: programs.map((p) => leasingMark(get(r, p.c))),
    };
    const key = leasingNormName(it.n);
    const sig = JSON.stringify([it.e, it.v]);
    if (seen.has(key)) {
      const prev = seen.get(key);
      if (prev.sig === sig) {
        dupDropped++;
        continue; // ganda & identik: cukup satu
      }
      prev.it.dup = true; // ganda tapi ISINYA BEDA: tampilkan keduanya + peringatan
      it.dup = true;
    } else seen.set(key, { it, sig });
    items.push(it);
  }
  const stats = {
    products: items.length,
    programs: programs.length,
    hiddenPrograms: programs.filter((p) => p.h).length,
    dupDropped,
    conflicts: items.filter((i) => i.dup).length,
  };
  return { programs, items, note, stats };
}

// ---------- pencarian & hasil ----------
function leasingSearch(data, q, brand, limit) {
  if (!data) return [];
  const words = leasingNormName(q).split(' ').filter(Boolean);
  const out = [];
  for (const it of data.items) {
    if (brand && it.b !== brand) continue;
    if (words.length) {
      const hay = leasingNormName(it.n + ' ' + it.b);
      if (!words.every((w) => hay.includes(w))) continue;
    }
    out.push(it);
    if (out.length >= (limit || 40)) break;
  }
  return out;
}
function leasingBrands(data) {
  return data ? Array.from(new Set(data.items.map((i) => i.b).filter(Boolean))).sort() : [];
}
// Arti satu sel untuk satu produk. cfg = LEASING_CONFIG, rp = pemformat rupiah
function leasingResult(item, v, cfg, rp) {
  if (typeof v === 'number') {
    return v === 0
      ? { cls: 'free', text: 'Rp0 — tidak ada biaya admin' }
      : { cls: 'fee', text: `${cfg.textFeePrefix} ${rp(v)}` };
  }
  if (v === 'v') return { cls: 'free', text: cfg.textFree };
  if (v === 'x')
    return {
      cls: 'nosub',
      text: item.e !== null && item.e !== undefined ? `${cfg.textNoSubsidy} → ${cfg.textNoSubsidyFallback} ${rp(item.e)}` : cfg.textNoSubsidy,
    };
  return { cls: 'na', text: cfg.textNoData };
}
function leasingProviderName(p, cfg) {
  const t = leasingNormName(p.t);
  for (const [pref, name] of cfg.providerByTitle || []) if (t.startsWith(pref)) return name;
  const g = p.g || 'LAINNYA';
  return (cfg.providerAlias && cfg.providerAlias[g]) || g;
}
// Kelompokkan program per lembaga (urutan sama seperti di Excel), tanpa program tersembunyi bila diatur begitu
function leasingGroups(data, item, cfg, opts) {
  const groups = [];
  const idx = new Map();
  data.programs.forEach((p, i) => {
    if (p.h && !cfg.showHiddenPrograms) return;
    const v = item.v[i];
    const res = leasingResult(item, v, cfg, opts.rp);
    if (res.cls === 'na' && !opts.showEmpty) return;
    const gname = leasingProviderName(p, cfg);
    let g = idx.get(gname);
    if (!g) {
      g = { name: gname, rows: [] };
      idx.set(gname, g);
      groups.push(g);
    }
    g.rows.push({ title: p.t, res, col: p.col });
  });
  return groups;
}

if (typeof module !== 'undefined') {
  module.exports = { leasingParseSheet, leasingIsSheetRows, leasingSearch, leasingBrands, leasingResult, leasingGroups, leasingMark, leasingCellValue, leasingProviderName };
}
