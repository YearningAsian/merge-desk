import { DataNotice, INSTALL_URL } from "@/ui/InstallPrompt";
import { Button } from "@/ui/primitives/button";

// The only thing /live shows before sign-in: what live mode does, what it
// sends and writes, and the way in. A refused or failed sign-in says why.

const RESULTS: Record<string, string> = {
  refused: "That GitHub account can't use live mode on this server right now.",
  expired: "The sign-in took too long or started in another tab. Try again.",
  failed: "GitHub didn't finish the sign-in. Try again.",
  cancelled: "Sign-in was cancelled.",
  unavailable: "Live mode isn't configured on this server yet.",
};

export function SignIn({ result }: { result?: string }) {
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
          Live mode reads the open pull requests on your own repositories, asks Gemini what each
          side of a conflict meant, and checks a proposed merge in a cloud sandbox with the network
          switched off, including your repository&apos;s own npm tests. Nothing is pushed until you
          land it.
        </p>
        <DataNotice />
        {message ? (
          <p
            role="alert"
            className="mt-5 rounded-desk border border-stop/30 bg-stop-wash px-3 py-2 text-[13px] text-stop-text"
          >
            {message}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-2.5">
          <Button asChild variant="primary" size="lg">
            <a href="/api/auth/github">Sign in with GitHub</a>
          </Button>
          <Button asChild variant="outline" size="lg">
            <a href={INSTALL_URL}>Install the GitHub App</a>
          </Button>
        </div>
        <p className="mt-3 text-[12.5px] text-muted">
          Install the App on the repositories you want first; signing in doesn&apos;t install it.
        </p>
      </div>
    </main>
  );
}
