import { getApiBase } from './api';

let warmedThisSession = false;

/** Quiet ping to wake Render free tier before first chat message. */
export async function warmApiHealthOnce() {
  if (warmedThisSession || typeof window === 'undefined') return;
  warmedThisSession = true;
  try {
    const base = await getApiBase();
    await fetch(`${base}/health`, { method: 'GET', credentials: 'omit' });
  } catch {
    /* ignore */
  }
}
