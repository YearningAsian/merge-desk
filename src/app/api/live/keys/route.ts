import { z } from "zod";
import { KeyProvider } from "@/core/models";
import { ApiKey, keysCookie, readKeys, savedProviders, sealKeys } from "@/server/keys";
import { guardLive } from "@/server/session";

export const runtime = "nodejs";

// Your own model keys (see server/keys). Signed in and allowlisted like every
// live route; saving and removing must come from Merge Desk's own pages.
// Every answer says only which providers have a key, never a key.

const json = (status: number, body: Record<string, unknown>, cookie?: string) => {
  const headers = new Headers({ "cache-control": "no-store" });
  if (cookie) headers.append("set-cookie", cookie);
  return Response.json(body, { status, headers });
};

export async function GET(request: Request) {
  const guard = await guardLive(request);
  if (!guard.ok) return guard.response;
  const keys = await readKeys(request.headers.get("cookie"), guard.login);
  return json(200, { saved: savedProviders(keys) });
}

const Save = z.object({ provider: KeyProvider, key: ApiKey });

export async function POST(request: Request) {
  const guard = await guardLive(request, { mutating: true });
  if (!guard.ok) return guard.response;
  const body = Save.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return json(400, { error: "That doesn't look like an API key for a supported provider." });
  const keys = await readKeys(request.headers.get("cookie"), guard.login);
  const next = { ...keys, [body.data.provider]: body.data.key };
  return json(200, { saved: savedProviders(next) }, keysCookie(await sealKeys(guard.login, next)));
}

const Remove = z.object({ provider: KeyProvider.optional() });

// Removes one provider's key, or every key when no provider is named.
export async function DELETE(request: Request) {
  const guard = await guardLive(request, { mutating: true });
  if (!guard.ok) return guard.response;
  const body = Remove.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return json(400, { error: "Unknown provider." });
  const keys = await readKeys(request.headers.get("cookie"), guard.login);
  const next = body.data.provider ? { ...keys, [body.data.provider]: undefined } : {};
  const left = Object.values(next).some(Boolean);
  return json(
    200,
    { saved: savedProviders(next) },
    keysCookie(left ? await sealKeys(guard.login, next) : null),
  );
}
