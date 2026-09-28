/**
 * Unit tests del trigger evaluation.published (G9).
 * Verifica payload correcto + groupId = evaluationId (uuid, dedup 1h).
 * @jest-environment node
 */
jest.mock("@/lib/notifications/engine", () => ({
  createNotification: jest.fn(),
}));

import {
  triggerWelcome,
  triggerEmailVerified,
  triggerEvaluationPublished,
  triggerEvaluationRead,
  triggerAcademyInvite,
} from "@/lib/notifications/triggers";
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

describe("triggerWelcome", () => {
  it("crea notificación de bienvenida con payload P2/account y CTA al dashboard", async () => {
    mocked.mockResolvedValue(fakeNotification);

    await triggerWelcome("student-1");

    expect(mocked).toHaveBeenCalledWith({
      userId: "student-1",
      type: "info",
      priority: "P2",
      title: "¡Bienvenido!",
      body: "Tu cuenta está lista. Completa tu perfil para aprovechar al máximo.",
      category: "account",
      ctaUrl: "/dashboard",
      ctaLabel: "Ir al dashboard",
    });
  });

  it("retorna null si el engine rechaza la notificación", async () => {
    mocked.mockResolvedValue(null);

    const result = await triggerWelcome("student-1");

    expect(result).toBeNull();
    expect(mocked).toHaveBeenCalledTimes(1);
  });
});

describe("triggerEmailVerified", () => {
  it("crea notificación de email verificado con payload P3/account sin CTA", async () => {
    mocked.mockResolvedValue(fakeNotification);

    await triggerEmailVerified("student-1");

    expect(mocked).toHaveBeenCalledWith({
      userId: "student-1",
      type: "success",
      priority: "P3",
      title: "Email verificado",
      body: "Tu dirección de correo fue verificada correctamente.",
      category: "account",
    });
  });

  it("retorna null si el engine rechaza la notificación", async () => {
    mocked.mockResolvedValue(null);

    const result = await triggerEmailVerified("student-1");

    expect(result).toBeNull();
    expect(mocked).toHaveBeenCalledTimes(1);
  });
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

describe("triggerEvaluationRead", () => {
  it("crea notificación para el coach con payload P2/system y groupId = evaluationId", async () => {
    mocked.mockResolvedValue(fakeNotification);

    await triggerEvaluationRead("coach-1", "evaluation-1");

    expect(mocked).toHaveBeenCalledWith({
      userId: "coach-1",
      type: "info",
      priority: "P2",
      title: "Evaluación leída",
      body: "Tu evaluación fue vista por el alumno.",
      groupId: "evaluation-1",
      category: "system",
    });
  });

  it("retorna null si el engine aplica dedup (re-lectura en ventana 1h)", async () => {
    mocked.mockResolvedValue(null);

    const result = await triggerEvaluationRead("coach-1", "evaluation-1");

    expect(result).toBeNull();
    expect(mocked).toHaveBeenCalledTimes(1);
  });
});

describe("triggerAcademyInvite", () => {
  it("crea notificación con payload correcto y groupId = membershipId", async () => {
    mocked.mockResolvedValue(fakeNotification);

    await triggerAcademyInvite("u2", "Academia Test", "membership-1");

    expect(mocked).toHaveBeenCalledWith({
      userId: "u2",
      type: "info",
      priority: "P2",
      title: "Invitación a Academia Test",
      body: "Fuiste invitado a la academia Academia Test",
      ctaUrl: "/academias",
      ctaLabel: "Ver academia",
      groupId: "membership-1",
      category: "system",
    });
  });

  it("retorna null si el engine aplica dedup (re-invitación)", async () => {
    mocked.mockResolvedValue(null);

    const result = await triggerAcademyInvite("u2", "Academia Test", "membership-1");

    expect(result).toBeNull();
    expect(mocked).toHaveBeenCalledTimes(1);
  });
});