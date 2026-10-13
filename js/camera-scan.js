// Scan barcode lewat kamera HP (memakai BarcodeDetector bawaan browser; tombol hanya muncul bila didukung).
(function () {
  const btn = document.getElementById('camBtn');
  const overlay = document.getElementById('camOverlay');
  const video = document.getElementById('camVideo');
  const msg = document.getElementById('camMsg');
  if (!btn || !overlay || !video) return;
  const supported = !!(window.BarcodeDetector && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  if (!supported) return; // tombol tetap tersembunyi (mis. iPhone/Safari belum mendukung)
  btn.hidden = false;
  let stream = null,
    timer = null,
    detector = null,
    busy = false;

  function stop() {
    clearInterval(timer);
    timer = null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
    overlay.classList.remove('show');
    document.documentElement.classList.remove('cam-open');
  }
  async function open() {
    overlay.classList.add('show');
    document.documentElement.classList.add('cam-open');
    msg.textContent = 'Membuka kamera…';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      video.srcObject = stream;
      await video.play();
      let formats;
      try {
        const sup = await BarcodeDetector.getSupportedFormats();
        formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'qr_code'].filter((f) => sup.includes(f));
      } catch (e) {}
      detector = formats && formats.length ? new BarcodeDetector({ formats }) : new BarcodeDetector();
      msg.textContent = 'Arahkan kamera ke barcode';
      timer = setInterval(async () => {
        if (busy || video.readyState < 2) return;
        busy = true;
        try {
          const found = await detector.detect(video);
          if (found && found.length && found[0].rawValue) {
            const v = found[0].rawValue;
            stop();
            runScan(v);
          }
        } catch (e) {
        } finally {
          busy = false;
        }
      }, 200);
    } catch (e) {
      msg.textContent =
        e && e.name === 'NotAllowedError' ? 'Izin kamera ditolak. Izinkan kamera di pengaturan browser, lalu coba lagi.' : 'Kamera tidak bisa dibuka: ' + ((e && e.message) || e);
    }
  }
  btn.addEventListener('click', open);
  document.getElementById('camClose').addEventListener('click', stop);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('show')) stop();
  });
  window.camIsOpen = () => overlay.classList.contains('show');
})();
