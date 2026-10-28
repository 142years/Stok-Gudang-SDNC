// Menu "Gudang Khusus" (rusak / demo / keep) — daftar barang per gudang, nomor seri, salin & unduh Excel.
// Butuh stock-config.js (STOCK_SPECIAL_WAREHOUSES) dan data katalog (catalog.items: ownByWh, ownUnits).
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = escapeHtml;
  const overlay = $('spOverlay'),
    body = $('spBody');
  const WH = Object.keys(STOCK_SPECIAL_WAREHOUSES);
  const S = { wh: WH[0], q: '', open: new Set() };

  const fmtDT = (iso) => new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  const label = (wh) => STOCK_SPECIAL_WAREHOUSES[wh];
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // Barang yang ada di gudang `wh`: [{ code, desc, qty, units, noSn }]. qty dari Stock Available (ownByWh),
  // dan tidak pernah lebih kecil dari jumlah nomor seri yang tercatat di file Serial Number.
  function collect(wh) {
    const out = [];
    ((catalog && catalog.items) || []).forEach((it) => {
      const units = (it.ownUnits || []).filter((u) => String(u.whcode).toUpperCase() === wh);
      const qty = Math.max((it.ownByWh && Number(it.ownByWh[wh])) || 0, units.length);
      if (qty <= 0) return;
      out.push({ code: it.code, desc: it.desc || '', qty, units, noSn: Math.max(0, qty - units.length) });
    });
    out.sort((a, b) => a.desc.localeCompare(b.desc, 'id') || a.code.localeCompare(b.code));
    return out;
  }
  const sumQty = (list) => list.reduce((a, x) => a + x.qty, 0);

  function filtered(list) {
    const toks = S.q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!toks.length) return list;
    return list.filter((x) => {
      const hay = (x.desc + ' ' + x.code + ' ' + x.units.map((u) => u.serial).join(' ')).toLowerCase();
      return toks.every((t) => hay.includes(t));
    });
  }

  function open() {
    overlay.classList.add('show');
    document.documentElement.classList.add('sp-open');
    render();
  }
  function close() {
    overlay.classList.remove('show');
    document.documentElement.classList.remove('sp-open');
  }

  function metaLine() {
    const when = (stockAvailMeta && stockAvailMeta.updatedAt) || (catalog && catalog.updatedAt);
    return `Gudang ${esc(S.wh)} · ${when ? 'data diperbarui ' + esc(fmtDT(when)) : 'data belum ada'}`;
  }

  function render() {
    if (!catalog) {
      body.innerHTML = '<div class="sp-wrap"><div class="sp-empty"><b>Belum ada data.</b><p>Data stok belum dimuat dari server.</p></div></div>';
      return;
    }
    const hadFocus = document.activeElement && document.activeElement.id === 'spQ';
    const tabs = WH.map((w) => {
      const n = sumQty(collect(w));
      return `<button type="button" class="chip${w === S.wh ? ' on' : ''}" data-wh="${esc(w)}">${esc(label(w))}<small>${n}</small></button>`;
    }).join('');
    body.innerHTML = `<div class="sp-wrap">
      <div class="sp-meta" id="spMeta"></div>
      <div class="sp-chips">${tabs}</div>
      <input id="spQ" class="sp-q" type="search" value="${esc(S.q)}" placeholder="Cari nama, kode barang, atau serial number…" autocomplete="off" autocapitalize="off" spellcheck="false">
      <div class="sp-bar"><span id="spSum"></span><span class="sp-acts"><button type="button" class="sp-btn" data-act="copy">Salin</button><button type="button" class="sp-btn" data-act="xlsx">Unduh Excel</button></span></div>
      <div id="spList"></div>
    </div>`;
    updateList();
    if (hadFocus) {
      const q = $('spQ');
      q.focus();
      q.setSelectionRange(q.value.length, q.value.length);
    }
  }

  function unitsHtml(x) {
    const rows = x.units
      .map(
        (u) => `<div class="sp-unit"><span>${esc(u.serial)}${u.status === 'Allocated' ? ' <span class="badge-mini">Allocated</span>' : ''}</span><span>${esc(u.admissionDate)}</span></div>`,
      )
      .join('');
    const rest = x.noSn > 0 ? `<div class="sp-unit muted"><span>tanpa nomor seri</span><span>${x.noSn} pcs</span></div>` : '';
    return `<div class="sp-units">${rows}${rest}</div>`;
  }

  function updateList() {
    const el = $('spList');
    if (!el) return;
    const all = collect(S.wh);
    const list = filtered(all);
    $('spMeta').innerHTML = metaLine();
    $('spSum').textContent = S.q.trim()
      ? `${list.length} dari ${all.length} barang · ${sumQty(list)} pcs`
      : `${all.length} barang · ${sumQty(all)} pcs`;
    if (!list.length) {
      el.innerHTML = all.length
        ? '<div class="sp-empty">Tidak ada yang cocok dengan pencarian.</div>'
        : `<div class="sp-empty"><b>Tidak ada barang di ${esc(label(S.wh))} (${esc(S.wh)}).</b>${
            stockAvailOwn === null ? '<p>Data Stock Available belum diunggah.</p>' : ''
          }</div>`;
      return;
    }
    const q = S.q.trim().toLowerCase();
    el.innerHTML = list
      .map((x) => {
        const key = S.wh + '::' + x.code;
        const hasSn = x.units.length > 0;
        const isOpen = hasSn && (S.open.has(key) || (q && x.units.some((u) => u.serial.toLowerCase().includes(q))));
        const sub = hasSn ? `${x.units.length} unit ber-SN${x.noSn ? ` · ${x.noSn} tanpa SN` : ''}` : 'tanpa nomor seri';
        const inner = `<span class="sp-main"><span class="sp-name">${esc(x.desc)}</span><span class="sp-code">${esc(x.code)}</span><span class="sp-sub">${esc(sub)}${hasSn ? (isOpen ? ' · sembunyikan' : ' · lihat SN') : ''}</span></span><span class="sp-qty">${x.qty}<small>pcs</small></span>`;
        return `<div class="sp-item">${
          hasSn
            ? `<button type="button" class="sp-row" data-k="${esc(key)}" aria-expanded="${isOpen}">${inner}</button>`
            : `<div class="sp-row static">${inner}</div>`
        }${isOpen ? unitsHtml(x) : ''}</div>`;
      })
      .join('');
  }

  // Baris untuk Salin / Excel: satu baris per nomor seri, ditambah satu baris untuk sisa yang tanpa SN
  function exportRows() {
    const rows = [['Gudang', 'Kode', 'Nama Barang', 'Serial Number', 'Tgl Masuk', 'Status', 'Qty']];
    filtered(collect(S.wh)).forEach((x) => {
      x.units.forEach((u) => rows.push([S.wh, x.code, x.desc, u.serial, u.admissionDate || '', u.status || '', 1]));
      if (x.noSn > 0) rows.push([S.wh, x.code, x.desc, '', '', '', x.noSn]);
    });
    return rows;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  function flash(btn, text) {
    const old = btn.textContent;
    btn.textContent = text;
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = old;
      btn.disabled = false;
    }, 1600);
  }

  async function doCopy(btn) {
    const rows = exportRows();
    if (rows.length < 2) return flash(btn, 'Kosong');
    await copyText(rows.map((r) => r.map((c) => String(c).replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n'));
    flash(btn, 'Tersalin ✓');
  }

  async function doXlsx(btn) {
    const rows = exportRows();
    if (rows.length < 2) return flash(btn, 'Kosong');
    btn.disabled = true;
    try {
      await ensureXlsxLoaded();
      const ws = XLSX.utils.aoa_to_sheet(rows); // teks tetap teks, jadi serial/IMEI tidak berubah jadi angka ilmiah
      ws['!cols'] = [{ wch: 11 }, { wch: 20 }, { wch: 48 }, { wch: 26 }, { wch: 12 }, { wch: 11 }, { wch: 6 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, label(S.wh));
      XLSX.writeFile(wb, `Gudang-${label(S.wh)}-${today()}.xlsx`);
      btn.disabled = false;
    } catch (e) {
      btn.disabled = false;
      flash(btn, 'Gagal');
    }
  }

  body.addEventListener('input', (e) => {
    if (e.target.id !== 'spQ') return;
    S.q = e.target.value;
    updateList();
  });
  body.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-wh]');
    if (chip) {
      S.wh = chip.dataset.wh;
      render();
      return;
    }
    const row = e.target.closest('.sp-row[data-k]');
    if (row) {
      const k = row.dataset.k;
      if (S.open.has(k)) S.open.delete(k);
      else S.open.add(k);
      updateList();
      return;
    }
    const act = e.target.closest('[data-act]');
    if (act && act.dataset.act === 'copy') doCopy(act);
    else if (act && act.dataset.act === 'xlsx') doXlsx(act);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('show')) close();
  });
  $('spOpenBtn').addEventListener('click', open);
  $('spCloseBtn').addEventListener('click', close);

  // dipanggil setelah data stok dihitung ulang (upload / sinkron / hapus)
  window.specialRefresh = function () {
    if (overlay.classList.contains('show')) render();
  };
})();
