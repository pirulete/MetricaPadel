import bcrypt from "bcryptjs";

/**
 * Valida que un hash sea bcrypt ($2a/$2b/$2y, 60 chars) antes de llamar a compare().
 *
 * bcrypt.compare() LANZA con hashes corruptos/truncados (fix CredentialsSignin F3):
 * este guard permite distinguir "contraseña incorrecta" (login normal) de
 * "hash inválido en DB" (dato corrupto que requiere intervención admin).
 */
export function isBcryptHash(hash: string | null | undefined): boolean {
  return (
    typeof hash === "string" &&
    hash.length === 60 &&
    /^\$2[aby]\$/.test(hash)
  );
}

/**
 * Wrapper de bcrypt.compare que loggea errores en vez de tragar silenciosamente
 * (fix CredentialsSignin F4). Nunca lanza: ante error, retorna false para que
 * el login falle con null (CredentialsSignin) pero quede rastro en logs.
 *
 * La contraseña NUNCA se loggea — solo el error del motor bcrypt.
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    console.error("[auth] Error comparando hash bcrypt:", error);
    return false;
  }
}