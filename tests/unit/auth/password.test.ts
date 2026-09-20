/**
 * Unit tests de lib/auth/password.ts (fix CredentialsSignin F3/F4).
 * Cubre: isBcryptHash ($2a/$2b/$2y válidos, inválidos, null/undefined) y
 * comparePassword (nunca lanza con hash corrupto, retorna false).
 * @jest-environment node
 */
import bcrypt from "bcryptjs";
import { isBcryptHash, comparePassword } from "@/lib/auth/password";

// Hash bcrypt real de "correct-password" generado con bcryptjs (cost 4, rápido).
let validHash: string;

beforeAll(async () => {
  validHash = await bcrypt.hash("correct-password", 4);
});

describe("isBcryptHash", () => {
  it("acepta un hash bcrypt $2a$ válido (60 chars)", () => {
    expect(isBcryptHash(validHash)).toBe(true);
    expect(validHash.startsWith("$2a$")).toBe(true);
    expect(validHash.length).toBe(60);
  });

  it("acepta un hash bcrypt $2b$ válido", () => {
    const hash = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
    expect(hash.length).toBe(60);
    expect(isBcryptHash(hash)).toBe(true);
  });

  it("acepta un hash bcrypt $2y$ válido", () => {
    const hash = "$2y$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
    expect(hash.length).toBe(60);
    expect(isBcryptHash(hash)).toBe(true);
  });

  it("rechaza un hash md5", () => {
    expect(isBcryptHash("5f4dcc3b5aa765d61d8327deb882cf99")).toBe(false);
  });

  it("rechaza texto plano", () => {
    expect(isBcryptHash("password123")).toBe(false);
  });

  it("rechaza hash vacío", () => {
    expect(isBcryptHash("")).toBe(false);
  });

  it("rechaza hash truncado (menos de 60 chars) aunque tenga prefix bcrypt", () => {
    expect(isBcryptHash("$2a$10$short")).toBe(false);
  });

  it("rechaza prefix no soportado ($2x$/$2z$)", () => {
    const hash = "$2x$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
    expect(hash.length).toBe(60);
    expect(isBcryptHash(hash)).toBe(false);
  });

  it("rechaza null y undefined", () => {
    expect(isBcryptHash(null)).toBe(false);
    expect(isBcryptHash(undefined)).toBe(false);
  });
});

describe("comparePassword", () => {
  it("retorna true con contraseña correcta", async () => {
    expect(await comparePassword("correct-password", validHash)).toBe(true);
  });

  it("retorna false con contraseña incorrecta", async () => {
    expect(await comparePassword("wrong-password", validHash)).toBe(false);
  });

  it("no lanza con hash corrupto y retorna false", async () => {
    await expect(comparePassword("password", "$2a$10$truncated")).resolves.toBe(false);
  });

  it("no lanza con hash no-bcrypt y retorna false", async () => {
    await expect(comparePassword("password", "not-a-bcrypt-hash")).resolves.toBe(false);
  });

  it("retorna false y loggea si bcrypt.compare lanza (rama catch)", async () => {
    const spy = jest.spyOn(bcrypt, "compare").mockImplementationOnce(async () => {
      throw new Error("boom");
    });
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(comparePassword("password", validHash)).resolves.toBe(false);
      expect(spy).toHaveBeenCalled();
      const logged = errSpy.mock.calls[0]?.[1] as unknown;
      expect(logged).toBeInstanceOf(Error);
    } finally {
      spy.mockRestore();
      errSpy.mockRestore();
    }
  });
});