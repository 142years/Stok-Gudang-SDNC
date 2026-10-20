// Ekspor hasil pencarian/filter: Cetak / Simpan PDF dan Excel (.xlsx)
// Memakai ulang runSearch() dengan kata kunci + filter + urutan yang sedang aktif, dan mengambil SEMUA hasil
// (bukan hanya yang tampil di layar). Tidak mengubah file lain.
(function () {
  // ---- Pengaturan (ubah di sini) ----
  const EXPORT_HEADER_NAME = 'Cek Harga & Stok SDNC'; // tampil di kop cetak / Excel
  const EXPORT_CONFIRM_ROWS = 500; // di atas jumlah ini, tanya konfirmasi dulu
  // Barang LDU: namanya/kodenya memuat kata LDU, atau stok SDNC-nya hanya unit demo/rusak.
  const EXPORT_LDU_RE = /\bLDU\b/i;

  // Pilihan di panel (default): kolom Kode/Brand/Stok ikut; keterangan atas (filter, jumlah, waktu data, tanggal cetak) tidak ikut.
  const opts = { kode: true, brand: true, stok: true, hideNoPrice: false, hideLdu: false, meta: false };

  function collect() {
    if (typeof catalog === 'undefined' || !catalog || !catalog.items) return null;
    const q = cleanQuery(searchInput.value);
    const f = searchFilters;
    if (!q && !filtersActive(f)) return null;
    const res = runSearch(q, f);
    const all = res.exact.concat(res.list);
    return all.length ? { q, f, all } : null;
  }

  const isLdu = (it) => EXPORT_LDU_RE.test(it.desc || '') || EXPORT_LDU_RE.test(it.code || '') || stockGroup(it) === 2;

  function pick(c) {
    let items = c.all;
    if (opts.hideNoPrice) items = items.filter((it) => itemPrice(it) !== null);
    if (opts.hideLdu) items = items.filter((it) => !isLdu(it));
    return items;
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
    return pick(c).map((it, i) => ({
      no: i + 1,
      code: it.code || '',
      desc: it.desc || '',
      brand: brandLabel(brandKey(it)),
      price: itemPrice(it),
      stok: stockText(it),
    }));
  }

  // Kolom yang ikut, sesuai pilihan di panel
  function columns() {
    const cols = [{ k: 'no', head: 'No', cls: 'c', w: 5 }];
    if (opts.kode) cols.push({ k: 'code', head: 'Kode', w: 20 });
    cols.push({ k: 'desc', head: 'Nama Barang', w: 52 });
    if (opts.brand) cols.push({ k: 'brand', head: 'Brand', w: 14 });
    cols.push({ k: 'price', head: 'Harga', headXlsx: 'Harga (Rp)', cls: 'r', w: 14 });
    if (opts.stok) cols.push({ k: 'stok', head: 'Stok', w: 30 });
    return cols;
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
    const b = c.f.brand;
    return 'Daftar Harga' + (b.length && b.length <= 3 ? ' ' + b.map(brandLabel).join(', ') : '');
  }
  // Keterangan atas (hanya bila opsi "Sertakan keterangan" dicentang)
  function metaLines(c, rows) {
    const lines = [];
    const crit = [];
    if (c.q) crit.push('Kata kunci: ' + c.q);
    if (filtersActive(c.f)) crit.push('Filter: ' + filterSummaryText(c.f));
    crit.push('Urut: ' + (SORT_LABELS[c.f.sort] || SORT_LABELS.relevan));
    lines.push(crit.join(' · '));
    lines.push(rows.length + ' barang');
    const stockAt = (typeof stockAvailMeta !== 'undefined' && stockAvailMeta && stockAvailMeta.updatedAt) || catalog.updatedAt;
    const priceAt = typeof rebornPriceMeta !== 'undefined' && rebornPriceMeta ? rebornPriceMeta.updatedAt : null;
    lines.push('Data stok: ' + fmtDT(stockAt) + ' · Harga: ' + fmtDT(priceAt));
    lines.push('Dicetak: ' + fmtDT(new Date()));
    return lines;
  }
  function fileBase(c) {
    const f = c.f;
    const src = f.brand.length ? f.brand.map(brandLabel).join('-') : f.jenis.length ? f.jenis.map(jenisLabel).join('-') : c.q || 'hasil';
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
    const cols = columns();
    const body = rows
      .map(
        (r) =>
          '<tr>' +
          cols
            .map((col) => {
              const v = col.k === 'price' ? (r.price === null ? '-' : fmtRupiah(r.price)) : r[col.k];
              return '<td' + (col.cls ? ' class="' + col.cls + '"' : '') + '>' + escapeHtml(String(v)) + '</td>';
            })
            .join('') +
          '</tr>'
      )
      .join('');
    const area = document.createElement('div');
    area.id = 'printArea';
    area.innerHTML =
      '<div class="pa-org">' + escapeHtml(EXPORT_HEADER_NAME) + '</div><h1>' + escapeHtml(titleOf(c)) + '</h1>' +
      (opts.meta ? '<div class="pa-meta">' + metaLines(c, rows).map(escapeHtml).join('<br/>') + '</div>' : '') +
      '<table><thead><tr>' + cols.map((col) => '<th>' + col.head + '</th>').join('') + '</tr></thead><tbody>' + body + '</tbody></table>';
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
    const cols = columns();
    const top = [[EXPORT_HEADER_NAME], [titleOf(c)]];
    if (opts.meta) metaLines(c, rows).forEach((l) => top.push([l]));
    top.push([]);
    const aoa = top.concat([cols.map((col) => col.headXlsx || col.head)]);
    const firstData = aoa.length;
    rows.forEach((r) => aoa.push(cols.map((col) => (col.k === 'price' ? (r.price === null ? '' : r.price) : r[col.k]))));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const priceCol = cols.findIndex((col) => col.k === 'price');
    for (let i = 0; i < rows.length; i++) {
      const cell = ws[XLSX.utils.encode_cell({ r: firstData + i, c: priceCol })];
      if (cell && typeof cell.v === 'number') cell.z = '#,##0';
    }
    ws['!cols'] = cols.map((col) => ({ wch: col.w }));
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
  const chk = (key, label, on) => '<label class="ex-opt"><input type="checkbox" data-opt="' + key + '"' + (on ? ' checked' : '') + ' /> ' + label + '</label>';
  panel.innerHTML =
    '<div id="exportInfo" class="ex-info"></div>' +
    '<div class="ex-grp">Kolom yang dicetak</div><div class="ex-row">' + chk('kode', 'Kode', opts.kode) + chk('brand', 'Brand', opts.brand) + chk('stok', 'Stok', opts.stok) + '</div>' +
    '<div class="ex-grp">Barang</div><div class="ex-row">' + chk('hideNoPrice', 'Sembunyikan barang tanpa harga', opts.hideNoPrice) + chk('hideLdu', 'Sembunyikan barang LDU / unit demo', opts.hideLdu) + '</div>' +
    '<div class="ex-grp">Keterangan</div><div class="ex-row">' + chk('meta', 'Sertakan keterangan (filter, jumlah, waktu data, tanggal cetak)', opts.meta) + '</div>' +
    '<div class="ex-btns"><button type="button" class="ex-go" data-act="print">🖨 Cetak / Simpan PDF</button>' +
    '<button type="button" class="ex-go" data-act="xlsx">📊 Unduh Excel</button></div>';
  resultsEl.parentNode.insertBefore(bar, resultsEl);
  resultsEl.parentNode.insertBefore(panel, resultsEl);

  function refreshPanel() {
    const c = collect();
    if (!c) return;
    const noPrice = c.all.filter((it) => itemPrice(it) === null).length;
    const ldu = c.all.filter(isLdu).length;
    const extra = [];
    if (noPrice) extra.push(noPrice + ' tanpa harga');
    if (ldu) extra.push(ldu + ' LDU/demo');
    document.getElementById('exportInfo').textContent =
      pick(c).length + ' barang akan diekspor (semua hasil, bukan hanya yang tampil)' + (extra.length ? ' · dari hasil ini: ' + extra.join(', ') : '');
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
  panel.addEventListener('change', function (e) {
    const k = e.target && e.target.dataset && e.target.dataset.opt;
    if (!k) return;
    opts[k] = e.target.checked;
    refreshPanel();
  });
  panel.addEventListener('click', function (e) {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const c = collect();
    if (!c) return;
    const rows = buildRows(c);
    if (!rows.length) {
      alert('Tidak ada barang untuk diekspor. Coba lepas centang "Sembunyikan ...".');
      return;
    }
    if (rows.length > EXPORT_CONFIRM_ROWS && !confirm('Ekspor ' + rows.length + ' barang? Hasil cetak bisa puluhan halaman.')) return;
    if (b.dataset.act === 'print') doPrint(c, rows);
    else doXlsx(c, rows);
  });
})();
