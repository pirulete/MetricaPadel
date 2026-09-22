"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { usePushSubscription } from "@/hooks/use-push-subscription";

const DISMISSED_KEY = "push_prompt_dismissed";
const COOLDOWN_KEY = "push_prompt_cooldown";
const INTERACTIONS_KEY = "push_prompt_interactions";
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
const SHOW_AFTER_INTERACTIONS = 2;
const SHOW_AFTER_MS = 30_000;

/**
 * Soft prompt no intrusivo para activar push.
 * Se muestra tras la 2da interacción del usuario o 30s, respeta
 * "no preguntar de nuevo" (localStorage) y cooldown de 14d tras "Ahora no".
 */
export function PushSoftPrompt() {
  const { isPushSupported, isSubscribed, loading, subscribe } = usePushSubscription();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (loading || !isPushSupported || isSubscribed) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted" || Notification.permission === "denied") return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const lastDismissed = Number(localStorage.getItem(COOLDOWN_KEY) ?? 0);
    if (Date.now() - lastDismissed < COOLDOWN_MS) return;

    // 2da interacción (pointerdown) en esta sesión
    const onInteraction = () => {
      const count = Number(sessionStorage.getItem(INTERACTIONS_KEY) ?? 0) + 1;
      sessionStorage.setItem(INTERACTIONS_KEY, String(count));
      if (count >= SHOW_AFTER_INTERACTIONS) setVisible(true);
    };
    document.addEventListener("pointerdown", onInteraction);

    // Fallback: 30s
    const timer = setTimeout(() => setVisible(true), SHOW_AFTER_MS);

    if (Number(sessionStorage.getItem(INTERACTIONS_KEY) ?? 0) >= SHOW_AFTER_INTERACTIONS) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(true);
    }

    return () => {
      document.removeEventListener("pointerdown", onInteraction);
      clearTimeout(timer);
    };
  }, [loading, isPushSupported, isSubscribed]);

  const handleEnable = async () => {
    const result = await subscribe();
    if (result.success) {
      toast.success("Notificaciones activadas");
      setVisible(false);
    } else if (result.error) {
      toast.error(result.error);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
    setVisible(false);
  };

  const handleNever = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  };

  if (!visible || isSubscribed) return null;

  return (
    <div className="mb-6 flex items-start gap-3 rounded-lg border border-border bg-secondary/50 p-4">
      <Bell className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-sm font-medium">¿Quieres recibir notificaciones?</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Te avisamos cuando haya novedades importantes.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleEnable}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Activar
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/80"
          >
            Ahora no
          </button>
          <button
            type="button"
            onClick={handleNever}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            No mostrar de nuevo
          </button>
        </div>
      </div>
    </div>
  );
}