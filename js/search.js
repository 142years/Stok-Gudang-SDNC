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
 <span>${escapeHtml(wh)}</span><span>${qty} pcs</span>
 </button>
 ${unitsHtml}
 </div>`;
        })
        .join('') +
      '</div>';
  }
  return `<button class="branch-toggle" data-code="${escapeHtml(it.code)}">${label}</button>${listHtml}`;
}

function renderItem(it) {
  const eff = getEffectivePrice(it);
  const priceStr = fmtRupiah(eff.price);
  const priceNote =
    eff.source === 'reborn'
      ? '<div style="font-size:11px; color:var(--muted); margin-top:2px;">Harga Retail dari Price List Reborn (belum ada di Price List utama)</div>'
      : '';
  let statusHtml;
  let isIndent = false;
  const readyCount = (it.available || 0) + (it.allocatedOwn || 0);
  if (readyCount > 0) {
    statusHtml = `<span class="badge ready">READY · ${readyCount} pcs</span>`;
  } else if (it.others) {
    statusHtml = `<span class="badge indent">INDENT</span>`;
    isIndent = true;
  } else if (it.inOwnList) {
    statusHtml = `<span class="badge out">HABIS · tidak ada di cabang lain</span>`;
  } else {
    statusHtml = `<span class="badge out">Tidak ada di price list ini</span>`;
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
 ${isIndent ? renderBranchesToggle(it) : ''}
 ${renderFifoList(it)}
 </div>`;
}

resultsEl.addEventListener('click', function (e) {
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

function getItemSearchHay(it) {
  if (it.__hay) return it.__hay;
  let hay = (it.desc + ' ' + it.code).toLowerCase();
  if (it.ownUnits && it.ownUnits.length) {
    hay +=
      ' ' +
      it.ownUnits
        .map((u) => u.serial)
        .join(' ')
        .toLowerCase();
  }
  const codes = getBarcodes(it.code);
  if (codes && codes.length) {
    hay += ' ' + codes.join(' ').toLowerCase();
  }
  it.__hay = hay;
  return hay;
}

function doSearch() {
  const q = searchInput.value.trim().toLowerCase();
  if (!catalog) {
    renderEmpty();
    return;
  }
  if (!q) {
    renderEmpty();
    return;
  }
  const words = q.split(/\s+/).filter(Boolean);
  const matches = catalog.items.filter((it) => {
    const hay = getItemSearchHay(it);
    return words.every((w) => hay.includes(w));
  });
  if (matches.length === 0) {
    resultsEl.innerHTML = '<div class="empty">Tidak ditemukan. Coba kata kunci lain.</div>';
    footNote.textContent = '';
    return;
  }
  const shown = matches.slice(0, RESULT_LIMIT);
  resultsEl.innerHTML = shown.map(renderItem).join('');
  footNote.textContent =
    matches.length > RESULT_LIMIT
      ? `Menampilkan ${RESULT_LIMIT} dari ${matches.length} hasil — perjelas kata kunci untuk mempersempit.`
      : `${matches.length} hasil ditemukan.`;
}

let verifyTimer = null;
verifyInput.addEventListener('input', function () {
  clearTimeout(verifyTimer);
  verifyTimer = setTimeout(doVerify, 120);
});

function fifoNoteHtml(hit) {
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
  const price = fmtRupiah(getEffectivePrice({ code: hit.code, desc: hit.desc, price: hit.price }).price);
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
