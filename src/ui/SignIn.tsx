import { Button } from "@/ui/primitives/button";

// The only thing /live shows before sign-in: what live mode does, who can
// use it, and one way in. A refused or failed sign-in says why.

const RESULTS: Record<string, string> = {
  refused: "That GitHub account can't use live mode. Only the repository owner can for now.",
  expired: "The sign-in took too long or started in another tab. Try again.",
  failed: "GitHub didn't finish the sign-in. Try again.",
  cancelled: "Sign-in was cancelled.",
  unavailable: "Live mode isn't configured on this server yet.",
};

export function SignIn({ repo, result }: { repo: string; result?: string }) {
  const message = result ? RESULTS[result] : undefined;
  return (
    <main
      id="main"
      tabIndex={-1}
      aria-labelledby="signin-title"
      className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col px-4 pt-16 pb-16 outline-none md:px-10 md:pt-24"
    >
      <div className="max-w-[480px]">
        <h1 id="signin-title" className="text-[26px] leading-tight font-semibold tracking-tight">
          Sign in to use live mode
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-muted">
          Live mode reads the open pull requests on{" "}
          <span className="font-mono text-ink">{repo}</span>, asks Gemini what each side of a
          conflict meant, and checks a proposed merge in a cloud sandbox with the network switched
          off. Nothing is pushed until you land it.
        </p>
        {message ? (
          <p
            role="alert"
            className="mt-5 rounded-desk border border-stop/30 bg-stop-wash px-3 py-2 text-[13px] text-stop-text"
          >
            {message}
          </p>
        ) : null}
        <Button asChild variant="primary" size="lg" className="mt-6">
          <a href="/api/auth/github">Sign in with GitHub</a>
        </Button>
        <p className="mt-3 text-[12.5px] text-muted">
          Only the repository owner&apos;s account is allowed for now.
        </p>
      </div>
    </main>
  );
}
