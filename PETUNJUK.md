# Paket Langkah 1 — Fasad data (DataAPI), mode legacy

Tujuan: semua panggilan Supabase lewat satu file (`js/data/data-api.js`).
Perilaku web **tidak berubah** (`BACKEND_MODE = 'legacy'`).

## Isi paket (hanya file yang berubah)
| File | Perubahan |
|---|---|
| `js/data/data-api.js` | **BARU** — satu-satunya pemanggil `sbClient` untuk tabel `app_data` |
| `js/sync.js` | 4 panggilan `sbClient` → `DataAPI` (baca payload, baca stamp, tulis, cek ada) |
| `js/delete.js` | 2 panggilan → `DataAPI.keyExists` / `DataAPI.deleteKey` |
| `js/main.js` | 1 panggilan → `DataAPI.readMeta` |
| `index.html` | tambah `<script src="js/data/data-api.js?v=1">` tepat setelah `config.js`; naikkan `?v=` sync (8), delete (6), main (8) |
| `tests/snapshot-console.js` | skrip pembanding hasil pencarian sebelum/sesudah |

## Cara pasang
1. **Sebelum menimpa**: di GitHub buat tag/rilis `stabil-sebelum-refactor` (atau salin repo).
2. Salin isi folder ini ke repo, timpa file yang sama, termasuk folder baru `js/data/`.
3. Commit. Tunggu 1–2 menit (GitHub Pages), lalu refresh keras (Ctrl+F5).
4. Jangan ubah urutan `<script>`: `data-api.js` harus setelah `config.js` dan sebelum `sync.js`.

## Cara uji (±5 menit)
- Buka situs: data tampil, pencarian dan scan jalan, tidak ada banner merah di atas.
- Mode Staff: upload satu file kecil (mis. Barcode), badge jadi ✓ dan muncul di perangkat lain.
- Hapus Data pada satu jenis data yang aman, lalu upload ulang.
- Console (F12): ketik `DataAPI` dan `BACKEND_MODE`, harus `{...}` dan `'legacy'`.
- Opsional: jalankan `tests/snapshot-console.js` sebelum dan sesudah, bandingkan hasilnya.

## Rollback
Kembalikan commit ke tag `stabil-sebelum-refactor`.

## Yang BELUM termasuk
- Mode `'new'` (Edge Function `staff-write`) belum bisa dipakai: butuh backend B1 dan `auth.js` menyimpan PIN ke `window.__staffPin`. Jangan ubah `BACKEND_MODE`.
- Belum ada perubahan keamanan: RLS masih seperti sekarang. Itu Langkah 4 dan 6.
