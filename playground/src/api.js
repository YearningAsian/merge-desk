// Tiny API client used by the Merge Desk demo scenarios.

const API_ROOT = "https://api.example.test";

export async function getUser(id, { fetchImpl = globalThis.fetch, retries = 2 } = {}) {
  const url = `${API_ROOT}/users/${id}`;
  let response = await fetchImpl(url);
  for (let attempt = 0; response.status === 429 && attempt < retries; attempt += 1) {
    response = await fetchImpl(url);
  }
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
