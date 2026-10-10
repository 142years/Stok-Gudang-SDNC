// Pengaturan stok sendiri (gudang SDNC) — sumbernya file "Stock Available".
//
// Gudang SDNC yang DIHITUNG sebagai stok READY (dijual). Tulis persis seperti kode gudang di SAP.
// SDNC.DEM (demo) dan SDNC.RUS (rusak) sengaja TIDAK dihitung supaya unit demo/rusak
// tidak dikira siap jual. Kalau ingin ikut dihitung, tambahkan kodenya di sini.
const STOCK_OWN_WAREHOUSES = ['SDNC.UTM', 'SDNC.SHO'];
