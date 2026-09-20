/**
 * Unit tests de updateUserAvatar con db mockeado.
 * Verifica que actualiza avatar_url + updatedAt y delega en db.update.
 * @jest-environment node
 */
jest.mock("@/lib/db", () => {
  const makeChain = () => {
    const c: Record<string, jest.Mock> = {} as any;
    c.set = jest.fn(() => c);
    c.where = jest.fn(() => c);
    c.returning = jest.fn(async () => []);
    return c;
  };
  const updateChain = makeChain();
  return {
    db: {
      query: { users: { findFirst: jest.fn() } },
      update: jest.fn(() => updateChain),
    },
  };
});

import { db } from "@/lib/db";
import { updateUserAvatar } from "@/lib/db/queries/auth";

type Chain = Record<string, jest.Mock>;
const updateChain = (db.update as jest.Mock)() as Chain;

beforeEach(() => {
  jest.clearAllMocks();
  (db.update as jest.Mock).mockImplementation(() => updateChain);
  (updateChain.set as jest.Mock).mockImplementation(() => updateChain);
  (updateChain.where as jest.Mock).mockImplementation(() => updateChain);
});

describe("updateUserAvatar", () => {
  it("actualiza avatar_url y updatedAt al setear un avatar", async () => {
    const setValues: any[] = [];
    (updateChain.set as jest.Mock).mockImplementation((values: any) => {
      setValues.push(values);
      return updateChain;
    });
    await updateUserAvatar("u1", "https://cdn.example.com/avatar.jpg");
    expect(db.update).toHaveBeenCalled();
    expect(setValues[0].avatarUrl).toBe("https://cdn.example.com/avatar.jpg");
    expect(setValues[0].updatedAt).toBeInstanceOf(Date);
    expect(updateChain.where).toHaveBeenCalled();
  });

  it("permite borrar el avatar pasando null", async () => {
    const setValues: any[] = [];
    (updateChain.set as jest.Mock).mockImplementation((values: any) => {
      setValues.push(values);
      return updateChain;
    });
    await updateUserAvatar("u1", null);
    expect(setValues[0].avatarUrl).toBeNull();
  });
});
