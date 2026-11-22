import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentApprovalPrompt } from "./agent-approval";

describe("AgentApprovalPrompt", () => {
  it.each([true, false])(
    "shows the effective filesystem rights for a command with a listener (%s)",
    (listener) => {
      const html = renderToStaticMarkup(
        <AgentApprovalPrompt
          approval={{
            reviewId: "review",
            tool: "exec_command",
            root: "/project",
            command: "next start --hostname 127.0.0.1 --port 43123",
            cwd: "/project",
            executable: "/bin/sh",
            sandboxPermissions: "require_escalated",
            justification: "Start the requested local preview",
            environmentNames: ["PATH"],
            access: "read_write",
            network: listener
              ? { kind: "listen", port: 43123 }
              : { kind: "denied" },
            scope: {
              diskRead: true,
              resolvedExecutable: "/bin/sh",
              resolvedCwd: "/project",
              readRoots: [],
              writeRoots: ["/project"],
              runtimeRoots: [],
              privateTempWrite: true,
              environmentNames: ["PATH"],
            },
          }}
          onDecision={() => {}}
        />
      );
      expect(html).toContain(
        "Allow this command to run with additional access?"
      );
      expect(html).toContain("except protected locations");
      expect(html).toContain("keep running after this turn");
      expect(html).toContain("Start the requested local preview");
      expect(html).toContain("next start --hostname 127.0.0.1");
      expect(html).toContain("PATH");
      if (listener) {
        expect(html).toContain("Incoming TCP on port 43123.");
        expect(html).toContain("The command chooses the listen address.");
        expect(html).not.toContain("version-control metadata");
        expect(html).not.toContain("Network access denied");
      } else {
        expect(html).toContain("Network access denied");
        expect(html).toContain(
          "can change version-control metadata in the project"
        );
      }
      expect(html).not.toContain("disabled=");
    }
  );

  it("offers only decline for an escalation without verified permissions", () => {
    const html = renderToStaticMarkup(
      <AgentApprovalPrompt
        approval={{
          reviewId: "old-review",
          tool: "exec_command",
          root: "/project",
          command: "next start --hostname 127.0.0.1",
          executable: "/bin/sh",
          cwd: "/project",
          sandboxPermissions: "require_escalated",
          justification: "Start the requested local preview",
          environmentNames: [],
          access: "read",
          scope: {
            diskRead: true,
            resolvedExecutable: "/bin/sh",
            resolvedCwd: "/project",
            readRoots: [],
            writeRoots: ["/project"],
            runtimeRoots: [],
            privateTempWrite: true,
            environmentNames: [],
          },
        }}
        onDecision={() => {}}
      />
    );
    expect(html).toContain("could not verify");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Allow once/);
  });
});
