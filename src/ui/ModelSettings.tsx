"use client";

import { KeyRound } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { z } from "zod";
import {
  KEY_PROVIDERS,
  KeyProvider,
  MODEL_CHOICES,
  PROVIDERS,
  modelChoice,
  parseModelChoice,
} from "@/core/models";
import { Button } from "@/ui/primitives/button";
import { RadioGroup, RadioGroupItem } from "@/ui/primitives/radio-group";
import { updateSettings, type Settings } from "@/ui/settings";

// The model part of Settings: Gemini on the server's key, or Claude, GPT or
// any OpenRouter model on your own key. A key is sent once to this server,
// which seals it into a cookie only it can open (see server/keys); this page
// never sees it again and learns only whether one is saved.

const Saved = z.object({ saved: z.record(KeyProvider, z.boolean()) });
type Saved = Record<KeyProvider, boolean>;

async function keysRequest(method: "GET" | "POST" | "DELETE", body?: unknown): Promise<Saved> {
  const response = await fetch("/api/live/keys", {
    method,
    cache: "no-store",
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  const json = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(json.error ?? "The key couldn't be saved.");
  return Saved.parse(json).saved as Saved;
}

const radioValue = (model: Settings["model"]) => {
  const parsed = parseModelChoice(model);
  return parsed && parsed.provider !== "gemini" ? parsed.provider : model;
};

export function ModelSettings({ settings }: { settings: Settings }) {
  const id = useId();
  const [saved, setSaved] = useState<Saved | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    keysRequest("GET").then(
      (value) => !controller.signal.aborted && setSaved(value),
      () => !controller.signal.aborted && setSaved(null),
    );
    return () => controller.abort();
  }, []);

  const parsed = parseModelChoice(settings.model);
  const provider = parsed && parsed.provider !== "gemini" ? parsed.provider : null;

  const choose = (value: string) => {
    const asProvider = KeyProvider.safeParse(value);
    if (asProvider.success) {
      const current = provider === asProvider.data ? parsed!.model : null;
      updateSettings({
        model: modelChoice(
          asProvider.data,
          current ?? PROVIDERS[asProvider.data].models[0]!.id,
        ) as Settings["model"],
      });
    } else updateSettings({ model: value as Settings["model"] });
  };

  return (
    <fieldset className="py-3">
      <legend className="text-[13px] font-medium text-ink">Model</legend>
      <p className="mt-0.5 text-[12px] text-muted">
        Used for new analyses and runs. An existing analysis keeps the model it was made with until
        you analyze again. Whatever the model proposes, the same checks decide.
      </p>
      <RadioGroup
        aria-label="Model"
        value={radioValue(settings.model)}
        onValueChange={choose}
        className="mt-2.5 gap-1"
      >
        {[
          { id: "server", label: "Server default", note: "Gemini, as this server is set." },
          ...MODEL_CHOICES,
          ...KEY_PROVIDERS.map((key) => ({
            id: key,
            label: `${key === "openrouter" ? "Any model" : PROVIDERS[key].family} on your ${PROVIDERS[key].label} key`,
            note: saved?.[key] ? "Key saved." : "Needs your key.",
          })),
        ].map((choice) => (
          <label
            key={choice.id}
            htmlFor={`${id}-model-${choice.id}`}
            className="flex cursor-pointer items-start gap-2.5 rounded-[6px] px-2 py-1.5 hover:bg-ink/[0.03]"
          >
            <RadioGroupItem id={`${id}-model-${choice.id}`} value={choice.id} className="mt-0.5" />
            <span className="min-w-0">
              <span className="block text-[13px] text-ink">{choice.label}</span>
              <span className="block text-[12px] text-muted">{choice.note}</span>
            </span>
          </label>
        ))}
      </RadioGroup>

      {provider ? (
        <ProviderPanel
          key={provider}
          provider={provider}
          model={parsed!.model}
          saved={saved?.[provider] ?? false}
          problem={problem}
          onModel={(model) =>
            updateSettings({ model: modelChoice(provider, model) as Settings["model"] })
          }
          onSave={async (key) => {
            setProblem(null);
            try {
              setSaved(await keysRequest("POST", { provider, key }));
              return true;
            } catch (error) {
              setProblem(error instanceof Error ? error.message : "The key couldn't be saved.");
              return false;
            }
          }}
          onRemove={async () => {
            setProblem(null);
            try {
              setSaved(await keysRequest("DELETE", { provider }));
            } catch (error) {
              setProblem(error instanceof Error ? error.message : "The key couldn't be removed.");
            }
          }}
        />
      ) : null}
    </fieldset>
  );
}

function ProviderPanel({
  provider,
  model,
  saved,
  problem,
  onModel,
  onSave,
  onRemove,
}: {
  provider: KeyProvider;
  model: string;
  saved: boolean;
  problem: string | null;
  onModel: (model: string) => void;
  onSave: (key: string) => Promise<boolean>;
  onRemove: () => void;
}) {
  const id = useId();
  const info = PROVIDERS[provider];
  const suggested = info.models.some((item) => item.id === model);
  const [other, setOther] = useState(suggested ? "" : model);
  const [showOther, setShowOther] = useState(!suggested);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const otherValid = parseModelChoice(modelChoice(provider, other.trim())) !== null;

  return (
    <div className="mt-2 space-y-3 rounded-[6px] border border-hair bg-bg px-3 py-3">
      <div className="space-y-1.5">
        <label htmlFor={`${id}-model`} className="block text-[12.5px] font-medium text-ink">
          {info.family} model
        </label>
        <select
          id={`${id}-model`}
          value={showOther ? "other" : model}
          onChange={(event) => {
            const value = event.target.value;
            setShowOther(value === "other");
            if (value !== "other") onModel(value);
          }}
          className="h-8 w-full rounded-[6px] border border-control-border bg-surface px-2 text-[13px] text-ink"
        >
          {info.models.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
          <option value="other">Another model…</option>
        </select>
        {showOther ? (
          <div className="flex gap-2">
            <input
              aria-label={`Another ${info.label} model name`}
              value={other}
              onChange={(event) => setOther(event.target.value)}
              placeholder={provider === "openrouter" ? "vendor/model" : "model name"}
              spellCheck={false}
              autoComplete="off"
              className="h-8 min-w-0 flex-1 rounded-[6px] border border-control-border bg-surface px-2.5 font-mono text-[12.5px]"
            />
            <Button size="sm" disabled={!otherValid} onClick={() => onModel(other.trim())}>
              Use
            </Button>
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
          <KeyRound aria-hidden className="size-3.5" /> Your {info.label} key
        </p>
        {saved ? (
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className="text-ok-text">Saved and sealed for this sign-in.</span>
            <Button size="sm" variant="ghost" onClick={onRemove}>
              Remove key
            </Button>
          </div>
        ) : (
          <form
            className="flex gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              setSaving(true);
              if (await onSave(key)) setKey("");
              setSaving(false);
            }}
          >
            <input
              type="password"
              aria-label={`${info.label} API key`}
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder={info.keyHint}
              autoComplete="off"
              spellCheck={false}
              className="h-8 min-w-0 flex-1 rounded-[6px] border border-control-border bg-surface px-2.5 font-mono text-[12.5px]"
            />
            <Button type="submit" size="sm" disabled={saving || key.trim().length < 20}>
              Save key
            </Button>
          </form>
        )}
        {problem ? <p className="text-[12px] text-stop-text">{problem}</p> : null}
        <p className="text-[12px] text-muted">
          Sent once to this server, which seals it into a cookie only it can open. It is never shown
          again, stored on the server or logged, and it is cleared when you sign out or after 8
          hours. Calls on it are billed to your {info.label} account.
        </p>
      </div>
    </div>
  );
}
