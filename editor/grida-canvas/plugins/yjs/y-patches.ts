import { applyPatches, enablePatches, Patch, produceWithPatches } from "immer";
import * as Y from "yjs";
import assert from "assert";

enablePatches();

export type JSONValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | JSONObject
  | JSONArray;
export type JSONObject = { [key: string]: JSONValue };
export type JSONArray = JSONValue[];

function isJSONObject(value: unknown): value is JSONObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJSONArray(value: unknown): value is JSONArray {
  return Array.isArray(value);
}

function toPlainValue(value: any): JSONValue {
  if (value instanceof Y.Map || value instanceof Y.Array) {
    return value.toJSON();
  }
  return value as JSONValue;
}

function toYDataType(value: JSONValue): any {
  if (value === undefined) {
    return null;
  }
  if (isJSONArray(value)) {
    const arr = new Y.Array();
    arr.push(value.map(toYDataType));
    return arr;
  }
  if (isJSONObject(value)) {
    const map = new Y.Map();
    for (const [k, v] of Object.entries(value)) {
      map.set(k, toYDataType(v));
    }
    return map;
  }
  return value;
}

/**
 * Ensures a Yjs container exists at the given key, creating it if necessary.
 * Uses `nextKey` to determine whether to create a Y.Map (string key) or Y.Array (number key).
 */
function ensureContainer(
  base: Y.Map<any> | Y.Array<any>,
  key: string | number,
  nextKey: string | number | undefined
): Y.Map<any> | Y.Array<any> {
  if (base instanceof Y.Map && typeof key === "string") {
    const value = base.get(key);
    if (value instanceof Y.AbstractType) {
      return value as Y.Map<any> | Y.Array<any>;
    }
    if (value === undefined) {
      const created = typeof nextKey === "number" ? new Y.Array() : new Y.Map();
      base.set(key, created);
      return created;
    }
    if (value === null) {
      const created = typeof nextKey === "number" ? new Y.Array() : new Y.Map();
      base.set(key, created);
      return created;
    }
    const created = toYDataType(value as JSONValue);
    base.set(key, created);
    return created as Y.Map<any> | Y.Array<any>;
  }

  if (base instanceof Y.Array && typeof key === "number") {
    const value = base.get(key);
    if (value instanceof Y.AbstractType) {
      return value as Y.Map<any> | Y.Array<any>;
    }
    if (value === undefined || value === null) {
      const created = typeof nextKey === "number" ? new Y.Array() : new Y.Map();
      if (key >= base.length) {
        base.insert(key, [created]);
      } else {
        base.delete(key);
        base.insert(key, [created]);
      }
      return created;
    }
    const created = toYDataType(value as JSONValue);
    base.delete(key);
    base.insert(key, [created]);
    return created as Y.Map<any> | Y.Array<any>;
  }

  assert.fail("Unsupported container traversal");
}

export function applyPatchToTarget(
  target: Y.Map<any> | Y.Array<any>,
  patch: Patch
) {
  const { op, path, value } = patch;

  if (!path.length) {
    assert.strictEqual(op, "replace", "Root level patch must be replace");

    if (target instanceof Y.Map && isJSONObject(value)) {
      target.clear();
      for (const [k, v] of Object.entries(value)) {
        target.set(k, toYDataType(v));
      }
      return;
    }

    if (target instanceof Y.Array && isJSONArray(value)) {
      target.delete(0, target.length);
      target.insert(0, value.map(toYDataType));
      return;
    }

    assert.fail("Unsupported root patch value");
  }

  let base: Y.Map<any> | Y.Array<any> = target;
  for (let i = 0; i < path.length - 1; i++) {
    const step = path[i];
    const nextKey = path[i + 1];
    if (base instanceof Y.Map && typeof step === "string") {
      const nextValue = base.get(step);
      if (nextValue instanceof Y.AbstractType) {
        base = nextValue as Y.Map<any> | Y.Array<any>;
        continue;
      }
      if (nextValue === undefined || nextValue === null) {
        base = ensureContainer(base, step, nextKey);
        continue;
      }
      if (isJSONObject(nextValue) || isJSONArray(nextValue)) {
        const created = toYDataType(nextValue as JSONValue);
        base.set(step, created);
        base = created as Y.Map<any> | Y.Array<any>;
        continue;
      }
      assert.fail("Cannot traverse primitive value");
    } else if (base instanceof Y.Array && typeof step === "number") {
      const nextValue = base.get(step);
      if (nextValue instanceof Y.AbstractType) {
        base = nextValue as Y.Map<any> | Y.Array<any>;
        continue;
      }
      if (nextValue === undefined || nextValue === null) {
        base = ensureContainer(base, step, nextKey);
        continue;
      }
      if (isJSONObject(nextValue) || isJSONArray(nextValue)) {
        const created = toYDataType(nextValue as JSONValue);
        base.delete(step);
        base.insert(step, [created]);
        base = created as Y.Map<any> | Y.Array<any>;
        continue;
      }
      assert.fail("Cannot traverse primitive value");
    } else {
      assert.fail("Unsupported traversal path");
    }
  }

  const property = path[path.length - 1];

  if (base instanceof Y.Map && typeof property === "string") {
    switch (op) {
      case "add":
      case "replace":
        base.set(property, toYDataType(value as JSONValue));
        break;
      case "remove":
        base.delete(property);
        break;
    }
    return;
  }

  if (base instanceof Y.Array && typeof property === "number") {
    switch (op) {
      case "add":
        base.insert(property, [toYDataType(value as JSONValue)]);
        break;
      case "replace":
        base.delete(property);
        base.insert(property, [toYDataType(value as JSONValue)]);
        break;
      case "remove":
        base.delete(property);
        break;
    }
    return;
  }

  if (base instanceof Y.Array && property === "length") {
    if (typeof value === "number" && value < base.length) {
      base.delete(value, base.length - value);
    }
    return;
  }

  assert.fail("Unsupported patch application");
}

function applyYEvent(base: any, event: Y.YEvent<any>) {
  if (event instanceof Y.YMapEvent && isJSONObject(base)) {
    const source = event.target as Y.Map<any>;
    event.changes.keys.forEach((change, key) => {
      switch (change.action) {
        case "add":
        case "update":
          base[key] = toPlainValue(source.get(key));
          break;
        case "delete":
          delete base[key];
          break;
      }
    });
  } else if (event instanceof Y.YArrayEvent && isJSONArray(base)) {
    const arr = base as any[];
    let retain = 0;
    event.changes.delta.forEach((change) => {
      if (change.retain) {
        retain += change.retain;
      }
      if (change.delete) {
        arr.splice(retain, change.delete);
      }
      if (change.insert) {
        if (Array.isArray(change.insert)) {
          arr.splice(retain, 0, ...change.insert.map(toPlainValue));
          retain += change.insert.length;
        } else {
          arr.splice(retain, 0, toPlainValue(change.insert));
          retain += 1;
        }
      }
    });
  }
}

function applyYEventsWithPatches<S extends JSONObject | JSONArray>(
  snapshot: S,
  events: Y.YEvent<any>[]
): [S, Patch[]] {
  const [result, patches] = produceWithPatches(snapshot, (draft: any) => {
    for (const event of events) {
      let base = draft;
      for (const step of event.path) {
        base = base[step as any];
      }
      applyYEvent(base, event);
    }
  });
  return [result, patches];
}

export class YPatchBinder<S extends JSONObject | JSONArray> {
  private snapshot: S;
  private readonly observer: (events: Y.YEvent<any>[]) => void;

  constructor(
    private readonly source: Y.Map<any> | Y.Array<any>,
    initialSnapshot: S,
    private readonly origin: string,
    private readonly onRemotePatches: (patches: Patch[]) => void
  ) {
    this.snapshot = initialSnapshot;

    this.observer = (events) => {
      if (!events.length) return;
      const transaction = events[0].transaction;
      if (!transaction) return;
      if (transaction.local) return;

      const [nextSnapshot, patches] = applyYEventsWithPatches(
        this.snapshot,
        events
      );
      if (patches.length === 0) {
        return;
      }
      this.snapshot = nextSnapshot;
      this.onRemotePatches(patches);
    };

    this.source.observeDeep(this.observer);
  }

  getSnapshot(): S {
    return this.snapshot;
  }

  applyLocalPatches(patches: Patch[]) {
    if (!patches.length) {
      return;
    }

    const nextSnapshot = applyPatches(this.snapshot, patches) as S;
    const doc = this.source.doc;
    const apply = () => {
      for (const patch of patches) {
        applyPatchToTarget(this.source, patch);
      }
    };

    if (doc) {
      doc.transact(apply, this.origin);
    } else {
      apply();
    }

    this.snapshot = nextSnapshot;
  }

  destroy() {
    this.source.unobserveDeep(this.observer);
  }
}
