import type { Delta } from "../../src/types";

export interface DocDescriptor {
  type: string;
  nodeId: string;
  field: string;
  before: unknown;
  after: unknown;
}

/**
 * A dead-simple key-value store that tracks mutation order.
 * Used to verify that apply/revert actually change state correctly.
 */
export class MockStore {
  private state: Record<string, Record<string, unknown>> = {};
  private log: string[] = [];

  get(nodeId: string, field: string): unknown {
    return this.state[nodeId]?.[field];
  }

  set(nodeId: string, field: string, value: unknown): void {
    if (!this.state[nodeId]) {
      this.state[nodeId] = {};
    }
    this.state[nodeId][field] = value;
    this.log.push(`set:${nodeId}.${field}=${JSON.stringify(value)}`);
  }

  /**
   * Create a delta that sets a field and can revert it.
   * providerId defaults to "document".
   */
  createDelta(
    nodeId: string,
    field: string,
    before: unknown,
    after: unknown,
    providerId = "document"
  ): Delta<DocDescriptor> {
    return {
      providerId,
      descriptor: { type: "update", nodeId, field, before, after },
      apply: () => this.set(nodeId, field, after),
      revert: () => this.set(nodeId, field, before),
    };
  }

  /** Snapshot current state (for assertions). */
  snapshot(): Record<string, Record<string, unknown>> {
    return JSON.parse(JSON.stringify(this.state));
  }

  /** Mutation log (for verifying call order). */
  getLog(): string[] {
    return [...this.log];
  }

  clearLog(): void {
    this.log.length = 0;
  }
}
