/**
 * Schemas OpenAPI de las entidades del Marketing CMS (público + admin).
 */
export const marketingSchemas = {
  PageDto: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      slug: { type: 'string' },
      title: { type: 'string' },
      seoTitle: { type: 'string', nullable: true },
      seoDescription: { type: 'string', nullable: true },
      status: { type: 'string', enum: ['draft', 'published'] },
      sortOrder: { type: 'integer' },
    },
  },
  SectionDto: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      blockType: {
        type: 'string',
        enum: ['hero', 'features_grid', 'pricing', 'testimonials', 'cta_banner', 'faq', 'contact_form', 'stats', 'product_grid', 'blog_list'],
      },
      config: { type: 'object', additionalProperties: true },
      sortOrder: { type: 'integer' },
    },
  },
  PageWithSections: {
    type: 'object',
    properties: {
      page: { $ref: '#/components/schemas/PageDto' },
      sections: { type: 'array', items: { $ref: '#/components/schemas/SectionDto' } },
    },
  },
  PostDto: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      slug: { type: 'string' },
      title: { type: 'string' },
      excerpt: { type: 'string', nullable: true },
      content: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['heading', 'paragraph', 'list'] },
            text: { type: 'string' },
            items: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      coverImage: { type: 'string', nullable: true },
      publishedAt: { type: 'string', format: 'date-time', nullable: true },
      status: { type: 'string', enum: ['draft', 'published'] },
    },
  },
  ProductDto: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      slug: { type: 'string' },
      name: { type: 'string' },
      description: { type: 'string', nullable: true },
      price: { type: 'string', description: 'Precio como string decimal (numeric de pg)' },
      compareAtPrice: { type: 'string', nullable: true },
      images: { type: 'array', items: { type: 'string', format: 'uri' } },
      categoryId: { type: 'string', format: 'uuid', nullable: true },
      categorySlug: { type: 'string', nullable: true },
      categoryName: { type: 'string', nullable: true },
      sortOrder: { type: 'integer' },
      status: { type: 'string', enum: ['draft', 'published'] },
    },
  },
  NavigationDto: {
    type: 'object',
    properties: {
      siteName: { type: 'string' },
      logo: { type: 'string' },
      navLinks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            href: { type: 'string' },
          },
        },
      },
      footerLinks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            href: { type: 'string' },
          },
        },
      },
    },
  },
  ContactInput: {
    type: 'object',
    required: ['name', 'email', 'message'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 100 },
      email: { type: 'string', format: 'email' },
      message: { type: 'string', minLength: 1, maxLength: 2000 },
    },
  },
  ContactOk: {
    type: 'object',
    properties: {
      ok: { type: 'boolean', enum: [true] },
    },
  },
  // ── Admin ────────────────────────────────────────────────────────────
  PageListItem: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      slug: { type: 'string' },
      title: { type: 'string' },
      status: { type: 'string', enum: ['draft', 'published'] },
      sectionCount: { type: 'integer' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  PageInput: {
    type: 'object',
    required: ['slug', 'title'],
    properties: {
      slug: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', description: 'Slug en minúsculas; no puede ser reservado' },
      title: { type: 'string', maxLength: 200 },
      seoTitle: { type: 'string', maxLength: 200 },
      seoDescription: { type: 'string', maxLength: 500 },
      status: { type: 'string', enum: ['draft', 'published'], default: 'draft' },
      sortOrder: { type: 'integer', minimum: 0, default: 0 },
    },
  },
  PagePatchInput: {
    type: 'object',
    properties: {
      slug: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
      title: { type: 'string', maxLength: 200 },
      seoTitle: { type: 'string', maxLength: 200 },
      seoDescription: { type: 'string', maxLength: 500 },
      status: { type: 'string', enum: ['draft', 'published'] },
      sortOrder: { type: 'integer', minimum: 0 },
    },
  },
  SectionInput: {
    type: 'object',
    required: ['blockType', 'config'],
    properties: {
      blockType: {
        type: 'string',
        enum: ['hero', 'features_grid', 'pricing', 'testimonials', 'cta_banner', 'faq', 'contact_form', 'stats', 'product_grid', 'blog_list'],
      },
      config: { type: 'object', additionalProperties: true, description: 'Validada contra el schema del blockType' },
      sortOrder: { type: 'integer', minimum: 0 },
    },
  },
  SectionPatchInput: {
    type: 'object',
    properties: {
      blockType: {
        type: 'string',
        enum: ['hero', 'features_grid', 'pricing', 'testimonials', 'cta_banner', 'faq', 'contact_form', 'stats', 'product_grid', 'blog_list'],
      },
      config: { type: 'object', additionalProperties: true },
    },
  },
  PostInput: {
    type: 'object',
    required: ['slug', 'title', 'content'],
    properties: {
      slug: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
      title: { type: 'string', maxLength: 200 },
      excerpt: { type: 'string', maxLength: 500 },
      content: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: ['heading', 'paragraph', 'list'] }, text: { type: 'string' }, items: { type: 'array', items: { type: 'string' } } } } },
      coverImage: { type: 'string' },
      publishedAt: { type: 'string', format: 'date-time', nullable: true },
      status: { type: 'string', enum: ['draft', 'published'] },
    },
  },
  PostPatchInput: {
    type: 'object',
    properties: {
      slug: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
      title: { type: 'string', maxLength: 200 },
      excerpt: { type: 'string', maxLength: 500 },
      content: { type: 'array', items: { type: 'object' } },
      coverImage: { type: 'string' },
      publishedAt: { type: 'string', format: 'date-time', nullable: true },
      status: { type: 'string', enum: ['draft', 'published'] },
    },
  },
  ProductInput: {
    type: 'object',
    required: ['slug', 'name', 'price'],
    properties: {
      slug: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
      name: { type: 'string', maxLength: 200 },
      description: { type: 'string', maxLength: 5000 },
      price: { type: 'string', pattern: '^\\d+(\\.\\d{1,2})?$', description: 'Precio como string decimal (ej: 29.99)' },
      compareAtPrice: { type: 'string', pattern: '^\\d+(\\.\\d{1,2})?$', nullable: true },
      images: { type: 'array', items: { type: 'string', format: 'uri' } },
      categoryId: { type: 'string', format: 'uuid', nullable: true },
      status: { type: 'string', enum: ['draft', 'published'] },
      sortOrder: { type: 'integer', minimum: 0 },
    },
  },
  ProductPatchInput: {
    type: 'object',
    properties: {
      slug: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
      name: { type: 'string', maxLength: 200 },
      description: { type: 'string', maxLength: 5000 },
      price: { type: 'string', pattern: '^\\d+(\\.\\d{1,2})?$' },
      compareAtPrice: { type: 'string', pattern: '^\\d+(\\.\\d{1,2})?$', nullable: true },
      images: { type: 'array', items: { type: 'string', format: 'uri' } },
      categoryId: { type: 'string', format: 'uuid', nullable: true },
      status: { type: 'string', enum: ['draft', 'published'] },
      sortOrder: { type: 'integer', minimum: 0 },
    },
  },
  CategoryInput: {
    type: 'object',
    required: ['slug', 'name'],
    properties: {
      slug: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
      name: { type: 'string', maxLength: 200 },
      sortOrder: { type: 'integer', minimum: 0, default: 0 },
    },
  },
  CategoryPatchInput: {
    type: 'object',
    properties: {
      slug: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
      name: { type: 'string', maxLength: 200 },
      sortOrder: { type: 'integer', minimum: 0 },
    },
  },
  CategoryWithCount: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      slug: { type: 'string' },
      name: { type: 'string' },
      sortOrder: { type: 'integer' },
      productCount: { type: 'integer' },
    },
  },
  SettingsInput: {
    type: 'object',
    properties: {
      siteName: { type: 'string', maxLength: 120 },
      logo: { type: 'string' },
      navLinks: {
        type: 'array',
        maxItems: 12,
        items: { type: 'object', required: ['label', 'href'], properties: { label: { type: 'string', maxLength: 60 }, href: { type: 'string' } } },
      },
      footerLinks: {
        type: 'array',
        maxItems: 12,
        items: { type: 'object', required: ['label', 'href'], properties: { label: { type: 'string', maxLength: 60 }, href: { type: 'string' } } },
      },
    },
  },
} as const
