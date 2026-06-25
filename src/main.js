import { CaptureController } from './capture.js';
import { AppState, ORGS, showScreen, resetState } from './app.js';
import { saveLocally, submitToBackend, syncQueue } from './checkinService.js';

var capture = new CaptureController();

if (navigator.onLine) syncQueue();

document.addEventListener('ar-ready', function () {
  capture.startBgLoop();
  setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 200);
});
setTimeout(function () { capture.startBgLoop(); }, 4000);

// ── Org filter row ────────────────────────────────────────────────────────────

var orgRow = document.getElementById('org-filter-row');
ORGS.forEach(function (org) {
  var btn = document.createElement('button');
  btn.className = 'org-btn';
  btn.textContent = org.name;
  btn.setAttribute('data-org-id', org.id);
  btn.addEventListener('click', function () {
    document.querySelectorAll('.org-btn').forEach(function (b) {
      b.classList.remove('org-btn--selected');
    });
    btn.classList.add('org-btn--selected');
    AppState.selectedOrg = org;
    document.dispatchEvent(new CustomEvent('org-change', { detail: org }));
    var companyField = document.getElementById('field-company');
    if (companyField) companyField.value = org.name;
  });
  if (orgRow) orgRow.appendChild(btn);
});

// ── Landing ───────────────────────────────────────────────────────────────────

document.getElementById('btn-start').addEventListener('click', function () {
  showScreen('permission');
});

// ── Permission ────────────────────────────────────────────────────────────────

document.getElementById('btn-accept').addEventListener('click', function () {
  showScreen('camera');
});

document.getElementById('btn-cancel-permission').addEventListener('click', function () {
  showScreen('landing');
});

// ── Camera ────────────────────────────────────────────────────────────────────

var captureBtn = document.getElementById('capture-btn');
var cameraBtn  = document.getElementById('camera-btn');

captureBtn.addEventListener('click', function () {
  capture.takePhoto();
  flashCapture();
});

function flashCapture() {
  var flash = document.createElement('div');
  flash.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0.55;pointer-events:none;z-index:200;transition:opacity 0.25s ease';
  document.body.appendChild(flash);
  flash.getBoundingClientRect();
  flash.style.opacity = '0';
  flash.addEventListener('transitionend', function () { document.body.removeChild(flash); });
}

cameraBtn.addEventListener('click', function () {
  var current = sessionStorage.getItem('cameraFacing') || 'user';
  var next = current === 'user' ? 'environment' : 'user';
  sessionStorage.setItem('cameraFacing', next);

  function stopAndReload() {
    document.querySelectorAll('video').forEach(function (v) {
      v.pause();
      if (v.srcObject) { v.srcObject.getTracks().forEach(function (t) { t.stop(); }); v.srcObject = null; }
    });
    setTimeout(function () { location.reload(); }, 500);
  }

  if (next === 'environment' && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    navigator.mediaDevices.enumerateDevices()
      .then(function (devices) {
        var inputs = devices.filter(function (d) { return d.kind === 'videoinput'; });
        var back = inputs.find(function (d) { return /back|rear|environment/i.test(d.label); }) || inputs[inputs.length - 1];
        if (back && back.deviceId) { sessionStorage.setItem('backCameraDeviceId', back.deviceId); }
        else { sessionStorage.removeItem('backCameraDeviceId'); }
        stopAndReload();
      })
      .catch(function () { sessionStorage.removeItem('backCameraDeviceId'); stopAndReload(); });
  } else {
    sessionStorage.removeItem('backCameraDeviceId');
    stopAndReload();
  }
});

// ── Review ────────────────────────────────────────────────────────────────────

document.getElementById('btn-use-photo').addEventListener('click', function () {
  var companyField = document.getElementById('field-company');
  if (companyField && AppState.selectedOrg) companyField.value = AppState.selectedOrg.name;
  showScreen('form');
});

document.getElementById('btn-retake').addEventListener('click', function () {
  if (AppState.capturedUrl) { URL.revokeObjectURL(AppState.capturedUrl); }
  AppState.capturedBlob = null;
  AppState.capturedUrl  = null;
  showScreen('camera');
});

document.getElementById('btn-download').addEventListener('click', function () {
  if (!AppState.capturedUrl) return;
  var a = document.createElement('a');
  a.href = AppState.capturedUrl;
  a.download = 'MaySayKaRito-' + Date.now() + '.jpg';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
});

document.getElementById('btn-share').addEventListener('click', function () {
  if (!AppState.capturedBlob) return;
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [] })) {
    var file = new File([AppState.capturedBlob], 'MaySayKaRito.jpg', { type: 'image/jpeg' });
    navigator.share({ title: '#MaySayKaRito', files: [file] }).catch(function () {});
  } else if (navigator.share) {
    navigator.share({ title: '#MaySayKaRito', url: location.href }).catch(function () {});
  }
});

// ── Form ──────────────────────────────────────────────────────────────────────

document.getElementById('btn-go-back').addEventListener('click', function () {
  showScreen('review');
});

document.getElementById('registration-form').addEventListener('submit', function (e) {
  e.preventDefault();
  var firstName = document.getElementById('field-firstname').value.trim();
  var lastName  = document.getElementById('field-lastname').value.trim();
  var email     = document.getElementById('field-email').value.trim();
  var company   = document.getElementById('field-company').value.trim();
  var errEl     = document.getElementById('form-error');

  if (!firstName || !lastName) {
    errEl.textContent = 'Please enter your first and last name.'; return;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errEl.textContent = 'Please enter a valid email address.'; return;
  }
  errEl.textContent = '';
  AppState.form = { firstName: firstName, lastName: lastName, email: email, company: company };

  document.getElementById('confirmation-name').textContent    = firstName + ' ' + lastName;
  document.getElementById('confirmation-company').textContent = company;

  var submitBtn = document.getElementById('btn-submit');
  submitBtn.textContent = 'Submitting…';
  submitBtn.disabled    = true;

  function doSubmit(geoMeta) {
    var facing = sessionStorage.getItem('cameraFacing') || 'user';
    var meta   = Object.assign({}, AppState.form, geoMeta || {});
    saveLocally(AppState.capturedBlob, facing, meta);
    submitToBackend(AppState.capturedBlob, facing, meta)
      .then(function () {
        submitBtn.textContent = 'SUBMIT';
        submitBtn.disabled    = false;
        showScreen('confirmation');
      })
      .catch(function () {
        errEl.textContent     = 'Submission failed. Check your connection and try again.';
        submitBtn.textContent = 'SUBMIT';
        submitBtn.disabled    = false;
      });
  }

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      function (pos) { doSubmit({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }); },
      function ()    { doSubmit(); },
      { timeout: 3000 }
    );
  } else {
    doSubmit();
  }
});

// ── Confirmation ──────────────────────────────────────────────────────────────

document.getElementById('btn-open-camera').addEventListener('click', function () {
  resetState();
  ['field-firstname','field-lastname','field-email','field-company'].forEach(function (id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });
  document.querySelectorAll('.org-btn').forEach(function (b) { b.classList.remove('org-btn--selected'); });
  document.dispatchEvent(new CustomEvent('org-change', { detail: null }));
  showScreen('landing');
});

// ── Resize ────────────────────────────────────────────────────────────────────

window.addEventListener('resize', function () {
  var scene = document.querySelector('a-scene');
  if (scene && scene.resize) scene.resize();
});
