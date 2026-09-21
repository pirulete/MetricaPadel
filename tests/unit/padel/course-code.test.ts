/**
 * Unit tests de lib/padel/course-code.ts (códigos de invitación PAD-XXXX).
 * @jest-environment node
 */
import {
  generateInviteCode,
} from "@/lib/padel/course-code";

describe("generateInviteCode", () => {
  it("genera código con formato PAD-XXXX", () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^PAD-[A-Z0-9]{4}$/);
  });

  it("genera códigos distintos en llamadas sucesivas", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateInviteCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});