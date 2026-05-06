// ── Secure-context guard ──────────────────────────────────────────────────────
// getUserMedia (camera) only works on HTTPS or localhost, not file://
if (!window.isSecureContext) {
  document.getElementById("insecure-banner").style.display = "flex";
  throw new Error("Not a secure context — camera blocked.");
}

// ── Config ────────────────────────────────────────────────────────────────────
const SWAP_INTERVAL = 1000; // ms between emote swaps

// ── Bootstrap ─────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const beeImg   = document.getElementById("bee-img");
  const jolliImg = document.getElementById("jolli-img");
  const anchor   = document.getElementById("forehead-anchor");
  const noFace   = document.getElementById("no-face");
  const scene    = document.querySelector("a-scene");

  let isTracking = false;
  let showBee    = true;

  // ── Emote alternation — only runs while a face is tracked ─────────────────
  setInterval(() => {
    if (!isTracking) return;
    showBee = !showBee;
    beeImg.setAttribute("visible",   String(showBee));
    jolliImg.setAttribute("visible", String(!showBee));
  }, SWAP_INTERVAL);

  // ── MindAR scene lifecycle ─────────────────────────────────────────────────
  // arReady fires when MindAR got the camera and started the detection loop
  scene.addEventListener("arReady", () => {
    noFace.classList.remove("hidden");
  });

  // arError fires when camera access failed (denied, no device, not HTTPS)
  scene.addEventListener("arError", () => {
    noFace.querySelector("span").textContent = "⚠️";
    noFace.querySelector("p").textContent =
      "Camera access failed.\n1. Allow camera permission in the browser\n2. Reload the page";
    noFace.classList.remove("hidden");
  });

  // ── Face-anchor tracking events ────────────────────────────────────────────
  anchor.addEventListener("targetFound", () => {
    isTracking = true;
    noFace.classList.add("hidden");
    // Restore whichever image is currently "active"
    beeImg.setAttribute("visible",   String(showBee));
    jolliImg.setAttribute("visible", String(!showBee));
  });

  anchor.addEventListener("targetLost", () => {
    isTracking = false;
    // Hide both images — never show without active tracking
    beeImg.setAttribute("visible",   "false");
    jolliImg.setAttribute("visible", "false");
    noFace.classList.remove("hidden");
  });

  // ── Screenshot ─────────────────────────────────────────────────────────────
  // preserveDrawingBuffer: true is set on the renderer in index.html
  document.getElementById("snap-btn").addEventListener("click", () => {
    const flash = document.getElementById("flash");
    flash.classList.remove("active");
    void flash.offsetWidth; // reflow to restart animation
    flash.classList.add("active");

    const canvas = scene.canvas;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `jollibee-ar-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  });
});


