// Skema Leasing — tampilan (butuh leasing-config.js & leasing-core.js)
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = escapeHtml;
  const rp = (v) => fmtRupiah(v);
  const overlay = $('leasingOverlay'),
    body = $('leasingBody');
  const S = { q: '', brand: '', sel: null, prov: '', showEmpty: false, showHidden: false, noteOpen: false };

  const fmtDT = (iso) => {
    const d = new Date(iso);
    return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  };
  function metaLine() {
    if (!leasingMeta) return '';
    return `Data: ${esc(leasingMeta.fileName || '-')} · diperbarui ${esc(fmtDT(leasingMeta.updatedAt))} · ${leasingMeta.products || LEASING.items.length} produk`;
  }

  function open() {
    overlay.classList.add('show');
    document.documentElement.classList.add('leasing-open');
    render();
  }
  function close() {
    overlay.classList.remove('show');
    document.documentElement.classList.remove('leasing-open');
  }

  function emptyState() {
    body.innerHTML = `<div class="ls-wrap"><div class="ls-empty"><b>Belum ada data skema leasing.</b><p>${
      staffMode
        ? 'Upload file <code>SKEMA_LEASING_….xlsx</code> lewat tombol “Upload File” di halaman utama (mode Staff Gudang).'
        : 'Minta staf gudang untuk mengunggah file skema leasing terbaru.'
    }</p></div></div>`;
  }

  // ---------- daftar produk ----------
  function noteHtml() {
    if (!LEASING.note) return '';
    return `<details class="ls-note"${S.noteOpen ? ' open' : ''}><summary>Catatan wajib dari file skema</summary><p>${esc(LEASING.note)}</p></details>`;
  }
  function renderList() {
    const brands = leasingBrands(LEASING);
    body.innerHTML = `<div class="ls-wrap">
      <div class="ls-meta">${metaLine()}</div>
      ${noteHtml()}
      <div class="ls-search">
        <input id="lsQ" type="search" value="${esc(S.q)}" placeholder="Cari produk: mis. galaxy a55, iphone 17, reno 15…" autocomplete="off" autocapitalize="off" spellcheck="false">
        <select id="lsBrand"><option value="">Semua brand</option>${brands.map((b) => `<option value="${esc(b)}"${S.brand === b ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select>
      </div>
      <div id="lsResults"></div>
    </div>`;
    updateResults();
  }
  function updateResults() {
    const el = $('lsResults');
    if (!el) return;
    if (!S.q.trim() && !S.brand) {
      el.innerHTML = `<div class="ls-hint">Ketik nama produk atau pilih brand untuk melihat biaya admin per skema leasing.</div>`;
      return;
    }
    const res = leasingSearch(LEASING, S.q, S.brand, LEASING_CONFIG.maxResults);
    if (!res.length) {
      el.innerHTML = `<div class="ls-hint">Produk tidak ditemukan. Coba kata kunci lebih pendek.</div>`;
      return;
    }
    el.innerHTML =
      res
        .map((it) => {
          const i = LEASING.items.indexOf(it);
          return `<button type="button" class="ls-card" data-act="pick" data-i="${i}"><div class="ls-card-n">${esc(it.n)}</div><div class="ls-card-m">${esc(it.b)}${it.dup ? ' · <span class="warn">⚠ data ganda</span>' : ''}</div></button>`;
        })
        .join('') + (res.length >= LEASING_CONFIG.maxResults ? `<div class="ls-hint">Menampilkan ${res.length} teratas — persempit pencarian.</div>` : '');
  }

  // ---------- rincian produk ----------
  function cfgNow() {
    return Object.assign({}, LEASING_CONFIG, { showHiddenPrograms: LEASING_CONFIG.showHiddenPrograms || (staffMode && S.showHidden) });
  }
  function renderDetail() {
    const it = S.sel;
    const cfg = cfgNow();
    const groups = leasingGroups(LEASING, it, cfg, { rp, showEmpty: S.showEmpty });
    const shown = S.prov ? groups.filter((g) => g.name === S.prov) : groups;
    const hiddenCount = LEASING.programs.filter((p) => p.h).length;
    const same = it.dup ? LEASING.items.filter((x) => x.dup && leasingNormName(x.n) === leasingNormName(it.n)) : [];
    body.innerHTML = `<div class="ls-wrap">
      <button type="button" class="ls-back" data-act="back">← Cari produk lain</button>
      <div class="ls-prod"><div class="ls-prod-n">${esc(it.n)}</div><div class="ls-prod-m">${esc(it.b)}${staffMode ? ` · baris Excel ${it.r}` : ''}</div></div>
      ${it.dup ? `<div class="ls-warn">⚠ Ada ${same.length} baris dengan nama ini di file dan isinya berbeda (${same.map((x) => `baris Excel ${x.r}${x.b ? ' [' + esc(x.b) + ']' : ''}`).join(' dan ')}). Pastikan versi yang benar sebelum memberi tahu pelanggan.</div>` : ''}
      <div class="ls-rule"><b>Patokan:</b> pakai kolom pembiayaan yang <u>diajukan pelanggan</u>. Tanda ❌ berarti tidak ada subsidi, maka berlaku biaya ${esc(cfg.bafLabel)}.</div>
      ${noteHtml()}
      ${it.e !== null ? `<div class="ls-baf"><div class="ls-baf-t">${esc(cfg.bafLabel)}</div><div class="ls-baf-v">${esc(rp(it.e))}</div><div class="ls-baf-s">Berlaku bila pelanggan mengajukan ${esc(cfg.bafLabel)}, atau bila program yang dipilih bertanda ❌.</div></div>` : ''}
      <div class="ls-chips"><button type="button" class="chip${S.prov ? '' : ' on'}" data-act="prov" data-p="">Semua</button>${groups
        .map((g) => `<button type="button" class="chip${S.prov === g.name ? ' on' : ''}" data-act="prov" data-p="${esc(g.name)}">${esc(g.name)}</button>`)
        .join('')}</div>
      <div class="ls-opts">
        <label><input type="checkbox" data-act="empty"${S.showEmpty ? ' checked' : ''}> Tampilkan program tanpa data</label>
        ${staffMode && hiddenCount && !LEASING_CONFIG.showHiddenPrograms ? `<label><input type="checkbox" data-act="hidden"${S.showHidden ? ' checked' : ''}> Tampilkan ${hiddenCount} program yang disembunyikan di Excel</label>` : ''}
      </div>
      ${
        shown.length
          ? shown
              .map(
                (g) => `<div class="ls-group"><h3>${esc(g.name)}</h3>${g.rows
                  .map((r) => `<div class="ls-row"><div class="ls-row-t">${esc(r.title)}</div><div class="ls-res ${r.res.cls}">${esc(r.res.text)}</div></div>`)
                  .join('')}</div>`,
              )
              .join('')
          : '<div class="ls-hint">Tidak ada program yang tersedia untuk produk ini.</div>'
      }
    </div>`;
    body.scrollTop = 0;
  }

  function render() {
    if (!LEASING || !LEASING.items) return emptyState();
    if (S.sel) renderDetail();
    else renderList();
  }

  overlay.addEventListener('input', (e) => {
    if (e.target.id === 'lsQ') {
      S.q = e.target.value;
      updateResults();
    }
  });
  overlay.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'lsBrand') {
      S.brand = t.value;
      updateResults();
    } else if (t.dataset.act === 'empty') {
      S.showEmpty = t.checked;
      renderDetail();
    } else if (t.dataset.act === 'hidden') {
      S.showHidden = t.checked;
      renderDetail();
    }
  });
  overlay.addEventListener('toggle', (e) => {
    if (e.target.classList && e.target.classList.contains('ls-note')) S.noteOpen = e.target.open;
  }, true);
  overlay.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'INPUT') return;
    if (b.dataset.act === 'pick') {
      S.sel = LEASING.items[parseInt(b.dataset.i, 10)];
      S.prov = '';
      renderDetail();
    } else if (b.dataset.act === 'back') {
      S.sel = null;
      renderList();
      const q = $('lsQ');
      if (q) q.focus();
    } else if (b.dataset.act === 'prov') {
      S.prov = b.dataset.p;
      renderDetail();
    }
  });
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      close();
      e.stopPropagation();
    }
  });
  $('leasingOpenBtn').addEventListener('click', open);
  $('leasingCloseBtn').addEventListener('click', close);

  // dipanggil setelah data diunggah/disinkron/dihapus & saat mode staf berubah
  window.leasingRefresh = function () {
    if (S.sel && (!LEASING || !LEASING.items.some((x) => x.r === S.sel.r && x.n === S.sel.n))) S.sel = null;
    else if (S.sel && LEASING) S.sel = LEASING.items.find((x) => x.r === S.sel.r && x.n === S.sel.n) || null;
    if (overlay.classList.contains('show')) render();
  };
  window.leasingIsOpen = () => overlay.classList.contains('show');
})();
