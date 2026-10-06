// Tombol ganti mode terang/gelap
(function () {
  var root = document.documentElement;
  var btn = document.getElementById('themeToggle');
  var meta = document.querySelector('meta[name="theme-color"]');
  function paint(t) {
    root.setAttribute('data-theme', t);
    if (meta) meta.setAttribute('content', t === 'light' ? '#F3F5F9' : '#181B22');
    if (btn) {
      var label = t === 'light' ? 'Ganti ke mode gelap' : 'Ganti ke mode terang';
      btn.setAttribute('aria-label', label);
      btn.title = label;
    }
  }
  paint(root.getAttribute('data-theme') || 'dark');
  if (btn)
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.classList.add('theme-anim');
      paint(next);
      try {
        localStorage.setItem('theme', next);
      } catch (e) {}
      setTimeout(function () {
        root.classList.remove('theme-anim');
      }, 350);
    });
  // Selama belum memilih manual, ikuti pengaturan terang/gelap perangkat
  if (window.matchMedia) {
    var mq = matchMedia('(prefers-color-scheme: light)');
    var onChange = function (e) {
      var saved = null;
      try {
        saved = localStorage.getItem('theme');
      } catch (_) {}
      if (!saved) paint(e.matches ? 'light' : 'dark');
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
})();
