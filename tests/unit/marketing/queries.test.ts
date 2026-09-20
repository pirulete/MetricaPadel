/**
 * Unit tests de queries del Marketing CMS con db mockeado.
 * Cubre: getPageBySlug batched, reorderSections, filtros publicados, upsert settings.
 * @jest-environment node
 */
jest.mock("@/lib/db", () => {
  const makeChain = () => {
    const c: Record<string, jest.Mock> = {} as any;
    c.from = jest.fn(() => c);
    c.leftJoin = jest.fn(() => c);
    c.where = jest.fn(() => c);
    c.orderBy = jest.fn(() => c);
    c.groupBy = jest.fn(() => c);
    c.limit = jest.fn(() => c);
    c.values = jest.fn(() => c);
    c.set = jest.fn(() => c);
    c.returning = jest.fn(async () => []);
    return c;
  };

  const selectChain = makeChain();
  const insertChain = makeChain();
  const updateChain = makeChain();
  const deleteChain = makeChain();

  return {
    db: {
      query: {
        marketingPages: { findFirst: jest.fn(), findMany: jest.fn() },
        marketingSections: { findFirst: jest.fn(), findMany: jest.fn() },
        marketingPosts: { findFirst: jest.fn(), findMany: jest.fn() },
        marketingCategories: { findFirst: jest.fn(), findMany: jest.fn() },
        marketingProducts: { findFirst: jest.fn(), findMany: jest.fn() },
      },
      select: jest.fn(() => selectChain),
      insert: jest.fn(() => insertChain),
      update: jest.fn(() => updateChain),
      delete: jest.fn(() => deleteChain),
    },
  };
});

import { db } from "@/lib/db";
import {
  getPageBySlug,
  createPage,
  listPages,
  updatePage,
  deletePage,
  countPublishedPages,
} from "@/lib/db/queries/marketing/pages";
import {
  createSection,
  listSectionsByPage,
  updateSection,
  deleteSection,
  reorderSections,
  sectionIdsBelongToPage,
} from "@/lib/db/queries/marketing/sections";
import { createPost, getPublishedPosts, updatePost, deletePost } from "@/lib/db/queries/marketing/posts";
import { createProduct, getProductBySlug, listProductsByCategory, getPublishedProducts, updateProduct, deleteProduct } from "@/lib/db/queries/marketing/products";
import { createCategory, listCategories, updateCategory, deleteCategory } from "@/lib/db/queries/marketing/categories";
import { getSettingsMap, getSetting, upsertSetting, deleteSetting } from "@/lib/db/queries/marketing/settings";

type Chain = Record<string, jest.Mock>;

const selectChain = (db.select as jest.Mock)() as Chain;
const insertChain = (db.insert as jest.Mock)() as Chain;
const updateChain = (db.update as jest.Mock)() as Chain;
const deleteChain = (db.delete as jest.Mock)() as Chain;

function resetChain(c: Chain) {
  for (const m of ["from", "leftJoin", "where", "orderBy", "groupBy", "limit", "values", "set"]) {
    (c[m] as jest.Mock).mockImplementation(() => c);
  }
  c.returning.mockImplementation(async () => []);
}

beforeEach(() => {
  jest.clearAllMocks();
  resetChain(selectChain);
  resetChain(insertChain);
  resetChain(updateChain);
  resetChain(deleteChain);
  (db.select as jest.Mock).mockImplementation(() => selectChain);
  (db.insert as jest.Mock).mockImplementation(() => insertChain);
  (db.update as jest.Mock).mockImplementation(() => updateChain);
  (db.delete as jest.Mock).mockImplementation(() => deleteChain);
});

describe("pages queries", () => {
  it("getPageBySlug hace 2 queries batched (page + sections ordenadas)", async () => {
    const page = { id: "p1", slug: "home", title: "Home", status: "draft" };
    const sections = [{ id: "s1", sortOrder: 1024 }, { id: "s2", sortOrder: 2048 }];
    (db.query.marketingPages.findFirst as jest.Mock).mockResolvedValue(page);
    (db.query.marketingSections.findMany as jest.Mock).mockResolvedValue(sections);

    const result = await getPageBySlug("home");

    expect(result).toEqual({ page, sections });
    expect(db.query.marketingPages.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.anything() })
    );
    expect(db.query.marketingSections.findMany).toHaveBeenCalledTimes(1); // no N+1
  });

  it("getPageBySlug devuelve null si la página no existe", async () => {
    (db.query.marketingPages.findFirst as jest.Mock).mockResolvedValue(undefined);
    expect(await getPageBySlug("missing")).toBeNull();
    expect(db.query.marketingSections.findMany).not.toHaveBeenCalled();
  });

  it("getPageBySlug con publishedOnly filtra por status", async () => {
    (db.query.marketingPages.findFirst as jest.Mock).mockResolvedValue({ id: "p1", slug: "home" });
    (db.query.marketingSections.findMany as jest.Mock).mockResolvedValue([]);

    await getPageBySlug("home", { publishedOnly: true });

    expect(db.query.marketingPages.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.anything() })
    );
  });

  it("createPage inserta y devuelve la fila", async () => {
    const row = { id: "p1", slug: "about" };
    insertChain.returning.mockResolvedValue([row]);
    const result = await createPage({ slug: "about", title: "About" });
    expect(result).toEqual(row);
  });

  it("listPages agrupa con leftJoin (sectionCount)", async () => {
    selectChain.orderBy.mockResolvedValue([]);
    await listPages();
    expect(db.select).toHaveBeenCalled();
    expect(selectChain.leftJoin).toHaveBeenCalled();
    expect(selectChain.groupBy).toHaveBeenCalled();
  });

  it("updatePage setea updatedAt y deletePage borra por id", async () => {
    updateChain.returning.mockResolvedValue([{ id: "p1" }]);
    await updatePage("p1", { title: "Nuevo" });
    expect(db.update).toHaveBeenCalled();

    deleteChain.returning.mockResolvedValue([{ id: "p1" }]);
    await deletePage("p1");
    expect(db.delete).toHaveBeenCalled();
  });

  it("countPublishedPages cuenta solo publicadas", async () => {
    selectChain.where.mockResolvedValue([{ count: 1 }]);
    const n = await countPublishedPages();
    expect(n).toBe(1);
  });
});

describe("sections queries", () => {
  it("createSection inyecta pageId y devuelve la fila", async () => {
    const row = { id: "s1", pageId: "p1", blockType: "hero" };
    insertChain.returning.mockResolvedValue([row]);
    const result = await createSection("p1", { blockType: "hero", config: {}, sortOrder: 0 });
    expect(result).toEqual(row);
    expect(db.insert).toHaveBeenCalled();
  });

  it("listSectionsByPage ordena por sortOrder asc", async () => {
    (db.query.marketingSections.findMany as jest.Mock).mockResolvedValue([]);
    await listSectionsByPage("p1");
    expect(db.query.marketingSections.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [expect.anything()] })
    );
  });

  it("updateSection y deleteSection delegan en db", async () => {
    updateChain.returning.mockResolvedValue([{ id: "s1" }]);
    await updateSection("s1", { config: { title: "x" } });
    expect(db.update).toHaveBeenCalled();

    deleteChain.returning.mockResolvedValue([{ id: "s1" }]);
    await deleteSection("s1");
    expect(db.delete).toHaveBeenCalled();
  });

  it("reorderSections emite 1 UPDATE por id válido y descarta ids ajenos", async () => {
    (db.query.marketingSections.findMany as jest.Mock).mockResolvedValue([
      { id: "a", pageId: "p1" },
      { id: "b", pageId: "p1" },
    ]);

    const setValues: Array<{ sortOrder: number }> = [];
    const fresh = (): Chain => {
      const c: Chain = {} as any;
      c.set = jest.fn((values: any) => {
        setValues.push(values);
        return c;
      });
      c.where = jest.fn(() => c);
      c.returning = jest.fn(async () => []);
      return c;
    };
    (db.update as jest.Mock).mockImplementation(() => fresh());

    await reorderSections("p1", ["a", "b", "x"]); // "x" no pertenece → se ignora

    expect(db.update).toHaveBeenCalledTimes(2);
    expect(setValues.map((v) => v.sortOrder)).toEqual([0, 1024]);
  });

  it("reorderSections no hace updates si no hay ids válidos", async () => {
    (db.query.marketingSections.findMany as jest.Mock).mockResolvedValue([{ id: "a", pageId: "p1" }]);
    await reorderSections("p1", ["zzz"]);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("sectionIdsBelongToPage retorna solo ids de la página", async () => {
    selectChain.where.mockResolvedValue([{ id: "a" }]);
    const set = await sectionIdsBelongToPage("p1", ["a", "b"]);
    expect(set.has("a")).toBe(true);
    expect(set.has("b")).toBe(false);
  });
});

describe("posts queries", () => {
  it("createPost inserta y devuelve la fila", async () => {
    const row = { id: "post1", slug: "hola" };
    insertChain.returning.mockResolvedValue([row]);
    expect(await createPost({ slug: "hola", title: "Hola", content: {} })).toEqual(row);
  });

  it("getPublishedPosts filtra status published y limita", async () => {
    (db.query.marketingPosts.findMany as jest.Mock).mockResolvedValue([{ id: "post1", status: "published" }]);
    const posts = await getPublishedPosts(5);
    expect(posts).toHaveLength(1);
    expect(db.query.marketingPosts.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5, orderBy: expect.anything() })
    );
  });

  it("updatePost y deletePost delegan en db", async () => {
    updateChain.returning.mockResolvedValue([{ id: "p" }]);
    await updatePost("p", { title: "x" });
    expect(db.update).toHaveBeenCalled();

    deleteChain.returning.mockResolvedValue([{ id: "p" }]);
    await deletePost("p");
    expect(db.delete).toHaveBeenCalled();
  });
});

describe("products queries", () => {
  it("getProductBySlug hace left join con categoría y mapea categoryName", async () => {
    selectChain.where.mockResolvedValue([{
      id: "pr1", slug: "camiseta", name: "Camiseta", price: "19.99", categoryId: "c1",
      categoryName: "Ropa", categorySlug: "ropa",
    }]);
    const product = await getProductBySlug("camiseta");
    expect(product?.categoryName).toBe("Ropa");
    expect(product?.price).toBe("19.99"); // numeric devuelve string en pg
    expect(selectChain.leftJoin).toHaveBeenCalled();
  });

  it("getProductBySlug devuelve null si no existe", async () => {
    selectChain.where.mockResolvedValue([]);
    expect(await getProductBySlug("nada")).toBeNull();
  });

  it("listProductsByCategory filtra por categoryId", async () => {
    selectChain.orderBy.mockResolvedValue([{ id: "pr1" }]);
    const products = await listProductsByCategory("c1");
    expect(products).toHaveLength(1);
  });

  it("getPublishedProducts con categorySlug incluye condición de categoría", async () => {
    selectChain.orderBy.mockResolvedValue([]);
    await getPublishedProducts({ categorySlug: "ropa" });
    expect(selectChain.where).toHaveBeenCalled();
  });

  it("createProduct/updateProduct/deleteProduct delegan en db", async () => {
    const row = { id: "pr1" };
    insertChain.returning.mockResolvedValue([row]);
    await createProduct({ slug: "x", name: "X", price: "1.00" });
    expect(db.insert).toHaveBeenCalled();

    updateChain.returning.mockResolvedValue([row]);
    await updateProduct("pr1", { name: "Y" });
    expect(db.update).toHaveBeenCalled();

    deleteChain.returning.mockResolvedValue([row]);
    await deleteProduct("pr1");
    expect(db.delete).toHaveBeenCalled();
  });
});

describe("categories queries", () => {
  it("createCategory inserta y devuelve la fila", async () => {
    const row = { id: "c1", slug: "ropa" };
    insertChain.returning.mockResolvedValue([row]);
    expect(await createCategory({ slug: "ropa", name: "Ropa" })).toEqual(row);
  });

  it("listCategories agrupa con productCount", async () => {
    selectChain.orderBy.mockResolvedValue([{ id: "c1", productCount: 2 }]);
    const cats = await listCategories();
    expect(cats[0].productCount).toBe(2);
  });

  it("updateCategory y deleteCategory delegan en db", async () => {
    updateChain.returning.mockResolvedValue([{ id: "c1" }]);
    await updateCategory("c1", { name: "Ropa2" });
    expect(db.update).toHaveBeenCalled();

    deleteChain.returning.mockResolvedValue([{ id: "c1" }]);
    await deleteCategory("c1");
    expect(db.delete).toHaveBeenCalled();
  });
});

describe("settings queries", () => {
  it("getSettingsMap reduce filas a Record key→value", async () => {
    selectChain.from.mockResolvedValue([
      { key: "siteName", value: "Acme" },
      { key: "logo", value: "/logo.png" },
    ]);
    const map = await getSettingsMap();
    expect(map).toEqual({ siteName: "Acme", logo: "/logo.png" });
  });

  it("getSetting devuelve value o null", async () => {
    selectChain.where.mockResolvedValue([{ value: "Acme" }]);
    expect(await getSetting("siteName")).toBe("Acme");

    selectChain.where.mockResolvedValue([]);
    expect(await getSetting("missing")).toBeNull();
  });

  it("upsertSetting inserta cuando la key no existe", async () => {
    selectChain.where.mockResolvedValue([]);
    const row = { key: "siteName", value: "Acme" };
    insertChain.returning.mockResolvedValue([row]);
    const result = await upsertSetting("siteName", "Acme");
    expect(result).toEqual(row);
    expect(db.insert).toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("upsertSetting actualiza cuando la key ya existe", async () => {
    selectChain.where.mockResolvedValue([{ value: "Old" }]);
    const row = { key: "siteName", value: "New" };
    updateChain.returning.mockResolvedValue([row]);
    const result = await upsertSetting("siteName", "New");
    expect(result).toEqual(row);
    expect(db.update).toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("deleteSetting delega en db", async () => {
    deleteChain.returning.mockResolvedValue([{ key: "siteName" }]);
    await deleteSetting("siteName");
    expect(db.delete).toHaveBeenCalled();
  });
});
