// Tunggu hingga seluruh HTML selesai dimuat
document.addEventListener('DOMContentLoaded', () => {
    inisialisasiAplikasi();
});

// Fungsi utama untuk menjalankan semua event
function inisialisasiAplikasi() {
    setupDragAndDrop();
    setupTombolNota();
}

// --- Logika Drag & Drop CSV ---
function setupDragAndDrop() {
    const dropZone = document.getElementById('drop-zone');

    if (!dropZone) return;

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault(); 
        dropZone.classList.add('drag-active');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-active');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-active');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            
            // Validasi apakah file yang di-drop adalah CSV
            if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
                bacaFileCSV(file);
            } else {
                alert("Mohon unggah file dengan format .csv");
            }
        }
    });
}

// --- Fungsi Membaca File CSV ---
function bacaFileCSV(file) {
    const reader = new FileReader(); // Fitur HTML5 untuk membaca file

    // Event ini dipicu saat file selesai dibaca
    reader.onload = function(e) {
        const textCSV = e.target.result;
        prosesDataCSV(textCSV);
    };

    // Event jika terjadi error saat membaca file
    reader.onerror = function() {
        alert("Gagal membaca file CSV.");
    };

    // Mulai membaca file sebagai teks
    reader.readAsText(file);
}

// --- Fungsi Memisahkan Teks CSV ke dalam Array ---
function prosesDataCSV(textCSV) {
    // Memecah teks berdasarkan baris baru (enter)
    // Menghapus spasi/enter kosong di akhir file menggunakan .trim()
    const baris = textCSV.trim().split('\n');
    
    const dataStok = [];

    // Looping setiap baris, abaikan baris pertama (index 0) jika itu adalah header kolom dari SAP
    for (let i = 1; i < baris.length; i++) {
        // Memecah setiap baris berdasarkan koma (,). Jika CSV dari SAP menggunakan titik koma (;), ganti parameter ini.
        const kolom = baris[i].split(','); 
        
        // Memastikan baris tidak kosong
        if (kolom.length >= 4) {
            dataStok.push({
                kode: kolom[0].trim(),
                deskripsi: kolom[1].trim(),
                stok: kolom[2].trim(),
                gudang: kolom[3].trim()
            });
        }
    }

    tampilkanKeTabel(dataStok);
}

// --- Fungsi Menampilkan Data ke Tabel HTML ---
function tampilkanKeTabel(data) {
    const tbody = document.getElementById('data-stok-body');
    tbody.innerHTML = ''; // Bersihkan tabel sebelum memasukkan data baru

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Tidak ada data ditemukan</td></tr>';
        return;
    }

    data.forEach(item => {
        // Buat baris baru
        const tr = document.createElement('tr');

        // Isi kolom
        tr.innerHTML = `
            <td>${item.kode}</td>
            <td>${item.deskripsi}</td>
            <td>${item.stok}</td>
            <td>${item.gudang}</td>
        `;

        // Masukkan baris ke dalam tabel
        tbody.appendChild(tr);
    });
}

// --- Logika Nota (Belum Berubah) ---
function setupTombolNota() {
    const btnPelanggan = document.getElementById('btn-nota-pelanggan');
    const btnStaf = document.getElementById('btn-nota-staf');

    btnPelanggan?.addEventListener('click', () => {
        buatDanCetakNota('pelanggan');
    });

    btnStaf?.addEventListener('click', () => {
        buatDanCetakNota('staf');
    });
}

function buatDanCetakNota(tipe) {
    const printArea = document.getElementById('print-area');
    
    if (tipe === 'pelanggan') {
        printArea.innerHTML = `<h2>Nota Pelanggan (Draft)</h2><p>Terima kasih atas pesanannya.</p>`;
    } else {
        printArea.innerHTML = `<h2>Nota Internal Staf (Draft)</h2><p>Gudang: SDNC</p>`;
    }

    window.print();
}
