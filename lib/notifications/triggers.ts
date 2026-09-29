/**
 * Triggers de ejemplo (genéricos).
 *
 * Cada proyecto whitelabel agrega sus propios triggers de negocio
 * (ej: billing.renewal_reminder) sin tocar el mecanismo (engine + queries + push).
 * Los triggers one-time no usan groupId (no requieren dedup); eventos repetidos
 * (ej: recordatorios) deben pasar un groupId estable para dedup 1h.
 */
import { createNotification } from '@/lib/notifications/engine';

/** account.welcome — al registrarse (P2, category account). */
export async function triggerWelcome(userId: string) {
  return createNotification({
    userId,
    type: 'info',
    priority: 'P2',
    title: '¡Bienvenido!',
    body: 'Tu cuenta está lista. Completa tu perfil para aprovechar al máximo.',
    category: 'account',
    ctaUrl: '/dashboard',
    ctaLabel: 'Ir al dashboard',
  });
}

/** account.email_verified — al verificar email (P3, inbox only). */
export async function triggerEmailVerified(userId: string) {
  return createNotification({
    userId,
    type: 'success',
    priority: 'P3',
    title: 'Email verificado',
    body: 'Tu dirección de correo fue verificada correctamente.',
    category: 'account',
  });
}

/**
 * evaluation.published — al publicar una evaluación (G9).
 * groupId = evaluationId (uuid) para dedup 1h del engine: re-publicar no duplica.
 * category system + priority P1 (evento importante para el alumno).
 */
export async function triggerEvaluationPublished(studentId: string, evaluationId: string) {
  return createNotification({
    userId: studentId,
    type: 'success',
    priority: 'P1',
    title: 'Nueva evaluación publicada',
    body: 'Tu coach publicó una evaluación',
    ctaUrl: `/evaluaciones/${evaluationId}`,
    ctaLabel: 'Ver evaluación',
    groupId: evaluationId,
    category: 'system',
  });
}

/**
 * evaluation.read — al leer el alumno una evaluación publicada (G13).
 * groupId = evaluationId (uuid) para dedup 1h del engine: re-leer no duplica.
 * category system + priority P2 (informativa para el coach).
 */
export async function triggerEvaluationRead(teacherId: string, evaluationId: string) {
  return createNotification({
    userId: teacherId,
    type: 'info',
    priority: 'P2',
    title: 'Evaluación leída',
    body: 'Tu evaluación fue vista por el alumno.',
    groupId: evaluationId,
    category: 'system',
  });
}

/**
 * academy.invite — al invitar un miembro a una academia (SPEC-EPIC-01, Fase B).
 * groupId = membershipId (uuid) para dedup 1h del engine: re-invitar no duplica.
 * category system + priority P2.
 */
export async function triggerAcademyInvite(userId: string, academyName: string, membershipId: string) {
  return createNotification({
    userId,
    type: 'info',
    priority: 'P2',
    title: `Invitación a ${academyName}`,
    body: `Fuiste invitado a la academia ${academyName}`,
    ctaUrl: '/academias',
    ctaLabel: 'Ver academia',
    groupId: membershipId,
    category: 'system',
  });
}