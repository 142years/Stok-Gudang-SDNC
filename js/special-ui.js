// Menu "Gudang Khusus" (rusak / demo / keep) — daftar barang per gudang, nomor seri, salin & unduh Excel.
// Butuh stock-config.js (STOCK_SPECIAL_WAREHOUSES) dan data katalog (catalog.items: ownByWh, ownUnits).
// Scanner: pakai logika yang sama dengan halaman utama (scanner.js) — ketikan cepat = scan, hasil langsung tampil.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = escapeHtml;
  const overlay = $('spOverlay'),
    body = $('spBody');
  const WH = Object.keys(STOCK_SPECIAL_WAREHOUSES);
  const S = { wh: WH[0], q: '', open: new Set(), scan: null };

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
      const units = (it.ownUnits || []).filter((u) => String(u.whcode).trim().toUpperCase() === wh);
      const qty = Math.max((it.ownByWh && Number(it.ownByWh[wh])) || 0, units.length);
      if (qty <= 0) return;
      out.push({ code: it.code, desc: it.desc || '', qty, units, noSn: Math.max(0, qty - units.length) });
    });
    out.sort((a, b) => a.desc.localeCompare(b.desc, 'id') || a.code.localeCompare(b.code));
    return out;
  }
  const sumQty = (list) => list.reduce((a, x) => a + x.qty, 0);

  function filtered(list) {
    if (S.scan && S.scan.found) {
      const codes = new Set(S.scan.codes.map((c) => String(c).trim().toUpperCase()));
      list = list.filter((x) => codes.has(String(x.code).trim().toUpperCase()));
    }
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
    scReset();
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
      <div id="spScan"></div>
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
    const hit = S.scan && S.scan.serial ? String(S.scan.serial).toUpperCase() : '';
    const rows = x.units
      .map((u) => {
        const badge = u.status && u.status !== 'Available' ? ` <span class="badge-mini">${esc(u.status)}</span>` : '';
        const isHit = hit && String(u.serial).toUpperCase() === hit;
        return `<div class="sp-unit${isHit ? ' hit' : ''}"><span>${esc(u.serial)}${badge}</span><span>${esc(u.admissionDate || '')}</span></div>`;
      })
      .join('');
    const rest = x.noSn > 0 ? `<div class="sp-unit muted"><span>SN tidak ada di data</span><span>${x.noSn} pcs</span></div>` : '';
    return `<div class="sp-units">${rows}${rest}</div>`;
  }

  // Banner hasil scan (di atas daftar)
  function scanBanner() {
    const sc = S.scan;
    if (!sc) return '';
    const clear = '<button type="button" class="sp-btn" data-act="clearscan">Hapus</button>';
    if (!sc.found) return `<div class="sp-scan bad"><span>${sc.msg}</span>${clear}</div>`;
    return `<div class="sp-scan ok"><span>${sc.msg}</span>${clear}</div>`;
  }

  function updateList() {
    const el = $('spList');
    if (!el) return;
    const all = collect(S.wh);
    const list = filtered(all);
    $('spMeta').innerHTML = metaLine();
    $('spScan').innerHTML = scanBanner();
    $('spSum').textContent = S.q.trim() || (S.scan && S.scan.found)
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
        const scanned = !!(S.scan && S.scan.found && S.scan.serial && x.units.some((u) => String(u.serial).toUpperCase() === String(S.scan.serial).toUpperCase()));
        const isOpen = hasSn && (S.open.has(key) || scanned || (q && x.units.some((u) => u.serial.toLowerCase().includes(q))));
        // Status SN: lengkap (semua ber-SN) / sebagian / tidak ada di data Serial Number
        const snState = !hasSn ? 'no' : x.noSn ? 'part' : 'ok';
        const snText = !hasSn ? 'SN tidak ada di data' : x.noSn ? `${x.units.length} ber-SN · ${x.noSn} tanpa SN` : `${x.units.length} ber-SN`;
        const inner = `<span class="sp-main"><span class="sp-name">${esc(x.desc)}</span><span class="sp-code">${esc(x.code)}</span><span class="sp-sub"><span class="sp-flag ${snState}">${esc(snText)}</span>${hasSn ? (isOpen ? ' · sembunyikan' : ' · lihat SN') : ''}</span></span><span class="sp-qty">${x.qty}<small>pcs</small></span>`;
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
    if (scBurstActive()) return; // scanner sedang mengetik: jangan cari huruf demi huruf
    S.q = e.target.value;
    S.scan = null; // ketikan manual = pencarian biasa
    updateList();
  });
  body.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-wh]');
    if (chip) {
      S.wh = chip.dataset.wh;
      S.scan = null;
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
    if (act && act.dataset.act === 'clearscan') {
      S.scan = null;
      updateList();
    } else if (act && act.dataset.act === 'copy') doCopy(act);
    else if (act && act.dataset.act === 'xlsx') doXlsx(act);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('show')) close();
  });

  // ===== Scanner (logika sama dengan scanner.js di halaman utama) =====
  // Scanner fisik = keyboard yang mengetik sangat cepat lalu Enter. Ketikan cepat dikenali sebagai scan;
  // hasil langsung tampil dan kolom cari tetap kosong, jadi scan berikutnya langsung jalan.
  // Urutan pencocokan (resolveScan): serial number -> barcode -> kode barang persis.
  // Konstanta SCAN_* dan resolveScan() berasal dari scanner.js.
  const SC = { buf: '', last: 0, maxGap: 0, viaBody: false, timer: null };
  const isOpenNow = () => overlay.classList.contains('show');

  function scReset() {
    SC.buf = '';
    SC.maxGap = 0;
    SC.viaBody = false;
    clearTimeout(SC.timer);
    SC.timer = null;
  }
  function scIsFast(minLen) {
    return SC.buf.length >= minLen && SC.maxGap <= SCAN_MAX_GAP;
  }
  function scBurstActive() {
    return SC.buf.length >= 3 && SC.maxGap <= SCAN_MAX_GAP && Date.now() - SC.last < 250;
  }

  // Cari barang hasil scan di gudang khusus. Hasil: { found, msg, codes, serial, wh }
  function resolveSpecialScan(raw) {
    const q = cleanQuery(raw);
    const safe = esc(q);
    const r = resolveScan(q);
    if (!r) return { found: false, msg: `<b>${safe}</b> tidak ada di data hari ini.` };
    const codes = r.codes.map((c) => String(c).trim().toUpperCase());
    const inWh = (w) => collect(w).some((x) => codes.includes(String(x.code).trim().toUpperCase()));
    let wh = null;
    if (r.serial) {
      const hit = (catalog.serialIndex || {})[r.serial];
      const w = hit ? String(hit.whcode || '').trim().toUpperCase() : '';
      if (WH.includes(w)) wh = w;
      else if (hit) {
        return {
          found: false,
          msg: `SN <b>${esc(r.serial)}</b> ada di <b>${esc(hit.whcode || '?')}</b>, bukan gudang khusus.`,
        };
      }
    }
    if (!wh) wh = inWh(S.wh) ? S.wh : WH.find(inWh) || null;
    if (!wh) {
      const it = (catalog.items || []).find((x) => codes.includes(String(x.code).trim().toUpperCase()));
      return { found: false, msg: `<b>${esc(it ? it.desc : q)}</b> tidak ada di gudang khusus.` };
    }
    const item = (catalog.items || []).find((x) => codes.includes(String(x.code).trim().toUpperCase()));
    const what = r.serial
      ? `SN <b>${esc(r.serial)}</b> · ${esc(label(wh))}`
      : `<b>${esc(item ? item.desc : q)}</b> · ${esc(label(wh))}`;
    return { found: true, msg: what, codes: r.codes, serial: r.serial, wh };
  }

  function doScan(raw) {
    const q = cleanQuery(raw);
    if (!q) return;
    if (!catalog) {
      S.scan = { found: false, msg: 'Belum ada data stok.' };
    } else {
      const res = resolveSpecialScan(q);
      S.scan = res;
      if (res.found) {
        S.wh = res.wh;
        if (res.serial && res.codes[0]) S.open.add(S.wh + '::' + res.codes[0]);
      }
    }
    S.q = '';
    render();
    try {
      if (navigator.vibrate) navigator.vibrate(S.scan.found ? 25 : [70, 40, 70]);
    } catch (e) {}
    const hit = body.querySelector('.sp-unit.hit') || body.querySelector('.sp-item');
    if (hit && hit.scrollIntoView) hit.scrollIntoView({ block: 'nearest' });
    const inp = $('spQ');
    if (inp && document.activeElement !== inp) inp.focus({ preventScroll: true });
  }

  function scIdle() {
    SC.timer = null;
    const buf = SC.buf,
      viaBody = SC.viaBody,
      fast = scIsFast(SCAN_IDLE_MIN_LEN);
    SC.buf = '';
    SC.maxGap = 0;
    SC.viaBody = false;
    if (!buf) return;
    if (fast) {
      doScan(buf); // scanner tanpa Enter
      return;
    }
    if (viaBody) {
      // ketikan manual saat fokus bukan di kolom cari -> arahkan ke kolom cari
      const inp = $('spQ');
      if (!inp) return;
      inp.focus({ preventScroll: true });
      inp.value = buf;
      inp.setSelectionRange(buf.length, buf.length);
      S.q = buf;
      S.scan = null;
      updateList();
    }
  }

  document.addEventListener('keydown', (e) => {
    if (!isOpenNow()) return;
    if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    const inQ = !!(t && t.id === 'spQ');
    const otherField = !inQ && t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (otherField) {
      scReset();
      return;
    }
    const key = e.key;
    if (key === 'Enter' || key === 'Tab') {
      if (scIsFast(SCAN_MIN_LEN)) {
        e.preventDefault();
        const code = SC.buf;
        scReset();
        doScan(code);
        return;
      }
      scReset();
      if (key === 'Enter' && inQ) {
        // Enter manual di kolom cari: kalau persis barcode / SN / kode barang, perlakukan sebagai scan
        const v = t.value.trim();
        if (v && catalog && resolveScan(v)) {
          e.preventDefault();
          doScan(v);
        }
      }
      return;
    }
    if (key.length !== 1) return; // Shift, Backspace, panah, Escape, dll tidak mengganggu
    // Spasi pada tombol yang sedang fokus tetap dipakai untuk menekan tombol itu
    if (key === ' ' && !SC.buf && !inQ && t && t !== document.body && t.tagName !== 'HTML') return;
    const now = Date.now();
    if (SC.buf && now - SC.last > 400) scReset();
    if (SC.buf) SC.maxGap = Math.max(SC.maxGap, now - SC.last);
    SC.buf += key;
    SC.last = now;
    if (!inQ) {
      e.preventDefault();
      SC.viaBody = true;
    }
    clearTimeout(SC.timer);
    SC.timer = setTimeout(scIdle, SCAN_IDLE_MS);
  });

  $('spOpenBtn').addEventListener('click', open);
  $('spCloseBtn').addEventListener('click', close);

  // dipanggil setelah data stok dihitung ulang (upload / sinkron / hapus)
  window.specialRefresh = function () {
    if (overlay.classList.contains('show')) render();
  };
})();
