// Check-in service - now includes basic backend integration

const STORAGE_KEY = 'pendingCheckIns';

// Local storage fallback
export const saveLocally = (blob, facing, meta = {}) => {
  const entry = {
    id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
    timestamp: new Date().toISOString(),
    facing,
    blob,
    status: 'pending',
    ...meta // includes name, latitude, longitude, etc.
  };
  let queue = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  queue.push(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
};

// Backend integration (mock API for now)
export const submitToBackend = async (blob, facing, meta = {}) => {
  // In production: replace with actual API endpoint (local dev server)
  const form = new FormData();
  form.append('file', blob, 'checkin.jpg');
  form.append('facing', facing);
  if (meta.name) form.append('name', meta.name);
  if (meta.latitude) form.append('latitude', meta.latitude);
  if (meta.longitude) form.append('longitude', meta.longitude);

  try {
    const response = await fetch('http://localhost:3000/submit', {
      method: 'POST',
      body: form,
    });
    if (!response.ok) {
      console.error('Backend check‑in failed:', response.status, response.statusText);
    } else {
      console.log('Backend check‑in succeeded');
    }
  } catch (e) {
    console.error('Backend check‑in error:', e);
  }
};

// Main registration function
export function register(blob, facing, meta = {}) {
  // meta may contain {name, latitude, longitude}
  saveLocally(blob, facing, meta);
  submitToBackend(blob, facing, meta).catch(console.error);
}

// Queue management remains for debugging
export const getQueue = () => JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
export const clearQueue = () => localStorage.removeItem(STORAGE_KEY);

// Attempt to upload any pending entries when online
export async function syncQueue() {
  const queue = getQueue();
  if (!queue.length) return;
  for (let i = 0; i < queue.length; i++) {
    const { blob, facing, ...meta } = queue[i];
    try {
      await submitToBackend(blob, facing, meta);
      // Remove successfully sent entry
      queue.splice(i, 1);
      i--;
    } catch (e) {
      console.error('Sync failed for entry', queue[i].id, e);
    }
  }
  // Save remaining queue
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

// Listen for network changes
if (typeof window !== 'undefined') {
  window.addEventListener('online', syncQueue);
}
