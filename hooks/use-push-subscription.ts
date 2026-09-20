"use client";

import { useCallback, useEffect, useState } from "react";

const SW_READY_TIMEOUT_MS = 3_000;

export interface UsePushSubscriptionReturn {
  isPushSupported: boolean;
  isSubscribed: boolean;
  permission: NotificationPermission | "unsupported";
  loading: boolean;
  subscribe: () => Promise<{ success: boolean; error?: string }>;
  unsubscribe: () => Promise<{ success: boolean; error?: string }>;
}

/**
 * Helper con timeout para serviceWorker.ready.
 * Si el SW no está registrado (dev, SW fallo), la promesa never resuelve.
 * Timeout 3s → fallback seguro.
 */
function getReadyRegistration(): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Service Worker not ready")), SW_READY_TIMEOUT_MS),
    ),
  ]);
}

/**
 * Hook para gestionar la suscripción push del navegador.
 * Requiere Service Worker registrado + PushManager disponible.
 * Maneja pushsubscriptionchange (rotación/expiración de suscripción por el push service).
 */
export function usePushSubscription(): UsePushSubscriptionReturn {
  const [isPushSupported, setIsPushSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [loading, setLoading] = useState(true);

  // Check browser support + existing subscription on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    const supported = "serviceWorker" in navigator && "PushManager" in window;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsPushSupported(supported);

    if (!supported) {
      setLoading(false);
      return;
    }

    setPermission(Notification.permission);

    getReadyRegistration()
      .then(async (registration) => {
        const subscription = await registration.pushManager.getSubscription();
        setIsSubscribed(!!subscription);
        setPermission(Notification.permission);
      })
      .catch(() => {
        // SW not ready (timeout or error) — fallback gracefully
      })
      .finally(() => setLoading(false));
  }, []);

  // Re-subscribe on pushsubscriptionchange (suscripción rotada/expirada por el push service)
  useEffect(() => {
    if (!isPushSupported) return;

    getReadyRegistration()
      .then((registration) => {
        registration.addEventListener("pushsubscriptionchange", (event) => {
          const newSubscription = (event as { newSubscription?: PushSubscription | null }).newSubscription;
          if (newSubscription) {
            void persistSubscriptionObject(newSubscription);
          } else {
            void persistSubscription(registration);
          }
        });
      })
      .catch(() => {});
  }, [isPushSupported]);

  const subscribe = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!isPushSupported) {
      return { success: false, error: "Las notificaciones push no son compatibles con este navegador" };
    }

    try {
      const granted = await Notification.requestPermission();
      setPermission(granted);
      if (granted !== "granted") {
        return { success: false, error: "Permiso de notificaciones denegado" };
      }

      const registration = await getReadyRegistration();
      const result = await persistSubscription(registration);
      if (!result.success) return result;

      setIsSubscribed(true);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Error desconocido" };
    }
  }, [isPushSupported]);

  const unsubscribe = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!isPushSupported) {
      return { success: false, error: "Las notificaciones push no son compatibles" };
    }

    try {
      const registration = await getReadyRegistration();
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
      }

      // Revoke on server (endpoint from the subscription we just unsubscribed)
      const endpoint = subscription?.endpoint;
      if (endpoint) {
        await fetch("/api/user/push/subscription", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        }).catch(() => {});
      }

      setIsSubscribed(false);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Error desconocido" };
    }
  }, [isPushSupported]);

  return {
    isPushSupported,
    isSubscribed,
    permission,
    loading,
    subscribe,
    unsubscribe,
  };
}

// ─── Helpers ───

/** Obtiene VAPID key, subscribe en el browser y persiste en el servidor. */
async function persistSubscription(
  registration: ServiceWorkerRegistration,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch("/api/user/push/vapid-key");
    if (!res.ok) {
      return { success: false, error: "Error obteniendo clave de notificaciones" };
    }
    const { publicKey } = (await res.json()) as { publicKey: string };

    const applicationServerKey = urlBase64ToUint8Array(publicKey) as unknown as BufferSource;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });

    return await persistSubscriptionObject(subscription);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error desconocido" };
  }
}

/** Persiste una suscripción ya existente (pushsubscriptionchange con newSubscription). */
async function persistSubscriptionObject(
  subscription: PushSubscription,
): Promise<{ success: boolean; error?: string }> {
  try {
    const subJson = subscription.toJSON();

    const persistRes = await fetch("/api/user/push/subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        p256dh: (subJson.keys as Record<string, string>)?.p256dh,
        auth: (subJson.keys as Record<string, string>)?.auth,
        deviceType: /Mobi/.test(navigator.userAgent) ? "mobile" : "desktop",
        browser: detectBrowser(),
        os: detectOS(),
      }),
    });

    if (!persistRes.ok) {
      const data = (await persistRes.json().catch(() => ({}))) as { error?: string };
      return { success: false, error: data.error || "Error al guardar suscripción" };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error desconocido" };
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function detectBrowser(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/Chrome/.test(ua) && !/Edg/.test(ua)) return "Chrome";
  if (/Firefox/.test(ua)) return "Firefox";
  if (/Safari/.test(ua) && !/Chrome/.test(ua)) return "Safari";
  if (/Edg/.test(ua)) return "Edge";
  return "Other";
}

function detectOS(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/Win/.test(ua)) return "Windows";
  if (/Mac/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPad/.test(ua)) return "iOS";
  return "Other";
}