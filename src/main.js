/**
 * main.js — Bootstrap module
 * Wires UI buttons to CaptureController after AR is ready.
 */

import { CaptureController } from './capture.js';

var capture = new CaptureController();
var holdTimer = null;
var isRecording = false;

// Start bg loop when AR is ready; 4s fallback if event never fires
document.addEventListener('ar-ready', function () {
  capture.startBgLoop();
  // Chrome: give MindAR 200ms to finish setting its projection matrix, then
  // dispatch a synthetic resize. This causes A-Frame to resize its renderer
  // AND triggers MindAR's own resize handlers so the projection recalibrates
  // to the actual viewport — fixing emote misplacement on Chrome.
  setTimeout(function () {
    window.dispatchEvent(new Event('resize'));
  }, 200);
});
setTimeout(function () { capture.startBgLoop(); }, 4000);

var captureBtn    = document.getElementById('capture-btn');
var captureInner  = document.getElementById('capture-inner');
var recBadge      = document.getElementById('rec-badge');
var cameraBtn     = document.getElementById('camera-btn');
var shareBtn      = document.getElementById('share-btn');
var shareOverlay  = document.getElementById('share-overlay');
var shareClose    = document.getElementById('share-close');

// ── Capture button ────────────────────────────────────────────────────────────

captureBtn.addEventListener('pointerdown', function (e) {
  e.preventDefault();
  if (isRecording) return;

  holdTimer = setTimeout(function () {
    holdTimer = null;
    isRecording = true;
    captureBtn.classList.add('recording');
    recBadge.style.display = 'block';
    capture.startRecording();
  }, 300);
});

captureBtn.addEventListener('pointerup', function (e) {
  e.preventDefault();

  if (holdTimer !== null) {
    // Released before hold threshold → take photo
    clearTimeout(holdTimer);
    holdTimer = null;
    if (!isRecording) {
      capture.takePhoto();
      flashCapture();
    }
    return;
  }

  if (isRecording) {
    isRecording = false;
    captureBtn.classList.remove('recording');
    recBadge.style.display = 'none';
    capture.stopRecording();
  }
});

captureBtn.addEventListener('pointercancel', function () {
  if (holdTimer !== null) { clearTimeout(holdTimer); holdTimer = null; }
  if (isRecording) {
    isRecording = false;
    captureBtn.classList.remove('recording');
    recBadge.style.display = 'none';
    capture.stopRecording();
  }
});

// ── Flash feedback on photo ───────────────────────────────────────────────────

function flashCapture() {
  var flash = document.createElement('div');
  flash.style.cssText = [
    'position:fixed', 'top:0', 'right:0', 'bottom:0', 'left:0',
    'background:#fff', 'opacity:0.55', 'pointer-events:none', 'z-index:200',
    'transition:opacity 0.25s ease'
  ].join(';');
  document.body.appendChild(flash);
  // Trigger reflow then fade out
  flash.getBoundingClientRect();
  flash.style.opacity = '0';
  flash.addEventListener('transitionend', function () {
    document.body.removeChild(flash);
  });
}

// ── Camera toggle ─────────────────────────────────────────────────────────────

cameraBtn.addEventListener('click', function () {
  var current = sessionStorage.getItem('cameraFacing') || 'user';
  var next = current === 'user' ? 'environment' : 'user';
  sessionStorage.setItem('cameraFacing', next);

  function _stopAndReload() {
    document.querySelectorAll('video').forEach(function (v) {
      v.pause();
      if (v.srcObject) {
        v.srcObject.getTracks().forEach(function (t) { t.stop(); });
        v.srcObject = null;
      }
    });
    // Give iOS 500ms to physically release the hardware camera lock.
    setTimeout(function () { location.reload(); }, 500);
  }

  // While the front camera is still active iOS will expose device labels.
  // Enumerate now to get the back camera's exact deviceId — using deviceId
  // is far more reliable than facingMode: {exact:'environment'} on iOS Safari.
  if (next === 'environment' && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    navigator.mediaDevices.enumerateDevices()
      .then(function (devices) {
        var videoInputs = devices.filter(function (d) { return d.kind === 'videoinput'; });
        var backCam = videoInputs.find(function (d) {
          return /back|rear|environment/i.test(d.label);
        }) || videoInputs[videoInputs.length - 1]; // last device is usually back
        if (backCam && backCam.deviceId) {
          sessionStorage.setItem('backCameraDeviceId', backCam.deviceId);
        } else {
          sessionStorage.removeItem('backCameraDeviceId');
        }
        _stopAndReload();
      })
      .catch(function () {
        sessionStorage.removeItem('backCameraDeviceId');
        _stopAndReload();
      });
  } else {
    sessionStorage.removeItem('backCameraDeviceId');
    _stopAndReload();
  }
});

// ── Share button ──────────────────────────────────────────────────────────────

shareBtn.addEventListener('click', function () {
  var shareData = {
    title: 'JollibeeAR',
    url: location.href
  };
  if (navigator.share) {
    navigator.share(shareData).catch(function () {});
  } else {
    shareOverlay.classList.add('visible');
  }
});

shareClose.addEventListener('click', function () {
  shareOverlay.classList.remove('visible');
});

shareOverlay.addEventListener('click', function (e) {
  if (e.target === shareOverlay) {
    shareOverlay.classList.remove('visible');
  }
});

// ── Chrome resize handling ────────────────────────────────────────────────────

window.addEventListener('resize', function () {
  var scene = document.querySelector('a-scene');
  // Use scene.resize() rather than renderer.setSize() directly:
  // A-Frame updates both the GL canvas and the camera component, then
  // MindAR overrides the camera projection on the next tick with its
  // own calibration — keeping the AR overlay correctly placed.
  if (scene && scene.resize) { scene.resize(); }
});
