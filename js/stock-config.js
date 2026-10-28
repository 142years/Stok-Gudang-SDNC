// Pengaturan stok sendiri — sumbernya file "Stock Available" (jumlah) dan file "Serial Number" (nomor seri).
//
// Gudang yang DIHITUNG sebagai stok READY di kartu produk. Tulis persis seperti kode gudang di SAP.
// Gudang yang tidak ada di sini dan bukan SDNC.* diperlakukan sebagai cabang lain (INDENT).
const STOCK_OWN_WAREHOUSES = ['SDNC.UTM', 'SDNC.SHO', 'SDNX.SHO', 'SDNX.STR', 'SDNC.RUS', 'SDNC.DEM', 'SDNC.KEP'];

// Gudang di bawah ini jumlahnya diambil dari kolom "In Stock" (fisik) kalau lebih besar dari Available + Allocated,
// karena barangnya bisa belum berstatus ready di SAP (kolom Available bisa 0) dan sering tidak punya nomor seri.
const STOCK_COUNT_INSTOCK = ['SDNX.STR', 'SDNX.SHO', 'SDNC.RUS', 'SDNC.DEM', 'SDNC.KEP'];

// Gudang khusus (rusak / demo / keep): ikut dihitung READY seperti gudang lain, tapi kartu produk memberi
// penanda dan nomor serinya tidak ikut urutan FIFO. Juga dipakai menu "Gudang Khusus".
// Urutan di sini = urutan tab di menu. Kode harus ada juga di STOCK_OWN_WAREHOUSES.
const STOCK_SPECIAL_WAREHOUSES = { 'SDNC.RUS': 'RUSAK', 'SDNC.DEM': 'DEMO', 'SDNC.KEP': 'KEEP' };

// Label gudang SDNC lain yang TIDAK ada di STOCK_OWN_WAREHOUSES (mis. kalau kode di atas dikeluarkan lagi dari daftar).
// Tampil sebagai keterangan "Di SDNC · DEMO 1 pcs", supaya barangnya tidak dikira INDENT/HABIS.
const STOCK_NONREADY_LABELS = { 'SDNC.DEM': 'DEMO', 'SDNC.RUS': 'RUSAK', 'SDNC.KEP': 'KEEP' };
// Penanda di daftar stok cabang lain, berdasarkan akhiran kode gudang (mis. BJMA.DEM -> "demo")
const STOCK_WAREHOUSE_TAGS = { DEM: 'demo', RUS: 'rusak', KEP: 'keep' };

// Label gudang khusus dari kode gudang (huruf besar/kecil tidak berpengaruh), atau null kalau bukan gudang khusus.
function whSpecialLabel(wh) {
  return STOCK_SPECIAL_WAREHOUSES[String(wh || '').trim().toUpperCase()] || null;
}
