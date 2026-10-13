// Pengaturan filter pencarian — EDIT file ini untuk menambah nama brand, jenis barang, atau pilihan harga.

// Kode brand = segmen ke-2 kode barang (mis. GAD.SAM.HP01453 -> SAM). Kode yang belum ada di daftar
// ini tetap muncul, hanya dengan nama kodenya.
const FILTER_BRAND_NAMES = {
  APL: 'Apple', SAM: 'Samsung', XMI: 'Xiaomi', OPO: 'OPPO', IFX: 'Infinix', VIV: 'vivo', TCN: 'Tecno',
  RLM: 'realme', ITV: 'itel', LEN: 'Lenovo', ASS: 'Asus', IQO: 'iQOO', ADV: 'Advan', HWP: 'HP Inc',
  ACR: 'Acer', HWI: 'Huawei', MTL: 'Motorola', ZTE: 'ZTE / Nubia', AXI: 'Axioo', HON: 'Honor',
  MSI: 'MSI', VLN: 'Villaon', NOK: 'Nokia', OMI: 'Ommi', MIT: 'Mito', SMF: 'Smartfren', ZYX: 'Zyrex',
  OLK: 'Olike',
};

// Jenis barang, dibaca dari kode: KATEGORI.BRAND.JENISnomor (GAD = gadget, ACC = aksesoris, FIX = sparepart).
// Aturan diperiksa berurutan, yang cocok pertama dipakai. Sisanya masuk "Lainnya".
const FILTER_TABLET_RE = /\b(X?TAB|TABLET)\b|PAD\b/i; // nama tablet (di data, tablet ikut jenis HP)
const FILTER_TYPES = [
  { id: 'hp', label: 'HP', test: (m, it) => m.cat === 'GAD' && m.type === 'HP' && !FILTER_TABLET_RE.test(it.desc || '') },
  { id: 'tablet', label: 'Tablet', test: (m, it) => m.cat === 'GAD' && m.type === 'HP' && FILTER_TABLET_RE.test(it.desc || '') },
  { id: 'laptop', label: 'Laptop & PC', test: (m) => m.cat === 'GAD' && (m.type === 'NB' || m.type === 'PC') },
  { id: 'jam', label: 'Jam / Wearable', test: (m) => m.cat === 'GAD' && m.type === 'JAM' },
  { id: 'gadlain', label: 'Gadget lain', test: (m) => m.cat === 'GAD' },
  { id: 'aksesoris', label: 'Aksesoris', test: (m) => m.cat === 'ACC' },
  { id: 'sparepart', label: 'Sparepart', test: (m) => m.cat === 'FIX' },
];

// Pilihan harga (tanpa mengetik angka). Semua dalam Rupiah.
const FILTER_PRICE_STEPS = [
  500000, 1000000, 1500000, 2000000, 2500000, 3000000, 4000000, 5000000, 6000000, 7000000, 8000000,
  10000000, 12000000, 15000000, 20000000, 25000000,
]; // isi pilihan "Harga min" dan "Harga maks"
const FILTER_PRICE_CAPS = [1000000, 2000000, 3000000, 4000000, 5000000, 7000000, 10000000]; // chip "Maks ..."
const FILTER_PRICE_BANDS = [[1000000, 2000000], [2000000, 3000000], [3000000, 4000000], [4000000, 5000000], [5000000, 7000000], [7000000, 10000000], [10000000, 15000000]]; // chip "x–y jt"
const FILTER_PRICE_MIN_ONLY = [15000000]; // chip "Di atas ..."

const FILTER_BRAND_CHIPS = 12; // jumlah brand yang tampil sebagai tombol; sisanya masuk pilihan "Brand lain"
