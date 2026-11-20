// GRIDA-SEC-004 / GRIDA-SEC-014 — Main owns drafts and default-selection intents.
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { NativeChatEffort, NativeChatSpeed } from "@grida/desktop-bridge";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_DRAFTS = 128;
const MAX_COMPLETED = 128;
const MAX_ACKNOWLEDGMENTS = 256;
const fileQueues = new Map<string, Promise<void>>();
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const PROFILE = /^[a-f0-9]{64}$/;
const MODEL = /^[A-Za-z0-9_.:@/-]{1,256}$/;
const EFFORTS = new Set(["low", "medium", "high", "xhigh", "ultra"]);

export namespace NativeChatSelections {
  export type Selection = Readonly<{
    connectionId: string | null;
    model: string;
    effort: NativeChatEffort;
    speed?: NativeChatSpeed;
  }>;
  export type Target = Readonly<{ sessionId: string } | { draftId: string }>;
  export type View = Readonly<{
    target: Target;
    revision: number;
    selection: Readonly<{
      profileId: string | null;
      modelId: string;
      effort: NativeChatEffort;
      speed?: NativeChatSpeed;
    }> | null;
    available: boolean;
  }>;
  export type Snapshot = {
    sessionId: string;
    revision: number;
    selection: Selection | null;
    legacy?: {
      model: string;
      effort: NativeChatEffort;
      principal: string | null;
      scope: string | null;
      matchesCurrent?: boolean;
    };
  };
  export type Receipt = {
    sessionId: string;
    operationId: string;
    revision: number;
    selection: Selection;
  };
  export type Operation = "inspect" | "update" | "receipt" | "ack";
  export type Options = {
    userDataPath: string;
    /** Resolve current configured identity without starting a worker. */
    choice(
      workspaceId: string,
      profileId: string | null
    ): Promise<{
      connectionId: string | null;
      model: string;
    }>;
    initial?(
      workspaceId: string
    ): Promise<{ connectionId: string | null; model: string; fixed?: true }>;
    /** Active native owner or a providerless metadata command, never a second writer. */
    query(
      workspaceId: string,
      sessionId: string,
      operation: Operation,
      body?: Record<string, unknown>
    ): Promise<unknown>;
    legacy?(
      workspaceId: string,
      value: NonNullable<Snapshot["legacy"]>
    ): Promise<Selection | null>;
  };
}

type Selection = NativeChatSelections.Selection;
type Draft = {
  workspaceId: string;
  revision: number;
  selection: Selection;
  operationId?: string;
  promotion?: { sessionId: string; requestId: string; firstInputId: string };
  welcome?: true;
};
type Intent = {
  preserveDefault?: true;
  workspaceId: string;
  sessionId: string;
  expectedRevision: number;
  operationId: string;
  selection: Selection;
};
type State = {
  version: 1;
  defaults: Selection | null;
  drafts: Record<string, Draft>;
  current: Record<string, string>;
  pending: Intent | null;
  /** Finalized native outcomes still needing their cleanup acknowledgment. */
  acknowledgments: {
    workspaceId: string;
    sessionId: string;
    operationId: string;
  }[];
  /** Bounded completed promotions; native retirement remains authoritative. */
  completed?: string[];
};

/** Durable UI intent; native sessions remain the owner of saved-chat settings. */
export class NativeChatSelections {
  private queue: Promise<void> = Promise.resolve();
  private readonly creatingWelcome = new Set<string>();
  private unsynced = false;
  private confirmedDefaults: Selection | null;
  private constructor(
    private readonly options: NativeChatSelections.Options,
    private readonly filename: string,
    private state: State,
    private persisted: string | null
  ) {
    this.confirmedDefaults = state.defaults;
  }

  static async open(
    options: NativeChatSelections.Options
  ): Promise<NativeChatSelections> {
    const directory = await fs.realpath(options.userDataPath);
    await safeDirectory(directory);
    const filename = path.join(directory, "chat-selections.json");
    const bytes = await readPrivate(filename);
    let state: State = {
      version: 1,
      defaults: null,
      drafts: {},
      current: {},
      pending: null,
      acknowledgments: [],
    };
    if (bytes !== null) {
      try {
        state = parseState(JSON.parse(bytes));
      } catch {
        throw new Error("native_chat_selection_storage_invalid");
      }
    }
    if (bytes !== null) await syncDirectory(directory);
    return new NativeChatSelections(options, filename, state, bytes);
  }

  /** A snapshot only; opening Welcome never mutates the default preference. */
  readDefaults(): Selection | null {
    return this.confirmedDefaults && { ...this.confirmedDefaults };
  }

  read(
    workspaceId: string,
    sessionId: string | null,
    draftId?: string,
    check: () => void = () => {}
  ): Promise<NativeChatSelections.View> {
    return this.exclusive(async () => {
      check();
      workspace(workspaceId);
      if (sessionId !== null) {
        sessionIdentity(sessionId);
        const snapshot = readSnapshot(
          await this.options.query(workspaceId, sessionId, "inspect"),
          sessionId
        );
        const selected =
          snapshot.selection ??
          (snapshot.legacy && this.options.legacy
            ? await this.options.legacy(workspaceId, snapshot.legacy)
            : null);
        return this.view(
          workspaceId,
          { sessionId },
          snapshot.revision,
          selected
        );
      }
      let id =
        draftId ??
        (Object.hasOwn(this.state.current, workspaceId)
          ? this.state.current[workspaceId]
          : undefined);
      if (id !== undefined) identity(id);
      let draft = id ? this.state.drafts[id] : undefined;
      if (draft && draft.workspaceId !== workspaceId) throw invalid();
      if (!draft) {
        if (
          Object.keys(this.state.drafts).length -
            (this.state.completed?.length ?? 0) >=
          MAX_DRAFTS
        )
          throw new Error("native_chat_draft_limit");
        id ??= randomUUID();
        const initial = await this.options.initial?.(workspaceId);
        const route =
          initial ??
          (await (this.state.defaults
            ? Promise.resolve(this.state.defaults)
            : this.options.choice(workspaceId, null)));
        const selected = initial?.fixed
          ? {
              connectionId: initial.connectionId,
              model: initial.model,
              effort: this.state.defaults?.effort ?? ("medium" as const),
            }
          : (this.state.defaults ?? {
              connectionId: route.connectionId,
              model: route.model,
              effort: "medium" as const,
            });
        draft = { workspaceId, revision: 1, selection: { ...selected } };
        check();
        await this.save({
          ...this.state,
          drafts: { ...this.state.drafts, [id]: draft },
          current: { ...this.state.current, [workspaceId]: id },
        });
      }
      return this.view(
        workspaceId,
        { draftId: id! },
        draft.revision,
        draft.selection
      );
    });
  }

  update(
    workspaceId: string,
    target: NativeChatSelections.Target,
    expectedRevision: number,
    operationId: string,
    choice: {
      profileId: string | null;
      effort: NativeChatEffort;
      speed?: NativeChatSpeed;
    },
    check: () => void = () => {}
  ): Promise<NativeChatSelections.View> {
    return this.exclusive(async () => {
      check();
      workspace(workspaceId);
      identity(operationId);
      advancingRevision(expectedRevision);
      validateTarget(target);
      profile(choice.profileId);
      const chosenEffort =
        choice.effort === "standard" ? "medium" : choice.effort;
      effort(chosenEffort);
      await this.recoverPending();
      const pair = {
        ...(await this.options.choice(workspaceId, choice.profileId)),
        effort: chosenEffort,
      };
      if (choice.speed !== undefined) validateSpeed(choice.speed);
      const selectedWithSpeed = (previous: Selection | null): Selection => {
        const speed = choice.speed ?? previous?.speed;
        return { ...pair, ...(speed && speed !== "standard" && { speed }) };
      };
      check();
      if (pair.connectionId !== choice.profileId) throw invalid();
      if ("draftId" in target) {
        identity(target.draftId);
        const old = this.state.drafts[target.draftId];
        if (!old || old.workspaceId !== workspaceId) throw invalid();
        const selected = selectedWithSpeed(old.selection);
        selection(selected);
        if (old.promotion)
          throw new Error("native_chat_draft_creation_pending");
        if (old.operationId === operationId) {
          if (
            old.revision !== expectedRevision + 1 ||
            !same(old.selection, selected)
          )
            throw invalid();
          return this.view(workspaceId, target, old.revision, old.selection);
        }
        if (old.revision !== expectedRevision) throw conflict();
        const next = {
          ...old,
          revision: old.revision + 1,
          selection: selected,
          operationId,
        };
        await this.save({
          ...this.state,
          defaults: speedOnly(old.selection, selected)
            ? this.state.defaults
            : pair,
          drafts: { ...this.state.drafts, [target.draftId]: next },
        });
        return this.view(workspaceId, target, next.revision, selected);
      }
      sessionIdentity(target.sessionId);
      // An operation already committed before this invocation is an observation,
      // not another explicit edit. It must not become the newest app default.
      const old = record(
        await this.options.query(workspaceId, target.sessionId, "receipt", {
          operationId,
        })
      );
      if (old.status === "retired")
        throw new Error("native_chat_selection_retired");
      const head = readSnapshot(
        await this.options.query(workspaceId, target.sessionId, "inspect"),
        target.sessionId
      );
      const selected = selectedWithSpeed(head.selection);
      selection(selected);
      const pending: Intent = {
        workspaceId,
        sessionId: target.sessionId,
        expectedRevision,
        operationId,
        selection: selected,
        ...(head.selection &&
          speedOnly(head.selection, selected) && { preserveDefault: true }),
      };
      if (old.status === "committed") {
        const receipt = readReceipt(old.receipt, pending);
        if (
          head.revision !== receipt.revision ||
          !head.selection ||
          !same(head.selection, selected)
        )
          throw conflict();
        return this.view(workspaceId, target, head.revision, head.selection);
      }
      if (old.status !== "missing") throw invalid();
      this.requireReceiptCapacity();
      check();
      await this.save({ ...this.state, pending });
      const committed = await this.recoverPending();
      if (!committed || committed.operationId !== operationId)
        throw new Error("native_chat_selection_retired");
      return this.view(
        workspaceId,
        target,
        committed.revision,
        committed.selection
      );
    });
  }

  /** Persist stable creation and first-input identities before creating a session. */
  prepareNewChat(
    workspaceId: string,
    draftId: string,
    choice: { profileId: string | null; effort: NativeChatEffort },
    check: () => void
  ) {
    return this.exclusive(async () => {
      check();
      workspace(workspaceId);
      identity(draftId);
      profile(choice.profileId);
      const chosenEffort =
        choice.effort === "standard" ? "medium" : choice.effort;
      effort(chosenEffort);
      await this.recoverPending();
      await this.recoverWelcomeCreations();
      this.requireReceiptCapacity();
      if (this.state.drafts[draftId]) throw invalid();
      if (
        Object.keys(this.state.drafts).length -
          (this.state.completed?.length ?? 0) >=
        MAX_DRAFTS
      )
        throw new Error("native_chat_draft_limit");
      const selected = {
        ...(await this.options.choice(workspaceId, choice.profileId)),
        effort: chosenEffort,
      };
      selection(selected);
      if (selected.connectionId !== choice.profileId) throw invalid();
      const promotion = chatCreation(draftId);
      check();
      await this.save({
        ...this.state,
        defaults: selected,
        drafts: {
          ...this.state.drafts,
          [draftId]: {
            workspaceId,
            revision: 1,
            selection: selected,
            promotion,
            welcome: true,
          },
        },
      });
      this.creatingWelcome.add(draftId);
      return { ...promotion, selection: selected };
    });
  }

  /** Persist stable creation and first-input identities before creating a session. */
  prepareCreation(
    workspaceId: string,
    draftId: string,
    check: () => void = () => {}
  ): Promise<{
    sessionId: string;
    requestId: string;
    firstInputId: string;
    selection: Selection;
  }> {
    return this.exclusive(async () => {
      check();
      workspace(workspaceId);
      identity(draftId);
      const draft = this.state.drafts[draftId];
      if (!draft || draft.workspaceId !== workspaceId || draft.welcome)
        throw invalid();
      if (!draft.promotion) {
        await this.recoverPending();
        this.requireReceiptCapacity();
        const current = await this.options.choice(
          workspaceId,
          draft.selection.connectionId
        );
        if (
          current.connectionId !== draft.selection.connectionId ||
          current.model !== draft.selection.model
        )
          throw new Error("native_chat_selection_unavailable");
        const promotion = chatCreation(draftId);
        check();
        await this.save({
          ...this.state,
          drafts: { ...this.state.drafts, [draftId]: { ...draft, promotion } },
        });
      }
      return {
        ...this.state.drafts[draftId].promotion!,
        selection: { ...draft.selection },
      };
    });
  }

  finishCreation(workspaceId: string, draftId: string): Promise<void> {
    return this.exclusive(async () => {
      workspace(workspaceId);
      identity(draftId);
      await this.completeCreation(workspaceId, draftId);
      await this.acknowledge();
    }).finally(() => this.creatingWelcome.delete(draftId));
  }

  /** Safe at startup or before another explicit mutation; never starts a model. */
  recover(): Promise<void> {
    return this.exclusive(async () => {
      await this.recoverPending();
      await this.recoverWelcomeCreations();
    });
  }

  private async recoverWelcomeCreations(): Promise<void> {
    const abandoned = Object.entries(this.state.drafts).filter(
      ([id, draft]) =>
        draft.welcome &&
        !this.creatingWelcome.has(id) &&
        !this.state.completed?.includes(id)
    );
    // A Welcome review cannot survive its owner. Release abandoned draft slots
    // and settle the original receipts, without creating or granting a session.
    for (const [id, draft] of abandoned)
      await this.completeCreation(draft.workspaceId, id);
    if (abandoned.length) await this.acknowledge();
  }

  private async completeCreation(workspaceId: string, draftId: string) {
    const draft = this.state.drafts[draftId];
    if (!draft || draft.workspaceId !== workspaceId || !draft.promotion)
      throw invalid();
    const completed = this.state.completed ?? [];
    if (completed.includes(draftId)) return;
    // Keep the stable receipt for a lost response. A subsequent blank chat
    // gets a fresh identity rather than reusing the promoted draft.
    const current = { ...this.state.current };
    if (current[workspaceId] === draftId) delete current[workspaceId];
    const next = [...completed, draftId];
    const drafts = { ...this.state.drafts };
    for (const evicted of next.splice(
      0,
      Math.max(0, next.length - MAX_COMPLETED)
    ))
      delete drafts[evicted];
    await this.save({
      ...this.state,
      current,
      drafts,
      completed: next,
      acknowledgments: addAcknowledgment(this.state.acknowledgments, {
        workspaceId,
        sessionId: draft.promotion.sessionId,
        operationId: draft.promotion.requestId,
      }),
    });
  }

  private async recoverPending(): Promise<NativeChatSelections.Receipt | null> {
    const pending = this.state.pending;
    if (pending) {
      const { workspaceId, sessionId, operationId } = pending;
      let outcome: Record<string, unknown>;
      try {
        outcome = record(
          await this.options.query(workspaceId, sessionId, "receipt", {
            operationId,
          })
        );
      } catch (error) {
        if (!retired(error)) throw error;
        await this.cancelPending(pending);
        return null;
      }
      if (outcome.status === "retired") {
        await this.cancelPending(pending);
        return null;
      }
      let committed: NativeChatSelections.Receipt;
      if (outcome.status === "committed")
        committed = readReceipt(outcome.receipt, pending);
      else if (outcome.status === "missing") {
        try {
          committed = readReceipt(
            await this.options.query(workspaceId, sessionId, "update", {
              expectedRevision: pending.expectedRevision,
              operationId,
              selection: pending.selection,
            }),
            pending
          );
        } catch (error) {
          // Only a definitive conflict/retirement cancels the durable intent.
          // Timeout/unknown outcome remains recoverable with this exact ID.
          if (terminal(error)) {
            await this.save({ ...this.state, pending: null });
          }
          throw error;
        }
      } else throw invalid();
      // An older outcome proves that operation committed, not that it is the
      // current selection. Another client may have superseded it while Main
      // was disconnected. It cannot become a new app-default edit on recovery.
      let head: NativeChatSelections.Snapshot;
      try {
        head = readSnapshot(
          await this.options.query(workspaceId, sessionId, "inspect"),
          sessionId
        );
      } catch (error) {
        if (!retired(error)) throw error;
        await this.cancelPending(pending);
        return null;
      }
      if (
        head.revision !== committed.revision ||
        !head.selection ||
        !same(head.selection, committed.selection)
      ) {
        await this.cancelPending(pending);
        throw conflict();
      }
      await this.save({
        ...this.state,
        defaults: pending.preserveDefault
          ? this.state.defaults
          : defaultPair(committed.selection),
        pending: null,
        acknowledgments: addAcknowledgment(this.state.acknowledgments, {
          workspaceId,
          sessionId,
          operationId,
        }),
      });
      // Cleanup failure cannot roll back a finalized pair. Keep its ack intent
      // for recovery; it never reapplies an old selection or default.
      await this.acknowledge();
      return committed;
    }
    await this.acknowledge();
    return null;
  }

  private async cancelPending(pending: Intent): Promise<void> {
    const { workspaceId, sessionId, operationId } = pending;
    await this.save({
      ...this.state,
      pending: null,
      acknowledgments: addAcknowledgment(this.state.acknowledgments, {
        workspaceId,
        sessionId,
        operationId,
      }),
    });
    await this.acknowledge();
  }

  private requireReceiptCapacity(): void {
    const completed = new Set(this.state.completed);
    const promotions = Object.entries(this.state.drafts).filter(
      ([id, draft]) => draft.promotion && !completed.has(id)
    ).length;
    if (this.state.acknowledgments.length + promotions >= MAX_ACKNOWLEDGMENTS)
      throw new Error("native_chat_selection_receipt_limit");
  }

  private async acknowledge(): Promise<void> {
    for (const item of this.state.acknowledgments) {
      try {
        await this.options.query(item.workspaceId, item.sessionId, "ack", {
          operationId: item.operationId,
        });
      } catch {
        continue;
      }
      await this.save({
        ...this.state,
        acknowledgments: this.state.acknowledgments.filter(
          (candidate) => candidate !== item
        ),
      });
    }
  }

  private async view(
    workspaceId: string,
    target: NativeChatSelections.Target,
    revision: number,
    selected: Selection | null
  ): Promise<NativeChatSelections.View> {
    let available = false;
    if (selected) {
      const current = await this.options
        .choice(workspaceId, selected.connectionId)
        .catch(() => null);
      available =
        current?.connectionId === selected.connectionId &&
        current.model === selected.model;
    }
    return {
      target,
      revision,
      selection: selected && {
        profileId: selected.connectionId,
        modelId: selected.model,
        effort: selected.effort,
        ...(selected.speed && { speed: selected.speed }),
      },
      available,
    };
  }

  private async save(next: State): Promise<void> {
    parseState(next);
    const text = `${JSON.stringify(next)}\n`;
    if (Buffer.byteLength(text) > MAX_BYTES) throw invalid();
    await this.requireCurrent();
    await durableWrite(
      this.filename,
      text,
      () => this.requireCurrent(),
      () => {
        // Rename may have succeeded even if the following directory sync fails.
        // Retain the exact published state, and require its durability before
        // another native mutation or acknowledgment is allowed.
        this.persisted = text;
        this.state = next;
        this.unsynced = true;
      }
    );
    this.unsynced = false;
    this.confirmedDefaults = next.defaults;
  }

  private async requireCurrent(): Promise<void> {
    if ((await readPrivate(this.filename)) !== this.persisted)
      throw new Error("native_chat_selection_storage_changed");
  }

  private exclusive<T>(run: () => Promise<T>): Promise<T> {
    const result = this.queue.then(() =>
      fileExclusive(this.filename, async () => {
        await this.requireCurrent();
        if (this.unsynced) {
          await syncDirectory(path.dirname(this.filename));
          this.unsynced = false;
          this.confirmedDefaults = this.state.defaults;
        }
        return run();
      })
    );
    this.queue = result.then(
      () => {},
      () => {}
    );
    return result;
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid();
  return value as Record<string, unknown>;
}
function keys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = []
): void {
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some(
      (key) => !required.includes(key) && !optional.includes(key)
    )
  )
    throw invalid();
}
function identity(value: unknown): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) throw invalid();
}
function sessionIdentity(value: unknown): asserts value is string {
  if (typeof value !== "string" || !MODEL.test(value)) throw invalid();
}
function validateTarget(
  value: unknown
): asserts value is NativeChatSelections.Target {
  const target = record(value);
  if (Object.keys(target).length !== 1) throw invalid();
  if (Object.hasOwn(target, "sessionId")) sessionIdentity(target.sessionId);
  else identity(target.draftId);
}
function workspace(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value))
    throw invalid();
}
function revision(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw invalid();
}
function advancingRevision(value: unknown): asserts value is number {
  revision(value);
  if (value === Number.MAX_SAFE_INTEGER) throw invalid();
}
function profile(value: unknown): asserts value is string | null {
  if (value !== null && (typeof value !== "string" || !PROFILE.test(value)))
    throw invalid();
}
function effort(value: unknown): asserts value is NativeChatEffort {
  if (!EFFORTS.has(value as string)) throw invalid();
}
function selection(value: unknown): asserts value is Selection {
  const v = record(value);
  profile(v.connectionId);
  effort(v.effort);
  if (v.speed !== undefined) validateSpeed(v.speed);
  if (
    typeof v.model !== "string" ||
    !MODEL.test(v.model) ||
    Object.keys(v).length !== 3 + Number(v.speed !== undefined)
  )
    throw invalid();
}
export function validateSpeed(
  value: unknown
): asserts value is NativeChatSpeed {
  if (value !== "standard" && value !== "fast" && value !== "ultrafast")
    throw invalid();
}
function defaultPair({ connectionId, model, effort }: Selection): Selection {
  return { connectionId, model, effort };
}
function speedOnly(a: Selection, b: Selection): boolean {
  return samePair(a, b) && (a.speed ?? "standard") !== (b.speed ?? "standard");
}
function same(a: Selection, b: Selection): boolean {
  return samePair(a, b) && (a.speed ?? "standard") === (b.speed ?? "standard");
}
function samePair(a: Selection, b: Selection): boolean {
  return (
    a.connectionId === b.connectionId &&
    a.model === b.model &&
    a.effort === b.effort
  );
}
function readSnapshot(
  value: unknown,
  sessionId: string
): NativeChatSelections.Snapshot {
  const v = record(value);
  revision(v.revision);
  keys(v, ["sessionId", "revision", "selection"], ["legacy"]);
  if (v.sessionId !== sessionId) throw invalid();
  if (v.selection !== null) selection(v.selection);
  if ((v.revision === 0) !== (v.selection === null)) throw invalid();
  if (v.legacy !== undefined) {
    const legacy = record(v.legacy);
    keys(legacy, ["model", "effort", "principal", "scope"], ["matchesCurrent"]);
    if (typeof legacy.model !== "string" || !MODEL.test(legacy.model))
      throw invalid();
    effort(legacy.effort);
    for (const name of ["principal", "scope"])
      if (
        legacy[name] !== null &&
        (typeof legacy[name] !== "string" || !MODEL.test(legacy[name]))
      )
        throw invalid();
    if (
      legacy.matchesCurrent !== undefined &&
      typeof legacy.matchesCurrent !== "boolean"
    )
      throw invalid();
  }
  return v as NativeChatSelections.Snapshot;
}
function readReceipt(
  value: unknown,
  intent: Intent
): NativeChatSelections.Receipt {
  const v = record(value);
  revision(v.revision);
  selection(v.selection);
  keys(v, ["sessionId", "operationId", "revision", "selection"]);
  if (
    v.sessionId !== intent.sessionId ||
    v.operationId !== intent.operationId ||
    v.revision !== intent.expectedRevision + 1 ||
    !same(v.selection, intent.selection)
  )
    throw invalid();
  return v as NativeChatSelections.Receipt;
}
function parseState(value: unknown): State {
  const v = record(value);
  keys(
    v,
    ["version", "defaults", "drafts", "current", "pending", "acknowledgments"],
    ["completed"]
  );
  if (v.version !== 1) throw invalid();
  if (v.defaults !== null) selection(v.defaults);
  const drafts = record(v.drafts),
    current = record(v.current);
  const completed = v.completed ?? [];
  if (
    !Array.isArray(completed) ||
    completed.length > MAX_COMPLETED ||
    new Set(completed).size !== completed.length ||
    Object.keys(drafts).length - completed.length > MAX_DRAFTS
  )
    throw invalid();
  for (const [id, raw] of Object.entries(drafts)) {
    identity(id);
    const draft = record(raw);
    workspace(draft.workspaceId);
    revision(draft.revision);
    selection(draft.selection);
    keys(
      draft,
      ["workspaceId", "revision", "selection"],
      ["operationId", "promotion", "welcome"]
    );
    if (draft.revision === 0) throw invalid();
    if (
      draft.welcome !== undefined &&
      (draft.welcome !== true || !draft.promotion)
    )
      throw invalid();
    if (draft.operationId !== undefined) identity(draft.operationId);
    if (draft.promotion !== undefined) {
      const promotion = record(draft.promotion);
      keys(promotion, ["sessionId", "requestId", "firstInputId"]);
      sessionIdentity(promotion.sessionId);
      identity(promotion.requestId);
      identity(promotion.firstInputId);
    }
  }
  for (const id of completed) {
    identity(id);
    if (!record(drafts[id]).promotion) throw invalid();
  }
  for (const [key, id] of Object.entries(current)) {
    workspace(key);
    identity(id);
    if (completed.includes(id) || record(drafts[id]).workspaceId !== key)
      throw invalid();
  }
  if (v.pending !== null) {
    const p = record(v.pending);
    workspace(p.workspaceId);
    sessionIdentity(p.sessionId);
    identity(p.operationId);
    advancingRevision(p.expectedRevision);
    selection(p.selection);
    if (p.preserveDefault !== undefined && p.preserveDefault !== true)
      throw invalid();
    keys(
      p,
      [
        "workspaceId",
        "sessionId",
        "expectedRevision",
        "operationId",
        "selection",
      ],
      ["preserveDefault"]
    );
  }
  if (
    !Array.isArray(v.acknowledgments) ||
    v.acknowledgments.length > MAX_ACKNOWLEDGMENTS
  )
    throw invalid();
  for (const raw of v.acknowledgments) {
    const a = record(raw);
    workspace(a.workspaceId);
    sessionIdentity(a.sessionId);
    identity(a.operationId);
    keys(a, ["workspaceId", "sessionId", "operationId"]);
  }
  return v as unknown as State;
}
function creationIdentity(
  draftId: string,
  purpose: "session" | "request" | "input"
): string {
  const bytes = createHash("sha256")
    .update(`grida.desktop.chat-draft.v1\0${draftId}\0${purpose}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function chatCreation(draftId: string) {
  return {
    sessionId: creationIdentity(draftId, "session"),
    requestId: creationIdentity(draftId, "request"),
    firstInputId: creationIdentity(draftId, "input"),
  };
}
function addAcknowledgment(
  items: State["acknowledgments"],
  item: State["acknowledgments"][number]
): State["acknowledgments"] {
  if (
    items.some(
      (old) =>
        old.workspaceId === item.workspaceId &&
        old.sessionId === item.sessionId &&
        old.operationId === item.operationId
    )
  )
    return items;
  if (items.length >= MAX_ACKNOWLEDGMENTS)
    throw new Error("native_chat_selection_receipt_limit");
  return [...items, item];
}
function retired(error: unknown): boolean {
  return (
    error instanceof Error &&
    /(?:selection_retired|session_missing|session_identity_retired)\b/.test(
      error.message
    )
  );
}
function terminal(error: unknown): boolean {
  return (
    retired(error) ||
    (error instanceof Error &&
      /selection_(?:revision_changed|conflict|invalid|operation_reused|receipt_limit)\b/.test(
        error.message
      ))
  );
}
function fileExclusive<T>(filename: string, run: () => Promise<T>): Promise<T> {
  const result = (fileQueues.get(filename) ?? Promise.resolve()).then(run);
  const settled = result.then(
    () => {},
    () => {}
  );
  fileQueues.set(filename, settled);
  void settled.then(() => {
    if (fileQueues.get(filename) === settled) fileQueues.delete(filename);
  });
  return result;
}
async function safeDirectory(directory: string): Promise<void> {
  const stat = await fs.lstat(directory);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    (stat.mode & 0o022) !== 0 ||
    (process.getuid && stat.uid !== process.getuid())
  )
    throw invalid();
}
async function syncDirectory(directory: string): Promise<void> {
  await safeDirectory(directory);
  const handle = await fs.open(
    directory,
    constants.O_RDONLY | constants.O_NOFOLLOW | (constants.O_DIRECTORY ?? 0)
  );
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
async function durableWrite(
  filename: string,
  text: string,
  beforePublish: () => Promise<void>,
  published: () => void
): Promise<void> {
  const directory = path.dirname(filename);
  await safeDirectory(directory);
  const temporary = path.join(
    directory,
    `.chat-selections-${randomUUID()}.tmp`
  );
  let handle;
  let renamed = false;
  try {
    handle = await fs.open(
      temporary,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600
    );
    await handle.writeFile(text, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await beforePublish();
    await fs.rename(temporary, filename);
    renamed = true;
    published();
    await syncDirectory(directory);
  } finally {
    await handle?.close();
    if (!renamed) await fs.unlink(temporary).catch(() => {});
  }
}
async function readPrivate(filename: string): Promise<string | null> {
  let before;
  try {
    before = await fs.lstat(filename);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw invalid();
  }
  if (!before.isFile() || before.isSymbolicLink()) throw invalid();
  let handle;
  try {
    handle = await fs.open(
      filename,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw invalid();
  }
  try {
    const stat = await handle.stat();
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      stat.size > MAX_BYTES ||
      (stat.mode & 0o077) !== 0 ||
      (process.getuid && stat.uid !== process.getuid()) ||
      stat.dev !== before.dev ||
      stat.ino !== before.ino
    )
      throw invalid();
    const bytes = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await handle.read(
        bytes,
        length,
        bytes.length - length,
        length
      );
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    const current = await fs.lstat(filename);
    const after = await handle.stat();
    if (
      length !== stat.size ||
      current.dev !== stat.dev ||
      current.ino !== stat.ino ||
      after.size !== stat.size ||
      after.mtimeMs !== stat.mtimeMs
    )
      throw invalid();
    return new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(0, length)
    );
  } catch {
    throw invalid();
  } finally {
    await handle.close();
  }
}
function invalid(): Error {
  return new Error("native_chat_selection_invalid");
}
function conflict(): Error {
  return new Error("native_chat_selection_revision_changed");
}
