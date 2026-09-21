/**
 * Unit tests de generación de contraseñas (lib/padel/password.ts, G4).
 * @jest-environment node
 */
import { generateRandomPassword } from "@/lib/padel/password";

describe("generateRandomPassword", () => {
  it("genera 12 caracteres", () => {
    expect(generateRandomPassword()).toHaveLength(12);
  });

  it("incluye al menos una mayúscula, minúscula, dígito y símbolo", () => {
    for (let i = 0; i < 20; i++) {
      const pwd = generateRandomPassword();
      expect(pwd).toMatch(/[A-Z]/);
      expect(pwd).toMatch(/[a-z]/);
      expect(pwd).toMatch(/[0-9]/);
      expect(pwd).toMatch(/[^A-Za-z0-9]/);
    }
  });

  it("no incluye caracteres ambiguos (I/l/0/O/1)", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateRandomPassword()).not.toMatch(/[Il0O1]/);
    }
  });

  it("genera valores distintos entre llamadas", () => {
    const a = generateRandomPassword();
    const b = generateRandomPassword();
    expect(a).not.toBe(b);
  });
});