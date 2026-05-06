// ── Secure-context guard ──────────────────────────────────────────────────────
// Camera (getUserMedia) only works on HTTPS or localhost.
// If running as file:// the banner is shown and we stop here.
if (!window.isSecureContext) {
  document.getElementById("insecure-banner").style.display = "flex";
  // Hide the rest of the UI so nothing looks broken underneath
  document.getElementById("no-face").style.display = "none";
  throw new Error("Not a secure context — camera blocked.");
}

// ── Globals from MindAR CDN bundle ───────────────────────────────────────────
const { MindARThree } = window.MINDAR.FACE;
const { THREE } = window;

// ── PNG emotes — alternates every SWAP_INTERVAL ms ───────────────────────────
const PNG_EMOTES = [
  { src: "assets/emotes/bee.png",   label: "Bee" },
  { src: "assets/emotes/Jolli.png", label: "Jolli" },
];
const SWAP_INTERVAL = 1000; // milliseconds

// ── State ─────────────────────────────────────────────────────────────────────
let emoteSprite  = null;
let mindarThree  = null;
let faceVisible  = false;
const textures   = []; // loaded PNG textures

// ── Bounce animation state ────────────────────────────────────────────────────
let bounceT = 0;
const BOUNCE_SPEED = 2.2; // radians / second
const BOUNCE_AMP   = 0.04; // world units

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Load both PNG textures and return a promise that resolves when done.
 */
function loadTextures() {
  const loader = new THREE.TextureLoader();
  return Promise.all(
    PNG_EMOTES.map(
      (e) =>
        new Promise((resolve, reject) => {
          loader.load(e.src, resolve, undefined, reject);
        })
    )
  ).then((loaded) => loaded.forEach((t) => textures.push(t)));
}

/**
 * Start alternating the sprite texture every SWAP_INTERVAL ms.
 */
function startAlternating() {
  let idx = 0;
  setInterval(() => {
    idx = (idx + 1) % textures.length;
    emoteSprite.material.map = textures[idx];
    emoteSprite.material.needsUpdate = true;
    bounceT = 0; // pop on swap
  }, SWAP_INTERVAL);
}

/**
 * Flash the screen white and download a PNG of the AR view.
 */
function takeScreenshot() {
  const video    = document.querySelector("#container video");
  const glCanvas = document.querySelector("#container canvas");
  if (!video || !glCanvas) return;

  // White flash feedback
  const flash = document.getElementById("flash");
  if (flash) {
    flash.classList.remove("active");
    void flash.offsetWidth;
    flash.classList.add("active");
  }

  const out = document.createElement("canvas");
  out.width  = glCanvas.width;
  out.height = glCanvas.height;
  const ctx = out.getContext("2d");
  ctx.drawImage(video, 0, 0, out.width, out.height);
  ctx.drawImage(glCanvas, 0, 0);

  const link = document.createElement("a");
  link.download = `jollibee-ar-${Date.now()}.png`;
  link.href = out.toDataURL("image/png");
  link.click();
}

// ── Build UI (screenshot button only) ────────────────────────────────────────
function buildUI() {
  document.getElementById("snap-btn").addEventListener("click", takeScreenshot);
}

// ── No-face overlay helper ────────────────────────────────────────────────────
function setFaceVisible(visible) {
  if (faceVisible === visible) return;
  faceVisible = visible;
  const el = document.getElementById("no-face");
  el.classList.toggle("hidden", visible);
  emoteSprite.visible = visible;
}

// ── Main AR setup ─────────────────────────────────────────────────────────────
async function start() {
  mindarThree = new MindARThree({
    container: document.querySelector("#container"),
    filterMinCF: 0.001,
    filterBeta: 1000,
    uiLoading: "yes",
    uiScanning: "no",
    uiError: "yes",
  });

  const { renderer, scene, camera } = mindarThree;

  // Pixel ratio cap — keeps mobile GPU load reasonable
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  scene.add(new THREE.AmbientLight(0xffffff, 1.0));

  // ── Load PNG textures then build sprite ───────────────────────────────────
  await loadTextures();

  const material = new THREE.SpriteMaterial({
    map: textures[0],
    transparent: true,
    depthTest: false,
  });
  emoteSprite = new THREE.Sprite(material);
  emoteSprite.scale.set(0.45, 0.45, 0.45);
  emoteSprite.position.set(0, 0.15, 0);
  emoteSprite.visible = false; // hidden until face found

  // Start 1-second alternating loop
  startAlternating();

  // ── Face anchor — landmark 1 = forehead centre ────────────────────────────
  const anchor = mindarThree.addAnchor(1);
  anchor.group.add(emoteSprite);

  anchor.onTargetFound = () => setFaceVisible(true);
  anchor.onTargetLost  = () => setFaceVisible(false);

  // ── Render loop with bounce animation ─────────────────────────────────────
  let lastTime = performance.now();
  renderer.setAnimationLoop(() => {
    const now   = performance.now();
    const delta = (now - lastTime) / 1000; // seconds
    lastTime = now;

    if (faceVisible) {
      bounceT += delta * BOUNCE_SPEED;
      emoteSprite.position.y = 0.15 + Math.sin(bounceT) * BOUNCE_AMP;
    }

    renderer.render(scene, camera);
  });

  await mindarThree.start();
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
buildUI();
// Inject flash div
const flash = document.createElement("div");
flash.id = "flash";
document.body.appendChild(flash);

start().catch((err) => {
  console.error("MindAR failed to start:", err);
  const noFace = document.getElementById("no-face");
  noFace.querySelector("span").textContent = "⚠️";
  noFace.querySelector("p").textContent = "Camera access denied or HTTPS required";
});
