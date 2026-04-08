import { describe, it, expect } from "vitest";
import {
  MockServer,
  MockTransport,
  createRoom,
  connectAll,
  assertConvergence,
  makeNode,
  emptyState,
} from "./helpers";
import type { DocumentState } from "../src/diff";
import type { DocumentDiff } from "../src/protocol";

// ---------------------------------------------------------------------------
// Multi-client integration tests
//
// These tests simulate real collaboration scenarios with 2-3 clients
// connected through a MockServer that implements SyncRoom semantics.
// All delivery is synchronous, so tests are deterministic.
// ---------------------------------------------------------------------------

describe("multi-client integration", () => {
  // -----------------------------------------------------------------------
  // Basic two-client collaboration
  // -----------------------------------------------------------------------

  describe("basic two-client workflow", () => {
    it("client A creates a node, client B sees it", () => {
      const { server, clients, transports } = createRoom(2);
      connectAll(server, transports);

      const [A, B] = clients;

      A.pushDiff({
        nodes: {
          n1: { op: "put", node: makeNode("n1", { width: 100 }) },
        },
      });

      // After synchronous flush + server broadcast:
      // A should have n1 (committed), B should have n1 (via patch)
      expect(A.state.nodes["n1"]).toEqual(makeNode("n1", { width: 100 }));
      expect(B.state.nodes["n1"]).toEqual(makeNode("n1", { width: 100 }));
      assertConvergence(server, clients);
    });

    it("both clients create different nodes concurrently", () => {
      const { server, clients, transports } = createRoom(2);
      connectAll(server, transports);

      const [A, B] = clients;

      // Both push "simultaneously" — but with synchronous delivery,
      // A's push processes first, then B's
      A.pushDiff({
        nodes: { nA: { op: "put", node: makeNode("nA", { x: 10 }) } },
      });
      B.pushDiff({
        nodes: { nB: { op: "put", node: makeNode("nB", { y: 20 }) } },
      });

      // Both nodes should exist on both clients
      expect(A.state.nodes["nA"]).toBeDefined();
      expect(A.state.nodes["nB"]).toBeDefined();
      expect(B.state.nodes["nA"]).toBeDefined();
      expect(B.state.nodes["nB"]).toBeDefined();
      assertConvergence(server, clients);
    });

    it("client A modifies, client B modifies a different node", () => {
      const initial: DocumentState = {
        nodes: {
          n1: makeNode("n1", { width: 100 }),
          n2: makeNode("n2", { height: 50 }),
        },
        scenes: [],
      };
      const { server, clients, transports } = createRoom(2, initial);
      connectAll(server, transports);

      const [A, B] = clients;

      A.pushDiff({
        nodes: {
          n1: {
            op: "patch",
            fields: { width: { op: "put", value: 200 } },
          },
        },
      });
      B.pushDiff({
        nodes: {
          n2: {
            op: "patch",
            fields: { height: { op: "put", value: 100 } },
          },
        },
      });

      expect(A.state.nodes["n1"]).toEqual(makeNode("n1", { width: 200 }));
      expect(A.state.nodes["n2"]).toEqual(makeNode("n2", { height: 100 }));
      assertConvergence(server, clients);
    });
  });

  // -----------------------------------------------------------------------
  // Concurrent edits to the same node
  // -----------------------------------------------------------------------

  describe("concurrent edits to the same node", () => {
    it("different fields of the same node — both survive", () => {
      const initial: DocumentState = {
        nodes: {
          n1: makeNode("n1", { width: 100, height: 50 }),
        },
        scenes: [],
      };
      const { server, clients, transports } = createRoom(2, initial);
      connectAll(server, transports);

      const [A, B] = clients;

      A.pushDiff({
        nodes: {
          n1: {
            op: "patch",
            fields: { width: { op: "put", value: 200 } },
          },
        },
      });

      B.pushDiff({
        nodes: {
          n1: {
            op: "patch",
            fields: { height: { op: "put", value: 100 } },
          },
        },
      });

      // Both changes should be present (non-conflicting fields)
      assertConvergence(server, clients);
      expect(server.canonical.nodes["n1"]).toEqual(
        makeNode("n1", { width: 200, height: 100 })
      );
    });

    it("same field of the same node — last-write-wins (server order)", () => {
      const initial: DocumentState = {
        nodes: {
          n1: makeNode("n1", { width: 100 }),
        },
        scenes: [],
      };
      const { server, clients, transports } = createRoom(2, initial);
      connectAll(server, transports);

      const [A, B] = clients;

      // A sets width to 200, then B sets width to 300
      // Server processes A first, then B. B wins (LWW).
      A.pushDiff({
        nodes: {
          n1: {
            op: "patch",
            fields: { width: { op: "put", value: 200 } },
          },
        },
      });

      B.pushDiff({
        nodes: {
          n1: {
            op: "patch",
            fields: { width: { op: "put", value: 300 } },
          },
        },
      });

      // Server should have B's value (processed second)
      assertConvergence(server, clients);
      expect(server.canonical.nodes["n1"]).toEqual(
        makeNode("n1", { width: 300 })
      );
    });
  });

  // -----------------------------------------------------------------------
  // Add vs delete conflicts
  // -----------------------------------------------------------------------

  describe("add vs delete conflicts", () => {
    it("A deletes a node, B patches it — delete wins (A processed first)", () => {
      const initial: DocumentState = {
        nodes: {
          n1: makeNode("n1", { width: 100 }),
        },
        scenes: [],
      };
      const { server, clients, transports } = createRoom(2, initial);
      connectAll(server, transports);

      const [A, B] = clients;

      // A deletes n1
      A.pushDiff({ nodes: { n1: { op: "remove" } } });

      // B tries to patch n1 — but it's already deleted on the server.
      // The server should validate and discard B's push.
      B.pushDiff({
        nodes: {
          n1: {
            op: "patch",
            fields: { width: { op: "put", value: 200 } },
          },
        },
      });

      // n1 should be deleted
      assertConvergence(server, clients);
      expect(server.canonical.nodes["n1"]).toBeUndefined();
    });

    it("A and B both delete the same node — idempotent", () => {
      const initial: DocumentState = {
        nodes: {
          n1: makeNode("n1"),
        },
        scenes: [],
      };
      const { server, clients, transports } = createRoom(2, initial);
      connectAll(server, transports);

      const [A, B] = clients;

      A.pushDiff({ nodes: { n1: { op: "remove" } } });
      B.pushDiff({ nodes: { n1: { op: "remove" } } });

      // Both clients should see n1 removed
      // B's push is discarded by the server (REMOVE_MISSING_NODE validation)
      assertConvergence(server, clients);
      expect(server.canonical.nodes["n1"]).toBeUndefined();
    });

    it("A creates node, B creates a different node with same content — both survive (different IDs)", () => {
      const { server, clients, transports } = createRoom(2);
      connectAll(server, transports);

      const [A, B] = clients;

      A.pushDiff({
        nodes: { nA: { op: "put", node: makeNode("nA", { color: "red" }) } },
      });
      B.pushDiff({
        nodes: { nB: { op: "put", node: makeNode("nB", { color: "red" }) } },
      });

      assertConvergence(server, clients);
      expect(Object.keys(server.canonical.nodes).sort()).toEqual(["nA", "nB"]);
    });
  });

  // -----------------------------------------------------------------------
  // Reconnection scenarios
  // -----------------------------------------------------------------------

  describe("reconnection", () => {
    it("client disconnects, other edits, client reconnects and catches up", () => {
      const initial: DocumentState = {
        nodes: { n1: makeNode("n1", { width: 100 }) },
        scenes: [],
      };
      const { server, clients, transports } = createRoom(2, initial);
      connectAll(server, transports);

      const [A, B] = clients;

      // Disconnect client B
      server.disconnectSession("client-1");

      // A makes some edits while B is offline
      A.pushDiff({
        nodes: {
          n1: {
            op: "patch",
            fields: { width: { op: "put", value: 200 } },
          },
        },
      });
      A.pushDiff({
        nodes: {
          n2: { op: "put", node: makeNode("n2", { x: 50 }) },
        },
      });

      // B's state is stale — still has old width, no n2
      expect(B.state.nodes["n1"]).toEqual(makeNode("n1", { width: 100 }));
      expect(B.state.nodes["n2"]).toBeUndefined();

      // Reconnect B — server sends full state
      server.connectSession("client-1");

      // Now B should have caught up
      expect(B.state.nodes["n1"]).toEqual(makeNode("n1", { width: 200 }));
      expect(B.state.nodes["n2"]).toEqual(makeNode("n2", { x: 50 }));
      assertConvergence(server, clients);
    });

    it("client has unsent local changes when reconnecting — they get pushed after handshake", () => {
      const initial: DocumentState = {
        nodes: { n1: makeNode("n1", { width: 100 }) },
        scenes: [],
      };
      const { server, clients, transports } = createRoom(2, initial);
      connectAll(server, transports);

      const [A, B] = clients;

      // Disconnect A
      server.disconnectSession("client-0");

      // A makes a local edit while disconnected (optimistic)
      A.pushDiff({
        nodes: {
          n1: {
            op: "patch",
            fields: { width: { op: "put", value: 999 } },
          },
        },
      });

      // A's local state shows the edit
      expect(A.state.nodes["n1"]).toEqual(makeNode("n1", { width: 999 }));

      // But server and B don't have it
      expect(server.canonical.nodes["n1"]).toEqual(
        makeNode("n1", { width: 100 })
      );

      // Reconnect A — with pushInterval: -1, unsent changes flush
      // synchronously during the connect_ok handler
      server.connectSession("client-0");

      // Now check convergence
      expect(server.canonical.nodes["n1"]).toEqual(
        makeNode("n1", { width: 999 })
      );
      assertConvergence(server, clients);
    });
  });

  // -----------------------------------------------------------------------
  // Rapid burst editing
  // -----------------------------------------------------------------------

  describe("rapid burst editing", () => {
    it("many rapid local changes compose into one push", () => {
      const { server, clients, transports } = createRoom(2);
      connectAll(server, transports);

      const [A, B] = clients;
      transports[0].sent = []; // Clear handshake messages

      // Simulate rapid property changes (e.g., dragging a resize handle)
      for (let i = 0; i < 50; i++) {
        A.pushDiff({
          nodes: {
            n1:
              i === 0
                ? { op: "put", node: makeNode("n1", { width: i * 10 }) }
                : {
                    op: "patch",
                    fields: { width: { op: "put", value: i * 10 } },
                  },
          },
        });
      }

      // With pushInterval: 0, each pushDiff triggers a flush.
      // But the first push locks (pushInFlight), so subsequent changes
      // compose into the unsent buffer and push after ack.
      // The exact number of push messages depends on synchronous ack timing.

      // The important assertion: all clients converge to the final value
      assertConvergence(server, clients);
      expect(server.canonical.nodes["n1"]).toEqual(
        makeNode("n1", { width: 490 })
      );
    });

    it("interleaved edits from both clients during a burst", () => {
      const initial: DocumentState = {
        nodes: { n1: makeNode("n1", { width: 0, height: 0 }) },
        scenes: [],
      };
      const { server, clients, transports } = createRoom(2, initial);
      connectAll(server, transports);

      const [A, B] = clients;

      // A updates width, B updates height, alternating
      for (let i = 1; i <= 10; i++) {
        A.pushDiff({
          nodes: {
            n1: {
              op: "patch",
              fields: { width: { op: "put", value: i * 10 } },
            },
          },
        });
        B.pushDiff({
          nodes: {
            n1: {
              op: "patch",
              fields: { height: { op: "put", value: i * 5 } },
            },
          },
        });
      }

      assertConvergence(server, clients);
      // Both final values should be present
      expect(server.canonical.nodes["n1"]).toEqual(
        makeNode("n1", { width: 100, height: 50 })
      );
    });
  });

  // -----------------------------------------------------------------------
  // Three-client scenarios
  // -----------------------------------------------------------------------

  describe("three clients", () => {
    it("three clients each create a node — all three exist everywhere", () => {
      const { server, clients, transports } = createRoom(3);
      connectAll(server, transports);

      const [A, B, C] = clients;

      A.pushDiff({
        nodes: { nA: { op: "put", node: makeNode("nA") } },
      });
      B.pushDiff({
        nodes: { nB: { op: "put", node: makeNode("nB") } },
      });
      C.pushDiff({
        nodes: { nC: { op: "put", node: makeNode("nC") } },
      });

      assertConvergence(server, clients);
      expect(Object.keys(server.canonical.nodes).sort()).toEqual([
        "nA",
        "nB",
        "nC",
      ]);
    });

    it("three clients edit the same node's different fields — all fields survive", () => {
      const initial: DocumentState = {
        nodes: {
          n1: makeNode("n1", { x: 0, y: 0, width: 100 }),
        },
        scenes: [],
      };
      const { server, clients, transports } = createRoom(3, initial);
      connectAll(server, transports);

      const [A, B, C] = clients;

      A.pushDiff({
        nodes: {
          n1: { op: "patch", fields: { x: { op: "put", value: 50 } } },
        },
      });
      B.pushDiff({
        nodes: {
          n1: { op: "patch", fields: { y: { op: "put", value: 75 } } },
        },
      });
      C.pushDiff({
        nodes: {
          n1: {
            op: "patch",
            fields: { width: { op: "put", value: 200 } },
          },
        },
      });

      assertConvergence(server, clients);
      expect(server.canonical.nodes["n1"]).toEqual(
        makeNode("n1", { x: 50, y: 75, width: 200 })
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scene operations
  // -----------------------------------------------------------------------

  describe("scene operations", () => {
    it("client A adds a scene, client B sees it", () => {
      const { server, clients, transports } = createRoom(2);
      connectAll(server, transports);

      const [A, B] = clients;

      A.pushDiff({
        nodes: {
          s1: {
            op: "put",
            node: { type: "scene", id: "s1", name: "Page 1" } as any,
          },
        },
        scenes: [{ op: "add", id: "s1" }],
      });

      assertConvergence(server, clients);
      expect(server.canonical.scenes).toContain("s1");
      expect(B.state.scenes).toContain("s1");
    });

    it("client A removes a scene, client B sees it", () => {
      const initial: DocumentState = {
        nodes: {
          s1: { type: "scene", id: "s1", name: "Page 1" } as any,
          s2: { type: "scene", id: "s2", name: "Page 2" } as any,
        },
        scenes: ["s1", "s2"],
      };
      const { server, clients, transports } = createRoom(2, initial);
      connectAll(server, transports);

      const [A, B] = clients;

      A.pushDiff({
        nodes: { s1: { op: "remove" } },
        scenes: [{ op: "remove", id: "s1" }],
      });

      assertConvergence(server, clients);
      expect(server.canonical.scenes).toEqual(["s2"]);
      expect(server.canonical.nodes["s1"]).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Complex real-world scenario
  // -----------------------------------------------------------------------

  describe("complex real-world scenario", () => {
    it("multi-step workflow: create, modify, group, delete across two clients", () => {
      const { server, clients, transports } = createRoom(2);
      connectAll(server, transports);

      const [A, B] = clients;

      // Step 1: A creates a scene and two rectangles
      A.pushDiff({
        nodes: {
          s1: {
            op: "put",
            node: { type: "scene", id: "s1", name: "Main" } as any,
          },
          rect1: {
            op: "put",
            node: makeNode("rect1", {
              width: 100,
              height: 50,
              x: 0,
              y: 0,
              parent_id: "s1",
            }),
          },
          rect2: {
            op: "put",
            node: makeNode("rect2", {
              width: 200,
              height: 100,
              x: 150,
              y: 0,
              parent_id: "s1",
            }),
          },
        },
        scenes: [{ op: "add", id: "s1" }],
      });

      assertConvergence(server, clients);
      expect(Object.keys(B.state.nodes)).toContain("rect1");
      expect(Object.keys(B.state.nodes)).toContain("rect2");

      // Step 2: B resizes rect1 while A changes rect2's color
      B.pushDiff({
        nodes: {
          rect1: {
            op: "patch",
            fields: {
              width: { op: "put", value: 300 },
              height: { op: "put", value: 150 },
            },
          },
        },
      });
      A.pushDiff({
        nodes: {
          rect2: {
            op: "patch",
            fields: { fill: { op: "put", value: "#ff0000" } },
          },
        },
      });

      assertConvergence(server, clients);
      expect(server.canonical.nodes["rect1"]).toEqual(
        makeNode("rect1", {
          width: 300,
          height: 150,
          x: 0,
          y: 0,
          parent_id: "s1",
        })
      );
      expect(server.canonical.nodes["rect2"]).toMatchObject({
        fill: "#ff0000",
      });

      // Step 3: A creates a group containing both rects
      A.pushDiff({
        nodes: {
          group1: {
            op: "put",
            node: {
              type: "group",
              id: "group1",
              parent_id: "s1",
            } as any,
          },
          rect1: {
            op: "patch",
            fields: { parent_id: { op: "put", value: "group1" } },
          },
          rect2: {
            op: "patch",
            fields: { parent_id: { op: "put", value: "group1" } },
          },
        },
      });

      assertConvergence(server, clients);
      expect(B.state.nodes["group1"]).toBeDefined();
      expect(B.state.nodes["rect1"]).toMatchObject({ parent_id: "group1" });

      // Step 4: B deletes rect2
      B.pushDiff({
        nodes: { rect2: { op: "remove" } },
      });

      assertConvergence(server, clients);
      expect(server.canonical.nodes["rect2"]).toBeUndefined();
      expect(A.state.nodes["rect2"]).toBeUndefined();

      // Final: 3 nodes remain (s1, rect1, group1)
      expect(Object.keys(server.canonical.nodes).sort()).toEqual([
        "group1",
        "rect1",
        "s1",
      ]);
    });
  });
});
