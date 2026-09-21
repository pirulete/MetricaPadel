import { publicMarketingPaths } from './paths/public-marketing'
import { adminMarketingPaths, adminMarketingTags } from './paths/admin-marketing'
import { marketingSchemas } from './schemas/marketing'
import {
  adminNotificationsTags,
  notificationsPaths,
  notificationsTags,
} from './paths/notifications'
import { notificationsSchemas } from './schemas/notifications'
import { padelAdminTags, padelPaths, padelStudentTags } from './paths/padel'
import { padelSchemas } from './schemas/padel'
import { coursesPaths, padelCoursesTags, padelDashboardTags } from './paths/courses'
import { coursesSchemas } from './schemas/courses'
import { evolutionPaths, padelEvolutionTags } from './paths/evolution'

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'Padel Evaluation API',
    description: 'API del sistema. Incluye autenticación, perfiles y administración.\n\nLa documentación refleja los endpoints disponibles en producción. Los schemas son representativos de la estructura de datos.',
    version: '0.1.0',
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Desarrollo' },
  ],
  security: [{ bearerAuth: [] }],
  tags: [
    { name: 'Auth', description: 'Registro, inicio de sesión, verificación de email y recuperación de contraseña' },
    { name: 'User', description: 'Endpoints del usuario autenticado: perfil' },
    { name: 'Public', description: 'Endpoints públicos sin autenticación' },
    { name: 'Admin', description: 'Panel administrativo: gestión de usuarios' },
    { name: 'Marketing Public', description: 'Endpoints públicos del Marketing CMS (lectura cacheada + contact con rate limit)' },
    { name: 'Health', description: 'Health check del sistema' },
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'Verifica que el servidor y la base de datos están operativos.',
        responses: {
          '200': {
            description: 'Servidor operativo',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' } } },
          },
          '500': { description: 'Error interno del servidor', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Registrar nuevo usuario',
        description: 'Crea un nuevo usuario en estado TEMPORARY. Requiere verificación de email posterior.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterInput' } } },
        },
        responses: {
          '201': { description: 'Usuario registrado exitosamente', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          '400': { description: 'Datos inválidos o email ya registrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '429': { description: 'Demasiadas solicitudes (rate limit)' },
        },
      },
    },
    '/api/auth/signin': {
      post: {
        tags: ['Auth'],
        summary: 'Iniciar sesión',
        description: 'Autentica al usuario con email y contraseña. Retorna un JWT en cookie HTTP-only.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/SignInInput' } } },
        },
        responses: {
          '200': { description: 'Inicio de sesión exitoso', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          '401': { description: 'Credenciales inválidas' },
          '429': { description: 'Demasiados intentos (rate limit)' },
        },
      },
    },
    '/api/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Cerrar sesión',
        description: 'Invalida la sesión activa. Solo borra la sesión actual (no todas las sesiones del usuario).',
        responses: {
          '200': { description: 'Sesión cerrada exitosamente' },
        },
      },
    },
    '/api/auth/verify-email': {
      post: {
        tags: ['Auth'],
        summary: 'Verificar email',
        description: 'Verifica el email usando un código OTP. Cambia el estado de TEMPORARY a ACTIVE.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/VerifyEmailInput' } } },
        },
        responses: {
          '200': { description: 'Email verificado exitosamente', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          '400': { description: 'Código inválido o expirado' },
          '429': { description: 'Demasiadas solicitudes (rate limit)' },
        },
      },
    },
    '/api/auth/resend-code': {
      post: {
        tags: ['Auth'],
        summary: 'Reenviar código de verificación',
        description: 'Reenvía un nuevo código de verificación al email del usuario. Reutiliza el código del día si existe.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/EmailOnlyInput' } } },
        },
        responses: {
          '200': { description: 'Código reenviado' },
          '404': { description: 'Usuario no encontrado' },
          '429': { description: 'Demasiadas solicitudes (rate limit)' },
        },
      },
    },
    '/api/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Restablecer contraseña',
        description: 'Actualiza la contraseña, revierte el usuario a TEMPORARY, borra sesiones activas y envía código de verificación.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ForgotPasswordInput' } } },
        },
        responses: {
          '200': { description: 'Contraseña actualizada' },
          '429': { description: 'Demasiadas solicitudes (rate limit)' },
        },
      },
    },
    '/api/auth/verify-reset-code': {
      post: {
        tags: ['Auth'],
        summary: 'Verificar código de reset',
        description: 'Valida el código de restablecimiento antes de permitir el cambio de contraseña.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/VerifyEmailInput' } } },
        },
        responses: {
          '200': { description: 'Código válido' },
          '400': { description: 'Código inválido o expirado' },
        },
      },
    },
    '/api/auth/refresh-session': {
      post: {
        tags: ['Auth'],
        summary: 'Refrescar sesión',
        description: 'Extiende la sesión activa (sliding session) y devuelve datos frescos del usuario.',
        responses: {
          '200': { description: 'Sesión refrescada', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          '401': { description: 'No hay sesión activa' },
        },
      },
    },
    '/api/user/profile': {
      get: {
        tags: ['User'],
        summary: 'Obtener perfil propio',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Perfil del usuario', content: { 'application/json': { schema: { $ref: '#/components/schemas/UserProfile' } } } },
          '401': { description: 'No autenticado' },
        },
      },
      put: {
        tags: ['User'],
        summary: 'Actualizar perfil propio',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateProfileInput' } } },
        },
        responses: {
          '200': { description: 'Perfil actualizado' },
          '401': { description: 'No autenticado' },
        },
      },
    },
    '/api/user/password': {
      put: {
        tags: ['User'],
        summary: 'Cambiar contraseña propia',
        description: 'Valida la contraseña actual contra el hash almacenado y actualiza a la nueva. Requiere usuario ACTIVE.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ChangePasswordInput' } } },
        },
        responses: {
          '200': { description: 'Contraseña actualizada' },
          '400': { description: 'Contraseña actual incorrecta o datos inválidos' },
          '401': { description: 'No autenticado' },
          '403': { description: 'No autorizado (LOCKED o no ACTIVE)' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT de Auth.js (cookie HTTP-only). Se envía automáticamente en requests autenticados.',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string', description: 'Mensaje de error descriptivo' },
          code: { type: 'string', description: 'Código de error opcional' },
        },
        required: ['error'],
      },
      HealthResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
          timestamp: { type: 'string', format: 'date-time' },
          uptime: { type: 'number' },
        },
      },
      RegisterInput: {
        type: 'object',
        required: ['firstName', 'lastName', 'email', 'password', 'confirmPassword'],
        properties: {
          firstName: { type: 'string', minLength: 1, maxLength: 100, description: 'Nombre del usuario' },
          lastName: { type: 'string', minLength: 1, maxLength: 100, description: 'Apellido del usuario' },
          email: { type: 'string', format: 'email', description: 'Email (se normaliza a minúsculas)' },
          password: { type: 'string', minLength: 8, description: 'Contraseña (mínimo 8 caracteres)' },
          confirmPassword: { type: 'string', description: 'Confirmación de contraseña' },
        },
      },
      SignInInput: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
      ForgotPasswordInput: {
        type: 'object',
        required: ['email', 'newPassword', 'confirmPassword'],
        properties: {
          email: { type: 'string', format: 'email' },
          newPassword: { type: 'string', minLength: 8 },
          confirmPassword: { type: 'string' },
        },
      },
      VerifyEmailInput: {
        type: 'object',
        required: ['email', 'code'],
        properties: {
          email: { type: 'string', format: 'email' },
          code: { type: 'string', description: 'Código de verificación de 6 dígitos' },
        },
      },
      EmailOnlyInput: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
        },
      },
      UpdateProfileInput: {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          phone: { type: 'string' },
        },
      },
      ChangePasswordInput: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string', minLength: 1, description: 'Contraseña actual' },
          newPassword: { type: 'string', minLength: 8, description: 'Nueva contraseña (mínimo 8 caracteres, distinta de la actual)' },
        },
      },
      AuthResponse: {
        type: 'object',
        properties: {
          user: { $ref: '#/components/schemas/UserProfile' },
          status: { type: 'string', enum: ['TEMPORARY', 'ACTIVE', 'LOCKED'], description: 'Estado del usuario post-login' },
        },
      },
      UserProfile: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['USER', 'ADMIN'] },
          status: { type: 'string', enum: ['TEMPORARY', 'ACTIVE', 'LOCKED'] },
          phone: { type: 'string', nullable: true },
        },
      },
    },
  },
} as const

// Composición por submódulos (Marketing CMS): paths + schemas se mantienen
// en lib/api-docs/{paths,schemas}/ para no acumular líneas en este archivo.
const apiSpec = {
  ...spec,
  tags: [...spec.tags, adminMarketingTags, notificationsTags, adminNotificationsTags, padelAdminTags, padelStudentTags, padelCoursesTags, padelDashboardTags, padelEvolutionTags],
  paths: { ...spec.paths, ...publicMarketingPaths, ...adminMarketingPaths, ...notificationsPaths, ...padelPaths, ...coursesPaths, ...evolutionPaths },
  components: {
    ...spec.components,
    schemas: { ...spec.components.schemas, ...marketingSchemas, ...notificationsSchemas, ...padelSchemas, ...coursesSchemas },
  },
}

export default apiSpec
