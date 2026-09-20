"use client";

/**
 * Hook de fetch para el admin de marketing.
 * Maneja loading/error/data con patrón de efecto compliant con
 * react-hooks/set-state-in-effect (setState solo en callbacks async).
 */
import { useCallback, useEffect, useState } from "react";
import { apiError as parseAdminError } from "@/lib/marketing/api-error";

export { parseAdminError };

export function useAdminFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) throw new Error(await parseAdminError(res));
        const json = (await res.json()) as T;
        setData(json);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error de red");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, tick]);

  const reload = useCallback(() => {
    setLoading(true);
    setTick((t) => t + 1);
  }, []);

  return { data, loading, error, reload };
}
