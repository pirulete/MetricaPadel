/**
 * Unit tests de changePasswordSchema (G5) en lib/auth/schemas.ts.
 * Cubre: validación de campos, refine "nueva != actual", y tipos.
 * @jest-environment node
 */
import { changePasswordSchema } from "@/lib/auth/schemas";

describe("changePasswordSchema", () => {
  it("acepta contraseñas válidas y distintas", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "CurrentPass123!",
      newPassword: "NewPass456!",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza currentPassword vacío", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "",
      newPassword: "NewPass456!",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza newPassword menor a 8 caracteres", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "CurrentPass123!",
      newPassword: "short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("newPassword");
    }
  });

  it("rechaza cuando la nueva contraseña es igual a la actual (refine)", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "SamePass123!",
      newPassword: "SamePass123!",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("La nueva contraseña debe ser diferente");
    }
  });

  it("rechaza si falta un campo", () => {
    const result = changePasswordSchema.safeParse({ currentPassword: "CurrentPass123!" });
    expect(result.success).toBe(false);
  });
});