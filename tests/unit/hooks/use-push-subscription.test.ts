/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { usePushSubscription } from "@/hooks/use-push-subscription";

const mockSubscription = {
  endpoint: "https://push.example.com/sub/abc",
  toJSON: () => ({
    endpoint: "https://push.example.com/sub/abc",
    keys: { p256dh: "p256dh-key", auth: "auth-key" },
  }),
  unsubscribe: jest.fn().mockResolvedValue(true),
};

const mockRegistration = {
  pushManager: {
    getSubscription: jest.fn(),
    subscribe: jest.fn(),
  },
  addEventListener: jest.fn(),
};

const mockReady = Promise.resolve(mockRegistration);

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

function mockFetch() {
  global.fetch = jest.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u === "/api/user/push/vapid-key") {
      return jsonResponse({ publicKey: "vapid-public-key" });
    }
    if (u === "/api/user/push/subscription" && init?.method === "POST") {
      return jsonResponse({ id: "sub-id" }, 201);
    }
    if (u === "/api/user/push/subscription" && init?.method === "DELETE") {
      return jsonResponse({ ok: true });
    }
    return jsonResponse({}, 404);
  }) as jest.Mock;
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { ready: mockReady },
  });
  (window as unknown as { PushManager: unknown }).PushManager = class {};
  (globalThis as unknown as { Notification: unknown }).Notification = {
    permission: "default",
    requestPermission: jest.fn().mockResolvedValue("granted"),
  };
  mockRegistration.pushManager.getSubscription.mockResolvedValue(null);
  mockRegistration.pushManager.subscribe.mockResolvedValue(mockSubscription);
  mockFetch();
});

describe("usePushSubscription", () => {
  it("detecta falta de soporte (sin PushManager)", async () => {
    delete (window as unknown as { PushManager?: unknown }).PushManager;

    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isPushSupported).toBe(false);
    expect(result.current.isSubscribed).toBe(false);
    expect(result.current.permission).toBe("unsupported");
  });

  it("detecta suscripción existente al montar", async () => {
    mockRegistration.pushManager.getSubscription.mockResolvedValue(mockSubscription);

    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isPushSupported).toBe(true);
    expect(result.current.isSubscribed).toBe(true);
    expect(result.current.permission).toBe("default");
  });

  it("subscribe: pide permiso, obtiene VAPID, subscribe y persiste", async () => {
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome: { success: boolean; error?: string } | undefined;
    await act(async () => {
      outcome = await result.current.subscribe();
    });

    expect(outcome?.success).toBe(true);
    expect(Notification.requestPermission).toHaveBeenCalled();
    expect(mockRegistration.pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: expect.any(Uint8Array),
    });
    expect(global.fetch).toHaveBeenCalledWith("/api/user/push/vapid-key");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/user/push/subscription",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.current.isSubscribed).toBe(true);
    expect(result.current.permission).toBe("granted");
  });

  it("subscribe con permiso denegado → error y no subscribe", async () => {
    (Notification.requestPermission as jest.Mock).mockResolvedValue("denied");

    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome: { success: boolean; error?: string } | undefined;
    await act(async () => {
      outcome = await result.current.subscribe();
    });

    expect(outcome?.success).toBe(false);
    expect(outcome?.error).toContain("denegado");
    expect(mockRegistration.pushManager.subscribe).not.toHaveBeenCalled();
    expect(result.current.isSubscribed).toBe(false);
  });

  it("unsubscribe: desuscribe en browser y revoca en servidor", async () => {
    mockRegistration.pushManager.getSubscription.mockResolvedValue(mockSubscription);

    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isSubscribed).toBe(true);

    let outcome: { success: boolean; error?: string } | undefined;
    await act(async () => {
      outcome = await result.current.unsubscribe();
    });

    expect(outcome?.success).toBe(true);
    expect(mockSubscription.unsubscribe).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/user/push/subscription",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ endpoint: mockSubscription.endpoint }),
      }),
    );
    expect(result.current.isSubscribed).toBe(false);
  });

  it("registra listener de pushsubscriptionchange al montar", async () => {
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockRegistration.addEventListener).toHaveBeenCalledWith(
      "pushsubscriptionchange",
      expect.any(Function),
    );
    expect(result.current.isPushSupported).toBe(true);
  });
});