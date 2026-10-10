// Mulai aplikasi & pembaruan berkala
loadCatalog();
if (window.matchMedia && matchMedia('(pointer:fine)').matches) searchInput.focus({ preventScroll: true });

// Cek pergantian hari secara berkala, supaya banner tetap akurat
// walau sesi dibiarkan terbuka melewati tengah malam.

// Cek pembaruan dari pengguna lain secara berkala, agar sesi yang sudah terbuka
// ikut ter-update tanpa perlu reload manual saat ada yang upload ATAU menghapus data.
// Penghapusan baru dianggap nyata kalau server kosong 2 kali berturut-turut (menghindari
// celah singkat saat perangkat lain sedang mengganti data), dan hanya untuk data yang
// pernah tersinkron di perangkat ini.
let invEmptyStreak = 0,
  soEmptyStreak = 0;
setInterval(async function () {
  if (!syncBusy.has('inventory:latest')) {
    const inv = await fetchLatestIfChanged('inventory:latest', catalog && catalog.updatedAt);
    if (inv.unchanged) {
      invEmptyStreak = 0;
      markSynced('inventory:latest');
    } else if (inv.payload) {
      invEmptyStreak = 0;
      markSynced('inventory:latest');
      if (!catalog || inv.payload.updatedAt !== catalog.updatedAt) {
        catalog = inv.payload;
        renderMeta();
        refreshUploadBadges();
        if (searchInput.value.trim()) doSearch();
        else renderEmpty();
      }
    } else if (inv.ok && catalog && isSynced('inventory:latest') && !isUnsynced('inventory:latest')) {
      if (++invEmptyStreak >= 2) {
        invEmptyStreak = 0;
        catalog = null;
        clearLocalKey('inventory:latest');
        renderMeta();
        refreshUploadBadges();
        renderEmpty();
        statusEl.textContent = 'Data Stok/Harga sudah dihapus dari server oleh perangkat lain.';
      }
    } else {
      invEmptyStreak = 0;
    }
  }

  if (!syncBusy.has('so:latest')) {
    const so = await fetchLatestIfChanged('so:latest', soData && soData.updatedAt);
    if (so.unchanged) {
      soEmptyStreak = 0;
      markSynced('so:latest');
    } else if (so.payload) {
      soEmptyStreak = 0;
      markSynced('so:latest');
      if (!soData || so.payload.updatedAt !== soData.updatedAt) {
        soData = so.payload;
        if (staffMode) renderSoModules();
      }
    } else if (so.ok && soData && isSynced('so:latest') && !isUnsynced('so:latest')) {
      if (++soEmptyStreak >= 2) {
        soEmptyStreak = 0;
        soData = null;
        soSelectedSheet = null;
        clearLocalKey('so:latest');
        if (staffMode) renderSoModules();
      }
    } else {
      soEmptyStreak = 0;
    }
  }
}, 20000);

soModalOverlay.addEventListener('click', function (e) {
  if (e.target === soModalOverlay) soModalOverlay.classList.remove('show');
});
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  if (deleteOverlay.classList.contains('show')) closeDeleteModal();
  else if (soModalOverlay.classList.contains('show')) soModalOverlay.classList.remove('show');
  else if (pinOverlay.classList.contains('show')) closePinModal();
});

// Pembaruan otomatis untuk data pendukung (Stock Available, Barcode, Price List Reborn).
// Data ini bisa dikirim otomatis oleh Auto Sync di PC gudang, jadi sesi yang sedang terbuka
// harus ikut menyegarkan diri. Yang dicek hanya "meta" (kecil); payload penuh baru diunduh
// kalau waktu update-nya berubah.
const AUX_SYNC = [
  {
    key: 'stockavail:latest',
    meta: () => stockAvailMeta,
    apply: (p) => {
      stockAvailMap = p.map || {};
      stockAvailOwn = p.own || null;
      stockAvailDesc = p.descMap || {};
      stockAvailMeta = p.meta || null;
      recomputeOthersWithStockAvail();
    },
  },
  {
    key: 'barcode:latest',
    meta: () => barcodeMeta,
    apply: (p) => {
      BARCODE_MAP = p.map || {};
      barcodeMeta = p.meta || null;
      getBarcodes._normIndex = null;
    },
  },
  {
    key: 'rebornprice:latest',
    meta: () => rebornPriceMeta,
    apply: (p) => {
      REBORN_PRICE = { byCode: p.byCode || {} };
      rebornPriceMeta = p.meta || null;
      if (searchInput.value.trim()) doSearch();
      else renderEmpty();
    },
  },
  {
    key: 'leasing:latest',
    meta: () => leasingMeta,
    apply: (p) => {
      LEASING = p.items ? { programs: p.programs || [], items: p.items, note: p.note || '' } : null;
      leasingMeta = p.meta || null;
      if (typeof leasingRefresh === 'function') leasingRefresh();
    },
  },
];

setInterval(async function () {
  for (const a of AUX_SYNC) {
    if (syncBusy.has(a.key)) continue;
    try {
      const { data, error } = await sbClient.from('app_data').select('meta:payload->meta').eq('key', a.key).limit(1);
      if (error || !data || !data[0] || !data[0].meta) continue;
      const cur = a.meta();
      if (cur && cur.updatedAt === data[0].meta.updatedAt) continue;
      const full = await fetchLatestPayload(a.key);
      if (!full.payload) continue;
      markSynced(a.key);
      a.apply(full.payload);
      refreshUploadBadges();
    } catch (e) {
      console.error('Gagal menyegarkan ' + a.key, e);
    }
  }
}, 60000);
