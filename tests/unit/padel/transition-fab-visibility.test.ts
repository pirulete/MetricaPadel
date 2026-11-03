/**
 * Unit tests de la visibilidad del FAB de transiciones (lib/constants/navigation.ts).
 * @jest-environment node
 */
import { canShowTransitionFab } from "@/lib/constants/navigation";

describe("canShowTransitionFab", () => {
  const WORK_ROUTES = [
    "/dashboard",
    "/cursos",
    "/cursos/2c1f7a44-0000-4000-8000-000000000000",
    "/evaluar",
    "/historial",
    "/academias",
    "/academias/2c1f7a44-0000-4000-8000-000000000000",
  ];

  it.each(WORK_ROUTES)("ADMIN ve el FAB en %s", (pathname) => {
    expect(canShowTransitionFab("ADMIN", pathname)).toBe(true);
  });

  const HIDDEN_ROUTES = [
    "/transiciones",
    "/transiciones/nueva",
    "/transiciones/2c1f7a44-0000-4000-8000-000000000000",
    "/settings",
    "/admin",
    "/admin/platform/academias",
  ];

  it.each(HIDDEN_ROUTES)("ADMIN no ve el FAB en %s", (pathname) => {
    expect(canShowTransitionFab("ADMIN", pathname)).toBe(false);
  });

  it("USER no ve el FAB ni siquiera en rutas de trabajo", () => {
    expect(canShowTransitionFab("USER", "/dashboard")).toBe(false);
  });

  it("SUPER_ADMIN se comporta como ADMIN", () => {
    expect(canShowTransitionFab("SUPER_ADMIN", "/dashboard")).toBe(true);
    expect(canShowTransitionFab("SUPER_ADMIN", "/admin/platform/academias")).toBe(false);
  });

  it("no matchea prefijos parciales de ruta", () => {
    expect(canShowTransitionFab("ADMIN", "/transiciones-internas")).toBe(true);
    expect(canShowTransitionFab("ADMIN", "/settings-personal")).toBe(true);
  });
});
