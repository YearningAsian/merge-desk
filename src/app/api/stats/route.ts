import facts from "../../../../docs/FACTS.json";

export const dynamic = "force-static";

// The public numbers, exactly as docs/FACTS.json holds them (each with the
// command or source that measured it under provenance). Bundled at build
// time, so this answers the same thing the repository says.
export function GET() {
  return Response.json(facts, { headers: { "cache-control": "public, max-age=300" } });
}
