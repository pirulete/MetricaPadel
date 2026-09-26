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
  parentName: string = "production"
): Promise<NeonBranch> {
  if (!validateBranchName(branchName)) {
    throw new Error(`Invalid branch name: "${branchName}". Use alphanumeric, hyphens, underscores (3-64 chars).`);
  }
  // Neon API requires parent_id as branch ID, not name
  const parent = await getBranchByName(apiKey, projectId, parentName);
  if (!parent) {
    throw new Error(`Parent branch "${parentName}" not found in project`);
  }
  const res = await fetch(`${NEON_API_BASE}/projects/${projectId}/branches`, {
    method: "POST",
    headers: apiHeaders(apiKey),
    body: JSON.stringify({
      branch: {
        name: branchName,
        parent_id: parent.id,
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
 * Neon stores connection info in endpoints, not in branch.connection_uris.
 */
export function getConnectionString(branch: NeonBranch, host?: string): string {
  if (host) {
    return `postgresql://neondb_owner:${encodeURIComponent("")}@${host}/neondb?sslmode=require`;
  }
  const uri = branch.connection_uris?.[0]?.connection_uri;
  if (uri) return uri;
  throw new Error(`No connection URI for branch "${branch.name}". Ensure an endpoint exists.`);
}

/**
 * Create an endpoint (compute) for a branch.
 * Neon free tier doesn't auto-create endpoints for branches.
 */
export async function createEndpoint(
  apiKey: string,
  projectId: string,
  branchId: string
): Promise<{ host: string }> {
  const res = await fetch(`${NEON_API_BASE}/projects/${projectId}/endpoints`, {
    method: "POST",
    headers: apiHeaders(apiKey),
    body: JSON.stringify({
      endpoint: {
        branch_id: branchId,
        type: "read_write",
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Neon API error creating endpoint ${res.status}: ${body}`);
  }
  const data = await res.json();
  return { host: data.endpoint.host };
}

/**
 * List endpoints for a branch.
 */
export async function listEndpoints(
  apiKey: string,
  projectId: string,
  branchId: string
): Promise<Array<{ host: string; id: string }>> {
  const res = await fetch(`${NEON_API_BASE}/projects/${projectId}/endpoints`, {
    headers: apiHeaders(apiKey),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Neon API error ${res.status}: ${body}`);
  }
  const data = await res.json();
  return (data.endpoints ?? [])
    .filter((e: { branch_id: string }) => e.branch_id === branchId)
    .map((e: { host: string; id: string }) => ({ host: e.host, id: e.id }));
}

/**
 * Ensure the preview branch exists. Create from parent if missing.
 * Returns the connection string (masked in logs).
 */
export async function ensurePreviewBranch(
  apiKey: string,
  projectId: string,
  previewBranchName: string = "preview",
  parentBranchName: string = "production"
): Promise<BranchingResult> {
  const existing = await getBranchByName(apiKey, projectId, previewBranchName);
  if (existing) {
    // Branch exists — check if it has an endpoint
    const endpoints = await listEndpoints(apiKey, projectId, existing.id);
    if (endpoints.length === 0) {
      console.log(`  Branch "${previewBranchName}" exists but has no endpoint. Creating...`);
      const { host } = await createEndpoint(apiKey, projectId, existing.id);
      return {
        branch: existing,
        connectionString: `postgresql://neondb_owner@${host}/neondb?sslmode=require`,
        created: false,
      };
    }
    const host = endpoints[0].host;
    return {
      branch: existing,
      connectionString: `postgresql://neondb_owner@${host}/neondb?sslmode=require`,
      created: false,
    };
  }
  const created = await createBranch(apiKey, projectId, previewBranchName, parentBranchName);
  // Create endpoint for the new branch
  const { host } = await createEndpoint(apiKey, projectId, created.id);
  return {
    branch: created,
    connectionString: `postgresql://neondb_owner@${host}/neondb?sslmode=require`,
    created: true,
  };
}

/**
 * Delete branches that are not in the allowlist and older than N days.
 */
export async function cleanupStaleBranches(
  apiKey: string,
  projectId: string,
  allowlist: string[] = ["production", "preview"],
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
