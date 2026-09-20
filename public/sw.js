/* Service Worker — Push Notifications (whitelabel skeleton)
 * Estático en /public/sw.js (App Router lo sirve sin config).
 * Eventos: push (mostrar), notificationclick (focus + CTR), pushsubscriptionchange (re-subscribe).
 */
self.addEventListener("push", (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "Nueva notificación";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      // CTR tracking fire-and-forget (no bloquea la navegación)
      try {
        const sub = await self.registration.pushManager.getSubscription();
        if (sub) {
          fetch("/api/user/push/click", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint, url, eventType: "click" }),
          }).catch(() => {
            // fire-and-forget: el tracking nunca bloquea la navegación
          });
        }
      } catch {
        // sin suscripción activa → no hay endpoint para trackear
      }

      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windowClients) {
        if ("focus" in client) {
          await client.focus();
          try {
            await client.navigate(url);
          } catch {
            // URL cross-origin o navegación no permitida → solo focus
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(url);
      }
    })(),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch("/api/user/push/vapid-key");
        if (!res.ok) return;
        const { publicKey } = await res.json();
        const applicationServerKey = urlBase64ToUint8Array(publicKey);
        const subscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
        const subJson = subscription.toJSON();
        await fetch("/api/user/push/subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: subJson.endpoint,
            p256dh: subJson.keys && subJson.keys.p256dh,
            auth: subJson.keys && subJson.keys.auth,
          }),
});
        } catch {
          // push deshabilitado o VAPID no configurado → no re-subscribe
        }
    })(),
  );
});

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}