// Ekspor hasil pencarian/filter: Cetak / Simpan PDF dan Excel (.xlsx)
// Memakai ulang runSearch() dengan kata kunci + filter + urutan yang sedang aktif, dan mengambil SEMUA hasil
// (bukan hanya yang tampil di layar). Tidak mengubah file lain.
(function () {
  // ---- Pengaturan (ubah di sini) ----
  const EXPORT_HEADER_NAME = 'Cek Harga & Stok SDNC'; // tampil di kop cetak / Excel
  const EXPORT_CONFIRM_ROWS = 500; // di atas jumlah ini, tanya konfirmasi dulu

  const opts = { stok: true, hideNoPrice: false };

  function collect() {
    if (typeof catalog === 'undefined' || !catalog || !catalog.items) return null;
    const q = cleanQuery(searchInput.value);
    const f = searchFilters;
    if (!q && !filtersActive(f)) return null;
    const res = runSearch(q, f);
    const all = res.exact.concat(res.list);
    return all.length ? { q, f, all } : null;
  }

  function stockText(it) {
    const ready = (it.available || 0) + (it.allocatedOwn || 0);
    if (ready > 0) return 'READY · ' + ready + ' pcs';
    if (it.others) return 'INDENT';
    const nr = ownNonReadyInfo(it);
    if (nr) return 'DI SDNC · ' + nr.text;
    return 'HABIS';
  }

  function buildRows(c) {
    let items = c.all;
    if (opts.hideNoPrice) items = items.filter((it) => itemPrice(it) !== null);
    return items.map((it, i) => ({
      no: i + 1,
      code: it.code || '',
      desc: it.desc || '',
      brand: brandLabel(brandKey(it)),
      price: itemPrice(it),
      stok: stockText(it),
    }));
  }

  const fmtDT = (v) => {
    const d = v ? new Date(v) : null;
    return d && !isNaN(d) ? d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
  };
  function ymd() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function titleOf(c) {
    return 'Daftar Harga' + (c.f.brand ? ' ' + brandLabel(c.f.brand) : '');
  }
  function metaLines(c, rows) {
    const lines = [];
    const crit = [];
    if (c.q) crit.push('Kata kunci: ' + c.q);
    if (filtersActive(c.f)) crit.push('Filter: ' + filterSummaryText(c.f));
    crit.push('Urut: ' + (SORT_LABELS[c.f.sort] || SORT_LABELS.relevan));
    lines.push(crit.join(' · '));
    lines.push(rows.length + ' barang' + (opts.hideNoPrice ? ' (tanpa harga tidak ikut)' : ''));
    const stockAt = (typeof stockAvailMeta !== 'undefined' && stockAvailMeta && stockAvailMeta.updatedAt) || catalog.updatedAt;
    const priceAt = typeof rebornPriceMeta !== 'undefined' && rebornPriceMeta ? rebornPriceMeta.updatedAt : null;
    lines.push('Data stok: ' + fmtDT(stockAt) + ' · Harga: ' + fmtDT(priceAt));
    lines.push('Dicetak: ' + fmtDT(new Date()));
    return lines;
  }
  function fileBase(c) {
    const src = c.f.brand ? brandLabel(c.f.brand) : c.q || 'hasil';
    const slug =
      String(src)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'hasil';
    return 'daftar-harga_' + slug + '_' + ymd();
  }

  // ---- Cetak / PDF ----
  function removePrintArea() {
    const old = document.getElementById('printArea');
    if (old) old.remove();
    document.documentElement.classList.remove('printing');
  }
  function doPrint(c, rows) {
    removePrintArea();
    const head = ['No', 'Kode', 'Nama Barang', 'Brand', 'Harga'].concat(opts.stok ? ['Stok'] : []);
    const body = rows
      .map(
        (r) =>
          '<tr><td class="c">' + r.no + '</td><td>' + escapeHtml(r.code) + '</td><td>' + escapeHtml(r.desc) + '</td><td>' + escapeHtml(r.brand) +
          '</td><td class="r">' + (r.price === null ? '-' : escapeHtml(fmtRupiah(r.price))) + '</td>' +
          (opts.stok ? '<td>' + escapeHtml(r.stok) + '</td>' : '') + '</tr>'
      )
      .join('');
    const area = document.createElement('div');
    area.id = 'printArea';
    area.innerHTML =
      '<div class="pa-org">' + escapeHtml(EXPORT_HEADER_NAME) + '</div><h1>' + escapeHtml(titleOf(c)) + '</h1>' +
      '<div class="pa-meta">' + metaLines(c, rows).map(escapeHtml).join('<br/>') + '</div>' +
      '<table><thead><tr>' + head.map((h) => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + body + '</tbody></table>';
    document.body.appendChild(area);
    document.documentElement.classList.add('printing');
    const done = () => {
      window.removeEventListener('afterprint', done);
      removePrintArea();
    };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 80);
  }

  // ---- Excel ----
  async function doXlsx(c, rows) {
    try {
      await ensureXlsxLoaded();
    } catch (e) {
      alert((e && e.message) || 'Gagal memuat pustaka Excel. Cek koneksi internet lalu coba lagi.');
      return;
    }
    const head = ['No', 'Kode', 'Nama Barang', 'Brand', 'Harga (Rp)'].concat(opts.stok ? ['Stok'] : []);
    const top = [[EXPORT_HEADER_NAME], [titleOf(c)]].concat(metaLines(c, rows).map((l) => [l]), [[]]);
    const aoa = top.concat([head]);
    const firstData = aoa.length;
    rows.forEach((r) => {
      aoa.push([r.no, r.code, r.desc, r.brand, r.price === null ? '' : r.price].concat(opts.stok ? [r.stok] : []));
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    for (let i = 0; i < rows.length; i++) {
      const cell = ws[XLSX.utils.encode_cell({ r: firstData + i, c: 4 })];
      if (cell && typeof cell.v === 'number') cell.z = '#,##0';
    }
    ws['!cols'] = [{ wch: 5 }, { wch: 20 }, { wch: 52 }, { wch: 14 }, { wch: 14 }].concat(opts.stok ? [{ wch: 30 }] : []);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Daftar Harga');
    XLSX.writeFile(wb, fileBase(c) + '.xlsx');
  }

  // ---- Tampilan: tombol + panel kecil di atas hasil ----
  const bar = document.createElement('div');
  bar.id = 'exportBar';
  bar.hidden = true;
  bar.innerHTML = '<button type="button" id="exportBtn" class="ex-open" aria-expanded="false">⬇ Ekspor / Cetak</button>';
  const panel = document.createElement('div');
  panel.id = 'exportPanel';
  panel.hidden = true;
  panel.innerHTML =
    '<div id="exportInfo" class="ex-info"></div>' +
    '<label class="ex-opt"><input type="checkbox" id="exStok" checked /> Tampilkan kolom stok</label>' +
    '<label class="ex-opt"><input type="checkbox" id="exNoPrice" /> Sembunyikan barang tanpa harga</label>' +
    '<div class="ex-btns"><button type="button" class="ex-go" data-act="print">🖨 Cetak / Simpan PDF</button>' +
    '<button type="button" class="ex-go" data-act="xlsx">📊 Unduh Excel</button></div>';
  resultsEl.parentNode.insertBefore(bar, resultsEl);
  resultsEl.parentNode.insertBefore(panel, resultsEl);

  function refreshPanel() {
    const c = collect();
    if (!c) return;
    const noPrice = c.all.filter((it) => itemPrice(it) === null).length;
    const n = opts.hideNoPrice ? c.all.length - noPrice : c.all.length;
    document.getElementById('exportInfo').textContent =
      n + ' barang akan diekspor (semua hasil, bukan hanya yang tampil)' + (noPrice ? ' · ' + noPrice + ' tanpa harga' : '');
  }
  function refreshBar() {
    const has = !!resultsEl.querySelector('.card');
    bar.hidden = !has;
    if (!has) {
      panel.hidden = true;
      document.getElementById('exportBtn').setAttribute('aria-expanded', 'false');
    } else if (!panel.hidden) refreshPanel();
  }
  new MutationObserver(refreshBar).observe(resultsEl, { childList: true });

  document.getElementById('exportBtn').addEventListener('click', function () {
    panel.hidden = !panel.hidden;
    this.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) refreshPanel();
  });
  document.getElementById('exStok').addEventListener('change', (e) => (opts.stok = e.target.checked));
  document.getElementById('exNoPrice').addEventListener('change', (e) => {
    opts.hideNoPrice = e.target.checked;
    refreshPanel();
  });
  panel.addEventListener('click', function (e) {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const c = collect();
    if (!c) return;
    const rows = buildRows(c);
    if (!rows.length) {
      alert('Tidak ada barang untuk diekspor.');
      return;
    }
    if (rows.length > EXPORT_CONFIRM_ROWS && !confirm('Ekspor ' + rows.length + ' barang? Hasil cetak bisa puluhan halaman.')) return;
    if (b.dataset.act === 'print') doPrint(c, rows);
    else doXlsx(c, rows);
  });
})();
