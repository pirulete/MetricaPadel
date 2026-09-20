import { NextRequest, NextResponse } from "next/server";

// Configuración del rate limit
// En modo test: límites muy altos y ventanas cortas para no interferir con tests
// En producción/desarrollo: límites normales
const isTestEnv = process.env.NODE_ENV === 'test';

export const RATE_LIMIT_CONFIG = {
  // Máximo de registros por IP por hora
  maxRegistrationsPerHour: isTestEnv ? 10000 : 100,
  // Máximo de registros por email domain por hora
  maxRegistrationsPerDomainPerHour: isTestEnv ? 10000 : 100,
  // Ventana de tiempo en milisegundos
  windowMs: isTestEnv ? 60 * 1000 : 60 * 60 * 1000,
  // Tiempo de bloqueo después de exceder límite
  blockDurationMs: isTestEnv ? 1000 : 15 * 60 * 1000,
};

// Almacenamiento en memoria para desarrollo
// En producción usar Redis
interface RateLimitEntry {
  count: number;
  resetTime: number;
  blockedUntil?: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Registra un intento de registro y verifica límites
 */
function checkRateLimit(key: string, maxAttempts: number): {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  blockedUntil?: number;
} {
  const now = Date.now();
  const windowMs = RATE_LIMIT_CONFIG.windowMs;
  const resetTime = now + windowMs;

  let entry = rateLimitStore.get(key);

  // Si no existe entrada o expiró la ventana
  if (!entry || now > entry.resetTime) {
    entry = { count: 1, resetTime };
    rateLimitStore.set(key, entry);
    return { allowed: true, remaining: maxAttempts - 1, resetTime };
  }

  // Si está bloqueado
  if (entry.blockedUntil && now < entry.blockedUntil) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
      blockedUntil: entry.blockedUntil
    };
  }

  // Incrementar contador
  entry.count++;

  // Si excede el límite, bloquear
  if (entry.count > maxAttempts) {
    entry.blockedUntil = now + RATE_LIMIT_CONFIG.blockDurationMs;
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
      blockedUntil: entry.blockedUntil
    };
  }

  return {
    allowed: true,
    remaining: maxAttempts - entry.count,
    resetTime: entry.resetTime
  };
}

/**
 * Extrae el dominio de un email
 */
function getEmailDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() || '';
}

/**
 * Middleware de rate limit para registro
 */
export function checkRegistrationRateLimit(request: NextRequest, email: string) {
  const ip = request.headers.get('x-forwarded-for') ||
             request.headers.get('x-real-ip') ||
             'unknown';

  const emailDomain = getEmailDomain(email);

  // Verificar límite por IP
  const ipKey = `ip:${ip}`;
  const ipLimit = checkRateLimit(ipKey, RATE_LIMIT_CONFIG.maxRegistrationsPerHour);

  if (!ipLimit.allowed) {
    return {
      allowed: false,
      error: 'Demasiados intentos de registro desde esta dirección IP. Intente nuevamente más tarde.',
      retryAfter: Math.ceil((ipLimit.blockedUntil! - Date.now()) / 1000),
      limit: RATE_LIMIT_CONFIG.maxRegistrationsPerHour,
      remaining: 0,
      resetTime: ipLimit.resetTime
    };
  }

  // Verificar límite por dominio de email
  const domainKey = `domain:${emailDomain}`;
  const domainLimit = checkRateLimit(domainKey, RATE_LIMIT_CONFIG.maxRegistrationsPerDomainPerHour);

  if (!domainLimit.allowed) {
    return {
      allowed: false,
      error: 'Demasiados registros desde este dominio de email. Intente nuevamente más tarde.',
      retryAfter: Math.ceil((domainLimit.blockedUntil! - Date.now()) / 1000),
      limit: RATE_LIMIT_CONFIG.maxRegistrationsPerDomainPerHour,
      remaining: 0,
      resetTime: domainLimit.resetTime
    };
  }

  return {
    allowed: true,
    limit: RATE_LIMIT_CONFIG.maxRegistrationsPerHour,
    remaining: Math.min(ipLimit.remaining, domainLimit.remaining),
    resetTime: Math.min(ipLimit.resetTime, domainLimit.resetTime)
  };
}

/**
 * Rate limit para endpoints de autenticación (login, forgot-password, etc.)
 * Delega en checkRateLimit() existente para evitar duplicar la máquina de estados.
 */
const AUTH_LIMITS = {
  signin: 10,
  "forgot-password": 5,
  "reset-password": 5,
  "resend-code": 3,
  "verify-email": 10,
  "verify-reset-code": 10,
} as const;

export type AuthEndpoint = keyof typeof AUTH_LIMITS;

export function checkAuthRateLimit(request: NextRequest, endpoint: AuthEndpoint) {
  const ip = request.headers.get('x-forwarded-for') ||
             request.headers.get('x-real-ip') ||
             'unknown';
  const key = `auth:${endpoint}:${ip}`;
  const max = AUTH_LIMITS[endpoint];
  const result = checkRateLimit(key, max);
  const retryAfter = result.blockedUntil ? Math.ceil((result.blockedUntil - Date.now()) / 1000) : 0;
  return { allowed: result.allowed, remaining: result.remaining, limit: max, retryAfter };
}

// ── Push Direct Rate Limiting ─────────────────────────────────
// Límite: 10 envíos directos por admin por minuto (ventana de 60s).
// Usa la misma máquina de estados que checkRateLimit().

const PUSH_DIRECT_MAX = isTestEnv ? 10000 : 10;
const PUSH_DIRECT_WINDOW_MS = 60_000; // 1 minuto

export function checkPushDirectRateLimit(userId: string): {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
} {
  const key = `push-direct:${userId}`;
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  if (!entry || now > entry.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + PUSH_DIRECT_WINDOW_MS });
    return { allowed: true, remaining: PUSH_DIRECT_MAX - 1, retryAfter: 0 };
  }
  if (entry.blockedUntil && now < entry.blockedUntil) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((entry.blockedUntil - now) / 1000) };
  }
  entry.count++;
  if (entry.count > PUSH_DIRECT_MAX) {
    entry.blockedUntil = now + RATE_LIMIT_CONFIG.blockDurationMs;
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((entry.blockedUntil - now) / 1000) };
  }
  return { allowed: true, remaining: PUSH_DIRECT_MAX - entry.count, retryAfter: 0 };
}

// Alias para compatibilidad — el route handler importa este nombre
export const checkDirectPushRateLimit = checkPushDirectRateLimit;

/**
 * Headers de rate limit para respuesta
 */
export function getRateLimitHeaders(result: any) {
  const headers = new Headers();

  if (result.allowed) {
    headers.set('X-RateLimit-Limit', result.limit.toString());
    headers.set('X-RateLimit-Remaining', result.remaining.toString());
    headers.set('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000).toString());
  } else {
    headers.set('X-RateLimit-Limit', result.limit.toString());
    headers.set('X-RateLimit-Remaining', '0');
    headers.set('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000).toString());
    if (result.retryAfter) {
      headers.set('Retry-After', result.retryAfter.toString());
    }
  }

  return headers;
}

// ── Public Endpoint Rate Limiting ──────────────────────────────
// NOTA: Usa un Map en memoria (per-instancia en serverless).
// Con ~1-2 instancias Vercel, el límite efectivo es ~2× el configurado.
// Para crecimiento futuro: migrar a Vercel KV (@upstash/ratelimit).

const PUBLIC_RATE_LIMIT_MAX = 100;
const PUBLIC_RATE_LIMIT_WINDOW_MS = 60_000;
const publicRequestCounts = new Map<string, { count: number; resetTime: number }>();

export function checkPublicRateLimit(ip: string): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const entry = publicRequestCounts.get(ip);
  if (!entry || now > entry.resetTime) {
    publicRequestCounts.set(ip, { count: 1, resetTime: now + PUBLIC_RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: PUBLIC_RATE_LIMIT_MAX - 1, resetTime: now + PUBLIC_RATE_LIMIT_WINDOW_MS };
  }
  if (entry.count >= PUBLIC_RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetTime: entry.resetTime };
  }
  entry.count++;
  return { allowed: true, remaining: PUBLIC_RATE_LIMIT_MAX - entry.count, resetTime: entry.resetTime };
}

function publicRateLimitHeaders(remaining: number, resetTime: number) {
  return {
    "X-RateLimit-Limit": String(PUBLIC_RATE_LIMIT_MAX),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.ceil(resetTime / 1000)),
  };
}

export function rateLimitedResponse(resetTime: number) {
  return NextResponse.json(
    { error: "Demasiadas solicitudes. Intente nuevamente más tarde." },
    { status: 429, headers: { "Cache-Control": "no-store", ...publicRateLimitHeaders(0, resetTime) } }
  );
}

export function extractIP(req: { headers: { get: (name: string) => string | null } }): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "unknown";
}

export function rateLimitSuccessHeaders(remaining: number, resetTime: number) {
  return { ...publicRateLimitHeaders(remaining, resetTime) };
}