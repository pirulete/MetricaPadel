/**
 * Paths OpenAPI de los endpoints admin del Marketing CMS (guardAdmin + auditoría).
 * Referencias a schemas en lib/api-docs/schemas/marketing.ts (marketingSchemas).
 */
export const adminMarketingTags = {
  name: 'Marketing Admin',
  description: 'Back-office del Marketing CMS: CRUD de páginas, secciones, blog, productos, categorías y settings (guardAdmin + auditoría)',
};

export const adminMarketingPaths = {
  '/api/admin/marketing/pages': {
    get: {
      tags: ['Marketing Admin'],
      summary: 'Listar páginas',
      description: 'Todas las páginas (todos los status) con sectionCount.',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Lista de páginas', content: { 'application/json': { schema: { type: 'object', properties: { pages: { type: 'array', items: { $ref: '#/components/schemas/PageListItem' } } } } } } },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol ADMIN' },
      },
    },
    post: {
      tags: ['Marketing Admin'],
      summary: 'Crear página',
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PageInput' } } } },
      responses: {
        '201': { description: 'Página creada', content: { 'application/json': { schema: { type: 'object', properties: { page: { $ref: '#/components/schemas/PageDto' } } } } } },
        '400': { description: 'Datos inválidos o slug reservado' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol ADMIN' },
        '409': { description: 'Slug duplicado' },
      },
    },
  },
  '/api/admin/marketing/pages/{id}': {
    get: {
      tags: ['Marketing Admin'],
      summary: 'Obtener página con secciones',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'Página con secciones', content: { 'application/json': { schema: { $ref: '#/components/schemas/PageWithSections' } } } },
        '404': { description: 'No existe' },
      },
    },
    patch: {
      tags: ['Marketing Admin'],
      summary: 'Actualizar página',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PagePatchInput' } } } },
      responses: {
        '200': { description: 'Página actualizada' },
        '400': { description: 'Datos inválidos / home guard' },
        '409': { description: 'Slug duplicado' },
      },
    },
    delete: {
      tags: ['Marketing Admin'],
      summary: 'Eliminar página',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'Eliminada (secciones en cascada)' },
        '400': { description: 'Home guard: no borrar la única página publicada home' },
        '404': { description: 'No existe' },
      },
    },
  },
  '/api/admin/marketing/pages/{id}/sections': {
    post: {
      tags: ['Marketing Admin'],
      summary: 'Agregar sección',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SectionInput' } } } },
      responses: {
        '201': { description: 'Sección creada' },
        '400': { description: 'Config inválida para el blockType' },
        '404': { description: 'Página no encontrada' },
      },
    },
    put: {
      tags: ['Marketing Admin'],
      summary: 'Reordenar secciones',
      description: 'Body: { sectionIds: string[] } (orden completo). SortOrders con paso 1024.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['sectionIds'], properties: { sectionIds: { type: 'array', items: { type: 'string', format: 'uuid' } } } } } } },
      responses: {
        '200': { description: 'Secciones reordenadas' },
        '400': { description: 'Secciones no pertenecen a la página' },
      },
    },
  },
  '/api/admin/marketing/pages/{id}/sections/{sectionId}': {
    patch: {
      tags: ['Marketing Admin'],
      summary: 'Actualizar sección',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'sectionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SectionPatchInput' } } } },
      responses: {
        '200': { description: 'Sección actualizada' },
        '400': { description: 'Config inválida' },
        '404': { description: 'Página o sección no encontrada' },
      },
    },
    delete: {
      tags: ['Marketing Admin'],
      summary: 'Eliminar sección',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'sectionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Sección eliminada' },
        '404': { description: 'Página o sección no encontrada' },
      },
    },
  },
  '/api/admin/marketing/blog': {
    get: {
      tags: ['Marketing Admin'],
      summary: 'Listar posts',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Lista de posts', content: { 'application/json': { schema: { type: 'object', properties: { posts: { type: 'array', items: { $ref: '#/components/schemas/PostDto' } } } } } } },
      },
    },
    post: {
      tags: ['Marketing Admin'],
      summary: 'Crear post',
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PostInput' } } } },
      responses: {
        '201': { description: 'Post creado' },
        '400': { description: 'Datos inválidos' },
        '409': { description: 'Slug duplicado' },
      },
    },
  },
  '/api/admin/marketing/blog/{id}': {
    get: {
      tags: ['Marketing Admin'],
      summary: 'Obtener post',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: { '200': { description: 'Post' }, '404': { description: 'No existe' } },
    },
    patch: {
      tags: ['Marketing Admin'],
      summary: 'Actualizar post',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PostPatchInput' } } } },
      responses: { '200': { description: 'Post actualizado' }, '400': { description: 'Datos inválidos' }, '409': { description: 'Slug duplicado' }, '404': { description: 'No existe' } },
    },
    delete: {
      tags: ['Marketing Admin'],
      summary: 'Eliminar post',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: { '200': { description: 'Post eliminado' }, '404': { description: 'No existe' } },
    },
  },
  '/api/admin/marketing/products': {
    get: {
      tags: ['Marketing Admin'],
      summary: 'Listar productos',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Lista con categoryName', content: { 'application/json': { schema: { type: 'object', properties: { products: { type: 'array', items: { $ref: '#/components/schemas/ProductDto' } } } } } } },
      },
    },
    post: {
      tags: ['Marketing Admin'],
      summary: 'Crear producto',
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ProductInput' } } } },
      responses: { '201': { description: 'Producto creado' }, '400': { description: 'Datos inválidos o categoría inexistente' }, '409': { description: 'Slug duplicado' } },
    },
  },
  '/api/admin/marketing/products/{id}': {
    get: {
      tags: ['Marketing Admin'],
      summary: 'Obtener producto',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: { '200': { description: 'Producto' }, '404': { description: 'No existe' } },
    },
    patch: {
      tags: ['Marketing Admin'],
      summary: 'Actualizar producto',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ProductPatchInput' } } } },
      responses: { '200': { description: 'Producto actualizado' }, '400': { description: 'Datos inválidos' }, '409': { description: 'Slug duplicado' }, '404': { description: 'No existe' } },
    },
    delete: {
      tags: ['Marketing Admin'],
      summary: 'Eliminar producto',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: { '200': { description: 'Producto eliminado' }, '404': { description: 'No existe' } },
    },
  },
  '/api/admin/marketing/categories': {
    get: {
      tags: ['Marketing Admin'],
      summary: 'Listar categorías',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Categorías con productCount', content: { 'application/json': { schema: { type: 'object', properties: { categories: { type: 'array', items: { $ref: '#/components/schemas/CategoryWithCount' } } } } } } },
      },
    },
    post: {
      tags: ['Marketing Admin'],
      summary: 'Crear categoría',
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CategoryInput' } } } },
      responses: { '201': { description: 'Categoría creada' }, '400': { description: 'Datos inválidos' }, '409': { description: 'Slug duplicado' } },
    },
  },
  '/api/admin/marketing/categories/{id}': {
    get: {
      tags: ['Marketing Admin'],
      summary: 'Obtener categoría',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: { '200': { description: 'Categoría' }, '404': { description: 'No existe' } },
    },
    patch: {
      tags: ['Marketing Admin'],
      summary: 'Actualizar categoría',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CategoryPatchInput' } } } },
      responses: { '200': { description: 'Categoría actualizada' }, '400': { description: 'Datos inválidos' }, '409': { description: 'Slug duplicado' } },
    },
    delete: {
      tags: ['Marketing Admin'],
      summary: 'Eliminar categoría',
      description: 'Los productos de la categoría quedan sin categoría (FK SET NULL).',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: { '200': { description: 'Categoría eliminada' }, '404': { description: 'No existe' } },
    },
  },
  '/api/admin/marketing/settings': {
    get: {
      tags: ['Marketing Admin'],
      summary: 'Obtener settings',
      security: [{ bearerAuth: [] }],
      responses: { '200': { description: 'Mapa key → value', content: { 'application/json': { schema: { type: 'object', properties: { settings: { type: 'object', additionalProperties: true } } } } } } },
    },
    patch: {
      tags: ['Marketing Admin'],
      summary: 'Actualizar settings (upsert por key)',
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['settings'], properties: { settings: { $ref: '#/components/schemas/SettingsInput' } } } } } },
      responses: { '200': { description: 'Settings aplicados' }, '400': { description: 'Datos inválidos' } },
    },
  },
  '/api/admin/marketing/revalidate': {
    post: {
      tags: ['Marketing Admin'],
      summary: 'Invalidar caché manualmente',
      description: 'Body: { tags: string[] } (whitelist pages:*|posts|products|settings|navigation) o { all: true }.',
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { tags: { type: 'array', items: { type: 'string' } }, all: { type: 'boolean' } } } } } },
      responses: {
        '200': { description: 'Tags revalidados', content: { 'application/json': { schema: { type: 'object', properties: { revalidated: { type: 'array', items: { type: 'string' } } } } } } },
        '400': { description: 'Tags no permitidos o body inválido' },
      },
    },
  },
};
