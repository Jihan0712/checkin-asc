// ar.js — MindAR speech bubble overlay
// Registers the "speech-bubble" A-Frame component.
// Dispatches "ar-ready" on document when face tracking is live.

var DEFAULT_HASHTAG = '#MaySayKaRito';
var DEFAULT_COLOR   = '#F47B20';

// ── SpeechBubble ──────────────────────────────────────────────────────────────

function SpeechBubble() {
  this._canvas  = null;
  this._ctx     = null;
  this._texture = null;
  this._mesh    = null;
}

function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

SpeechBubble.prototype._draw = function (hashtag, color) {
  var ctx = this._ctx;
  var W = 256, H = 128, bodyH = 96, r = 14;
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = '#ffffff';
  _roundRect(ctx, 4, 4, W - 8, bodyH, r);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(W / 2 - 12, bodyH + 4);
  ctx.lineTo(W / 2 + 12, bodyH + 4);
  ctx.lineTo(W / 2, H - 4);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.fillStyle = color;
  ctx.font = 'bold 30px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(hashtag, W / 2, bodyH / 2 + 4, W - 24);
};

SpeechBubble.prototype.init = function (anchorEl) {
  var THREE = AFRAME.THREE;

  this._canvas         = document.createElement('canvas');
  this._canvas.width   = 256;
  this._canvas.height  = 128;
  this._ctx            = this._canvas.getContext('2d');
  this._draw(DEFAULT_HASHTAG, DEFAULT_COLOR);

  this._texture = new THREE.CanvasTexture(this._canvas);
  var geo = new THREE.PlaneGeometry(0.55, 0.275);
  var mat = new THREE.MeshBasicMaterial({
    map: this._texture,
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  this._mesh = new THREE.Mesh(geo, mat);
  this._mesh.position.set(0, 0.72, 0.05);
  anchorEl.object3D.add(this._mesh);
};

SpeechBubble.prototype.setOrg = function (org) {
  if (!this._texture) return;
  this._draw(org.hashtag, org.color);
  this._texture.needsUpdate = true;
};

SpeechBubble.prototype.setDefault = function () {
  if (!this._texture) return;
  this._draw(DEFAULT_HASHTAG, DEFAULT_COLOR);
  this._texture.needsUpdate = true;
};

SpeechBubble.prototype.setVisible = function (visible) {
  if (this._mesh) this._mesh.visible = visible;
};

// ── A-Frame component ─────────────────────────────────────────────────────────

var _bubble = new SpeechBubble();

AFRAME.registerComponent('speech-bubble', {
  init: function () {
    this.el.sceneEl.addEventListener('arReady', function () {
      var anchor = document.getElementById('anchor-168');
      if (anchor) _bubble.init(anchor);
      document.dispatchEvent(new CustomEvent('ar-ready'));
    });

    document.addEventListener('org-change', function (e) {
      if (e.detail) { _bubble.setOrg(e.detail); }
      else          { _bubble.setDefault(); }
    });
  },

  tick: function () {
    var anchor = document.getElementById('anchor-168');
    if (anchor) _bubble.setVisible(anchor.object3D.visible);
  }
});
