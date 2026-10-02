import assert from "node:assert/strict";

export function assertOperationVectors(descriptors, wires, inputs, faults) {
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
  const expected = descriptors
    .map((descriptor) =>
      operationId({
        selector: {
          kind: descriptor.kind,
          provider: descriptor.provider_id,
          model_id: descriptor.model_id,
          variant: descriptor.variant,
          feature: descriptor.feature,
        },
      })
    )
    .sort();
  assert(expected.length > 0, "No advertised provider operations");
  assert.equal(
    new Set(expected).size,
    expected.length,
    "Duplicate advertised operation"
  );
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
