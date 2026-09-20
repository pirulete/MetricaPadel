import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { marketingSettings } from "@/lib/db/schema";

// key → value como Record (jsonb). Compatible con getSettingsMap del CMS.
export async function getSettingsMap(): Promise<Record<string, unknown>> {
  const rows = await db.select().from(marketingSettings);
  return rows.reduce<Record<string, unknown>>((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

export async function getSetting(key: string): Promise<unknown> {
  const [row] = await db
    .select({ value: marketingSettings.value })
    .from(marketingSettings)
    .where(eq(marketingSettings.key, key));
  return row?.value ?? null;
}

// Upsert: inserta o actualiza el value de una key (settings no tienen updatedAt manual — defaultNow aplica en insert; en update se setea explícito)
export async function upsertSetting(key: string, value: unknown) {
  const existing = await getSetting(key);
  if (existing === null) {
    const [row] = await db.insert(marketingSettings).values({ key, value }).returning();
    return row;
  }
  const [row] = await db
    .update(marketingSettings)
    .set({ value, updatedAt: new Date() })
    .where(eq(marketingSettings.key, key))
    .returning();
  return row;
}

export async function deleteSetting(key: string) {
  const [row] = await db.delete(marketingSettings).where(eq(marketingSettings.key, key)).returning();
  return row;
}
