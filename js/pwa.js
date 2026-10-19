// Service worker + "Install app" support.
let deferredPrompt = null;

export function registerPWA() {
  if ('serviceWorker' in navigator && window.isSecureContext) {
    // When an updated version takes over (after a deploy), reload once to show it.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .catch((err) => console.warn('SW registration failed', err));
  }
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    window.dispatchEvent(new Event('installable'));
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.dispatchEvent(new Event('installable'));
  });
}

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export const canPromptInstall = () => deferredPrompt != null;

export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome === 'accepted';
}
