import { db } from "@/lib/db";
import { termsVersions, userTermsAcceptance } from "@/lib/db/schema";
import { eq, desc, count, and, sql } from "drizzle-orm";

export async function getCurrentTermsVersion() {
  return await db.query.termsVersions.findFirst({
    where: eq(termsVersions.isCurrent, 1),
    orderBy: desc(termsVersions.versionNumber),
  });
}

function findCurrentAcceptance(userId: string, termsVersionId: string) {
  return db.query.userTermsAcceptance.findFirst({
    where: and(
      eq(userTermsAcceptance.userId, userId),
      eq(userTermsAcceptance.termsVersionId, termsVersionId),
    ),
    columns: { id: true },
  });
}

export async function hasUserAcceptedCurrentTerms(userId: string): Promise<boolean> {
  const current = await getCurrentTermsVersion();
  if (!current) return true;

  return !!(await findCurrentAcceptance(userId, current.id));
}

/**
 * Indica si un usuario ACTIVE debe aceptar la versión current+blocking de T&C.
 * Graceful degradation: si la tabla terms_versions no está migrada o la query
 * falla, retorna false (no rompe login).
 */
export async function requiresTermsAcceptance(userId: string): Promise<boolean> {
  try {
    const current = await getCurrentTermsVersion();
    if (!current) return false;

    const accepted = await findCurrentAcceptance(userId, current.id);
    return !accepted;
  } catch {
    return false;
  }
}

export async function acceptTermsVersion(
  userId: string,
  termsVersionId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const existing = await db.query.userTermsAcceptance.findFirst({
    where: and(
      eq(userTermsAcceptance.userId, userId),
      eq(userTermsAcceptance.termsVersionId, termsVersionId),
    ),
  });

  if (existing) return existing;

  const [acceptance] = await db.insert(userTermsAcceptance).values({
    userId,
    termsVersionId,
    ipAddress,
    userAgent,
  }).returning();

  return acceptance;
}

export async function createTermsVersion(data: {
  title: string;
  content: string;
  summary?: string;
  isBlocking?: number;
  createdBy: string;
}) {
  const maxVersion = await db.select({ max: sql<number>`coalesce(max(version_number), 0)` })
    .from(termsVersions);

  const nextVersion = (maxVersion[0]?.max ?? 0) + 1;

  const [version] = await db.insert(termsVersions).values({
    versionNumber: nextVersion,
    ...data,
  }).returning();

  return version;
}

export async function publishTermsVersion(versionId: string) {
  return await db.transaction(async (tx) => {
    await tx.update(termsVersions)
      .set({ isCurrent: 0 })
      .where(eq(termsVersions.isCurrent, 1));

    const [published] = await tx.update(termsVersions)
      .set({
        isCurrent: 1,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(termsVersions.id, versionId))
      .returning();

    return published;
  });
}

export async function getTermsVersionsWithCounts() {
  const versions = await db.query.termsVersions.findMany({
    orderBy: desc(termsVersions.versionNumber),
    with: {
      creator: {
        columns: { firstName: true, lastName: true },
      },
    },
  });

  const counts = await db
    .select({
      termsVersionId: userTermsAcceptance.termsVersionId,
      count: count(),
    })
    .from(userTermsAcceptance)
    .groupBy(userTermsAcceptance.termsVersionId);

  const countMap = new Map(counts.map((c) => [c.termsVersionId, c.count]));

  return versions.map((v) => ({
    ...v,
    acceptanceCount: countMap.get(v.id) ?? 0,
  }));
}
