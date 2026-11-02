import {
  canAssignAcademyRole,
  validateRequestPayload,
  buildRequestAuditPayload,
} from "@/lib/padel/academy-requests";

describe("canAssignAcademyRole", () => {
  it("SUPER_ADMIN puede asignar cualquier rol (incluido OWNER)", () => {
    expect(canAssignAcademyRole("SUPER_ADMIN", "OWNER")).toBe(true);
    expect(canAssignAcademyRole("SUPER_ADMIN", "ADMIN")).toBe(true);
    expect(canAssignAcademyRole("SUPER_ADMIN", "COACH")).toBe(true);
  });

  it("OWNER de academia solo asigna ADMIN/COACH (nunca OWNER)", () => {
    expect(canAssignAcademyRole("OWNER", "ADMIN")).toBe(true);
    expect(canAssignAcademyRole("OWNER", "COACH")).toBe(true);
    expect(canAssignAcademyRole("OWNER", "OWNER")).toBe(false);
  });

  it("ADMIN de academia solo asigna ADMIN/COACH (nunca OWNER)", () => {
    expect(canAssignAcademyRole("ADMIN", "ADMIN")).toBe(true);
    expect(canAssignAcademyRole("ADMIN", "COACH")).toBe(true);
    expect(canAssignAcademyRole("ADMIN", "OWNER")).toBe(false);
  });

  it("COACH nunca asigna roles", () => {
    expect(canAssignAcademyRole("COACH", "ADMIN")).toBe(false);
    expect(canAssignAcademyRole("COACH", "COACH")).toBe(false);
    expect(canAssignAcademyRole("COACH", "OWNER")).toBe(false);
  });
});

describe("validateRequestPayload", () => {
  it("join_academy no admite payload", () => {
    expect(validateRequestPayload("join_academy", {})).toBeNull();
    expect(validateRequestPayload("join_academy", { name: "X" })).toBe("join_academy no admite payload");
  });

  it("create_academy requiere name y slug válido", () => {
    expect(validateRequestPayload("create_academy", { name: "Academia", slug: "academia-1" })).toBeNull();
    expect(validateRequestPayload("create_academy", { name: "", slug: "academia-1" })).toBe("name es requerido");
    expect(validateRequestPayload("create_academy", { name: "X", slug: "MAYÚSCULAS" })).toBe(
      "slug debe tener formato a-z0-9- (3-50 caracteres)"
    );
    expect(validateRequestPayload("create_academy", { name: "X", slug: "ab" })).toBe(
      "slug debe tener formato a-z0-9- (3-50 caracteres)"
    );
  });

  it("create_academy valida primaryColor HEX opcional", () => {
    expect(validateRequestPayload("create_academy", { name: "X", slug: "academia-x", primaryColor: "#16a34a" })).toBeNull();
    expect(validateRequestPayload("create_academy", { name: "X", slug: "academia-x", primaryColor: "red" })).toBe(
      "primaryColor debe ser HEX #RRGGBB"
    );
  });
});

describe("buildRequestAuditPayload", () => {
  it("join_academy → payload vacío", () => {
    expect(buildRequestAuditPayload("join_academy", {})).toEqual({});
  });

  it("create_academy → name/slug + primaryColor solo si viene", () => {
    expect(buildRequestAuditPayload("create_academy", { name: "A", slug: "a" })).toEqual({ name: "A", slug: "a" });
    expect(buildRequestAuditPayload("create_academy", { name: "A", slug: "a", primaryColor: "#fff000" })).toEqual({
      name: "A",
      slug: "a",
      primaryColor: "#fff000",
    });
  });
});