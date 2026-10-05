// Tiny API client used by the Merge Desk demo scenarios.

const API_ROOT = "https://api.example.test";

export async function fetchUser(id, { fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl(`${API_ROOT}/users/${id}`);
  if (!response.ok) {
    throw new Error(`fetchUser failed with ${response.status}`);
  }
  return response.json();
}

export async function displayName(id, options) {
  const user = await fetchUser(id, options);
  return user.name ?? `user ${id}`;
}
