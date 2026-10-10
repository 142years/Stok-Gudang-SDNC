// Hapus data di server
// ===== Hapus data =====
// Prinsip: server dulu, perangkat belakangan.
//  1) Perintah hapus ke server, lalu DIVERIFIKASI (baca ulang) — kalau data masih ada
//     (mis. izin DELETE/RLS belum diatur) dianggap GAGAL dan dilaporkan apa adanya.
//  2) Data di perangkat & tampilan baru dibersihkan setelah server terbukti kosong,
//     jadi tidak pernah muncul pesan "berhasil" padahal data masih ada di server.
//  3) Tiap jenis data dihapus terpisah; yang gagal tidak membatalkan yang berhasil.
const DELETE_SCOPES = {
  stock: { label: 'Katalog Serial Number', keys: ['inventory:latest'] },
  avail: { label: 'Stock Available (stok sendiri & cabang)', keys: ['stockavail:latest'] },
  barcode: { label: 'Data Barcode', keys: ['barcode:latest'] },
  leasing: { label: 'Skema Leasing', keys: ['leasing:latest'] },
  reborn: { label: 'Price List Reborn', keys: ['rebornprice:latest', 'manualprice:latest'] }, // manualprice = data file lama, ikut dibersihkan
};

const deleteOverlay = document.getElementById('deleteOverlay');
const deleteMsg = document.getElementById('deleteMsg');
const deleteConfirm = document.getElementById('deleteConfirm');
const deleteCancel = document.getElementById('deleteCancel');
let deleteArmed = false,
  deleteArmTimer = null,
  deleteBusy = false;

async function cloudKeyExists(key) {
  try {
    const { data, error } = await sbClient.from('app_data').select('key').eq('key', key).limit(1);
    if (error) return { ok: false, exists: null, message: error.message };
    return { ok: true, exists: !!(data && data.length) };
  } catch (e) {
    return { ok: false, exists: null, message: e.message || String(e) };
  }
}

async function deleteCloudKey(key) {
  syncBusy.add(key);
  try {
    try {
      const { error } = await sbClient.from('app_data').delete().eq('key', key);
      if (error) return { ok: false, message: error.message };
    } catch (e) {
      return { ok: false, message: e.message || String(e) };
    }
    const chk = await cloudKeyExists(key);
    if (!chk.ok) return { ok: false, message: `penghapusan tidak bisa dipastikan (${chk.message})` };
    if (chk.exists)
      return {
        ok: false,
        message:
          'data masih ada di server setelah dihapus — kemungkinan role "anon" belum punya izin DELETE (RLS) di tabel app_data',
      };
    return { ok: true, message: '' };
  } finally {
    syncBusy.delete(key);
  }
}

function applyLocalDelete(scope) {
  if (scope === 'stock') {
    catalog = null;
    pendingSnRows = null;
    pendingSnName = null;
    openFifo.clear();
    openBranches.clear();
    openBranchUnits.clear();
  } else if (scope === 'avail') {
    stockAvailMap = {};
    stockAvailDesc = {};
    stockAvailOwn = {};
    stockAvailMeta = null;
    recomputeOthersWithStockAvail();
  } else if (scope === 'barcode') {
    BARCODE_MAP = {};
    barcodeMeta = null;
    getBarcodes._normIndex = null;
  } else if (scope === 'reborn') {
    REBORN_PRICE = { byCode: {} };
    rebornPriceMeta = null;
  } else if (scope === 'leasing') {
    LEASING = null;
    leasingMeta = null;
    if (typeof leasingRefresh === 'function') leasingRefresh();
  }
}

async function runDelete(scopes) {
  const results = [];
  for (const s of scopes) {
    const sc = DELETE_SCOPES[s];
    let failMsg = null;
    for (const key of sc.keys) {
      const r = await deleteCloudKey(key);
      if (!r.ok) {
        failMsg = r.message;
        break;
      }
    }
    if (failMsg) {
      results.push({ scope: s, ok: false, message: failMsg });
      continue;
    }
    sc.keys.forEach(clearLocalKey);
    applyLocalDelete(s);
    results.push({ scope: s, ok: true });
  }
  renderMeta();
  refreshUploadBadges();
  if (searchInput.value.trim()) doSearch();
  else renderEmpty();
  return results;
}

function disarmDelete() {
  deleteArmed = false;
  clearTimeout(deleteArmTimer);
  deleteConfirm.textContent = 'Hapus';
}
function openDeleteModal() {
  deleteMsg.textContent = '';
  deleteMsg.className = '';
  disarmDelete();
  deleteOverlay.classList.add('show');
}
function closeDeleteModal() {
  if (deleteBusy) return;
  disarmDelete();
  deleteOverlay.classList.remove('show');
}

document.getElementById('resetDataBtn').addEventListener('click', openDeleteModal);
deleteCancel.addEventListener('click', closeDeleteModal);
deleteOverlay.addEventListener('click', function (e) {
  if (e.target === deleteOverlay) closeDeleteModal();
});

deleteConfirm.addEventListener('click', async function () {
  if (deleteBusy) return;
  const boxes = Array.from(deleteOverlay.querySelectorAll('input[name="delScope"]'));
  const chosen = boxes.filter((b) => b.checked).map((b) => b.value);
  if (!chosen.length) {
    deleteMsg.className = 'err';
    deleteMsg.textContent = 'Pilih minimal satu data yang mau dihapus.';
    return;
  }
  // Klik pertama = minta konfirmasi, klik kedua (dalam 5 detik) = hapus
  if (!deleteArmed) {
    deleteArmed = true;
    deleteConfirm.textContent = 'Yakin? Klik lagi untuk hapus';
    deleteMsg.className = '';
    deleteMsg.textContent =
      'Data: ' + chosen.map((s) => DELETE_SCOPES[s].label).join(', ') + '. Tidak bisa dibatalkan.';
    clearTimeout(deleteArmTimer);
    deleteArmTimer = setTimeout(disarmDelete, 5000);
    return;
  }
  disarmDelete();
  deleteBusy = true;
  deleteConfirm.disabled = true;
  deleteCancel.disabled = true;
  deleteMsg.className = '';
  deleteMsg.textContent = 'Menghapus & memverifikasi di server...';
  let results = [];
  try {
    results = await runDelete(chosen);
  } catch (e) {
    results = chosen.map((s) => ({ scope: s, ok: false, message: e.message || String(e) }));
  }
  deleteBusy = false;
  deleteConfirm.disabled = false;
  deleteCancel.disabled = false;

  const okList = results.filter((r) => r.ok);
  const failList = results.filter((r) => !r.ok);
  // Yang sudah berhasil tidak perlu dicentang lagi
  okList.forEach((r) => {
    const b = boxes.find((x) => x.value === r.scope);
    if (b) b.checked = false;
  });

  if (!failList.length) {
    statusEl.textContent =
      'Berhasil dihapus dari server & perangkat ini: ' +
      okList.map((r) => DELETE_SCOPES[r.scope].label).join(', ') +
      '.';
    closeDeleteModal();
    boxes.forEach((b) => {
      b.checked = b.value === 'stock';
    });
    return;
  }
  const lines = [];
  okList.forEach((r) => lines.push('✓ ' + DELETE_SCOPES[r.scope].label + ' — terhapus'));
  failList.forEach((r) => lines.push('✗ ' + DELETE_SCOPES[r.scope].label + ' — GAGAL: ' + r.message));
  lines.push('Data yang gagal dihapus dibiarkan utuh di perangkat ini.');
  deleteMsg.className = 'err';
  deleteMsg.textContent = lines.join('\n');
  statusEl.textContent = `Hapus data: ${okList.length} berhasil, ${failList.length} gagal.`;
});

document.getElementById('resetSoBtn').addEventListener('click', async function () {
  if (
    !confirm(
      'Hapus data Stock Opname Harian di server? Berlaku untuk semua perangkat. (Data Stok/Harga tidak terhapus)',
    )
  )
    return;
  const btn = this;
  btn.disabled = true;
  soSummaryInfo.textContent = 'Menghapus & memverifikasi di server...';
  const r = await deleteCloudKey('so:latest');
  if (!r.ok) {
    soSummaryInfo.textContent = `✗ Gagal menghapus data SO dari server: ${r.message}. Data di perangkat ini dibiarkan utuh.`;
    btn.disabled = false;
    return;
  }
  clearLocalKey('so:latest');
  lsDel('so:sheet');
  soData = null;
  soSelectedSheet = null;
  renderSoModules();
  soSummaryInfo.textContent = '✓ Data SO berhasil dihapus dari server.';
  btn.disabled = false;
});
