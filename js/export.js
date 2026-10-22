// Ekspor hasil pencarian/filter: Cetak / Simpan PDF dan Excel (.xlsx)
// Memakai ulang runSearch() dengan kata kunci + filter + urutan yang sedang aktif, dan mengambil SEMUA hasil
// (bukan hanya yang tampil di layar). Tidak mengubah file lain.
(function () {
  // ---- Pengaturan (ubah di sini) ----
  const EXPORT_HEADER_NAME = 'Cek Harga & Stok SDNC'; // tampil di kop cetak / Excel
  const EXPORT_CONFIRM_ROWS = 500; // di atas jumlah ini, tanya konfirmasi dulu
  // Barang LDU: namanya/kodenya memuat kata LDU, atau stok SDNC-nya hanya unit demo/rusak.
  const EXPORT_LDU_RE = /\bLDU\b/i;
  // Pustaka pembuat PDF (dimuat saat tombol Unduh PDF ditekan, versi dikunci)
  const PDF_LIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  const PDF_TABLE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';

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

  // Kolom yang ikut, sesuai pilihan di panel. noBrand = brand tidak dicetak sebagai kolom (dipakai saat dikelompokkan per brand)
  function columns(noBrand) {
    const cols = [{ k: 'no', head: 'No', cls: 'c', w: 10 }];
    if (opts.kode) cols.push({ k: 'code', head: 'Kode', cls: 'n', w: 34 });
    cols.push({ k: 'desc', head: 'Nama Barang', w: 'auto' });
    if (opts.brand && !noBrand) cols.push({ k: 'brand', head: 'Brand', cls: 'n', w: 22 });
    cols.push({ k: 'price', head: 'Harga', headXlsx: 'Harga (Rp)', cls: 'r', w: 28 });
    if (opts.stok) cols.push({ k: 'stok', head: 'Stok', cls: 'n', w: 34 });
    return cols;
  }

  // Pengelompokan per brand: hanya bila opsi Brand dicentang dan hasilnya memuat lebih dari satu brand.
  // Urutan brand = urutan pilihan di filter (bila memilih beberapa brand), selain itu abjad. Urutan barang di dalam brand tidak berubah.
  function arrange(c, rows) {
    const labels = [];
    rows.forEach((r) => {
      if (!labels.includes(r.brand)) labels.push(r.brand);
    });
    if (!opts.brand || labels.length < 2) return { grouped: false, groups: [{ label: '', rows }], flat: rows };
    const wanted = c.f.brand.length > 1 ? c.f.brand.map(brandLabel) : [];
    const order = wanted.filter((l) => labels.includes(l)).concat(labels.filter((l) => !wanted.includes(l)).sort((x, y) => x.localeCompare(y)));
    const groups = order.map((label) => ({ label, rows: rows.filter((r) => r.brand === label).map((r, i) => Object.assign({}, r, { no: i + 1 })) }));
    const flat = [];
    groups.forEach((g) => g.rows.forEach((r) => flat.push(Object.assign({}, r, { no: flat.length + 1 }))));
    return { grouped: true, groups, flat };
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

  // ---- Cetak lewat dialog browser ----
  function removePrintArea() {
    const old = document.getElementById('printArea');
    if (old) old.remove();
    document.documentElement.classList.remove('printing');
  }
  function doPrint(c, rows) {
    if (typeof window.print !== 'function') {
      alert('Browser ini tidak mendukung cetak. Gunakan tombol Unduh PDF.');
      return;
    }
    removePrintArea();
    const arr = arrange(c, rows);
    const cols = columns(arr.grouped);
    const cell = (col, r) => {
      const v = col.k === 'price' ? (r.price === null ? '-' : fmtRupiah(r.price)) : r[col.k];
      return '<td' + (col.cls ? ' class="' + col.cls + '"' : '') + '>' + escapeHtml(String(v)) + '</td>';
    };
    const body = arr.groups
      .map(
        (g) =>
          (arr.grouped ? '<tr class="grp"><td colspan="' + cols.length + '">' + escapeHtml(g.label) + ' <small>(' + g.rows.length + ' barang)</small></td></tr>' : '') +
          g.rows.map((r) => '<tr>' + cols.map((col) => cell(col, r)).join('') + '</tr>').join('')
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
    // Bersihkan setelah dialog cetak ditutup (diberi jeda: sebagian browser HP memicu afterprint lebih awal)
    const done = () => {
      window.removeEventListener('afterprint', done);
      setTimeout(removePrintArea, 1500);
    };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 80);
  }

  // ---- Pemuat pustaka (dengan ulang-coba bila gagal) ----
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => {
        s.remove();
        reject(new Error('Gagal memuat pustaka dari internet. Cek koneksi lalu coba lagi.'));
      };
      document.head.appendChild(s);
    });
  }
  let pdfLibPromise = null;
  function ensurePdfLib() {
    if (window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable) return Promise.resolve();
    if (!pdfLibPromise) {
      pdfLibPromise = (window.jspdf && window.jspdf.jsPDF ? Promise.resolve() : loadScript(PDF_LIB_URL))
        .then(() => loadScript(PDF_TABLE_URL))
        .catch((e) => {
          pdfLibPromise = null;
          throw e;
        });
    }
    return pdfLibPromise;
  }
  async function ensureXlsx() {
    try {
      await ensureXlsxLoaded();
    } catch (e) {
      try {
        xlsxLoadPromise = null; // supaya bisa dicoba lagi tanpa memuat ulang halaman
      } catch (_) {}
      throw new Error('Gagal memuat pustaka Excel dari internet. Cek koneksi lalu coba lagi.');
    }
  }
  // Teks untuk PDF: font bawaan hanya mendukung Latin-1
  const latin = (v) =>
    String(v == null ? '' : v)
      .replace(/[–—]/g, '-')
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[^\x00-\xFF]/g, '?');

  // ---- Unduh PDF (file langsung tersimpan, tanpa dialog cetak) ----
  async function doPdf(c, rows) {
    await ensurePdfLib();
    const arr = arrange(c, rows);
    const cols = columns(arr.grouped);
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const M = 12;
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    let y = M + 3;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(latin(EXPORT_HEADER_NAME), M, y);
    y += 7;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(0);
    doc.text(latin(titleOf(c)), M, y);
    doc.setFont('helvetica', 'normal');
    if (opts.meta) {
      doc.setFontSize(9);
      doc.setTextColor(50);
      metaLines(c, rows).forEach((l) => {
        doc.splitTextToSize(latin(l), pageW - 2 * M).forEach((part) => {
          y += 4.5;
          doc.text(part, M, y);
        });
      });
    }
    y += 5;
    const body = [];
    arr.groups.forEach((g) => {
      if (arr.grouped) {
        body.push([{ content: latin(g.label) + '  (' + g.rows.length + ' barang)', colSpan: cols.length, styles: { fontStyle: 'bold', fillColor: [214, 226, 244], halign: 'left' } }]);
      }
      g.rows.forEach((r) => body.push(cols.map((col) => latin(col.k === 'price' ? (r.price === null ? '-' : fmtRupiah(r.price)) : r[col.k]))));
    });
    const columnStyles = {};
    cols.forEach((col, i) => {
      const st = {};
      if (col.w !== 'auto') st.cellWidth = col.w;
      if (col.cls === 'r') st.halign = 'right';
      if (col.cls === 'c') st.halign = 'center';
      columnStyles[i] = st;
    });
    doc.autoTable({
      startY: y,
      head: [cols.map((col) => col.head)],
      body,
      theme: 'grid',
      margin: { left: M, right: M, top: M, bottom: 14 },
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.6, lineColor: [90, 90, 90], lineWidth: 0.15, textColor: 0, overflow: 'linebreak', valign: 'top' },
      headStyles: { fillColor: [232, 232, 232], textColor: 0, fontStyle: 'bold' },
      columnStyles,
      rowPageBreak: 'avoid',
    });
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(110);
      doc.text('Halaman ' + i + ' / ' + n, pageW - M, pageH - 7, { align: 'right' });
    }
    doc.save(fileBase(c) + '.pdf');
  }

  // ---- Excel ----
  async function doXlsx(c, rows) {
    await ensureXlsx();
    const arr = arrange(c, rows); // bila dikelompokkan, barang diurutkan per brand (kolom Brand tetap ada)
    const cols = columns(false);
    const top = [[EXPORT_HEADER_NAME], [titleOf(c)]];
    if (opts.meta) metaLines(c, rows).forEach((l) => top.push([l]));
    top.push([]);
    const aoa = top.concat([cols.map((col) => col.headXlsx || col.head)]);
    const firstData = aoa.length;
    arr.flat.forEach((r) => aoa.push(cols.map((col) => (col.k === 'price' ? (r.price === null ? '' : r.price) : r[col.k]))));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const priceCol = cols.findIndex((col) => col.k === 'price');
    for (let i = 0; i < arr.flat.length; i++) {
      const cell = ws[XLSX.utils.encode_cell({ r: firstData + i, c: priceCol })];
      if (cell && typeof cell.v === 'number') cell.z = '#,##0';
    }
    ws['!cols'] = cols.map((col) => ({ wch: col.k === 'desc' ? 52 : col.k === 'code' ? 20 : col.k === 'no' ? 5 : col.k === 'stok' ? 30 : 14 }));
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
    '<div class="ex-btns"><button type="button" class="ex-go main" data-act="pdf">📄 Unduh PDF</button>' +
    '<button type="button" class="ex-go" data-act="xlsx">📊 Unduh Excel</button>' +
    '<button type="button" class="ex-go" data-act="print">🖨 Cetak (printer)</button></div>' +
    '<div class="ex-hint">Unduh PDF langsung menyimpan file. Cetak memakai dialog printer browser (bisa juga &quot;Simpan sebagai PDF&quot;).</div>';
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
  panel.addEventListener('click', async function (e) {
    const b = e.target.closest('button[data-act]');
    if (!b || b.disabled) return;
    const c = collect();
    if (!c) return;
    const rows = buildRows(c);
    if (!rows.length) {
      alert('Tidak ada barang untuk diekspor. Coba lepas centang "Sembunyikan ...".');
      return;
    }
    if (rows.length > EXPORT_CONFIRM_ROWS && !confirm('Ekspor ' + rows.length + ' barang? Hasilnya bisa puluhan halaman.')) return;
    const label = b.textContent;
    const all = panel.querySelectorAll('button[data-act]');
    all.forEach((x) => (x.disabled = true));
    b.textContent = 'Menyiapkan…';
    try {
      if (b.dataset.act === 'print') doPrint(c, rows);
      else if (b.dataset.act === 'pdf') await doPdf(c, rows);
      else await doXlsx(c, rows);
    } catch (err) {
      alert((err && err.message) || 'Gagal membuat file. Coba lagi.');
    } finally {
      b.textContent = label;
      all.forEach((x) => (x.disabled = false));
    }
  });
})();
