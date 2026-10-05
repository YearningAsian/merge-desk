import type { Metadata } from "next";
import { cookies } from "next/headers";
import { CODE_ALLOWED_REPOS, integrationStatus, isAllowedLogin } from "@/server/env";
import { readSession } from "@/server/session";
import { LiveDesk } from "@/ui/LiveDesk";
import { SignIn } from "@/ui/SignIn";
import { TopBar } from "@/ui/TopBar";

export const metadata: Metadata = { title: "Live mode | Merge Desk" };

const REPO = CODE_ALLOWED_REPOS[0];

// Live mode. Signed out (or not allowed), only the sign-in panel renders;
// the API routes enforce the same rules on their own.
export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<{ signin?: string }>;
}) {
  const { signin } = await searchParams;
  const configured = integrationStatus().session;
  const jar = await cookies();
  const session = configured
    ? await readSession(
        jar
          .getAll()
          .map((cookie) => `${cookie.name}=${cookie.value}`)
          .join("; "),
      )
    : null;
  const allowed = session && isAllowedLogin(session.login) ? session.login : null;

  return (
    <div className="flex h-dvh flex-col">
      <TopBar repo={REPO} login={allowed ?? undefined} />
      {allowed ? (
        <LiveDesk repo={REPO} />
      ) : (
        <SignIn repo={REPO} result={configured ? signin : "unavailable"} />
      )}
    </div>
  );
}
