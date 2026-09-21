/**
 * Lógica pura de códigos de invitación de cursos (Etapa 2).
 * Formato: PAD-XXXX (4 chars alfanuméricos), almacenado en mayúsculas (D4).
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin I/O/0/1 (legibilidad)
const CODE_LENGTH = 4;
const PREFIX = "PAD";

/** Genera un código aleatorio PAD-XXXX en mayúsculas. */
export function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `${PREFIX}-${code}`;
}