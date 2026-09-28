/**
 * Paths OpenAPI de Academias, Miembros, Rúbricas institucionales y PDF
 * (SPEC-EPIC-01). Referencias a schemas en lib/api-docs/schemas/academies.ts.
 */
export const academiesTags = {
  name: 'Academias',
  description: 'Academias multi-tenant (RBAC por academia: OWNER/ADMIN/COACH), branding, miembros y rúbricas institucionales',
};

export const academiesPaths = {
  '/api/academies': {
    get: {
      tags: ['Academias'],
      summary: 'Listar academias del usuario',
      description: 'Academias donde el usuario es miembro ACTIVO (cualquier rol) y la academia está activa. guardUser.',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Lista de academias', content: { 'application/json': { schema: { type: 'object', properties: { academies: { type: 'array', items: { $ref: '#/components/schemas/AcademyListItem' } } } } } } },
        '401': { description: 'No autenticado' },
        '403': { description: 'No autorizado (LOCKED/TEMPORARY)' },
      },
    },
    post: {
      tags: ['Academias'],
      summary: 'Crear academia',
      description: 'Crea academia (guardAdmin) + inserta membresía OWNER activa en la misma transacción. 409 si el slug ya existe. Audita CREATE.',
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AcademyInput' } } } },
      responses: {
        '201': { description: 'Academia creada', content: { 'application/json': { schema: { type: 'object', properties: { academy: { $ref: '#/components/schemas/AcademyDto' } } } } } },
        '400': { description: 'Datos inválidos' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol ADMIN' },
        '409': { description: 'Slug duplicado' },
      },
    },
  },
  '/api/academies/{id}': {
    get: {
      tags: ['Academias'],
      summary: 'Detalle de academia',
      description: 'Detalle + myRole (rol del caller). guardAcademyCoach: miembro activo. 404 anti-IDOR si no es miembro o está archivada.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'Detalle', content: { 'application/json': { schema: { $ref: '#/components/schemas/AcademyDetail' } } } },
        '400': { description: 'id inválido' },
        '401': { description: 'No autenticado' },
        '403': { description: 'No autorizado' },
        '404': { description: 'No encontrada (anti-IDOR)' },
      },
    },
    put: {
      tags: ['Academias'],
      summary: 'Actualizar branding',
      description: 'Actualiza name/slug/primaryColor. guardAcademyAdmin (OWNER/ADMIN). 409 slug duplicado. Audita UPDATE.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AcademyInput' } } } },
      responses: {
        '200': { description: 'Academia actualizada', content: { 'application/json': { schema: { type: 'object', properties: { academy: { $ref: '#/components/schemas/AcademyDto' } } } } } },
        '400': { description: 'Datos inválidos' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Rol insuficiente (COACH)' },
        '404': { description: 'No encontrada' },
        '409': { description: 'Slug duplicado' },
      },
    },
    delete: {
      tags: ['Academias'],
      summary: 'Archivar academia',
      description: 'Soft archive (status=archived). guardAcademyOwner: solo OWNER. Audita DELETE.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'Academia archivada', content: { 'application/json': { schema: { type: 'object', properties: { academy: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, status: { type: 'string', enum: ['archived'] } } } } } } } },
        '400': { description: 'id inválido' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Rol insuficiente (no OWNER)' },
        '404': { description: 'No encontrada' },
      },
    },
  },
  '/api/academies/{id}/logo': {
    post: {
      tags: ['Academias'],
      summary: 'Subir logo',
      description: 'Upload multipart/form-data (campo `file`). guardAcademyAdmin. PNG/SVG ≤2MB, dims ≤1024×1024, SVG sanitizado. Persiste data-URL en logoUrl. Audita UPDATE.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      requestBody: {
        required: true,
        content: { 'multipart/form-data': { schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } } },
      },
      responses: {
        '200': { description: 'Logo actualizado', content: { 'application/json': { schema: { type: 'object', properties: { academy: { $ref: '#/components/schemas/AcademyDto' } } } } } },
        '400': { description: 'MIME/tamaño/dims inválidos o campo file faltante' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Rol insuficiente' },
        '404': { description: 'No encontrada' },
      },
    },
  },
  '/api/academies/{id}/members/invite': {
    post: {
      tags: ['Academias'],
      summary: 'Invitar miembro por email',
      description: 'guardAcademyAdmin. Crea usuario TEMPORARY con password generado si no existe, o reutiliza el existente; crea membresía COACH pending; dispara triggerAcademyInvite (inbox). 409 ya miembro. Rate limit por IP (10/min, key compartida con accept). Audita CREATE.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/MemberInviteInput' } } } },
      responses: {
        '201': { description: 'Invitación creada', content: { 'application/json': { schema: { type: 'object', properties: { membership: { $ref: '#/components/schemas/MemberDto' } } } } } },
        '400': { description: 'Email inválido' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Rol insuficiente' },
        '404': { description: 'Academia no encontrada' },
        '409': { description: 'Ya es miembro' },
        '429': { description: 'Rate limit excedido (10/min por IP)' },
      },
    },
  },
  '/api/academies/{id}/members/{userId}/accept': {
    post: {
      tags: ['Academias'],
      summary: 'Aceptar invitación',
      description: 'guardUser, solo self (userId=sesión). Marca la membresía active (idempotente). 404 si no existe o fue removida. Rate limit por IP (10/min, key compartida con invite). Audita UPDATE.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Membresía activa', content: { 'application/json': { schema: { type: 'object', properties: { membership: { $ref: '#/components/schemas/MemberDto' } } } } } },
        '400': { description: 'id inválido' },
        '401': { description: 'No autenticado' },
        '403': { description: 'No es self' },
        '404': { description: 'Invitación no encontrada' },
        '429': { description: 'Rate limit excedido (10/min por IP)' },
      },
    },
  },
  '/api/academies/{id}/members': {
    get: {
      tags: ['Academias'],
      summary: 'Listar miembros',
      description: 'Lista miembros con info de usuario. guardAcademyCoach (OWNER/ADMIN/COACH). 404 anti-IDOR.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'Lista de miembros', content: { 'application/json': { schema: { type: 'object', properties: { members: { type: 'array', items: { $ref: '#/components/schemas/MemberDto' } } } } } } },
        '400': { description: 'id inválido' },
        '401': { description: 'No autenticado' },
        '403': { description: 'No autorizado' },
        '404': { description: 'No encontrada' },
      },
    },
  },
  '/api/academies/{id}/members/{userId}': {
    delete: {
      tags: ['Academias'],
      summary: 'Remover miembro',
      description: 'Soft remove (status=removed). guardAcademyAdmin (OWNER/ADMIN). 400 si se intenta remover al último OWNER activo. Audita DELETE.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Miembro removido', content: { 'application/json': { schema: { type: 'object', properties: { membership: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, status: { type: 'string', enum: ['removed'] } } } } } } } },
        '400': { description: 'Último OWNER' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Rol insuficiente' },
        '404': { description: 'Miembro no encontrado' },
      },
    },
  },
  '/api/academies/{id}/rubrics': {
    get: {
      tags: ['Academias'],
      summary: 'Listar rúbricas institucionales',
      description: 'Solo scope=institutional de esa academia. guardAcademyCoach.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'Lista de rúbricas', content: { 'application/json': { schema: { type: 'object', properties: { rubrics: { type: 'array', items: { $ref: '#/components/schemas/AcademyRubricListItem' } } } } } } },
        '400': { description: 'id inválido' },
        '401': { description: 'No autenticado' },
        '403': { description: 'No autorizado' },
        '404': { description: 'No encontrada' },
      },
    },
    post: {
      tags: ['Academias'],
      summary: 'Crear rúbrica institucional',
      description: 'guardAcademyAdmin. El handler fuerza scope=institutional y academyId=ruta. Audita CREATE.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AcademyRubricInput' } } } },
      responses: {
        '201': { description: 'Rúbrica creada', content: { 'application/json': { schema: { type: 'object', properties: { rubric: { type: 'object' } } } } } },
        '400': { description: 'Datos inválidos' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Rol insuficiente (COACH)' },
        '404': { description: 'No encontrada' },
      },
    },
  },
  '/api/evaluations/{id}/pdf': {
    get: {
      tags: ['Academias'],
      summary: 'Exportar PDF de evaluación',
      description: 'PDF con branding de academia (logo, color, radar 6 dims, firma). guardUser + ACTIVE; teacher o student de la evaluación (404 si ajeno). 400 si draft. Sin auditoría (lectura).',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'PDF (application/pdf, Content-Disposition attachment)' },
        '400': { description: 'Evaluación draft' },
        '401': { description: 'No autenticado' },
        '403': { description: 'No autorizado' },
        '404': { description: 'Evaluación no encontrada o ajena' },
      },
    },
  },
} as const