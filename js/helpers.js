// Fungsi bantu: escapeHtml, format Rupiah, tanggal
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function fmtRupiah(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return 'Rp' + Math.round(n).toLocaleString('id-ID');
}

function parseIdDate(str) {
  if (str === null || str === undefined || str === '') return null;
  // Tanggal dari Excel bisa berupa objek Date atau nomor seri, bukan hanya teks "dd/mm/yyyy"
  if (str instanceof Date && !isNaN(str.getTime())) {
    const d = str;
    return { ts: d.getTime(), display: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` };
  }
  if (typeof str === 'number' && str > 20000 && str < 80000) {
    const d = new Date(Math.round((str - 25569) * 86400000));
    const dd = String(d.getUTCDate()).padStart(2, '0'),
      mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    return { ts: new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime(), display: `${dd}/${mm}/${d.getUTCFullYear()}` };
  }
  const text = String(str).trim();
  const iso = text.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/); // yyyy-mm-dd
  if (iso) {
    const [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    return { ts: new Date(y, m - 1, d).getTime(), display: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}` };
  }
  const parts = text.split(/[\/\-]/);
  if (parts.length !== 3) return null;
  let [d, m, y] = parts.map((p) => parseInt(p, 10));
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
  if (y < 100) y += 2000;
  const dt = new Date(y, m - 1, d);
  return { ts: dt.getTime(), display: text };
}
