/**
 * capture.js — photo & video capture
 *
 * Strategy:
 *  - Composite canvas kept current by a RAF bg loop (video + GL + header)
 *  - takePhoto: force Three.js re-render, redraw composite, then toBlob()
 *  - startRecording: same RAF loop drives captureStream
 *  - Buttons are DOM elements — never in the capture
 */

var _facing = sessionStorage.getItem('cameraFacing') || 'user';

// Header preloaded once (crossOrigin prevents canvas taint on Chrome)
var _hdr = new Image();
_hdr.crossOrigin = 'anonymous';
_hdr.src = 'assets/header.png';

// Composite canvas state
var _comp  = null;
var _ctx   = null;
var _bgId  = null;

function _gl()    { return document.querySelector('a-scene canvas') || document.querySelector('canvas.a-canvas'); }
function _video() { return document.querySelector('video'); }

// Cover-crop src into (dx,dy,dw,dh) — matches CSS object-fit:cover
function _drawCover(src, dx, dy, dw, dh) {
  var sw = src.videoWidth  || src.naturalWidth  || src.width  || 0;
  var sh = src.videoHeight || src.naturalHeight || src.height || 0;
  if (!sw || !sh) return;
  var sr = sw / sh, dr = dw / dh;
  var sx, sy, sW, sH;
  if (sr > dr) { sH = sh; sW = sh * dr; sx = (sw - sW) / 2; sy = 0; }
  else          { sW = sw; sH = sw / dr; sx = 0;             sy = (sh - sH) / 2; }
  _ctx.drawImage(src, sx, sy, sW, sH, dx, dy, dw, dh);
}

// ── Canvas helpers ────────────────────────────────────────────────────────────

function _ensureComp() {
  // Use the GL canvas size as the source of truth so the emote's scale/ratio
  // matches exactly what A-Frame renders — regardless of DPR caps or
  // momentary innerHeight changes when browser chrome shows/hides.
  var gl = _gl();
  var w, h;
  if (gl && gl.width && gl.height) {
    w = gl.width;
    h = gl.height;
  } else {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = Math.round(window.innerWidth  * dpr);
    h = Math.round(window.innerHeight * dpr);
  }
  if (!_comp || _comp.width !== w || _comp.height !== h) {
    _comp = document.createElement('canvas');
    _comp.width  = w;
    _comp.height = h;
    _ctx  = _comp.getContext('2d');
  }
  return _comp;
}

// Draw one composite frame into _comp
function _drawFrame() {
  _ensureComp();
  var gl    = _gl();
  var video = _video();
  var w     = _comp.width;
  var h     = _comp.height;
  _ctx.clearRect(0, 0, w, h);

  // A-Frame embedded uses alpha:true — the GL canvas is transparent except for
  // the emote. MindAR displays the camera feed as a plain <video> element behind
  // the GL canvas. So we must draw video first, then GL on top.
  //
  // Front camera: MindAR renders the emote already in selfie-mirrored coords
  //   → flip video to match, draw GL as-is.
  // Back camera: AR container has CSS scaleX(-1); video is inside it so it's
  //   also CSS-flipped on screen. Raw video pixels are unflipped, GL coords
  //   are unflipped → flip both to match what's on screen.

  if (_facing === 'environment') {
    // Back camera: raw video pixels are unflipped — draw straight.
    // GL is mirrored internally by MindAR (to compensate for CSS scaleX(-1)),
    // so flip it back. The back_bee/back_jolli textures are pre-mirrored,
    // so after the flip they appear correct.
    if (video && video.readyState >= 2) { _drawCover(video, 0, 0, w, h); }
    if (gl) {
      _ctx.save();
      _ctx.translate(w, 0); _ctx.scale(-1, 1);
      _ctx.drawImage(gl, 0, 0, w, h);
      _ctx.restore();
    }
  } else {
    // Front camera: MindAR mirrors the emote in GL space for selfie view.
    // Flip the video to match so both layers are consistently mirrored.
    if (video && video.readyState >= 2) {
      _ctx.save();
      _ctx.translate(w, 0); _ctx.scale(-1, 1);
      _drawCover(video, 0, 0, w, h);
      _ctx.restore();
    }
    if (gl) { _ctx.drawImage(gl, 0, 0, w, h); }
  }

  // Header baked at its exact on-screen position.
  // Use the GL canvas's own pixel density so the header scales consistently
  // with the rest of the composite (header is NOT adjusted — only emote fix).
  if (_hdr.complete && _hdr.naturalWidth > 0) {
    var el = document.querySelector('#top-bar img');
    if (el) {
      var r      = el.getBoundingClientRect();
      var cont   = document.querySelector('.ar-container') || document.querySelector('a-scene');
      var cliW   = cont ? cont.clientWidth : window.innerWidth;
      var glDPR  = (gl && gl.width && cliW) ? (gl.width / cliW) : Math.min(window.devicePixelRatio || 1, 2);
      _ctx.drawImage(_hdr, r.left * glDPR, r.top * glDPR, r.width * glDPR, r.height * glDPR);
    }
  }
}

function _download(blob, ext) {
  var url = URL.createObjectURL(blob);
  var a   = document.createElement('a');
  a.href = url;
  a.download = 'jollibeeAR-' + Date.now() + '.' + ext;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
}

// ── CaptureController ─────────────────────────────────────────────────────────

function CaptureController() {
  this._recorder  = null;
  this._chunks    = [];
  this._recRafId  = null;
  this._recording = false;
}

// Called when AR is ready — start keeping composite canvas current
CaptureController.prototype.startBgLoop = function () {
  if (_bgId) return;
  _ensureComp();
  var loop = function () { _drawFrame(); _bgId = requestAnimationFrame(loop); };
  _bgId = requestAnimationFrame(loop);
};

// ── Photo ─────────────────────────────────────────────────────────────────────

CaptureController.prototype.takePhoto = function () {
  // The bg loop keeps _comp current (GL canvas = video + emote from MindAR's
  // own render loop). Just grab the latest frame — do NOT force a manual
  // render, which would overwrite the GL buffer without MindAR's video pass.
  if (!_comp) return;
  _comp.toBlob(function (blob) {
    if (blob) _download(blob, 'jpg');
  }, 'image/jpeg', 0.92);
};

// ── Video ─────────────────────────────────────────────────────────────────────

CaptureController.prototype.startRecording = function () {
  if (this._recording) return;
  if (typeof MediaRecorder === 'undefined') {
    alert('Video recording is not supported in this browser.'); return;
  }

  // Pause bg loop; recording RAF takes over
  if (_bgId) { cancelAnimationFrame(_bgId); _bgId = null; }
  _ensureComp();

  var stream;
  try {
    stream = _comp.captureStream ? _comp.captureStream(30) : _comp.mozCaptureStream(30);
  } catch (e) { alert('captureStream not supported.'); this.startBgLoop(); return; }

  var types = ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4;codecs=avc1','video/mp4'];
  // Use the iOS compat helper if present (iosAR.html injects it); it puts
  // mp4 ahead of webm on Safari. Fall back to iterating candidates ourselves.
  var mime = (typeof window.AR_getBestMimeType === 'function')
    ? window.AR_getBestMimeType()
    : (function () {
        for (var i = 0; i < types.length; i++) {
          try { if (MediaRecorder.isTypeSupported(types[i])) return types[i]; } catch(e) {}
        }
        return '';
      })();

  var rec;
  try { rec = new MediaRecorder(stream, mime ? { mimeType: mime } : {}); }
  catch (e) { alert('MediaRecorder error: ' + e.message); this.startBgLoop(); return; }

  this._chunks   = [];
  this._recorder = rec;
  this._recording = true;
  var self = this;

  rec.ondataavailable = function (e) {
    if (e.data && e.data.size > 0) self._chunks.push(e.data);
  };

  var loop = function () {
    if (!self._recording) return;
    _drawFrame();
    self._recRafId = requestAnimationFrame(loop);
  };
  self._recRafId = requestAnimationFrame(loop);
  rec.start();
};

CaptureController.prototype.stopRecording = function () {
  if (!this._recording || !this._recorder) return;
  this._recording = false;
  if (this._recRafId) { cancelAnimationFrame(this._recRafId); this._recRafId = null; }
  var self = this;
  var rec  = this._recorder;
  setTimeout(function () {
    try { rec.requestData(); } catch (e) {}
    setTimeout(function () {
      rec.onstop = function () {
        var mimeType = rec.mimeType || 'video/webm';
        var ext = mimeType.indexOf('mp4') !== -1 ? 'mp4' : 'webm';
        _download(new Blob(self._chunks, { type: mimeType }), ext);
        self._chunks = []; self._recorder = null;
        self.startBgLoop(); // resume bg loop
      };
      rec.stop();
    }, 100);
  }, 600);
};

export { CaptureController };
