import type { Metadata } from "next";
import { Recording } from "@/core/recording";
import { DEMO_REPO } from "@/server/env";
import { DemoDesk } from "@/ui/DemoDesk";
import { TopBar } from "@/ui/TopBar";
import clean from "../../../demo/recordings/clean.json";
import held from "../../../demo/recordings/held.json";
import drop from "../../../demo/recordings/drop.json";

export const metadata: Metadata = {
  title: "Demo | Merge Desk",
  description:
    "Three real merge conflicts, replayed from recorded runs: one verified, one held, one chosen drop.",
};

const REPO = DEMO_REPO;

// Checked when the page is built, so a broken recording fails the build
// instead of the demo.
const recordings = [clean, held, drop].map((recording) => Recording.parse(recording));

// Demo mode: anyone, no sign-in, nothing written. The page ships the
// recordings with it, so playing the demo makes no requests at all.
export default function DemoPage() {
  return (
    <div className="flex h-dvh flex-col">
      <TopBar demo />
      <DemoDesk recordings={recordings} repo={REPO} />
    </div>
  );
}
