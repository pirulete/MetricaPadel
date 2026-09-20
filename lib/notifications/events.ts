// Simple event bus for cross-component notification sync
const NOTIFICATION_READ_EVENT = 'notifications:read';

export function notifyRead() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(NOTIFICATION_READ_EVENT));
    // Sync app badge — clear when user reads notifications in-app
    if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge().catch(() => {});
    }
  }
}

export function onNotificationRead(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => callback();
  window.addEventListener(NOTIFICATION_READ_EVENT, handler);
  return () => window.removeEventListener(NOTIFICATION_READ_EVENT, handler);
}