/**
 * Unit tests del push sender (web-push mockeado).
 * Cubre: single send, manejo 404/410 (markEndpointExpired), errores no-404/410,
 * getVapidPublicKey, bulk fire-and-forget y tracked.
 * @jest-environment node
 */
jest.mock("web-push", () => ({
  __esModule: true,
  default: {
    setVapidDetails: jest.fn(),
    sendNotification: jest.fn(),
  },
}));

jest.mock("@/lib/db/queries/push", () => ({
  getActiveForBroadcast: jest.fn(),
  markEndpointExpired: jest.fn(),
}));

import webPush from "web-push";
import { getActiveForBroadcast, markEndpointExpired } from "@/lib/db/queries/push";
import {
  sendPushNotification,
  sendBulkPush,
  sendBulkPushTracked,
  getVapidPublicKey,
} from "@/lib/push/sender";

const mockWebPush = webPush as jest.Mocked<typeof webPush>;
const mockSendNotification = mockWebPush.sendNotification as jest.Mock;
const mockMarkExpired = markEndpointExpired as jest.Mock;
const mockGetActive = getActiveForBroadcast as jest.Mock;

const sub = { endpoint: "https://push.example.com/abc", p256dh: "p256", auth: "auth" };
const payload = { title: "Título", body: "Cuerpo" };

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "pub-key";
  process.env.VAPID_PRIVATE_KEY = "priv-key";
  process.env.VAPID_SUBJECT = "mailto:test@example.com";
  mockMarkExpired.mockResolvedValue(null);
  mockGetActive.mockResolvedValue([]);
});

describe("sendPushNotification", () => {
  it("envía con VAPID configurado y retorna success", async () => {
    mockSendNotification.mockResolvedValue(undefined);

    const result = await sendPushNotification(sub, payload);

    expect(result).toEqual({ success: true, endpoint: sub.endpoint });
    expect(mockWebPush.setVapidDetails).toHaveBeenCalledWith(
      "mailto:test@example.com",
      "pub-key",
      "priv-key",
    );
    expect(mockMarkExpired).not.toHaveBeenCalled();
  });

  it("marca endpoint como expired en 404 (Gone)", async () => {
    mockSendNotification.mockRejectedValue({ statusCode: 404, message: "Gone" });

    const result = await sendPushNotification(sub, payload);

    expect(result.success).toBe(false);
    expect(result.error).toContain("404");
    expect(mockMarkExpired).toHaveBeenCalledWith(sub.endpoint);
  });

  it("marca endpoint como expired en 410 (Gone)", async () => {
    mockSendNotification.mockRejectedValue({ statusCode: 410, message: "Gone" });

    const result = await sendPushNotification(sub, payload);

    expect(result.success).toBe(false);
    expect(mockMarkExpired).toHaveBeenCalledWith(sub.endpoint);
  });

  it("NO marca expired en errores que no son 404/410", async () => {
    mockSendNotification.mockRejectedValue({ statusCode: 500, message: "Server error" });

    const result = await sendPushNotification(sub, payload);

    expect(result.success).toBe(false);
    expect(result.error).toContain("500");
    expect(mockMarkExpired).not.toHaveBeenCalled();
  });
});

describe("getVapidPublicKey", () => {
  it("retorna la key pública configurada", () => {
    expect(getVapidPublicKey()).toBe("pub-key");
  });

  it("lanza si no hay key pública configurada", () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PUBLIC_KEY;
    expect(() => getVapidPublicKey()).toThrow("VAPID");
  });
});

describe("sendBulkPush (fire-and-forget)", () => {
  it("envía a cada subscripción pasada como objeto", async () => {
    mockSendNotification.mockResolvedValue(undefined);

    await sendBulkPush([sub, { ...sub, endpoint: "https://push.example.com/def" }], payload);
    await flush();

    expect(mockSendNotification).toHaveBeenCalledTimes(2);
  });

  it("filtra por userIds cuando recibe string[]", async () => {
    mockGetActive.mockResolvedValue([
      { ...sub, userId: "u1" },
      { ...sub, endpoint: "https://push.example.com/def", userId: "u2" },
    ]);
    mockSendNotification.mockResolvedValue(undefined);

    await sendBulkPush(["u1"], payload);
    await flush();

    expect(mockSendNotification).toHaveBeenCalledTimes(1);
  });

  it("no envía con targets vacíos", async () => {
    await sendBulkPush([], payload);
    await flush();

    expect(mockSendNotification).not.toHaveBeenCalled();
  });
});

describe("sendBulkPushTracked", () => {
  it("retorna sent/failed counts", async () => {
    mockSendNotification.mockResolvedValue(undefined);

    const result = await sendBulkPushTracked([sub], payload);

    expect(result).toEqual({ sent: 1, failed: 0 });
  });

  it("cuenta fallos", async () => {
    mockSendNotification
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({ statusCode: 500, message: "err" });

    const result = await sendBulkPushTracked(
      [sub, { ...sub, endpoint: "https://push.example.com/def" }],
      payload,
    );

    expect(result).toEqual({ sent: 1, failed: 1 });
  });
});