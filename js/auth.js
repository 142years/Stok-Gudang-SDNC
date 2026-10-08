// PIN & mode Staff Gudang
const pinOverlay = document.getElementById('pinOverlay');
const pinInput = document.getElementById('pinInput');
const pinError = document.getElementById('pinError');
const pinSubmit = document.getElementById('pinSubmit');
const pinCancel = document.getElementById('pinCancel');

function openPinModal() {
  pinInput.value = '';
  pinError.textContent = '';
  pinOverlay.classList.add('show');
  pinInput.focus();
}
function closePinModal() {
  pinOverlay.classList.remove('show');
}
function enterStaffMode() {
  staffMode = true;
  uploadSection.classList.add('show');
  verifySection.classList.add('show');
  soLauncherSection.classList.add('show');
  staffToggle.classList.add('active');
  staffToggle.textContent = 'Keluar Mode Staff';
  closePinModal();
  doSearch();
  renderSoModules();
  if (typeof notaOnModeChange === 'function') notaOnModeChange();
}
function checkPin() {
  if (pinInput.value === STAFF_PIN) {
    enterStaffMode();
  } else {
    pinError.textContent = 'PIN salah, coba lagi.';
    pinInput.value = '';
    pinInput.focus();
  }
}
pinSubmit.addEventListener('click', checkPin);
pinCancel.addEventListener('click', closePinModal);
pinInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') checkPin();
});

staffToggle.addEventListener('click', function () {
  if (staffMode) {
    staffMode = false;
    uploadSection.classList.remove('show');
    verifySection.classList.remove('show');
    soLauncherSection.classList.remove('show');
    soModalOverlay.classList.remove('show');
    staffToggle.classList.remove('active');
    staffToggle.textContent = 'Staff Gudang';
    doSearch();
    if (typeof notaOnModeChange === 'function') notaOnModeChange();
    return;
  }
  openPinModal();
});

openSoModalBtn.addEventListener('click', function () {
  soModalOverlay.classList.add('show');
  renderSoModules();
});
closeSoModalBtn.addEventListener('click', function () {
  soModalOverlay.classList.remove('show');
});
soModalOverlay.addEventListener('click', function (e) {
  if (e.target === soModalOverlay) soModalOverlay.classList.remove('show');
});

document.querySelectorAll('.so-tab').forEach((tab) => {
  tab.addEventListener('click', function () {
    document.querySelectorAll('.so-tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.so-panel').forEach((p) => p.classList.remove('active'));
    this.classList.add('active');
    document.getElementById(this.getAttribute('data-target')).classList.add('active');
  });
});
