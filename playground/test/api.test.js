import { test } from "node:test";
import assert from "node:assert/strict";
import { displayName, fetchUser } from "../src/api.js";

const okFetch = async () => ({ status: 200, ok: true, json: async () => ({ id: 7, name: "Ada" }) });

test("fetchUser returns the user", async () => {
  const user = await fetchUser(7, { fetchImpl: okFetch });
  assert.equal(user.id, 7);
});

test("displayName uses the user's name", async () => {
  assert.equal(await displayName(7, { fetchImpl: okFetch }), "Ada");
});
