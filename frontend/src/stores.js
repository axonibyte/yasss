import { writable } from 'svelte/store';
import Cookies from 'js-cookie';

// user state

const initialUser = Cookies.get('user') ? JSON.parse(Cookies.get('user')) : null;
export const user = writable(initialUser);

user.subscribe(value => {
  if (value) Cookies.set('user', JSON.stringify(value));
  else Cookies.remove('user');
});

// event state
export const currentEvent = writable({
  summary: {},
  activities: [],
  windows: [],
  slots: [],
  details: [],
  volunteers: [],
  currentVol: -1,
  step: 1,
  editing: false
});

// UI state
export const modals = writable({
  auth: false,
  eventEdit: false,
  activityEdit: false,
  windowEdit: false,
  detailEdit: false,
  slotEdit: false,
  volunteerEdit: false,
  profile: false,
  guestPrompt: false,
  captcha: false,
  markdown: false,
  share: false
});
export const toasts = writable([]);
export const activeItem = writable(null);
export const markdownContent = writable({ title: '', url: ''});
export const guestAction = writable({ loginFn: null, proceedFn: null});
export const captchaCallback = writable(null);
