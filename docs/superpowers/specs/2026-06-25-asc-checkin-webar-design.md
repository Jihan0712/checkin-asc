---
name: asc-checkin-webar-design
description: Full remodel of the WebAR check-in app into a 6-screen ASC event registration flow with AR speech bubble overlay, org filter selection, registration form, and Welcome Passport confirmation
type: project
---

# ASC Check-In WebAR — Full Remodel Design

**Event:** ASC 50 Years — "Come, Maki-alam at Makialam!" Welcome Party
**Hashtag:** #MaySayKaRito
**Goal:** Replace the existing Jollibee AR emote experience with a 6-screen event check-in and registration flow. Users select their organization, take a selfie with a branded AR speech bubble, fill in their details, and receive a Welcome Passport confirmation screen.

---

## Architecture Overview

**Approach:** Single-page app with JS-driven screen panels. All 6 screens live in `index.html` as `<div>` panels; a single `AppState` object in `src/app.js` controls which panel is visible and holds shared data across screens. The MindAR + Three.js AR session stays alive for the duration of the camera → review transition, avoiding re-initialization cost.

```
AppState = {
  selectedOrg: null,       // { id, name, hashtag, color }
  capturedBlob: null,      // JPEG Blob from capture.js
  form: { firstName, lastName, email, company }
}
```

**Screen transition flow:**
```
[landing] → START REGISTRATION
  → [permission] → ACCEPT
    → [camera] → capture button
      → [review] → USE PHOTO
        → [form] → SUBMIT (success)
          → [confirmation]

RETAKE:       [review] → [camera]   (clears blob)
GO BACK:      [form]   → [review]
CANCEL:       [permission] → [landing]
OPEN CAMERA:  [confirmation] → [landing]  (resets AppState)
```

---

## Screen Designs

### Screen 1 — Landing
- Full-screen blue branded background
- ASC 50 Years logo + "COME, MAKI-ALAM AT MAKIALAM!" heading
- Subtitle: "An Advertising Self-Regulation Welcome Party"
- `#MaySayKaRito` hashtag pill
- Body text: "Complete your registration to receive your Welcome Passport."
- **START REGISTRATION** button (camera icon + text)
- On tap: begin MindAR initialization in background, advance to permission screen

### Screen 2 — Permission Consent
- Semi-transparent modal overlay on top of the already-warming camera feed
- Text: "By continuing, you agree to our Privacy Policy and consent to the use of your photo for this event."
- **ACCEPT** button — dismisses modal, reveals camera screen, MindAR is already warm
- **CANCEL** button — returns to landing, stops camera

### Screen 3 — AR Camera
- Full-screen live front-facing camera with MindAR face tracking
- AR speech bubble plane (Three.js `PlaneGeometry`) anchored ~15cm above forehead landmark
  - Default: `#MaySayKaRito` in brand orange `#F47B20`
  - Updates in real-time when org is selected
- Instruction text: "Choose a filter, then tap the camera button."
- **Filter row** (bottom): 5 circular org icon buttons; tapping one highlights it and calls `setOrg(org)` to re-render bubble texture
- **Capture button** (center circle) — composites video + AR canvas → JPEG blob → AppState.capturedBlob → advance to review
- **Camera flip button** (left) — toggle front/back
- Org selection is encouraged (instruction text) but not blocking; if no org is selected when capture is tapped, Company defaults to empty string and bubble stays as `#MaySayKaRito`

### Screen 4 — Photo Review
- Full-bleed `<img>` showing the composited JPEG (video + AR overlay)
- **USE PHOTO** — advance to registration form
- **RETAKE** — clear blob, return to camera screen
- **DOWNLOAD PHOTO** — trigger browser download of JPEG
- **SHARE** — share composited JPEG via Web Share API

### Screen 5 — Registration Form
- Small thumbnail of captured photo at top
- Heading: "Complete your registration"
- Four input fields:
  - First Name (required)
  - Last Name (required)
  - Email Address (required, valid email format)
  - Company (pre-filled with selected org name, editable)
- **SUBMIT** — validates fields, calls `CheckInService.submit()`, shows loading state, advances to confirmation on success; shows inline error on failure
- **GO BACK** — return to photo review
- Privacy notice: "Your details and selfie will only be used for event registration and Welcome Passport issuance."

### Screen 6 — Confirmation / Welcome Passport
- Top banner (magenta): "Show this screen to the organizer to claim your Welcome Passport."
- Full captured photo with AR overlay
- User's full name (large, bold)
- Company name below
- **OPEN CAMERA** — reset AppState, return to landing for next registrant

---

## AR Overlay — Org Filter

Speech bubble rendered as a canvas texture on a Three.js plane. When org changes, canvas is redrawn and texture updated.

**Bubble spec:**
- Canvas: 256 × 128 px
- White rounded rectangle
- Bold hashtag text in org accent color
- Small triangle pointer at bottom center

**5 Placeholder Organizations:**

| ID | Display Name | Hashtag | Bubble Color |
|----|-------------|---------|-------------|
| `wmay` | WMay | #WMay | `#E8232A` |
| `dmop` | dMOP | #dMOP | `#0057A8` |
| `onaap` | ONAAP | #ONAAP | `#F5A623` |
| `iaas` | IAAs | #IAAs | `#6B3FA0` |
| `ucpb` | UCPB | #UCPB | `#00843D` |

Default (no org selected): `#MaySayKaRito` in `#F47B20`.

---

## File Changes

| File | Change |
|------|--------|
| `index.html` | Replace body with 6 screen `<div>` panels; keep existing script imports |
| `src/app.js` | **New** — AppState object, `showScreen()`, screen wiring, org config array |
| `src/ar.js` | Replace Jollibee emote logic with speech bubble plane + `setOrg()` / texture update |
| `src/capture.js` | Store blob in AppState instead of auto-downloading; minor API change |
| `src/checkinService.js` | Update `submit()` payload to include `firstName`, `lastName`, `email`, `company` |
| `server/checkinServer.js` | Accept + store `firstName`, `lastName`, `email`, `company` on MongoDB document |
| `src/style.css` | Replace Jollibee styles with ASC branding (blue bg, orange accents, form styles) |
| `assets/` | Add org placeholder icons (5 × circle PNGs); keep existing capture/share buttons |

---

## Backend Update

Extend the existing `/submit` `multipart/form-data` endpoint to accept additional text fields:

```
POST /submit
  file: image (JPEG)
  firstName: string
  lastName: string
  email: string
  company: string
  timestamp: ISO8601
  latitude: number
  longitude: number
  facing: "user" | "environment"
```

MongoDB document shape:
```json
{
  "timestamp": "2026-06-25T...",
  "firstName": "Juan",
  "lastName": "Dela Cruz",
  "email": "juan@abc.com",
  "company": "ABC Agency",
  "facing": "user",
  "latitude": 14.5995,
  "longitude": 120.9842,
  "image": "<Buffer>"
}
```

---

## Error Handling

- **Form validation:** inline field errors before submit; no server call until all fields valid
- **Submit failure:** inline error message on form, do not advance to confirmation; localStorage queue fallback remains as offline safety net
- **Camera/AR failure:** existing error handling in `capture.js` retained
- **Permission denied:** if camera access denied on ACCEPT, show inline error with instructions

---

## Success Criteria

1. Full 6-screen flow completes end-to-end on mobile browser
2. AR speech bubble updates in real-time when org filter is tapped
3. Captured photo composites the AR bubble correctly
4. Registration form pre-fills Company from selected org
5. MongoDB document includes all fields (name, email, company, image, metadata)
6. RETAKE and GO BACK navigation works correctly
7. Confirmation screen shows name, company, and photo
8. No regression in camera flip or share functionality
