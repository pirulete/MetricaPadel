/**
 * Seed demo del Marketing CMS para entorno local / E2E.
 * Crea: settings (siteName, navLinks, footerLinks), página home publicada
 * con 4 secciones (hero, features_grid, pricing, cta_banner), 1 categoría,
 * 2 productos publicados y 2 posts publicados.
 *
 * Uso: DATABASE_URL="..." pnpm run seed:marketing
 */
import "dotenv/config";
import { db } from "@/lib/db";
import {
  marketingPages,
  marketingSections,
  marketingPosts,
  marketingProducts,
  marketingCategories,
  marketingSettings,
} from "@/lib/db/schema";

async function seed() {
  console.log("🌱 Seed Marketing CMS…");

  // ── Settings globales ──────────────────────────────────────────────
  const settings: Array<{ key: string; value: unknown }> = [
    { key: "siteName", value: "Acme" },
    {
      key: "navLinks",
      value: [
        { label: "Inicio", href: "/" },
        { label: "Productos", href: "/shop" },
        { label: "Blog", href: "/blog" },
      ],
    },
    {
      key: "footerLinks",
      value: [
        { label: "Términos", href: "#" },
        { label: "Privacidad", href: "#" },
        { label: "Contacto", href: "#" },
      ],
    },
  ];
  for (const setting of settings) {
    await db
      .insert(marketingSettings)
      .values(setting)
      .onConflictDoUpdate({ target: marketingSettings.key, set: { value: setting.value } });
  }
  console.log("✅ Settings creados/actualizados");

  // ── Página home publicada con 4 secciones ──────────────────────────
  const existingHome = await db.query.marketingPages.findFirst({
    where: (table, { eq }) => eq(table.slug, "home"),
  });

  if (!existingHome) {
    const [home] = await db
      .insert(marketingPages)
      .values({
        slug: "home",
        title: "Inicio",
        seoTitle: "Acme — Plataforma CMS",
        seoDescription: "Publica landing pages, blog y catálogo desde un admin panel.",
        status: "published",
        sortOrder: 0,
      })
      .returning();

    const sections = [
      {
        blockType: "hero" as const,
        sortOrder: 0,
        config: {
          title: "La plataforma CMS para tu sitio de marketing",
          subtitle:
            "Publica landing pages, blog y catálogo desde un admin panel sin tocar código. Rápido, seguro y accesible.",
          ctas: [
            { label: "Empezar", href: "/register", variant: "default" },
            { label: "Ver productos", href: "/shop", variant: "outline" },
          ],
        },
      },
      {
        blockType: "features_grid" as const,
        sortOrder: 1,
        config: {
          title: "Características",
          subtitle: "Todo lo que necesitas para lanzar tu sitio.",
          features: [
            { icon: "⚡", title: "Rápido", description: "Render desde caché con TTL 300s y revalidación on-demand." },
            { icon: "🎨", title: "Editable", description: "10 block types configurables sin tocar código." },
            { icon: "🛡️", title: "Seguro", description: "Validación Zod, guards admin y auditoría en cada mutación." },
            { icon: "📱", title: "Responsive", description: "Mobile-first con breakpoints 375 / 640 / 768 / 1024 / 1280." },
          ],
        },
      },
      {
        blockType: "pricing" as const,
        sortOrder: 2,
        config: {
          title: "Precios",
          plans: [
            {
              name: "Starter",
              price: "$0",
              period: "/mes",
              features: ["1 página"],
              ctaLabel: "Empezar",
              ctaHref: "/register",
            },
            {
              name: "Pro",
              price: "$29",
              period: "/mes",
              features: ["Páginas ilimitadas", "Blog + catálogo"],
              ctaLabel: "Elegir Pro",
              ctaHref: "/register",
              highlighted: true,
            },
            {
              name: "Enterprise",
              price: "$99",
              period: "/mes",
              features: ["Multi-site", "SSO"],
              ctaLabel: "Contactar",
              ctaHref: "/contacto",
            },
          ],
        },
      },
      {
        blockType: "cta_banner" as const,
        sortOrder: 3,
        config: {
          title: "¿Listo para publicar tu sitio?",
          subtitle: "Crea tu primera página en minutos con el editor de bloques.",
          buttonLabel: "Comenzar ahora",
          buttonHref: "/register",
        },
      },
    ];

    await db.insert(marketingSections).values(
      sections.map((section) => ({ ...section, pageId: home.id, config: section.config as object }))
    );
    console.log("✅ Home con 4 secciones creada");
  } else {
    console.log("ℹ️ Home ya existe, se omite");
  }

  // ── Categoría + productos ──────────────────────────────────────────
  const category = await db
    .insert(marketingCategories)
    .values({ slug: "suscripcion", name: "Suscripción", sortOrder: 0 })
    .onConflictDoNothing()
    .returning();
  const categoryId =
    category[0]?.id ??
    (
      await db.query.marketingCategories.findFirst({
        where: (table, { eq }) => eq(table.slug, "suscripcion"),
      })
    )?.id;

  const existingProduct = await db.query.marketingProducts.findFirst({});
  if (!existingProduct) {
    await db.insert(marketingProducts).values([
      {
        slug: "plan-pro",
        name: "Plan Pro",
        description: "Para equipos en crecimiento.",
        price: "29.99",
        compareAtPrice: "39.99",
        categoryId,
        status: "published",
        sortOrder: 0,
      },
      {
        slug: "plan-enterprise",
        name: "Plan Enterprise",
        description: "Para operaciones grandes.",
        price: "99.00",
        categoryId,
        status: "published",
        sortOrder: 1,
      },
    ]);
    console.log("✅ 2 productos creados");
  }

  // ── Posts ──────────────────────────────────────────────────────────
  const existingPost = await db.query.marketingPosts.findFirst({});
  if (!existingPost) {
    await db.insert(marketingPosts).values([
      {
        slug: "como-lanzar-una-landing",
        title: "Cómo lanzar una landing en 5 minutos",
        excerpt: "Guía paso a paso con el nuevo CMS.",
        content: [
          { type: "heading", text: "Paso 1: crea una página" },
          { type: "paragraph", text: "Desde el admin panel, crea una página y agrega secciones." },
          { type: "list", items: ["Elige un block type", "Configura el contenido", "Publica"] },
        ],
        status: "published",
        publishedAt: new Date("2026-07-12T10:00:00Z"),
      },
      {
        slug: "block-types-guia",
        title: "Block types: guía de configuración",
        excerpt: "Todos los schemas jsonb explicados.",
        content: [{ type: "paragraph", text: "Cada block type tiene un schema Zod validado al guardar y renderizar." }],
        status: "published",
        publishedAt: new Date("2026-06-28T10:00:00Z"),
      },
    ]);
    console.log("✅ 2 posts creados");
  }

  console.log("🌱 Seed completado.");
  process.exit(0);
}

seed().catch((error) => {
  console.error("❌ Seed falló:", error);
  process.exit(1);
});
