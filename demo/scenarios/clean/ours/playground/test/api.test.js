import { test } from "node:test";
import assert from "node:assert/strict";
import { displayName, fetchUser, getUser } from "../src/api.js";

const okFetch = async () => ({ status: 200, ok: true, json: async () => ({ id: 7, name: "Ada" }) });

test("getUser returns the user", async () => {
  const user = await getUser(7, { fetchImpl: okFetch });
  assert.equal(user.id, 7);
});

test("fetchUser still works as a deprecated alias", () => {
  assert.equal(fetchUser, getUser);
});

test("displayName uses the user's name", async () => {
  assert.equal(await displayName(7, { fetchImpl: okFetch }), "Ada");
});
