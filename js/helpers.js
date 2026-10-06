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
  if (!str) return null;
  const parts = String(str)
    .trim()
    .split(/[\/\-]/);
  if (parts.length !== 3) return null;
  let [d, m, y] = parts.map((p) => parseInt(p, 10));
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
  if (y < 100) y += 2000;
  const dt = new Date(y, m - 1, d);
  return { ts: dt.getTime(), display: String(str).trim() };
}
