/**
 * Notificaciones de la agenda de clases (v0.11, D11/D12).
 *
 * Orquestador: inbox vía `engine.createNotification` (dedup 1h por `groupId`) y
 * push fire-and-forget tolerante a fallo — un push caído NUNCA rompe la mutación
 * (AC-05). Solo el push respeta `notification_preferences` (el inbox es inbox-first).
 * No modifica `engine.ts`, `triggers.ts` ni `priority.ts`.
 */
import { createNotification } from "@/lib/notifications/engine";
import { getNotificationPreferences } from "@/lib/db/queries/notifications";
import { getActiveSubscriptions } from "@/lib/db/queries/push";
import { sendBulkPushTracked } from "@/lib/push/sender";
import { formatBlockDateTime } from "@/lib/padel/class-agenda";
import { agendaEventKey, agendaGroupId, type AgendaEvent } from "@/lib/padel/agenda-group-id";
import type { NotificationPriority, NotificationType } from "@/lib/db/schema";

export interface NotifyClassEventParams {
  event: AgendaEvent;
  studentId: string;
  blockId: string;
  courseName: string;
  blockDate: string;
  startTime: string;
  /** Nombre del bloque (opcional, enriquece el copy de `assigned`). */
  label?: string | null;
}

export interface NotifyClassEventResult {
  inboxCreated: boolean;
  pushSent: number;
}

type AgendaCopy = {
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  ctaUrl?: string;
  ctaLabel?: string;
};

/** Copy por evento (technical-design-v2 §4.2, sin cambios respecto a v1). */
function buildCopy(params: NotifyClassEventParams): AgendaCopy {
  const when = formatBlockDateTime(params.blockDate, params.startTime);
  const course = params.label ? `${params.courseName} · ${params.label}` : params.courseName;

  switch (params.event) {
    case "assigned":
      return {
        type: "info",
        priority: "P2",
        title: "Nueva clase agendada",
        body: `${course} · ${when}`,
        ctaUrl: "/dashboard#proximas-clases",
        ctaLabel: "Ver mi clase",
      };
    case "removed":
      return {
        type: "info",
        priority: "P3",
        title: "Ya no estás en esta clase",
        body: `Saliste de la clase del ${when}`,
      };
    case "cancelled":
      return {
        type: "warning",
        priority: "P1",
        title: "Clase cancelada",
        body: `El coach canceló la clase del ${when}`,
        ctaUrl: "/cursos",
        ctaLabel: "Ver detalle",
      };
  }
}

/** ¿El usuario desactivó el push para la categoría `system`? (sin fila ⇒ habilitado) */
async function isPushDisabled(studentId: string): Promise<boolean> {
  const prefs = await getNotificationPreferences(studentId);
  const row = prefs.find((p) => p.channel === "push" && p.category === "system");
  return row ? !row.enabled : false;
}

/**
 * Notifica un evento de agenda (`assigned`/`removed`/`cancelled`).
 * Inbox siempre (dedup por `groupId` uuid v5); push best-effort con try/catch.
 */
export async function notifyClassEvent(
  params: NotifyClassEventParams,
): Promise<NotifyClassEventResult> {
  const { event, studentId, blockId } = params;
  const copy = buildCopy(params);

  const notification = await createNotification({
    userId: studentId,
    type: copy.type,
    priority: copy.priority,
    title: copy.title,
    body: copy.body,
    ctaUrl: copy.ctaUrl,
    ctaLabel: copy.ctaLabel,
    groupId: agendaGroupId(blockId, event, studentId),
    category: "system",
    metadata: { blockId, eventKey: agendaEventKey(blockId, event, studentId) },
  });

  // Duplicado dentro de la ventana de dedup ⇒ no se reenvía push.
  if (!notification) return { inboxCreated: false, pushSent: 0 };

  try {
    if (await isPushDisabled(studentId)) return { inboxCreated: true, pushSent: 0 };

    const subs = await getActiveSubscriptions(studentId);
    if (subs.length === 0) return { inboxCreated: true, pushSent: 0 };

    const { sent } = await sendBulkPushTracked(subs, {
      title: copy.title,
      body: copy.body,
      url: copy.ctaUrl,
    });
    return { inboxCreated: true, pushSent: sent };
  } catch (error) {
    // Push es un canal de delivery: su fallo no propaga (AC-05).
    console.error("[agenda] push failed", error);
    return { inboxCreated: true, pushSent: 0 };
  }
}
