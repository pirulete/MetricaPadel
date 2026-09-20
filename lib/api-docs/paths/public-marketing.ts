/**
 * Paths OpenAPI de los endpoints públicos del Marketing CMS.
 */
export const publicMarketingPaths = {
  '/api/public/pages/{slug}': {
    get: {
      tags: ['Marketing Public'],
      summary: 'Obtener página publicada con secciones',
      description: 'Devuelve la página publicada con slug indicado y sus secciones ordenadas (caché tag pages:{slug}, TTL 300s). Drafts y slugs reservados → 404.',
      parameters: [
        {
          name: 'slug',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Slug de la página (ej: home, about). No puede ser un slug reservado.',
        },
      ],
      responses: {
        '200': {
          description: 'Página con secciones',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/PageWithSections' } } },
        },
        '404': { description: 'No existe o es draft o slug reservado', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
      },
    },
  },
  '/api/public/posts': {
    get: {
      tags: ['Marketing Public'],
      summary: 'Listar posts publicados',
      description: 'Posts publicados ordenados por publishedAt desc (caché tag posts).',
      parameters: [
        {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
        },
      ],
      responses: {
        '200': {
          description: 'Lista de posts',
          content: { 'application/json': { schema: { type: 'object', properties: { posts: { type: 'array', items: { $ref: '#/components/schemas/PostDto' } } } } } },
        },
      },
    },
  },
  '/api/public/posts/{slug}': {
    get: {
      tags: ['Marketing Public'],
      summary: 'Obtener post publicado',
      responses: {
        '200': {
          description: 'Post publicado',
          content: { 'application/json': { schema: { type: 'object', properties: { post: { $ref: '#/components/schemas/PostDto' } } } } },
        },
        '404': { description: 'Post no encontrado o draft' },
      },
    },
  },
  '/api/public/products': {
    get: {
      tags: ['Marketing Public'],
      summary: 'Listar productos publicados',
      description: 'Productos publicados (caché tag products). Filtro opcional por slug de categoría.',
      parameters: [
        {
          name: 'category',
          in: 'query',
          schema: { type: 'string' },
          description: 'Slug de categoría para filtrar',
        },
      ],
      responses: {
        '200': {
          description: 'Lista de productos',
          content: { 'application/json': { schema: { type: 'object', properties: { products: { type: 'array', items: { $ref: '#/components/schemas/ProductDto' } } } } } },
        },
      },
    },
  },
  '/api/public/products/{slug}': {
    get: {
      tags: ['Marketing Public'],
      summary: 'Obtener producto publicado',
      responses: {
        '200': {
          description: 'Producto publicado',
          content: { 'application/json': { schema: { type: 'object', properties: { product: { $ref: '#/components/schemas/ProductDto' } } } } },
        },
        '404': { description: 'Producto no encontrado o draft' },
      },
    },
  },
  '/api/public/settings/navigation': {
    get: {
      tags: ['Marketing Public'],
      summary: 'Obtener navegación pública',
      description: 'siteName, logo, navLinks y footerLinks desde marketing_settings (caché tag navigation). Defaults vacíos si no hay settings.',
      responses: {
        '200': {
          description: 'Datos de navegación',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/NavigationDto' } } },
        },
      },
    },
  },
  '/api/public/contact': {
    post: {
      tags: ['Marketing Public'],
      summary: 'Enviar mensaje de contacto',
      description: 'Valida payload con Zod y aplica rate limit por IP (100 req/min). v0.1: sin persistencia ni email.',
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ContactInput' } } },
      },
      responses: {
        '200': {
          description: 'Mensaje aceptado',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ContactOk' } } },
        },
        '400': { description: 'Validación fallida', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        '429': { description: 'Rate limit excedido', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
      },
    },
  },
} as const
