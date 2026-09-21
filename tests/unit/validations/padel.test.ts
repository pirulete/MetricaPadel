/**
 * Unit tests de validaciones Zod del Core Evaluativo (lib/validations/padel.ts).
 * @jest-environment node
 */
import {
  adminCreateUserSchema,
  adminUserQuerySchema,
  rubricCreateSchema,
  rubricUpdateSchema,
  evaluationCreateSchema,
  evaluationSaveSchema,
  rubricListQuerySchema,
  evaluationListQuerySchema,
  padelIdParamsSchema,
  courseCreateSchema,
  courseUpdateSchema,
  courseJoinSchema,
  courseRubricAssignSchema,
  historyQuerySchema,
} from "@/lib/validations/padel";

describe("adminCreateUserSchema", () => {
  it("acepta payload válido", () => {
    const result = adminCreateUserSchema.parse({
      email: "alumno@test.local",
      firstName: "Ana",
      lastName: "García",
      password: "Secret123!",
    });
    expect(result.email).toBe("alumno@test.local");
  });

  it("rechaza email inválido", () => {
    expect(() =>
      adminCreateUserSchema.parse({
        email: "no-es-email",
        firstName: "Ana",
        lastName: "García",
        password: "Secret123!",
      })
    ).toThrow();
  });

  it("rechaza password menor a 8 caracteres", () => {
    expect(() =>
      adminCreateUserSchema.parse({
        email: "a@test.local",
        firstName: "Ana",
        lastName: "García",
        password: "short",
      })
    ).toThrow();
  });

  it("rechaza firstName vacío", () => {
    expect(() =>
      adminCreateUserSchema.parse({
        email: "a@test.local",
        firstName: "   ",
        lastName: "García",
        password: "Secret123!",
      })
    ).toThrow();
  });
});

describe("adminUserQuerySchema", () => {
  it("acepta sin search", () => {
    expect(adminUserQuerySchema.parse({})).toEqual({});
  });

  it("acepta search", () => {
    expect(adminUserQuerySchema.parse({ search: "ana" })).toEqual({ search: "ana" });
  });
});

describe("rubricCreateSchema", () => {
  const valid = {
    title: "Saque",
    category: "tecnica",
    criteria: [
      {
        name: "Precisión",
        descriptors: ["a", "b", "c", "d"],
      },
    ],
  };

  it("acepta rúbrica válida con 1 criterio y 4 descriptores", () => {
    const result = rubricCreateSchema.parse(valid);
    expect(result.criteria).toHaveLength(1);
    expect(result.criteria[0].descriptors).toHaveLength(4);
  });

  it("rechaza categoría inválida", () => {
    expect(() =>
      rubricCreateSchema.parse({ ...valid, category: "otra" })
    ).toThrow();
  });

  it("rechaza criterio sin 4 descriptores", () => {
    expect(() =>
      rubricCreateSchema.parse({
        ...valid,
        criteria: [{ name: "Precisión", descriptors: ["a", "b"] }],
      })
    ).toThrow();
  });

  it("rechaza array de criteria vacío", () => {
    expect(() => rubricCreateSchema.parse({ ...valid, criteria: [] })).toThrow();
  });

  it("rechaza descriptor vacío", () => {
    expect(() =>
      rubricCreateSchema.parse({
        ...valid,
        criteria: [{ name: "Precisión", descriptors: ["a", "", "c", "d"] }],
      })
    ).toThrow();
  });

  it("rechaza title vacío", () => {
    expect(() => rubricCreateSchema.parse({ ...valid, title: " " })).toThrow();
  });
});

describe("rubricUpdateSchema", () => {
  it("acepta partial (solo title)", () => {
    expect(rubricUpdateSchema.parse({ title: "Nuevo" })).toEqual({ title: "Nuevo" });
  });

  it("acepta criteria completo", () => {
    const result = rubricUpdateSchema.parse({
      criteria: [{ name: "X", descriptors: ["1", "2", "3", "4"] }],
    });
    expect(result.criteria).toHaveLength(1);
  });

  it("rechaza criteria con 3 descriptores", () => {
    expect(() =>
      rubricUpdateSchema.parse({
        criteria: [{ name: "X", descriptors: ["1", "2", "3"] }],
      })
    ).toThrow();
  });
});

describe("evaluationCreateSchema", () => {
  it("acepta studentId + rubricId uuid", () => {
    const result = evaluationCreateSchema.parse({
      studentId: "00000000-0000-0000-0000-000000000001",
      rubricId: "00000000-0000-0000-0000-000000000002",
    });
    expect(result.studentId).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("rechaza uuid inválido", () => {
    expect(() =>
      evaluationCreateSchema.parse({ studentId: "no-uuid", rubricId: "no-uuid" })
    ).toThrow();
  });
});

describe("evaluationSaveSchema", () => {
  const valid = {
    scores: [
      {
        criteriaId: "00000000-0000-0000-0000-000000000001",
        levelId: "00000000-0000-0000-0000-000000000002",
        comment: "Bien",
      },
    ],
    globalComment: "Gran avance",
  };

  it("acepta scores + globalComment", () => {
    const result = evaluationSaveSchema.parse(valid);
    expect(result.scores).toHaveLength(1);
    expect(result.globalComment).toBe("Gran avance");
  });

  it("acepta sin comment ni globalComment", () => {
    const result = evaluationSaveSchema.parse({
      scores: [
        {
          criteriaId: "00000000-0000-0000-0000-000000000001",
          levelId: "00000000-0000-0000-0000-000000000002",
        },
      ],
    });
    expect(result.scores[0].comment).toBeUndefined();
  });

  it("rechaza scores vacío", () => {
    expect(() => evaluationSaveSchema.parse({ scores: [] })).toThrow();
  });

  it("rechaza levelId inválido", () => {
    expect(() =>
      evaluationSaveSchema.parse({
        scores: [
          {
            criteriaId: "00000000-0000-0000-0000-000000000001",
            levelId: "no-uuid",
          },
        ],
      })
    ).toThrow();
  });
});

describe("list query schemas", () => {
  it("rubricListQuerySchema acepta status válido", () => {
    expect(rubricListQuerySchema.parse({ status: "archived" })).toEqual({
      status: "archived",
    });
  });

  it("rubricListQuerySchema rechaza status inválido", () => {
    expect(() => rubricListQuerySchema.parse({ status: "published" })).toThrow();
  });

  it("evaluationListQuerySchema acepta status publicado", () => {
    expect(evaluationListQuerySchema.parse({ status: "published" })).toEqual({
      status: "published",
    });
  });

  it("evaluationListQuerySchema rechaza status de rúbrica", () => {
    expect(() => evaluationListQuerySchema.parse({ status: "archived" })).toThrow();
  });
});

describe("padelIdParamsSchema", () => {
  it("acepta uuid", () => {
    expect(padelIdParamsSchema.parse({ id: "00000000-0000-0000-0000-000000000001" }).id).toBe(
      "00000000-0000-0000-0000-000000000001"
    );
  });

  it("rechaza id no uuid", () => {
    expect(() => padelIdParamsSchema.parse({ id: "abc" })).toThrow();
  });
});

describe("courseCreateSchema", () => {
  const valid = { name: "Pádel iniciación", level: "iniciacion" };

  it("acepta payload mínimo", () => {
    const result = courseCreateSchema.parse(valid);
    expect(result.name).toBe("Pádel iniciación");
    expect(result.level).toBe("iniciacion");
  });

  it("acepta schedule + days opcionales", () => {
    const result = courseCreateSchema.parse({
      ...valid,
      schedule: "18:00",
      days: ["Lun", "Mié"],
    });
    expect(result.days).toHaveLength(2);
  });

  it("acepta days vacío (D3)", () => {
    expect(courseCreateSchema.parse({ ...valid, days: [] }).days).toEqual([]);
  });

  it("rechaza name vacío", () => {
    expect(() => courseCreateSchema.parse({ ...valid, name: " " })).toThrow();
  });

  it("rechaza level inválido", () => {
    expect(() => courseCreateSchema.parse({ ...valid, level: "pro" })).toThrow();
  });

  it("rechaza más de 7 días", () => {
    expect(() =>
      courseCreateSchema.parse({ ...valid, days: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom", "Otro"] })
    ).toThrow();
  });
});

describe("courseUpdateSchema", () => {
  it("acepta partial (solo schedule)", () => {
    expect(courseUpdateSchema.parse({ schedule: "19:00" })).toEqual({ schedule: "19:00" });
  });

  it("rechaza level inválido en partial", () => {
    expect(() => courseUpdateSchema.parse({ level: "pro" })).toThrow();
  });
});

describe("courseJoinSchema", () => {
  it("normaliza inviteCode a mayúsculas", () => {
    expect(courseJoinSchema.parse({ inviteCode: "  pad-ab12 " }).inviteCode).toBe("PAD-AB12");
  });

  it("rechaza formato inválido", () => {
    expect(() => courseJoinSchema.parse({ inviteCode: "PAD-AB1" })).toThrow();
    expect(() => courseJoinSchema.parse({ inviteCode: "ABC-AB12" })).toThrow();
    expect(() => courseJoinSchema.parse({ inviteCode: "" })).toThrow();
  });
});

describe("courseRubricAssignSchema", () => {
  it("acepta rubricId uuid", () => {
    expect(
      courseRubricAssignSchema.parse({ rubricId: "00000000-0000-0000-0000-000000000001" }).rubricId
    ).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("rechaza rubricId inválido", () => {
    expect(() => courseRubricAssignSchema.parse({ rubricId: "no-uuid" })).toThrow();
  });
});

describe("historyQuerySchema", () => {
  it("acepta sin filtros", () => {
    expect(historyQuerySchema.parse({})).toEqual({});
  });

  it("acepta filtros válidos", () => {
    const result = historyQuerySchema.parse({
      courseId: "00000000-0000-0000-0000-000000000001",
      studentId: "00000000-0000-0000-0000-000000000002",
      status: "published",
    });
    expect(result.status).toBe("published");
  });

  it("rechaza status inválido", () => {
    expect(() => historyQuerySchema.parse({ status: "archived" })).toThrow();
  });

  it("rechaza courseId no uuid", () => {
    expect(() => historyQuerySchema.parse({ courseId: "abc" })).toThrow();
  });
});