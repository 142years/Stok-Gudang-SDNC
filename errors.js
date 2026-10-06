// Banner merah bila ada error JavaScript (dimuat paling awal)
(function () {
  function showError(msg) {
    let el = document.getElementById('debugBanner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'debugBanner';
      el.style.cssText =
        'position:sticky;top:0;z-index:999;background:#C0392B;color:#fff;padding:10px 14px;font-size:13px;font-family:monospace;white-space:pre-wrap;';
      document.body.insertBefore(el, document.body.firstChild);
    }
    el.textContent = 'ERROR: ' + msg;
  }
  window.addEventListener('error', function (e) {
    showError(e.message + ' (line ' + e.lineno + ')');
  });
  window.__showError = showError;
})();
