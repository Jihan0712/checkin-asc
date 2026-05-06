// ── Secure-context guard ──────────────────────────────────────────────────────
// Camera requires HTTPS or localhost — won't work on file://
if (!window.isSecureContext) {
  document.getElementById("insecure-banner").style.display = "flex";
  throw new Error("Not a secure context — camera blocked.");
}

// ── Config ────────────────────────────────────────────────────────────────────
const SWAP_INTERVAL = 1000; // ms between emote swaps

// ── Bootstrap after DOM is ready ─────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const beeImg    = document.getElementById("bee-img");
  const jolliImg  = document.getElementById("jolli-img");
  const anchor    = document.getElementById("forehead-anchor");
  const noFace    = document.getElementById("no-face");
  const scene     = document.querySelector("a-scene");

  // ── Alternating emote every SWAP_INTERVAL ──────────────────────────────────
  let showBee = true;
  setInterval(() => {
    showBee = !showBee;
    beeImg.setAttribute("visible", showBee);
    jolliImg.setAttribute("visible", !showBee);
  }, SWAP_INTERVAL);

  // ── Show no-face hint once the scene is ready ─────────────────────────────
  scene.addEventListener("loaded", () => {
    noFace.classList.remove("hidden");
  });

  // ── Hide/show hint based on face detection ────────────────────────────────
  anchor.addEventListener("targetFound", () => {
    noFace.classList.add("hidden");
  });
  anchor.addEventListener("targetLost", () => {
    noFace.classList.remove("hidden");
  });

  // ── Screenshot ────────────────────────────────────────────────────────────
  // A-Frame renders video + AR into one WebGL canvas (preserveDrawingBuffer: true set in HTML)
  document.getElementById("snap-btn").addEventListener("click", () => {
    const flash  = document.getElementById("flash");
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

