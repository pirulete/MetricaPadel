/**
 * Validación del schema Drizzle del Marketing CMS + consistencia de la migración generada.
 * @jest-environment node
 */
import * as fs from "fs";
import * as path from "path";
import {
  marketingStatusEnum,
  marketingBlockTypeEnum,
  marketingPages,
  marketingSections,
  marketingPosts,
  marketingProducts,
  marketingCategories,
  marketingSettings,
} from "@/lib/db/schema";

const cols = (table: any) => table[Symbol.for("drizzle:Columns")] || {};
const fks = (table: any) => table[Symbol.for("drizzle:PgInlineForeignKeys")] || [];

describe("enums del Marketing CMS", () => {
  it("marketing_status tiene draft y published", () => {
    expect(marketingStatusEnum.enumValues).toEqual(["draft", "published"]);
  });

  it("marketing_block_type tiene los 10 block types", () => {
    expect(marketingBlockTypeEnum.enumValues).toEqual([
      "hero",
      "features_grid",
      "pricing",
      "testimonials",
      "cta_banner",
      "faq",
      "contact_form",
      "stats",
      "product_grid",
      "blog_list",
    ]);
  });
});

describe("tablas marketing", () => {
  it("marketing_pages: slug único notNull, status default draft", () => {
    const c = cols(marketingPages);
    expect(c.slug.config.isUnique).toBe(true);
    expect(c.slug.config.notNull).toBe(true);
    expect(c.title.config.notNull).toBe(true);
    expect(c.status.config.default).toBe("draft");
  });

  it("marketing_sections: pageId FK onDelete cascade", () => {
    const c = cols(marketingSections);
    expect(c.pageId.config.notNull).toBe(true);
    expect(fks(marketingSections)[0]).toMatchObject({ onDelete: "cascade" });
  });

  it("marketing_products: categoryId FK onDelete set null", () => {
    const fk = fks(marketingProducts)[0];
    expect(fk).toMatchObject({ onDelete: "set null" });
    expect(cols(marketingProducts).categoryId.config.notNull).toBe(false);
  });

  it("marketing_posts: slug único notNull, content jsonb notNull", () => {
    const c = cols(marketingPosts);
    expect(c.slug.config.isUnique).toBe(true);
    expect(c.content.config.notNull).toBe(true);
  });

  it("marketing_categories: slug único notNull", () => {
    expect(cols(marketingCategories).slug.config.isUnique).toBe(true);
  });

  it("marketing_settings: key es primaryKey", () => {
    expect(cols(marketingSettings).key.config.primaryKey).toBe(true);
  });

  it("todas las tablas marketing exportan sus columnas", () => {
    for (const t of [marketingPages, marketingSections, marketingPosts, marketingProducts, marketingCategories, marketingSettings]) {
      expect(Object.keys(cols(t)).length).toBeGreaterThan(0);
    }
  });
});

describe("migración generada por db:generate", () => {
  const drizzleDir = path.join(process.cwd(), "drizzle");
  const sqlFiles = fs.readdirSync(drizzleDir).filter((f) => /^0000_.*\.sql$/.test(f));

  it("existe exactamente 1 archivo SQL de baseline (0000)", () => {
    expect(sqlFiles.length).toBe(1);
  });

  const sql = sqlFiles.length ? fs.readFileSync(path.join(drizzleDir, sqlFiles[0]), "utf8") : "";

  it("crea los 2 enums de marketing", () => {
    expect(sql).toContain('CREATE TYPE "public"."marketing_status" AS ENUM');
    expect(sql).toContain('CREATE TYPE "public"."marketing_block_type" AS ENUM');
  });

  it("crea las 6 tablas marketing", () => {
    for (const t of ["marketing_pages", "marketing_sections", "marketing_posts", "marketing_products", "marketing_categories", "marketing_settings"]) {
      expect(sql).toContain(`CREATE TABLE "${t}"`);
    }
  });

  it("crea los índices compuestos (pageId+sortOrder) y (categoryId)", () => {
    expect(sql).toContain('CREATE INDEX "marketing_sections_page_sort_idx" ON "marketing_sections"');
    expect(sql).toContain('CREATE INDEX "marketing_products_category_idx" ON "marketing_products"');
  });

  it("declara los FKs con onDelete correcto", () => {
    expect(sql).toContain("marketing_sections_page_id_marketing_pages_id_fk");
    expect(sql).toContain("ON DELETE cascade");
    expect(sql).toContain("marketing_products_category_id_marketing_categories_id_fk");
    expect(sql).toContain("ON DELETE set null");
  });

  it("_journal.json es cronológico (idx ascendente)", () => {
    const journal = JSON.parse(fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8"));
    const entries = journal.entries;
    expect(entries.length).toBeGreaterThan(0);
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].idx).toBeGreaterThan(entries[i - 1].idx);
      expect(entries[i].when).toBeGreaterThanOrEqual(entries[i - 1].when);
    }
  });
});
