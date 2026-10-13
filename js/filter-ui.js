// Filter pencarian: jenis, brand, kisaran harga (pilihan, tanpa mengetik angka), stok, urutan.
(function () {
  const bar = document.getElementById('filterBar');
  const panel = document.getElementById('filterPanel');
  if (!bar || !panel) return;
  const F = searchFilters;
  const U = { open: false };
  const esc = escapeHtml;

  const SORTS = [
    ['relevan', 'Paling cocok'],
    ['harga-asc', 'Harga termurah'],
    ['harga-desc', 'Harga termahal'],
    ['stok', 'Stok terbanyak'],
  ];
  function activeCount() {
    return [F.jenis, F.brand, priceFilterActive(F), F.stock !== 'all'].filter(Boolean).length;
  }
  function priceChipText() {
    if (F.min !== null && F.max !== null) return `Rp ${fmtJt(F.min)}–${fmtJt(F.max)}`;
    if (F.max !== null) return `Maks Rp ${fmtJt(F.max)}`;
    return `Min Rp ${fmtJt(F.min)}`;
  }

  // ---------- baris atas (selalu tampil di bawah kolom cari) ----------
  function renderBar() {
    const n = activeCount();
    const chips = [];
    if (F.jenis) chips.push(['jenis', jenisLabel(F.jenis)]);
    if (F.brand) chips.push(['brand', brandLabel(F.brand)]);
    if (priceFilterActive(F)) chips.push(['harga', priceChipText()]);
    if (F.stock !== 'all') chips.push(['stok', F.stock === 'ready' ? 'Ready' : 'Ready + Indent']);
    bar.innerHTML =
      `<button type="button" class="fb-btn${U.open ? ' on' : ''}" data-fa="toggle" aria-expanded="${U.open}">⚙ Filter${n ? ` <span class="fb-count">${n}</span>` : ''}</button>` +
      `<select id="fbSort" aria-label="Urutkan hasil">${SORTS.map(([v, l]) => `<option value="${v}"${F.sort === v ? ' selected' : ''}>${l}</option>`).join('')}</select>` +
      chips.map(([k, t]) => `<button type="button" class="fb-chip on" data-fa="clear" data-k="${k}" title="Hapus filter">${esc(t)} ✕</button>`).join('');
  }

  // ---------- panel pilihan ----------
  function chip(label, attrs, on, count) {
    return `<button type="button" class="fb-chip${on ? ' on' : ''}" ${attrs}>${esc(label)}${count !== undefined ? ` <small>${count}</small>` : ''}</button>`;
  }
  function priceOpts(sel, placeholder) {
    return `<option value="">${placeholder}</option>` + FILTER_PRICE_STEPS.map((v) => `<option value="${v}"${sel === v ? ' selected' : ''}>Rp ${fmtJt(v)}</option>`).join('');
  }
  function renderPanel() {
    if (!U.open) {
      panel.hidden = true;
      panel.innerHTML = '';
      return;
    }
    panel.hidden = false;
    const fc = facetCounts(searchInput.value, F);
    const types = FILTER_TYPES.concat([{ id: 'lainnya', label: 'Lainnya' }]);
    const jenisHtml =
      chip('Semua', 'data-fa="jenis" data-v=""', !F.jenis) +
      types
        .filter((t) => (fc.jenis.get(t.id) || 0) > 0 || F.jenis === t.id)
        .map((t) => chip(t.label, `data-fa="jenis" data-v="${t.id}"`, F.jenis === t.id, fc.jenis.get(t.id) || 0))
        .join('');
    const brands = Array.from(fc.brand.entries()).sort((a, b) => b[1] - a[1] || brandLabel(a[0]).localeCompare(brandLabel(b[0])));
    let top = brands.slice(0, FILTER_BRAND_CHIPS);
    const rest = brands.slice(FILTER_BRAND_CHIPS);
    if (F.brand && !top.some((b) => b[0] === F.brand)) top = top.concat([[F.brand, fc.brand.get(F.brand) || 0]]);
    const brandHtml =
      chip('Semua', 'data-fa="brand" data-v=""', !F.brand) +
      top.map(([b, c]) => chip(brandLabel(b), `data-fa="brand" data-v="${esc(b)}"`, F.brand === b, c)).join('') +
      (rest.length
        ? `<select id="fbBrandMore" aria-label="Brand lain"><option value="">Brand lain…</option>${rest
            .filter((b) => b[0] !== F.brand)
            .sort((a, b) => brandLabel(a[0]).localeCompare(brandLabel(b[0])))
            .map(([b, c]) => `<option value="${esc(b)}">${esc(brandLabel(b))} (${c})</option>`)
            .join('')}</select>`
        : '');
    const capsHtml =
      FILTER_PRICE_CAPS.map((v) => chip(`≤ ${fmtJt(v)}`, `data-fa="price" data-min="" data-max="${v}"`, F.min === null && F.max === v)).join('') +
      FILTER_PRICE_MIN_ONLY.map((v) => chip(`> ${fmtJt(v)}`, `data-fa="price" data-min="${v}" data-max=""`, F.min === v && F.max === null)).join('');
    const bandsHtml = FILTER_PRICE_BANDS.map(([a, b]) => chip(`${fmtJt(a).replace(' jt', '')}–${fmtJt(b)}`, `data-fa="price" data-min="${a}" data-max="${b}"`, F.min === a && F.max === b)).join('');
    panel.innerHTML = `
      <div class="fb-group"><div class="fb-title">Jenis</div><div class="fb-chips">${jenisHtml}</div></div>
      <div class="fb-group"><div class="fb-title">Brand</div><div class="fb-chips">${brandHtml}</div></div>
      <div class="fb-group"><div class="fb-title">Harga maksimal</div><div class="fb-chips">${chip('Semua harga', 'data-fa="price" data-min="" data-max=""', !priceFilterActive(F))}${capsHtml}</div>
        <div class="fb-title" style="margin-top:8px">Kisaran harga</div><div class="fb-chips">${bandsHtml}</div>
        <div class="fb-minmax"><label>Harga min<select id="fbMin">${priceOpts(F.min, 'Tanpa batas')}</select></label><label>Harga maks<select id="fbMax">${priceOpts(F.max, 'Tanpa batas')}</select></label></div></div>
      <div class="fb-group"><div class="fb-title">Stok</div><div class="fb-chips">${chip('Semua', 'data-fa="stock" data-v="all"', F.stock === 'all')}${chip('Ready', 'data-fa="stock" data-v="ready"', F.stock === 'ready')}${chip('Ready + Indent', 'data-fa="stock" data-v="ada"', F.stock === 'ada')}</div></div>
      <div class="fb-foot"><button type="button" class="fb-btn" data-fa="reset">Reset filter</button><button type="button" class="fb-btn on" data-fa="toggle">Tutup</button></div>`;
  }

  // dipanggil search.js setiap selesai mencari, dan saat filter berubah
  window.filterRefresh = function () {
    renderBar();
    renderPanel();
  };
  window.filterReset = function () {
    Object.assign(F, defaultFilters(), { sort: F.sort });
    apply();
  };
  function apply() {
    currentScan = null;
    doSearch();
    window.filterRefresh(); // doSearch tidak memanggilnya saat tidak ada kata kunci & filter
  }

  function setPrice(min, max) {
    F.min = min;
    F.max = max;
    if (F.min !== null && F.max !== null && F.min > F.max) [F.min, F.max] = [F.max, F.min];
  }
  document.addEventListener('click', function (e) {
    const b = e.target.closest('#filterBar [data-fa], #filterPanel [data-fa]');
    if (!b) return;
    const a = b.dataset.fa;
    if (a === 'toggle') {
      U.open = !U.open;
      window.filterRefresh();
      if (U.open && panel.scrollIntoView) panel.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (a === 'clear') {
      const k = b.dataset.k;
      if (k === 'jenis') F.jenis = '';
      else if (k === 'brand') F.brand = '';
      else if (k === 'harga') setPrice(null, null);
      else if (k === 'stok') F.stock = 'all';
    } else if (a === 'jenis') F.jenis = b.dataset.v;
    else if (a === 'brand') F.brand = b.dataset.v;
    else if (a === 'stock') F.stock = b.dataset.v;
    else if (a === 'price') {
      const mn = b.dataset.min === '' ? null : Number(b.dataset.min);
      const mx = b.dataset.max === '' ? null : Number(b.dataset.max);
      if (F.min === mn && F.max === mx) setPrice(null, null); // ketuk lagi = lepas pilihan
      else setPrice(mn, mx);
    } else if (a === 'reset') {
      filterReset();
      return;
    }
    apply();
  });
  document.addEventListener('change', function (e) {
    const t = e.target;
    if (t.id === 'fbSort') {
      F.sort = t.value;
      apply();
    } else if (t.id === 'fbMin' || t.id === 'fbMax') {
      const mn = document.getElementById('fbMin').value,
        mx = document.getElementById('fbMax').value;
      setPrice(mn === '' ? null : Number(mn), mx === '' ? null : Number(mx));
      apply();
    } else if (t.id === 'fbBrandMore' && t.value) {
      F.brand = t.value;
      apply();
    }
  });
  renderBar();
})();
