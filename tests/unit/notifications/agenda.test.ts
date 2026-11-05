/**
 * Unit tests de `notifyClassEvent` (inbox-first + push best-effort, v0.11 D11/D12).
 * @jest-environment node
 */
jest.mock("@/lib/notifications/engine", () => ({
  createNotification: jest.fn(),
}));
jest.mock("@/lib/db/queries/notifications", () => ({
  getNotificationPreferences: jest.fn(),
}));
jest.mock("@/lib/db/queries/push", () => ({
  getActiveSubscriptions: jest.fn(),
}));
jest.mock("@/lib/push/sender", () => ({
  sendBulkPushTracked: jest.fn(),
}));

import { notifyClassEvent } from "@/lib/notifications/agenda";
import { createNotification } from "@/lib/notifications/engine";
import { getNotificationPreferences } from "@/lib/db/queries/notifications";
import { getActiveSubscriptions } from "@/lib/db/queries/push";
import { sendBulkPushTracked } from "@/lib/push/sender";
import { agendaEventKey, agendaGroupId } from "@/lib/padel/agenda-group-id";
import { formatBlockDateTime } from "@/lib/padel/class-agenda";
import type { notifications } from "@/lib/db/schema";

const mockedCreate = createNotification as jest.MockedFunction<typeof createNotification>;
const mockedPrefs = getNotificationPreferences as jest.MockedFunction<typeof getNotificationPreferences>;
const mockedSubs = getActiveSubscriptions as jest.MockedFunction<typeof getActiveSubscriptions>;
const mockedPush = sendBulkPushTracked as jest.MockedFunction<typeof sendBulkPushTracked>;

const BLOCK = "7f3c9a1e-2b4d-4c5e-9f60-1a2b3c4d5e6f";
const STUDENT = "0b5c7d8e-1111-4222-8333-444455556666";

const baseParams = {
  event: "assigned" as const,
  studentId: STUDENT,
  blockId: BLOCK,
  courseName: "Iniciación",
  blockDate: "2026-11-04",
  startTime: "18:00",
};

const fakeNotification = {
  id: "n1",
  userId: STUDENT,
  type: "info",
  priority: "P2",
  title: "Nueva clase agendada",
  body: "Iniciación · lun 4 nov · 18:00",
  read: 0,
  groupId: agendaGroupId(BLOCK, "assigned", STUDENT),
  category: "system",
  ctaUrl: "/dashboard#proximas-clases",
  ctaLabel: "Ver mi clase",
  deletedAt: null,
  metadata: { blockId: BLOCK, eventKey: agendaEventKey(BLOCK, "assigned", STUDENT) },
  createdAt: new Date("2026-11-04T10:00:00Z"),
} satisfies typeof notifications.$inferSelect;

const fakeSub = {
  endpoint: "https://push.example.com/abc",
  p256dh: "p256dh",
  auth: "auth",
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  mockedCreate.mockResolvedValue(fakeNotification);
  mockedPrefs.mockResolvedValue([]);
  mockedSubs.mockResolvedValue([fakeSub] as Awaited<ReturnType<typeof getActiveSubscriptions>>);
  mockedPush.mockResolvedValue({ sent: 1, failed: 0 });
});

describe("notifyClassEvent", () => {
  it("assigned: inbox con copy P2/system, groupId uuid v5 y metadata.eventKey, y 1 push", async () => {
    const when = formatBlockDateTime(baseParams.blockDate, baseParams.startTime);
    const result = await notifyClassEvent(baseParams);

    expect(result).toEqual({ inboxCreated: true, pushSent: 1 });
    expect(mockedCreate).toHaveBeenCalledWith({
      userId: STUDENT,
      type: "info",
      priority: "P2",
      title: "Nueva clase agendada",
      body: `Iniciación · ${when}`,
      ctaUrl: "/dashboard#proximas-clases",
      ctaLabel: "Ver mi clase",
      groupId: agendaGroupId(BLOCK, "assigned", STUDENT),
      category: "system",
      metadata: { blockId: BLOCK, eventKey: agendaEventKey(BLOCK, "assigned", STUDENT) },
    });
    expect(mockedPush).toHaveBeenCalledTimes(1);
  });

  it("cancelled: copy warning/P1 y CTA a /cursos", async () => {
    mockedCreate.mockResolvedValue({ ...fakeNotification, type: "warning", priority: "P1" });
    await notifyClassEvent({ ...baseParams, event: "cancelled" });

    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "warning",
        priority: "P1",
        title: "Clase cancelada",
        ctaUrl: "/cursos",
        groupId: agendaGroupId(BLOCK, "cancelled"),
      }),
    );
  });

  it("push falla ⇒ no propaga el error y pushSent = 0", async () => {
    mockedPush.mockRejectedValue(new Error("vapid down"));

    await expect(notifyClassEvent(baseParams)).resolves.toEqual({ inboxCreated: true, pushSent: 0 });
  });

  it("preferencia push off para system ⇒ 0 push", async () => {
    mockedPrefs.mockResolvedValue([
      { channel: "push", category: "system", enabled: false } as Awaited<
        ReturnType<typeof getNotificationPreferences>
      >[number],
    ]);

    const result = await notifyClassEvent(baseParams);

    expect(result).toEqual({ inboxCreated: true, pushSent: 0 });
    expect(mockedSubs).not.toHaveBeenCalled();
    expect(mockedPush).not.toHaveBeenCalled();
  });

  it("duplicado (dedup del engine) ⇒ 0 push", async () => {
    mockedCreate.mockResolvedValue(null);

    const result = await notifyClassEvent(baseParams);

    expect(result).toEqual({ inboxCreated: false, pushSent: 0 });
    expect(mockedPush).not.toHaveBeenCalled();
  });

  it("sin suscripciones activas ⇒ inbox sí, 0 push", async () => {
    mockedSubs.mockResolvedValue([]);

    const result = await notifyClassEvent(baseParams);

    expect(result).toEqual({ inboxCreated: true, pushSent: 0 });
    expect(mockedPush).not.toHaveBeenCalled();
  });
});
