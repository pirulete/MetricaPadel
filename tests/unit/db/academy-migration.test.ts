/**
 * Unit tests de buildOwnershipMigrationPlan (AC-02) — espejo puro del DO block
 * de la migración 0011_*. Sin imports server-side.
 * @jest-environment node
 */
import { buildOwnershipMigrationPlan } from "@/lib/padel/academy-migration";

const saId = "sa-1";

const academies = [
  { id: "a1", ownerId: "coach-1" }, // owner difiere → update
  { id: "a2", ownerId: "coach-2" }, // owner difiere → update
  { id: "a3", ownerId: saId }, // owner ya es SA → no update
];

const ownerMemberships = [
  { id: "m1", academyId: "a1", userId: "coach-1", role: "OWNER", status: "active" }, // demote
  { id: "m2", academyId: "a2", userId: "coach-2", role: "OWNER", status: "active" }, // demote
  { id: "m3", academyId: "a3", userId: saId, role: "OWNER", status: "active" }, // SA ya miembro → no insert en a3
  { id: "m4", academyId: "a1", userId: "coach-1", role: "OWNER", status: "pending" }, // no activa → no demote
];

describe("buildOwnershipMigrationPlan", () => {
  it("computa academias a actualizar, membresías a demover e inserts", () => {
    const plan = buildOwnershipMigrationPlan({ academies, ownerMemberships, superAdminId: saId });

    expect(plan.academiesToUpdate).toEqual(["a1", "a2"]);
    expect(plan.membershipsToDemote).toEqual(["m1", "m2"]);
    // a1 y a2 no tienen membresía SA → insert; a3 sí → no insert
    expect(plan.membershipsToInsert).toEqual(["a1", "a2"]);
  });

  it("no-op cuando todo ya apunta al SUPER_ADMIN", () => {
    const plan = buildOwnershipMigrationPlan({
      academies: [{ id: "a3", ownerId: saId }],
      ownerMemberships: [{ id: "m3", academyId: "a3", userId: saId, role: "OWNER", status: "active" }],
      superAdminId: saId,
    });

    expect(plan.academiesToUpdate).toEqual([]);
    expect(plan.membershipsToDemote).toEqual([]);
    expect(plan.membershipsToInsert).toEqual([]);
  });

  it("no demueve membresías OWNER del propio SUPER_ADMIN", () => {
    const plan = buildOwnershipMigrationPlan({
      academies: [{ id: "a1", ownerId: saId }],
      ownerMemberships: [
        { id: "m-sa", academyId: "a1", userId: saId, role: "OWNER", status: "active" },
      ],
      superAdminId: saId,
    });

    expect(plan.membershipsToDemote).toEqual([]);
    expect(plan.membershipsToInsert).toEqual([]);
  });

  it("inserta membresía SA en academias sin membresía previa", () => {
    const plan = buildOwnershipMigrationPlan({
      academies: [{ id: "a1", ownerId: "coach-1" }],
      ownerMemberships: [],
      superAdminId: saId,
    });

    expect(plan.membershipsToInsert).toEqual(["a1"]);
    expect(plan.academiesToUpdate).toEqual(["a1"]);
  });
});