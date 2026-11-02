"use client"

/**
 * Puente cliente entre `/transiciones` (server, `validateAdmin`) y
 * `TransitionLibrary` (presentacional de T9): aporta el estado del fetch con
 * `use-transitions` (lista paginada, loading, error, reintento, cargar más).
 */

import { useTransitions } from "@/hooks/use-transitions"
import { TransitionLibrary } from "./transition-library"

export function TransitionLibraryView() {
  const { transitions, loading, loadingMore, error, hasMore, reload, loadMore } = useTransitions()

  return (
    <TransitionLibrary
      transitions={transitions}
      loading={loading}
      loadingMore={loadingMore}
      error={error}
      hasMore={hasMore}
      onRetry={reload}
      onLoadMore={loadMore}
    />
  )
}
