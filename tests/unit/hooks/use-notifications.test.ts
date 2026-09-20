/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { useNotifications } from "@/hooks/use-notifications";

const items = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    type: "info",
    priority: "P2",
    title: "Hola",
    body: null,
    ctaUrl: null,
    ctaLabel: null,
    read: 0,
    category: "system",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    type: "info",
    priority: "P2",
    title: "Chau",
    body: null,
    ctaUrl: null,
    ctaLabel: null,
    read: 1,
    category: "account",
    createdAt: "2026-01-02T00:00:00.000Z",
  },
];

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u === "/api/user/notifications/unread-count") {
      return jsonResponse({ count: 1 });
    }
    if (u.startsWith("/api/user/notifications?")) {
      return jsonResponse({ items, nextCursor: null, unread: 1 });
    }
    if (u === "/api/user/notifications" && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body)) as { ids?: string[] };
      return jsonResponse({ updated: body.ids ? body.ids.length : 1 });
    }
    if (u === "/api/user/notifications/preferences" && init?.method === "PUT") {
      return jsonResponse({ ok: true });
    }
    if (u === "/api/user/notifications/preferences") {
      return jsonResponse({ preferences: [] });
    }
    if (u.startsWith("/api/user/notifications/") && init?.method === "DELETE") {
      return jsonResponse({ ok: true });
    }
    return jsonResponse({}, 404);
  }) as jest.Mock;
  global.fetch = fetchMock;
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useNotifications", () => {
  it("carga primera página y unread count al montar", async () => {
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.notifications).toHaveLength(2);
    expect(result.current.unreadCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/user/notifications/unread-count");
  });

  it("fetchNotifications pagina con cursor y appenda", async () => {
    fetchMock.mockImplementation((url: RequestInfo | URL) => {
      const u = String(url);
      if (u === "/api/user/notifications/unread-count") return jsonResponse({ count: 1 });
      if (u.startsWith("/api/user/notifications?")) {
        if (u.includes("cursor=")) {
          return jsonResponse({ items: [items[1]], nextCursor: null, unread: 0 });
        }
        return jsonResponse({ items, nextCursor: "2026-01-02T00:00:00.000Z", unread: 1 });
      }
      return jsonResponse({}, 404);
    });

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notifications).toHaveLength(2);
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      await result.current.fetchNotifications();
    });

    expect(result.current.notifications).toHaveLength(3);
    expect(result.current.hasMore).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("cursor=2026-01-02T00%3A00%3A00.000Z"),
    );
  });

  it("fetchNotifications con reset reemplaza la lista", async () => {
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.fetchNotifications({ reset: true, unread: true });
    });

    expect(result.current.notifications).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("unread=true"));
  });

  it("markAsRead: PATCH batch y actualiza estado local", async () => {
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.markAsRead([items[0].id]);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/user/notifications",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ ids: [items[0].id], read: true }),
      }),
    );
    expect(result.current.notifications.find((n) => n.id === items[0].id)?.read).toBe(1);
    expect(result.current.unreadCount).toBe(0);
  });

  it("markAllAsRead: PATCH sin ids y resetea contador", async () => {
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.markAllAsRead();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/user/notifications",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ read: true }) }),
    );
    expect(result.current.notifications.every((n) => n.read === 1)).toBe(true);
    expect(result.current.unreadCount).toBe(0);
  });

  it("deleteNotification: DELETE soft y remueve del estado", async () => {
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteNotification(items[0].id);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/user/notifications/${items[0].id}`,
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].id).toBe(items[1].id);
  });

  it("fetchPreferences carga preferencias", async () => {
    fetchMock.mockImplementation((url: RequestInfo | URL) => {
      const u = String(url);
      if (u === "/api/user/notifications/unread-count") return jsonResponse({ count: 0 });
      if (u.startsWith("/api/user/notifications?")) {
        return jsonResponse({ items: [], nextCursor: null, unread: 0 });
      }
      if (u === "/api/user/notifications/preferences") {
        return jsonResponse({
          preferences: [{ id: "p1", channel: "push", category: "system", enabled: false }],
        });
      }
      return jsonResponse({}, 404);
    });

    const { result } = renderHook(() => useNotifications());
    await act(async () => {
      await result.current.fetchPreferences();
    });

    expect(result.current.preferences).toHaveLength(1);
    expect(result.current.preferences[0].enabled).toBe(false);
  });

  it("updatePreference: PUT y actualiza estado local", async () => {
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updatePreference("push", "system", false);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/user/notifications/preferences",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ channel: "push", category: "system", enabled: false }),
      }),
    );
    expect(result.current.preferences).toEqual([
      expect.objectContaining({ channel: "push", category: "system", enabled: false }),
    ]);
  });

  it("refetch unread count al volver a la pestaña (visibilitychange)", async () => {
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const before = fetchMock.mock.calls.filter(
      ([u]) => String(u) === "/api/user/notifications/unread-count",
    ).length;

    await act(async () => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    const after = fetchMock.mock.calls.filter(
      ([u]) => String(u) === "/api/user/notifications/unread-count",
    ).length;
    expect(after).toBe(before + 1);
    expect(result.current.unreadCount).toBe(1);
  });

  it("polling: refetch unread count cada 30s", async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useNotifications());
    await act(async () => {});

    const before = fetchMock.mock.calls.filter(
      ([u]) => String(u) === "/api/user/notifications/unread-count",
    ).length;
    expect(before).toBe(1);

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    const after = fetchMock.mock.calls.filter(
      ([u]) => String(u) === "/api/user/notifications/unread-count",
    ).length;
    expect(after).toBe(2);
    expect(result.current.unreadCount).toBe(1);
  });
});