// Mulai aplikasi & pembaruan berkala
loadCatalog();
if (window.matchMedia && matchMedia('(pointer:fine)').matches) searchInput.focus({ preventScroll: true });

// Cek pergantian hari secara berkala, supaya banner tetap akurat
// walau sesi dibiarkan terbuka melewati tengah malam.
setInterval(updateStaleBanner, 60000);

// Cek pembaruan dari pengguna lain secara berkala, agar sesi yang sudah terbuka
// ikut ter-update tanpa perlu reload manual saat ada yang upload ATAU menghapus data.
// Penghapusan baru dianggap nyata kalau server kosong 2 kali berturut-turut (menghindari
// celah singkat saat perangkat lain sedang mengganti data), dan hanya untuk data yang
// pernah tersinkron di perangkat ini.
let invEmptyStreak = 0,
  soEmptyStreak = 0;
setInterval(async function () {
  if (!syncBusy.has('inventory:latest')) {
    const inv = await fetchLatestPayload('inventory:latest');
    if (inv.payload) {
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
    const so = await fetchLatestPayload('so:latest');
    if (so.payload) {
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
