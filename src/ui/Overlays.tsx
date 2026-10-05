"use client";

import { Keyboard, Settings as SettingsIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { MODEL_CHOICES } from "@/core/models";
import { Button } from "@/ui/primitives/button";
import { Dialog, DialogContent } from "@/ui/primitives/dialog";
import { Kbd } from "@/ui/primitives/kbd";
import { RadioGroup, RadioGroupItem } from "@/ui/primitives/radio-group";
import { Switch } from "@/ui/primitives/switch";
import {
  onOverlay,
  openOverlay,
  resetSettings,
  updateSettings,
  useSettings,
  type Overlay,
  type Settings,
} from "@/ui/settings";

// Settings and the keyboard shortcut list. Both open from the top bar or the
// keyboard (`,` and `?`), and every change applies at once.

export const SHORTCUTS: Array<[keys: string[], what: string]> = [
  [["J", "K"], "Move through pull requests (or ↓ ↑ in the list)"],
  [["Enter"], "Open the focused pull request"],
  [["←", "→"], "Move the resolution slider"],
  [["1", "2", "3"], "Keep ours, Combine, Keep theirs"],
  [["A"], "Analyze the open pull request again"],
  [["D"], "Show or hide Details"],
  [["O"], "Open the pull request on GitHub"],
  [["R"], "Refresh the list"],
  [[","], "Settings"],
  [["?"], "This list"],
  [["Esc"], "Close a dialog or the phone sheet"],
];

function Row({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 py-3">
      <div className="min-w-0 flex-1">
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink">
          {label}
        </label>
        {hint ? <p className="mt-0.5 text-[12px] text-muted">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Select<T extends string | number>({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <select
      id={id}
      value={String(value)}
      onChange={(event) =>
        onChange(options.find(([option]) => String(option) === event.target.value)![0])
      }
      className="h-8 shrink-0 rounded-[6px] border border-control-border bg-surface px-2 text-[13px] text-ink"
    >
      {options.map(([option, label]) => (
        <option key={String(option)} value={String(option)}>
          {label}
        </option>
      ))}
    </select>
  );
}

function SettingsBody({ settings }: { settings: Settings }) {
  const id = useId();
  const field = (name: string) => `${id}-${name}`;
  return (
    <div className="divide-y divide-hair px-5">
      <fieldset className="py-3">
        <legend className="text-[13px] font-medium text-ink">Gemini model</legend>
        <p className="mt-0.5 text-[12px] text-muted">
          Used for new analyses. An existing analysis keeps the model it was made with until you
          analyze again.
        </p>
        <RadioGroup
          aria-label="Gemini model"
          value={settings.model}
          onValueChange={(model) => updateSettings({ model: model as Settings["model"] })}
          className="mt-2.5 gap-1"
        >
          {[
            { id: "server", label: "Server default", note: "Whatever this server is set to." },
            ...MODEL_CHOICES,
          ].map((choice) => (
            <label
              key={choice.id}
              htmlFor={field(`model-${choice.id}`)}
              className="flex cursor-pointer items-start gap-2.5 rounded-[6px] px-2 py-1.5 hover:bg-ink/[0.03]"
            >
              <RadioGroupItem
                id={field(`model-${choice.id}`)}
                value={choice.id}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="block text-[13px] text-ink">{choice.label}</span>
                <span className="block text-[12px] text-muted">{choice.note}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </fieldset>

      <Row
        label="Analyze when a pull request opens"
        hint="Off: nothing is sent to Gemini until you press Analyze."
        htmlFor={field("auto")}
      >
        <Switch
          id={field("auto")}
          checked={settings.autoAnalyze}
          onCheckedChange={(autoAnalyze) => updateSettings({ autoAnalyze })}
        />
      </Row>
      <Row
        label="Refresh the list"
        hint="Only while this tab is visible, and whenever you come back to it."
        htmlFor={field("refresh")}
      >
        <Select
          id={field("refresh")}
          value={settings.refreshSeconds}
          options={[
            [15, "Every 15 s"],
            [30, "Every 30 s"],
            [60, "Every minute"],
            [0, "Off"],
          ]}
          onChange={(refreshSeconds) => updateSettings({ refreshSeconds })}
        />
      </Row>
      <Row label="Diff layout" htmlFor={field("layout")}>
        <Select
          id={field("layout")}
          value={settings.diffLayout}
          options={[
            ["auto", "By window width"],
            ["split", "Side by side"],
            ["unified", "One column"],
          ]}
          onChange={(diffLayout) => updateSettings({ diffLayout })}
        />
      </Row>
      <Row label="Wrap long lines in diffs" htmlFor={field("wrap")}>
        <Switch
          id={field("wrap")}
          checked={settings.wrap}
          onCheckedChange={(wrap) => updateSettings({ wrap })}
        />
      </Row>
      <Row
        label="Single-key shortcuts"
        hint="J, K, arrows, 1 to 3, A, D, O, R. Turn off if they clash with a browser extension."
        htmlFor={field("keys")}
      >
        <Switch
          id={field("keys")}
          checked={settings.shortcuts}
          onCheckedChange={(shortcuts) => updateSettings({ shortcuts })}
        />
      </Row>
      <Row
        label="Reduce motion"
        hint="Your system setting is always respected; this turns motion off here too."
        htmlFor={field("motion")}
      >
        <Switch
          id={field("motion")}
          checked={settings.reduceMotion}
          onCheckedChange={(reduceMotion) => updateSettings({ reduceMotion })}
        />
      </Row>
      <div className="flex items-center gap-3 py-3">
        <p className="min-w-0 flex-1 text-[12px] text-muted">Saved in this browser.</p>
        <Button size="sm" variant="ghost" onClick={resetSettings}>
          Reset to defaults
        </Button>
      </div>
    </div>
  );
}

function ShortcutList() {
  return (
    <dl className="divide-y divide-hair px-5 text-[13px]">
      {SHORTCUTS.map(([keys, what]) => (
        <div key={what} className="flex items-center gap-4 py-2">
          <dt className="flex w-28 shrink-0 gap-1">
            {keys.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </dt>
          <dd className="min-w-0 text-ink">{what}</dd>
        </div>
      ))}
      <p className="py-3 text-[12px] text-muted">
        Single keys are ignored while you type in a field. Turn them off in Settings.
      </p>
    </dl>
  );
}

// Mounted once per desk view; also applies the reduce-motion choice.
export function DeskOverlays() {
  const settings = useSettings();
  const [open, setOpen] = useState<Overlay | null>(null);
  useEffect(() => onOverlay(setOpen), []);
  useEffect(() => {
    if (settings.reduceMotion) document.documentElement.dataset.motion = "reduce";
    else delete document.documentElement.dataset.motion;
  }, [settings.reduceMotion]);
  return (
    <>
      <Dialog open={open === "settings"} onOpenChange={(next) => setOpen(next ? "settings" : null)}>
        <DialogContent title="Settings">
          <SettingsBody settings={settings} />
        </DialogContent>
      </Dialog>
      <Dialog
        open={open === "shortcuts"}
        onOpenChange={(next) => setOpen(next ? "shortcuts" : null)}
      >
        <DialogContent title="Keyboard shortcuts">
          <ShortcutList />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function OverlayButtons() {
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Keyboard shortcuts"
        className="hidden md:inline-flex"
        onClick={() => openOverlay("shortcuts")}
      >
        <Keyboard aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Settings"
        onClick={() => openOverlay("settings")}
      >
        <SettingsIcon aria-hidden />
      </Button>
    </>
  );
}
