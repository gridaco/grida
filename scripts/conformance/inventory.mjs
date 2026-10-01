import assert from "node:assert/strict";

export function coverage(inventory, cases, checks = []) {
  assert.equal(inventory.version, 1);
  const ids = new Map([...cases, ...checks].map((entry) => [entry.id, entry]));
  assert.equal(ids.size, cases.length + checks.length, "Duplicate evidence ID");
  const groups = new Set(inventory.contracts.map((entry) => entry.id));
  assert.equal(
    groups.size,
    inventory.contracts.length,
    "Duplicate contract ID"
  );
  for (const test of cases)
    assert(groups.has(test.contract), `Unknown contract: ${test.contract}`);
  const operations = inventory.operation_inventory.operations;
  assert.equal(
    new Set(operations.map((entry) => entry.id)).size,
    operations.length,
    "Duplicate operation ID"
  );
  for (const entry of [...inventory.contracts, ...operations]) {
    assert.equal(
      entry.required,
      true,
      `${entry.id}: required scope cannot silently disappear`
    );
    assert(
      ["pending", "complete"].includes(entry.status),
      `Invalid coverage state: ${entry.id}`
    );
    assert(Array.isArray(entry.cases), `Missing case links: ${entry.id}`);
    for (const id of entry.cases)
      assert(ids.has(id), `Unknown case ${id} in ${entry.id}`);
    if (entry.status === "complete") {
      assert(
        entry.cases.length > 0,
        `Completed contract has no evidence: ${entry.id}`
      );
      assert(
        entry.cases.every((id) => ids.get(id).rust === "complete"),
        `Completed contract links pending cases: ${entry.id}`
      );
    }
  }
  for (const operation of operations)
    assert(
      groups.has(operation.contract),
      `Unknown operation contract: ${operation.id}`
    );
  for (const decision of inventory.divergences) {
    assert(
      ["decision-required", "preserved", "approved"].includes(decision.status),
      `Invalid decision state: ${decision.id}`
    );
    if (decision.status !== "decision-required")
      assert(
        typeof decision.decision === "string" && decision.decision.length > 0,
        `Missing recorded decision: ${decision.id}`
      );
  }
  return {
    pending: [...cases, ...checks].filter((test) => test.rust === "pending"),
    groups: inventory.contracts.filter((entry) => entry.status !== "complete"),
    operations: operations.filter((entry) => entry.status !== "complete"),
    decisions: inventory.divergences.filter(
      (entry) => entry.status === "decision-required"
    ),
  };
}

export function targetIncomplete(remaining) {
  return Object.values(remaining).some((entries) => entries.length > 0);
}

export function assertOperationVectors(inventory, wires, inputs, faults) {
  const operationId = ({ selector: s }) =>
    [
      s.feature === "rig-check"
        ? "rigging check"
        : s.feature === "rigging"
          ? "rigging run"
          : "generate",
      s.kind,
      s.provider,
      s.feature ?? "generation",
      s.model_id || "no-model",
      s.variant,
    ].join(":");
  const expected = inventory.operation_inventory.operations
    .map((o) => o.id)
    .sort();
  assert.deepEqual(
    wires.map(operationId).sort(),
    expected,
    "Wire vectors must cover the exact operation matrix"
  );
  assert.equal(
    new Set(wires.map((w) => w.id)).size,
    wires.length,
    "Duplicate wire vector"
  );
  for (const wire of wires) {
    assert(wire.transcript.length > 0, `${wire.id}: no wire exchange`);
    const inputCases = inputs.filter((v) => v.id.startsWith(wire.id + ":"));
    assert(
      inputCases.some((v) => v.expected.ok === true),
      `${wire.id}: no accepted input control`
    );
    assert(
      inputCases.some((v) => v.expected.ok === false),
      `${wire.id}: no rejected input control`
    );
    const faultCases = faults.filter((v) => v.operation_id === wire.id);
    assert(
      faultCases.some((v) => v.fault.cancel),
      `${wire.id}: no cancellation control`
    );
    assert(
      faultCases.some((v) => v.fault.throw),
      `${wire.id}: no transport failure control`
    );
    assert(
      faultCases.some((v) => v.fault.status === 403),
      `${wire.id}: no provider refusal control`
    );
  }
}
