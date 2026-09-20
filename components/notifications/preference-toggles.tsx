"use client";

import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import {
  useNotifications,
  type NotificationCategory,
  type NotificationChannel,
} from "@/hooks/use-notifications";

const CATEGORIES: NotificationCategory[] = [
  "system",
  "account",
  "billing",
  "marketing",
  "social",
  "custom",
];
const CHANNELS: NotificationChannel[] = ["inbox", "push"];

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  system: "Sistema",
  account: "Cuenta",
  billing: "Facturación",
  marketing: "Marketing",
  social: "Social",
  custom: "Personalizadas",
};

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  inbox: "Inbox",
  push: "Push",
};

/**
 * Toggles de preferencias por canal (inbox/push) × categoría.
 * Default enabled=true si el usuario no configuró la fila.
 */
export function PreferenceToggles() {
  const { preferences, fetchPreferences, updatePreference } = useNotifications();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchPreferences().finally(() => setLoading(false));
  }, [fetchPreferences]);

  const isEnabled = (channel: NotificationChannel, category: NotificationCategory) => {
    const pref = preferences.find((p) => p.channel === channel && p.category === category);
    return pref ? pref.enabled : true;
  };

  const handleToggle = async (
    channel: NotificationChannel,
    category: NotificationCategory,
    enabled: boolean,
  ) => {
    await updatePreference(channel, category, enabled);
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Cargando preferencias...</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {CATEGORIES.map((category) => (
        <div key={category} className="rounded-lg border border-border p-4">
          <p className="mb-3 text-sm font-medium">{CATEGORY_LABELS[category]}</p>
          <div className="space-y-2">
            {CHANNELS.map((channel) => (
              <div key={channel} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{CHANNEL_LABELS[channel]}</span>
                <Switch
                  checked={isEnabled(channel, category)}
                  onCheckedChange={(checked) => void handleToggle(channel, category, checked)}
                  aria-label={`${CATEGORY_LABELS[category]} ${CHANNEL_LABELS[channel]}`}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}