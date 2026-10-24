import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchUser } from "../src/api.js";

function fakeFetch(statuses) {
  let calls = 0;
  const fetchImpl = async () => {
    const status = statuses[Math.min(calls, statuses.length - 1)];
    calls += 1;
    return { status, ok: status >= 200 && status < 300, json: async () => ({ id: 7, name: "Ada" }) };
  };
  return { fetchImpl, calls: () => calls };
}

test("fetchUser retries after HTTP 429", async () => {
  const fake = fakeFetch([429, 200]);
  const user = await fetchUser(7, { fetchImpl: fake.fetchImpl });
  assert.equal(user.name, "Ada");
  assert.equal(fake.calls(), 2);
});

test("fetchUser gives up after two retries", async () => {
  const fake = fakeFetch([429, 429, 429, 429]);
  await assert.rejects(fetchUser(7, { fetchImpl: fake.fetchImpl }), /429/);
  assert.equal(fake.calls(), 3);
});
