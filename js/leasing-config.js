// Pengaturan fitur Skema Leasing — EDIT FILE INI bila arti tanda/teks perlu disesuaikan.

const LEASING_CONFIG = {
  // Program (kolom) yang DISEMBUNYIKAN di file Excel dianggap tidak aktif dan tidak ditampilkan.
  // Ubah ke true kalau semua kolom, termasuk yang tersembunyi, harus ikut tampil.
  showHiddenPrograms: false,

  // Teks hasil per sel di tabel skema
  textFree: '✔ Gratis biaya admin (disubsidi)', // sel berisi ✔
  textFeePrefix: 'Biaya admin', // sel berisi angka -> "Biaya admin Rp110.000"
  textNoSubsidy: '❌ Tidak ada subsidi', // sel berisi ❌
  textNoSubsidyFallback: 'berlaku Sub Leasing BAF / MEGAZIP', // ditambah angka kolom E bila ada
  textNoData: 'Tidak ada data',

  // Nama lembaga untuk kolom "SUB LEASING" (kolom E di Excel)
  bafLabel: 'BAF / MEGAZIP',

  // Nama lembaga yang ditampilkan. Di Excel, beberapa program berada di bawah judul lembaga lain
  // (mis. "SAMSUNG FINANCE+" ada di bawah judul KREDIVO). Aturan ini memisahkannya.
  // [awalan judul program (huruf besar), nama lembaga yang ditampilkan]
  providerByTitle: [
    ['SAMSUNG FINANCE', 'SAMSUNG FINANCE+'],
    ['VAST FINANCE', 'VAST FINANCE+'],
  ],
  // Ganti nama tampilan dari judul di Excel -> nama yang lebih mudah dikenali
  providerAlias: {
    'SPAYLATER LIMIT XTRA': 'SPAYLATER (SHOPEEPAY)',
    'BLI- BLI INSTORE': 'BLI-BLI INSTORE',
  },

  // Hasil pencarian maksimal yang ditampilkan
  maxResults: 40,
};
