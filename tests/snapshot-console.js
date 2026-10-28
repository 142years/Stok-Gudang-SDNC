// Tempel di Console browser (F12) pada situs yang SUDAH memuat data.
// Jalankan sebelum dan sesudah perubahan, simpan hasilnya (before.json / after.json), lalu bandingkan.
// Ganti isi <...> dengan barcode / SN / kode barang yang nyata di data Anda.
const Q = ['samsung a55', 'iphone', 'oppo reno', 'SDNC', '<barcode nyata>', '<SN nyata>', '<kode barang nyata>'];
const snap = Q.map((q) => {
  const r = runSearch(q, defaultFilters());
  const all = r.exact.concat(r.list);
  return { q, n: all.length, html: all.slice(0, 15).map(renderItem).join('') };
});
copy(JSON.stringify(snap));
console.log('Tersalin ke clipboard. Tempel ke file before.json atau after.json.');
