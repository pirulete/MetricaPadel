/**
 * Unit tests de lógica pura de Super Admin (lib/padel/super-admin.ts).
 * Cubre el invariante de plataforma: nunca demotar al último SUPER_ADMIN activo (D5).
 * @jest-environment node
 */
import { assertNotLastSuperAdmin } from "@/lib/padel/super-admin";

describe("assertNotLastSuperAdmin", () => {
  it("bloquea cuando count = 1 (último SUPER_ADMIN activo)", () => {
    expect(assertNotLastSuperAdmin(1)).toBe("No puedes demotar al último SUPER_ADMIN activo");
  });

  it("bloquea cuando count = 0 (invariante roto — defensa en profundidad)", () => {
    expect(assertNotLastSuperAdmin(0)).toBe("No puedes demotar al último SUPER_ADMIN activo");
  });

  it("permite cuando count > 1", () => {
    expect(assertNotLastSuperAdmin(2)).toBeNull();
    expect(assertNotLastSuperAdmin(5)).toBeNull();
  });
});