/**
 * Unit tests for Neon database branching helpers.
 *
 * Tests pure functions and mocked API calls (fetch global).
 */

import {
  validateBranchName,
  maskConnectionString,
  ensurePreviewBranch,
  cleanupStaleBranches,
  type NeonBranch,
} from "../../lib/neon/branching";

// ── validateBranchName ────────────────────────────────────────────────

describe("validateBranchName", () => {
  it("accepts valid names", () => {
    expect(validateBranchName("preview")).toBe(true);
    expect(validateBranchName("my-branch")).toBe(true);
    expect(validateBranchName("branch_123")).toBe(true);
    expect(validateBranchName("abc")).toBe(true);
  });

  it("rejects names shorter than 3 chars", () => {
    expect(validateBranchName("ab")).toBe(false);
    expect(validateBranchName("a")).toBe(false);
  });

  it("rejects names with special characters", () => {
    expect(validateBranchName("branch name")).toBe(false);
    expect(validateBranchName("branch/name")).toBe(false);
    expect(validateBranchName("branch@123")).toBe(false);
    expect(validateBranchName("branch:port")).toBe(false);
  });

  it("rejects names longer than 64 chars", () => {
    expect(validateBranchName("a".repeat(65))).toBe(false);
    expect(validateBranchName("a".repeat(64))).toBe(true);
  });
});

// ── maskConnectionString ──────────────────────────────────────────────

describe("maskConnectionString", () => {
  it("masks password from connection string", () => {
    const url = "postgresql://user:secretpassword@ep-cool-bird-123456.us-east-2.aws.neon.tech/neondb?sslmode=require";
    const masked = maskConnectionString(url);
    expect(masked).toBe("postgresql://***@ep-cool-bird-123456.us-east-2.aws.neon.tech/neondb");
    expect(masked).not.toContain("secretpassword");
  });

  it("masks complex passwords", () => {
    const url = "postgresql://padel:p@$$w0rd!@ep-xxx.neon.tech/db";
    const masked = maskConnectionString(url);
    expect(masked).toBe("postgresql://***@ep-xxx.neon.tech/db");
  });

  it("returns *** for invalid URLs", () => {
    expect(maskConnectionString("not-a-url")).toBe("***");
    expect(maskConnectionString("")).toBe("***");
  });

  it("preserves protocol and host", () => {
    const url = "postgresql://user:pass@host.neon.tech/db";
    const masked = maskConnectionString(url);
    expect(masked).toMatch(/^postgresql:\/\/\*\*\*@host\.neon\.tech\/db$/);
  });
});

// ── ensurePreviewBranch (mocked fetch) ────────────────────────────────

function makeBranch(name: string, id?: string): NeonBranch {
  return {
    id: id || `br-${name}`,
    name,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    parent_id: "br-main",
    state: "active",
    connection_uris: [
      {
        connection_uri: `postgresql://user:pass@ep-${name}.neon.tech/neondb`,
        provider: "aws",
        pooler: false,
      },
    ],
  };
}

describe("ensurePreviewBranch", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("reuses existing branch", async () => {
    const existingBranch = makeBranch("preview");
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ branches: [existingBranch] }),
    });

    const result = await ensurePreviewBranch("test-key", "test-project");
    expect(result.created).toBe(false);
    expect(result.branch.name).toBe("preview");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("creates branch if not found", async () => {
    const createdBranch = makeBranch("preview", "br-new");
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ branches: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ branch: createdBranch }),
      });

    const result = await ensurePreviewBranch("test-key", "test-project");
    expect(result.created).toBe(true);
    expect(result.branch.id).toBe("br-new");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("throws on API error", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    await expect(ensurePreviewBranch("bad-key", "test-project")).rejects.toThrow("401");
  });
});

// ── cleanupStaleBranches (mocked fetch) ───────────────────────────────

describe("cleanupStaleBranches", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("does not delete branches in allowlist", async () => {
    const branches = [
      makeBranch("main"),
      makeBranch("preview"),
    ];
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ branches }),
    });

    const deleted = await cleanupStaleBranches("key", "proj", ["main", "preview"], 14);
    expect(deleted).toEqual([]);
  });

  it("deletes old branches outside allowlist", async () => {
    const oldDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    const branches = [
      makeBranch("main"),
      makeBranch("preview"),
      { ...makeBranch("stale-branch", "br-stale"), created_at: oldDate },
    ];
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ branches }),
      })
      .mockResolvedValueOnce({ ok: true });

    const deleted = await cleanupStaleBranches("key", "proj", ["main", "preview"], 14);
    expect(deleted).toEqual(["stale-branch"]);
  });

  it("keeps recent branches even if outside allowlist", async () => {
    const recentDate = new Date().toISOString();
    const branches = [
      makeBranch("main"),
      { ...makeBranch("new-branch", "br-new"), created_at: recentDate },
    ];
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ branches }),
    });

    const deleted = await cleanupStaleBranches("key", "proj", ["main", "preview"], 14);
    expect(deleted).toEqual([]);
  });
});
