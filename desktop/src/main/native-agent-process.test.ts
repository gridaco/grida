import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NativeAgentChat } from "./native-agent-chat";
import { NativeAgentGoals } from "./native-agent-goals";
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
  capabilities?: Record<string, number | null>
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
let requested;
lines.on('line', line => {
  const request = JSON.parse(line);
  if (request.method === 'initialize') {
    requested = request.params.clientCapabilities._meta;
    const offered = ${JSON.stringify(capabilities ?? null)};
    const meta = offered ? {...requested,...offered} : {'co.grida/session/history':1};
    for (const key of Object.keys(meta)) if (meta[key] === null) delete meta[key];
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
  it("refuses unreviewed supervised subagent routes", async () => {
    const test = fixture("");
    const network = { prepare: () => null };
    try {
      for (const profile of [
        {
          endpoint: "http://127.0.0.1:1/v1",
          credentialHome: test.root,
          providerNetwork: network,
        },
        { endpoint: "https://openrouter.ai/api/v1", providerNetwork: network },
        {
          endpoint: "https://openrouter.ai/api/v1",
          credentialHome: test.root,
          providerNetwork: network,
          configuredEndpointKey: "custom",
        },
        {
          endpoint: "https://openrouter.ai/api/v1/other",
          credentialHome: test.root,
          providerNetwork: network,
        },
        {
          endpoint: "https://openrouter.ai/api/v1",
          provider: "responses" as const,
          providerNetwork: network,
          subscriptionScope: "a".repeat(64),
        },
      ]) {
        await expect(
          NativeAgentProcess.start({
            ...test.options,
            ...profile,
            subagents: true,
          })
        ).rejects.toThrow("native_agent_subagent_provider_unsupported");
      }
    } finally {
      test.close();
    }
  });

  it.each([
    { effort: null, funded: 1, named: 1, goal: false, child: false },
    { effort: 1, funded: null, named: null, goal: false, child: false },
    { effort: 1, funded: 1, named: null, goal: true, child: false },
    { effort: 1, funded: 1, named: 1, goal: true, child: true },
  ])(
    "negotiates saved BYOK Goal funding from optional worker echoes $effort/$funded/$named",
    async ({
      effort: effortEcho,
      funded: fundedEcho,
      named: namedEcho,
      goal,
      child,
    }) => {
      const effort = "co.grida/session/effort";
      const funded = NativeAgentGoals.fundedReviewCapability;
      const named = NativeAgentGoals.namedChildCapability;
      const test = fixture("send({id:request.id,result:requested});", 1, {
        [effort]: effortEcho,
        [funded]: fundedEcho,
        [named]: namedEcho,
      });
      let agent: NativeAgentProcess | undefined;
      try {
        agent = await NativeAgentProcess.start({
          ...test.options,
          endpoint: "https://openrouter.ai/api/v1",
          credentialHome: test.root,
          providerNetwork: { prepare: () => null },
          subagents: true,
          capabilities: { [effort]: 1, [funded]: 1, [named]: 1 },
        });
        const requested = await agent.request("fixture/initialize", {});
        expect(requested).toHaveProperty([effort], 1);
        expect(requested).toHaveProperty([funded], 1);
        expect(requested).toHaveProperty([named], 1);
        expect(agent.acceptsSubagents).toBe(true);
        expect(agent.acceptsEffort).toBe(effortEcho === 1);
        expect(agent.acceptsGoalEffort).toBe(goal);
        expect(agent.acceptsGoalNamedChild).toBe(child);
      } finally {
        try {
          await agent?.close();
        } finally {
          test.close();
        }
      }
    }
  );

  it.each(["custom", "subscription"] as const)(
    "withholds Goal review capabilities from an unsolicited %s worker echo",
    async (kind) => {
      const test = fixture("send({id:request.id,result:{}});", 1, {
        "co.grida/session/effort": 1,
        [NativeAgentGoals.fundedReviewCapability]: 1,
        [NativeAgentGoals.namedChildCapability]: 1,
      });
      let agent: NativeAgentProcess | undefined;
      try {
        const profile =
          kind === "custom"
            ? { credentialHome: test.root, configuredEndpointKey: "custom" }
            : {
                provider: "responses" as const,
                subscriptionScope: "a".repeat(64),
              };
        agent = await NativeAgentProcess.start({
          ...test.options,
          ...profile,
          endpoint:
            kind === "subscription"
              ? "https://chatgpt.com/backend-api/codex"
              : "https://openrouter.ai/api/v1",
          providerNetwork: { prepare: () => null },
        });
        expect(agent.acceptsEffort).toBe(false);
        expect(agent.acceptsGoalEffort).toBe(false);
        expect(agent.acceptsGoalNamedChild).toBe(false);
      } finally {
        try {
          await agent?.close();
        } finally {
          test.close();
        }
      }
    }
  );

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

  it.each([
    { activity: "read", accepted: true },
    { activity: "telepathy", accepted: false },
  ])(
    "projects turn activity and timing from a transcript page ($activity)",
    async ({ activity, accepted }) => {
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
      const meta = (extra) => ({[capability]:{requestId:read.requestId,turnId:'turn-1',...extra}});
      send({method:'session/update',params:{sessionId:'chat',
        _meta:{'co.grida/session/updates':{turnId:'turn-2',messageId:'live',activity:'execute',outcome:'running'}},
        update:{sessionUpdate:'tool_call',toolCallId:'call-live',title:'run_command',kind:'execute',status:'in_progress'}}});
      send({method:'session/update',params:{sessionId:'chat',_meta:meta({}),
        update:{sessionUpdate:'user_message_chunk',messageId:'ask',content:{type:'text',text:'Check it'}}}});
      send({method:'session/update',params:{sessionId:'chat',_meta:meta({}),
        update:{sessionUpdate:'user_message_chunk',messageId:'ask',content:{type:'resource_link',
          name:'image.png',uri:'urn:grida:retained-attachment:image-1',mimeType:'image/png',size:179}}}});
      send({method:'session/update',params:{sessionId:'chat',_meta:meta({phase:'progress'}),
        update:{sessionUpdate:'agent_message_chunk',messageId:'work',content:{type:'text',text:'Reading.'}}}});
      send({method:'session/update',params:{sessionId:'chat',
        _meta:meta({messageId:'work',activity:${JSON.stringify(activity)},outcome:'succeeded'}),
        update:{sessionUpdate:'tool_call',toolCallId:'call-1',title:'read_file',kind:'read',status:'completed'}}});
      send({method:'session/update',params:{sessionId:'chat',
        _meta:meta({messageId:'quiet',activity:'integration',source:'docs',outcome:'failed'}),
        update:{sessionUpdate:'tool_call',toolCallId:'call-2',title:'mcp_docs_search',kind:'other',status:'failed'}}});
      send({method:'session/update',params:{sessionId:'chat',_meta:meta({phase:'answer'}),
        update:{sessionUpdate:'agent_message_chunk',messageId:'done',content:{type:'text',text:'All good.'}}}});
      send({id:request.id,result:{_meta:{[capability]:{requestId:read.requestId,view:1,older:null,
        turns:[{turnId:'turn-1',status:'succeeded',startedAtMs:1000,settledAtMs:4500,goalStart:true}]}}}});
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
        const live: unknown[] = [];
        chat.subscribe(session, (update) => live.push(update));
        const page = await chat.transcriptPage(session);
        // Unrecognized host values never reach the renderer.
        expect(
          page.messages.find((item) => item.messageId === "work")?.activity
        ).toEqual(
          accepted
            ? [
                {
                  callId: "call-1",
                  title: "read_file",
                  kind: "read",
                  outcome: "succeeded",
                },
              ]
            : undefined
        );
        if (!accepted) return;
        expect(page).toEqual({
          view: 1,
          older: null,
          turns: [
            {
              turnId: "turn-1",
              status: "succeeded",
              startedAtMs: 1000,
              settledAtMs: 4500,
              goalStart: true,
            },
          ],
          messages: [
            {
              messageId: "ask",
              role: "user",
              text: "Check it",
              turnId: "turn-1",
              // The attachment is named for display; its host URI is not kept.
              attachments: [
                { name: "image.png", mimeType: "image/png", size: 179 },
              ],
            },
            {
              messageId: "work",
              role: "assistant",
              text: "Reading.",
              turnId: "turn-1",
              phase: "progress",
              activity: [
                {
                  callId: "call-1",
                  title: "read_file",
                  kind: "read",
                  outcome: "succeeded",
                },
              ],
            },
            {
              messageId: "quiet",
              role: "assistant",
              text: "",
              turnId: "turn-1",
              activity: [
                {
                  callId: "call-2",
                  title: "mcp_docs_search",
                  kind: "integration",
                  source: "docs",
                  outcome: "failed",
                },
              ],
            },
            {
              messageId: "done",
              role: "assistant",
              text: "All good.",
              turnId: "turn-1",
              phase: "answer",
            },
          ],
        });
        expect(live).toEqual([
          {
            kind: "activity",
            messageId: "live",
            turnId: "turn-2",
            activity: {
              callId: "call-live",
              title: "run_command",
              kind: "execute",
              outcome: "running",
            },
          },
        ]);
      } finally {
        try {
          await chat?.close();
        } finally {
          test.close();
        }
      }
    }
  );

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
