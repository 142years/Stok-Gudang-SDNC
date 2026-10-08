// Nota Digital — logika inti (tanpa DOM, supaya mudah dites)
// Pengganti nota tulis frontliner/promotor. Alur status:
//   draft -> diajukan -> divalidasi -> selesai (No. Delivery diisi, nota terkunci)
//   (staf bisa mengembalikan ke draft untuk diperbaiki; nota bisa dibatalkan)

const NOTA_CONFIG = {
  title: 'NOTA SEMENTARA',
  footer:
    'Nota sementara dari frontliner/promotor. Bukti pembelian resmi diterbitkan setelah nota divalidasi dan diproses kasir/gudang.',
  mineKey: 'nota:mine', // daftar nota yang dibuat di perangkat ini (localStorage)
  draftKey: 'nota:draft', // isi form yang sedang diketik (localStorage), supaya tidak hilang
  mirrorPrefix: 'nota:local:', // salinan lokal tiap nota (cadangan kalau sinyal putus)
  pendingKey: 'nota:pending', // nota yang perubahannya belum terkirim ke server
  prefsKey: 'nota:prefs', // nama petugas / cabang terakhir
  maxMine: 200,
};

const NOTA_STATUS = {
  draft: 'Draft',
  diajukan: 'Menunggu validasi',
  divalidasi: 'Divalidasi',
  selesai: 'Selesai (terkunci)',
  batal: 'Dibatalkan',
};
const NOTA_PRICE_TYPES = [
  { id: 'normal', label: 'Normal' },
  { id: 'promo', label: 'Promo' },
  { id: 'cashback', label: 'Cashback' },
  { id: 'tebus', label: 'Tebus Murah' },
  { id: 'khusus', label: 'Harga Khusus' },
];
const NOTA_PAY_METHODS = ['Tunai', 'Transfer', 'QRIS', 'Debit', 'Kartu Kredit', 'Kredit/Cicilan', 'Lainnya'];

// ---------- penyimpanan lokal (aman walau localStorage tidak tersedia) ----------
const _notaMem = {};
function notaLsGet(k) {
  try {
    const v = localStorage.getItem(k);
    return v === null ? null : JSON.parse(v);
  } catch (e) {
    return _notaMem[k] === undefined ? null : JSON.parse(_notaMem[k]);
  }
}
function notaLsSet(k, v) {
  const s = JSON.stringify(v);
  try {
    localStorage.setItem(k, s);
  } catch (e) {
    _notaMem[k] = s;
  }
}
function notaLsDel(k) {
  try {
    localStorage.removeItem(k);
  } catch (e) {}
  delete _notaMem[k];
}

// ---------- pembuat nota & nomor ----------
function notaPad2(n) {
  return String(n).padStart(2, '0');
}
function notaLocalDate(d) {
  d = d || new Date();
  return `${d.getFullYear()}-${notaPad2(d.getMonth() + 1)}-${notaPad2(d.getDate())}`;
}
function notaRand(len) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // tanpa huruf/angka yang mirip (O/0, I/1)
  let out = '';
  const buf = new Uint32Array(len);
  (typeof crypto !== 'undefined' && crypto.getRandomValues ? crypto : require('crypto').webcrypto).getRandomValues(buf);
  for (let i = 0; i < len; i++) out += abc[buf[i] % abc.length];
  return out;
}
function notaNewId(d) {
  d = d || new Date();
  return `NTA-${String(d.getFullYear()).slice(2)}${notaPad2(d.getMonth() + 1)}${notaPad2(d.getDate())}-${notaRand(4)}`;
}
function notaEmptyItem() {
  return {
    code: '',
    desc: '',
    qty: 1,
    price: null,
    listPrice: null,
    priceSource: null,
    priceType: 'normal',
    note: '',
    serial: '',
    manual: false,
    pickedDesc: '',
  };
}
function notaNew(prefs, now) {
  now = now || new Date();
  prefs = prefs || {};
  return {
    v: 1,
    id: notaNewId(now),
    date: notaLocalDate(now),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    rev: 0,
    status: 'draft',
    fl: { name: prefs.flName || '', role: prefs.role || 'Frontliner' },
    branch: prefs.branch || '',
    customer: { name: '', phone: '', code: '' },
    items: [notaEmptyItem()],
    payments: [],
    note: '',
    total: 0,
    paid: 0,
    returnNote: '',
    validation: null,
    delivery: null,
    cancel: null,
    history: [],
  };
}
function notaKey(n) {
  return `nota:${n.date}:${n.id}`;
}

// ---------- angka ----------
function notaParseMoney(s) {
  const d = String(s === null || s === undefined ? '' : s).replace(/\D/g, '');
  return d === '' ? null : parseInt(d, 10);
}
function notaLineSubtotal(it) {
  const q = Number(it.qty),
    p = Number(it.price);
  return Number.isFinite(q) && Number.isFinite(p) ? q * p : 0;
}
function notaPriceChanged(it) {
  return it.listPrice !== null && it.listPrice !== undefined && it.price !== null && Number(it.price) !== Number(it.listPrice);
}
function notaTotals(n) {
  const total = n.items.reduce((s, it) => s + notaLineSubtotal(it), 0);
  const paid = n.payments.reduce((s, p) => s + (Number(p.amount) > 0 ? Number(p.amount) : 0), 0);
  let state = 'kosong';
  if (total > 0) state = paid === 0 ? 'belum' : paid < total ? 'dp' : paid === total ? 'lunas' : 'lebih';
  return { total, paid, diff: paid - total, state };
}
const NOTA_PAY_LABEL = { kosong: '', belum: 'BELUM BAYAR', dp: 'DP / KURANG', lunas: 'LUNAS', lebih: 'LEBIH BAYAR' };

// ---------- nomor HP ----------
function notaNormPhone(s) {
  let d = String(s || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+62')) d = '0' + d.slice(3);
  else if (d.startsWith('62')) d = '0' + d.slice(2);
  d = d.replace(/\D/g, '');
  const ok = /^08\d{7,12}$/.test(d);
  const display = ok ? d.replace(/^(\d{4})(\d{3,4})(\d+)$/, '$1-$2-$3') : String(s || '').trim();
  return { ok, digits: d, display };
}

// ---------- validasi ----------
function notaValidate(n) {
  const errors = [],
    warnings = [];
  if (!n.fl.name.trim()) errors.push('Nama frontliner/promotor wajib diisi.');
  if (!String(n.branch || '').trim()) errors.push('Cabang/toko wajib diisi.');
  if (!n.customer.name.trim()) errors.push('Nama pelanggan wajib diisi.');
  if (n.customer.phone.trim() && !notaNormPhone(n.customer.phone).ok)
    errors.push('Nomor HP pelanggan tidak valid (contoh: 0812 3456 7890).');
  if (!n.items.length) errors.push('Belum ada barang.');
  n.items.forEach((it, i) => {
    const t = `Barang ${i + 1}`;
    if (!String(it.desc || '').trim()) errors.push(`${t}: nama barang masih kosong.`);
    if (!Number.isInteger(it.qty) || it.qty < 1) errors.push(`${t}: jumlah harus bilangan bulat minimal 1.`);
    if (it.price === null || it.price === '' || !Number.isFinite(Number(it.price)) || Number(it.price) < 0)
      errors.push(`${t}: harga belum diisi.`);
    else if (Number(it.price) === 0) warnings.push(`${t}: harga Rp0.`);
    if (notaPriceChanged(it) && it.priceType === 'normal')
      warnings.push(`${t}: harga berbeda dari price list tapi jenis harga masih "Normal".`);
    if (it.manual) warnings.push(`${t}: barang diketik manual (tidak ada di katalog).`);
  });
  const t = notaTotals(n);
  if (t.total > 0 && t.paid === 0) warnings.push('Belum ada pembayaran tercatat.');
  else if (t.state === 'dp') warnings.push('Pembayaran belum lunas (DP/kurang).');
  return { errors, warnings };
}

// ---------- status & hak edit ----------
function notaCanEdit(n, role) {
  if (role === 'staff') return ['draft', 'diajukan', 'divalidasi'].includes(n.status);
  return n.status === 'draft';
}

// Terapkan satu aksi pada SALINAN nota. role: 'fl' | 'staff'.
// ctx: { role, by, note, deliveryNo }
function notaApply(n, act, ctx) {
  ctx = ctx || {};
  const c = JSON.parse(JSON.stringify(n));
  const by = String(ctx.by || '').trim();
  const note = String(ctx.note || '').trim();
  const staff = ctx.role === 'staff';
  const now = new Date().toISOString();
  const log = (a, t) => c.history.push({ at: now, by: by || '-', act: a, note: t || '' });
  const fail = (m) => ({ ok: false, error: m });
  switch (act) {
    case 'submit': {
      if (c.status !== 'draft') return fail('Nota ini bukan draft.');
      const v = notaValidate(c);
      if (v.errors.length) return { ok: false, error: v.errors[0], errors: v.errors };
      c.status = 'diajukan';
      c.returnNote = '';
      log('diajukan');
      break;
    }
    case 'validate': {
      if (!staff) return fail('Hanya staf yang bisa memvalidasi.');
      if (c.status !== 'diajukan') return fail('Hanya nota berstatus "Menunggu validasi" yang bisa divalidasi.');
      if (!by) return fail('Isi nama staf yang memvalidasi.');
      const v = notaValidate(c);
      if (v.errors.length) return { ok: false, error: v.errors[0], errors: v.errors };
      c.status = 'divalidasi';
      c.validation = { by, at: now, note };
      log('divalidasi', note);
      break;
    }
    case 'return': {
      if (!staff) return fail('Hanya staf yang bisa mengembalikan nota.');
      if (!['diajukan', 'divalidasi'].includes(c.status)) return fail('Nota tidak bisa dikembalikan pada status ini.');
      if (!note) return fail('Tulis alasan pengembalian supaya frontliner tahu apa yang diperbaiki.');
      c.status = 'draft';
      c.returnNote = note;
      c.validation = null;
      log('dikembalikan ke frontliner', note);
      break;
    }
    case 'deliver': {
      if (!staff) return fail('Hanya staf yang bisa mengisi No. Delivery.');
      if (c.status !== 'divalidasi') return fail('Nota harus divalidasi dulu sebelum mengisi No. Delivery.');
      const no = String(ctx.deliveryNo || '').trim();
      if (!no) return fail('No. Delivery wajib diisi.');
      if (!/^[A-Za-z0-9][A-Za-z0-9\-\/._ ]{1,39}$/.test(no)) return fail('No. Delivery tidak valid (2–40 karakter huruf/angka/-/).');
      if (!by) return fail('Isi nama staf yang menginput.');
      c.delivery = { no, by, at: now };
      c.status = 'selesai';
      log('No. Delivery diinput & nota dikunci', no);
      break;
    }
    case 'cancel': {
      const ok = staff ? ['draft', 'diajukan', 'divalidasi'].includes(c.status) : c.status === 'draft';
      if (!ok) return fail('Nota tidak bisa dibatalkan pada status ini.');
      if (!note) return fail('Tulis alasan pembatalan.');
      c.status = 'batal';
      c.cancel = { reason: note, by: by || '-', at: now };
      log('dibatalkan', note);
      break;
    }
    case 'reopen': {
      if (!staff) return fail('Hanya staf yang bisa membuka kunci.');
      if (c.status !== 'selesai') return fail('Nota belum terkunci.');
      if (!note) return fail('Tulis alasan membuka kunci (koreksi).');
      log('kunci dibuka untuk koreksi (delivery sebelumnya: ' + ((c.delivery && c.delivery.no) || '-') + ')', note);
      c.delivery = null;
      c.status = 'divalidasi';
      break;
    }
    case 'edit': {
      if (!notaCanEdit(c, staff ? 'staff' : 'fl')) return fail('Nota ini tidak bisa diedit lagi.');
      if (c.status === 'divalidasi') {
        c.status = 'diajukan';
        c.validation = null;
        log('diedit setelah validasi — perlu validasi ulang', note);
      } else if (c.status === 'diajukan') {
        log('diedit staf', note);
      }
      break;
    }
    default:
      return fail('Aksi tidak dikenal.');
  }
  return { ok: true, nota: c };
}

// ---------- ekspor ----------
function notaCsvCell(v, isText) {
  let s = v === null || v === undefined ? '' : String(v);
  if (isText && /^[=+\-@\t\r]/.test(s)) s = "'" + s; // cegah formula injection di Excel
  return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
// Satu baris per barang. Pemisah ';' (cocok untuk Excel berbahasa Indonesia).
function notaToCsv(list) {
  const head = [
    'No Nota', 'Tanggal', 'Status', 'Petugas', 'Peran', 'Cabang', 'Pelanggan', 'No Customer', 'No HP',
    'Kode Barang', 'Nama Barang', 'Qty', 'Harga Satuan', 'Jenis Harga', 'Subtotal', 'No Seri/IMEI',
    'Total Nota', 'Terbayar', 'No Delivery', 'Divalidasi Oleh',
  ];
  const typeLabel = (id) => (NOTA_PRICE_TYPES.find((t) => t.id === id) || {}).label || id;
  const rows = [head.map((h) => notaCsvCell(h)).join(';')];
  list.forEach((n) => {
    const t = notaTotals(n);
    const ph = n.customer.phone ? notaNormPhone(n.customer.phone).display : '';
    n.items.forEach((it) => {
      rows.push(
        [
          notaCsvCell(n.id), notaCsvCell(n.date), notaCsvCell(NOTA_STATUS[n.status] || n.status),
          notaCsvCell(n.fl.name, true), notaCsvCell(n.fl.role), notaCsvCell(n.branch, true),
          notaCsvCell(n.customer.name, true), notaCsvCell(n.customer.code, true), notaCsvCell(ph),
          notaCsvCell(it.code, true), notaCsvCell(it.desc, true), notaCsvCell(it.qty), notaCsvCell(it.price),
          notaCsvCell(typeLabel(it.priceType)), notaCsvCell(notaLineSubtotal(it)), notaCsvCell(it.serial, true),
          notaCsvCell(t.total), notaCsvCell(t.paid), notaCsvCell((n.delivery && n.delivery.no) || '', true),
          notaCsvCell((n.validation && n.validation.by) || '', true),
        ].join(';'),
      );
    });
  });
  return rows.join('\r\n');
}
// Untuk ditempel/disalin saat input ke Web Resmi: kode, nama, qty, harga (dipisah tab)
function notaToTsv(n) {
  const lines = ['Kode\tNama Barang\tQty\tHarga Satuan'];
  n.items.forEach((it) => lines.push([it.code || '(manual)', it.desc, it.qty, it.price].join('\t')));
  return lines.join('\n');
}

// ---------- server (Supabase tabel app_data, key: nota:<tanggal>:<id>) ----------
function notaMineList() {
  return notaLsGet(NOTA_CONFIG.mineKey) || [];
}
function notaMineAdd(n) {
  const list = notaMineList().filter((x) => x.id !== n.id);
  list.unshift({ id: n.id, date: n.date });
  notaLsSet(NOTA_CONFIG.mineKey, list.slice(0, NOTA_CONFIG.maxMine));
}
function notaPendingSet(id, on) {
  const s = new Set(notaLsGet(NOTA_CONFIG.pendingKey) || []);
  if (on) s.add(id);
  else s.delete(id);
  notaLsSet(NOTA_CONFIG.pendingKey, Array.from(s));
}
function notaIsPending(id) {
  return (notaLsGet(NOTA_CONFIG.pendingKey) || []).includes(id);
}
function notaMirror(n) {
  notaLsSet(NOTA_CONFIG.mirrorPrefix + n.id, n);
}
function notaMirrorGet(id) {
  return notaLsGet(NOTA_CONFIG.mirrorPrefix + id);
}

// Simpan ke server dengan pengecekan versi (rev) supaya perubahan orang lain tidak tertimpa.
// Nota SELALU disalin lokal dulu — kalau sinyal putus, datanya aman dan bisa dikirim ulang.
async function notaSaveCloud(n) {
  const expectedRev = Number(n.rev) || 0;
  const c = JSON.parse(JSON.stringify(n));
  c.rev = expectedRev + 1;
  c.updatedAt = new Date().toISOString();
  const t = notaTotals(c);
  c.total = t.total;
  c.paid = t.paid;
  // Selama belum terkonfirmasi server, salinan lokal memakai rev LAMA (supaya kirim ulang tidak dianggap konflik)
  notaMirror(Object.assign({}, c, { rev: expectedRev }));
  notaMineAdd(c);
  notaPendingSet(c.id, true);
  const key = notaKey(c);
  const tbl = () => sbClient.from('app_data');
  try {
    const cur = await tbl().select('r:payload->>rev').eq('key', key).limit(1);
    if (cur.error) return { ok: false, message: 'Gagal menghubungi server: ' + cur.error.message, nota: c };
    const exists = cur.data && cur.data.length > 0;
    if (exists) {
      const serverRev = Number(cur.data[0].r) || 0;
      if (serverRev !== expectedRev) {
        return { ok: false, conflict: true, message: 'Nota ini sudah diubah di perangkat lain. Muat ulang dulu.', nota: c };
      }
      let done = false;
      const up = await tbl().update({ payload: c }).eq('key', key).select('key');
      if (!up.error && up.data && up.data.length) done = true;
      if (!done) {
        // Tidak ada izin UPDATE di Supabase: pakai hapus + tulis ulang (salinan lokal tetap jadi cadangan)
        const del = await tbl().delete().eq('key', key);
        if (del.error) return { ok: false, message: 'Gagal memperbarui: ' + del.error.message, nota: c };
        const ins = await tbl().insert({ key, payload: c });
        if (ins.error) return { ok: false, message: 'Gagal menyimpan: ' + ins.error.message, nota: c };
      }
    } else {
      const ins = await tbl().insert({ key, payload: c });
      if (ins.error) return { ok: false, message: 'Gagal menyimpan: ' + ins.error.message, nota: c };
    }
    const chk = await tbl().select('r:payload->>rev').eq('key', key).limit(1);
    if (chk.error || !chk.data || !chk.data.length || Number(chk.data[0].r) !== c.rev) {
      return {
        ok: false,
        message: 'Terkirim tapi tidak bisa dibaca ulang — cek izin SELECT/RLS di tabel app_data.',
        nota: c,
      };
    }
    notaMirror(c);
    notaPendingSet(c.id, false);
    return { ok: true, nota: c };
  } catch (e) {
    return { ok: false, message: e.message || String(e), nota: c };
  }
}

async function notaFetchByKeys(keys) {
  if (!keys.length) return { ok: true, list: [] };
  const out = [];
  for (let i = 0; i < keys.length; i += 50) {
    const { data, error } = await sbClient.from('app_data').select('payload').in('key', keys.slice(i, i + 50));
    if (error) return { ok: false, message: error.message, list: out };
    (data || []).forEach((r) => r.payload && out.push(r.payload));
  }
  return { ok: true, list: out };
}
// Daftar nota dalam rentang tanggal pembuatan (YYYY-MM-DD), terbaru dulu.
async function notaFetchRange(fromDate, toDate) {
  const { data, error } = await sbClient
    .from('app_data')
    .select('payload')
    .gte('key', `nota:${fromDate}:`)
    .lt('key', `nota:${toDate}:~`)
    .order('key', { ascending: false })
    .limit(500);
  if (error) return { ok: false, message: error.message, list: [] };
  return { ok: true, list: (data || []).map((r) => r.payload).filter(Boolean) };
}

if (typeof module !== 'undefined') {
  module.exports = {
    NOTA_STATUS, notaNew, notaEmptyItem, notaTotals, notaValidate, notaApply, notaCanEdit, notaNormPhone,
    notaParseMoney, notaToCsv, notaToTsv, notaKey, notaSaveCloud, notaPriceChanged, notaLineSubtotal,
    notaMineList, notaIsPending, notaLocalDate, notaFetchRange, notaFetchByKeys, notaMirrorGet, notaPendingSet,
  };
}
