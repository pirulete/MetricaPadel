import { db } from "@/lib/db";
import { sessions, auditLogs } from "@/lib/db/schema";
import { eq, and, gt, lt } from "drizzle-orm";

/**
 * SESSION MANAGEMENT FUNCTIONS
 */

export async function createSession(
  userId: string,
  token: string,
  expiresAt: Date,
  deviceInfo?: string,
  ipAddress?: string
) {
  return await db.insert(sessions).values({
    userId,
    token,
    expiresAt,
    deviceInfo,
    ipAddress,
  });
}

export async function getSessionByToken(token: string) {
  return await db.query.sessions.findFirst({
    where: eq(sessions.token, token),
  });
}

export async function getActiveSessionsByUserId(userId: string) {
  return await db.query.sessions.findMany({
    where: and(
      eq(sessions.userId, userId),
      gt(sessions.expiresAt, new Date())
    ),
  });
}

export async function updateSessionActivity(sessionId: string) {
  return await db
    .update(sessions)
    .set({
      lastActivityAt: new Date(),
    })
    .where(eq(sessions.id, sessionId));
}

export async function updateSessionExpiresAt(token: string) {
  const SESSION_TIMEOUT = 15 * 60 * 1000;
  const newExpiresAt = new Date(Date.now() + SESSION_TIMEOUT);
  return await db
    .update(sessions)
    .set({
      lastActivityAt: new Date(),
      expiresAt: newExpiresAt,
    })
    .where(eq(sessions.token, token));
}

export async function deleteSession(sessionId: string) {
  return await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function deleteSessionByToken(token: string) {
  return await db.delete(sessions).where(eq(sessions.token, token));
}

export async function deleteUserSessions(userId: string) {
  return await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function deleteExpiredSessions() {
  return await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()));
}

/**
 * AUDIT LOG FUNCTIONS
 */

export async function createAuditLog(
  actionType: string,
  entityName: string,
  entityId: string,
  options?: {
    userId?: string;
    oldValues?: Record<string, any>;
    newValues?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, any>;
  }
) {
  return await db.insert(auditLogs).values({
    userId: options?.userId,
    actionType,
    entityName,
    entityId,
    oldValues: options?.oldValues ?? null,
    newValues: options?.newValues ?? null,
    ipAddress: options?.ipAddress,
    userAgent: options?.userAgent,
    metadata: options?.metadata ?? null,
  });
}

export async function getAuditLogsByEntity(
  entityName: string,
  entityId: string,
  limit: number = 50
) {
  return await db.query.auditLogs.findMany({
    where: and(
      eq(auditLogs.entityName, entityName),
      eq(auditLogs.entityId, entityId)
    ),
    limit,
    orderBy: (logs, { desc }) => [desc(logs.createdAt)],
  });
}

export async function getAuditLogsByUser(userId: string, limit: number = 100) {
  return await db.query.auditLogs.findMany({
    where: eq(auditLogs.userId, userId),
    limit,
    orderBy: (logs, { desc }) => [desc(logs.createdAt)],
  });
}

export async function getAuditLogsByAction(
  actionType: string,
  limit: number = 100,
  days: number = 30
) {
  const dateLimit = new Date();
  dateLimit.setDate(dateLimit.getDate() - days);

  return await db.query.auditLogs.findMany({
    where: and(
      eq(auditLogs.actionType, actionType),
      gt(auditLogs.createdAt, dateLimit)
    ),
    limit,
    orderBy: (logs, { desc }) => [desc(logs.createdAt)],
  });
}

export async function getAuditLogsReport(
  startDate: Date,
  endDate: Date,
  limit: number = 1000
) {
  return await db.query.auditLogs.findMany({
    where: and(
      gt(auditLogs.createdAt, startDate),
      lt(auditLogs.createdAt, endDate)
    ),
    limit,
    orderBy: (logs, { desc }) => [desc(logs.createdAt)],
  });
}
