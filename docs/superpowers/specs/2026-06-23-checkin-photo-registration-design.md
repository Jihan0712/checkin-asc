---
name: checkin-photo-registration-design
description: Design for photo‑based check‑in registration flow in the AR app
metadata:
  type: reference
---
# Photo‑Based Check‑In Registration Flow

**Goal** – When a user taps the capture button (or otherwise triggers a photo capture) the resulting image is used to register a check‑in event. The backend integration will be added later; for now the flow stores the image locally and prepares a payload that can be sent to an API.

## High‑Level Architecture

```
[UI] -> CaptureController.takePhoto()
      -> _comp (composite canvas) → Blob (JPEG)
      -> CheckInService.register(blob)
      -> LocalStorage queue (pendingCheckIns)
      -> (Future) API upload
```

- **CaptureController** already exists (src/capture.js) and provides `takePhoto()` which creates a JPEG Blob.
- **CheckInService** (new module) will wrap the Blob, attach metadata (timestamp, facing, optional userId), and push it into `localStorage.pendingCheckIns`.
- When the backend is ready, a separate background uploader can read the queue and POST to `/api/checkin`.

## Component Changes

1. **src/capture.js** – Add import of `CheckInService` and call `CheckInService.register(blob)` after the Blob is created.
2. **src/checkinService.js** (new file) – Implements:
   ```js
   const KEY = 'pendingCheckIns';
   export function register(blob) {
     const entry = {
       id: Date.now() + '-' + Math.random().toString(36).substr(2,5),
       timestamp: new Date().toISOString(),
       facing: _facing, // imported from capture.js
       blob,
       uploaded: false,
     };
     const queue = JSON.parse(localStorage.getItem(KEY) || '[]');
     queue.push(entry);
     localStorage.setItem(KEY, JSON.stringify(queue));
   }
   export function getQueue() { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
   export function clearQueue() { localStorage.removeItem(KEY); }
   ```
3. **UI Update** – Add a small toast/overlay confirming “Check‑in recorded” after a photo is taken.
4. **Future Backend Hook** – Define a POST shape:
   ```json
   { "id": "string", "timestamp": "ISO8601", "facing": "user|environment", "image": "base64" }
   ```
   The uploader will convert the Blob to base64 before sending.

## Error Handling

- If `localStorage` quota is exceeded, show an error toast and suggest clearing old check‑ins.
- If `takePhoto` fails (no canvas), fallback to alert as existing code does.
- All registration steps are wrapped in `try/catch`; failures do not block the UI.

## Success Criteria

- Photo capture works as before.
- After capture, a transient “Check‑in recorded” message appears.
- The JSON queue in `localStorage.pendingCheckIns` contains an entry with the Blob.
- No regression in existing AR functionality.

## Open Questions / Next Steps

- How will user identity be associated later (e.g., ask for name before capture or link via QR code)?
- Should we purge entries after a successful upload automatically?
- Will the backend require authentication headers?

---
**Why this design?**
- Minimal impact on existing code – only a thin service layer is added.
- Works offline; check‑ins are stored locally until the server is ready.
- Clear separation of concerns makes future backend integration trivial.
---
