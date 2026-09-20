/**
 * Prioridad genérica de notificaciones (P1-P3): labels, colores e iconos.
 * Icon mapping por tipo de notificación (enum genérico), no por dominio.
 */
import {
  Bell,
  Info,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  type LucideIcon,
} from 'lucide-react';
import type { NotificationPriority, NotificationType } from '@/lib/db/schema';

const PRIORITY_LABELS: Record<NotificationPriority, string> = {
  P1: 'Importante',
  P2: 'Normal',
  P3: 'Informativo',
};

const PRIORITY_COLORS: Record<NotificationPriority, string> = {
  P1: 'border-l-orange-500 bg-orange-50/50 dark:bg-orange-950/20',
  P2: 'border-l-blue-500',
  P3: 'border-l-gray-300 dark:border-l-gray-600',
};

const PRIORITY_BADGE_COLORS: Record<NotificationPriority, string> = {
  P1: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  P2: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  P3: 'bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400',
};

const TYPE_ICONS: Record<NotificationType, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
  action: Bell,
};

export { TYPE_ICONS };

export function getPriorityLabel(priority: string): string {
  return PRIORITY_LABELS[priority as NotificationPriority] || 'Normal';
}

export function getPriorityColor(priority: string): string {
  return PRIORITY_COLORS[priority as NotificationPriority] || PRIORITY_COLORS.P2;
}

export function getPriorityBadgeColor(priority: string): string {
  return PRIORITY_BADGE_COLORS[priority as NotificationPriority] || PRIORITY_BADGE_COLORS.P2;
}

export function isImportant(priority: string): boolean {
  return priority === 'P1';
}

export function getNotificationIcon(type: string): LucideIcon {
  return TYPE_ICONS[type as NotificationType] || Bell;
}

export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = typeof date === 'string' ? new Date(date) : date;
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `Hace ${diffMins}m`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays < 7) return `Hace ${diffDays}d`;
  return then.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}