// Nota Digital — tampilan & interaksi (butuh nota-core.js)
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = escapeHtml;
  const overlay = $('notaOverlay'),
    body = $('notaBody'),
    foot = $('notaFoot'),
    tabsEl = $('notaTabs'),
    toastEl = $('notaToast');
  const S = {
    tab: 'edit',
    cur: null,
    dirty: false,
    f: { range: '7', status: 'aktif', q: '', date: '' },
    list: [],
    listBusy: false,
    listMsg: '',
    timer: null,
    suggestTimer: null,
    manualName: false,
  };
  const role = () => (staffMode ? 'staff' : 'fl');
  const prefs = () => notaLsGet(NOTA_CONFIG.prefsKey) || {};
  const setPrefs = (o) => notaLsSet(NOTA_CONFIG.prefsKey, Object.assign(prefs(), o));
  const fmtNum = (v) => (v === null || v === undefined || v === '' ? '' : Math.round(Number(v)).toLocaleString('id-ID'));
  const rp = (v) => fmtRupiah(v);
  const fmtDT = (iso) => {
    const d = new Date(iso);
    return `${notaPad2(d.getDate())}/${notaPad2(d.getMonth() + 1)}/${d.getFullYear()} ${notaPad2(d.getHours())}:${notaPad2(d.getMinutes())}`;
  };

  // ---------- toast ----------
  let toastT = null;
  function toast(text, type) {
    toastEl.textContent = text;
    toastEl.className = 'show ' + (type || 'ok');
    clearTimeout(toastT);
    toastT = setTimeout(() => (toastEl.className = ''), type === 'bad' ? 7000 : 3500);
  }

  // ---------- katalog ----------
  function catItem(code) {
    if (!code || !catalog) return null;
    return scanIndex().byCode.get(String(code).trim().toUpperCase()) || null;
  }
  function stockInfo(it) {
    if (!it.code) return { cls: 'neutral', text: 'Barang manual' };
    const ci = catItem(it.code);
    if (!ci) return { cls: 'neutral', text: 'Tidak ada di katalog saat ini' };
    const av = Number(ci.available) || 0;
    if (av >= it.qty && av > 0) return { cls: 'ready', text: `Ready · stok ${av}` };
    if (av > 0) return { cls: 'indent', text: `Stok kurang · hanya ${av}` };
    const oth = ci.others ? Object.keys(ci.others).length : 0;
    if (oth) return { cls: 'indent', text: `INDENT · ada di ${oth} cabang lain` };
    return { cls: 'out', text: 'Stok kosong' };
  }
  function searchCatalog(q) {
    if (!catalog) return [];
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const out = [];
    for (const it of catalog.items) {
      const hay = getItemSearchHay(it);
      if (words.every((w) => hay.includes(w))) {
        out.push(it);
        if (out.length >= 8) break;
      }
    }
    return out;
  }
  function pickItem(i, item, serial) {
    const it = S.cur.items[i];
    const eff = getEffectivePrice(item);
    it.code = item.code;
    it.desc = item.desc;
    it.pickedDesc = item.desc;
    it.manual = false;
    it.listPrice = eff.price > 0 ? Number(eff.price) : null;
    it.priceSource = eff.source;
    it.price = it.listPrice;
    it.priceType = 'normal';
    if (serial) it.serial = serial;
    if (!it.qty) it.qty = 1;
    touch();
    renderEditor();
    const q = body.querySelector(`.nl[data-i="${i}"] .${it.price === null ? 'nl-price' : 'nl-qty'}`);
    if (q) q.focus();
  }

  // ---------- state ----------
  let persistT = null;
  function touch() {
    S.dirty = true;
    clearTimeout(persistT);
    persistT = setTimeout(() => {
      if (S.cur && S.cur.status === 'draft') notaLsSet(NOTA_CONFIG.draftKey, S.cur);
    }, 400);
  }
  function resetNota() {
    notaLsDel(NOTA_CONFIG.draftKey);
    S.cur = notaNew(prefs());
    S.dirty = false;
    S.manualName = false;
  }
  function confirmDiscard() {
    if (!S.dirty || !S.cur) return true;
    return confirm('Ada perubahan yang belum disimpan di nota yang sedang dibuka. Lanjut dan buang perubahan itu?');
  }
  function openNotaObj(n) {
    if (!confirmDiscard()) return;
    S.cur = JSON.parse(JSON.stringify(n));
    S.dirty = false;
    S.manualName = false;
    switchTab('edit');
  }

  // ---------- buka / tutup ----------
  function openOverlay() {
    overlay.classList.add('show');
    document.documentElement.classList.add('nota-open');
    if (!S.cur) {
      const d = notaLsGet(NOTA_CONFIG.draftKey);
      S.cur = d && d.items ? d : notaNew(prefs());
      S.dirty = !!(d && d.items);
    }
    switchTab(S.tab === 'semua' && !staffMode ? 'edit' : S.tab);
  }
  function closeOverlay() {
    overlay.classList.remove('show');
    document.documentElement.classList.remove('nota-open');
    clearInterval(S.timer);
    S.timer = null;
  }
  function switchTab(t) {
    S.tab = t;
    clearInterval(S.timer);
    S.timer = null;
    renderTabs();
    if (t === 'edit') renderEditor();
    else if (t === 'saya') loadMine();
    else {
      loadAll();
      S.timer = setInterval(() => {
        if (overlay.classList.contains('show') && S.tab === 'semua' && !document.hidden) loadAll(true);
      }, 30000);
    }
  }
  function renderTabs() {
    const tabs = [
      ['edit', 'Buat / Edit'],
      ['saya', 'Nota Saya'],
    ];
    if (staffMode) tabs.push(['semua', 'Semua Nota (Staf)']);
    tabsEl.innerHTML = tabs
      .map(([id, l]) => `<button type="button" class="nota-tab${S.tab === id ? ' active' : ''}" data-act="tab" data-tab="${id}">${l}</button>`)
      .join('');
  }

  // ---------- editor ----------
  function lineHtml(it, i, dis) {
    const si = stockInfo(it);
    const ci = catItem(it.code);
    const showSerial = !it.code || it.serial || (ci && ci.ownUnits && ci.ownUnits.length);
    const types = NOTA_PRICE_TYPES.map((t) => `<option value="${t.id}"${it.priceType === t.id ? ' selected' : ''}>${t.label}</option>`).join('');
    return `<div class="nl" data-i="${i}">
      <div class="nl-top"><span class="nl-no">${i + 1}</span>
        <div class="nl-prodwrap"><input class="nl-prod" type="text" value="${esc(it.desc)}" placeholder="Ketik nama / kode barang, atau scan barcode" autocomplete="off" autocapitalize="off" spellcheck="false" ${dis}><div class="nl-suggest" hidden></div></div>
        ${dis ? '' : `<button type="button" class="nl-del" data-act="delLine" aria-label="Hapus barang">&times;</button>`}
      </div>
      <div class="nl-tags"><span class="tag ${si.cls}">${esc(si.text)}</span>${it.code ? `<span class="tag neutral">${esc(it.code)}</span>` : ''}${it.priceSource === 'reborn' ? '<span class="tag neutral">Harga Reborn</span>' : ''}</div>
      <div class="nl-grid">
        <label><span>Jumlah</span><div class="qty"><button type="button" data-act="qtyDec" ${dis}>−</button><input class="nl-qty" inputmode="numeric" value="${esc(it.qty)}" ${dis}><button type="button" data-act="qtyInc" ${dis}>+</button></div></label>
        <label><span>Harga satuan (Rp)</span><input class="nl-price" inputmode="numeric" value="${fmtNum(it.price)}" placeholder="${it.listPrice === null && it.code ? 'harga belum ada — isi manual' : '0'}" ${dis}></label>
        <label><span>Jenis harga</span><select class="nl-type" ${dis}>${types}</select></label>
      </div>
      <div class="nl-extra">
        ${showSerial ? `<input class="nl-serial" type="text" value="${esc(it.serial)}" placeholder="No. seri / IMEI (bila ada)" autocomplete="off" ${dis}>` : ''}
        <input class="nl-note" type="text" value="${esc(it.note)}" placeholder="Catatan harga (mis. promo bundling, cashback Rp100.000)" ${dis}>
      </div>
      <div class="nl-foot"><span class="nl-chg"></span><span class="nl-sub"></span></div>
    </div>`;
  }
  function payHtml(p, i, dis) {
    const m = NOTA_PAY_METHODS.map((x) => `<option${p.method === x ? ' selected' : ''}>${x}</option>`).join('');
    return `<div class="pay" data-i="${i}">
      <select class="pay-method" ${dis}>${m}</select>
      <input class="pay-amount" inputmode="numeric" value="${fmtNum(p.amount)}" placeholder="Jumlah (Rp)" ${dis}>
      ${dis ? '' : `<button type="button" class="mini" data-act="fillPay" title="Isi dengan sisa tagihan">Sisa</button><button type="button" class="nl-del" data-act="delPay" aria-label="Hapus">&times;</button>`}
      <input class="pay-ref" type="text" value="${esc(p.ref || '')}" placeholder="Ref / keterangan (opsional)" ${dis}>
    </div>`;
  }
  function staffPanelHtml(n) {
    const st = n.status;
    const nm = esc(prefs().staffName || '');
    let ctl = '';
    if (st === 'diajukan')
      ctl = `<div class="btn-row"><button type="button" class="b-solid" data-act="validate">Validasi nota</button><button type="button" class="b-ghost" data-act="return">Kembalikan ke FL</button></div>`;
    else if (st === 'divalidasi')
      ctl = `<label class="lbl">No. Delivery (dari Web Resmi)<input id="nDelivery" type="text" placeholder="mis. DLV/2610/0042" autocomplete="off"></label>
        <div class="btn-row"><button type="button" class="b-solid" data-act="deliver">Simpan No. Delivery &amp; kunci nota</button><button type="button" class="b-ghost" data-act="return">Kembalikan ke FL</button></div>`;
    else if (st === 'selesai')
      ctl = `<div class="locked">🔒 Terkunci · No. Delivery <b>${esc(n.delivery && n.delivery.no)}</b> · oleh ${esc(n.delivery && n.delivery.by)} (${fmtDT(n.delivery && n.delivery.at)})</div>
        <div class="btn-row"><button type="button" class="b-ghost" data-act="reopen">Buka kunci (koreksi)</button></div>`;
    else if (st === 'batal')
      ctl = `<div class="locked">Dibatalkan: ${esc(n.cancel && n.cancel.reason)} (${esc(n.cancel && n.cancel.by)})</div>`;
    else ctl = `<div class="hint">Nota masih draft di frontliner. Staf baru bisa memvalidasi setelah diajukan.</div>`;
    const canCancel = ['draft', 'diajukan', 'divalidasi'].includes(st);
    const hist = (n.history || [])
      .map((h) => `<li><b>${esc(h.act)}</b> · ${esc(h.by)} · ${fmtDT(h.at)}${h.note ? `<br><i>${esc(h.note)}</i>` : ''}</li>`)
      .join('');
    return `<div class="nota-sec staff-panel"><h3>Validasi Kasir / Gudang</h3>
      <label class="lbl">Nama staf<input id="nStaffName" type="text" value="${nm}" placeholder="Nama Anda" autocomplete="off"></label>
      <label class="lbl">Catatan staf <small>(wajib untuk kembalikan / batalkan / buka kunci)</small><textarea id="nStaffNote" rows="2" placeholder="mis. Harga HP salah, mohon cek promo"></textarea></label>
      ${ctl}
      <div class="btn-row"><button type="button" class="b-ghost" data-act="copyEntry">Salin untuk input Web Resmi</button>${canCancel ? '<button type="button" class="b-danger" data-act="cancelStaff">Batalkan nota</button>' : ''}</div>
      ${hist ? `<details class="hist"><summary>Riwayat (${n.history.length})</summary><ul>${hist}</ul></details>` : ''}
    </div>`;
  }
  function renderEditor() {
    const n = S.cur,
      r = role(),
      editable = notaCanEdit(n, r),
      dis = editable ? '' : 'disabled';
    const keepScroll = body.scrollTop;
    const names = NOTA_SALES_NAMES.slice();
    const manualOn = NOTA_ALLOW_MANUAL_NAME && ((n.fl.name && !names.includes(n.fl.name)) || S.manualName);
    if (n.fl.name && !names.includes(n.fl.name) && !NOTA_ALLOW_MANUAL_NAME) names.push(n.fl.name); // nota lama: nama tetap tampil
    const nameSel = `<select class="fl-sel" ${dis}><option value="">— pilih nama sales —</option>${names
      .map((x) => `<option value="${esc(x)}"${!manualOn && n.fl.name === x ? ' selected' : ''}>${esc(x)}</option>`)
      .join('')}${NOTA_ALLOW_MANUAL_NAME ? `<option value="__manual"${manualOn ? ' selected' : ''}>Lainnya (ketik manual)…</option>` : ''}</select>`;
    const nameManual = manualOn ? `<input type="text" data-f="fl.name" value="${esc(n.fl.name)}" placeholder="Ketik nama sales" autocomplete="off" ${dis}>` : '';
    const banner =
      `<div class="nota-status st-${n.status}"><b>${esc(NOTA_STATUS[n.status])}</b> · ${esc(n.id)}${n.rev ? '' : ' · belum tersimpan di server'}${notaIsPending(n.id) ? ' · <u>perubahan belum terkirim</u>' : ''}</div>` +
      (n.status === 'draft' && n.returnNote ? `<div class="nota-return">↩ Dikembalikan staf: ${esc(n.returnNote)}</div>` : '') +
      (!editable && r === 'fl' && n.status !== 'draft' ? `<div class="hint">Nota ini sudah diajukan dan tidak bisa diubah frontliner. Minta staf mengembalikannya bila perlu diperbaiki.</div>` : '');
    const catWarn = catalog ? '' : `<div class="hint warn">Data katalog belum dimuat — barang hanya bisa diketik manual.</div>`;
    body.innerHTML = `<div class="nota-wrap">${banner}
      <div class="nota-sec"><h3>Sales</h3>
        <label class="lbl">Nama sales${nameSel}${nameManual}</label></div>
      <div class="nota-sec"><h3>Pelanggan</h3>
        <div class="grid2">
          <label class="lbl">Nama pelanggan<input type="text" data-f="customer.name" value="${esc(n.customer.name)}" autocomplete="off" ${dis}></label>
          <label class="lbl">No. HP<input type="tel" inputmode="tel" data-f="customer.phone" value="${esc(n.customer.phone)}" placeholder="0812 3456 7890" autocomplete="off" ${dis}></label>
        </div></div>
      <div class="nota-sec"><h3>Barang</h3>${catWarn}
        <div id="nLines">${n.items.map((it, i) => lineHtml(it, i, dis)).join('')}</div>
        ${editable ? '<button type="button" class="b-ghost wide" data-act="addLine">+ Tambah barang</button>' : ''}</div>
      <div class="nota-sec"><h3>Pembayaran</h3>
        <div id="nPays">${n.payments.map((p, i) => payHtml(p, i, dis)).join('') || '<div class="hint">Belum ada pembayaran dicatat.</div>'}</div>
        ${editable ? '<button type="button" class="b-ghost wide" data-act="addPay">+ Metode pembayaran</button>' : ''}</div>
      <div class="nota-sec"><h3>Catatan nota</h3><textarea data-f="note" rows="2" placeholder="Catatan tambahan (opsional)" ${dis}>${esc(n.note)}</textarea></div>
      <div id="nWarn"></div>
      ${r === 'staff' && n.rev > 0 ? staffPanelHtml(n) : ''}
    </div>`;
    renderFoot(editable);
    refreshAll();
    body.scrollTop = keepScroll;
  }
  function renderFoot(editable) {
    const n = S.cur,
      r = role();
    const canShare = typeof navigator !== 'undefined' && !!navigator.canShare;
    let btns = '';
    if (editable) {
      if (r === 'staff' && n.status !== 'draft')
        btns += `<button type="button" class="b-solid" data-act="saveEdit">Simpan perubahan</button>`;
      else {
        btns += `<button type="button" class="b-ghost" data-act="saveDraft">Simpan draft</button>`;
        btns += `<button type="button" class="b-solid" data-act="submit">Ajukan ke kasir</button>`;
      }
    }
    btns += `<button type="button" class="b-ghost" data-act="download">Unduh nota</button>`;
    if (canShare) btns += `<button type="button" class="b-ghost" data-act="share">Bagikan</button>`;
    btns += `<button type="button" class="b-ghost" data-act="newNota">Nota baru</button>`;
    if (editable && r === 'fl' && n.status === 'draft' && n.rev > 0) btns += `<button type="button" class="b-danger" data-act="cancelFl">Batalkan</button>`;
    foot.innerHTML = `<div class="foot-total"><div><small>TOTAL</small><div id="nTotal" class="big">Rp0</div></div><div class="foot-pay"><span id="nPayState"></span><small id="nPaid"></small></div></div><div class="foot-btns">${btns}</div>`;
    foot.hidden = false;
  }

  // ---------- hitung ulang bagian yang berubah (tanpa render ulang input) ----------
  function refreshLine(i) {
    const el = body.querySelector(`.nl[data-i="${i}"]`);
    if (!el) return;
    const it = S.cur.items[i];
    const si = stockInfo(it);
    const tag = el.querySelector('.nl-tags .tag');
    if (tag) {
      tag.className = 'tag ' + si.cls;
      tag.textContent = si.text;
    }
    el.querySelector('.nl-sub').textContent = rp(notaLineSubtotal(it));
    const chg = el.querySelector('.nl-chg');
    if (notaPriceChanged(it)) {
      const d = Number(it.price) - Number(it.listPrice);
      chg.textContent = `Harga diubah (price list ${rp(it.listPrice)}, ${d < 0 ? 'turun ' + rp(-d) : 'naik ' + rp(d)})`;
      chg.className = 'nl-chg changed';
    } else {
      chg.textContent = '';
      chg.className = 'nl-chg';
    }
  }
  function refreshTotals() {
    const t = notaTotals(S.cur);
    const set = (id, v) => {
      const e = $(id);
      if (e) e.textContent = v;
    };
    set('nTotal', rp(t.total));
    set('nPayState', NOTA_PAY_LABEL[t.state]);
    const ps = $('nPayState');
    if (ps) ps.className = 'pstate ' + t.state;
    set('nPaid', t.state === 'kosong' ? '' : `Dibayar ${rp(t.paid)}` + (t.diff < 0 ? ` · kurang ${rp(-t.diff)}` : t.diff > 0 ? ` · kembalian ${rp(t.diff)}` : ''));
    const w = $('nWarn');
    if (w) {
      const v = notaValidate(S.cur);
      const stock = [];
      S.cur.items.forEach((it, i) => {
        const si = stockInfo(it);
        if (it.code && (si.cls === 'indent' || si.cls === 'out')) stock.push(`Barang ${i + 1}: ${si.text}.`);
      });
      const all = v.warnings.concat(stock);
      w.innerHTML = all.length ? `<div class="nota-warn"><b>Perhatian</b><ul>${all.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
    }
  }
  function refreshAll() {
    S.cur.items.forEach((_, i) => refreshLine(i));
    refreshTotals();
  }

  // ---------- simpan / aksi ----------
  let busy = false;
  async function save(candidate, okMsg) {
    if (busy) return false;
    busy = true;
    const prevRev = Number(candidate.rev) || 0;
    const btns = foot.querySelectorAll('button');
    btns.forEach((b) => (b.disabled = true));
    try {
      const res = await notaSaveCloud(candidate);
      if (res.ok) {
        S.cur = res.nota;
        S.dirty = false;
        if (S.cur.status !== 'draft') notaLsDel(NOTA_CONFIG.draftKey);
        else notaLsSet(NOTA_CONFIG.draftKey, S.cur);
        toast(okMsg || 'Tersimpan.', 'ok');
        return true;
      }
      if (res.conflict) {
        S.cur = Object.assign({}, candidate, { rev: prevRev });
        toast(res.message, 'bad');
        showConflict();
        return false;
      }
      S.cur = Object.assign({}, res.nota, { rev: prevRev });
      toast(`${res.message} — Nota aman tersimpan di perangkat ini. Coba lagi saat sinyal baik.`, 'bad');
      return false;
    } finally {
      busy = false;
      if (S.tab === 'edit') renderEditor();
    }
  }
  function showConflict() {
    const w = $('nWarn');
    if (!w) return;
    w.innerHTML = `<div class="nota-warn bad"><b>Konflik versi.</b> Nota ini diubah di perangkat lain.<div class="btn-row"><button type="button" class="b-solid" data-act="reload">Muat versi terbaru (buang perubahan saya)</button></div></div>`;
  }
  async function doAction(act, ctx, okMsg) {
    const staff = role() === 'staff';
    const by = staff ? (prefs().staffName || '').trim() : S.cur.fl.name;
    const res = notaApply(S.cur, act, Object.assign({ role: role(), by }, ctx || {}));
    if (!res.ok) {
      toast(res.error, 'bad');
      return false;
    }
    return save(res.nota, okMsg);
  }
  function readStaffFields() {
    const nm = $('nStaffName');
    if (nm) setPrefs({ staffName: nm.value.trim() });
    const nt = $('nStaffNote');
    const dl = $('nDelivery');
    return { note: nt ? nt.value : '', deliveryNo: dl ? dl.value : '' };
  }

  // ---------- gambar nota ----------
  function renderNotaCanvas(n) {
    // Tampilan mengikuti nota hasil input SAP (kolom Perincian / Qty / Price / Total, angka gaya 149,000).
    const SC = 2,
      W = 620,
      P = 26,
      FONT = '-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
    const meas = document.createElement('canvas').getContext('2d');
    const wrap = (text, font, maxW) => {
      meas.font = font;
      const lines = [];
      let cur = '';
      String(text || '')
        .split(/\s+/)
        .filter(Boolean)
        .forEach((w) => {
          const t = cur ? cur + ' ' + w : w;
          if (meas.measureText(t).width <= maxW) cur = t;
          else {
            if (cur) lines.push(cur);
            while (meas.measureText(w).width > maxW && w.length > 1) {
              let k = w.length;
              while (k > 1 && meas.measureText(w.slice(0, k)).width > maxW) k--;
              lines.push(w.slice(0, k));
              w = w.slice(k);
            }
            cur = w;
          }
        });
      if (cur || !lines.length) lines.push(cur);
      return lines;
    };
    const ops = [];
    const text = (t, x, yy, font, color, align) => ops.push({ t, x, y: yy, font, color: color || '#111', align: align || 'left' });
    const hr = (yy) => ops.push({ hr: true, y: yy });
    const num = (v) => Math.round(Number(v) || 0).toLocaleString('en-US');
    const t = notaTotals(n);
    const d = new Date(n.createdAt);
    const dateStr = `${notaPad2(d.getDate())}/${notaPad2(d.getMonth() + 1)}/${d.getFullYear()}`;
    const timeStr = `${notaPad2(d.getHours())}:${notaPad2(d.getMinutes())}`;
    const RX = 340; // kolom kanan header
    const TX = W - P, PX = TX - 120, QX = PX - 112; // kanan kolom Total / Price / Qty

    // ----- header kiri: toko & perusahaan
    let yl = P + 18;
    const storeName = String(NOTA_STORE.name || '').toUpperCase();
    let fs = 20;
    meas.font = `bold ${fs}px ${FONT}`;
    while (fs > 13 && meas.measureText(storeName).width > RX - P - 12) meas.font = `bold ${--fs}px ${FONT}`; // perkecil sampai muat
    text(storeName, P, yl, `bold ${fs}px ${FONT}`);
    yl += 20;
    [NOTA_STORE.company, NOTA_STORE.address, NOTA_STORE.npwp].filter(Boolean).forEach((l) =>
      wrap(l, `11.5px ${FONT}`, RX - P - 12).forEach((ln) => {
        text(ln, P, yl, `11.5px ${FONT}`, '#333');
        yl += 15;
      }),
    );
    yl += 6;
    text(n.id, P, yl, `bold 14px ${FONT}`);
    yl += 8;
    // ----- header kanan: pembayaran, pelanggan, tanggal
    let yr = P + 16;
    n.payments
      .filter((p) => Number(p.amount) > 0)
      .forEach((p) =>
        wrap(`${p.method}${p.ref ? ' ' + p.ref : ''}`, `bold 14px ${FONT}`, W - P - RX).forEach((ln) => {
          text(ln, RX, yr, `bold 14px ${FONT}`);
          yr += 19;
        }),
      );
    const rkv = (k, v) => {
      if (!v) return;
      text(k + ' :', RX, yr, `13px ${FONT}`, '#333');
      wrap(v, `13px ${FONT}`, W - P - RX - 86).forEach((ln) => {
        text(ln, RX + 86, yr, `13px ${FONT}`);
        yr += 18;
      });
    };
    rkv('Pelanggan', n.customer.name);
    rkv('Telp', n.customer.phone ? notaNormPhone(n.customer.phone).display : '');
    rkv('Tgl', `${dateStr}  ${timeStr}`);
    let y = Math.max(yl, yr) + 10;
    if (n.status === 'batal') {
      ops.push({ box: true, y: y - 4, h: 30, color: '#b91c1c' });
      text('NOTA DIBATALKAN', W / 2, y + 16, `bold 15px ${FONT}`, '#b91c1c', 'center');
      y += 40;
    }
    // ----- tabel
    hr(y);
    y += 20;
    text('Perincian', P + 22, y, `13px ${FONT}`, '#444');
    text('Qty', QX, y, `13px ${FONT}`, '#444', 'right');
    text('Price', PX, y, `13px ${FONT}`, '#444', 'right');
    text('Total', TX, y, `13px ${FONT}`, '#444', 'right');
    y += 10;
    hr(y);
    y += 22;
    const descW = QX - 46 - (P + 22);
    let qtySum = 0;
    n.items.forEach((it, i) => {
      qtySum += Number(it.qty) || 0;
      const lines = wrap(it.desc, `14px ${FONT}`, descW);
      text(String(i + 1), P, y, `14px ${FONT}`);
      text(String(it.qty), QX, y, `14px ${FONT}`, '#111', 'right');
      text(num(it.price), PX, y, `14px ${FONT}`, '#111', 'right');
      text(num(notaLineSubtotal(it)), TX, y, `14px ${FONT}`, '#111', 'right');
      lines.forEach((ln, k) => {
        text(ln, P + 22, y, `14px ${FONT}`);
        if (k < lines.length - 1) y += 18;
      });
      y += 17;
      const tp = NOTA_PRICE_TYPES.find((x) => x.id === it.priceType);
      const tag = [tp && it.priceType !== 'normal' ? tp.label : '', it.note].filter(Boolean).join(' · ');
      if (tag)
        wrap(tag, `11.5px ${FONT}`, descW).forEach((ln) => {
          text(ln, P + 22, y, `11.5px ${FONT}`, '#666');
          y += 15;
        });
      if (it.serial) {
        text(`SN/IMEI: ${it.serial}`, P + 22, y, `11.5px ui-monospace,Consolas,monospace`, '#555');
        y += 15;
      }
      y += 8;
    });
    hr(y);
    y += 24;
    // ----- ringkasan
    const sales = wrap(n.fl.name, `600 13px ${FONT}`, RX - P - 52);
    text('Sales', P, y, `13px ${FONT}`, '#444');
    sales.forEach((ln, k) => text(ln, P + 52, y + k * 17, `600 13px ${FONT}`));
    text('Sub Total', RX, y, `13px ${FONT}`, '#444');
    text(num(t.total), TX, y, `13px ${FONT}`, '#111', 'right');
    const salesH = (sales.length - 1) * 17;
    y += 22 + salesH;
    text(`Total Qty  ${qtySum}.00`, P, y, `13px ${FONT}`, '#444');
    if (t.state === 'dp' || t.state === 'belum') {
      if (t.paid > 0) {
        text('Dibayar', RX, y, `13px ${FONT}`, '#444');
        text(num(t.paid), TX, y, `13px ${FONT}`, '#111', 'right');
        y += 20;
      }
      text('Sisa', RX, y, `bold 13px ${FONT}`, '#b91c1c');
      text(num(-t.diff), TX, y, `bold 13px ${FONT}`, '#b91c1c', 'right');
      y += 22;
    } else if (t.state === 'lebih') {
      text('Kembalian', RX, y, `13px ${FONT}`, '#444');
      text(num(t.diff), TX, y, `13px ${FONT}`, '#111', 'right');
      y += 22;
    } else y += 22;
    text('Total', RX, y, `bold 17px ${FONT}`);
    text(num(t.total), TX, y, `bold 17px ${FONT}`, '#111', 'right');
    y += 16;
    if (n.note) {
      wrap('Catatan: ' + n.note, `12px ${FONT}`, W - P * 2).forEach((ln) => {
        text(ln, P, y, `12px ${FONT}`, '#444');
        y += 16;
      });
    }
    // ----- penutup
    y += 14;
    wrap(NOTA_PRINT.checkNote, `13px ${FONT}`, W - P * 2 - 40).forEach((ln) => {
      text(ln, W / 2, y, `13px ${FONT}`, '#111', 'center');
      y += 18;
    });
    y += 12;
    const sg = NOTA_PRINT.signatures || [];
    sg.forEach((l, k) => text(l, P + ((W - P * 2) * (k + 0.5)) / sg.length, y, `13px ${FONT}`, '#111', 'center'));
    y += 64;
    if (NOTA_PRINT.taxNote) {
      text(NOTA_PRINT.taxNote, P, y, `italic 11.5px ${FONT}`, '#444');
      y += 8;
    }
    y += P - 6;
    const cv = document.createElement('canvas');
    cv.width = W * SC;
    cv.height = Math.ceil(y * SC);
    const c = cv.getContext('2d');
    c.scale(SC, SC);
    c.fillStyle = '#fff';
    c.fillRect(0, 0, W, y);
    ops.forEach((o) => {
      if (o.hr) {
        c.strokeStyle = '#555';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(P, o.y);
        c.lineTo(W - P, o.y);
        c.stroke();
      } else if (o.box) {
        c.strokeStyle = o.color;
        c.lineWidth = 1.5;
        c.strokeRect(P, o.y, W - P * 2, o.h);
        c.lineWidth = 1;
      } else {
        c.font = o.font;
        c.fillStyle = o.color;
        c.textAlign = o.align;
        c.fillText(o.t, o.x, o.y);
      }
    });
    return cv;
  }
  function canvasBlob(cv) {
    return new Promise((res) => cv.toBlob(res, 'image/png'));
  }
  function saveBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async function downloadNota(n, share) {
    const blob = await canvasBlob(renderNotaCanvas(n));
    const name = `${n.id}.png`;
    if (share) {
      const file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Nota ' + n.id });
          return;
        } catch (e) {
          if (e && e.name === 'AbortError') return;
        }
      }
      toast('Perangkat tidak mendukung berbagi langsung — nota diunduh.', 'ok');
    }
    saveBlob(blob, name);
  }

  // ---------- daftar ----------
  function badge(n) {
    return `<span class="st-badge st-${n.status}">${esc(NOTA_STATUS[n.status] || n.status)}</span>`;
  }
  function cardHtml(n, extra) {
    const t = notaTotals(n);
    const chg = n.items.filter(notaPriceChanged).length;
    const flags = [];
    if (chg) flags.push(`⚠ ${chg} harga diubah`);
    if (n.items.some((it) => it.manual)) flags.push('barang manual');
    if (t.state === 'dp' || t.state === 'belum') flags.push(NOTA_PAY_LABEL[t.state].toLowerCase());
    if (extra) flags.push(extra);
    return `<div class="ncard" data-id="${esc(n.id)}">
      <div class="ncard-top"><b>${esc(n.id)}</b>${badge(n)}</div>
      <div class="ncard-mid">${esc(n.customer.name || '(tanpa nama)')} · ${rp(t.total)}</div>
      <div class="ncard-sub">${esc(n.fl.name)} · ${fmtDT(n.createdAt)}${n.delivery ? ' · DLV ' + esc(n.delivery.no) : ''}</div>
      ${flags.length ? `<div class="ncard-flags">${flags.map(esc).join(' · ')}</div>` : ''}
      <div class="btn-row"><button type="button" class="b-ghost" data-act="openCard" data-id="${esc(n.id)}">Buka</button><button type="button" class="b-ghost" data-act="dlCard" data-id="${esc(n.id)}">Unduh nota</button></div>
    </div>`;
  }
  async function loadMine() {
    foot.hidden = true;
    body.innerHTML = '<div class="nota-wrap"><div class="hint">Memuat nota di perangkat ini…</div></div>';
    const mine = notaMineList();
    const res = await notaFetchByKeys(mine.map((x) => `nota:${x.date}:${x.id}`));
    const srv = new Map(res.list.map((n) => [n.id, n]));
    const list = [];
    mine.forEach((x) => {
      const m = notaMirrorGet(x.id);
      const s = srv.get(x.id);
      const n = notaIsPending(x.id) && m ? m : s || m;
      if (n) list.push({ n, pending: notaIsPending(x.id) });
    });
    list.sort((a, b) => (a.n.createdAt < b.n.createdAt ? 1 : -1));
    S.list = list.map((x) => x.n);
    if (S.tab !== 'saya') return;
    body.innerHTML = `<div class="nota-wrap">${res.ok ? '' : `<div class="hint warn">Server tidak terjangkau — menampilkan salinan di perangkat. (${esc(res.message)})</div>`}
      ${list.length ? list.map((x) => cardHtml(x.n, x.pending ? 'belum terkirim ke server' : '')).join('') : '<div class="hint">Belum ada nota dari perangkat ini. Buat di tab “Buat / Edit”.</div>'}</div>`;
  }
  function rangeDates() {
    const f = S.f;
    const today = new Date();
    if (f.range === 'date' && f.date) return [f.date, f.date];
    const days = parseInt(f.range, 10) || 7;
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1));
    return [notaLocalDate(from), notaLocalDate(today)];
  }
  function filtered() {
    const f = S.f;
    const q = f.q.trim().toLowerCase();
    const qd = q.replace(/\D/g, '');
    return S.list.filter((n) => {
      if (f.status === 'aktif' && !['diajukan', 'divalidasi'].includes(n.status)) return false;
      if (!['aktif', 'semua'].includes(f.status) && n.status !== f.status) return false;
      if (!q) return true;
      const hay = [n.id, n.customer.name, n.fl.name, (n.delivery && n.delivery.no) || '', ...n.items.map((i) => i.desc + ' ' + i.serial)]
        .join(' ')
        .toLowerCase();
      return hay.includes(q) || (qd.length >= 4 && n.customer.phone.replace(/\D/g, '').includes(qd));
    });
  }
  function renderAllList() {
    if (S.tab !== 'semua') return;
    const f = S.f;
    const chips = [['aktif', 'Antrean'], ['semua', 'Semua'], ['draft', 'Draft'], ['diajukan', 'Menunggu'], ['divalidasi', 'Divalidasi'], ['selesai', 'Selesai'], ['batal', 'Batal']]
      .map(([id, l]) => `<button type="button" class="chip${f.status === id ? ' on' : ''}" data-act="status" data-s="${id}">${l}</button>`).join('');
    const rg = [['1', 'Hari ini'], ['2', '2 hari'], ['7', '7 hari'], ['30', '30 hari'], ['date', 'Pilih tanggal']]
      .map(([id, l]) => `<option value="${id}"${f.range === id ? ' selected' : ''}>${l}</option>`).join('');
    const list = filtered();
    const active = document.activeElement;
    const keepQ = active && active.id === 'nQ';
    const html = `<div class="nota-wrap">
      <div class="filters"><select id="nRange">${rg}</select>${f.range === 'date' ? `<input type="date" id="nDate" value="${esc(f.date)}">` : ''}
        <input id="nQ" type="search" value="${esc(f.q)}" placeholder="Cari no. nota / pelanggan / HP / FL / barang…" autocomplete="off"></div>
      <div class="chips">${chips}</div>
      <div class="btn-row"><button type="button" class="b-ghost" data-act="refreshList">Segarkan</button><button type="button" class="b-ghost" data-act="csv"${list.length ? '' : ' disabled'}>Unduh rekap CSV (${list.length})</button></div>
      ${S.listMsg ? `<div class="hint warn">${esc(S.listMsg)}</div>` : ''}
      <div class="hint">${S.listBusy ? 'Memuat…' : `${list.length} nota ditampilkan dari ${S.list.length} di rentang ini.`}</div>
      ${list.map((n) => cardHtml(n)).join('')}</div>`;
    const pos = body.scrollTop;
    body.innerHTML = html;
    body.scrollTop = pos;
    if (keepQ) {
      const q = $('nQ');
      q.focus();
      q.setSelectionRange(q.value.length, q.value.length);
    }
  }
  async function loadAll(silent) {
    foot.hidden = true;
    if (!staffMode) return;
    S.listBusy = true;
    if (!silent) renderAllList();
    const [a, b] = rangeDates();
    const res = await notaFetchRange(a, b);
    S.listBusy = false;
    S.listMsg = res.ok ? (res.list.length >= 500 ? 'Menampilkan 500 nota terbaru — persempit rentang tanggal.' : '') : 'Gagal memuat: ' + res.message;
    if (res.ok) S.list = res.list;
    renderAllList();
  }

  // ---------- event ----------
  function setPath(o, path, v) {
    const k = path.split('.');
    let t = o;
    while (k.length > 1) t = t[k.shift()];
    t[k[0]] = v;
  }
  const lineIdx = (el) => {
    const l = el.closest('.nl');
    return l ? parseInt(l.dataset.i, 10) : -1;
  };
  const payIdx = (el) => {
    const l = el.closest('.pay');
    return l ? parseInt(l.dataset.i, 10) : -1;
  };
  function showSuggest(el) {
    const i = lineIdx(el);
    const box = el.parentElement.querySelector('.nl-suggest');
    const q = el.value.trim();
    const res = q.length >= 2 ? searchCatalog(q) : [];
    if (!res.length) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    box.innerHTML = res
      .map((it) => {
        const eff = getEffectivePrice(it);
        const av = Number(it.available) || 0;
        return `<div class="sg" data-code="${esc(it.code)}"><div class="sg-n">${esc(it.desc)}</div><div class="sg-m">${esc(it.code)} · ${eff.price > 0 ? rp(eff.price) : 'harga belum ada'} · ${av > 0 ? 'stok ' + av : 'indent/kosong'}</div></div>`;
      })
      .join('');
    box.hidden = false;
    box.dataset.i = i;
  }
  overlay.addEventListener('input', function (e) {
    const el = e.target;
    if (!S.cur || S.tab !== 'edit') {
      if (el.id === 'nQ') {
        S.f.q = el.value;
        renderAllList();
      }
      return;
    }
    const n = S.cur;
    if (el.dataset.f) {
      setPath(n, el.dataset.f, el.value);
      touch();
      if (el.dataset.f === 'fl.name') setPrefs({ flName: n.fl.name });
      return;
    }
    const li = lineIdx(el);
    if (li >= 0) {
      const it = n.items[li];
      if (el.classList.contains('nl-prod')) {
        it.desc = el.value;
        if (it.code && el.value !== it.pickedDesc) {
          it.code = '';
          it.listPrice = null;
          it.priceSource = null;
        }
        it.manual = !it.code;
        clearTimeout(S.suggestTimer);
        S.suggestTimer = setTimeout(() => showSuggest(el), 100);
      } else if (el.classList.contains('nl-qty')) it.qty = parseInt(el.value.replace(/\D/g, ''), 10) || 0;
      else if (el.classList.contains('nl-price')) it.price = notaParseMoney(el.value);
      else if (el.classList.contains('nl-note')) it.note = el.value;
      else if (el.classList.contains('nl-serial')) it.serial = el.value;
      touch();
      refreshLine(li);
      refreshTotals();
      return;
    }
    const pi = payIdx(el);
    if (pi >= 0) {
      const p = n.payments[pi];
      if (el.classList.contains('pay-amount')) p.amount = notaParseMoney(el.value) || 0;
      else if (el.classList.contains('pay-ref')) p.ref = el.value;
      touch();
      refreshTotals();
    }
  });
  overlay.addEventListener('change', function (e) {
    const el = e.target;
    if (el.id === 'nRange') {
      S.f.range = el.value;
      if (el.value === 'date' && !S.f.date) S.f.date = notaLocalDate();
      loadAll();
      return;
    }
    if (el.id === 'nDate') {
      S.f.date = el.value;
      loadAll();
      return;
    }
    if (!S.cur || S.tab !== 'edit') return;
    if (el.classList.contains('fl-sel')) {
      if (el.value === '__manual') {
        S.manualName = true;
        S.cur.fl.name = '';
      } else {
        S.manualName = false;
        S.cur.fl.name = el.value;
        setPrefs({ flName: el.value });
      }
      touch();
      renderEditor();
      if (S.manualName) {
        const m = body.querySelector('[data-f="fl.name"]');
        if (m) m.focus();
      }
      return;
    }
    const li = lineIdx(el);
    if (li >= 0 && el.classList.contains('nl-type')) {
      S.cur.items[li].priceType = el.value;
      touch();
      refreshTotals();
    }
    const pi = payIdx(el);
    if (pi >= 0 && el.classList.contains('pay-method')) {
      S.cur.payments[pi].method = el.value;
      touch();
    }
  });
  overlay.addEventListener('focusout', function (e) {
    const el = e.target;
    if (!S.cur || S.tab !== 'edit') return;
    if (el.classList.contains('nl-price')) {
      el.value = fmtNum(S.cur.items[lineIdx(el)].price);
    } else if (el.classList.contains('pay-amount')) {
      el.value = fmtNum(S.cur.payments[payIdx(el)].amount);
    } else if (el.dataset && el.dataset.f === 'customer.phone') {
      const p = notaNormPhone(el.value);
      if (p.ok) {
        S.cur.customer.phone = p.display;
        el.value = p.display;
      }
    } else if (el.classList.contains('nl-prod')) {
      const box = el.parentElement.querySelector('.nl-suggest');
      setTimeout(() => box && (box.hidden = true), 180);
    }
  });
  overlay.addEventListener('keydown', function (e) {
    const el = e.target;
    if (e.key === 'Escape') {
      const open = overlay.querySelector('.nl-suggest:not([hidden])');
      if (open) open.hidden = true;
      else closeOverlay();
      e.stopPropagation();
      return;
    }
    if (e.key === 'Enter' && el.classList.contains('nl-prod')) {
      e.preventDefault();
      const i = lineIdx(el);
      const raw = el.value.trim();
      const hit = raw && catalog ? resolveScan(raw) : null; // barcode / SN / kode persis
      if (hit && hit.codes && hit.codes.length) {
        const item = catItem(hit.codes[0]);
        if (item) return pickItem(i, item, hit.serial || '');
      }
      const first = el.parentElement.querySelector('.sg');
      if (first) {
        const item = catItem(first.dataset.code);
        if (item) pickItem(i, item);
      }
    }
  });
  overlay.addEventListener('mousedown', function (e) {
    const sg = e.target.closest('.sg');
    if (!sg) return;
    e.preventDefault();
    const i = parseInt(sg.parentElement.dataset.i, 10);
    const item = catItem(sg.dataset.code);
    if (item) pickItem(i, item);
  });
  overlay.addEventListener('click', async function (e) {
    if (e.target === overlay) return;
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    const n = S.cur;
    switch (act) {
      case 'tab':
        if (b.dataset.tab !== S.tab) switchTab(b.dataset.tab);
        break;
      case 'addLine':
        n.items.push(notaEmptyItem());
        touch();
        renderEditor();
        {
          const last = body.querySelectorAll('.nl-prod');
          if (last.length) last[last.length - 1].focus();
        }
        break;
      case 'delLine': {
        const i = lineIdx(b);
        if (n.items.length === 1) n.items[0] = notaEmptyItem();
        else n.items.splice(i, 1);
        touch();
        renderEditor();
        break;
      }
      case 'qtyInc':
      case 'qtyDec': {
        const i = lineIdx(b);
        const it = n.items[i];
        it.qty = Math.max(1, (Number(it.qty) || 0) + (act === 'qtyInc' ? 1 : -1));
        b.parentElement.querySelector('.nl-qty').value = it.qty;
        touch();
        refreshLine(i);
        refreshTotals();
        break;
      }
      case 'addPay': {
        const t = notaTotals(n);
        n.payments.push({ method: n.payments.length ? 'Transfer' : 'Tunai', amount: Math.max(t.total - t.paid, 0) || 0, ref: '' });
        touch();
        renderEditor();
        break;
      }
      case 'delPay':
        n.payments.splice(payIdx(b), 1);
        touch();
        renderEditor();
        break;
      case 'fillPay': {
        const i = payIdx(b);
        const others = n.payments.reduce((s, p, k) => s + (k === i ? 0 : Number(p.amount) || 0), 0);
        n.payments[i].amount = Math.max(notaTotals(n).total - others, 0);
        b.parentElement.querySelector('.pay-amount').value = fmtNum(n.payments[i].amount);
        touch();
        refreshTotals();
        break;
      }
      case 'saveDraft':
        await save(n, 'Draft tersimpan.');
        break;
      case 'saveEdit': {
        const f = readStaffFields();
        const res = notaApply(n, 'edit', { role: 'staff', by: prefs().staffName || '', note: f.note });
        if (!res.ok) return toast(res.error, 'bad');
        await save(res.nota, res.nota.status !== n.status ? 'Perubahan tersimpan — nota perlu divalidasi ulang.' : 'Perubahan tersimpan.');
        break;
      }
      case 'submit': {
        const ok = await doAction('submit', {}, 'Nota diajukan ke kasir/gudang.');
        if (ok) {
          notaLsDel(NOTA_CONFIG.draftKey);
          toast('Nota diajukan. Unduh/bagikan ke pelanggan dari tombol di bawah.', 'ok');
        }
        break;
      }
      case 'validate': {
        const f = readStaffFields();
        await doAction('validate', { note: f.note }, 'Nota divalidasi.');
        break;
      }
      case 'return': {
        const f = readStaffFields();
        await doAction('return', { note: f.note }, 'Nota dikembalikan ke frontliner.');
        break;
      }
      case 'deliver': {
        const f = readStaffFields();
        await doAction('deliver', { deliveryNo: f.deliveryNo }, 'No. Delivery tersimpan — nota terkunci.');
        break;
      }
      case 'reopen': {
        const f = readStaffFields();
        await doAction('reopen', { note: f.note }, 'Kunci dibuka untuk koreksi.');
        break;
      }
      case 'cancelStaff': {
        const f = readStaffFields();
        if (!f.note.trim()) return toast('Tulis alasan pembatalan di kolom Catatan staf.', 'bad');
        if (confirm('Batalkan nota ini?')) await doAction('cancel', { note: f.note }, 'Nota dibatalkan.');
        break;
      }
      case 'cancelFl': {
        const why = prompt('Alasan membatalkan nota ini?');
        if (why && why.trim()) await doAction('cancel', { note: why }, 'Nota dibatalkan.');
        break;
      }
      case 'copyEntry':
        try {
          await navigator.clipboard.writeText(notaToTsv(n));
          toast('Disalin: kode, nama, qty, harga — tinggal tempel.', 'ok');
        } catch (er) {
          toast('Gagal menyalin (izin clipboard ditolak browser).', 'bad');
        }
        break;
      case 'download':
        await downloadNota(n, false);
        break;
      case 'share':
        await downloadNota(n, true);
        break;
      case 'newNota':
        if (!confirmDiscard()) break;
        resetNota();
        renderEditor();
        break;
      case 'reload': {
        const r = await notaFetchByKeys([`nota:${n.date}:${n.id}`]);
        if (r.list[0]) {
          S.cur = r.list[0];
          S.dirty = false;
          notaPendingSet(S.cur.id, false);
          renderEditor();
          toast('Versi terbaru dimuat.', 'ok');
        } else toast('Nota tidak ditemukan di server.', 'bad');
        break;
      }
      case 'openCard': {
        const x = S.list.find((q) => q.id === b.dataset.id);
        if (x) openNotaObj(x);
        break;
      }
      case 'dlCard': {
        const x = S.list.find((q) => q.id === b.dataset.id);
        if (x) await downloadNota(x, false);
        break;
      }
      case 'status':
        S.f.status = b.dataset.s;
        renderAllList();
        break;
      case 'refreshList':
        loadAll();
        break;
      case 'csv': {
        const list = filtered();
        const blob = new Blob(['\ufeff' + notaToCsv(list)], { type: 'text/csv;charset=utf-8' });
        saveBlob(blob, `rekap-nota-${notaLocalDate().replace(/-/g, '')}.csv`);
        break;
      }
    }
  });
  $('notaOpenBtn').addEventListener('click', openOverlay);
  $('notaCloseBtn').addEventListener('click', closeOverlay);
  window.notaOnModeChange = function () {
    if (!overlay.classList.contains('show')) return;
    if (!staffMode && S.tab === 'semua') S.tab = 'edit';
    switchTab(S.tab);
  };
  window.notaIsOpen = () => overlay.classList.contains('show');
  window.notaRenderCanvas = renderNotaCanvas; // dipakai untuk pratinjau/tes
  window.notaRenderCanvas = renderNotaCanvas; // dipakai untuk pengujian
})();
