import {
  academyCreateSchema,
  academyUpdateSchema,
  memberInviteSchema,
  academyRubricCreateSchema,
} from "@/lib/validations/academy";

describe("academyCreateSchema", () => {
  it("acepta un payload válido con color opcional", () => {
    const result = academyCreateSchema.safeParse({
      name: "Academia Río Padel",
      slug: "rio-padel",
      primaryColor: "#16a34a",
    });
    expect(result.success).toBe(true);
  });

  it("acepta sin primaryColor (default del handler)", () => {
    const result = academyCreateSchema.safeParse({ name: "Club 21", slug: "club-21" });
    expect(result.success).toBe(true);
  });

  it("normaliza slug a minúsculas (mayúsculas aceptadas, se transforman)", () => {
    const result = academyCreateSchema.safeParse({ name: "X", slug: "RIO-PADEL" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.slug).toBe("rio-padel");
  });

  it("rechaza slug con caracteres inválidos o longitud fuera de rango", () => {
    expect(academyCreateSchema.safeParse({ name: "A", slug: "Río-Padel" }).success).toBe(false);
    expect(academyCreateSchema.safeParse({ name: "A", slug: "rio_padel" }).success).toBe(false);
    expect(academyCreateSchema.safeParse({ name: "A", slug: "ab" }).success).toBe(false);
    expect(academyCreateSchema.safeParse({ name: "A", slug: "a".repeat(51) }).success).toBe(false);
  });

  it("rechaza name vacío o >200 chars", () => {
    expect(academyCreateSchema.safeParse({ name: "  ", slug: "rio" }).success).toBe(false);
    expect(academyCreateSchema.safeParse({ name: "a".repeat(201), slug: "rio" }).success).toBe(false);
  });

  it("rechaza primaryColor que no sea HEX #RRGGBB", () => {
    expect(academyCreateSchema.safeParse({ name: "A", slug: "rio", primaryColor: "red" }).success).toBe(false);
    expect(academyCreateSchema.safeParse({ name: "A", slug: "rio", primaryColor: "#12345" }).success).toBe(false);
    expect(academyCreateSchema.safeParse({ name: "A", slug: "rio", primaryColor: "#GGGGGG" }).success).toBe(false);
  });
});

describe("academyUpdateSchema", () => {
  it("acepta un solo campo", () => {
    expect(academyUpdateSchema.safeParse({ name: "Nuevo nombre" }).success).toBe(true);
    expect(academyUpdateSchema.safeParse({ primaryColor: "#0ea5e9" }).success).toBe(true);
    expect(academyUpdateSchema.safeParse({ slug: "nuevo-slug" }).success).toBe(true);
  });

  it("rechaza body vacío", () => {
    expect(academyUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("rechaza color inválido", () => {
    expect(academyUpdateSchema.safeParse({ primaryColor: "blue" }).success).toBe(false);
  });
});

describe("memberInviteSchema", () => {
  it("acepta email válido", () => {
    const result = memberInviteSchema.safeParse({ email: "profe@academia.com" });
    expect(result.success).toBe(true);
  });

  it("rechaza email inválido o vacío", () => {
    expect(memberInviteSchema.safeParse({ email: "no-es-email" }).success).toBe(false);
    expect(memberInviteSchema.safeParse({ email: "" }).success).toBe(false);
  });
});

describe("academyRubricCreateSchema (reutiliza rubricCreateSchema)", () => {
  it("acepta una rúbrica válida con 4 descriptores por criterio", () => {
    const result = academyRubricCreateSchema.safeParse({
      title: "Rúbrica institucional",
      category: "tecnica_basica",
      criteria: [
        {
          name: "Bandeja",
          descriptors: ["Excelente", "Bueno", "Aceptable", "En desarrollo"],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rechaza criterios sin exactamente 4 descriptores", () => {
    const result = academyRubricCreateSchema.safeParse({
      title: "Rúbrica",
      category: "tactica",
      criteria: [{ name: "Posición", descriptors: ["A", "B"] }],
    });
    expect(result.success).toBe(false);
  });
});