/**
 * Unit tests de `agendaGroupId` (uuid v5 determinista, D12/B1).
 * @jest-environment node
 */
import { agendaEventKey, agendaGroupId } from "@/lib/padel/agenda-group-id";

const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const BLOCK = "7f3c9a1e-2b4d-4c5e-9f60-1a2b3c4d5e6f";
const STUDENT = "0b5c7d8e-1111-4222-8333-444455556666";

describe("agendaGroupId", () => {
  it("devuelve un uuid v5 con variante RFC 4122", () => {
    expect(agendaGroupId(BLOCK, "assigned", STUDENT)).toMatch(UUID_V5);
    expect(agendaGroupId(BLOCK, "cancelled")).toMatch(UUID_V5);
  });

  it("es determinista: misma entrada ⇒ mismo id", () => {
    expect(agendaGroupId(BLOCK, "assigned", STUDENT)).toBe(agendaGroupId(BLOCK, "assigned", STUDENT));
    expect(agendaGroupId(BLOCK, "cancelled")).toBe(agendaGroupId(BLOCK, "cancelled"));
  });

  it("assigned, removed y cancelled del mismo bloque ⇒ 3 uuids distintos", () => {
    const ids = [
      agendaGroupId(BLOCK, "assigned", STUDENT),
      agendaGroupId(BLOCK, "removed", STUDENT),
      agendaGroupId(BLOCK, "cancelled"),
    ];
    expect(new Set(ids).size).toBe(3);
  });

  it("distinto alumno o distinto bloque ⇒ distinto uuid", () => {
    expect(agendaGroupId(BLOCK, "assigned", STUDENT)).not.toBe(
      agendaGroupId(BLOCK, "assigned", "11111111-2222-4333-8444-555555555555"),
    );
    expect(agendaGroupId(BLOCK, "assigned", STUDENT)).not.toBe(
      agendaGroupId("99999999-8888-4777-8666-555544443333", "assigned", STUDENT),
    );
  });

  it("studentId es requerido en assigned/removed", () => {
    expect(() => agendaGroupId(BLOCK, "assigned")).toThrow(TypeError);
    expect(() => agendaGroupId(BLOCK, "removed")).toThrow(TypeError);
    expect(() => agendaGroupId(BLOCK, "cancelled")).not.toThrow();
  });
});

describe("agendaEventKey", () => {
  it("incluye evento, bloque y alumno", () => {
    expect(agendaEventKey(BLOCK, "assigned", STUDENT)).toBe(`assigned:${BLOCK}:${STUDENT}`);
    expect(agendaEventKey(BLOCK, "removed", STUDENT)).toBe(`removed:${BLOCK}:${STUDENT}`);
  });

  it("cancelled no requiere studentId", () => {
    expect(agendaEventKey(BLOCK, "cancelled")).toBe(`cancelled:${BLOCK}`);
  });
});
