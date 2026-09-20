"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type NotificationCategory =
  | "system"
  | "account"
  | "billing"
  | "marketing"
  | "social"
  | "custom";
export type NotificationChannel = "inbox" | "push";

export interface NotificationItem {
  id: string;
  type: string;
  priority: string;
  title: string;
  body: string | null;
  ctaUrl: string | null;
  ctaLabel: string | null;
  read: number;
  category: NotificationCategory;
  createdAt: string;
}

export interface NotificationPreference {
  id: string;
  channel: NotificationChannel;
  category: NotificationCategory;
  enabled: boolean;
}

export interface FetchNotificationsOptions {
  category?: NotificationCategory;
  unread?: boolean;
  /** true → reemplaza la lista (primera página); false → appenda con cursor. */
  reset?: boolean;
}

export interface UseNotificationsReturn {
  notifications: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  preferences: NotificationPreference[];
  fetchNotifications: (opts?: FetchNotificationsOptions) => Promise<NotificationItem[]>;
  fetchUnreadCount: () => Promise<number>;
  markAsRead: (ids: string[]) => Promise<boolean>;
  markAllAsRead: () => Promise<boolean>;
  deleteNotification: (id: string) => Promise<boolean>;
  fetchPreferences: () => Promise<NotificationPreference[]>;
  updatePreference: (
    channel: NotificationChannel,
    category: NotificationCategory,
    enabled: boolean,
  ) => Promise<boolean>;
}

const UNREAD_POLL_MS = 30_000;

/**
 * Hook client para el inbox de notificaciones.
 * Lista paginada por cursor, unread count con polling (30s + focus),
 * mark-read batch, soft-delete y preferencias canal/categoría.
 */
export function useNotifications(): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const nextCursorRef = useRef<string | null>(null);
  const requestSeqRef = useRef(0);

  const fetchUnreadCount = useCallback(async (): Promise<number> => {
    try {
      const res = await fetch("/api/user/notifications/unread-count");
      if (!res.ok) throw new Error("Error obteniendo contador");
      const data = (await res.json()) as { count: number };
      setUnreadCount(data.count);
      return data.count;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error obteniendo contador");
      return 0;
    }
  }, []);

  const fetchNotifications = useCallback(
    async (opts: FetchNotificationsOptions = {}): Promise<NotificationItem[]> => {
      const { category, unread, reset = false } = opts;
      const seq = ++requestSeqRef.current;
      if (reset) {
        nextCursorRef.current = null;
        setHasMore(true);
      }
      if (!hasMore && !reset) return [];

      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (category) params.set("category", category);
        if (unread !== undefined) params.set("unread", String(unread));
        if (nextCursorRef.current) params.set("cursor", nextCursorRef.current);

        const res = await fetch(`/api/user/notifications?${params.toString()}`);
        if (!res.ok) throw new Error("Error obteniendo notificaciones");
        const data = (await res.json()) as {
          items: NotificationItem[];
          nextCursor: string | null;
          unread: number;
        };

        if (seq !== requestSeqRef.current) return data.items; // respuesta obsoleta
        setNotifications((prev) => (reset ? data.items : [...prev, ...data.items]));
        nextCursorRef.current = data.nextCursor;
        setHasMore(!!data.nextCursor);
        setUnreadCount(data.unread);
        return data.items;
      } catch (err) {
        if (seq === requestSeqRef.current) {
          setError(err instanceof Error ? err.message : "Error obteniendo notificaciones");
        }
        return [];
      } finally {
        if (seq === requestSeqRef.current) setLoading(false);
      }
    },
    [hasMore],
  );

  // Primera página al montar
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchNotifications();
  }, [fetchNotifications]);

  // Polling de unread count: 30s + al volver a la pestaña
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchUnreadCount();
    const interval = setInterval(() => void fetchUnreadCount(), UNREAD_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void fetchUnreadCount();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchUnreadCount]);

  const markAsRead = useCallback(async (ids: string[]): Promise<boolean> => {
    if (ids.length === 0) return true;
    try {
      const res = await fetch("/api/user/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, read: true }),
      });
      if (!res.ok) throw new Error("Error marcando como leída");
      const data = (await res.json()) as { updated: number };
      setNotifications((prev) =>
        prev.map((n) => (ids.includes(n.id) ? { ...n, read: 1 } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - data.updated));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error marcando como leída");
      return false;
    }
  }, []);

  const markAllAsRead = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/user/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      });
      if (!res.ok) throw new Error("Error marcando todo como leído");
      await res.json();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: 1 })));
      setUnreadCount(0);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error marcando todo como leído");
      return false;
    }
  }, []);

  const deleteNotification = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/user/notifications/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error eliminando notificación");
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error eliminando notificación");
      return false;
    }
  }, []);

  const fetchPreferences = useCallback(async (): Promise<NotificationPreference[]> => {
    try {
      const res = await fetch("/api/user/notifications/preferences");
      if (!res.ok) throw new Error("Error obteniendo preferencias");
      const data = (await res.json()) as { preferences: NotificationPreference[] };
      setPreferences(data.preferences);
      return data.preferences;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error obteniendo preferencias");
      return [];
    }
  }, []);

  const updatePreference = useCallback(
    async (
      channel: NotificationChannel,
      category: NotificationCategory,
      enabled: boolean,
    ): Promise<boolean> => {
      try {
        const res = await fetch("/api/user/notifications/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel, category, enabled }),
        });
        if (!res.ok) throw new Error("Error actualizando preferencia");
        setPreferences((prev) => {
          const existing = prev.find((p) => p.channel === channel && p.category === category);
          if (existing) {
            return prev.map((p) => (p === existing ? { ...p, enabled } : p));
          }
          return [...prev, { id: `local-${channel}-${category}`, channel, category, enabled }];
        });
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error actualizando preferencia");
        return false;
      }
    },
    [],
  );

  return {
    notifications,
    unreadCount,
    loading,
    error,
    hasMore,
    preferences,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    fetchPreferences,
    updatePreference,
  };
}