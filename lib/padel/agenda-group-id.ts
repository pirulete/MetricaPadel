/**
 * `groupId` determinista (uuid v5) para la dedup de notificaciones de la agenda
 * (v0.11, D12/B1). Node-only: usa `node:crypto` y NO toca DB.
 * Solo lo importa `lib/notifications/agenda.ts` (nunca el cliente).
 */
import { createHash } from "node:crypto";

const NAMESPACE = "padel-evaluation/class-agenda/v1";

export type AgendaEvent = "assigned" | "removed" | "cancelled";

/** Clave legible del evento (va en `metadata.eventKey` para trazabilidad). */
export function agendaEventKey(blockId: string, event: AgendaEvent, studentId?: string): string {
  if (event === "cancelled") return `cancelled:${blockId}`;
  if (!studentId) throw new TypeError(`agendaEventKey: studentId requerido para "${event}"`);
  return `${event}:${blockId}:${studentId}`;
}

/**
 * UUID v5 determinista (SHA-1 sobre `${NAMESPACE}/${eventKey}`).
 * Mismo input ⇒ mismo uuid; `assigned`/`removed`/`cancelled` del mismo bloque ⇒ uuids
 * distintos (una cancelación no colapsa con la asignación dentro de la ventana de 1 h).
 */
export function agendaGroupId(blockId: string, event: AgendaEvent, studentId?: string): string {
  const digest = createHash("sha1")
    .update(`${NAMESPACE}/${agendaEventKey(blockId, event, studentId)}`)
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // versión 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variante RFC 4122
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
