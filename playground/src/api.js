// Tiny API client used by the Merge Desk demo scenarios.

const API_ROOT = "https://api.example.test";

export async function getUser(id, { fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl(`${API_ROOT}/users/${id}`);
  if (!response.ok) {
    throw new Error(`getUser failed with ${response.status}`);
  }
  return response.json();
}

/** @deprecated Renamed to getUser; kept so existing callers keep working. */
export const fetchUser = getUser;

export async function displayName(id, options) {
  const user = await getUser(id, options);
  return user.name ?? `user ${id}`;
}
