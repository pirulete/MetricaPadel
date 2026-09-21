/**
 * Unit tests del trigger evaluation.published (G9).
 * Verifica payload correcto + groupId = evaluationId (uuid, dedup 1h).
 * @jest-environment node
 */
jest.mock("@/lib/notifications/engine", () => ({
  createNotification: jest.fn(),
}));

import { triggerEvaluationPublished } from "@/lib/notifications/triggers";
import { createNotification } from "@/lib/notifications/engine";
import type { notifications } from "@/lib/db/schema";

const mocked = createNotification as jest.MockedFunction<typeof createNotification>;

const fakeNotification = {
  id: "n1",
  userId: "student-1",
  type: "success",
  priority: "P1",
  title: "Nueva evaluación publicada",
  body: "Tu coach publicó una evaluación",
  ctaUrl: "/evaluaciones/evaluation-1",
  ctaLabel: "Ver evaluación",
  read: 0,
  groupId: "evaluation-1",
  category: "system",
  deletedAt: null,
  metadata: null,
  createdAt: new Date("2026-09-21T10:00:00Z"),
} satisfies typeof notifications.$inferSelect;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("triggerEvaluationPublished", () => {
  it("crea notificación con payload correcto y groupId = evaluationId", async () => {
    mocked.mockResolvedValue(fakeNotification);

    await triggerEvaluationPublished("student-1", "evaluation-1");

    expect(mocked).toHaveBeenCalledWith({
      userId: "student-1",
      type: "success",
      priority: "P1",
      title: "Nueva evaluación publicada",
      body: "Tu coach publicó una evaluación",
      ctaUrl: "/evaluaciones/evaluation-1",
      ctaLabel: "Ver evaluación",
      groupId: "evaluation-1",
      category: "system",
    });
  });

  it("retorna null si el engine aplica dedup (misma evaluación re-publicada)", async () => {
    mocked.mockResolvedValue(null);

    const result = await triggerEvaluationPublished("student-1", "evaluation-1");

    expect(result).toBeNull();
    expect(mocked).toHaveBeenCalledTimes(1);
  });
});