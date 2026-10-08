// Pengaturan Nota Digital — EDIT FILE INI untuk:
//  - mengganti nama toko / data perusahaan yang tercetak di nota
//  - menambah atau menghapus nama sales (daftar pilihan "Nama sales" di form nota)
//  - mengubah teks catatan di bagian bawah nota

const NOTA_STORE = {
  name: 'Gadgetmart Sungai Danau', // otomatis tertulis di semua nota
  company: 'PT. SINAR JAYA SELULAR',
  address: 'JL BELITUNG LAUT RT 006 RW 001',
  npwp: 'NPWP: 10.951.343.2-731.000',
};

// Daftar pilihan nama sales (tampil urut seperti di bawah). Tambah satu baris per orang,
// diawali tanda kutip dan diakhiri koma. Tulis sama seperti di SAP supaya konsisten, mis.:
//   'FL.SDNC.03 - SITI HAN',
const NOTA_SALES_NAMES = [
  'FL.SDNC.03 - SITI HAN', // <- lengkapi nama sesuai SAP, lalu tambahkan nama lain di bawahnya
];

// true  = ada pilihan "Lainnya (ketik manual)" di bawah daftar nama
// false = hanya boleh memilih dari daftar di atas
const NOTA_ALLOW_MANUAL_NAME = true;

// Teks di bagian bawah gambar nota
const NOTA_PRINT = {
  checkNote: 'Mohon periksa kembali & pastikan barang yang anda beli dalam keadaan mulus & lengkap',
  signatures: ['Hormat kami,', 'Penerima,', 'Pemeriksa,'],
  taxNote: 'Harga diatas sudah termasuk pajak',
};
