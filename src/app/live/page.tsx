import type { Metadata } from "next";
import { cookies } from "next/headers";
import { integrationStatus, isAllowedLogin, isRepoName } from "@/server/env";
import { readSession } from "@/server/session";
import { ForgetSession } from "@/ui/ForgetSession";
import { InstallPrompt } from "@/ui/InstallPrompt";
import { LiveDesk } from "@/ui/LiveDesk";
import { SignIn } from "@/ui/SignIn";
import { TopBar } from "@/ui/TopBar";

export const metadata: Metadata = { title: "Live mode | Merge Desk" };

// Live mode. Signed out (or not allowed), only the sign-in panel renders;
// signed in, the desk for ?repo= or the first repository GitHub listed at
// sign-in. The API routes check push access to it on every request.
export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<{ signin?: string; repo?: string }>;
}) {
  const { signin, repo: asked } = await searchParams;
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
  const allowed = session && isAllowedLogin(session.login) ? session : null;
  const repos = allowed?.repos ?? [];
  const repo = asked && isRepoName(asked) ? asked : repos[0];

  return (
    <div className="flex h-dvh flex-col">
      <TopBar repo={allowed ? repo : undefined} repos={repos} login={allowed?.login} />
      {allowed ? (
        repo ? (
          <LiveDesk key={repo} repo={repo} />
        ) : (
          <InstallPrompt />
        )
      ) : (
        <>
          <ForgetSession />
          <SignIn result={configured ? signin : "unavailable"} />
        </>
      )}
    </div>
  );
}
