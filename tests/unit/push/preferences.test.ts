/**
 * Unit tests de preferencias push.
 * Cubre: wildcard '*', array vacío (opt-out total), lista específica, null/undefined.
 * @jest-environment node
 */
import { shouldSendPush } from "@/lib/push/preferences";

describe("shouldSendPush", () => {
  it("null/undefined → true (default wildcard, usuario no configuró)", () => {
    expect(shouldSendPush(null, "welcome")).toBe(true);
    expect(shouldSendPush(undefined, "welcome")).toBe(true);
  });

  it("['*'] → true (wildcard, recibe todo)", () => {
    expect(shouldSendPush(["*"], "anything")).toBe(true);
  });

  it("[] → false (opt-out total de push)", () => {
    expect(shouldSendPush([], "welcome")).toBe(false);
  });

  it("lista específica → true solo para esos tipos", () => {
    expect(shouldSendPush(["welcome", "email_verified"], "welcome")).toBe(true);
    expect(shouldSendPush(["welcome", "email_verified"], "email_verified")).toBe(true);
  });

  it("lista específica → false para tipos no incluidos", () => {
    expect(shouldSendPush(["welcome"], "email_verified")).toBe(false);
    expect(shouldSendPush(["welcome"], "billing.renewal_reminder")).toBe(false);
  });
});