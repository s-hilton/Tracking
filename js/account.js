// Top bar account area + the sign-in dialog. There is one sign-in for the whole
// dashboard; apps marked `requiresSignIn` reuse it (see openApp in main.js).
import { h } from './ui.js';
import {
  isConfigured, currentUser, syncStatus, signIn, signUp, sendPasswordReset, updatePassword, signOut,
} from './cloud.js';

const STATUS_TEXT = {
  syncing: 'Syncing…',
  synced: 'All changes saved to the cloud',
  error: 'Sync problem',
  'signed-out': 'Not signed in',
};

let dialog;
let afterSignIn = null; // what to do once signed in (e.g. open the app that asked)
let lastEmail = '';

export function statusText() {
  const { state, message } = syncStatus();
  return [STATUS_TEXT[state], message].filter(Boolean).join(': ');
}

// Opens the sign-in dialog. `reason` explains why (e.g. "Sign in to open Notes");
// `then` runs after a successful sign-in.
export function showSignIn({ reason = '', then = null } = {}) {
  afterSignIn = then;
  openMode('signin', { reason });
}

function field(props) {
  return h('input', { class: 'input', required: true, ...props });
}

function openMode(mode, { reason = '', notice = '' } = {}) {
  const email = field({ type: 'email', placeholder: 'Email', autocomplete: 'username', value: lastEmail });
  const password = field({
    type: 'password',
    placeholder: mode === 'signin' ? 'Password' : 'New password (8+ characters)',
    autocomplete: mode === 'signin' ? 'current-password' : 'new-password',
    minLength: mode === 'signin' ? 0 : 8,
  });
  const error = h('p', { class: 'error small', hidden: true });
  const info = h('p', { class: 'muted small', hidden: !(reason || notice) }, notice || reason);
  const link = (label, next) => h('button', { type: 'button', class: 'link-btn', onclick: () => openMode(next) }, label);

  const MODES = {
    signin: { title: 'Sign in', fields: [email, password], submit: 'Sign in', links: [link('Forgot password?', 'reset'), link('Create an account', 'signup')] },
    signup: { title: 'Create account', fields: [email, password], submit: 'Create account', links: [link('I already have an account', 'signin')] },
    reset: { title: 'Reset password', fields: [email], submit: 'Email me a reset link', links: [link('Back to sign in', 'signin')] },
    newpass: { title: 'Choose a new password', fields: [password], submit: 'Save password', links: [] },
  };
  const { title, fields, submit, links } = MODES[mode];
  const button = h('button', { class: 'btn primary' }, submit);

  async function onSubmit(event) {
    event.preventDefault();
    lastEmail = email.value.trim() || lastEmail;
    error.hidden = true;
    button.disabled = true;
    try {
      if (mode === 'signin') {
        await signIn(lastEmail, password.value);
        finish();
      } else if (mode === 'signup') {
        const needsConfirm = await signUp(lastEmail, password.value);
        if (needsConfirm) openMode('signin', { notice: 'Account created. Check your email and click the confirmation link, then sign in here.' });
        else finish();
      } else if (mode === 'reset') {
        await sendPasswordReset(lastEmail);
        openMode('signin', { notice: 'If that email has an account, a reset link is on its way.' });
      } else {
        await updatePassword(password.value);
        finish();
      }
    } catch (err) {
      error.textContent = err.message || 'Something went wrong';
      error.hidden = false;
    } finally {
      button.disabled = false;
    }
  }

  dialog.replaceChildren(h('form', { class: 'auth-form', onsubmit: onSubmit },
    h('div', { class: 'auth-head' },
      h('h2', {}, title),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: () => dialog.close() }, '✕')),
    info, ...fields, error, button,
    links.length ? h('div', { class: 'auth-links' }, ...links) : null));
  if (!dialog.open) dialog.showModal();
  (fields.find((f) => !f.value) ?? fields[0]).focus();
}

function finish() {
  const then = afterSignIn;
  afterSignIn = null;
  dialog.close();
  then?.();
}

function renderBar() {
  const area = document.querySelector('#account-area');
  if (!isConfigured()) {
    area.replaceChildren(h('span', { class: 'muted small' }, 'On this device only'));
    return;
  }
  const user = currentUser();
  if (!user) {
    area.replaceChildren(h('button', { class: 'top-btn primary', onclick: () => showSignIn() }, 'Sign in'));
    return;
  }
  area.replaceChildren(
    h('span', { class: `sync-dot ${syncStatus().state}`, title: statusText(), 'aria-label': statusText() }),
    h('span', { class: 'avatar', 'aria-hidden': 'true' }, user.email[0].toUpperCase()),
    h('span', { class: 'top-email', title: user.email }, user.email),
    h('button', { class: 'top-btn', onclick: () => signOut() }, 'Sign out'),
  );
}

export function initAccount() {
  dialog = h('dialog', { class: 'auth-dialog' });
  dialog.addEventListener('close', () => { afterSignIn = null; });
  document.body.append(dialog);
  window.addEventListener('auth-changed', renderBar);
  window.addEventListener('sync-status', renderBar);
  // Arrived from a "reset password" email: ask for the new password.
  window.addEventListener('password-recovery', () => openMode('newpass'));
  renderBar();
}
