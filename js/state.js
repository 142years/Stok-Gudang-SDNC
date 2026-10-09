// Variabel global & referensi elemen halaman
let catalog = null;
let soData = null;
let staffMode = false;
let currentScan = null; // hasil scan terakhir { raw, codes, serial, fresh } — tetap tampil walau kolom cari kosong
const RESULT_LIMIT = 60;
const openFifo = new Set();
const openBranches = new Set();
const openBranchUnits = new Set(); // key: `${code}::${whcode}` — untuk buka daftar SN per cabang lain

// Data barcode (Item No. -> Bar Code), diupload lewat tombol "Upload Data Barcode"
// (bukan ditempel statis lagi di kode, supaya file HTML ini tidak jadi berat).
// Dicocokkan berdasarkan KODE BARANG (Item No.) — sesuai struktur file
// "Check ItemName & Barcode" (bukan berdasar deskripsi, yang terbukti ambigu:
// satu deskripsi bisa dipakai lebih dari satu kode barang berbeda barcode).
let BARCODE_MAP = {};
let barcodeMeta = null; // { fileName, updatedAt }

function getBarcodes(code) {
  if (!code) return null;
  const key = String(code).trim();
  if (BARCODE_MAP[key]) return [BARCODE_MAP[key]];
  // fallback: coba cocokkan tanpa mempedulikan huruf besar/kecil & spasi ganda
  const norm = key.toUpperCase().replace(/\s+/g, ' ');
  if (!getBarcodes._normIndex) {
    getBarcodes._normIndex = {};
    Object.keys(BARCODE_MAP).forEach((k) => {
      getBarcodes._normIndex[k.toUpperCase().replace(/\s+/g, ' ')] = BARCODE_MAP[k];
    });
  }
  const hit = getBarcodes._normIndex[norm];
  return hit ? [hit] : null;
}

const resultsEl = document.getElementById('results');
const staleBanner = document.getElementById('staleBanner');
const metaDetail = document.getElementById('metaDetail');
const statusEl = document.getElementById('uploadStatus');
const searchInput = document.getElementById('searchInput');
const footNote = document.getElementById('footNote');
const staffToggle = document.getElementById('staffToggle');
const uploadSection = document.getElementById('uploadSection');
const verifySection = document.getElementById('verifySection');
const verifyInput = document.getElementById('verifyInput');
const verifyResult = document.getElementById('verifyResult');
const multiFileInput = document.getElementById('multiFileInput');
const plCheckBadge = document.getElementById('plCheckBadge');
const snCheckBadge = document.getElementById('snCheckBadge');
const stockAvailCheckBadge = document.getElementById('stockAvailCheckBadge');
const barcodeCheckBadge = document.getElementById('barcodeCheckBadge');
const rebornPriceCheckBadge = document.getElementById('rebornPriceCheckBadge');
const leasingCheckBadge = document.getElementById('leasingCheckBadge');

function setCheckBadge(el, state, text) {
  el.className = 'upload-check show ' + state; // state: 'ok' | 'bad' | 'loading'
  el.textContent = text;
}
let pendingPlRows = null,
  pendingPlName = null;
let pendingSnRows = null,
  pendingSnName = null;

// Data "Stock Available" cabang lain (di luar gudang kami / SDNC*).
// Sumbernya file terpisah (bukan PL/SN harian), tapi tetap diupload rutin tiap hari.
// Ini DIGABUNG (union, bukan menggantikan) dengan hasil deteksi cabang lain dari file SN,
// supaya barang yang tidak punya data serial number di SN (misalnya aksesoris non-serial)
// tetap bisa kedeteksi statusnya INDENT kalau memang ada stok di cabang lain.
let stockAvailMap = {}; // { itemCode: { whcode: qty } } — sudah dikecualikan whcode SDNC*
let stockAvailDesc = {}; // { itemCode: desc }
let stockAvailMeta = null; // { fileName, updatedAt }

const soLauncherSection = document.getElementById('soLauncherSection');
const soModalOverlay = document.getElementById('soModalOverlay');
const openSoModalBtn = document.getElementById('openSoModalBtn');
const closeSoModalBtn = document.getElementById('closeSoModalBtn');
const soFileInput = document.getElementById('soFileInput');
const soSummaryInfo = document.getElementById('soSummaryInfo');
const soGadgetInput = document.getElementById('soGadgetInput');
const soGadgetList = document.getElementById('soGadgetList');
const soGadgetStats = document.getElementById('soGadgetStats');
const soAccInput = document.getElementById('soAccInput');
const soAccContainer = document.getElementById('soAccContainer');
const soAccStats = document.getElementById('soAccStats');
const soItrContainer = document.getElementById('soItrContainer');
const soItrStats = document.getElementById('soItrStats');
const soSheetRow = document.getElementById('soSheetRow');
const soSheetSelect = document.getElementById('soSheetSelect');
let soSelectedSheet = null; // nama sheet (gudang) yang sedang dilihat di modal SO
