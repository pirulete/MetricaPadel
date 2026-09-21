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