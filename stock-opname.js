// Stock Opname Harian
// ===== Stock Opname Harian — format baru: 1 sheet per gudang/cabang =====
// Tiap sheet berisi: blok HP/Gadget -> blok Aksesoris -> tabel ITR ("No ITR").
// Kolom A = nomor urut; B..L = Warehouse Code, Item Code, Deskripsi, SN/IMEI, Group Name,
// SAP, Fisik, Selisih, Hasil, No. Inventory Posting, Keterangan.
function soCell(r, i) {
  const v = r[i];
  return v === null || v === undefined ? '' : String(v).trim();
}

function soFmtDate(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date && !isNaN(v.getTime())) v = Math.round(v.getTime() / 86400000) + 25569;
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return (
      String(d.getUTCDate()).padStart(2, '0') +
      '/' +
      String(d.getUTCMonth() + 1).padStart(2, '0') +
      '/' +
      d.getUTCFullYear()
    );
  }
  return String(v).trim();
}

function parseSoSheet(rows, idRef) {
  const out = { madeBy: '', hp: [], acc: [], itr: [] };
  let section = null; // 'HP' | 'ACC' | null (blok tanpa label)
  let inItr = false;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const a = soCell(r, 0).toUpperCase();
    const b = soCell(r, 1).toUpperCase();

    if (a.startsWith('DIBUAT OLEH')) {
      out.madeBy = soCell(r, 1);
      continue;
    }

    // Awal tabel ITR
    if (b === 'NO ITR') {
      inItr = true;
      continue;
    }

    if (inItr) {
      const noItr = soCell(r, 1);
      if (!noItr) continue;
      out.itr.push({
        id: idRef.n++,
        code: noItr,
        tanggal: soFmtDate(r[2]),
        asal: soCell(r, 3),
        tujuan: soCell(r, 4),
        remaks: soCell(r, 5),
        qty: soCell(r, 6),
        jenis: soCell(r, 7),
        tglKirim: soFmtDate(r[8]),
        resi: soCell(r, 9),
        ekspedisi: soCell(r, 10),
        ket: soCell(r, 11),
        checked: false,
      });
      continue;
    }

    // Header kolom -> lewati
    if (b === 'WAREHOUSE CODE') continue;

    // Baris label blok (kolom Item Code kosong): GADGET / GAD -> HP, ACCESORIS -> ACC
    if (b && !soCell(r, 2)) {
      if (b === 'GADGET' || b === 'GAD') section = 'HP';
      else if (b.startsWith('ACC')) section = 'ACC';
      continue;
    }

    const whcode = soCell(r, 1);
    const code = soCell(r, 2);
    if (!whcode || !code) continue; // baris kosong bawaan template (nomor urut + SAP default 1)

    const item = {
      id: idRef.n++,
      whcode,
      code,
      desc: soCell(r, 3),
      detail: soCell(r, 4), // SN / IMEI
      group: soCell(r, 5),
      sapQty: Number(soCell(r, 6)) || 0,
      posting: soCell(r, 10),
      ket: soCell(r, 11),
      checked: false,
    };

    // Blok ACCESORIS -> daftar jumlah (ACC). Di blok GADGET / tanpa label: ada SN -> daftar unit (HP),
    // tanpa SN -> daftar jumlah (ACC) supaya qty SAP tetap tampil.
    const target = section === 'ACC' ? 'acc' : item.detail ? 'hp' : 'acc';
    out[target].push(item);
  }
  return out;
}

function parseSoWorkbook(wb, fileName) {
  const idRef = { n: 1 };
  const sheets = {};
  const order = [];
  wb.SheetNames.forEach((name) => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null });
    const isSoSheet = rows.some(
      (r) =>
        r &&
        String(r[1] || '')
          .trim()
          .toUpperCase() === 'WAREHOUSE CODE',
    );
    if (!isSoSheet) return;
    sheets[name] = parseSoSheet(rows, idRef);
    order.push(name);
  });
  return { fileName, sheets, sheetOrder: order, updatedAt: new Date().toISOString() };
}

// Data SO lama (hanya 1 gudang: {hp, acc, itr}) dibungkus agar tetap bisa dibuka
function soNormalize(d) {
  if (!d) return null;
  if (d.sheets && d.sheetOrder) return d;
  return {
    fileName: d.fileName,
    updatedAt: d.updatedAt,
    sheetOrder: ['SDNC'],
    sheets: { SDNC: { madeBy: '', hp: d.hp || [], acc: d.acc || [], itr: d.itr || [] } },
  };
}

function soGetSheet() {
  soData = soNormalize(soData);
  if (!soData) return null;
  if (!soSelectedSheet || !soData.sheets[soSelectedSheet]) {
    let saved = null;
    try {
      saved = localStorage.getItem('so:sheet');
    } catch (e) {}
    soSelectedSheet =
      saved && soData.sheets[saved]
        ? saved
        : soData.sheetOrder.find((n) => n.toUpperCase().includes('SDNC')) || soData.sheetOrder[0] || null;
  }
  return soSelectedSheet ? soData.sheets[soSelectedSheet] : null;
}

soFileInput.addEventListener('change', function (e) {
  const file = e.target.files[0];
  if (!file) return;
  ensureXlsxLoaded()
    .then(() => {
      const reader = new FileReader();
      reader.onload = function (evt) {
        try {
          const data = new Uint8Array(evt.target.result);
          const wb = XLSX.read(data, { type: 'array' });
          const parsed = parseSoWorkbook(wb, file.name);
          if (!parsed.sheetOrder.length)
            throw new Error('Tidak ada sheet SO yang dikenali (header "Warehouse Code" tidak ditemukan).');
          soData = parsed;
          soSelectedSheet = null;
          soGetSheet();
          renderSoModules();
          saveCatalogToCloud('so:latest', soData).then((res) => {
            if (res && !res.ok)
              alert('Data SO hanya tersimpan di perangkat ini. Gagal sinkron ke cloud: ' + res.message);
          });
        } catch (err) {
          alert('Gagal membaca file SO: ' + err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    })
    .catch((err) => alert(err.message));
  e.target.value = '';
});

soSheetSelect.addEventListener('change', function () {
  soSelectedSheet = soSheetSelect.value;
  try {
    localStorage.setItem('so:sheet', soSelectedSheet);
  } catch (e) {}
  renderSoModules();
});

function soCheckBtn(category, item, doneLabel, todoLabel) {
  return `<button onclick="toggleSoItem('${category}', ${item.id})" style="background:${item.checked ? 'var(--ready-bg)' : 'var(--panel-2)'}; color:${item.checked ? 'var(--ready)' : 'var(--text)'}; border:1px solid ${item.checked ? 'var(--ready)' : 'var(--line)'}; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:700; flex-shrink:0; margin-left:8px;">${item.checked ? doneLabel : todoLabel}</button>`;
}

function soExtraLines(item) {
  let html = '';
  if (item.posting)
    html += `<div style="color:var(--muted); font-size:11px;">Posting: ${escapeHtml(item.posting)}</div>`;
  if (item.ket) html += `<div style="color:var(--indent); font-size:11px;">Ket: ${escapeHtml(item.ket)}</div>`;
  return html;
}

function renderSoModules() {
  const sheet = soGetSheet();

  if (!soData || !sheet) {
    soSheetRow.style.display = 'none';
    soSummaryInfo.textContent = 'Belum ada data SO';
    soGadgetList.innerHTML =
      '<div style="color:var(--muted); text-align:center; padding:12px;">Belum ada file SO di-upload.</div>';
    soAccContainer.innerHTML =
      '<div style="color:var(--muted); text-align:center; padding:12px;">Belum ada data ACC.</div>';
    soItrContainer.innerHTML =
      '<div style="color:var(--muted); text-align:center; padding:12px;">Belum ada data ITR Gantung.</div>';
    soGadgetStats.textContent = '0 / 0 Selesai';
    soAccStats.textContent = '0 / 0 Selesai';
    soItrStats.textContent = '0 / 0 Selesai';
    return;
  }

  // Pilihan gudang (1 sheet = 1 gudang), lengkap dengan progres HP+ACC
  soSheetRow.style.display = soData.sheetOrder.length > 1 ? 'block' : 'none';
  soSheetSelect.innerHTML = soData.sheetOrder
    .map((n) => {
      const s = soData.sheets[n];
      const all = (s.hp || []).concat(s.acc || []);
      const done = all.filter((i) => i.checked).length;
      return `<option value="${escapeHtml(n)}"${n === soSelectedSheet ? ' selected' : ''}>${escapeHtml(n)} — ${done}/${all.length}</option>`;
    })
    .join('');

  soSummaryInfo.textContent = soData.fileName + (sheet.madeBy ? ` · Dibuat oleh: ${sheet.madeBy}` : '');

  // ----- HP / Gadget -----
  const qHp = soGadgetInput.value.toLowerCase();
  const hpFiltered = sheet.hp.filter(
    (item) =>
      !qHp ||
      item.desc.toLowerCase().includes(qHp) ||
      item.code.toLowerCase().includes(qHp) ||
      (item.detail || '').toLowerCase().includes(qHp),
  );
  soGadgetStats.textContent = `${sheet.hp.filter((i) => i.checked).length} / ${sheet.hp.length} Selesai`;

  soGadgetList.innerHTML =
    sheet.hp.length === 0
      ? '<div style="color:var(--muted); padding:8px;">Tidak ada data HP di sheet ini.</div>'
      : hpFiltered.length === 0
        ? '<div style="color:var(--muted); padding:8px;">Tidak ditemukan.</div>'
        : hpFiltered
            .map(
              (item) => `
      <div style="display:flex; align-items:center; justify-content:space-between; background:var(--bg); border:1px solid var(--line); padding:8px; border-radius:6px; margin-bottom:6px;">
        <div>
          <div style="font-weight:600; color:var(--text);">${escapeHtml(item.desc)}</div>
          <div style="color:var(--muted); font-size:11px;">IMEI/SN: ${escapeHtml(item.detail || '-')} · ${escapeHtml(item.whcode)}${item.group ? ' · ' + escapeHtml(item.group) : ''}</div>
          ${soExtraLines(item)}
        </div>
        ${soCheckBtn('hp', item, '✔ Sesuai', 'Cek')}
      </div>
    `,
            )
            .join('');

  // ----- Aksesoris -----
  const qAcc = soAccInput.value.toLowerCase();
  const accFiltered = sheet.acc.filter(
    (item) =>
      !qAcc ||
      item.desc.toLowerCase().includes(qAcc) ||
      item.code.toLowerCase().includes(qAcc) ||
      (item.detail || '').toLowerCase().includes(qAcc),
  );
  soAccStats.textContent = `${sheet.acc.filter((i) => i.checked).length} / ${sheet.acc.length} Selesai`;

  soAccContainer.innerHTML =
    sheet.acc.length === 0
      ? '<div style="color:var(--muted); padding:8px;">Tidak ada data aksesoris di sheet ini.</div>'
      : accFiltered.length === 0
        ? '<div style="color:var(--muted); padding:8px;">Tidak ditemukan.</div>'
        : accFiltered
            .map(
              (item) => `
      <div style="display:flex; align-items:center; justify-content:space-between; background:var(--bg); border:1px solid var(--line); padding:8px; border-radius:6px; margin-bottom:6px; font-size:12px;">
        <div>
          <div style="font-weight:600; color:var(--text);">${escapeHtml(item.desc)}${item.sapQty > 1 ? ` <span style="color:var(--indent); font-weight:800;">· SAP: ${item.sapQty} pcs</span>` : ''}</div>
          <div style="color:var(--muted); font-size:11px;">Kode: ${escapeHtml(item.code)} · ${escapeHtml(item.whcode)}${item.group ? ' · ' + escapeHtml(item.group) : ''}${item.detail ? ' · SN: ' + escapeHtml(item.detail) : ''}${item.sapQty ? ` · Jumlah SAP: ${item.sapQty}` : ''}</div>
          ${soExtraLines(item)}
        </div>
        ${soCheckBtn('acc', item, '✔ Sesuai', 'Cek')}
      </div>
    `,
            )
            .join('');

  // ----- ITR Gantung -----
  soItrStats.textContent = `${sheet.itr.filter((i) => i.checked).length} / ${sheet.itr.length} Selesai`;
  soItrContainer.innerHTML =
    sheet.itr.length === 0
      ? '<div style="color:var(--muted); padding:8px;">Tidak ada data ITR gantung di sheet ini.</div>'
      : sheet.itr
          .map((item) => {
            // Data lama (sebelum format baru) hanya punya "detail"
            const line1 =
              item.asal || item.tujuan
                ? `${escapeHtml(item.asal || '-')} → ${escapeHtml(item.tujuan || '-')}${item.tanggal ? ' · ' + escapeHtml(item.tanggal) : ''}${item.qty ? ' · Qty: ' + escapeHtml(item.qty) : ''}`
                : escapeHtml(item.detail || '');
            const line2 = item.remaks
              ? `<div style="color:var(--muted); font-size:11px;">${escapeHtml(item.remaks)}</div>`
              : '';
            const kirim = [
              item.jenis,
              item.tglKirim,
              item.ekspedisi ? 'Ekspedisi: ' + item.ekspedisi : '',
              item.resi ? 'Resi: ' + item.resi : '',
            ].filter(Boolean);
            const line3 = kirim.length
              ? `<div style="color:var(--muted); font-size:11px;">${escapeHtml(kirim.join(' · '))}</div>`
              : '';
            const line4 = item.ket
              ? `<div style="color:var(--indent); font-size:11px;">Ket: ${escapeHtml(item.ket)}</div>`
              : '';
            return `
      <div style="display:flex; align-items:center; justify-content:space-between; background:var(--bg); border:1px solid var(--line); padding:8px; border-radius:6px; margin-bottom:6px; font-size:12px;">
        <div>
          <div style="font-weight:600; color:var(--text);">No. ITR: ${escapeHtml(item.code)}</div>
          <div style="color:var(--muted); font-size:11px;">${line1}</div>
          ${line2}${line3}${line4}
        </div>
        ${soCheckBtn('itr', item, '✔ Sesuai', 'Pending')}
      </div>`;
          })
          .join('');
}

window.toggleSoItem = function (category, id) {
  const sheet = soGetSheet();
  if (!sheet) return;
  const list = sheet[category];
  if (!list) return;
  const target = list.find((i) => i.id === id);
  if (target) {
    target.checked = !target.checked;
    saveCatalogToCloud('so:latest', soData);
    renderSoModules();
  }
};

soGadgetInput.addEventListener('input', renderSoModules);
soAccInput.addEventListener('input', renderSoModules);
