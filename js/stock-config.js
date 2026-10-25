// Pengaturan stok sendiri (gudang SDNC) — sumbernya file "Stock Available".
//
// Gudang SDNC yang DIHITUNG sebagai stok READY (dijual). Tulis persis seperti kode gudang di SAP.
// SDNC.DEM (demo) dan SDNC.RUS (rusak) sengaja TIDAK dihitung supaya unit demo/rusak
// tidak dikira siap jual. Kalau ingin ikut dihitung, tambahkan kodenya di sini.
const STOCK_OWN_WAREHOUSES = ['SDNC.UTM', 'SDNC.SHO', 'SDNX.STR'];

// Catatan: SDNX.STR (awalan SDNX, bukan SDNC) sengaja didaftarkan di sini supaya dihitung READY.

// Gudang SDNC yang BUKAN stok jual tetap ditampilkan sebagai keterangan (mis. "Di SDNC · DEMO 1 pcs"),
// supaya barangnya tidak dikira INDENT/HABIS padahal ada di SDNC. Kode di sini = kode gudang di SAP.
const STOCK_NONREADY_LABELS = { 'SDNC.DEM': 'DEMO', 'SDNC.RUS': 'RUSAK' };
// Penanda di daftar stok cabang lain, berdasarkan akhiran kode gudang (mis. BJMA.DEM -> "demo")
const STOCK_WAREHOUSE_TAGS = { DEM: 'demo', RUS: 'rusak' };
