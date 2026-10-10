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


## Nota Digital (pengganti nota tulis)
Tombol **📝 Nota** di header. Sales mengisi nota di HP: nama sales (pilihan dropdown), pelanggan + No. HP, barang (ketik/scan, terhubung ke katalog), jumlah, harga (default dari price list, bisa diubah untuk promo/cashback/tebus murah), pembayaran (bisa lebih dari satu metode). Total otomatis. Nota diunduh/dibagikan sebagai gambar ke pelanggan, dengan tampilan mengikuti nota hasil input SAP.

Alur status: `Draft → Menunggu validasi → Divalidasi → Selesai (No. Delivery diisi, terkunci)`; staf bisa mengembalikan ke sales atau membatalkan.
- Data disimpan di tabel `app_data` Supabase dengan key `nota:<tanggal>:<id>` (tanpa perubahan skema). Daftar staf mencari per hari dengan `LIKE`.
- Setiap nota juga disalin di perangkat; kalau sinyal putus, data aman dan bisa dikirim ulang.
- **Pengaturan ada di `js/nota-config.js`**: nama toko & data perusahaan di nota, **daftar nama sales (dropdown)**, teks bagian bawah nota.
- File lain: `js/nota-core.js` (logika), `js/nota-ui.js` (tampilan & gambar nota), `css/nota.css`.

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
