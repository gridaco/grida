import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NativeAgentChat } from "./native-agent-chat";
import {
  NativeAgentProcess,
  TRANSCRIPT_WINDOW,
  type NativeAgentLaunch,
} from "./native-agent-process";
import { NativeGatewayConnection } from "./native-gateway-connection";

function state() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "grida-native-agent-process-")
  );
  return {
    root,
    close: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

function launch(
  resourcesPath: string,
  stateDirectory: string
): NativeAgentLaunch {
  return {
    resourcesPath,
    stateDirectory,
    provider: "openai-compatible",
    endpoint: "http://127.0.0.1:1/v1",
    model: "fixture",
  };
}

function fixture(
  source: string,
  initializationVersion = 1,
  capabilities?: Record<string, number>
) {
  const directory = state();
  const resources = path.join(directory.root, "native-agent");
  const receipt = path.join(directory.root, "exited");
  fs.mkdirSync(resources, { mode: 0o700 });
  fs.writeFileSync(
    path.join(resources, "grida-agent"),
    `#!${process.execPath}
const fs = require('node:fs');
const readline = require('node:readline');
const lines = readline.createInterface({input:process.stdin});
const send = (value) => process.stdout.write(JSON.stringify({jsonrpc:'2.0',...value})+'\\n');
lines.on('line', line => {
  const request = JSON.parse(line);
  if (request.method === 'initialize') {
    const offered = ${JSON.stringify(capabilities ?? null)};
    const meta = offered ? {...request.params?.clientCapabilities?._meta,...offered} : {'co.grida/session/history':1};
    send({id:request.id,result:{protocolVersion:${initializationVersion},agentInfo:{name:'grida-agent'},agentCapabilities:{_meta:meta}}});
    return;
  }
  ${source}
});
lines.on('close', () => fs.writeFileSync(${JSON.stringify(receipt)}, 'eof'));
`,
    { mode: 0o700 }
  );
  return {
    ...directory,
    receipt,
    options: launch(directory.root, path.join(directory.root, "state")),
  };
}

describe.skipIf(process.platform === "win32")("Native agent process", () => {
  it("negotiates capabilities, correlates updates and responses, and shuts down through EOF", async () => {
    const test = fixture(`
      if (request.method === 'session/prompt') {
        globalThis.promptId = request.id;
      } else {
        send({id:request.id,error:{code:-32603,message:'private provider payload',data:'model_unavailable'}});
        const bytes = Buffer.from(JSON.stringify({jsonrpc:'2.0',method:'session/update',params:{text:'그리다'}})+'\\n');
        const split = bytes.indexOf(Buffer.from('그')) + 1;
        process.stdout.write(bytes.subarray(0,split));
        setTimeout(() => { process.stdout.write(bytes.subarray(split)); send({id:globalThis.promptId,result:{stopReason:'end_turn'}}); }, 10);
      }
    `);
    const observed: unknown[] = [];
    let agent: NativeAgentProcess | undefined;
    try {
      agent = await NativeAgentProcess.start({
        ...test.options,
        capabilities: { "co.grida/session/history": 1 },
        onSessionUpdate: (params) => observed.push(params),
      });
      expect(agent.acceptsPng).toBe(false);
      expect(agent.acceptsHistoryRevision).toBe(false);
      expect(agent.acceptsSubagents).toBe(false);
      expect(agent.acceptsWakeups).toBe(false);
      expect(agent.acceptsArtifacts).toBe(false);
      expect(agent.acceptsSavedChatDeletion).toBe(false);
      expect(agent.availableCommands).toEqual([]);
      const [prompt, failure] = await Promise.allSettled([
        agent.request("session/prompt", {}),
        agent.request("unavailable", {}),
      ]);
      expect(prompt).toEqual({
        status: "fulfilled",
        value: { stopReason: "end_turn" },
      });
      expect(failure).toEqual({
        status: "rejected",
        reason: new Error("model_unavailable"),
      });
      expect(observed).toEqual([{ text: "그리다" }]);
      const close = agent.close();
      expect(agent.close()).toBe(close);
      await close;
      expect(fs.readFileSync(test.receipt, "utf8")).toBe("eof");
    } finally {
      try {
        await agent?.close();
      } finally {
        test.close();
      }
    }
  });

  it("closes an incompatible child before reporting startup failure", async () => {
    const test = fixture("", 2);
    try {
      await expect(NativeAgentProcess.start(test.options)).rejects.toThrow(
        "native_agent_protocol_incompatible"
      );
      expect(fs.readFileSync(test.receipt, "utf8")).toBe("eof");
    } finally {
      test.close();
    }
  });

  it.each([
    {
      version: 0,
      acceptsChildren: false,
      childResult: { kind: "unavailable" },
    },
    {
      version: 1,
      acceptsChildren: true,
      childResult: { kind: "settled", chargedMills: "0.75" },
    },
  ])(
    "gates child Gateway billing on worker capability $version",
    async ({ version, acceptsChildren, childResult }) => {
      const test = fixture(
        `if (request.method === '_co.grida/gateway/billing-status') {
        send({id:request.id,result:request.params.child
          ? {kind:'settled',chargedMills:'0.75'} : {kind:'pending'}});
      }`,
        1,
        { [NativeGatewayConnection.childBillingCapability]: version }
      );
      let agent: NativeAgentProcess | undefined;
      try {
        agent = await NativeAgentProcess.start({
          ...test.options,
          gatewayScope: "a".repeat(64),
          providerNetwork: { prepare: () => null },
          gatewayJobBilling: async () => ({ kind: "unavailable" }),
        });
        expect(agent.acceptsChildGatewayBilling).toBe(acceptsChildren);
        const attempt = {
          sessionId: "parent",
          turnId: "turn",
          operationId: "operation",
          attemptId: "attempt",
        };
        await expect(agent.gatewayBillingStatus(attempt)).resolves.toEqual({
          kind: "pending",
        });
        await expect(
          agent.gatewayBillingStatus({
            ...attempt,
            child: { childId: "child", inputId: "assignment" },
          })
        ).resolves.toEqual(childResult);
      } finally {
        try {
          await agent?.close();
        } finally {
          test.close();
        }
      }
    }
  );

  it("keeps a transcript page intact when a legacy replay overlaps it", async () => {
    const test = fixture(
      `
      if (request.method === 'session/new') {
        send({id:request.id,result:{sessionId:'chat'}});
        return;
      }
      const capability = ${JSON.stringify(TRANSCRIPT_WINDOW)};
      const read = request.params._meta?.[capability];
      if (read?.kind !== 'read') {
        send({id:request.id,result:{}});
        return;
      }
      const chunk = (requestId, text) => send({method:'session/update',params:{
        sessionId:'chat',_meta:{[capability]:{requestId}},
        update:{sessionUpdate:'agent_message_chunk',messageId:'saved',content:{type:'text',text}},
      }});
      chunk('stale-read','Stale replay');
      chunk(read.requestId,'Retained answer');
      send({id:request.id,result:{_meta:{[capability]:{requestId:read.requestId,view:1,older:null}}}});
      `,
      1,
      { [TRANSCRIPT_WINDOW]: 1 }
    );
    let chat: NativeAgentChat | undefined;
    try {
      chat = await NativeAgentChat.start({
        ...test.options,
        cwd: fs.realpathSync(test.root),
      });
      const session = await chat.create();
      const [page, replay] = await Promise.allSettled([
        chat.transcriptPage(session),
        chat.transcript(session),
      ]);
      expect(replay).toEqual({
        status: "rejected",
        reason: new Error("native_chat_transcript_replay_busy"),
      });
      expect(page).toEqual({
        status: "fulfilled",
        value: {
          view: 1,
          older: null,
          messages: [
            { messageId: "saved", role: "assistant", text: "Retained answer" },
          ],
        },
      });
    } finally {
      try {
        await chat?.close();
      } finally {
        test.close();
      }
    }
  });

  it("retains bounded ownership of timed-out requests until the host answers", async () => {
    const test = fixture("");
    let agent: NativeAgentProcess | undefined;
    try {
      agent = await NativeAgentProcess.start(test.options);
      const requests = Array.from({ length: 16 }, () =>
        agent!.request("hold", {}, 10)
      );
      const outcomes = await Promise.allSettled(requests);
      expect(outcomes).toEqual(
        Array.from({ length: 16 }, () => ({
          status: "rejected",
          reason: new Error("native_agent_request_timeout"),
        }))
      );
      await expect(agent.request("hold", {})).rejects.toThrow(
        "native_agent_request_limit"
      );
    } finally {
      try {
        await agent?.close();
      } finally {
        test.close();
      }
    }
  });

  it("rejects an oversized unterminated response and drains the child", async () => {
    const test = fixture(
      "process.stdout.write(Buffer.alloc(1024 * 1024, 97));"
    );
    let agent: NativeAgentProcess | undefined;
    try {
      agent = await NativeAgentProcess.start(test.options);
      await expect(agent.request("oversized", {}, 2000)).rejects.toThrow(
        "native_agent_invalid_frame"
      );
      await agent.close();
      expect(fs.readFileSync(test.receipt, "utf8")).toBe("eof");
    } finally {
      try {
        await agent?.close();
      } finally {
        test.close();
      }
    }
  });
});

const packaged = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;

it.runIf(Boolean(packaged))(
  "starts the packaged native executable and opens an ACP session",
  async () => {
    const directory = state();
    let agent: NativeAgentProcess | undefined;
    try {
      agent = await NativeAgentProcess.start({
        ...launch(packaged!, path.join(directory.root, "state")),
        capabilities: { "co.grida/session/history": 1 },
      });
      const session = await agent.request("session/new", {
        cwd: directory.root,
        mcpServers: [],
      });
      expect(session).toEqual(
        expect.objectContaining({ sessionId: expect.any(String) })
      );
      await agent.close();
    } finally {
      try {
        await agent?.close();
      } finally {
        directory.close();
      }
    }
  }
);
