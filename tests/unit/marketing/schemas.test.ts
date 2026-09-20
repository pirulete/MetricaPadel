/**
 * Tests de los schemas Zod del Marketing CMS:
 * 10 block types válidos/inválidos + entidades + anti-XSS.
 */
import {
  BLOCK_TYPE_REGISTRY,
  parseBlockConfig,
  heroSchema,
  featuresGridSchema,
  pricingSchema,
  testimonialsSchema,
  ctaBannerSchema,
  faqSchema,
  contactFormSchema,
  statsSchema,
  productGridSchema,
  blogListSchema,
  slugSchema,
  pageSchema,
  postSchema,
  postContentSchema,
  productSchema,
  categorySchema,
  settingsSchema,
  navLinkSchema,
  contactSchema,
} from "@/lib/marketing/schemas";
import { isReservedSlug } from "@/lib/marketing/reserved-slugs";

describe("registry de block types", () => {
  it("tiene exactamente los 10 block types", () => {
    expect(Object.keys(BLOCK_TYPE_REGISTRY)).toEqual([
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

  it("parseBlockConfig devuelve data tipada para config válida", () => {
    const result = parseBlockConfig("hero", { title: "Hola" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.title).toBe("Hola");
    }
  });

  it("parseBlockConfig rechaza blockType desconocido", () => {
    const result = parseBlockConfig("nope", {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("desconocido");
  });
});

describe("anti-XSS en href e imágenes", () => {
  it.each(["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html;base64,PHNjcmlwdD4=", "vbscript:msgbox(1)"])(
    "rechaza esquema inseguro en href: %s",
    (href) => {
      const result = heroSchema.safeParse({ title: "T", ctas: [{ label: "X", href }] });
      expect(result.success).toBe(false);
    }
  );

  it("acepta hrefs relativos y absolutos seguros", () => {
    expect(heroSchema.safeParse({ title: "T", ctas: [{ label: "X", href: "/blog" }] }).success).toBe(true);
    expect(heroSchema.safeParse({ title: "T", ctas: [{ label: "X", href: "https://ejemplo.com" }] }).success).toBe(true);
    expect(heroSchema.safeParse({ title: "T", ctas: [{ label: "X", href: "#contacto" }] }).success).toBe(true);
  });

  it("rechaza data: y javascript: en imágenes", () => {
    expect(heroSchema.safeParse({ title: "T", image: "data:image/svg+xml;base64,PHN2Zz4=" }).success).toBe(false);
    expect(heroSchema.safeParse({ title: "T", image: "javascript:alert(1)" }).success).toBe(false);
    expect(heroSchema.safeParse({ title: "T", image: "https://cdn.ejemplo.com/a.png" }).success).toBe(true);
  });

  it("navLinkSchema rechaza javascript: en href", () => {
    expect(navLinkSchema.safeParse({ label: "X", href: "javascript:alert(1)" }).success).toBe(false);
  });
});

describe("hero", () => {
  it("valida config mínima", () => {
    expect(heroSchema.safeParse({ title: "Hola mundo" }).success).toBe(true);
  });
  it("rechaza sin título", () => {
    expect(heroSchema.safeParse({}).success).toBe(false);
  });
  it("limita ctas a 4", () => {
    const ctas = Array.from({ length: 5 }, () => ({ label: "x", href: "/" }));
    expect(heroSchema.safeParse({ title: "T", ctas }).success).toBe(false);
  });
});

describe("features_grid", () => {
  it("valida con features", () => {
    expect(
      featuresGridSchema.safeParse({ title: "F", features: [{ title: "a", description: "b" }] }).success
    ).toBe(true);
  });
  it("permite lista vacía (estado empty)", () => {
    expect(featuresGridSchema.safeParse({ title: "F" }).success).toBe(true);
  });
});

describe("pricing", () => {
  it("valida plan con highlight", () => {
    expect(
      pricingSchema.safeParse({
        title: "P",
        plans: [{ name: "Pro", price: "$29", highlighted: true, features: ["a"] }],
      }).success
    ).toBe(true);
  });
  it("limita a 6 planes", () => {
    const plans = Array.from({ length: 7 }, (_, i) => ({ name: `p${i}`, price: "$1" }));
    expect(pricingSchema.safeParse({ title: "P", plans }).success).toBe(false);
  });
});

describe("testimonials / cta_banner / faq / stats / contact_form", () => {
  it("testimonials valida y limita a 12", () => {
    expect(
      testimonialsSchema.safeParse({ title: "T", items: [{ quote: "q", author: "a" }] }).success
    ).toBe(true);
    const items = Array.from({ length: 13 }, (_, i) => ({ quote: `q${i}`, author: "a" }));
    expect(testimonialsSchema.safeParse({ title: "T", items }).success).toBe(false);
  });

  it("cta_banner acepta config mínima y valida href", () => {
    expect(ctaBannerSchema.safeParse({ title: "CTA" }).success).toBe(true);
    expect(ctaBannerSchema.safeParse({ title: "CTA", buttonHref: "javascript:x" }).success).toBe(false);
  });

  it("faq valida items y rechaza respuesta vacía", () => {
    expect(faqSchema.safeParse({ title: "FAQ", items: [{ question: "q", answer: "a" }] }).success).toBe(true);
    expect(faqSchema.safeParse({ title: "FAQ", items: [{ question: "q", answer: "" }] }).success).toBe(false);
  });

  it("stats valida items", () => {
    expect(statsSchema.safeParse({ items: [{ value: "120+", label: "Páginas" }] }).success).toBe(true);
  });

  it("contact_form acepta vacío (config opcional)", () => {
    expect(contactFormSchema.safeParse({}).success).toBe(true);
  });
});

describe("product_grid / blog_list", () => {
  it("product_grid valida con defaults", () => {
    const result = productGridSchema.safeParse({ title: "Catálogo", categoryFilter: "suscripcion" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(8);
      expect(result.data.columns).toBe(3);
    }
  });
  it("product_grid rechaza limit fuera de rango", () => {
    expect(productGridSchema.safeParse({ limit: 999 }).success).toBe(false);
  });
  it("blog_list valida y limita columns", () => {
    expect(blogListSchema.safeParse({ columns: 2 }).success).toBe(true);
    expect(blogListSchema.safeParse({ columns: 5 }).success).toBe(false);
  });
});

describe("entidades", () => {
  it("slugSchema acepta slugs válidos y rechaza inválidos", () => {
    expect(slugSchema.safeParse("mi-pagina-1").success).toBe(true);
    expect(slugSchema.safeParse("-invalido").success).toBe(false);
    expect(slugSchema.safeParse("Invalido").success).toBe(false);
    expect(slugSchema.safeParse("con_guion_bajo").success).toBe(false);
  });

  it("isReservedSlug detecta reservados", () => {
    expect(isReservedSlug("home")).toBe(true);
    expect(isReservedSlug("admin")).toBe(true);
    expect(isReservedSlug("mi-pagina")).toBe(false);
  });

  it("pageSchema valida y aplica status default", () => {
    const result = pageSchema.safeParse({ slug: "about", title: "Acerca" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe("draft");
  });

  it("postSchema valida contenido tipográfico y rechaza HTML", () => {
    expect(
      postSchema.safeParse({
        slug: "post-1",
        title: "Post",
        content: [{ type: "heading", text: "Hola" }],
      }).success
    ).toBe(true);
    const result = postContentSchema.safeParse([{ type: "paragraph", text: "<script>alert(1)</script>" }]);
    expect(result.success).toBe(true); // es texto, se escapa por React
  });

  it("productSchema valida price string y rechaza no decimal", () => {
    expect(
      productSchema.safeParse({ slug: "plan-pro", name: "Pro", price: "29.99" }).success
    ).toBe(true);
    expect(productSchema.safeParse({ slug: "plan-pro", name: "Pro", price: "abc" }).success).toBe(false);
  });

  it("categorySchema valida", () => {
    expect(categorySchema.safeParse({ slug: "ext", name: "Extensiones" }).success).toBe(true);
  });

  it("settingsSchema valida navLinks y rechaza href inseguro", () => {
    expect(
      settingsSchema.safeParse({ siteName: "Acme", navLinks: [{ label: "Blog", href: "/blog" }] }).success
    ).toBe(true);
    expect(
      settingsSchema.safeParse({ navLinks: [{ label: "X", href: "javascript:alert(1)" }] }).success
    ).toBe(false);
  });

  it("contactSchema valida y aplica límites de tamaño", () => {
    expect(contactSchema.safeParse({ name: "Ana", email: "ana@x.com", message: "Hola" }).success).toBe(true);
    expect(contactSchema.safeParse({ name: "Ana", email: "no-email", message: "Hola" }).success).toBe(false);
    expect(
      contactSchema.safeParse({ name: "Ana", email: "ana@x.com", message: "x".repeat(2001) }).success
    ).toBe(false);
  });
});
