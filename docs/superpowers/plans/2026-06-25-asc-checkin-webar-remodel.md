# ASC Check-In WebAR Remodel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Jollibee AR emote experience with a 6-screen ASC event check-in flow: landing → permission → AR camera with org-filter speech bubble → photo review → registration form → Welcome Passport confirmation.

**Architecture:** Single-page app with JS-driven screen panels. All 6 screens are `position:fixed` `<div>` panels in `index.html`; `src/app.js` exposes `showScreen(id)` and `AppState` so any module can advance the flow. The MindAR + Three.js AR session runs continuously in the background behind all screens; the camera screen is transparent. `src/main.js` is the sole controller that wires all button handlers.

**Tech Stack:** Vanilla JS ES modules, A-Frame 1.5.0, MindAR 1.2.5, Three.js (via AFRAME.THREE), Express 5.x, MongoDB 7.x, Multer 2.x

## Global Constraints

- No new npm dependencies — express, multer, cors, mongodb already installed
- Keep all `<head>` scripts in `index.html` intact (iOS redirect, video patch, getUserMedia proxy)
- Mobile-first CSS; target iOS Safari 15+ and Android Chrome 90+
- A-Frame and MindAR loaded from existing CDN URLs — do not change them
- Use `AFRAME.THREE` for Three.js access inside A-Frame components
- Canvas `roundRect` must use manual `quadraticCurveTo` fallback (not `ctx.roundRect`) for broad browser support
- All fetch calls to backend use `http://localhost:3000/submit`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `server/checkinServer.js` | Modify | Store `firstName`, `lastName`, `email`, `company` |
| `src/app.js` | Create | `AppState`, `ORGS`, `showScreen()`, `resetState()` |
| `src/checkinService.js` | Modify | Export `saveLocally` + `submitToBackend` with full fields |
| `index.html` | Modify body | 6 screen panels + updated A-Frame scene |
| `src/style.css` | Rewrite | ASC branding + all screen styles |
| `src/ar.js` | Rewrite | `SpeechBubble` + `speech-bubble` A-Frame component |
| `src/capture.js` | Modify | `takePhoto()` stores blob in `AppState`, calls `showScreen('review')` |
| `src/main.js` | Rewrite | All button wiring, org filter, camera flip, resize |

---

### Task 1: Server — accept registration fields

**Files:**
- Modify: `server/checkinServer.js`

**Interfaces:**
- Produces: `POST /submit` stores `firstName`, `lastName`, `email`, `company` on MongoDB document

- [ ] **Step 1: Update document construction in /submit handler**

In `server/checkinServer.js`, replace the destructuring and `doc` object (lines 36–46):

```js
const { facing, firstName, lastName, email, company, latitude, longitude } = req.body;
const doc = {
  _id: new ObjectId(),
  timestamp: new Date(),
  facing: facing || 'unknown',
  firstName: firstName || null,
  lastName: lastName || null,
  email: email || null,
  company: company || null,
  location: latitude && longitude
    ? { latitude: parseFloat(latitude), longitude: parseFloat(longitude) }
    : null,
  image: req.file.buffer,
  mimeType: req.file.mimetype,
};
```

- [ ] **Step 2: Start the server and verify with curl**

```bash
node server/checkinServer.js
```

In a second terminal:

```bash
curl -X POST http://localhost:3000/submit \
  -F "file=@assets/icon.png;type=image/png" \
  -F "firstName=Juan" \
  -F "lastName=Dela Cruz" \
  -F "email=juan@abc.com" \
  -F "company=ABC Agency" \
  -F "facing=user"
```

Expected: `{"success":true,"id":"<object-id>"}`

- [ ] **Step 3: Commit**

```bash
git add server/checkinServer.js
git commit -m "feat(server): accept firstName, lastName, email, company fields"
```

---

### Task 2: src/app.js — AppState and navigation

**Files:**
- Create: `src/app.js`

**Interfaces:**
- Produces:
  - `AppState` — `{ selectedOrg, capturedBlob, capturedUrl, form: { firstName, lastName, email, company } }`
  - `ORGS` — array of `{ id, name, hashtag, color }` (5 placeholder orgs)
  - `showScreen(id: string): void` — shows `#screen-<id>`, hides all others
  - `resetState(): void` — clears AppState, revokes `capturedUrl`

- [ ] **Step 1: Create src/app.js**

```js
export const ORGS = [
  { id: 'wmay',  name: 'WMay',  hashtag: '#WMay',  color: '#E8232A' },
  { id: 'dmop',  name: 'dMOP',  hashtag: '#dMOP',  color: '#0057A8' },
  { id: 'onaap', name: 'ONAAP', hashtag: '#ONAAP', color: '#F5A623' },
  { id: 'iaas',  name: 'IAAs',  hashtag: '#IAAs',  color: '#6B3FA0' },
  { id: 'ucpb',  name: 'UCPB',  hashtag: '#UCPB',  color: '#00843D' },
];

export const AppState = {
  selectedOrg: null,
  capturedBlob: null,
  capturedUrl: null,
  form: { firstName: '', lastName: '', email: '', company: '' },
};

export function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function (s) {
    s.classList.toggle('screen--active', s.id === 'screen-' + id);
  });
}

export function resetState() {
  if (AppState.capturedUrl) { URL.revokeObjectURL(AppState.capturedUrl); }
  AppState.selectedOrg = null;
  AppState.capturedBlob = null;
  AppState.capturedUrl = null;
  AppState.form = { firstName: '', lastName: '', email: '', company: '' };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app.js
git commit -m "feat: add AppState module with showScreen and ORGS config"
```

---

### Task 3: src/checkinService.js — full registration payload

**Files:**
- Modify: `src/checkinService.js`

**Interfaces:**
- Produces:
  - `saveLocally(blob, facing, meta)` — unchanged signature, saves to localStorage
  - `submitToBackend(blob, facing, meta): Promise` — now sends `firstName`, `lastName`, `email`, `company`; rejects on non-OK response
  - `syncQueue()` — unchanged

- [ ] **Step 1: Replace src/checkinService.js entirely**

```js
const STORAGE_KEY = 'pendingCheckIns';

export const saveLocally = (blob, facing, meta = {}) => {
  const entry = {
    id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
    timestamp: new Date().toISOString(),
    facing,
    blob,
    status: 'pending',
    ...meta,
  };
  let queue = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  queue.push(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
};

export const submitToBackend = async (blob, facing, meta = {}) => {
  const form = new FormData();
  form.append('file', blob, 'checkin.jpg');
  form.append('facing', facing);
  if (meta.firstName) form.append('firstName', meta.firstName);
  if (meta.lastName)  form.append('lastName',  meta.lastName);
  if (meta.email)     form.append('email',     meta.email);
  if (meta.company)   form.append('company',   meta.company);
  if (meta.latitude)  form.append('latitude',  meta.latitude);
  if (meta.longitude) form.append('longitude', meta.longitude);

  const response = await fetch('http://localhost:3000/submit', { method: 'POST', body: form });
  if (!response.ok) throw new Error('Submit failed: ' + response.status);
  return response.json();
};

export const getQueue  = () => JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
export const clearQueue = () => localStorage.removeItem(STORAGE_KEY);

export async function syncQueue() {
  const queue = getQueue();
  if (!queue.length) return;
  for (let i = 0; i < queue.length; i++) {
    const { blob, facing, ...meta } = queue[i];
    try {
      await submitToBackend(blob, facing, meta);
      queue.splice(i, 1);
      i--;
    } catch (e) {
      console.error('Sync failed for entry', queue[i]?.id, e);
    }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', syncQueue);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/checkinService.js
git commit -m "feat(checkinService): export saveLocally/submitToBackend with full registration fields"
```

---

### Task 4: index.html — 6-screen HTML scaffold

**Files:**
- Modify: `index.html`

**Interfaces:**
- Produces DOM IDs consumed by Tasks 6, 7, 8:
  - Screens: `#screen-landing`, `#screen-permission`, `#screen-camera`, `#screen-review`, `#screen-form`, `#screen-confirmation`
  - Buttons: `#btn-start`, `#btn-accept`, `#btn-cancel-permission`, `#btn-use-photo`, `#btn-retake`, `#btn-download`, `#btn-share`, `#btn-submit`, `#btn-go-back`, `#btn-open-camera`
  - Form fields: `#field-firstname`, `#field-lastname`, `#field-email`, `#field-company`, `#form-error`
  - Display: `#review-img`, `#form-thumb`, `#confirmation-img`, `#confirmation-name`, `#confirmation-company`
  - AR/camera: `#org-filter-row`, `#capture-btn`, `#capture-inner`, `#rec-badge`, `#camera-btn`, `#anchor-168`
  - Kept from old code: `#camera-error` (used by getUserMedia proxy), `#processing-overlay` (used by capture.js)

- [ ] **Step 1: Replace the entire `<body>` in index.html**

Keep everything in `<head>` unchanged. Replace `<body>…</body>` with:

```html
<body>
  <script>
    (function () {
      if ((sessionStorage.getItem('cameraFacing') || 'user') === 'environment') {
        document.addEventListener('DOMContentLoaded', function () {
          var el = document.querySelector('.ar-container');
          if (el) el.style.transform = 'scaleX(-1)';
        });
      }
    })();
  </script>

  <div id="inapp-warning">
    <div class="inapp-box">
      <p>This experience requires your device's browser for camera access.</p>
      <p>Tap <strong>⋯</strong> or <strong>⋮</strong> → <strong>Open in Safari</strong> / <strong>Open in Browser</strong></p>
    </div>
  </div>

  <div id="camera-error">
    <p>Camera access is required.<br>Please allow camera in your browser settings, then reload.</p>
    <button onclick="location.reload()">Reload</button>
  </div>

  <!-- AR layer: always running behind all screens -->
  <div class="ar-container">
    <a-scene
      mindar-face
      speech-bubble
      embedded
      color-space="sRGB"
      renderer="colorManagement: true; physicallyCorrectLights: true; preserveDrawingBuffer: true; alpha: true"
      vr-mode-ui="enabled: false"
      device-orientation-permission-ui="enabled: false"
    >
      <a-assets>
        <a-asset-item id="headModel" src="https://cdn.jsdelivr.net/gh/hiukim/mind-ar-js@1.2.5/examples/face-tracking/assets/sparkar/headOccluder.glb"></a-asset-item>
      </a-assets>
      <a-camera active="false" position="0 0 0" look-controls="enabled: false"></a-camera>
      <a-entity mindar-face-target="anchorIndex: 168">
        <a-gltf-model
          mindar-face-occluder
          position="0 -0.3 0.15"
          rotation="0 0 0"
          scale="0.065 0.065 0.065"
          src="#headModel"
        ></a-gltf-model>
      </a-entity>
      <a-entity id="anchor-168" mindar-face-target="anchorIndex: 168"></a-entity>
    </a-scene>
  </div>

  <!-- Screen 1: Landing -->
  <div id="screen-landing" class="screen screen--active">
    <div class="landing">
      <div class="landing__logo-wrap">
        <img src="assets/icon.png" alt="ASC 50 Years" class="landing__logo" />
      </div>
      <h1 class="landing__title">COME, MAKI-ALAM AT<br><span>MAKIALAM!</span></h1>
      <p class="landing__subtitle">An Advertising Self-Regulation Welcome Party</p>
      <div class="landing__hashtag">#MaySayKaRito</div>
      <p class="landing__cta">Complete your registration to receive your <strong>Welcome Passport.</strong></p>
      <button id="btn-start" class="btn btn--primary">&#128247; START REGISTRATION</button>
    </div>
  </div>

  <!-- Screen 2: Permission -->
  <div id="screen-permission" class="screen">
    <div class="permission__backdrop">
      <div class="permission__modal">
        <p>By continuing, you agree to our <a href="#">Privacy Policy</a> and consent to the use of your photo for this event.</p>
        <button id="btn-accept" class="btn btn--primary">ACCEPT</button>
        <button id="btn-cancel-permission" class="btn btn--secondary">CANCEL</button>
      </div>
    </div>
  </div>

  <!-- Screen 3: AR Camera -->
  <div id="screen-camera" class="screen screen--camera">
    <p class="camera__hint">Choose a filter, then tap the camera button.</p>
    <div id="org-filter-row"></div>
    <div id="bottom-bar">
      <button id="camera-btn" class="bar-btn" title="Switch camera">
        <img src="assets/change-camera.png" alt="Switch camera" />
      </button>
      <div id="capture-wrap">
        <button id="capture-btn" title="Take photo">
          <img src="assets/capture-button.png" alt="Capture" id="capture-inner" />
        </button>
        <div id="rec-badge">&#9679; REC</div>
      </div>
      <div class="bar-btn bar-btn--spacer"></div>
    </div>
  </div>

  <!-- Screen 4: Photo Review -->
  <div id="screen-review" class="screen">
    <div class="review">
      <div class="review__photo-wrap">
        <img id="review-img" src="" alt="Your selfie" />
      </div>
      <div class="review__actions">
        <button id="btn-use-photo" class="btn btn--primary">USE PHOTO</button>
        <button id="btn-retake" class="btn btn--secondary">RETAKE</button>
        <button id="btn-download" class="btn btn--ghost">&#x2B07; DOWNLOAD PHOTO</button>
        <button id="btn-share" class="btn btn--ghost">&#8599; SHARE</button>
      </div>
    </div>
  </div>

  <!-- Screen 5: Registration Form -->
  <div id="screen-form" class="screen">
    <div class="form-screen">
      <img id="form-thumb" src="" alt="" class="form-screen__thumb" />
      <h2 class="form-screen__heading">Complete your registration</h2>
      <form id="registration-form" novalidate>
        <input id="field-firstname" type="text"  placeholder="FIRST NAME"    autocomplete="given-name" />
        <input id="field-lastname"  type="text"  placeholder="LAST NAME"     autocomplete="family-name" />
        <input id="field-email"     type="email" placeholder="EMAIL ADDRESS" autocomplete="email" />
        <input id="field-company"   type="text"  placeholder="COMPANY"       autocomplete="organization" />
        <p id="form-error" class="form-screen__error"></p>
        <button type="submit" id="btn-submit" class="btn btn--primary">SUBMIT</button>
        <button type="button" id="btn-go-back" class="btn btn--secondary">GO BACK</button>
      </form>
      <p class="form-screen__privacy">Your details and selfie will only be used for event registration and Welcome Passport issuance.</p>
    </div>
  </div>

  <!-- Screen 6: Confirmation -->
  <div id="screen-confirmation" class="screen">
    <div class="confirmation">
      <div class="confirmation__banner">Show this screen to the organizer to claim your <strong>Welcome Passport.</strong></div>
      <div class="confirmation__photo-wrap">
        <img id="confirmation-img" src="" alt="Your selfie" />
      </div>
      <p id="confirmation-name"    class="confirmation__name"></p>
      <p id="confirmation-company" class="confirmation__company"></p>
      <button id="btn-open-camera" class="btn btn--secondary">&#128247; OPEN CAMERA</button>
    </div>
  </div>

  <div id="processing-overlay">
    <div class="processing-box">
      <div class="processing-spinner"></div>
      <p>Processing video…</p>
    </div>
  </div>

  <script type="module" src="src/main.js"></script>
</body>
```

- [ ] **Step 2: Verify structure in browser console**

Serve the project (`npx serve .`) and open in browser. Run in console:

```js
document.querySelectorAll('.screen').length          // 6
document.getElementById('screen-landing').classList.contains('screen--active') // true
document.getElementById('anchor-168')               // not null
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(html): 6-screen scaffold with updated A-Frame scene"
```

---

### Task 5: src/style.css — ASC branding and all screen styles

**Files:**
- Modify: `src/style.css`

**Interfaces:**
- Consumes: all DOM IDs/classes from Task 4

- [ ] **Step 1: Replace src/style.css entirely**

```css
/* ── Reset ── */
*, *::before, *::after { box-sizing: border-box; }

html, body {
  margin: 0; padding: 0;
  height: 100%; height: -webkit-fill-available;
  background: #0a3f8f;
  overscroll-behavior: none;
  -webkit-user-select: none; user-select: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  font-family: Arial, sans-serif;
}

/* ── AR container (always behind screens) ── */
.ar-container {
  position: fixed; top: 0; right: 0; bottom: 0; left: 0;
  overflow: hidden; touch-action: none; z-index: 0;
}
a-scene { display: block; width: 100%; height: 100%; }

/* ── Screen panels ── */
.screen {
  position: fixed; inset: 0;
  display: none; flex-direction: column;
  align-items: center; justify-content: center;
  z-index: 100;
}
.screen--active { display: flex; }
.screen--camera {
  background: transparent;
  pointer-events: none;
  z-index: 10;
}
.screen--camera > * { pointer-events: auto; }

/* ── Shared buttons ── */
.btn {
  display: block; width: 100%; max-width: 320px;
  padding: 14px 24px; border: none; border-radius: 8px;
  font-size: 1rem; font-weight: 700; letter-spacing: 0.04em;
  cursor: pointer; text-align: center;
  touch-action: manipulation; -webkit-tap-highlight-color: transparent;
}
.btn--primary  { background: #fff;         color: #0a3f8f; }
.btn--secondary{ background: #1a5fb4;      color: #fff; margin-top: 10px; }
.btn--ghost    { background: transparent;  color: #fff; margin-top: 10px; border: 2px solid rgba(255,255,255,0.5); }

/* ── Landing ── */
#screen-landing { background: #0a3f8f; }
.landing {
  display: flex; flex-direction: column; align-items: center;
  padding: 40px 32px; text-align: center; color: #fff; max-width: 400px; width: 100%;
}
.landing__logo { width: 72px; height: auto; margin-bottom: 16px; }
.landing__title {
  font-size: 2rem; font-weight: 900; text-transform: uppercase;
  line-height: 1.15; margin: 0 0 8px;
}
.landing__title span { color: #F47B20; font-size: 2.4rem; }
.landing__subtitle { font-size: 0.85rem; opacity: 0.85; margin: 0 0 16px; }
.landing__hashtag {
  background: #F47B20; color: #fff;
  padding: 6px 18px; border-radius: 999px;
  font-size: 0.9rem; font-weight: 700; margin-bottom: 24px;
}
.landing__cta { font-size: 1rem; line-height: 1.5; margin: 0 0 32px; }
.landing__cta strong { color: #F47B20; }

/* ── Permission ── */
#screen-permission { background: rgba(10,63,143,0.75); backdrop-filter: blur(4px); }
.permission__backdrop { display: flex; align-items: center; justify-content: center; padding: 24px; }
.permission__modal {
  background: #1a5fb4; color: #fff;
  border-radius: 16px; padding: 32px 24px; max-width: 320px; text-align: center;
}
.permission__modal p { font-size: 1rem; line-height: 1.6; margin: 0 0 24px; }
.permission__modal a { color: #F47B20; }

/* ── Camera screen ── */
#screen-camera { justify-content: flex-end; }
.camera__hint {
  position: absolute; bottom: 148px; left: 0; right: 0;
  text-align: center; color: #fff; font-size: 0.85rem;
  text-shadow: 0 1px 4px rgba(0,0,0,0.7); pointer-events: none;
}
#org-filter-row {
  position: absolute; bottom: 104px; left: 0; right: 0;
  display: flex; align-items: center; justify-content: center;
  gap: 10px; padding: 0 16px; overflow-x: auto;
}
.org-btn {
  width: 52px; height: 52px; border-radius: 50%;
  border: 3px solid rgba(255,255,255,0.5);
  background: rgba(0,0,0,0.35);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; flex-shrink: 0;
  color: #fff; font-size: 0.55rem; font-weight: 700;
  text-align: center; line-height: 1.2;
  touch-action: manipulation; -webkit-tap-highlight-color: transparent;
  transition: border-color 0.15s, background 0.15s;
}
.org-btn--selected { border-color: #F47B20; background: rgba(244,123,32,0.35); }

/* ── Bottom bar ── */
#bottom-bar {
  position: absolute; bottom: 0; left: 0; right: 0;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  padding-left:  max(40px, env(safe-area-inset-left));
  padding-right: max(40px, env(safe-area-inset-right));
  padding-top: 12px;
  display: flex; align-items: center; justify-content: space-between;
  background: linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%);
}
.bar-btn {
  background: none; border: none; padding: 0; margin: 0; cursor: pointer;
  min-width: 52px; min-height: 52px;
  display: flex; align-items: center; justify-content: center;
  touch-action: manipulation;
}
.bar-btn img { width: 44px; height: 44px; object-fit: contain; }
.bar-btn--spacer { visibility: hidden; }
#capture-wrap { position: relative; display: flex; align-items: center; justify-content: center; }
#capture-btn {
  width: 76px; height: 76px; background: transparent; border: none;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; padding: 0; touch-action: manipulation;
}
#capture-inner { width: 76px; height: 76px; object-fit: contain; pointer-events: none; }
#capture-btn.recording #capture-inner { opacity: 0.5; }
#rec-badge {
  position: absolute; top: -28px; left: 50%; transform: translateX(-50%);
  background: #e0303a; color: #fff;
  font-size: 0.68rem; font-weight: 700; letter-spacing: 0.05em;
  padding: 3px 8px; border-radius: 4px; display: none; white-space: nowrap;
}

/* ── Review ── */
#screen-review { background: #0a3f8f; }
.review {
  display: flex; flex-direction: column; align-items: center;
  width: 100%; height: 100%; padding: 24px 32px;
}
.review__photo-wrap {
  flex: 1; width: 100%; max-width: 360px;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden; border-radius: 12px; margin-bottom: 20px;
}
.review__photo-wrap img { width: 100%; height: 100%; object-fit: cover; border-radius: 12px; }
.review__actions { width: 100%; max-width: 320px; display: flex; flex-direction: column; }

/* ── Form ── */
#screen-form { background: #0a3f8f; overflow-y: auto; align-items: flex-start; }
.form-screen {
  display: flex; flex-direction: column; align-items: center;
  padding: 24px 32px; width: 100%; max-width: 400px; margin: 0 auto;
}
.form-screen__thumb {
  width: 120px; height: 120px; object-fit: cover;
  border-radius: 8px; margin-bottom: 16px;
  border: 3px solid rgba(255,255,255,0.3);
}
.form-screen__heading { color: #fff; font-size: 1.2rem; font-weight: 700; margin: 0 0 20px; text-align: center; }
#registration-form { width: 100%; display: flex; flex-direction: column; gap: 12px; }
#registration-form input {
  width: 100%; padding: 14px 16px;
  background: #1a5fb4; border: 1px solid rgba(255,255,255,0.2);
  border-radius: 8px; color: #fff; font-size: 0.95rem;
  font-weight: 600; letter-spacing: 0.04em;
}
#registration-form input::placeholder { color: rgba(255,255,255,0.5); }
#registration-form input:focus { outline: none; border-color: #F47B20; }
.form-screen__error { color: #ff6b6b; font-size: 0.85rem; margin: 0; min-height: 1.2em; text-align: center; }
.form-screen__privacy { color: rgba(255,255,255,0.6); font-size: 0.75rem; text-align: center; margin-top: 16px; line-height: 1.5; }

/* ── Confirmation ── */
#screen-confirmation { background: #0a3f8f; justify-content: flex-start; }
.confirmation {
  display: flex; flex-direction: column; align-items: center;
  width: 100%; height: 100%; padding: 0 32px 32px;
}
.confirmation__banner {
  width: 100%; background: #d63384; color: #fff;
  padding: 14px 20px; text-align: center;
  font-size: 0.9rem; line-height: 1.5; flex-shrink: 0;
}
.confirmation__photo-wrap {
  flex: 1; width: 100%; max-width: 360px;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden; border-radius: 12px; margin: 20px 0 16px;
}
.confirmation__photo-wrap img { width: 100%; height: 100%; object-fit: cover; border-radius: 12px; }
.confirmation__name    { color: #fff; font-size: 1.5rem; font-weight: 900; margin: 0 0 4px; text-align: center; text-transform: uppercase; }
.confirmation__company { color: rgba(255,255,255,0.75); font-size: 1rem; margin: 0 0 24px; text-align: center; }

/* ── Camera error ── */
#camera-error {
  position: fixed; inset: 0; display: none;
  flex-direction: column; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.92); z-index: 1000;
  text-align: center; color: #fff; padding: 28px; gap: 20px;
}
#camera-error p { margin: 0; font-size: 1.05rem; line-height: 1.6; }
#camera-error button {
  padding: 12px 28px; background: #e8251f; color: #fff;
  border: none; border-radius: 10px; font-size: 1rem; font-weight: 600; cursor: pointer;
}

/* ── In-app browser warning ── */
#inapp-warning {
  display: none; position: fixed; inset: 0;
  background: rgba(0,0,0,0.93); z-index: 600;
  align-items: center; justify-content: center; padding: 28px;
}
.inapp-box {
  background: #1c1c1e; border-radius: 16px; padding: 28px 24px;
  color: #fff; text-align: center; line-height: 1.6; max-width: 320px;
}
.inapp-box p { margin: 0 0 14px; font-size: 0.98rem; }
.inapp-box p:last-child { margin: 0; }
.inapp-box strong { color: #e8251f; }

/* ── Processing overlay ── */
#processing-overlay {
  display: none; position: fixed; inset: 0;
  background: rgba(0,0,0,0.75); z-index: 300;
  align-items: center; justify-content: center; flex-direction: column;
}
.processing-box { display: flex; flex-direction: column; align-items: center; gap: 16px; color: #fff; font-size: 1rem; }
.processing-box p { margin: 0; }
.processing-spinner {
  width: 44px; height: 44px;
  border: 4px solid rgba(255,255,255,0.25); border-top-color: #fff;
  border-radius: 50%; animation: spin 0.75s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

canvas { touch-action: none; }
```

- [ ] **Step 2: Verify in browser**

Open the page. Confirm:
- Landing screen shows blue background with orange accents
- In browser console run `import('./src/app.js').then(m => m.showScreen('form'))` — form screen appears with blue inputs

- [ ] **Step 3: Commit**

```bash
git add src/style.css
git commit -m "feat(styles): ASC branding with 6-screen layouts"
```

---

### Task 6: src/ar.js — SpeechBubble replaces EmoteSwitcher

**Files:**
- Modify: `src/ar.js`

**Interfaces:**
- Consumes: `CustomEvent('org-change', { detail: { hashtag, color } | null })` on `document`
- Produces:
  - `speech-bubble` A-Frame component (on `<a-scene>` in index.html)
  - Dispatches `CustomEvent('ar-ready')` on `document` when face tracking is live
  - Three.js plane mesh attached to `#anchor-168`, visible only when face is tracked

- [ ] **Step 1: Replace src/ar.js entirely**

```js
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
```

- [ ] **Step 2: Confirm no emote-switcher reference remains**

```bash
grep -n "emote-switcher\|EmoteSwitcher\|bee-img\|jolli-img" src/ar.js index.html
```

Expected: zero matches in `src/ar.js`; zero matches in `index.html`.

- [ ] **Step 3: Manual browser test**

Grant camera. After a few seconds the white speech bubble with `#MaySayKaRito` in orange should appear above the tracked face. In browser console:

```js
document.dispatchEvent(new CustomEvent('org-change', { detail: { hashtag: '#WMay', color: '#E8232A' } }));
```

Expected: bubble text updates to `#WMay` in red.

- [ ] **Step 4: Commit**

```bash
git add src/ar.js
git commit -m "feat(ar): replace EmoteSwitcher with SpeechBubble canvas texture"
```

---

### Task 7: src/capture.js — store blob in AppState

**Files:**
- Modify: `src/capture.js`

**Interfaces:**
- Consumes: `AppState`, `showScreen` from `./app.js`
- Produces: `CaptureController.takePhoto()` — stores JPEG blob in `AppState.capturedBlob`, sets `AppState.capturedUrl`, updates `#review-img` / `#form-thumb` / `#confirmation-img`, calls `showScreen('review')`

- [ ] **Step 1: Replace the import at the bottom of capture.js**

Remove line:
```js
import { register as registerCheckIn } from './checkinService.js';
```

Add at the very top of the file (before any `var` declarations):
```js
import { AppState, showScreen } from './app.js';
```

- [ ] **Step 2: Replace the takePhoto() method**

Replace the entire `CaptureController.prototype.takePhoto` function with:

```js
CaptureController.prototype.takePhoto = function () {
  if (!_comp) return;
  _comp.toBlob(function (blob) {
    if (!blob) return;
    if (AppState.capturedUrl) { URL.revokeObjectURL(AppState.capturedUrl); }
    AppState.capturedBlob = blob;
    AppState.capturedUrl  = URL.createObjectURL(blob);

    var reviewImg  = document.getElementById('review-img');
    var formThumb  = document.getElementById('form-thumb');
    var confirmImg = document.getElementById('confirmation-img');
    if (reviewImg)  reviewImg.src  = AppState.capturedUrl;
    if (formThumb)  formThumb.src  = AppState.capturedUrl;
    if (confirmImg) confirmImg.src = AppState.capturedUrl;

    showScreen('review');
  }, 'image/jpeg', 0.92);
};
```

- [ ] **Step 3: Remove _showCheckInToast and inline checkin-overlay wiring**

Delete the `_showCheckInToast` function and its `setTimeout` arrow function (approx lines 369–389 in the original file).

- [ ] **Step 4: Verify no old check-in references remain**

```bash
grep -n "registerCheckIn\|checkin-overlay\|checkin-submit\|checkin-cancel\|checkin-name\|_showCheckInToast" src/capture.js
```

Expected: zero matches.

- [ ] **Step 5: Commit**

```bash
git add src/capture.js
git commit -m "feat(capture): store blob in AppState and navigate to review screen"
```

---

### Task 8: src/main.js — full screen wiring

**Files:**
- Modify: `src/main.js`

**Interfaces:**
- Consumes:
  - `CaptureController` from `./capture.js`
  - `AppState`, `ORGS`, `showScreen`, `resetState` from `./app.js`
  - `saveLocally`, `submitToBackend`, `syncQueue` from `./checkinService.js`

- [ ] **Step 1: Replace src/main.js entirely**

```js
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
```

- [ ] **Step 2: Test the full flow in browser**

Walk through the complete flow end-to-end:

1. **Landing** → tap START REGISTRATION → permission modal appears over AR feed
2. **Permission** → tap ACCEPT → camera screen with live AR + org filter row visible
3. **Camera** → tap an org button → bubble updates to org hashtag/color
4. **Camera** → tap capture → review screen shows composited photo
5. **Review** → tap USE PHOTO → form screen; Company field pre-filled with selected org
6. **Form** → fill in all fields → tap SUBMIT → loading state → confirmation screen
7. **Confirmation** → verify name + company + photo shown; tap OPEN CAMERA → landing screen
8. **RETAKE** (from review) → returns to camera screen, blob cleared
9. **GO BACK** (from form) → returns to review screen

Check network tab: SUBMIT POSTs to `http://localhost:3000/submit` with `firstName`, `lastName`, `email`, `company`, `facing`, and `file`.

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "feat(main): wire all 6-screen flow — org filter, capture, form, confirmation"
```
