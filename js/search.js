// Pencarian, kartu barang, FIFO, dan verifikasi SN
const FIFO_PREVIEW_LIMIT = 5;

function renderFifoList(it) {
  if (!it.ownUnits || it.ownUnits.length === 0) return '';
  const isOpen = openFifo.has(it.code);
  const label = isOpen ? 'Sembunyikan Serial Number' : `Lihat Serial Number (FIFO) · ${it.ownUnits.length} unit`;
  let listHtml = '';
  if (isOpen) {
    const shown = it.ownUnits.slice(0, FIFO_PREVIEW_LIMIT);
    const remaining = it.ownUnits.length - shown.length;
    listHtml =
      '<div class="fifo-list">' +
      shown
        .map(
          (u, idx) => `
 <div class="fifo-row${idx === 0 ? ' first' : ''}">
 <span>${idx === 0 ? '➜ ' : ''}${escapeHtml(u.serial)}${u.status === 'Allocated' ? ' <span class="badge-mini">Allocated</span>' : ''}</span>
 <span>${escapeHtml(u.admissionDate)} · ${escapeHtml(u.whcode)}</span>
 </div>
 `,
        )
        .join('') +
      (remaining > 0 ? `<div class="fifo-more">dan ${remaining} lainnya</div>` : '') +
      '</div>';
  }
  return `<button class="fifo-toggle" data-code="${escapeHtml(it.code)}">${label}</button>${listHtml}`;
}

function renderBranchesToggle(it) {
  if (!it.others) return '';
  const isOpen = openBranches.has(it.code);
  const branchCount = Object.keys(it.others).length;
  const total = Object.values(it.others).reduce((a, b) => a + b, 0);
  const label = isOpen ? 'Sembunyikan detail cabang' : `Lihat stok cabang lain · ${branchCount} cabang, ${total} pcs`;
  let listHtml = '';
  if (isOpen) {
    const sorted = Object.entries(it.others).sort((a, b) => b[1] - a[1]);
    listHtml =
      '<div class="branch-list">' +
      sorted
        .map(([wh, qty]) => {
          const bKey = it.code + '::' + wh;
          const branchOpen = openBranchUnits.has(bKey);
          const units = (it.otherUnits && it.otherUnits[wh]) || [];
          let unitsHtml = '';
          if (branchOpen) {
            if (units.length) {
              unitsHtml =
                '<div class="fifo-list">' +
                units
                  .map(
                    (u, idx) => `
 <div class="fifo-row${idx === 0 ? ' first' : ''}">
 <span>${idx === 0 ? '➜ ' : ''}${escapeHtml(u.serial)}${u.status === 'Allocated' ? ' <span class="badge-mini">Allocated</span>' : ''}</span>
 <span>${escapeHtml(u.admissionDate)}</span>
 </div>
 `,
                  )
                  .join('') +
                '</div>';
            } else {
              unitsHtml =
                '<div class="fifo-list"><div class="fifo-more">Nomor SN untuk cabang ini tidak tersedia (bukan dari data per-unit).</div></div>';
            }
          }
          return `<div class="branch-unit-wrap">
 <button class="branch-unit-toggle" data-code="${escapeHtml(it.code)}" data-wh="${escapeHtml(wh)}">
 <span>${escapeHtml(wh)}${whTag(wh)}</span><span>${qty} pcs</span>
 </button>
 ${unitsHtml}
 </div>`;
        })
        .join('') +
      '</div>';
  }
  return `<button class="branch-toggle" data-code="${escapeHtml(it.code)}">${label}</button>${listHtml}`;
}

function whTag(wh) {
  const t = STOCK_WAREHOUSE_TAGS[String(wh).split('.').pop().toUpperCase()];
  return t ? ` <span class="wh-tag">${escapeHtml(t)}</span>` : '';
}
// Stok di gudang SDNC yang bukan stok jual (demo/rusak): { total, text } atau null
function ownNonReadyInfo(it) {
  const o = it.ownNonReady;
  if (!o) return null;
  let total = 0;
  const parts = [];
  Object.keys(o).forEach((wh) => {
    if (o[wh] > 0) {
      total += o[wh];
      parts.push(`${STOCK_NONREADY_LABELS[wh.toUpperCase()] || wh} ${o[wh]} pcs`);
    }
  });
  return total > 0 ? { total, text: parts.join(' · ') } : null;
}

function renderItem(it) {
  const eff = getEffectivePrice(it);
  const priceStr = fmtRupiah(eff.price);
  const priceNote = eff.price > 0 ? '' : '<div style="font-size:11px; color:var(--muted); margin-top:2px;">Harga belum ada di Price List Reborn</div>';
  const free = it.available || 0,
    alloc = it.allocatedOwn || 0,
    readyCount = free + alloc; // fisik di gudang SDNC (Allocated ikut dihitung: bisa di-cancel di SAP untuk dijual)
  const nr = ownNonReadyInfo(it);
  let statusHtml;
  if (readyCount > 0) {
    statusHtml = `<span class="badge ready">READY · ${readyCount} pcs</span>`;
  } else if (it.others) {
    statusHtml = `<span class="badge indent">INDENT</span>`;
  } else if (nr) {
    statusHtml = `<span class="badge demo">DI SDNC · ${escapeHtml(nr.text)}</span>`;
  } else {
    statusHtml = `<span class="badge out">HABIS · tidak ada di cabang lain</span>`;
  }
  // Keterangan untuk SEMUA barang (bukan hanya yang bernomor seri)
  let notesHtml = '';
  if (alloc > 0) {
    notesHtml += `<div class="alloc-note">⚠ <b>${alloc} pcs berstatus Allocated</b>${free > 0 ? ` (bebas ${free} pcs)` : ' — tidak ada yang bebas'}. Fisik masih di gudang SDNC; minta cancel alokasi di SAP dulu sebelum dijual ke customer.</div>`;
  }
  if (nr) {
    notesHtml +=
      readyCount > 0 || it.others
        ? `<div class="alloc-note muted">Ada juga di SDNC (bukan stok jual): ${escapeHtml(nr.text)}.</div>`
        : `<div class="alloc-note">Ada di gudang SDNC sebagai unit ${escapeHtml(nr.text)} — bukan stok jual.</div>`;
  }
  let barcodeHtml = '';
  if (staffMode) {
    const codes = getBarcodes(it.code);
    if (codes && codes.length) {
      barcodeHtml = `<div class="card-barcode">Barcode: <span class="barcode-val">${codes.map(escapeHtml).join(' / ')}</span></div>`;
    }
  }
  return `<div class="card">
 <div class="card-desc">${escapeHtml(it.desc)}</div>
 <div class="card-code">${escapeHtml(it.code)}</div>
 ${barcodeHtml}
 <div class="card-row"><span class="price">${priceStr}</span>${statusHtml}</div>
 ${priceNote}
 ${notesHtml}
 ${it.others ? renderBranchesToggle(it) : ''}
 ${renderFifoList(it)}
 </div>`;
}

resultsEl.addEventListener('click', function (e) {
  if (e.target.closest('#moreBtn')) {
    shownLimit += RESULT_LIMIT;
    doSearch();
    return;
  }
  if (e.target.closest('#resetFiltersBtn')) {
    if (typeof filterReset === 'function') filterReset();
    return;
  }
  const branchUnitBtn = e.target.closest('.branch-unit-toggle');
  if (branchUnitBtn) {
    const code = branchUnitBtn.getAttribute('data-code');
    const wh = branchUnitBtn.getAttribute('data-wh');
    const key = code + '::' + wh;
    if (openBranchUnits.has(key)) openBranchUnits.delete(key);
    else openBranchUnits.add(key);
    doSearch();
    return;
  }
  const fifoBtn = e.target.closest('.fifo-toggle');
  if (fifoBtn) {
    const code = fifoBtn.getAttribute('data-code');
    if (openFifo.has(code)) openFifo.delete(code);
    else openFifo.add(code);
    doSearch();
    return;
  }
  const branchBtn = e.target.closest('.branch-toggle');
  if (branchBtn) {
    const code = branchBtn.getAttribute('data-code');
    if (openBranches.has(code)) openBranches.delete(code);
    else openBranches.add(code);
    doSearch();
  }
});

let searchTimer = null;
searchInput.addEventListener('input', function () {
  clearTimeout(searchTimer);
  if (scanBurstActive()) return; // sedang menerima scan — jangan cari huruf demi huruf
  searchTimer = setTimeout(function () {
    currentScan = null;
    doSearch();
  }, 120);
});

let shownLimit = RESULT_LIMIT;
let _lastSearchKey = '';
const SORT_LABELS = { relevan: 'paling cocok, ready dulu', 'harga-asc': 'harga termurah', 'harga-desc': 'harga termahal', stok: 'stok terbanyak' };

function filterSummaryText(f) {
  const bits = [];
  if (f.jenis) bits.push(jenisLabel(f.jenis));
  if (f.brand) bits.push(brandLabel(f.brand));
  if (f.min !== null || f.max !== null) {
    bits.push(f.min !== null && f.max !== null ? `Rp ${fmtJt(f.min)}–${fmtJt(f.max)}` : f.max !== null ? `maks Rp ${fmtJt(f.max)}` : `min Rp ${fmtJt(f.min)}`);
  }
  if (f.stock === 'ready') bits.push('Ready');
  if (f.stock === 'ada') bits.push('Ready + Indent');
  return bits.join(' · ');
}

function doSearch() {
  if (!catalog) {
    renderEmpty();
    return;
  }
  const f = searchFilters;
  const q = cleanQuery(searchInput.value);
  if (!q && !filtersActive(f)) {
    renderEmpty();
    if (typeof filterRefresh === 'function') filterRefresh();
    return;
  }
  const key = q.toLowerCase() + '|' + JSON.stringify(f);
  if (key !== _lastSearchKey) {
    _lastSearchKey = key;
    shownLimit = RESULT_LIMIT; // pencarian/filter baru -> mulai dari halaman pertama
  }
  const res = runSearch(q, f);
  const all = res.exact.concat(res.list);
  if (typeof filterRefresh === 'function') filterRefresh();
  if (all.length === 0) {
    const extra = res.noPrice ? `<br/>${res.noPrice} barang cocok tapi belum punya harga.` : '';
    resultsEl.innerHTML = `<div class="empty">Tidak ditemukan${filtersActive(f) ? ` dengan filter <b>${escapeHtml(filterSummaryText(f))}</b>` : ''}.${extra}<br/>${
      filtersActive(f) ? '<button type="button" id="resetFiltersBtn" class="more-btn" style="margin-top:10px">Reset filter</button>' : 'Coba kata kunci lain.'
    }</div>`;
    footNote.textContent = '';
    return;
  }
  const shown = all.slice(0, shownLimit);
  const left = all.length - shown.length;
  resultsEl.innerHTML =
    shown.map(renderItem).join('') +
    (left > 0 ? `<button type="button" id="moreBtn" class="more-btn">Tampilkan ${Math.min(RESULT_LIMIT, left)} lagi (${left} tersisa)</button>` : '');
  const parts = [`${all.length} hasil`];
  if (filtersActive(f)) parts.push(`filter: ${filterSummaryText(f)}`);
  parts.push(`urut: ${SORT_LABELS[f.sort] || SORT_LABELS.relevan}`);
  if (res.noPrice) parts.push(`${res.noPrice} barang tanpa harga tidak ikut`);
  footNote.textContent = parts.join(' · ');
}

let verifyTimer = null;
verifyInput.addEventListener('input', function () {
  clearTimeout(verifyTimer);
  verifyTimer = setTimeout(doVerify, 120);
});

function fifoNoteHtml(hit) {
  if (hit.nonReady) {
    const lbl = STOCK_NONREADY_LABELS[String(hit.whcode).toUpperCase()] || hit.whcode;
    return `<span class="verify-warn">⚠ Unit ${escapeHtml(lbl)} di ${escapeHtml(hit.whcode)} — bukan stok jual, jangan dijual sebagai barang baru.</span>`;
  }
  const allocWarn =
    hit.status === 'Allocated'
      ? '<br/><span class="verify-warn">⚠ Status: Allocated — minta cancel alokasi di sistem SAP dulu sebelum dijual ke customer.</span>'
      : '';
  if (hit.rank === 0) {
    return `<span class="verify-ok">✔ Sesuai urutan FIFO</span> — masuk ${escapeHtml(hit.admissionDate)}, di ${escapeHtml(hit.whcode)}.${allocWarn}`;
  }
  return `<span class="verify-warn">⚠ Bukan unit FIFO pertama</span> (masuk ${escapeHtml(hit.admissionDate)}). Ada unit lebih lama: <b>${escapeHtml(hit.oldestSerial)}</b> (masuk ${escapeHtml(hit.oldestDate)}) — ambil itu dulu.${allocWarn}`;
}

function verifyHtml(sn) {
  if (!catalog || !catalog.serialIndex) return '<span class="verify-bad">Belum ada data. Update data dulu.</span>';
  const hit = catalog.serialIndex[sn];
  if (!hit) return '<span class="verify-bad">Serial number tidak ditemukan di data hari ini. Cek ulang input.</span>';
  const itemLine = `${escapeHtml(hit.desc)} <span style="color:var(--muted)">(${escapeHtml(hit.code)})</span>`;
  const price = fmtRupiah(getEffectivePrice({ code: hit.code, desc: hit.desc }).price);
  return `${itemLine}<br/>Harga: <b style="color:var(--text);">${price}</b><br/>${fifoNoteHtml(hit)}`;
}

function doVerify() {
  const sn = verifyInput.value.trim();
  verifyResult.innerHTML = sn ? verifyHtml(sn) : '';
}

// Scanner di kolom verifikasi: Enter -> tampilkan hasil, lalu blok teks supaya scan berikutnya menimpa
verifyInput.addEventListener('keydown', function (e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  clearTimeout(verifyTimer);
  doVerify();
  verifyInput.select();
});
