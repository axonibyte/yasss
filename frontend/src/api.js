import { get } from 'svelte/store';
import { user } from './stores.js';

export async function fetchApi(endpoint, options = {}, captchaToken = null) {
  const currentUser = get(user);
  const headers = { ...options.headers };

  if (currentUser?.session) {
    headers['Authorization'] = `AXB-SIG-REQ ${currentUser.session}`;
  }
  if (captchaToken) {
    headers['X-CAPTCHA-TOKEN'] = captchaToken;
  }

  const response = await fetch(`/v1${endpoint}`, { ...options, headers });

  // auto-refresh session hook
  const newSession = response.headers.get('axb-session');
  if (newSession && currentUser) {
    user.set({ ...currentUser, session: newSession });
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.info || 'API Request Failed');
  }

  return response.json();
}
