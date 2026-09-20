/**
 * Tests de la capa de caché del Marketing CMS.
 * Mockea next/cache (unstable_cache ejecuta la fn directamente) y las queries
 * de marketing para no tocar la DB en unit tests.
 */
import {
  CACHE_TAGS,
  MARKETING_CACHE_TTL,
  pageTag,
  getCachedPage,
  getCachedPosts,
  getCachedProducts,
  getCachedSettings,
  getCachedNavigation,
  invalidateForEntity,
  revalidateMarketing,
} from "@/lib/marketing/cache";

jest.mock("next/cache", () => ({
  unstable_cache: jest.fn((fn: () => unknown) => fn),
  revalidateTag: jest.fn(),
}));

jest.mock("@/lib/db/queries/marketing", () => ({
  getPageBySlug: jest.fn().mockResolvedValue(null),
  getPublishedPosts: jest.fn().mockResolvedValue([]),
  getPublishedProducts: jest.fn().mockResolvedValue([]),
  getSettingsMap: jest.fn().mockResolvedValue({}),
}));

import { unstable_cache, revalidateTag } from "next/cache";
import { getSettingsMap } from "@/lib/db/queries/marketing";

const unstableCacheMock = unstable_cache as jest.Mock;
const revalidateTagMock = revalidateTag as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("tags y TTL", () => {
  it("pageTag construye pages:<slug>", () => {
    expect(pageTag("home")).toBe("pages:home");
  });

  it("getCachedPage registra key y tag correctos", async () => {
    await getCachedPage("home");
    expect(unstableCacheMock).toHaveBeenCalledWith(
      expect.any(Function),
      ["mk-page", "home"],
      { tags: ["pages:home"], revalidate: MARKETING_CACHE_TTL }
    );
  });

  it("getCachedPosts registra tag posts", async () => {
    await getCachedPosts(10);
    expect(unstableCacheMock).toHaveBeenCalledWith(
      expect.any(Function),
      ["mk-posts", "10"],
      { tags: [CACHE_TAGS.posts], revalidate: MARKETING_CACHE_TTL }
    );
  });

  it("getCachedProducts incluye categorySlug en key y tag products", async () => {
    await getCachedProducts({ categorySlug: "ext" });
    expect(unstableCacheMock).toHaveBeenCalledWith(
      expect.any(Function),
      ["mk-products", "ext"],
      { tags: [CACHE_TAGS.products], revalidate: MARKETING_CACHE_TTL }
    );
  });

  it("getCachedSettings registra tag settings", async () => {
    await getCachedSettings();
    expect(unstableCacheMock).toHaveBeenCalledWith(
      expect.any(Function),
      ["mk-settings"],
      { tags: [CACHE_TAGS.settings], revalidate: MARKETING_CACHE_TTL }
    );
  });

  it("getCachedNavigation registra tag navigation", async () => {
    await getCachedNavigation();
    expect(unstableCacheMock).toHaveBeenCalledWith(
      expect.any(Function),
      ["mk-navigation"],
      { tags: [CACHE_TAGS.navigation], revalidate: MARKETING_CACHE_TTL }
    );
  });
});

describe("invalidateForEntity", () => {
  it("page → pages:<slug>", () => {
    expect(invalidateForEntity("page", "about")).toEqual(["pages:about"]);
  });

  it("post → posts", () => {
    expect(invalidateForEntity("post")).toEqual(["posts"]);
  });

  it("product y category → products", () => {
    expect(invalidateForEntity("product")).toEqual(["products"]);
    expect(invalidateForEntity("category")).toEqual(["products"]);
  });

  it("settings → settings + navigation", () => {
    expect(invalidateForEntity("settings")).toEqual(["settings", "navigation"]);
  });

  it("navigation → navigation", () => {
    expect(invalidateForEntity("navigation")).toEqual(["navigation"]);
  });
});

describe("revalidateMarketing", () => {
  it("llama revalidateTag por cada tag con su perfil de caché", () => {
    revalidateMarketing(["pages:home", "posts"]);
    expect(revalidateTagMock).toHaveBeenCalledTimes(2);
    expect(revalidateTagMock).toHaveBeenCalledWith("pages:home", { expire: MARKETING_CACHE_TTL });
    expect(revalidateTagMock).toHaveBeenCalledWith("posts", { expire: MARKETING_CACHE_TTL });
  });
});

describe("getCachedNavigation", () => {
  it("devuelve defaults cuando no hay settings", async () => {
    const nav = await getCachedNavigation();
    expect(nav).toEqual({ siteName: "", logo: "", navLinks: [], footerLinks: [] });
  });

  it("mapea settings parciales", async () => {
    (getSettingsMap as jest.Mock).mockResolvedValueOnce({
      siteName: "Acme",
      navLinks: [{ label: "Blog", href: "/blog" }],
    });
    const nav = await getCachedNavigation();
    expect(nav.siteName).toBe("Acme");
    expect(nav.navLinks).toEqual([{ label: "Blog", href: "/blog" }]);
    expect(nav.footerLinks).toEqual([]);
  });
});
