// Sinkron data ke/dari Supabase + cadangan lokal
// Ambil 1 payload terbaru untuk sebuah key. Dibuat SELALU aman dipanggil — tidak pernah
// melempar error walau baris datanya belum ada ATAU (kalau ada bug data ganda) lebih dari satu,
// supaya kegagalan satu key tidak ikut menggagalkan key lainnya.
async function fetchLatestPayload(key) {
  try {
    const { data, error } = await sbClient.from('app_data').select('payload').eq('key', key).limit(1);
    if (error) {
      console.error(`Gagal memuat "${key}" dari server:`, error.message);
      return { ok: false, payload: null, message: error.message };
    }
    const payload = data && data[0] ? data[0].payload : null;
    return { ok: true, payload, message: '' };
  } catch (e) {
    console.error(`Error memuat "${key}":`, e);
    return { ok: false, payload: null, message: e.message || String(e) };
  }
}

// Load data dari Supabase Cloud agar bisa diakses semua device.
// Tiap key dimuat independen — kalau salah satu gagal (atau belum ada datanya),
// yang lain tetap lanjut dimuat normal.
function readLocalJson(key) {
  try {
    const r = localStorage.getItem(key);
    return r ? JSON.parse(r) : null;
  } catch (e) {
    return null;
  }
}

// Tentukan data mana yang dipakai untuk satu key:
//  - ada di server            -> pakai server
//  - server error/tak terjangkau -> pakai salinan lokal (cadangan)
//  - server terjangkau & kosong  -> kalau pernah tersinkron & tidak ada simpanan gagal = sudah dihapus,
//                                   buang salinan lokal; selain itu pertahankan salinan lokal
function resolvePayload(key, res, label, cloudErrors, notes) {
  if (res.payload) {
    markSynced(key);
    return res.payload;
  }
  if (!res.ok) {
    cloudErrors.push(`${label}: ${res.message}`);
    return readLocalJson(key);
  }
  if (isSynced(key) && !isUnsynced(key)) {
    clearLocalKey(key);
    return null;
  }
  const local = readLocalJson(key);
  if (local && isUnsynced(key)) notes.push(label);
  return local;
}

// Load data dari Supabase Cloud agar bisa diakses semua device.
// Tiap key dimuat independen — kalau salah satu gagal (atau belum ada datanya),
// yang lain tetap lanjut dimuat normal.
async function loadCatalog() {
  const cloudErrors = [];
  const notes = [];

  catalog = resolvePayload(
    'inventory:latest',
    await fetchLatestPayload('inventory:latest'),
    'Stok/Harga',
    cloudErrors,
    notes,
  );
  soData = resolvePayload('so:latest', await fetchLatestPayload('so:latest'), 'Stock Opname', cloudErrors, notes);

  const sa = resolvePayload(
    'stockavail:latest',
    await fetchLatestPayload('stockavail:latest'),
    'Stock Available',
    cloudErrors,
    notes,
  );
  stockAvailMap = (sa && sa.map) || {};
  stockAvailDesc = (sa && sa.descMap) || {};
  stockAvailMeta = (sa && sa.meta) || null;

  const bc = resolvePayload(
    'barcode:latest',
    await fetchLatestPayload('barcode:latest'),
    'Barcode',
    cloudErrors,
    notes,
  );
  BARCODE_MAP = (bc && bc.map) || {};
  barcodeMeta = (bc && bc.meta) || null;
  getBarcodes._normIndex = null;

  const mp = resolvePayload(
    'manualprice:latest',
    await fetchLatestPayload('manualprice:latest'),
    'Price List Manual',
    cloudErrors,
    notes,
  );
  MANUAL_PRICE = { byDesc: (mp && mp.byDesc) || {}, byBarcode: (mp && mp.byBarcode) || {} };
  manualPriceMeta = (mp && mp.meta) || null;

  if (cloudErrors.length) {
    console.error('Sebagian data gagal dimuat dari server (dipakai cadangan lokal):', cloudErrors);
    statusEl.textContent = `⚠ Gagal memuat dari server, dipakai data lokal perangkat ini: ${cloudErrors.join(' | ')}`;
  } else if (notes.length) {
    statusEl.textContent = `⚠ Data berikut hanya ada di perangkat ini (belum tersimpan di server): ${notes.join(', ')}. Upload ulang untuk menyinkronkan.`;
  }

  recomputeOthersWithStockAvail();
  renderMeta();
  refreshUploadBadges();
  renderEmpty();
  if (staffMode) renderSoModules();
}

// Simpan 1 payload ke cloud dengan pola hapus-lalu-tulis (bukan upsert), supaya:
// 1) Tidak bergantung pada constraint UNIQUE di kolom "key" pada tabel app_data
// (kalau constraint itu tidak ada, upsert bisa diam-diam membuat baris duplikat,
// yang bikin pembacaan data jadi tidak menentu/ketuker antar perangkat).
// 2) Baris duplikat lama (kalau sudah kadung ada) otomatis rapi lagi tiap kali ada upload baru.
async function saveCatalogToCloudRaw(key, payloadData) {
  // Simpan lokal dulu sebagai cadangan (tetap berguna walau server gagal)
  try {
    localStorage.setItem(key, JSON.stringify(payloadData));
  } catch (e) {}

  try {
    const { error: delErr } = await sbClient.from('app_data').delete().eq('key', key);
    if (delErr) {
      console.error(`Gagal membersihkan data lama "${key}":`, delErr.message);
      return { ok: false, message: `Gagal hapus data lama (${delErr.message})` };
    }
    const { error: insErr } = await sbClient.from('app_data').insert({ key: key, payload: payloadData });
    if (insErr) {
      console.error(`Gagal simpan "${key}" ke server:`, insErr.message);
      return { ok: false, message: `Gagal simpan (${insErr.message})` };
    }

    // VERIFIKASI: baca lagi datanya untuk pastikan benar-benar tersimpan & BISA dibaca balik.
    // Ini penting karena kalau RLS (Row Level Security) di tabel app_data mengizinkan
    // INSERT/DELETE tapi tidak mengizinkan SELECT untuk role anon, perintah simpan di atas
    // akan terlihat "berhasil" (tidak ada error) padahal datanya tidak akan pernah bisa
    // dibaca balik oleh siapapun — baik di device ini maupun device lain.
    const { data: checkData, error: checkErr } = await sbClient.from('app_data').select('key').eq('key', key).limit(1);
    if (checkErr) {
      return { ok: false, message: `Tersimpan tapi gagal diverifikasi ulang (${checkErr.message})` };
    }
    if (!checkData || checkData.length === 0) {
      return {
        ok: false,
        message: `Data terkirim TANPA error, tapi saat dibaca ulang tidak ditemukan sama sekali. Ini tanda kuat ada masalah izin akses (RLS policy) di tabel "app_data" — kemungkinan besar role "anon" diizinkan menulis (INSERT/DELETE) tapi TIDAK diizinkan membaca (SELECT). Tambahkan policy SELECT untuk role anon di Supabase.`,
      };
    }

    return { ok: true, message: '' };
  } catch (e) {
    console.error(e);
    return { ok: false, message: e.message || String(e) };
  }
}

// ===== Penanda sinkron per key (disimpan di perangkat) =====
// synced:KEY   -> perangkat ini pernah memastikan datanya ADA di server.
//                 Kalau kemudian server kosong, artinya data sudah DIHAPUS (bukan error),
//                 jadi salinan lokal ikut dibuang — tidak "hidup lagi" di perangkat lain.
// unsynced:KEY -> simpanan terakhir ke server GAGAL; salinan lokal dipertahankan.
// Salinan lokal tanpa penanda apa pun (data lama sebelum versi ini) juga dipertahankan.
const syncBusy = new Set(); // key yang sedang disimpan/dihapus — jangan diganggu polling
function lsGet(k) {
  try {
    return localStorage.getItem(k);
  } catch (e) {
    return null;
  }
}
function lsSet(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch (e) {}
}
function lsDel(k) {
  try {
    localStorage.removeItem(k);
  } catch (e) {}
}
function markSynced(key) {
  lsSet('synced:' + key, '1');
  lsDel('unsynced:' + key);
}
function markUnsynced(key) {
  lsSet('unsynced:' + key, '1');
}
function isSynced(key) {
  return lsGet('synced:' + key) === '1';
}
function isUnsynced(key) {
  return lsGet('unsynced:' + key) === '1';
}
function clearLocalKey(key) {
  lsDel(key);
  lsDel('synced:' + key);
  lsDel('unsynced:' + key);
}

async function saveCatalogToCloud(key, payloadData) {
  syncBusy.add(key);
  try {
    const res = await saveCatalogToCloudRaw(key, payloadData);
    if (res.ok) markSynced(key);
    else markUnsynced(key);
    return res;
  } finally {
    syncBusy.delete(key);
  }
}
