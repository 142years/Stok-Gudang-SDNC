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
| `js/pricing.js` | Harga dari Price List Manual |
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
