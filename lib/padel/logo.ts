/**
 * Validación y sanitización de logo de academia (SPEC-EPIC-01, D2 data-URL).
 * Reglas: MIME image/png | image/svg+xml, ≤2MB, dimensiones ≤1024×1024,
 * SVG sanitizado (DOMPurify en browser; fallback conservador en Node serverless).
 * NOTA: archivo "puro" — no importa db/pg. Usa APIs disponibles en browser y Node 20+.
 */
import DOMPurify from "dompurify";

export const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB
export const MAX_LOGO_DIMENSION = 1024;
export const ALLOWED_LOGO_MIME = ["image/png", "image/svg+xml"] as const;
export type AllowedLogoMime = (typeof ALLOWED_LOGO_MIME)[number];

/** Firma PNG: 8 bytes \x89PNG\r\n\x1a\n. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type LogoValidationResult = { valid: boolean; error?: string; dataUrl?: string };

/**
 * Valida un upload de logo y devuelve la data-URL lista para persistir en
 * academies.logoUrl. PNG: verifica firma real + dims IHDR. SVG: sanitiza.
 */
export async function validateLogoUpload(file: File): Promise<LogoValidationResult> {
  if (!ALLOWED_LOGO_MIME.includes(file.type as AllowedLogoMime)) {
    return { valid: false, error: "Formato no permitido. Usa PNG o SVG." };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { valid: false, error: "El logo no puede superar 2MB." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  if (file.type === "image/png") {
    if (!hasPngSignature(bytes)) {
      return { valid: false, error: "El archivo no es un PNG válido." };
    }
    const dims = readPngDimensions(bytes);
    if (!dims) {
      return { valid: false, error: "El PNG no tiene dimensiones válidas." };
    }
    if (dims.width > MAX_LOGO_DIMENSION || dims.height > MAX_LOGO_DIMENSION) {
      return { valid: false, error: `El logo no puede superar ${MAX_LOGO_DIMENSION}×${MAX_LOGO_DIMENSION}px.` };
    }
    return { valid: true, dataUrl: `data:image/png;base64,${bytesToBase64(bytes)}` };
  }

  // image/svg+xml
  const svg = new TextDecoder().decode(bytes);
  const dims = readSvgDimensions(svg);
  if (dims && (dims.width > MAX_LOGO_DIMENSION || dims.height > MAX_LOGO_DIMENSION)) {
    return { valid: false, error: `El logo no puede superar ${MAX_LOGO_DIMENSION}×${MAX_LOGO_DIMENSION}px.` };
  }
  const sanitized = sanitizeSvg(svg);
  const sanitizedBytes = new TextEncoder().encode(sanitized);
  return { valid: true, dataUrl: `data:image/svg+xml;base64,${bytesToBase64(sanitizedBytes)}` };
}

/**
 * Sanitiza un SVG. DOMPurify requiere DOM: en browser sanitiza completo; en Node
 * serverless (sin jsdom) DOMPurify es no-op (isSupported=false), así que aplica
 * un fallback conservador por allowlist que elimina scripts, event handlers,
 * foreignObject, estilos, referencias externas y tags animados.
 */
export function sanitizeSvg(svgString: string): string {
  if (DOMPurify.isSupported) {
    return DOMPurify.sanitize(svgString, { USE_PROFILES: { svg: true, svgFilters: true } });
  }
  return sanitizeSvgFallback(svgString);
}

/** Tags peligrosos con contenido que se eliminan completos (open+close). */
const SVG_DANGEROUS_CONTAINER_TAGS = "script|foreignObject|style|iframe|object|embed";
/** Tags peligrosos auto-cerrados o sin contenido. */
const SVG_DANGEROUS_TAGS = "script|foreignObject|style|iframe|object|embed|link|meta|base|form|input|button|textarea|select|option|animate|animateTransform|animateMotion|set|use";

function sanitizeSvgFallback(svg: string): string {
  let out = svg;
  // Prolog XML y doctype (pueden declarar entidades externas).
  out = out.replace(/<\?xml[^>]*\?>/gi, "").replace(/<!DOCTYPE[^>]*>/gi, "");
  // Elementos con contenido: eliminar open+close completos.
  out = out.replace(new RegExp(`<\\s*(${SVG_DANGEROUS_CONTAINER_TAGS})\\b[^>]*>[\\s\\S]*?<\\s*/\\s*\\1\\s*>`, "gi"), "");
  // Elementos restantes (self-closing o sin cierre).
  out = out.replace(new RegExp(`<\\s*(?:${SVG_DANGEROUS_TAGS})\\b[^>]*/?>`, "gi"), "");
  // Event handlers (onload, onclick, onerror, ...).
  out = out.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // Referencias externas: href, xlink:href, src (un logo no necesita links).
  out = out.replace(/\s+(?:xlink:)?href\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  out = out.replace(/\s+src\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  return out.trim();
}

function hasPngSignature(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

/** Lee width/height del chunk IHDR (bytes 16-23, big-endian). */
function readPngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
  const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

/** Lee width/height de atributos o viewBox del SVG (si no están, null). */
function readSvgDimensions(svg: string): { width: number; height: number } | null {
  const widthMatch = svg.match(/\bwidth\s*=\s*["'](\d+(?:\.\d+)?)["']/i);
  const heightMatch = svg.match(/\bheight\s*=\s*["'](\d+(?:\.\d+)?)["']/i);
  if (widthMatch && heightMatch) {
    return { width: parseFloat(widthMatch[1]), height: parseFloat(heightMatch[1]) };
  }
  const viewBoxMatch = svg.match(/\bviewBox\s*=\s*["']\s*[\d.-]+\s+[\d.-]+\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*["']/i);
  if (viewBoxMatch) {
    return { width: parseFloat(viewBoxMatch[1]), height: parseFloat(viewBoxMatch[2]) };
  }
  return null;
}

/** Base64 en chunks (evita stack overflow con arrays grandes en btoa). */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}