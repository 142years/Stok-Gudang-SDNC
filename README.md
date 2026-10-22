# Cek Harga & Stok

Web app gudang (HTML + CSS + JavaScript biasa, tanpa build). Bisa langsung diedit di GitHub dan dijalankan lewat GitHub Pages.

## Struktur
| File | Isi |
|---|---|
| `index.html` | Kerangka halaman + daftar skrip |
| `css/theme.css` | Warna & mode terang/gelap |
| `css/style.css` | Tata letak & komponen |
| `js/config.js` | **URL/Key Supabase dan PIN staff** |
| `js/state.js` | Variabel global & elemen halaman |
| `js/pricing.js` | Harga dari Price List Reborn (kolom Retail) |
| `js/helpers.js` | Format Rupiah, escape HTML, tanggal |
| `js/auth.js` | PIN & mode Staff Gudang |
| `js/sync.js` | Sinkron ke/dari Supabase + cadangan lokal |
| `js/catalog.js` | Status data, badge upload, pembuatan katalog |
| `js/stock-opname.js` | Stock Opname Harian |
| `js/upload.js` | Upload & baca file Excel |
| `js/delete.js` | Hapus data di server |
| `js/search.js` | Pencarian, kartu barang, FIFO, verifikasi SN |
| `js/scanner.js` | Scanner barcode / SN |
| `js/main.js` | Mulai aplikasi & pembaruan berkala |
| `js/theme.js`, `js/errors.js` | Tombol tema, banner error |

## Cara edit di GitHub
1. Buka file → ikon pensil → ubah → **Commit changes**.
2. Tunggu 1–2 menit (GitHub Pages memproses), lalu refresh keras (Ctrl+F5).
3. Kalau perubahan belum terlihat, naikkan angka `?v=1` → `?v=2` di `index.html` pada file yang diubah.

## Aturan penting
- **Urutan `<script>` di `index.html` jangan diubah.** Semua file berbagi variabel global yang sama.
- Satu folder = satu paket: unggah `index.html`, `css/`, dan `js/` bersama-sama.
- Mau ganti PIN staff atau Supabase? Cukup `js/config.js`.


## Skema Leasing (biaya admin per produk)
Tombol **💳 Leasing** di header (bisa dipakai frontliner dan staf). Cari produk → lihat biaya admin per lembaga/program (Indodana, SPayLater/ShopeePay, Kredivo, KreditPlus, Samsung Finance+, HCI, Akulaku, bank, dll.).
- Sumber data: file `SKEMA_LEASING_….xlsx` (sheet REKAP). **Staf** mengunggahnya lewat “Upload File” (dikenali otomatis dari judul kolom), disimpan di Supabase key `leasing:latest`.
- Arti sel: angka = biaya admin (Rp) · ✔ = disubsidi/gratis admin · ❌ = tidak ada subsidi → berlaku biaya Sub Leasing BAF/MEGAZIP (kolom E). Teks bisa diubah di `js/leasing-config.js`.
- Yang **tidak** disimpan ke web (data internal): SRP, PRICE AFTER CB, FEE LEASING, SISA MARGIN.
- Kolom yang disembunyikan di Excel dianggap program tidak aktif dan tidak tampil untuk frontliner (staf bisa menampilkannya lewat opsi di halaman produk; atau ubah `showHiddenPrograms` di config).
- File: `js/leasing-config.js` (pengaturan), `js/leasing-core.js` (pembaca Excel & pencarian), `js/leasing-ui.js` (tampilan), `css/leasing.css`.

## Sumber data (setelah file Price List dihapus)
| Data | Sumber | Catatan |
|---|---|---|
| Stok sendiri (READY) & stok cabang lain (INDENT) | **Stock Available** | Gudang SDNC yang dihitung diatur di `js/stock-config.js` (default `SDNC.UTM` dan `SDNC.SHO`; **DEM** dan **RUS** tidak dihitung) |
| Nomor seri / FIFO | **Serial Number** | |
| Harga | **Price List Reborn** (kolom Retail) | Satu-satunya sumber harga |
| Barcode | Data Barcode | |

- Upload **Stock Available** saja sudah memperbarui stok semua barang (tidak perlu dipasangkan dengan file lain). Upload Serial Number hanya memperbarui nomor seri.
- File **Price List** lama kalau diupload akan ditolak dengan pesan jelas.
- Banner "Data belum diperbarui hari ini" sudah dihapus. Waktu pembaruan stok tetap tampil di bagian atas halaman.

## Pencarian & Filter
- **Pencarian**: nama, kode barang, nomor seri, dan barcode. Barcode bisa diketik, ditempel, atau di-scan dengan alat scanner. Barcode persis / nomor seri / kode persis selalu tampil paling atas dan tidak terkena filter.
- Satu barang boleh punya **beberapa barcode** (baris ganda atau beberapa barcode dalam satu sel Excel).
- Teks dari HP dibersihkan otomatis (angka lebar penuh, spasi tak terlihat, strip khusus).
- **Filter** (tombol ⚙ Filter di bawah kolom cari): Jenis (HP, Tablet, Laptop & PC, Jam, Aksesoris, Sparepart) dan Brand — **keduanya bisa dipilih lebih dari satu sekaligus** (ketuk lagi untuk melepas; “Semua” mengosongkan pilihan), Harga (pilihan “Maks …”, kisaran “2–3 jt”, atau dropdown min/maks — tanpa mengetik angka), Stok (Semua / Ready / Ready + Indent), dan Urutan (paling cocok, termurah, termahal, stok terbanyak). Bisa dipakai tanpa kata kunci untuk “browse”, mis. HP Samsung maks 3 jt.
- Jenis & brand dibaca dari kode barang `KATEGORI.BRAND.JENISnomor` (mis. `GAD.SAM.HP01453`). Nama brand, jenis, dan pilihan harga diatur di `js/filter-config.js`.
- Kalau data gagal dimuat dari server (mis. sinyal HP lemah), muncul peringatan yang terlihat semua pengguna beserta tombol “Muat ulang data”; pemuatan juga dicoba ulang otomatis sampai 3 kali.
- File: `js/search-core.js` (logika), `js/filter-ui.js` (tampilan filter), `css/filter.css`.
- **Ekspor / Cetak**: tombol **⬇ Ekspor / Cetak** muncul di atas hasil pencarian atau filter. Tiga pilihan: **📄 Unduh PDF** (file PDF langsung tersimpan tanpa dialog cetak — paling andal di HP; dibuat dengan jsPDF), **📊 Unduh Excel (.xlsx)**, dan **🖨 Cetak (printer)** lewat dialog cetak browser. Isi mengikuti kata kunci, filter, dan urutan yang sedang aktif, dan mencakup **semua** hasil (bukan hanya 60 yang tampil). Bila **beberapa brand** ada di hasil dan opsi **Brand** dicentang, hasil dikelompokkan berurutan per brand (urutan mengikuti pilihan di filter, lalu abjad) dengan judul tiap brand, penomoran per brand, dan kolom Brand tidak diulang; di Excel barang diurutkan per brand dan kolom Brand tetap ada. Opsi di panel: kolom **Kode**, **Brand**, **Stok** bisa disembunyikan; **Sembunyikan barang tanpa harga**; **Sembunyikan barang LDU / unit demo** (nama/kode memuat “LDU”, atau stok SDNC hanya demo/rusak; pola diatur di `EXPORT_LDU_RE`); **Sertakan keterangan** (filter, jumlah, waktu data, tanggal cetak — default tidak ikut). Di atas 500 barang ada konfirmasi. Pustaka PDF/Excel dimuat dari internet saat dibutuhkan (bisa dicoba ulang bila gagal). Nama di kop diatur di `js/export.js` (`EXPORT_HEADER_NAME`). File: `js/export.js`, `css/export.css`.

## Arti status stok di kartu barang
| Tampilan | Arti |
|---|---|
| **READY · N pcs** | Fisik ada di gudang SDNC (UTM + SHO). N = Available + Allocated |
| ⚠ **N pcs berstatus Allocated** | Sudah dialokasikan di SAP. Fisik masih ada; minta cancel alokasi di SAP sebelum dijual. Muncul untuk **semua** barang (bernomor seri maupun tidak), lengkap dengan jumlah yang bebas |
| **INDENT** | Tidak ada di SDNC, tetapi ada di cabang lain |
| **DI SDNC · DEMO / RUSAK** | Ada di gudang SDNC.DEM / SDNC.RUS: unit demo/rusak, **bukan stok jual** (tidak dikira INDENT/HABIS) |
| **HABIS** | Tidak ada di SDNC maupun cabang lain |

- Tombol **Lihat stok cabang lain** muncul di semua barang yang ada di cabang lain, termasuk yang READY di SDNC. Gudang berakhiran DEM/RUS diberi penanda “demo/rusak”.
- Unit SN di gudang demo/rusak **tidak masuk urutan FIFO**; kalau di-scan, muncul peringatan “bukan stok jual”.
- Gudang mana yang dihitung stok jual, label demo/rusak, dan penanda gudang diatur di `js/stock-config.js`.
