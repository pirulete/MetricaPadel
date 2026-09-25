/**
 * Neon Database Branching — client API + helpers.
 *
 * Uses Node 22 global fetch (no external dependencies).
 * All functions accept explicit apiKey/projectId for testability.
 */

const NEON_API_BASE = "https://console.neon.tech/api/v2";

export interface NeonBranch {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  parent_id: string | null;
  state: string;
  connection_uris: Array<{
    connection_uri: string;
    provider: string;
    pooler: boolean;
  }>;
}

export interface BranchingResult {
  branch: NeonBranch;
  connectionString: string;
  created: boolean;
}

function apiHeaders(apiKey: string) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

/**
 * Validate branch name (alphanumeric, hyphens, underscores, 3-64 chars).
 */
export function validateBranchName(name: string): boolean {
  return /^[a-zA-Z0-9_-]{3,64}$/.test(name);
}

/**
 * Mask a connection string: show protocol, host, database but hide password.
 * Input:  postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
 * Output: postgresql://***@ep-xxx.us-east-2.aws.neon.tech/neondb
 */
export function maskConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//***@${parsed.host}${parsed.pathname}`;
  } catch {
    return "***";
  }
}

/**
 * List all branches in a Neon project.
 */
export async function listBranches(
  apiKey: string,
  projectId: string
): Promise<NeonBranch[]> {
  const res = await fetch(`${NEON_API_BASE}/projects/${projectId}/branches`, {
    headers: apiHeaders(apiKey),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Neon API error ${res.status}: ${body}`);
  }
  const data = await res.json();
  return data.branches ?? [];
}

/**
 * Get a branch by name. Returns null if not found.
 */
export async function getBranchByName(
  apiKey: string,
  projectId: string,
  branchName: string
): Promise<NeonBranch | null> {
  const branches = await listBranches(apiKey, projectId);
  return branches.find((b) => b.name === branchName) ?? null;
}

/**
 * Create a new branch from a parent branch.
 */
export async function createBranch(
  apiKey: string,
  projectId: string,
  branchName: string,
  parentName: string = "main"
): Promise<NeonBranch> {
  if (!validateBranchName(branchName)) {
    throw new Error(`Invalid branch name: "${branchName}". Use alphanumeric, hyphens, underscores (3-64 chars).`);
  }
  const res = await fetch(`${NEON_API_BASE}/projects/${projectId}/branches`, {
    method: "POST",
    headers: apiHeaders(apiKey),
    body: JSON.stringify({
      branch: {
        name: branchName,
        parent_id: parentName,
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Neon API error ${res.status}: ${body}`);
  }
  const data = await res.json();
  return data.branch;
}

/**
 * Reset a branch to its parent's current state (Restore from parent).
 * The endpoint host stays the same (connection string is stable).
 */
export async function resetBranch(
  apiKey: string,
  projectId: string,
  branchId: string
): Promise<NeonBranch> {
  const res = await fetch(
    `${NEON_API_BASE}/projects/${projectId}/branches/${branchId}/restore`,
    {
      method: "POST",
      headers: apiHeaders(apiKey),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Neon API error ${res.status}: ${body}`);
  }
  const data = await res.json();
  return data.branch;
}

/**
 * Delete a branch by ID.
 */
export async function deleteBranch(
  apiKey: string,
  projectId: string,
  branchId: string
): Promise<void> {
  const res = await fetch(
    `${NEON_API_BASE}/projects/${projectId}/branches/${branchId}`,
    {
      method: "DELETE",
      headers: apiHeaders(apiKey),
    }
  );
  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`Neon API error ${res.status}: ${body}`);
  }
}

/**
 * Get the connection string for a branch.
 */
export function getConnectionString(branch: NeonBranch): string {
  const uri = branch.connection_uris?.[0]?.connection_uri;
  if (!uri) {
    throw new Error(`No connection URI for branch "${branch.name}"`);
  }
  return uri;
}

/**
 * Ensure the preview branch exists. Create from parent if missing.
 * Returns the connection string (masked in logs).
 */
export async function ensurePreviewBranch(
  apiKey: string,
  projectId: string,
  previewBranchName: string = "preview",
  parentBranchName: string = "main"
): Promise<BranchingResult> {
  const existing = await getBranchByName(apiKey, projectId, previewBranchName);
  if (existing) {
    return {
      branch: existing,
      connectionString: getConnectionString(existing),
      created: false,
    };
  }
  const created = await createBranch(apiKey, projectId, previewBranchName, parentBranchName);
  return {
    branch: created,
    connectionString: getConnectionString(created),
    created: true,
  };
}

/**
 * Delete branches that are not in the allowlist and older than N days.
 */
export async function cleanupStaleBranches(
  apiKey: string,
  projectId: string,
  allowlist: string[] = ["main", "preview"],
  olderThanDays: number = 14
): Promise<string[]> {
  const branches = await listBranches(apiKey, projectId);
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  const deleted: string[] = [];

  for (const branch of branches) {
    if (allowlist.includes(branch.name)) continue;
    if (branch.name.startsWith("main")) continue;
    const created = new Date(branch.created_at).getTime();
    if (created < cutoff) {
      await deleteBranch(apiKey, projectId, branch.id);
      deleted.push(branch.name);
    }
  }
  return deleted;
}
