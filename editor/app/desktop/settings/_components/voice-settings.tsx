"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import { Trash2Icon } from "lucide-react";
import { RadioGroup } from "radix-ui";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@app/ui/components/alert-dialog";
import { Button } from "@app/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@app/ui/components/dialog";
import { Input } from "@app/ui/components/input";
import { Label } from "@app/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@app/ui/components/select";
import { Switch } from "@app/ui/components/switch";
import { models } from "@grida/ai/catalogue";
import { GG_PROVIDER_ID, OPENAI_PROJECT_PROVIDER_ID } from "@grida/ai-host";
import {
  DESKTOP_VOICE_GRIDA_KEY_PREFIX,
  DESKTOP_VOICE_PROVIDERS,
  desktopVoiceLanguageHint,
  type DesktopVoiceProvider,
  type DesktopVoiceSettings,
  type DesktopVoiceSettingsPatch,
} from "@grida/desktop-bridge";
import { BYOK_PROVIDER_LABELS, voice } from "@/lib/desktop/bridge";
import {
  BYOK_PROVIDER_LOGOS,
  ModelVendorLogo,
  ProviderLogos,
} from "./model-logos";
import { voiceLanguages } from "./voice-languages";

const voiceModel = models.audio.transcription.models["openai/gpt-transcribe"];
const voiceProviderSetup = {
  openai: {
    logoId: OPENAI_PROJECT_PROVIDER_ID,
    label: "OpenAI",
    keysUrl: "https://platform.openai.com/api-keys",
    placeholder: "sk-proj-…",
  },
  openrouter: {
    logoId: "openrouter",
    label: BYOK_PROVIDER_LABELS.openrouter,
    keysUrl: "https://openrouter.ai/settings/keys",
    placeholder: "sk-or-v1-…",
  },
  vercel: {
    logoId: "vercel",
    label: BYOK_PROVIDER_LABELS.vercel,
    keysUrl:
      "https://vercel.com/d?title=AI+Gateway+API+Keys&to=%2F%5Bteam%5D%2F~%2Fai-gateway%2Fapi-keys",
    placeholder: "vck_…",
  },
  grida: {
    logoId: GG_PROVIDER_ID,
    label: "Grida Gateway",
    keysUrl: "https://console.grida.co/_/ai-gateway",
    placeholder: `${DESKTOP_VOICE_GRIDA_KEY_PREFIX}…`,
  },
} as const satisfies Record<
  DesktopVoiceProvider,
  {
    logoId: keyof typeof BYOK_PROVIDER_LOGOS;
    label: string;
    keysUrl: string;
    placeholder: string;
  }
>;

const modelProviderIds: readonly string[] = voiceModel.provider_ids;
const voiceProviders = DESKTOP_VOICE_PROVIDERS.filter((id) =>
  modelProviderIds.includes(id)
);
const voiceProviderList = new Intl.ListFormat("en").format(
  voiceProviders.map((provider) => voiceProviderSetup[provider].label)
);

type LoadState =
  | { kind: "loading" | "unavailable" | "failed" }
  | { kind: "ready"; settings: DesktopVoiceSettings };
type Persist = (
  operation: () => Promise<DesktopVoiceSettings>
) => Promise<void>;

export function VoiceSettings() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const revision = useRef(0);
  const modelAction = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const initialRevision = revision.current;
    let active = true;
    const unsubscribe = voice.subscribe((settings) => {
      revision.current++;
      setState({ kind: "ready", settings });
    });
    void voice.getSettings().then(
      (settings) => {
        if (!active || revision.current !== initialRevision) return;
        setState(
          settings ? { kind: "ready", settings } : { kind: "unavailable" }
        );
      },
      () => {
        if (active && revision.current === initialRevision) {
          setState({ kind: "failed" });
        }
      }
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [loadAttempt]);

  const persist: Persist = async (operation) => {
    const initialRevision = revision.current;
    setPending(true);
    try {
      const settings = await operation();
      // A notification can arrive while the request is in flight.
      if (revision.current === initialRevision) {
        setState({ kind: "ready", settings });
      }
    } finally {
      setPending(false);
    }
  };

  async function changeSettings(patch: DesktopVoiceSettingsPatch) {
    setError(null);
    try {
      await persist(() => voice.updateSettings(patch));
    } catch {
      setError("Couldn’t save Voice settings. Try again.");
    }
  }

  function confirmDelete() {
    setDeleteError(null);
    setDeleteOpen(true);
  }

  async function deleteKey() {
    setDeleteError(null);
    try {
      await persist(voice.removeKey);
      setDeleteOpen(false);
    } catch {
      setDeleteError("Couldn’t delete the key. Try again.");
    }
  }

  return (
    <section className="space-y-5" data-testid="settings-voice">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Voice</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Dictate your prompts.
          </p>
        </div>
      </header>
      {state.kind === "loading" && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading Voice settings…
        </p>
      )}
      {state.kind === "unavailable" && (
        <p className="text-sm text-muted-foreground">
          Update Grida Desktop to configure Voice.
        </p>
      )}
      {state.kind === "failed" && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-destructive">
            Couldn’t load Voice settings.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setState({ kind: "loading" });
              setLoadAttempt((attempt) => attempt + 1);
            }}
          >
            Try again
          </Button>
        </div>
      )}
      {state.kind === "ready" && (
        <>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <section aria-labelledby="voice-general" className="space-y-2">
            <h3 id="voice-general" className="text-sm font-medium">
              General
            </h3>
            <div className="divide-y rounded-xl border">
              <MicrophoneSetting
                selection={state.settings.microphoneId}
                disabled={pending}
                onSelect={(microphoneId) =>
                  void changeSettings({ microphoneId })
                }
              />
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Label htmlFor="voice-language">Language</Label>
                  <p
                    id="voice-language-description"
                    className="mt-1 text-xs text-muted-foreground"
                  >
                    {state.settings.provider === "grida"
                      ? "Your selection is saved. Grida Gateway detects the language automatically."
                      : state.settings.language !== "auto" &&
                          !desktopVoiceLanguageHint(state.settings.language)
                        ? "Dictation uses auto-detect for this language."
                        : "The language you speak."}
                  </p>
                </div>
                <Select
                  value={state.settings.language}
                  onValueChange={(language) =>
                    void changeSettings({ language })
                  }
                  disabled={pending}
                >
                  <SelectTrigger
                    id="voice-language"
                    aria-describedby="voice-language-description"
                    size="sm"
                    className="min-w-40 max-w-[60%] shrink-0"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" align="end">
                    <SelectItem value="auto">Auto-detect</SelectItem>
                    {voiceLanguages.map(({ id, label }) => (
                      <SelectItem key={id} value={id}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>
          <SpeechModelSetting
            provider={state.settings.provider}
            useApiKey={state.settings.useApiKey}
            pending={pending}
            persist={persist}
            modelAction={modelAction}
            onUseApiKeyChange={(useApiKey) =>
              void changeSettings({ useApiKey })
            }
            onDelete={confirmDelete}
          />
          <VoiceDictionary
            entries={state.settings.dictionary}
            pending={pending}
            usesHints={state.settings.provider !== "grida"}
            onChange={(dictionary) =>
              persist(() => voice.updateSettings({ dictionary }))
            }
          />
        </>
      )}
      <AlertDialog
        open={deleteOpen}
        onOpenChange={(next) => !pending && setDeleteOpen(next)}
      >
        <AlertDialogContent
          size="sm"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            modelAction.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Voice API key?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes your saved key. To use dictation again, configure an
              API key.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => void deleteKey()}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function SpeechModelSetting({
  provider,
  useApiKey,
  pending,
  persist,
  modelAction,
  onUseApiKeyChange,
  onDelete,
}: {
  provider: DesktopVoiceProvider | null;
  useApiKey: boolean | undefined;
  pending: boolean;
  persist: Persist;
  modelAction: RefObject<HTMLButtonElement | null>;
  onUseApiKeyChange: (useApiKey: boolean) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<DesktopVoiceProvider>(
    voiceModel.reference_provider
  );
  const [error, setError] = useState<string | null>(null);
  const configuredSetup = provider ? voiceProviderSetup[provider] : undefined;
  const selectedSetup = voiceProviderSetup[selected];

  function changeOpen(next: boolean) {
    if (next) setSelected(voiceModel.reference_provider);
    setOpen(next);
    setError(null);
  }

  async function saveKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || provider) return;
    const form = event.currentTarget;
    const value = new FormData(form).get("key");
    const key = typeof value === "string" ? value.trim() : "";
    if (
      selected === "grida" &&
      !key.startsWith(DESKTOP_VOICE_GRIDA_KEY_PREFIX)
    ) {
      setError(
        `Enter a key that starts with “${DESKTOP_VOICE_GRIDA_KEY_PREFIX}”.`
      );
      return;
    }
    if (!key || key.length > 4096 || !/^[!-~]+$/.test(key)) {
      setError("Enter a valid API key.");
      return;
    }

    try {
      await persist(() => voice.saveKey(selected, key));
      form.reset();
      changeOpen(false);
    } catch (failure) {
      const code = failure instanceof Error ? failure.message : "";
      if (code.includes("voice_invalid_key")) {
        setError("Enter a valid API key.");
      } else if (code.includes("voice_provider_conflict")) {
        setError(
          "Delete the saved key before configuring a different provider."
        );
      } else {
        setError("Couldn’t save the key securely. Try again.");
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && changeOpen(next)}>
      <section aria-labelledby="voice-speech-model" className="space-y-2">
        <h3 id="voice-speech-model" className="text-sm font-medium">
          Speech model
        </h3>
        {!configuredSetup && (
          <p className="text-xs text-muted-foreground">
            Dictation requires your own API key. {voiceModel.label} is available
            through {voiceProviderList}.
          </p>
        )}
        <div className="divide-y rounded-xl border">
          {configuredSetup && useApiKey !== undefined && (
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Label htmlFor="voice-use-api-key">
                  Use API key for dictation
                </Label>
                <p
                  id="voice-use-api-key-description"
                  className="mt-1 text-xs text-muted-foreground"
                >
                  Your key stays saved when this is off.
                </p>
              </div>
              <Switch
                id="voice-use-api-key"
                aria-describedby="voice-use-api-key-description"
                checked={useApiKey}
                disabled={pending}
                onCheckedChange={onUseApiKeyChange}
              />
            </div>
          )}
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="flex min-w-0 items-start gap-3">
              <ModelVendorLogo vendor={voiceModel.vendor} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium">
                    {voiceModel.label}
                  </span>
                  {!configuredSetup && (
                    <ProviderLogos
                      providerIds={voiceProviders.map(
                        (id) => voiceProviderSetup[id].logoId
                      )}
                    />
                  )}
                </div>
                {configuredSetup && (
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <ProviderLogos providerIds={[configuredSetup.logoId]} />
                    <span>Configured with {configuredSetup.label}.</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {configuredSetup ? (
                <Button
                  ref={modelAction}
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-haspopup="dialog"
                  disabled={pending}
                  onClick={onDelete}
                >
                  Delete
                </Button>
              ) : (
                <DialogTrigger asChild>
                  <Button
                    ref={modelAction}
                    type="button"
                    size="sm"
                    disabled={pending}
                  >
                    Configure
                  </Button>
                </DialogTrigger>
              )}
            </div>
          </div>
        </div>
      </section>

      <DialogContent
        data-testid="voice-key-dialog"
        showCloseButton={!pending}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          modelAction.current?.focus();
        }}
      >
        <DialogHeader className="pr-6 text-left">
          <DialogTitle>Configure {voiceModel.label}</DialogTitle>
          <DialogDescription>
            Grida sends recordings to your selected provider for transcription.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup.Root
          aria-label="Voice provider"
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          value={selected}
          disabled={pending}
          onValueChange={(value) => {
            const provider = voiceProviders.find((id) => id === value);
            if (!provider) return;
            setSelected(provider);
            setError(null);
          }}
        >
          {voiceProviders.map((id) => {
            const setup = voiceProviderSetup[id];
            const Logo = BYOK_PROVIDER_LOGOS[setup.logoId];
            return (
              <RadioGroup.Item
                key={id}
                value={id}
                className="flex min-h-22 flex-col items-center justify-center gap-2 rounded-lg border px-1.5 py-2 text-center text-xs font-medium outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50 data-[state=checked]:border-foreground data-[state=checked]:bg-muted"
              >
                {Logo && (
                  <Logo
                    aria-hidden="true"
                    focusable="false"
                    className="size-8 shrink-0"
                  />
                )}
                <span>{setup.label}</span>
              </RadioGroup.Item>
            );
          })}
        </RadioGroup.Root>

        <form key={selected} className="space-y-4" onSubmit={saveKey}>
          <p className="text-sm text-muted-foreground">
            Create an API key in{" "}
            <a
              href={selectedSetup.keysUrl}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-4"
            >
              {selectedSetup.label}
            </a>
            . Then paste it below.
          </p>
          <div className="space-y-2">
            <Label htmlFor="voice-api-key">API key</Label>
            <Input
              id="voice-api-key"
              name="key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={selectedSetup.placeholder}
              disabled={pending}
              aria-invalid={error !== null}
              aria-describedby={error ? "voice-api-key-error" : undefined}
              onChange={() => setError(null)}
            />
            {error && (
              <p
                id="voice-api-key-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MicrophoneSetting({
  selection,
  disabled,
  onSelect,
}: {
  selection: string;
  disabled: boolean;
  onSelect: (value: string) => void;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const unavailableSelection =
    selection !== "default" &&
    !devices.some(({ deviceId }) => deviceId === selection);

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.enumerateDevices) return;

    let revision = 0;
    async function refresh() {
      const request = ++revision;
      const available = await mediaDevices.enumerateDevices().catch(() => null);
      if (request !== revision || !available) return;
      const microphones = available.filter(
        ({ kind, deviceId, label }) =>
          kind === "audioinput" &&
          label &&
          deviceId &&
          deviceId !== "default" &&
          deviceId !== "communications"
      );
      setDevices(microphones);
    }

    void refresh();
    mediaDevices.addEventListener("devicechange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      revision++;
      mediaDevices.removeEventListener("devicechange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <Label htmlFor="voice-input">Microphone</Label>
        <p
          id="voice-input-description"
          className="mt-1 text-xs text-muted-foreground"
        >
          Follows your system setting unless you choose a device.
        </p>
      </div>
      <Select value={selection} onValueChange={onSelect} disabled={disabled}>
        <SelectTrigger
          id="voice-input"
          aria-describedby="voice-input-description"
          size="sm"
          className="min-w-40 max-w-[60%] shrink-0"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="end">
          <SelectItem value="default">System default</SelectItem>
          {unavailableSelection && (
            <SelectItem value={selection} disabled>
              Previously selected microphone
            </SelectItem>
          )}
          {devices.map(({ deviceId, label }) => (
            <SelectItem key={deviceId} value={deviceId}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const DICTIONARY_CAPACITY = 200;
const DICTIONARY_WORD_LIMIT = 50;

function VoiceDictionary({
  entries,
  pending,
  usesHints,
  onChange,
}: {
  entries: string[];
  pending: boolean;
  usesHints: boolean;
  onChange: (entries: string[]) => Promise<void>;
}) {
  const [word, setWord] = useState("");
  const [query, setQuery] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const wordInput = useRef<HTMLInputElement>(null);
  const normalizedWord = word.trim().normalize("NFC");
  const tooLong = normalizedWord.length > DICTIONARY_WORD_LIMIT;
  const invalidCharacters = /[<>\r\n]/.test(normalizedWord);
  const duplicate = entries.some(
    (entry) => entry.toLowerCase() === normalizedWord.toLowerCase()
  );
  const wordError = tooLong
    ? `Use ${DICTIONARY_WORD_LIMIT} characters or fewer.`
    : invalidCharacters
      ? "Remove angle brackets or line breaks."
      : duplicate
        ? "This word is already in your dictionary."
        : null;
  const canAdd =
    !pending &&
    normalizedWord.length > 0 &&
    !wordError &&
    entries.length < DICTIONARY_CAPACITY;
  const search = query.trim().normalize("NFC").toLowerCase();
  const visibleEntries = entries.filter((entry) =>
    entry.toLowerCase().includes(search)
  );

  async function updateEntries(next: string[]) {
    setSaveError(null);
    try {
      await onChange(next);
      return true;
    } catch {
      setSaveError("Couldn’t save the dictionary. Try again.");
      return false;
    }
  }

  async function addEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAdd) return;
    wordInput.current?.focus();
    if (await updateEntries([...entries, normalizedWord])) {
      setWord("");
      if (entries.length === 0) setQuery("");
    }
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) return;
        setWord("");
        setQuery("");
        setSaveError(null);
      }}
    >
      <section
        aria-labelledby="voice-dictionary-heading"
        className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3"
      >
        <div>
          <h3 id="voice-dictionary-heading" className="text-sm font-medium">
            Voice dictionary
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {usesHints
              ? "Words or phrases dictation should recognize."
              : "Entries are saved for providers with dictionary support."}
          </p>
        </div>
        <DialogTrigger asChild>
          <Button type="button" size="sm" variant="outline" disabled={pending}>
            Manage
          </Button>
        </DialogTrigger>
      </section>
      <DialogContent
        data-testid="voice-dictionary-dialog"
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl"
      >
        <DialogHeader className="pr-6 text-left">
          <DialogTitle>Voice dictionary</DialogTitle>
          <DialogDescription>
            Add up to {DICTIONARY_CAPACITY} entries. Each can contain up to{" "}
            {DICTIONARY_WORD_LIMIT} characters after normalization. Some
            characters, including emoji, count as more than one.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={addEntry} className="space-y-2">
          <Label htmlFor="voice-dictionary-word">Add word</Label>
          <div className="flex items-center gap-2">
            <Input
              id="voice-dictionary-word"
              ref={wordInput}
              placeholder="Word or phrase to recognize"
              value={word}
              onChange={(event) => {
                setWord(event.currentTarget.value);
                setSaveError(null);
              }}
              readOnly={pending}
              aria-invalid={wordError !== null}
              aria-describedby={
                wordError ? "voice-dictionary-error" : undefined
              }
            />
            <Button type="submit" size="sm" disabled={!canAdd}>
              Add
            </Button>
          </div>
          {wordError && (
            <p id="voice-dictionary-error" className="text-xs text-destructive">
              {wordError}
            </p>
          )}
        </form>
        {saveError && (
          <p role="alert" className="text-sm text-destructive">
            {saveError}
          </p>
        )}
        {entries.length > 0 && (
          <section
            aria-labelledby="voice-dictionary-words"
            className="space-y-2"
          >
            <div className="flex items-center justify-between gap-4">
              <h3 id="voice-dictionary-words" className="text-sm font-medium">
                Words
              </h3>
              <p
                role="status"
                className="text-sm text-muted-foreground tabular-nums"
              >
                {entries.length}/{DICTIONARY_CAPACITY}
              </p>
            </div>
            <Input
              type="search"
              aria-label="Search dictionary"
              placeholder="Search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
            {visibleEntries.length > 0 ? (
              <ul
                aria-label="Dictionary entries"
                className="max-h-56 divide-y overflow-y-auto rounded-lg border"
              >
                {visibleEntries.map((entry) => (
                  <li
                    key={entry}
                    className="flex items-center justify-between gap-3 px-3 py-1.5"
                  >
                    <span className="min-w-0 text-sm wrap-anywhere">
                      {entry}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${entry}`}
                      disabled={pending}
                      onClick={() => {
                        wordInput.current?.focus();
                        void updateEntries(
                          entries.filter((word) => word !== entry)
                        );
                      }}
                    >
                      <Trash2Icon aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-1 py-2 text-sm text-muted-foreground">
                No matching words.
              </p>
            )}
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
