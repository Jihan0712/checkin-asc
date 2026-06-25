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
