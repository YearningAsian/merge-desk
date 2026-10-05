// Tiny API client used by the Merge Desk demo scenarios.

const API_ROOT = "https://api.example.test";

export async function fetchUser(id, { fetchImpl = globalThis.fetch, retries = 2 } = {}) {
  const url = `${API_ROOT}/users/${id}`;
  let response = await fetchImpl(url);
  for (let attempt = 0; response.status === 429 && attempt < retries; attempt += 1) {
    response = await fetchImpl(url);
  }
  if (!response.ok) {
    throw new Error(`fetchUser failed with ${response.status}`);
  }
  return response.json();
}

export async function displayName(id, options) {
  const user = await fetchUser(id, options);
  return user.name ?? `user ${id}`;
}
