export async function apiError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.error ?? `Error ${res.status}`;
  } catch {
    return `Error ${res.status}`;
  }
}
