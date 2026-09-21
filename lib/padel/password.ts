/**
 * Lógica pura de generación de contraseñas (G4).
 * Charset sin caracteres ambiguos (I/l/0/O/1) + mezcla de clases (mayúscula,
 * minúscula, dígito, símbolo) para cumplir la política de password del schema.
 */
import { randomBytes } from "crypto";

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%^&*";
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;
const LENGTH = 12;

function pick(charset: string): string {
  const bytes = randomBytes(1);
  return charset[bytes[0] % charset.length];
}

/** Genera una contraseña aleatoria de 12 chars con al menos una de cada clase. */
export function generateRandomPassword(): string {
  const chars = [
    pick(UPPER),
    pick(LOWER),
    pick(DIGITS),
    pick(SYMBOLS),
  ];
  for (let i = chars.length; i < LENGTH; i++) {
    chars.push(pick(ALL));
  }
  // Shuffle Fisher-Yates con randomBytes para no sesgar el orden.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}