"use client";

import { useEffect } from "react";

/**
 * Registra el Service Worker de push con scope raíz (/).
 * Solo en producción o localhost (nunca en http remoto — el SW requiere
 * contexto seguro; en dev localhost es tratado como seguro).
 * Limpia workers viejos de /serwist/ que queden de builds anteriores
 * (dos workers con scopes distintos al mismo sitio compiten y silencian push).
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !navigator.serviceWorker) return;

    const isLocalhost =
      window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (process.env.NODE_ENV !== "production" && !isLocalhost) return;
    if (!window.isSecureContext) return;

    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        for (const reg of registrations) {
          if (reg.scope.includes("/serwist")) {
            reg.unregister().catch(() => {});
          }
        }
      })
      .catch(() => {});

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => {
        // Progressive enhancement: nunca rompe la web
      });
  }, []);

  return null;
}