import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { NativeAgentChat } from "./native-agent-chat";
import { NativeCommandProfiles } from "./native-agent-command-profile";
import { NativeAgentGoals } from "./native-agent-goals";
import {
  NativeAgentProcess,
  PREDICT_PROMPT,
  QUESTION_BATCHES,
  TRANSCRIPT_WINDOW,
  type NativeAgentLaunch,
} from "./native-agent-process";
import { NativeGatewayConnection } from "./native-gateway-connection";
import { NativeProviderRoutes } from "./native-provider-routes";
import { NativeInputImages } from "./native-input-images";
import { NativeToolImages } from "./native-tool-images";
import { NativeQueuedMessages } from "./native-queued-messages";
import { NativeSelectedImages } from "./native-selected-images";
import { NativeSubagentActivity } from "./native-subagent-activity";
import { NativeActivityOrder } from "./native-activity-order";
import { NativeEditorSurfaceEndpoints } from "./native-editor-surfaces";
import { NativeEditorSvgText } from "@grida/desktop-bridge";
import { NativeEditorSvgReplies } from "./native-editor-svg-replies";
import { NativeDesktopTools } from "./native-desktop-tools";
import { NativeChatTitle } from "./native-chat-title";
import type { DesktopBrowserToolLease } from "./desktop-browser-tools";

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
  capabilities?: Record<string, number | null>,
  imageInput = false,
  startup = ""
) {
  const directory = state();
  const resources = path.join(directory.root, "native-agent");
  const receipt = path.join(directory.root, "exited");
  fs.mkdirSync(resources, { mode: 0o700 });
  fs.writeFileSync(
    path.join(resources, "grida-agent"),
    `#!${process.execPath}
const fs = require('node:fs');
${startup}
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
    if (offered?.['${NativeActivityOrder.capability}'] === undefined) delete meta['${NativeActivityOrder.capability}'];
    for (const key of Object.keys(meta)) if (meta[key] === null) delete meta[key];
    send({id:request.id,result:{protocolVersion:${initializationVersion},agentInfo:{name:'grida-agent'},agentCapabilities:{_meta:meta,promptCapabilities:{image:${imageInput}}}}});
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
  it("gates scoped requests on the installed executable and retries failed probes", async () => {
    const test = fixture(
      `
      if (request.method === 'fixture/argv') send({id:request.id,result:process.argv.slice(2)});
      if (request.method === '_co.grida/session/snapshot') send({id:request.id,result:{sessionId:'session',sessionRevision:1,current:{turnId:'turn',controlRevision:1}}});
      if (request.method === '_co.grida/session/approvals') send({id:request.id,result:{sessionId:'session',turnId:'turn',controlRevision:1,approvals:[{waitId:'wait',request:{session:'session',turn:'turn',directory:'external-file',root:'/',effect:{kind:'read',tool:'read_file',relative_path:'example/report.txt'}}}]}});
      `,
      1,
      {},
      false,
      `
      const help = fs.readFileSync(__dirname+'/help', 'utf8');
      if (process.argv.slice(2).join(' ') === 'serve --help') {
        fs.appendFileSync(__dirname+'/probes', 'p');
        if (help === 'failed') process.exit(1);
        process.stdout.write(help);
        process.exit(0);
      }
      if (!help.includes('      --allow-scoped-approvals') && process.argv.includes('--allow-scoped-approvals')) process.exit(2);
      `
    );
    const root = fs.realpathSync(test.root);
    const project = path.join(root, "project");
    const resources = path.join(root, "native-agent");
    const executable = path.join(resources, "grida-agent");
    const help = path.join(resources, "help");
    fs.mkdirSync(project, { mode: 0o700 });
    const command = vi
      .spyOn(NativeCommandProfiles, "launch")
      .mockResolvedValue({
        helper: { path: "/bin/true", sha256: Array(32).fill(0) },
        runtimePaths: [],
        temporaryParent: root,
        diskRead: true,
        environment: {},
      });
    const options: NativeAgentLaunch = {
      ...test.options,
      workspace: {
        id: "workspace",
        primary: { id: "project", name: "Project", path: project },
        additionalReadRoots: [],
        protectedPaths: [],
        allowScopedAccess: true,
      },
    };
    async function check(supported: boolean, probes: number) {
      const agent = await NativeAgentProcess.start(options);
      try {
        const args = (await agent.request("fixture/argv", {})) as string[];
        expect(args.includes("--allow-scoped-approvals")).toBe(supported);
        expect(
          fs.readFileSync(path.join(resources, "probes"), "utf8")
        ).toHaveLength(probes);
        const result = await agent
          .permissions!.list("session", "turn")
          .catch((error: Error) => error.message);
        const expectedRead = expect.objectContaining({
          tool: "read_file",
          relativePath: "example/report.txt",
        });
        expect(result).toEqual(
          supported ? [expectedRead] : "native_agent_approval_invalid"
        );
        return args[args.indexOf("--permission-profile") + 1];
      } finally {
        await agent.close();
      }
    }
    try {
      await expect(
        NativeAgentProcess.supportsScopedApprovals(project)
      ).resolves.toBe(false);
      fs.writeFileSync(help, "failed");
      const profile = await check(false, 1);
      fs.writeFileSync(help, "      --other-option\n");
      await expect(
        NativeAgentProcess.supportsScopedApprovals(root)
      ).resolves.toBe(false);
      expect(await check(false, 2)).toBe(profile);
      expect(await check(false, 2)).toBe(profile);
      fs.writeFileSync(help, "      --allow-scoped-approvals\n");
      fs.copyFileSync(executable, executable + ".update");
      fs.renameSync(executable + ".update", executable);
      await expect(
        NativeAgentProcess.supportsScopedApprovals(root)
      ).resolves.toBe(true);
      expect(await check(true, 3)).toBe(profile);
      expect(await check(true, 3)).toBe(profile);
    } finally {
      command.mockRestore();
      test.close();
    }
  });

  it("projects the same captured tool image during live updates and replay and reads only its exact result", async () => {
    const bytes = Buffer.alloc(300 * 1024, 7);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    bytes.writeUInt32BE(13, 8);
    bytes.write("IHDR", 12, "ascii");
    bytes.writeUInt32BE(1, 16);
    bytes.writeUInt32BE(1, 20);
    const mediaId = "workspace-view/captured";
    const test = fixture(
      `
      if(request.method==='session/new'){send({id:request.id,result:{sessionId:'chat'}});return;}
      if(request.method==='${NativeToolImages.readMethod}'){
        const p=request.params;
        if(p.sessionId!=='chat'||p.turnId!=='turn'||p.toolCallId!=='view'||p.mediaId!=='${mediaId}'||p.contentIndex!==1)throw Error('foreign result selector');
        const source=Buffer.from('${bytes.toString("base64")}','base64'),offset=p.offset,data=source.subarray(offset,offset+256*1024),next=offset+data.length;
        send({id:request.id,result:{...p,mimeType:'image/png',totalBytes:source.length,data:data.toString('base64'),nextOffset:next===source.length?null:next}});return;
      }
      if(request.method!=='session/load')throw Error('unexpected request');
      const window='${TRANSCRIPT_WINDOW}',read=request.params._meta?.[window];
      if(!read){send({id:request.id,result:{}});return;}
      const details={turnId:'turn',messageId:'work',activity:'read',outcome:'succeeded'};
      const update={sessionUpdate:'tool_call',toolCallId:'view',title:'view_image',kind:'read',status:'completed',rawInput:{path:'/gone.png'},rawOutput:{text:'Viewed image',truncated:false,images:[{mediaId:'${mediaId}',contentIndex:1,mimeType:'image/png',totalBytes:${bytes.length}}]}};
      send({method:'session/update',params:{sessionId:'chat',_meta:{'co.grida/session/updates':details},update}});
      send({method:'session/update',params:{sessionId:'chat',_meta:{[window]:{requestId:read.requestId,...details}},update}});
      const failed={...update,toolCallId:'failed-view',rawOutput:{...update.rawOutput,text:'Image access was denied'}};
      send({method:'session/update',params:{sessionId:'chat',_meta:{[window]:{requestId:read.requestId,...details,outcome:'failed'}},update:failed}});
      send({id:request.id,result:{_meta:{[window]:{requestId:read.requestId,view:1,older:null,turns:[]}}}});
    `,
      1,
      { [TRANSCRIPT_WINDOW]: 1, [NativeToolImages.capability]: 1 }
    );
    let chat: NativeAgentChat | undefined;
    try {
      chat = await NativeAgentChat.start({
        ...test.options,
        cwd: fs.realpathSync(test.root),
      });
      const session = await chat.create();
      const live: unknown[] = [];
      chat.subscribe(session, (value) => live.push(value));
      const page = await chat.transcriptPage(session);
      const image = page.messages[0].activity![0].output!.images![0];
      expect(live).toMatchObject([
        { kind: "activity", activity: { output: { images: [image] } } },
      ]);
      expect(image).toEqual({
        previewId: expect.any(String),
        mimeType: "image/png",
        size: bytes.length,
      });
      expect(page.messages[0].activity![1]).toMatchObject({
        callId: "failed-view",
        outcome: "failed",
        output: { text: "Image access was denied" },
      });
      expect(page.messages[0].activity![1].output!.images).toBeUndefined();
      expect(JSON.stringify(page)).not.toContain(mediaId);
      expect(
        Buffer.from(await chat.readToolImage(session, image.previewId))
      ).toEqual(bytes);
      const foreign = await chat.load("foreign");
      await expect(
        chat.readToolImage(foreign, image.previewId)
      ).rejects.toThrow("tool_image_unavailable");
      await expect(chat.readToolImage(session, mediaId)).rejects.toThrow(
        "tool_image_unavailable"
      );
      await expect(
        chat.readAttachmentPreview(session, image.previewId)
      ).rejects.toThrow("input_image_unavailable");
    } finally {
      await chat?.close();
      test.close();
    }
  });

  it.each([null, 1, 2])(
    "negotiates tool-image readback independently (%s)",
    async (version) => {
      const test = fixture("send({id:request.id,result:requested});", 1, {
        [NativeToolImages.capability]: version,
      });
      const agent = await NativeAgentProcess.start(test.options);
      try {
        expect(await agent.request("fixture/requested", {})).toMatchObject({
          [NativeToolImages.capability]: 1,
        });
        expect(agent.acceptsToolImages).toBe(version === 1);
      } finally {
        await agent.close();
        test.close();
      }
    }
  );

  it("checks retry search permission against the accepted input while receipt observation stays independent", async () => {
    const test = fixture(
      `
      if (request.method === "session/new") return send({id:request.id,result:{sessionId:"chat"}});
      if (request.method !== "_co.grida/session/input") throw Error("unexpected request");
      const {sessionId,inputId}=request.params;
      const result = {receipt:{sessionId,inputId,inputPosition:1,turnId:null,disposition:"queued"}};
      if(inputId!=="legacy-worker") result.settings = inputId==="search" ? {webSearch:true} : {};
      send({id:request.id,result});
    `,
      1,
      {}
    );
    let chat: NativeAgentChat | undefined;
    try {
      chat = await NativeAgentChat.start({
        ...test.options,
        cwd: fs.realpathSync(test.root),
      });
      const session = await chat.create();
      for (const id of ["search", "legacy-record", "legacy-worker"]) {
        const enabled = id === "search";
        const receipt = await chat.inputReceipt(session, id);
        expect(receipt).not.toHaveProperty("webSearch");
        await expect(chat.inputReceipt(session, id, enabled)).resolves.toEqual(
          receipt
        );
        await expect(chat.inputReceipt(session, id, !enabled)).rejects.toThrow(
          "submission_web_search_changed"
        );
      }
    } finally {
      await chat?.close();
      test.close();
    }
  });

  it("preserves retained message and individual call order across live chunks, replay and older pages", async () => {
    const test = fixture(
      `
      if (request.method === 'session/new') { send({id:request.id,result:{sessionId:'chat'}}); return; }
      if (request.method !== 'session/load') throw Error('unexpected fixture method');
      const window='${TRANSCRIPT_WINDOW}',ordered='${NativeActivityOrder.capability}';
      const read=request.params._meta?.[window];
      if (!read) {
        send({method:'session/update',params:{sessionId:'chat',_meta:{[ordered]:{turnId:'legacy-turn',activityOrder:11}},update:{sessionUpdate:'agent_message_chunk',messageId:'legacy-read',content:{type:'text',text:'Uniform metadata survives.'}}}});
        send({id:request.id,result:{}}); return;
      }
      const meta=(fact,extra={},turnId='turn')=>({[window]:{requestId:read.requestId,turnId,...fact,...extra},[ordered]:{turnId,...fact}});
      const text=(messageId,content,fact,extra={},turnId='turn')=>send({method:'session/update',params:{sessionId:'chat',_meta:meta(fact,extra,turnId),update:{sessionUpdate:'agent_message_chunk',messageId,content:{type:'text',text:content}}}});
      if (read.before) {
        text('older','Earlier turn',{activityOrder:1},{phase:'answer'},'older-turn');
        send({id:request.id,result:{_meta:{[window]:{requestId:read.requestId,view:1,older:null,turns:[{turnId:'older-turn',status:'succeeded',startedAtMs:1,settledAtMs:2}]}}}}); return;
      }
      const live=(update,extra,fact)=>send({method:'session/update',params:{sessionId:'chat',_meta:{'co.grida/session/updates':{turnId:'live-turn',...extra,...fact},[ordered]:{turnId:'live-turn',...fact}},update}});
      const citations=[{url:'https://example.org/reference',title:'Reference',startIndex:0,endIndex:5},{url:'javascript:wrong()',startIndex:0,endIndex:3}];
      live({sessionUpdate:'agent_message_chunk',messageId:'live-message',content:{type:'text',text:'Later'}},{offsetBytes:0,replace:true,citations},{activityOrder:8});
      live({sessionUpdate:'tool_call',toolCallId:'live-call',title:'web_search',kind:'search',status:'completed'},{messageId:'live-container',activity:'search',source:'provider',outcome:'succeeded'},{activityOrder:4});
      live({sessionUpdate:'agent_message_chunk',messageId:'live-message',content:{type:'text',text:' grows'}},{offsetBytes:5,replace:false},{activityOrder:8});
      send({method:'session/update',params:{sessionId:'chat',_meta:meta({activityOrder:1}),update:{sessionUpdate:'user_message_chunk',messageId:'request',content:{type:'resource_link',name:'report.txt',uri:'file:///workspace/report.txt',mimeType:'text/plain',size:4}}}});
      text('work','First ',{activityOrder:2},{phase:'progress',citations});
      text('work','message.',{activityOrder:2},{phase:'progress'});
      send({method:'session/update',params:{sessionId:'chat',_meta:meta({activityOrder:4},{messageId:'work',activity:'read',outcome:'succeeded'}),update:{sessionUpdate:'tool_call',toolCallId:'call',title:'read_file',kind:'read',status:'completed'}}});
      text('tool-only','',{});
      send({method:'session/update',params:{sessionId:'chat',_meta:meta({activityOrder:5},{messageId:'tool-only',activity:'search',outcome:'succeeded'}),update:{sessionUpdate:'tool_call',toolCallId:'search',title:'search_files',kind:'search',status:'completed'}}});
      text('enriched','Unknown ',{activityOrderIncomplete:true},{phase:'progress'});
      text('enriched','then retained ',{activityOrder:6},{phase:'progress'});
      text('enriched','still retained',{activityOrderIncomplete:true},{phase:'progress'});
      text('unplaced','Older missing evidence.',{activityOrderIncomplete:true},{phase:'progress'});
      text('answer','All done.',{activityOrder:9},{phase:'answer'});
      send({id:request.id,result:{_meta:{[window]:{requestId:read.requestId,view:2,older:{anchor:'older'},turns:[{turnId:'turn',status:'succeeded',startedAtMs:10,settledAtMs:20}]}}}});
    `,
      1,
      { [TRANSCRIPT_WINDOW]: 1, [NativeActivityOrder.capability]: 1 }
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
      const work = page.messages.find(
        (message) => message.messageId === "work"
      )!;
      const citations = [
        {
          url: "https://example.org/reference",
          title: "Reference",
          startIndex: 0,
          endIndex: 5,
        },
      ];
      expect(work).toMatchObject({
        citations,
        text: "First message.",
        activityOrder: 2,
        activity: [{ callId: "call", activityOrder: 4 }],
      });
      expect(
        page.messages.find((message) => message.messageId === "request")
      ).toMatchObject({
        activityOrder: 1,
        attachments: [{ name: "report.txt" }],
      });
      expect(
        page.messages.find((message) => message.messageId === "tool-only")
      ).toMatchObject({ text: "", activity: [{ activityOrder: 5 }] });
      expect(
        page.messages.find((message) => message.messageId === "tool-only")
          ?.activityOrder
      ).toBeUndefined();
      expect(
        page.messages.find((message) => message.messageId === "enriched")
      ).toMatchObject({
        text: "Unknown then retained still retained",
        activityOrder: 6,
      });
      expect(
        page.messages.find((message) => message.messageId === "enriched")
          ?.activityOrderIncomplete
      ).toBeUndefined();
      expect(
        page.messages.find((message) => message.messageId === "unplaced")
      ).toMatchObject({ activityOrderIncomplete: true });
      expect(live).toEqual([
        {
          kind: "text",
          role: "assistant",
          messageId: "live-message",
          turnId: "live-turn",
          text: "Later",
          offsetBytes: 0,
          replace: true,
          citations,
          activityOrder: 8,
        },
        {
          kind: "activity",
          messageId: "live-container",
          turnId: "live-turn",
          activity: {
            callId: "live-call",
            title: "web_search",
            kind: "search",
            source: "provider",
            outcome: "succeeded",
            activityOrder: 4,
          },
        },
        {
          kind: "text",
          role: "assistant",
          messageId: "live-message",
          turnId: "live-turn",
          text: " grows",
          offsetBytes: 5,
          replace: false,
          activityOrder: 8,
        },
      ]);
      const older = await chat.transcriptPage(session, page.older!);
      expect(older.messages).toEqual([
        {
          messageId: "older",
          role: "assistant",
          turnId: "older-turn",
          phase: "answer",
          text: "Earlier turn",
          activityOrder: 1,
        },
      ]);
      expect(await chat.transcript(session)).toEqual([
        {
          messageId: "legacy-read",
          role: "assistant",
          turnId: "legacy-turn",
          text: "Uniform metadata survives.",
          activityOrder: 11,
        },
      ]);
    } finally {
      await chat?.close();
      test.close();
    }
  });

  it("sends message context separately and replays a display-only user message", async () => {
    const capability = "co.grida/session/message-context";
    const displayParts = [
      { kind: "sample.references", version: 1, data: { label: "A reference" } },
    ];
    const messageContext = {
      modelText: "<sample><reference /></sample>",
      displayParts,
    };
    const userText = "<sample>My own words</sample>";
    const literal = `  ${userText}\n${"🌱".repeat(60)}  `;
    const expectedTitle = `${userText} ${"🌱".repeat(48 - userText.length)}…`;
    const test = fixture(
      `
      if (request.method === 'session/new') { send({id:request.id,result:{sessionId:'chat'}}); return; }
      const { inputId, prompt, messageContext } = request.params;
      const expectContext = ${JSON.stringify(messageContext)};
      if (request.method === '_co.grida/session/submit' || request.method === '_co.grida/session/enqueue') {
        const empty = request.method.endsWith('/submit');
        const expected = empty ? [] : [{type:'text',text:${JSON.stringify(literal)}}];
        const expectedTitle = empty ? undefined : ${JSON.stringify(expectedTitle)};
        if (!requested['${capability}'] || JSON.stringify(messageContext) !== JSON.stringify(expectContext)
            || JSON.stringify(prompt) !== JSON.stringify(expected) || request.params.initialTitle !== expectedTitle)
          throw Error('incorrect separation');
        send({id:request.id,result:{sessionId:'chat',inputId,inputPosition:1,turnId:empty?'turn':null,disposition:empty?'claimed':'queued'}}); return;
      }
      if (request.method !== 'session/load') throw Error('unexpected fixture method');
      const window='${TRANSCRIPT_WINDOW}',read=request.params._meta[window];
      const chunk=(role,messageId,text,requestId=read.requestId)=>send({
        method:'session/update',params:{sessionId:'chat',
          _meta:{[window]:{requestId,turnId:'turn',displayParts:expectContext.displayParts}},
          update:{sessionUpdate:role,messageId,content:{type:'text',text}}
        }
      });
      chunk('user_message_chunk','other','','other-request');
      chunk('user_message_chunk','pick-only','');
      chunk('agent_message_chunk','reply','I see it.');
      send({id:request.id,result:{_meta:{[window]:{requestId:read.requestId,view:1,older:null,turns:[]}}}});
      `,
      1,
      { [TRANSCRIPT_WINDOW]: 1, [capability]: 1 }
    );
    let chat: NativeAgentChat | undefined;
    try {
      chat = await NativeAgentChat.start({
        ...test.options,
        cwd: fs.realpathSync(test.root),
      });
      const session = await chat.create();
      await expect(
        chat.submitMessage(session, {
          text: "",
          inputId: "only-context",
          operatingRegime: "act",
          messageContext,
        })
      ).resolves.toMatchObject({ inputId: "only-context" });
      await expect(
        chat.submitMessage(session, {
          action: "enqueue",
          text: literal,
          inputId: "authored-context",
          operatingRegime: "plan",
          messageContext,
        })
      ).resolves.toMatchObject({ inputId: "authored-context" });
      expect((await chat.transcriptPage(session)).messages).toEqual([
        {
          messageId: "pick-only",
          turnId: "turn",
          role: "user",
          text: "",
          displayParts,
        },
        {
          messageId: "reply",
          turnId: "turn",
          role: "assistant",
          text: "I see it.",
        },
      ]);
    } finally {
      await chat?.close();
      test.close();
    }
  });

  it("sends plain messages to older hosts without optional title or message context support", async () => {
    const test = fixture(
      `if (request.method === 'session/new') { send({id:request.id,result:{sessionId:'chat'}}); return; }
      if (request.method === '_co.grida/session/submit' && !('initialTitle' in request.params)) {
        send({id:request.id,result:{sessionId:'chat',inputId:'plain',inputPosition:0,turnId:'turn',disposition:'claimed'}}); return;
      }
      throw Error('unexpected fixture method');`,
      1,
      {
        [TRANSCRIPT_WINDOW]: 1,
        "co.grida/session/message-context": null,
        [NativeChatTitle.capability]: null,
      }
    );
    let chat: NativeAgentChat | undefined;
    try {
      chat = await NativeAgentChat.start({
        ...test.options,
        cwd: fs.realpathSync(test.root),
      });
      const session = await chat.create();
      await expect(
        chat.submitMessage(session, {
          text: "My own words",
          inputId: "unsupported",
          operatingRegime: "act",
          messageContext: { modelText: "Extra context", displayParts: [] },
        })
      ).rejects.toThrow("native_chat_message_context_unavailable");
      await expect(
        chat.submit(session, "plain", "My own words")
      ).resolves.toMatchObject({ inputId: "plain" });
    } finally {
      await chat?.close();
      test.close();
    }
  });

  it("keeps the SVG selection marker on its exact user message during transcript replay", async () => {
    const test = fixture(
      `
      if (request.method === 'session/new') { send({id:request.id,result:{sessionId:'chat'}}); return; }
      if (request.method !== 'session/load') throw Error('unexpected fixture method');
      const window='${TRANSCRIPT_WINDOW}',read=request.params._meta[window];
      const chunk=(role,messageId,text,extra={},sessionId='chat')=>send({
        method:'session/update',params:{sessionId,
          _meta:{[window]:{requestId:read.requestId,turnId:'turn',...extra}},
          update:{sessionUpdate:role,messageId,content:{type:'text',text}}
        }
      });
      chunk('user_message_chunk','selected','Make the ',{svgTextSelection:true});
      chunk('user_message_chunk','selected','heading shorter.');
      chunk('user_message_chunk','plain','Ordinary request.');
      chunk('user_message_chunk','plain','wrong request',{requestId:'other',svgTextSelection:true});
      chunk('user_message_chunk','plain','wrong chat',{svgTextSelection:true},'other');
      chunk('user_message_chunk','plain',' Invalid marker.',{svgTextSelection:'true'});
      chunk('user_message_chunk','plain',' No turn.',{turnId:undefined,svgTextSelection:true});
      chunk('agent_message_chunk','reply','Done.',{svgTextSelection:true});
      send({id:request.id,result:{_meta:{[window]:{requestId:read.requestId,view:1,older:null,turns:[]}}}});
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
      expect((await chat.transcriptPage(session)).messages).toEqual([
        {
          messageId: "selected",
          turnId: "turn",
          role: "user",
          text: "Make the heading shorter.",
          svgTextSelection: true,
        },
        {
          messageId: "plain",
          turnId: "turn",
          role: "user",
          text: "Ordinary request. Invalid marker. No turn.",
        },
        {
          messageId: "reply",
          turnId: "turn",
          role: "assistant",
          text: "Done.",
        },
      ]);
    } finally {
      await chat?.close();
      test.close();
    }
  });

  it.each([
    { activityOrder: 0 },
    { activityOrder: Number.MAX_SAFE_INTEGER + 1 },
    { activityOrder: 1, activityOrderIncomplete: true },
    { activityOrderIncomplete: false },
  ])(
    "refuses malformed retained order and signals live resynchronization (%j)",
    async (fact) => {
      const test = fixture(
        `
      if (request.method === 'session/new') { send({id:request.id,result:{sessionId:'chat'}}); return; }
      const window='${TRANSCRIPT_WINDOW}',ordered='${NativeActivityOrder.capability}',fact=${JSON.stringify(fact)};
      const read=request.params._meta[window];
      send({method:'session/update',params:{sessionId:'chat',_meta:{'co.grida/session/updates':{turnId:'turn',offsetBytes:0,replace:true,...fact},[ordered]:{turnId:'turn',...fact}},update:{sessionUpdate:'agent_message_chunk',messageId:'bad-live',content:{type:'text',text:'Malformed order is not trusted.'}}}});
      send({method:'session/update',params:{sessionId:'chat',_meta:{[window]:{requestId:read.requestId,turnId:'turn',...fact},[ordered]:{turnId:'turn',...fact}},update:{sessionUpdate:'agent_message_chunk',messageId:'bad-read',content:{type:'text',text:'No partial replay.'}}}});
      send({id:request.id,result:{_meta:{[window]:{requestId:read.requestId,view:1,older:null}}}});
    `,
        1,
        { [TRANSCRIPT_WINDOW]: 1, [NativeActivityOrder.capability]: 1 }
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
        await expect(chat.transcriptPage(session)).rejects.toThrow(
          "native_chat_activity_order_invalid"
        );
        expect(live).toEqual([{ kind: "resync" }]);
      } finally {
        await chat?.close();
        test.close();
      }
    }
  );

  it.each([null, 1, 2])(
    "negotiates activity ordering without borrowing another feature's capability (%s)",
    async (version) => {
      const test = fixture("send({id:request.id,result:requested});", 1, {
        [NativeActivityOrder.capability]: version,
      });
      let agent: NativeAgentProcess | undefined;
      try {
        agent = await NativeAgentProcess.start(test.options);
        expect(await agent.request("fixture/initialize", {})).toHaveProperty(
          [NativeActivityOrder.capability],
          1
        );
        expect(agent.acceptsActivityOrder).toBe(version === 1);
      } finally {
        await agent?.close();
        test.close();
      }
    }
  );
  it.each([null, 1, 2])(
    "keeps caption replacement independently negotiated and never falls back (%s)",
    async (version) => {
      const test = fixture(
        `
        if (request.method === 'session/new') { send({id:request.id,result:{sessionId:'chat'}}); return; }
        if (request.method === '_co.grida/session/snapshot') { send({id:request.id,result:{sessionId:'chat',sessionRevision:3,queuedInputs:1,queue:[{inputId:'queued',inputPosition:2,settings:{operatingRegime:'plan'}}],admissionPaused:true,current:null,latest:null}}); return; }
        if (request.method === '${NativeQueuedMessages.inspectMethod}') { send({id:request.id,result:{inputId:'queued',textOnly:false,textEditable:true,prompt:[{type:'text',text:'Caption'},{type:'resource_link',name:'original.pdf',uri:'urn:grida:retained-attachment:file',mimeType:'application/pdf',size:3}]}}); return; }
        if (request.method === '${NativeQueuedMessages.replaceTextMethod}') {
          if(JSON.stringify(Object.keys(request.params).sort())!==JSON.stringify(['inputId','queue','replacementInputId','text'])) throw Error('unexpected replacement fields');
          if(request.params.queue.expectedSessionRevision!==3 || request.params.inputId!=='queued' || request.params.text!=='') throw Error('wrong replacement basis');
          if(!/^desktop-replacement-[a-f0-9]{64}$/.test(request.params.replacementInputId)) throw Error('missing stable replacement identity');
          send({id:request.id,result:{sessionId:'chat',requestId:request.params.queue.requestId,sessionRevision:4}}); return;
        }
        throw Error('unexpected operation '+request.method);
        `,
        1,
        { [NativeQueuedMessages.replaceTextCapability]: version }
      );
      let chat: NativeAgentChat | undefined;
      try {
        chat = await NativeAgentChat.start({
          ...test.options,
          cwd: fs.realpathSync(test.root),
        });
        expect(chat.acceptsQueuedTextReplacement).toBe(version === 1);
        const session = await chat.create();
        const basis = await chat.observe(session);
        const [item] = (await chat.queue(session, basis, 0)).items;
        expect(item.textOnly).toBe(false);
        expect(item.textEditable).toBe(version === 1 ? true : undefined);
        const change = {
          action: "replaceText" as const,
          observationId: "observed",
          requestId: "caption",
          inputId: "queued",
          text: "",
        };
        const edit = () =>
          chat!.editQueue(session, basis, change).then(
            (receipt) => ({ receipt }),
            (error: Error) => ({ error: error.message })
          );
        const outcome = await edit();
        expect(outcome).toEqual(
          version === 1
            ? {
                receipt: {
                  sessionId: "chat",
                  requestId: "caption",
                  sessionRevision: 4,
                },
              }
            : { error: "native_chat_queued_text_replacement_unavailable" }
        );
        expect(await edit()).toEqual(outcome);
      } finally {
        await chat?.close();
        test.close();
      }
    }
  );

  it("withholds text replacement without queued-message observation support", async () => {
    const test = fixture("send({id:request.id,result:requested});", 1, {
      [NativeQueuedMessages.replaceTextCapability]: 1,
      [NativeQueuedMessages.capability]: null,
    });
    const agent = await NativeAgentProcess.start(test.options);
    try {
      expect(await agent.request("fixture/requested", {})).toHaveProperty(
        [NativeQueuedMessages.replaceTextCapability],
        1
      );
      expect(agent.acceptsQueuedTextReplacement).toBe(false);
    } finally {
      await agent.close();
      test.close();
    }
  });
  it.each([null, 1, 2])(
    "negotiates child activity independently of existing child controls (version %s)",
    async (version) => {
      const test = fixture("send({id:request.id,result:requested});", 1, {
        [NativeSubagentActivity.capability]: version,
      });
      let agent: NativeAgentProcess | undefined;
      try {
        agent = await NativeAgentProcess.start({
          ...test.options,
          providerNetwork: { prepare: () => null },
          subagents: true,
        });
        const requested = await agent.request("fixture/initialize", {});
        expect(requested).toHaveProperty(
          [NativeSubagentActivity.capability],
          1
        );
        expect(agent.acceptsSubagents).toBe(true);
        expect(agent.acceptsSubagentActivity).toBe(version === 1);
      } finally {
        await agent?.close();
        test.close();
      }
    }
  );

  it("does not enable child activity from an unsolicited worker echo", async () => {
    const test = fixture("send({id:request.id,result:requested});", 1, {
      [NativeSubagentActivity.capability]: 1,
    });
    let agent: NativeAgentProcess | undefined;
    try {
      agent = await NativeAgentProcess.start(test.options);
      const requested = await agent.request("fixture/initialize", {});
      expect(requested).not.toHaveProperty([NativeSubagentActivity.capability]);
      expect(agent.acceptsSubagents).toBe(false);
      expect(agent.acceptsSubagentActivity).toBe(false);
    } finally {
      await agent?.close();
      test.close();
    }
  });

  it("inspects queued image text and exact bytes without widening text-only replacement", async () => {
    const uri = "urn:grida:retained-attachment:queued-image";
    const displayParts = [
      { kind: "sample.reference", version: 1, data: { title: "A reference" } },
    ];
    const test = fixture(
      `
      if (request.method === 'session/new') { send({id:request.id,result:{sessionId:'chat'}}); return; }
      if (request.method === '_co.grida/session/snapshot') { send({id:request.id,result:{sessionId:request.params.sessionId,sessionRevision:3,queuedInputs:1,queue:[{inputId:'queued',inputPosition:2,settings:{}}],admissionPaused:true,current:null,latest:null}}); return; }
      if (request.method === '${NativeQueuedMessages.inspectMethod}') {
        if(request.params.sessionId!=='chat'||request.params.inputId!=='queued'||request.params.expectedSessionRevision!==3) throw Error('wrong queue basis');
        send({id:request.id,result:{inputId:'queued',textOnly:false,displayParts:${JSON.stringify(displayParts)},prompt:[{type:'text',text:'Full text\\nsecond line'},{type:'resource_link',name:'original.webp',uri:'${uri}',mimeType:'image/webp',size:3}]}});return;
      }
      if (request.method === '${NativeQueuedMessages.readMethod}') {
        if(request.params.sessionId!=='chat'||request.params.inputId!=='queued'||request.params.expectedSessionRevision!==3||request.params.attachmentUri!=='${uri}'||request.params.offset!==0)throw Error('wrong queue image basis');
        send({id:request.id,result:{inputId:'queued',attachmentUri:'${uri}',mimeType:'image/webp',totalBytes:3,offset:0,data:'YWJj',nextOffset:null}});return;
      }
      if (request.method === '_co.grida/session/input') { send({id:request.id,result:{receipt:{sessionId:'chat',inputId:'queued',inputPosition:2,turnId:null,disposition:'queued'},textOnly:false,prompt:[{type:'text',text:'Image attached.'}]}});return; }
      throw Error('unexpected effect '+request.method);
    `,
      1,
      {
        [NativeQueuedMessages.capability]: 1,
        [TRANSCRIPT_WINDOW]: 1,
        "co.grida/session/message-context": 1,
      }
    );
    let chat: NativeAgentChat | undefined;
    try {
      chat = await NativeAgentChat.start({
        ...test.options,
        cwd: fs.realpathSync(test.root),
      });
      const session = await chat.create();
      const basis = await chat.observe(session);
      const page = await chat.queue(session, basis, 0);
      expect(page.items).toEqual([
        {
          inputId: "queued",
          preview: "Full text\nsecond line",
          textOnly: false,
          displayParts,
          attachments: [
            {
              name: "original.webp",
              mimeType: "image/webp",
              size: 3,
              previewId: expect.any(String),
            },
          ],
        },
      ]);
      const message = await chat.queuedMessage(session, basis, "queued");
      expect(message.text).toBe("Full text\nsecond line");
      expect(message.displayParts).toEqual(displayParts);
      expect(JSON.stringify(message)).not.toContain(uri);
      const token = message.attachments![0].previewId!;
      expect(
        Buffer.from(
          await chat.readQueuedAttachmentPreview(
            session,
            basis,
            "queued",
            token
          )
        )
      ).toEqual(Buffer.from("abc"));
      await expect(
        chat.readQueuedAttachmentPreview(session, basis, "other-input", token)
      ).rejects.toThrow("queued_message_unavailable");
      await expect(chat.readAttachmentPreview(session, token)).rejects.toThrow(
        "input_image_unavailable"
      );
      await expect(chat.queuedText(session, basis, "queued")).rejects.toThrow(
        "queue_input_unavailable"
      );
      await expect(
        chat.editQueue(session, basis, {
          action: "replace",
          observationId: "observed",
          requestId: "replace",
          inputId: "queued",
          text: "Replacement",
        })
      ).rejects.toThrow("queue_input_unavailable");
    } finally {
      await chat?.close();
      test.close();
    }
  });

  it.each([null, 1, 2])(
    "negotiates queued-image observation separately from sent previews (%s)",
    async (version) => {
      const test = fixture("send({id:request.id,result:requested});", 1, {
        [NativeQueuedMessages.capability]: version,
      });
      const agent = await NativeAgentProcess.start(test.options);
      try {
        expect(await agent.request("fixture/requested", {})).toMatchObject({
          [NativeQueuedMessages.capability]: 1,
        });
        expect(agent.acceptsQueuedMessages).toBe(version === 1);
      } finally {
        await agent.close();
        test.close();
      }
    }
  );
  it.each([null, 1, 2])(
    "keeps selected-image intake and chunk previews independently negotiated (%s)",
    async (version) => {
      const test = fixture("send({id:request.id,result:requested});", 1, {
        [NativeSelectedImages.capability]: version,
        [NativeInputImages.chunkCapability]: version,
      });
      const agent = await NativeAgentProcess.start(test.options);
      try {
        expect(await agent.request("fixture/requested", {})).toMatchObject({
          [NativeSelectedImages.capability]: 1,
          [NativeInputImages.chunkCapability]: 1,
        });
        expect(agent.supportsSelectedImage).toBe(version === 1);
        expect(agent.acceptsSelectedImage).toBe(false);
        expect(agent.acceptsInputImageChunks).toBe(version === 1);
      } finally {
        await agent.close();
        test.close();
      }
    }
  );

  it("offers selected-image perception only when the model and optional intake agree", async () => {
    const test = fixture(
      "send({id:request.id,result:{}});",
      1,
      { [NativeSelectedImages.capability]: 1 },
      true
    );
    const agent = await NativeAgentProcess.start(test.options);
    try {
      expect(agent.acceptsSelectedImage).toBe(true);
    } finally {
      await agent.close();
      test.close();
    }
  });

  it("replays a large JPEG original through bounded observational chunks without a PNG fallback", async () => {
    const source = Buffer.alloc(320 * 1024, 9);
    source.set([255, 216, 255]);
    const uri = "urn:grida:retained-attachment:jpeg-original";
    const test = fixture(
      `
      if (request.method === 'session/new') { send({id:request.id,result:{sessionId:'chat'}}); return; }
      if (request.method === '${NativeInputImages.chunkMethod}') {
        const original=Buffer.from('${source.toString("base64")}','base64');
        const offset=request.params.offset, bytes=original.subarray(offset,offset+256*1024), next=offset+bytes.length;
        if(request.params.messageId!=='ask'||request.params.attachmentUri!=='${uri}')throw Error('wrong selector');
        send({id:request.id,result:{messageId:'ask',attachmentUri:'${uri}',mimeType:'image/jpeg',totalBytes:original.length,offset,data:bytes.toString('base64'),nextOffset:next===original.length?null:next}});return;
      }
      const capability='${TRANSCRIPT_WINDOW}',read=request.params._meta?.[capability];
      if(!read)throw Error('unexpected request');
      send({method:'session/update',params:{sessionId:'chat',_meta:{[capability]:{requestId:read.requestId}},update:{sessionUpdate:'user_message_chunk',messageId:'ask',content:{type:'resource_link',name:'original.jpg',uri:'${uri}',mimeType:'image/jpeg',size:${source.length}}}}});
      send({id:request.id,result:{_meta:{[capability]:{requestId:read.requestId,view:1,older:null,turns:[]}}}});
    `,
      1,
      {
        [TRANSCRIPT_WINDOW]: 1,
        [NativeInputImages.capability]: null,
        [NativeInputImages.chunkCapability]: 1,
      }
    );
    let chat: NativeAgentChat | undefined;
    try {
      chat = await NativeAgentChat.start({
        ...test.options,
        cwd: fs.realpathSync(test.root),
      });
      const session = await chat.create();
      const preview = (await chat.transcriptPage(session)).messages[0]
        .attachments![0].previewId!;
      expect(preview).toMatch(/^[a-f0-9-]{36}$/);
      expect(
        Buffer.from(await chat.readAttachmentPreview(session, preview))
      ).toEqual(source);
    } finally {
      await chat?.close();
      test.close();
    }
  });
  it.each([null, 2])(
    "refuses an unnegotiated model change without issuing a private RPC (%s)",
    async (version) => {
      const test = fixture("throw new Error('unexpected transition RPC');", 1, {
        "co.grida/session/model-change": version,
      });
      const agent = await NativeAgentProcess.start(test.options);
      try {
        await expect(agent.prepareModelChange()).rejects.toThrow(
          "native_chat_model_change_unsupported"
        );
        expect(agent.modelChangePending).toBe(false);
        expect(agent.connected).toBe(true);
      } finally {
        await agent.close();
        test.close();
      }
    }
  );

  it("seals outbound requests only after an exact native preparation response", async () => {
    const test = fixture(
      `
      if (request.method !== '_co.grida/session/model-change' || JSON.stringify(request.params) !== '{"prepare":true}') throw new Error('wrong transition');
      send({id:request.id,result:{prepared:true}});
    `,
      1,
      { "co.grida/session/model-change": 1 }
    );
    const agent = await NativeAgentProcess.start(test.options);
    try {
      await agent.prepareModelChange();
      expect(agent.modelChangePending).toBe(true);
      await expect(agent.request("session/new", {})).rejects.toThrow(
        "native_chat_model_change_busy"
      );
      expect(() => agent.notify("session/cancel", {})).toThrow(
        "native_chat_model_change_busy"
      );
      await expect(agent.prepareModelChange()).rejects.toThrow(
        "native_chat_model_change_busy"
      );
    } finally {
      await agent.close();
      test.close();
    }
  });

  it("cancels a held composer prediction before preparing a model switch", async () => {
    const test = fixture(
      `
      if (request.method === '_${PREDICT_PROMPT}') {
        globalThis.prediction = request.id;
      } else if (request.method === '$/cancel_request' && request.params.requestId === globalThis.prediction) {
        globalThis.cancelled = true;
      } else if (request.method === '_co.grida/session/model-change' && globalThis.cancelled) {
        send({id:globalThis.prediction,result:{text:'A late suggestion.'}});
        send({id:request.id,result:{prepared:true}});
      } else { throw new Error('unexpected prediction or switch order'); }
      `,
      1,
      { [PREDICT_PROMPT]: 1, "co.grida/session/model-change": 1 }
    );
    const agent = await NativeAgentProcess.start(test.options);
    try {
      const prediction = agent.request(`_${PREDICT_PROMPT}`, {
        sessionId: "chat",
        turnId: "finished",
      });
      await Promise.all([
        expect(prediction).rejects.toThrow("native_chat_prediction_cancelled"),
        agent.prepareModelChange(),
      ]);
      expect(agent.modelChangePending).toBe(true);
    } finally {
      await agent.close();
      test.close();
    }
  });

  it("does not seal the worker while a prior ACP admission is unresolved", async () => {
    const test = fixture(
      `if (request.method !== 'fixture/held') throw new Error('unexpected transition');`,
      1,
      { "co.grida/session/model-change": 1 }
    );
    const agent = await NativeAgentProcess.start(test.options);
    const held = agent
      .request("fixture/held", {})
      .catch((error: Error) => error.message);
    try {
      await expect(agent.prepareModelChange()).rejects.toThrow(
        "native_chat_model_change_pending_work"
      );
      expect(agent.modelChangePending).toBe(false);
    } finally {
      await agent.close();
      await held;
      test.close();
    }
  });

  it("keeps a refused model change usable while a lost preparation stays sealed", async () => {
    const test = fixture(
      `
      if (request.method === '_co.grida/session/model-change') {
        send({id:request.id,result:globalThis.checked ? {} : {blocker:'queued_input'}});
        globalThis.checked = true; return;
      }
      send({id:request.id,result:{view:true}});
    `,
      1,
      { "co.grida/session/model-change": 1 }
    );
    const agent = await NativeAgentProcess.start(test.options);
    try {
      await expect(agent.prepareModelChange()).rejects.toThrow(
        "native_chat_model_change_queued_input"
      );
      expect(agent.modelChangePending).toBe(false);
      await expect(agent.request("fixture/read", {})).resolves.toEqual({
        view: true,
      });
      await expect(agent.prepareModelChange()).rejects.toThrow(
        "native_chat_model_change_unverified"
      );
      expect(agent.modelChangePending).toBe(true);
    } finally {
      await agent.close();
      test.close();
    }
  });

  it.each([null, 1, 2])(
    "negotiates input image preview independently of model perception (%s)",
    async (version) => {
      const test = fixture("send({id:request.id,result:requested});", 1, {
        [NativeInputImages.capability]: version,
      });
      let agent: NativeAgentProcess | undefined;
      try {
        agent = await NativeAgentProcess.start(test.options);
        expect(await agent.request("fixture/requested", {})).toHaveProperty(
          [NativeInputImages.capability],
          1
        );
        expect(agent.acceptsPng).toBe(false);
        expect(agent.acceptsInputImages).toBe(version === 1);
      } finally {
        await agent?.close();
        test.close();
      }
    }
  );

  it.each([false, true])(
    "replays and reads exact PNG previews only with the optional capability (%s)",
    async (enabled) => {
      const png =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jU1sAAAAASUVORK5CYII=";
      const uri = "urn:grida:retained-attachment:image-1";
      const test = fixture(
        `
      if (request.method === 'session/new') { send({id:request.id,result:{sessionId:'chat'}}); return; }
      if (request.method === '${NativeInputImages.readMethod}') {
        if (request.params.sessionId !== 'chat' || request.params.messageId !== 'ask' || request.params.attachmentUri !== '${uri}') throw Error('wrong identity');
        send({id:request.id,result:{messageId:'ask',attachmentUri:'${uri}',mimeType:'image/png',data:'${png}'}}); return;
      }
      const capability = '${TRANSCRIPT_WINDOW}';
      const read = request.params._meta?.[capability];
      if (!read) { send({id:request.id,result:{}}); return; }
      for (const [name,uri] of [['retained.png','${uri}'],['reference.png','file:///private/reference.png']])
        send({method:'session/update',params:{sessionId:'chat',_meta:{[capability]:{requestId:read.requestId}},update:{sessionUpdate:'user_message_chunk',messageId:'ask',content:{type:'resource_link',name,uri,mimeType:'image/png',size:${Buffer.from(png, "base64").length}}}}});
      send({id:request.id,result:{_meta:{[capability]:{requestId:read.requestId,view:1,older:null,turns:[]}}}});
    `,
        1,
        {
          [TRANSCRIPT_WINDOW]: 1,
          [NativeInputImages.capability]: enabled ? 1 : null,
          [NativeInputImages.chunkCapability]: null,
        }
      );
      let chat: NativeAgentChat | undefined;
      try {
        chat = await NativeAgentChat.start({
          ...test.options,
          cwd: fs.realpathSync(test.root),
        });
        const session = await chat.create();
        const page = await chat.transcriptPage(session);
        const attachments = page.messages[0].attachments!;
        expect(attachments[1].previewId).toBeUndefined();
        expect(JSON.stringify(page)).not.toContain(uri);
        expect(JSON.stringify(page)).not.toContain("file:///");
        expect(typeof attachments[0].previewId).toBe(
          enabled ? "string" : "undefined"
        );
        await expect(chat.readAttachmentPreview(session, uri)).rejects.toThrow(
          "input_image_unavailable"
        );
        if (!enabled) return;
        const token = attachments[0].previewId!;
        expect(token).toMatch(/^[a-f0-9-]{36}$/);
        expect(
          new Uint8Array(await chat.readAttachmentPreview(session, token))
        ).toEqual(Uint8Array.from(Buffer.from(png, "base64")));
        await expect(
          chat.readAttachmentPreview({ id: "chat" }, token)
        ).rejects.toThrow("native_chat_attachment_required");
      } finally {
        await chat?.close();
        test.close();
      }
    }
  );

  it("requires the captured provider transport before enabling child work", async () => {
    const test = fixture("");
    try {
      for (const provider of [
        "openai-compatible",
        "responses",
        "anthropic",
        "gemini",
      ] as const) {
        await expect(
          NativeAgentProcess.start({
            ...test.options,
            provider,
            subagents: true,
          })
        ).rejects.toThrow("native_agent_subagent_transport_unavailable");
      }
    } finally {
      test.close();
    }
  });

  it.each([
    { provider: "openai-compatible", endpoint: "http://127.0.0.1:1/v1" },
    { provider: "responses", endpoint: "https://api.openai.com/v1" },
    {
      provider: "responses",
      endpoint: "https://chatgpt.com/backend-api/codex",
      subscriptionScope: "a".repeat(64),
    },
    { provider: "anthropic", endpoint: "https://api.anthropic.com/v1" },
    {
      provider: "gemini",
      endpoint: "https://generativelanguage.googleapis.com/v1beta",
    },
  ] as const)(
    "negotiates harness effort independently of the selected $provider connection at $endpoint",
    async (profile) => {
      const test = fixture("send({id:request.id,result:requested});", 1, {});
      let agent: NativeAgentProcess | undefined;
      try {
        agent = await NativeAgentProcess.start({
          ...test.options,
          ...profile,
          providerNetwork: { prepare: () => null },
          subagents: true,
        });
        const requested = await agent.request("fixture/initialize", {});
        expect(requested).toHaveProperty(["co.grida/session/effort"], 1);
        expect(requested).toHaveProperty(
          [NativeAgentGoals.fundedReviewCapability],
          1
        );
        expect(agent.acceptsEffort).toBe(true);
        expect(agent.acceptsGoalEffort).toBe(true);
        expect(agent.acceptsGoalNamedChild).toBe(true);
        expect(agent.acceptsGoalSpending).toBe(false);
      } finally {
        try {
          await agent?.close();
        } finally {
          test.close();
        }
      }
    }
  );

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

  it.each([true, false])(
    "negotiates prediction separately from foreground model switching on a fixed worker (economy routing %s)",
    async (supported) => {
      const test = fixture(
        `
      if (request.method === '_${PREDICT_PROMPT}') {
        globalThis.prediction = request.id;
      } else if (request.method === 'fixture/finish') {
        send({id:globalThis.prediction,result:{text:'A late suggestion.'}});
        send({id:request.id,result:{}});
      } else if (request.method === 'fixture/worker') {
        send({id: 'worker-' + request.id, ...request.params});
      } else if (String(request.id).startsWith('worker-')) {
        send({id: Number(request.id.slice(7)), result: request.result ?? {error: request.error.message}});
      }`,
        1,
        { [NativeProviderRoutes.predictionCapability]: supported ? 1 : null }
      );
      const lookup = vi.fn<NativeProviderRoutes.PredictionLookup>(
        async (source) => ({ ...source, model: "economy" })
      );
      let agent: NativeAgentProcess | undefined;
      try {
        const endpoint = "https://fixture.test/v1";
        const billing = vi.fn<NativeGatewayConnection["readJobBilling"]>(
          async () => ({ kind: "settled", chargedMills: "1" })
        );
        agent = await NativeAgentProcess.start({
          ...test.options,
          endpoint,
          providerNetwork: {
            prepare: () => async () =>
              new Response("data: ok", {
                headers: { "content-type": "text/event-stream" },
              }),
          },
          gatewayScope: "a".repeat(64),
          gatewayJobBilling: billing,
          lookupPredictionRoute: lookup,
        });
        expect(agent.acceptsInputRoutes).toBe(false);
        expect(agent.acceptsPromptPrediction).toBe(supported);
        const worker = (method: string, params: Record<string, unknown>) =>
          agent!.request("fixture/worker", { method, params });
        const selection = { connectionId: null, model: test.options.model };
        expect(
          await worker(NativeProviderRoutes.resolveMethod, selection)
        ).toHaveProperty("error");
        const turn = {
          sessionId: "chat",
          turnId: "finished",
        };
        const permission = new AbortController();
        const pending = agent.request(
          `_${PREDICT_PROMPT}`,
          turn,
          20_000,
          permission.signal
        );
        void pending.catch(() => {});
        const target = (await worker(NativeProviderRoutes.resolveMethod, {
          ...selection,
          purpose: "composerPrediction",
        })) as { routeId?: string };
        expect(lookup).toHaveBeenCalledTimes(supported ? 1 : 0);
        expect(target).toMatchObject(
          supported
            ? {
                kind: "gateway",
                model: "economy",
                endpoint,
              }
            : { error: "Method not found" }
        );
        if (!supported) return;
        const id = randomUUID();
        expect(
          await worker("_co.grida/provider/exchange", {
            id,
            routeId: target.routeId,
            action: "open",
            target: endpoint + "/chat/completions",
            headers: [
              ["content-type", "application/json"],
              ["accept", "text/event-stream"],
            ],
            initial: Buffer.from("{}").toString("base64"),
            timeoutMs: 1000,
            maxResponseBytes: 32,
          })
        ).toEqual({ status: "accepted" });
        expect(
          await worker("_co.grida/provider/exchange", {
            id,
            routeId: target.routeId,
            action: "dispatch",
          })
        ).toMatchObject({ status: "ready" });
        const read = { id, routeId: target.routeId, action: "read" };
        expect(await worker("_co.grida/provider/exchange", read)).toMatchObject(
          { status: "chunk" }
        );
        expect(await worker("_co.grida/provider/exchange", read)).toEqual({
          status: "end",
        });
        expect(
          await worker(NativeGatewayConnection.readJobBillingMethod, {
            requestId: "req_fixture",
            routeId: randomUUID(),
          })
        ).toEqual({ kind: "unavailable" });
        expect(billing).not.toHaveBeenCalled();
        const reading = Promise.withResolvers<void>();
        const settle = Promise.withResolvers<void>();
        billing.mockImplementationOnce(async () => {
          reading.resolve();
          await settle.promise;
          return { kind: "settled", chargedMills: "1" };
        });
        const receipt = worker(NativeGatewayConnection.readJobBillingMethod, {
          requestId: "req_fixture",
          routeId: target.routeId,
        });
        await reading.promise;
        lookup.mockImplementationOnce(async (source) => ({
          ...source,
          model: "economy",
          maxOutputTokens: 64,
        }));
        const next = await worker(NativeProviderRoutes.resolveMethod, {
          ...selection,
          purpose: "composerPrediction",
        });
        expect(next).toMatchObject({ model: "economy", maxOutputTokens: 64 });
        permission.abort();
        // The worker still owns the cancelled operation. Its delayed resolver
        // cannot take the permission of a new opt-in before it acknowledges.
        expect(
          await agent.request(
            `_${PREDICT_PROMPT}`,
            turn,
            1000,
            new AbortController().signal
          )
        ).toEqual({ text: null });
        expect(
          await worker(NativeProviderRoutes.resolveMethod, {
            ...selection,
            purpose: "composerPrediction",
          })
        ).toEqual({ error: "Provider route unavailable" });
        settle.resolve();
        expect(await receipt).toEqual({ kind: "settled", chargedMills: "1" });
        expect(billing).toHaveBeenCalledOnce();
        await agent.request("fixture/finish", {});
        expect(await pending).toEqual({ text: null });
      } finally {
        try {
          await agent?.close();
        } finally {
          test.close();
        }
      }
    }
  );

  it("retains an open launch exchange while the next model uses its own revocable network authority", async () => {
    const test = fixture(
      `
      if (request.method === 'fixture/worker-request') {
        send({id: 'worker-' + request.id, ...request.params});
      } else if (String(request.id).startsWith('worker-')) {
        send({id: Number(request.id.slice(7)), result: request.result ?? {error: request.error.message}});
      }`,
      1,
      {}
    );
    let agent: NativeAgentProcess | undefined;
    let generation = 1;
    let listed = true;
    const dispatches: string[] = [];
    const network = (name: string) => {
      const captured = generation;
      const isCurrent = () => generation === captured;
      return {
        isCurrent,
        prepare: () =>
          !isCurrent()
            ? null
            : async () => {
                dispatches.push(name);
                return new Response("data: ok", {
                  headers: { "content-type": "text/event-stream" },
                });
              },
      };
    };
    try {
      const connectionId = "b".repeat(64);
      const endpoint = "http://127.0.0.1:2/v1";
      agent = await NativeAgentProcess.start({
        ...test.options,
        providerNetwork: network("A"),
        lookupProviderRoute: async (id, model) => {
          const primary = id === null && model === test.options.model;
          if (!primary && (!listed || id !== connectionId || model !== "B"))
            throw new Error("unknown selection");
          return {
            prepare: async () => ({
              launch: {
                provider: "openai-compatible",
                model,
                endpoint: primary ? test.options.endpoint : endpoint,
                providerNetwork: network(primary ? "A" : "B"),
              },
            }),
          };
        },
      });
      expect(agent.acceptsInputRoutes).toBe(true);
      const worker = (method: string, params: Record<string, unknown>) =>
        agent!.request("fixture/worker-request", { method, params });
      const exchange = (params: Record<string, unknown>) =>
        worker("_co.grida/provider/exchange", params);
      const open = (id: string, base: string, routeId?: string) =>
        exchange({
          action: "open",
          id,
          routeId,
          target: base + "/chat/completions",
          headers: [
            ["content-type", "application/json"],
            ["accept", "text/event-stream"],
          ],
          initial: Buffer.from("{}").toString("base64"),
          timeoutMs: 10_000,
          maxResponseBytes: 32,
        });
      const resolve = (id: string | null, model: string) =>
        worker("_co.grida/provider/resolve", {
          connectionId: id,
          model,
        }) as Promise<{ routeId: string }>;
      expect(await resolve(null, test.options.model)).toMatchObject({
        kind: "launch",
      });
      const active = randomUUID(),
        next = randomUUID();
      expect(await open(active, test.options.endpoint)).toEqual({
        status: "accepted",
      });
      const route = await resolve(connectionId, "B");
      expect(route).toMatchObject({
        kind: "http",
        protocol: "openai-compatible",
        model: "B",
        endpoint,
      });
      expect(await open(next, test.options.endpoint, route.routeId)).toEqual({
        status: "unavailable",
      });
      expect(await open(next, endpoint, randomUUID())).toEqual({
        status: "unavailable",
      });
      expect(await open(next, endpoint, route.routeId)).toEqual({
        status: "accepted",
      });
      expect(await exchange({ action: "dispatch", id: next })).toEqual({
        status: "unavailable",
      });
      expect(
        await exchange({ action: "dispatch", id: next, routeId: route.routeId })
      ).toMatchObject({ status: "ready" });
      expect(await exchange({ action: "dispatch", id: active })).toMatchObject({
        status: "ready",
      });
      const revoked = randomUUID();
      expect(await open(revoked, endpoint, route.routeId)).toEqual({
        status: "accepted",
      });
      generation++;
      expect(
        await exchange({
          action: "dispatch",
          id: revoked,
          routeId: route.routeId,
        })
      ).toEqual({ status: "unavailable" });
      expect(await resolve(null, test.options.model)).toMatchObject({
        kind: "http",
        endpoint: test.options.endpoint,
      });
      const reauthorized = await resolve(connectionId, "B");
      expect(reauthorized.routeId).toBeDefined();
      expect(reauthorized.routeId).not.toBe(route.routeId);
      const fresh = randomUUID();
      expect(await open(fresh, endpoint, reauthorized.routeId)).toMatchObject({
        status: "accepted",
      });
      expect(
        await exchange({
          action: "dispatch",
          id: fresh,
          routeId: reauthorized.routeId,
        })
      ).toMatchObject({ status: "ready" });
      listed = false;
      expect(await resolve(connectionId, "B")).toHaveProperty("error");
      expect(dispatches).toEqual(["B", "A", "B"]);
    } finally {
      try {
        await agent?.close();
      } finally {
        test.close();
      }
    }
  });

  it("answers a provider exchange beyond the concurrency bound without disconnecting", async () => {
    const test = fixture(
      `
      if (request.method === 'fixture/flood') {
        globalThis.flood = request.id;
        globalThis.replies = [];
        let lines = '';
        for (let index = 1; index <= 17; index++)
          lines += JSON.stringify({jsonrpc:'2.0',id:'exchange-'+index,method:'_co.grida/provider/exchange',params:{id:'unknown',action:'read'}}) + '\\n';
        process.stdout.write(lines);
      } else if (request.method === undefined && String(request.id).startsWith('exchange-')) {
        globalThis.replies.push([request.id, request.result && request.result.status]);
        if (globalThis.replies.length === 17)
          send({id:globalThis.flood,result:{replies:globalThis.replies}});
      } else if (request.method === 'fixture/ping') {
        send({id:request.id,result:{pong:true}});
      }
    `,
      1,
      {}
    );
    let agent: NativeAgentProcess | undefined;
    try {
      agent = await NativeAgentProcess.start({
        ...test.options,
        providerNetwork: { prepare: () => null },
      });
      const { replies } = (await agent.request("fixture/flood", {})) as {
        replies: [string, string][];
      };
      // The bound is answered at once; admitted exchanges answer after it.
      expect(replies[0]).toEqual(["exchange-17", "unavailable"]);
      expect(replies).toHaveLength(17);
      expect(new Set(replies.map(([, status]) => status))).toEqual(
        new Set(["unavailable"])
      );
      expect(agent.connected).toBe(true);
      await expect(agent.request("fixture/ping", {})).resolves.toEqual({
        pong: true,
      });
    } finally {
      try {
        await agent?.close();
      } finally {
        test.close();
      }
    }
  });

  it.each([true, false])(
    "scopes Desktop MCP discovery and calls to an exact endpoint (negotiated: %s)",
    async (negotiated) => {
      const test = fixture(
        `
        if (request.method === 'fixture/reverse') {
          if (requested['${NativeDesktopTools.capability}'] !== 1) throw Error('missing capability');
          globalThis.reverse = request.id;
          send({id:'reverse',...request.params});
        } else if (request.id === 'reverse') {
          send({id:globalThis.reverse,result:request});
        }
      `,
        1,
        { [NativeDesktopTools.capability]: negotiated ? 1 : null }
      );
      let agent: NativeAgentProcess | undefined;
      try {
        agent = await NativeAgentProcess.start({
          ...test.options,
          providerNetwork: { prepare: () => null },
        });
        const current = agent;
        let valid = true;
        const lease = current.registerEditorSurfaces(
          "chat",
          { active: "/initial.svg", open: ["/initial.svg"], truncated: false },
          () => {
            if (!valid) throw new Error("owner revoked");
          },
          undefined
        )!;
        const endpointId = lease.selection().editorEndpointId;
        const identity = { sessionId: "chat", endpointId };
        const reverse = (method: string, params: object) =>
          current.request("fixture/reverse", { method, params });
        const list = { jsonrpc: "2.0", id: "list", method: "tools/list" };
        const reply = (message: object, owner = identity) =>
          reverse(NativeDesktopTools.method, {
            ...owner,
            message,
            timeoutMs: 2000,
            expiresAtMs: Date.now() + 2000,
          });
        const legacy = !negotiated
          ? await reverse(NativeEditorSurfaceEndpoints.readMethod, identity)
          : undefined;
        const expectedLegacy = expect.objectContaining({
          result: expect.objectContaining({
            ...identity,
            available: true,
            active: "/initial.svg",
          }),
        });
        expect(legacy).toEqual(negotiated ? undefined : expectedLegacy);
        const listReply = await reply(list);
        expect(listReply).toMatchObject(
          negotiated
            ? {
                result: {
                  ...identity,
                  message: {
                    jsonrpc: "2.0",
                    id: "list",
                    result: {
                      resultType: "complete",
                      tools: [
                        {
                          name: "surface_list_open",
                          annotations: { readOnlyHint: true },
                          inputSchema: {
                            type: "object",
                            additionalProperties: false,
                          },
                          outputSchema: { type: "object" },
                          _meta: { "co.grida/definitionRevision": 2 },
                        },
                      ],
                    },
                  },
                },
              }
            : { error: { code: -32601 } }
        );
        if (!negotiated) return;
        const call = (revision: number, args = {}) => ({
          jsonrpc: "2.0",
          id: "call",
          method: "tools/call",
          params: {
            name: "surface_list_open",
            arguments: args,
            _meta: {
              "io.modelcontextprotocol/protocolVersion": "2026-07-28",
              "co.grida/definitionRevision": revision,
            },
          },
        });
        await expect(reply(call(3))).resolves.toMatchObject({
          result: { message: { id: "call", error: { code: -32002 } } },
        });
        await expect(
          reply(call(2, { path: "/initial.svg" }))
        ).resolves.toMatchObject({
          result: {
            message: {
              id: "call",
              result: {
                resultType: "complete",
                isError: true,
                content: [
                  { type: "text", text: "invalid_editor_surface_arguments" },
                ],
              },
            },
          },
        });
        lease.update({ active: null, open: ["/later.svg"], truncated: true });
        await expect(reply(call(2))).resolves.toMatchObject({
          result: {
            ...identity,
            message: {
              jsonrpc: "2.0",
              id: "call",
              result: {
                resultType: "complete",
                content: [],
                isError: false,
                _meta: { "co.grida/truncated": true },
                structuredContent: {
                  interactive: true,
                  active: null,
                  open: ["/later.svg"],
                  truncated: true,
                },
              },
            },
          },
        });
        await expect(
          reply(list, { ...identity, sessionId: "other-chat" })
        ).resolves.toMatchObject({
          result: { message: { id: "list", error: { code: -32001 } } },
        });
        valid = false;
        const replacement = current.registerEditorSurfaces(
          "chat",
          {
            active: "/replacement.svg",
            open: ["/replacement.svg"],
            truncated: false,
          },
          () => {},
          undefined
        )!;
        await expect(reply(call(2))).resolves.toMatchObject({
          result: {
            ...identity,
            message: { id: "call", error: { code: -32001 } },
          },
        });
        const next = {
          sessionId: "chat",
          endpointId: replacement.selection().editorEndpointId,
        };
        expect(next.endpointId).not.toBe(endpointId);
        await expect(reply(list, next)).resolves.toMatchObject({
          result: {
            ...next,
            message: {
              result: {
                tools: [
                  {
                    name: "surface_list_open",
                    _meta: { "co.grida/definitionRevision": 2 },
                  },
                ],
              },
            },
          },
        });
        await expect(reply(call(2), next)).resolves.toMatchObject({
          result: {
            ...next,
            message: {
              result: { structuredContent: { active: "/replacement.svg" } },
            },
          },
        });
      } finally {
        try {
          await agent?.close();
        } finally {
          test.close();
        }
      }
    }
  );

  it("discovers and dispatches SVG text and artifact presentation under their separate scopes", async () => {
    const test = fixture(
      `
        if (request.method === 'fixture/reverse') {
          globalThis.reverse = request.id;
          send({id:'scoped',method:'${NativeDesktopTools.method}',params:request.params});
        } else if (request.id === 'scoped') {
          send({id:globalThis.reverse,result:request});
        }
      `,
      1,
      {
        [NativeEditorSurfaceEndpoints.openCapability]: null,
        [NativeEditorSurfaceEndpoints.svgTextCapability]: null,
      }
    );
    const agent = await NativeAgentProcess.start({
      ...test.options,
      providerNetwork: { prepare: () => null },
    });
    try {
      const target = randomUUID();
      const presented: string[] = [];
      const changes: string[] = [];
      let onPresentation: (() => void) | undefined;
      const lease = agent.registerEditorSurfaces(
        "chat",
        { active: "/initial.svg", open: ["/initial.svg"], truncated: false },
        () => {},
        (request) => {
          presented.push(request.path);
          onPresentation?.();
        },
        1,
        async ({ targetId, operation }) => {
          expect(targetId).toBe(target);
          if (operation.kind === "read")
            return {
              kind: "read",
              path: "/initial.svg",
              revision: target,
              text: "Original",
            };
          changes.push(operation.text);
          return { kind: "applied", path: "/initial.svg", saved: false };
        }
      )!;
      const endpointId = lease.selection(target).editorEndpointId;
      const svg = { svgTargetId: target };
      const presentation = { presentation: true };
      const request = (
        message: object,
        scope?: object,
        expiresAtMs = Date.now() + 2000
      ) =>
        agent.request("fixture/reverse", {
          sessionId: "chat",
          endpointId,
          scope,
          message,
          timeoutMs: 2000,
          expiresAtMs,
        });
      const list = (scope?: object) =>
        request({ jsonrpc: "2.0", id: "list", method: "tools/list" }, scope);
      const call = (
        name: string,
        revision: number,
        args: object,
        scope?: object,
        id = randomUUID(),
        expiresAtMs?: number
      ) =>
        request(
          {
            jsonrpc: "2.0",
            id,
            method: "tools/call",
            params: {
              name,
              arguments: args,
              _meta: { "co.grida/definitionRevision": revision },
            },
          },
          scope,
          expiresAtMs
        );
      const names = (tools: string[]) => ({
        result: {
          message: { result: { tools: tools.map((name) => ({ name })) } },
        },
      });
      await expect(list()).resolves.toMatchObject(names(["surface_list_open"]));
      await expect(list(svg)).resolves.toMatchObject(
        names([
          "surface_list_open",
          "svg_read_selected_text",
          "svg_replace_selected_text",
        ])
      );
      await expect(list(presentation)).resolves.toMatchObject(
        names(["surface_list_open", "surface_open"])
      );
      await expect(
        list({ ...svg, presentation: false })
      ).resolves.toMatchObject({
        error: { code: -32602 },
      });
      await expect(
        call("surface_open", 2, { path: "/initial.svg" }, svg)
      ).resolves.toMatchObject({
        result: { message: { error: { code: -32602 } } },
      });
      expect(presented).toEqual([]);
      const expired = Date.now() - 1;
      const deadlineElapsed = {
        result: {
          message: {
            error: { code: -32004, message: "desktop_tool_deadline_elapsed" },
          },
        },
      };
      await expect(
        call(
          "surface_open",
          2,
          { path: "/initial.svg" },
          presentation,
          randomUUID(),
          expired
        )
      ).resolves.toMatchObject(deadlineElapsed);
      await expect(
        call(
          "svg_replace_selected_text",
          1,
          { revision: target, text: "Expired" },
          svg,
          randomUUID(),
          expired
        )
      ).resolves.toMatchObject(deadlineElapsed);
      expect(presented).toEqual([]);
      expect(changes).toEqual([]);
      const id = randomUUID();
      for (const _ of [0, 1])
        await expect(
          call("surface_open", 2, { path: "/initial.svg" }, presentation, id)
        ).resolves.toMatchObject({
          result: {
            message: {
              result: {
                structuredContent: {
                  path: "/initial.svg",
                  requested: true,
                  reason: "dispatched",
                },
              },
            },
          },
        });
      expect(presented).toEqual(["/initial.svg"]);
      await expect(
        call("svg_read_selected_text", 1, {}, svg)
      ).resolves.toMatchObject({
        result: {
          message: {
            result: {
              structuredContent: {
                kind: "read",
                path: "/initial.svg",
                revision: target,
                text: "Original",
              },
            },
          },
        },
      });
      await expect(
        call(
          "svg_replace_selected_text",
          1,
          { revision: randomUUID(), text: "Wrong" },
          svg
        )
      ).resolves.toMatchObject({
        result: {
          message: {
            result: {
              isError: true,
              content: [{ type: "text", text: "svg_text_revision_changed" }],
            },
          },
        },
      });
      expect(changes).toEqual([]);
      await expect(
        call(
          "svg_replace_selected_text",
          1,
          { revision: target, text: "Updated" },
          svg
        )
      ).resolves.toMatchObject({
        result: {
          message: {
            result: {
              structuredContent: {
                kind: "applied",
                path: "/initial.svg",
                saved: false,
              },
            },
          },
        },
      });
      expect(changes).toEqual(["Updated"]);

      const delivered = Promise.withResolvers<void>();
      const stdin = agent["child"].stdin;
      const padding = "fixture/pad";
      const emptyFrame = Buffer.byteLength(
        JSON.stringify({
          jsonrpc: "2.0",
          method: padding,
          params: { text: "" },
        }) + "\n"
      );
      onPresentation = () => {
        stdin.cork();
        agent.notify(padding, { text: "x".repeat(1024 * 1024 - emptyFrame) });
        delivered.resolve();
      };
      const pending = call(
        "surface_open",
        2,
        { path: "/second.svg" },
        presentation
      );
      await Promise.race([delivered.promise, pending]);
      expect(stdin.writableLength).toBe(1024 * 1024);
      lease.close();
      stdin.uncork();
      await expect(pending).resolves.toMatchObject({
        result: { message: { error: { code: -32603 } } },
      });
      expect(presented).toEqual(["/initial.svg", "/second.svg"]);
      await expect(list(svg)).resolves.toMatchObject({
        result: { message: { error: { code: -32001 } } },
      });
    } finally {
      agent["child"].stdin.uncork();
      await agent.close();
      test.close();
    }
  });

  it("cancels the exact pending private SVG reply and discards late renderer evidence", async () => {
    const test = fixture(
      `
        if (request.method === 'fixture/start') {
          send({id:'pending',method:'${NativeDesktopTools.method}',params:request.params});
          send({id:request.id,result:{}});
        } else if (request.method === 'fixture/cancel') {
          send({method:'$/cancel_request',params:{requestId:'pending'}});
          send({id:request.id,result:{}});
        } else if (request.method === 'fixture/observed') {
          send({id:request.id,result:{replied:globalThis.replied === true}});
        } else if (request.id === 'pending') {
          globalThis.replied = true;
        }
      `,
      1,
      {}
    );
    const agent = await NativeAgentProcess.start({
      ...test.options,
      providerNetwork: { prepare: () => null },
    });
    const sent = Promise.withResolvers<void>();
    const settled = Promise.withResolvers<void>();
    const replies = new NativeEditorSvgReplies(
      NativeEditorSvgText.result,
      "native_chat_svg_text_unverified"
    );
    try {
      const target = randomUUID();
      const callId = randomUUID();
      const lease = agent.registerEditorSurfaces(
        "chat",
        { active: "/initial.svg", open: ["/initial.svg"], truncated: false },
        () => {},
        undefined,
        undefined,
        (request, signal) =>
          replies
            .dispatch("attachment", request, () => sent.resolve(), signal)
            .finally(() => settled.resolve())
      )!;
      await agent.request("fixture/start", {
        sessionId: "chat",
        endpointId: lease.selection(target).editorEndpointId,
        scope: { svgTargetId: target },
        timeoutMs: 2000,
        expiresAtMs: Date.now() + 2000,
        message: {
          jsonrpc: "2.0",
          id: callId,
          method: "tools/call",
          params: {
            name: "svg_replace_selected_text",
            arguments: { revision: target, text: "Sent" },
            _meta: { "co.grida/definitionRevision": 1 },
          },
        },
      });
      await sent.promise;
      await agent.request("fixture/cancel", {});
      await settled.promise;
      expect(() =>
        replies.respond("attachment", callId, {
          kind: "applied",
          path: "/initial.svg",
          saved: false,
        })
      ).toThrow("native_chat_svg_text_unverified");
      await expect(agent.request("fixture/observed", {})).resolves.toEqual({
        replied: false,
      });
    } finally {
      await agent.close();
      test.close();
    }
  });

  it("keeps the legacy SVG text grant when the native host omits the editor context capability", async () => {
    const test = fixture("", 1, {
      [NativeEditorSurfaceEndpoints.toolContextCapability]: null,
    });
    const agent = await NativeAgentProcess.start({
      ...test.options,
      providerNetwork: { prepare: () => null },
    });
    try {
      const svgText = randomUUID();
      const lease = agent.registerEditorSurfaces(
        "chat",
        { active: "/initial.svg", open: ["/initial.svg"], truncated: false },
        () => {},
        undefined,
        undefined,
        async () => ({ kind: "unavailable" }),
        undefined,
        async () => ({ kind: "stale" })
      )!;
      expect(agent.acceptsEditorToolContext).toBe(false);
      expect(
        lease.selection(svgText, { targetId: randomUUID(), inputId: "input" })
      ).toEqual({
        editorEndpointId: expect.any(String),
        editorSvgTargetId: svgText,
      });
    } finally {
      await agent.close();
      test.close();
    }
  });

  it("settles the SVG reply when the owner is released during send", async () => {
    const replies = new NativeEditorSvgReplies(
      NativeEditorSvgText.result,
      "native_chat_svg_text_unverified"
    );
    const scope = new AbortController();
    const callId = randomUUID();
    await expect(
      replies.dispatch(
        "attachment",
        {
          callId,
          expiresAtMs: Date.now() + 1000,
        },
        () => {
          scope.abort();
          throw new Error("native_chat_scope_changed");
        },
        scope.signal
      )
    ).rejects.toThrow("native_chat_svg_text_unverified");
    expect(() =>
      replies.respond("attachment", callId, { kind: "unavailable" })
    ).toThrow("native_chat_svg_text_unverified");
  });

  it("rejects a renderer reply after the deadline even if the expiry timer has not run", async () => {
    let now = 1000;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    try {
      const replies = new NativeEditorSvgReplies(
        NativeEditorSvgText.result,
        "native_chat_svg_text_unverified"
      );
      const callId = randomUUID();
      const pending = replies.dispatch(
        "attachment",
        { callId, expiresAtMs: 2000 },
        () => {}
      );
      now = 2000;
      replies.respond("attachment", callId, {
        kind: "applied",
        path: "/initial.svg",
        saved: false,
      });
      await expect(pending).rejects.toThrow("native_chat_svg_text_unverified");
    } finally {
      clock.mockRestore();
    }
  });

  it.each([{ backpressure: false }, { backpressure: true }])(
    "rejects an excess browser operation (backpressure: $backpressure)",
    async ({ backpressure }) => {
      const callId = (index: number) =>
        `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
      const test = fixture(
        `
      if (request.method === 'fixture/browser-flood') {
        globalThis.flood = request.id;
        for (let index = 1; index <= 17; index++) {
          send({id:'browser-'+index,method:'${NativeEditorSurfaceEndpoints.browserMethod}',params:{
            sessionId:'session',endpointId:request.params.endpointId,
            callId:'00000000-0000-4000-8000-'+String(index).padStart(12,'0'),
            operation:'browser_snapshot',arguments:{},timeoutMs:5000
          }});
        }
        send({method:'session/update',params:'browser-flood-sent'});
      } else if (request.method === undefined && request.id === 'browser-17') {
        send({id:globalThis.flood,result:request.result});
      } else if (request.method === 'fixture/ping') {
        send({id:request.id,result:{pong:true}});
      }
    `,
        1,
        {}
      );
      const admitted = Promise.withResolvers<void>();
      const floodSent = Promise.withResolvers<void>();
      let invoked = 0;
      let agent: NativeAgentProcess | undefined;
      try {
        agent = await NativeAgentProcess.start({
          ...test.options,
          providerNetwork: { prepare: () => null },
          onSessionUpdate: (params) => {
            if (params === "browser-flood-sent") floodSent.resolve();
          },
        });
        const stdin = agent["child"].stdin;
        const method = "fixture/pad";
        const paddingFrameBytes = Buffer.byteLength(
          JSON.stringify({ jsonrpc: "2.0", method, params: { padding: "" } }) +
            "\n"
        );
        const frameLimit = 1024 * 1024;
        const lease = agent.registerEditorSurfaces(
          "session",
          { active: null, open: [], truncated: false },
          () => {},
          undefined,
          undefined,
          undefined,
          {
            ready: () => true,
            invoke: async () => {
              invoked++;
              if (backpressure && invoked === 16) {
                // Hold the full writable backlog until Main processes the excess request.
                stdin.cork();
                agent!.notify(method, {
                  padding: "x".repeat(frameLimit - paddingFrameBytes),
                });
              }
              await admitted.promise;
              return { disposition: "not_dispatched" };
            },
            close: () => {},
          }
        );
        const selection = lease!.selection();
        expect(selection.editorBrowserTools).toBe(true);
        const endpointId = selection.editorEndpointId;
        const flood = agent.request(
          "fixture/browser-flood",
          { endpointId },
          3_000
        );
        await Promise.race([floodSent.promise, flood]);
        expect(stdin.writableLength === frameLimit).toBe(backpressure);
        stdin.uncork();
        await expect(flood).resolves.toEqual({
          sessionId: "session",
          endpointId,
          callId: callId(17),
          result: { disposition: "not_dispatched", error: "backend_busy" },
        });
        expect(invoked).toBe(16);
        expect(agent.connected).toBe(true);
        await expect(agent.request("fixture/ping", {}, 3_000)).resolves.toEqual(
          {
            pong: true,
          }
        );
      } finally {
        admitted.resolve();
        agent?.["child"].stdin.uncork();
        try {
          await agent?.close();
        } finally {
          test.close();
        }
      }
    }
  );

  it.each([
    { carrier: "legacy", revoked: false },
    { carrier: "legacy", revoked: true },
    { carrier: "mcp", revoked: false },
    { carrier: "mcp", revoked: true },
    { carrier: "registered MCP", revoked: false },
    { carrier: "registered MCP", revoked: true },
  ])(
    "delivers a $carrier browser capture through stdin pressure (owner revoked: $revoked)",
    async ({ carrier, revoked }) => {
      const callId = "00000000-0000-4000-8000-000000000001";
      const shared = carrier !== "legacy";
      const sources = carrier === "registered MCP";
      const methodName = shared
        ? NativeDesktopTools.method
        : NativeEditorSurfaceEndpoints.browserMethod;
      const params = shared
        ? `scope:{browser:true${sources ? ",sources:true" : ""}},expiresAtMs:Date.now()+5000,message:{
            jsonrpc:'2.0',id:'${callId}',method:'tools/call',params:{
              name:'browser_capture',arguments:{},_meta:{'co.grida/definitionRevision':1${sources ? ", 'co.grida/source': request.params.source" : ""}}
            }
          }`
        : `callId:'${callId}',operation:'browser_capture',arguments:{}`;
      const test = fixture(
        `
      if (request.method === 'fixture/ping') {
        globalThis.ping = request.id;
      } else if (request.method === 'fixture/list') {
        if (requested['${NativeDesktopTools.sourcesCapability}'] !== 1) throw Error('missing source capability');
        globalThis.list = request.id;
        send({id:'list',method:'${NativeDesktopTools.method}',params:{
          sessionId:'session',endpointId:request.params.endpointId,
          timeoutMs:5000,expiresAtMs:Date.now()+5000,scope:{sources:true,browser:true},
          message:{jsonrpc:'2.0',id:'list',method:'tools/list'}
        }});
      } else if (request.method === undefined && request.id === 'list') {
        send({id:globalThis.list,result:request.result.message});
      } else if (request.method === 'fixture/capture') {
        globalThis.capture = request.id;
        send({id:'capture',method:'${methodName}',params:{
          sessionId:'session',endpointId:request.params.endpointId,
          timeoutMs:5000,${params}
        }});
      } else if (request.method === undefined && request.id === 'capture') {
        send({id:globalThis.capture,result:request.result});
        send({id:globalThis.ping,result:{pong:true}});
      }
    `,
        1,
        {}
      );
      const entered = Promise.withResolvers<void>();
      const complete = Promise.withResolvers<void>();
      const image = {
        mimeType: "image/jpeg" as const,
        base64: Buffer.alloc(256 * 1024, 7).toString("base64"),
      };
      let agent: NativeAgentProcess | undefined;
      try {
        agent = await NativeAgentProcess.start({
          ...test.options,
          providerNetwork: { prepare: () => null },
        });
        const stdin = agent["child"].stdin;
        const frameLimit = 1024 * 1024;
        const method = "fixture/pad";
        const paddingFrameBytes = Buffer.byteLength(
          JSON.stringify({ jsonrpc: "2.0", method, params: { padding: "" } }) +
            "\n"
        );
        const lease = agent.registerEditorSurfaces(
          "session",
          { active: null, open: [], truncated: false },
          () => {},
          undefined,
          undefined,
          undefined,
          {
            ready: () => true,
            invoke: async () => {
              stdin.cork();
              agent!.notify(method, {
                padding: "x".repeat(frameLimit - paddingFrameBytes),
              });
              entered.resolve();
              await complete.promise;
              return { disposition: "dispatched_verified", image };
            },
            close: () => {},
          }
        );
        const { editorEndpointId: endpointId } = lease!.selection();
        const catalog = sources
          ? ((await agent.request("fixture/list", {
              endpointId,
            })) as NativeDesktopTools.Reply)
          : undefined;
        const source =
          catalog &&
          NativeDesktopTools.listedSources(catalog).find(
            ({ id }) => id === "browser"
          );
        const descriptors =
          catalog && "result" in catalog && Array.isArray(catalog.result.tools)
            ? catalog.result.tools.filter(({ name }) =>
                ["workbench_list_tabs", "browser_capture"].includes(name)
              )
            : [];
        const expectedDescriptors = [
          {
            name: "workbench_list_tabs",
            _meta: {
              "co.grida/source": {
                id: "workbench",
                generation: expect.any(String),
              },
              "co.grida/resultDisposition": true,
            },
          },
          {
            name: "browser_capture",
            _meta: {
              "co.grida/source": {
                ...source,
                id: "browser",
                generation: expect.any(String),
              },
              "co.grida/resultDisposition": true,
              "co.grida/resultMimeType": "image/jpeg",
            },
          },
        ];
        expect(descriptors).toMatchObject(sources ? expectedDescriptors : []);
        const replies = Promise.all([
          agent.request("fixture/ping", {}, 3000),
          agent.request("fixture/capture", { endpointId, source }, 3000),
        ]);
        await Promise.race([entered.promise, replies]);
        complete.resolve();
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(agent.connected).toBe(true);
        expect(stdin.writableLength).toBe(frameLimit);
        if (revoked) lease!.close();
        stdin.uncork();
        const disposition = revoked ? "unknown" : "dispatched_verified";
        const result = revoked
          ? { disposition, error: "outcome_unknown" }
          : { disposition };
        await expect(replies).resolves.toEqual([
          { pong: true },
          {
            sessionId: "session",
            endpointId,
            ...(shared
              ? {
                  message: {
                    jsonrpc: "2.0",
                    id: callId,
                    result: {
                      resultType: "complete",
                      _meta: { "co.grida/disposition": disposition },
                      isError: revoked,
                      structuredContent: result,
                      content: revoked
                        ? [{ type: "text", text: "outcome_unknown" }]
                        : [
                            {
                              type: "image",
                              mimeType: image.mimeType,
                              data: image.base64,
                            },
                          ],
                    },
                  },
                }
              : { callId, result: revoked ? result : { ...result, image } }),
          },
        ]);
      } finally {
        complete.resolve();
        agent?.["child"].stdin.uncork();
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

  it.each([true, false])(
    "reads the negotiated question contract and sends the matching answer (%s)",
    async (batchAvailable) => {
      const batch = {
        waitId: "batch",
        style: "nonblocking",
        questions: [
          {
            id: "format",
            header: "Format",
            question: "Which format?",
            options: [{ label: "Print", description: "Ready for press" }],
          },
          { id: "theme", question: "Which theme?", options: [] },
        ],
      };
      const singleton = {
        waitId: "single",
        style: "answer_dependent",
        question: "Which edition?",
        options: ["Screen"],
      };
      const legacyAnswers = { answer: { kind: "choice", index: 0 } };
      const batchAnswers = {
        answers: [
          { id: "format", answer: { kind: "choice", index: 0 } },
          { id: "theme", answer: { kind: "skipped" } },
        ],
      } as const;
      const test = fixture(
        `
        if (request.method === 'session/new') {
          send({id:request.id,result:{sessionId:'chat'}});
          return;
        }
        if (request.method === '_co.grida/session/snapshot') {
          const turn = {turnId:'turn',epoch:1,journalPosition:8,historyPosition:3,
            controlRevision:4,paused:false,cancelled:false,disposition:'running',status:null};
          send({id:request.id,result:{sessionId:'chat',sessionRevision:2,queuedInputs:0,
            queue:[],admissionPaused:false,current:turn,latest:turn}});
          return;
        }
        const p = request.params;
        if (p.sessionId !== 'chat' || p.turnId !== 'turn') throw Error('wrong target');
        const batchAvailable = ${batchAvailable};
        const list = batchAvailable ? '_${QUESTION_BATCHES.list}' : '_co.grida/session/questions';
        if (request.method === list) {
          send({id:request.id,result:{sessionId:'chat',turnId:'turn',controlRevision:4,
            historyPosition:3,questions:${JSON.stringify(batchAvailable ? [batch, singleton] : [singleton])}}});
          return;
        }
        const isBatch = p.waitId === 'batch';
        const method = isBatch ? '_${QUESTION_BATCHES.answer}' : '_co.grida/session/answer-question';
        const expected = isBatch ? ${JSON.stringify(batchAnswers)} : ${JSON.stringify(legacyAnswers)};
        const {answers, answer} = p;
        if (request.method !== method || p.expectedHistoryPosition !== 3 ||
          p.expectedSessionRevision !== 2 || p.expectedControlRevision !== 4 ||
          JSON.stringify({answers, answer}) !== JSON.stringify(expected))
          throw Error('wrong answer or basis');
        send({id:request.id,result:{sessionId:'chat',turnId:'turn',requestId:p.requestId,
          sessionRevision:3,journalPosition:9}});
        `,
        1,
        {
          [QUESTION_BATCHES.list]: 1,
          [QUESTION_BATCHES.answer]: batchAvailable ? 1 : null,
          "co.grida/session/optional-questions": 1,
        }
      );
      let chat: NativeAgentChat | undefined;
      try {
        chat = await NativeAgentChat.start({
          ...test.options,
          cwd: fs.realpathSync(test.root),
        });
        const session = await chat.create();
        const snapshot = await chat.observe(session);
        const reviews = await chat.questions(session, snapshot);
        expect(reviews).toHaveLength(batchAvailable ? 2 : 1);
        expect(reviews.at(-1)).toMatchObject(singleton);
        expect(
          await chat.answerQuestion(session, reviews.at(-1)!, {
            kind: "choice",
            index: 0,
          })
        ).toMatchObject({ sessionId: "chat", turnId: "turn" });
        expect(reviews.filter((review) => "questions" in review)).toMatchObject(
          batchAvailable ? [{ ...batch, expiresWithTurn: true }] : []
        );
        const batchReceipt = batchAvailable
          ? await chat.answerQuestion(session, reviews[0], {
              kind: "batch",
              answers: batchAnswers.answers,
            })
          : undefined;
        expect(batchReceipt?.sessionId).toBe(
          batchAvailable ? "chat" : undefined
        );
        expect(batchReceipt?.turnId).toBe(batchAvailable ? "turn" : undefined);
      } finally {
        await chat?.close();
        test.close();
      }
    }
  );

  it.each([true, false])(
    "isolates the renderer question protocol across concurrent admissions (%s)",
    async (batchAvailable) => {
      const test = fixture("send({id:request.id,result:request.params});", 1, {
        [QUESTION_BATCHES.list]: 1,
        [QUESTION_BATCHES.answer]: batchAvailable ? 1 : null,
      });
      let process: NativeAgentProcess | undefined;
      try {
        const agent = (process = await NativeAgentProcess.start(test.options));
        const methods = [
          "_co.grida/session/submit",
          "_co.grida/session/enqueue",
          "_co.grida/session/replace",
          "_co.grida/session/revise",
          "_co.grida/goal/start",
          "_co.grida/session/replace-text",
          "_co.grida/session/questions",
        ];
        const payload = { _meta: { "co.grida/selectionRevision": 4 } };
        const ready = Promise.withResolvers<void>();
        const legacy = agent.withQuestionBatchPreference(false, async () => {
          await ready.promise;
          return await Promise.all(
            methods.map((method) => agent.request(method, payload))
          );
        });
        const modern = await agent.withQuestionBatchPreference(true, () =>
          agent.request(methods[0], payload)
        );
        ready.resolve();
        expect(modern).toEqual(payload);
        const optedOut = batchAvailable
          ? { _meta: { ...payload._meta, [QUESTION_BATCHES.list]: false } }
          : payload;
        expect(await legacy).toEqual([
          optedOut,
          optedOut,
          optedOut,
          optedOut,
          optedOut,
          payload,
          payload,
        ]);
      } finally {
        await process?.close();
        test.close();
      }
    }
  );

  it("retains batch question replies through live updates and transcript replay", async () => {
    const replies = [
      {
        waitId: "wait",
        id: "format",
        question: "Which format?",
        answer: "Print",
      },
      {
        waitId: "wait",
        id: "theme",
        question: "Which theme?",
        answer: "The user skipped this question.",
        skipped: true,
      },
    ];
    const test = fixture(
      `
      if (request.method === 'session/new') {
        send({id:request.id,result:{sessionId:'chat'}});
        return;
      }
      const capability = '${TRANSCRIPT_WINDOW}';
      const read = request.params._meta?.[capability];
      if (read?.kind !== 'read') throw Error('unexpected request');
      const reply = {turnId:'turn',questionReplies:${JSON.stringify(replies)}};
      const update = {sessionUpdate:'user_message_chunk',messageId:'wait',
        content:{type:'text',text:'Which format? Print. Which theme? Skipped.'}};
      send({method:'session/update',params:{sessionId:'chat',
        _meta:{'co.grida/session/updates':{...reply,offsetBytes:0,replace:true}},update}});
      send({method:'session/update',params:{sessionId:'chat',
        _meta:{[capability]:{...reply,requestId:read.requestId}},update}});
      send({id:request.id,result:{_meta:{[capability]:{requestId:read.requestId,view:1,older:null,turns:[]}}}});
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
      const updates: unknown[] = [];
      chat.subscribe(session, (update) => updates.push(update));
      const page = await chat.transcriptPage(session);
      expect(updates).toMatchObject([
        {
          kind: "text",
          role: "user",
          messageId: "wait",
          questionReplies: replies,
        },
      ]);
      expect(page.messages).toMatchObject([
        { role: "user", messageId: "wait", questionReplies: replies },
      ]);
    } finally {
      await chat?.close();
      test.close();
    }
  });

  it("projects captured model IDs in the snapshot and reopened transcript pages", async () => {
    const test = fixture(
      `
      if (request.method === '_co.grida/session/snapshot') {
        const turn = {turnId:'recent-turn', modelId:'provider/model-v2:fast',
          epoch:1, journalPosition:2, historyPosition:3, controlRevision:0,
          paused:false, cancelled:false, disposition:'running', status:null};
        send({id:request.id,result:{sessionId:'chat',sessionRevision:1,queuedInputs:0,
          queue:[],admissionPaused:false,current:turn,latest:turn}});
        return;
      }
      const capability = '${TRANSCRIPT_WINDOW}';
      const window = request.params._meta?.[capability];
      if (request.method !== 'session/load' || !window) throw Error('unexpected request');
      if (window.kind === 'attach') { send({id:request.id,result:{}}); return; }
      const turns = window.before
        ? [
          {turnId:'legacy-turn',status:'succeeded',startedAtMs:1,settledAtMs:2},
          {turnId:'earlier-turn',modelId:'provider/model-v1',status:'succeeded',startedAtMs:3,settledAtMs:4},
        ]
        : [{turnId:'recent-turn',modelId:'provider/model-v2:fast',status:null,startedAtMs:5}];
      send({id:request.id,result:{_meta:{[capability]:{
        requestId:window.requestId,view:1,older:window.before ? null : {anchor:'older'},turns
      }}}});
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
      const session = await chat.load("chat");
      const observation = await chat.observe(session);
      const recent = {
        turnId: "recent-turn",
        modelId: "provider/model-v2:fast",
      };
      expect(observation.current).toMatchObject(recent);
      expect(observation.latest).toMatchObject(recent);
      const page = await chat.transcriptPage(session);
      expect(page.turns).toEqual([{ ...recent, status: null, startedAtMs: 5 }]);
      expect(page.older).not.toBeNull();
      const earlier = await chat.transcriptPage(session, page.older!);
      expect(earlier.turns).toEqual([
        {
          turnId: "legacy-turn",
          status: "succeeded",
          startedAtMs: 1,
          settledAtMs: 2,
        },
        {
          turnId: "earlier-turn",
          modelId: "provider/model-v1",
          status: "succeeded",
          startedAtMs: 3,
          settledAtMs: 4,
        },
      ]);
    } finally {
      await chat?.close();
      test.close();
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
        update:{sessionUpdate:'tool_call',toolCallId:'call-live',title:'exec_command',kind:'execute',status:'in_progress'}}});
      send({method:'session/update',params:{sessionId:'chat',_meta:meta({}),
        update:{sessionUpdate:'user_message_chunk',messageId:'ask',content:{type:'text',text:'Check it'}}}});
      send({method:'session/update',params:{sessionId:'chat',_meta:meta({}),
        update:{sessionUpdate:'user_message_chunk',messageId:'ask',content:{type:'resource_link',
          name:'image.png',uri:'urn:grida:retained-attachment:image-1',mimeType:'image/png',size:179}}}});
      send({method:'session/update',params:{sessionId:'chat',_meta:meta({}),
        update:{sessionUpdate:'user_message_chunk',messageId:'ask',content:{type:'resource_link',
          name:'clip.mov',uri:'file:///Users/someone/clip.mov',mimeType:'video/quicktime',size:9,
          _meta:{'co.grida/file-reference':{preview:{poster:'data:image/jpeg;base64,/9j/4AAQ',durationMs:12500,width:1920,height:1080}}}}}}});
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
              // A file reference keeps the preview the composer showed.
              attachments: [
                {
                  name: "image.png",
                  mimeType: "image/png",
                  size: 179,
                  previewId: expect.any(String),
                },
                {
                  name: "clip.mov",
                  mimeType: "video/quicktime",
                  size: 9,
                  preview: {
                    poster: "data:image/jpeg;base64,/9j/4AAQ",
                    durationMs: 12_500,
                    width: 1920,
                    height: 1080,
                  },
                },
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
              title: "exec_command",
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

  it("forwards command actions live and on replay while keeping the tool and its outcome", async () => {
    const actions = [
      { kind: "read", path: "README.md" },
      { kind: "list_files", piped: true },
      { kind: "search", query: "TODO", path: "src" },
    ];
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
      const actions = ${JSON.stringify(actions)};
      const tool = (key, metadata, id, status) => {
        send({method:'session/update',params:{sessionId:'chat',
          _meta:{[key]:{turnId:'turn',messageId:'work',activity:'execute',...metadata}},
          update:{sessionUpdate:'tool_call',toolCallId:id,title:'exec_command',kind:'execute',status,
            rawInput:{cmd:'cat README.md && rg --files | head && rg TODO src'}}}});
      };
      const replay = {requestId:read.requestId,outcome:'failed'};
      tool('co.grida/session/updates', {outcome:'running',commandActions:actions}, 'command', 'in_progress');
      tool(capability, {...replay,commandActions:actions}, 'command', 'failed');
      tool(capability, replay, 'older', 'failed');
      tool(capability, {...replay,commandActions:[actions[0],{kind:'unknown'}]}, 'unknown', 'failed');
      tool(capability, {...replay,commandActions:[{kind:'read',path:'é'.repeat(513)}]}, 'oversized', 'failed');
      tool(capability, {...replay,commandActions:Array(17).fill(actions[0])}, 'long-list', 'failed');
      send({id:request.id,result:{_meta:{[capability]:{requestId:read.requestId,view:1,older:null,
        turns:[{turnId:'turn',status:'failed',startedAtMs:1000,settledAtMs:4500}]}}}});
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
      const call = {
        callId: "command",
        title: "exec_command",
        kind: "execute",
        input: { cmd: "cat README.md && rg --files | head && rg TODO src" },
      };
      expect(live).toEqual([
        {
          kind: "activity",
          messageId: "work",
          turnId: "turn",
          activity: { ...call, outcome: "running", commandActions: actions },
        },
      ]);
      expect(
        page.messages.find((entry) => entry.messageId === "work")?.activity
      ).toEqual([
        { ...call, outcome: "failed", commandActions: actions },
        ...["older", "unknown", "oversized", "long-list"].map((callId) => ({
          ...call,
          callId,
          outcome: "failed",
        })),
      ]);
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

function packagedToolResponse(
  index: number,
  call: { name: string; arguments: object } | undefined
): Response {
  const item = call
    ? {
        type: "function_call",
        id: `fc_tool_fixture_${index}`,
        call_id: `call_tool_fixture_${index}`,
        name: call.name,
        arguments: JSON.stringify(call.arguments),
        status: "completed",
      }
    : {
        type: "message",
        id: "tool_fixture_message",
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: "Finished tool fixture.",
            annotations: [],
          },
        ],
      };
  const frames = [
    { type: "response.output_item.done", output_index: 0, item },
    {
      type: "response.completed",
      response: {
        status: "completed",
        usage: { input_tokens: 5, output_tokens: 3 },
      },
    },
  ];
  return new Response(
    frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join(""),
    { headers: { "content-type": "text/event-stream" } }
  );
}

it.runIf(Boolean(packaged) && process.platform !== "win32")(
  "keeps same-named Main sources isolated through the packaged MCP carrier",
  async () => {
    const directory = state();
    const root = fs.realpathSync(directory.root);
    const cwd = path.join(root, "workspace");
    fs.mkdirSync(cwd, { mode: 0o700 });
    const firstName = "desktop_fixture_first__status";
    const secondName = "desktop_fixture_second__status";
    const calls = [
      {
        name: "tool_search",
        arguments: { query: firstName, source: "fixture-first" },
      },
      { name: firstName, arguments: {} },
      {
        name: "tool_search",
        arguments: { query: secondName, source: "fixture-second" },
      },
      { name: secondName, arguments: {} },
      { name: firstName, arguments: {} },
      { name: secondName, arguments: {} },
    ];
    const offers: string[][] = [];
    const results: { call_id: string; output: string }[] = [];
    const operation = (text: string) =>
      vi.fn<NativeDesktopTools.Tool["invoke"]>(() => ({
        content: [{ type: "text", text }],
      }));
    const oldFirst = operation("first source, original registration");
    const newFirst = operation("first source, replacement registration");
    const second = operation("second source");
    const definition = {
      name: "status",
      description: "Look up status.",
      inputSchema: { type: "object" },
    };
    const source = (
      id: string,
      description: string,
      invoke: NativeDesktopTools.Tool["invoke"]
    ) => ({
      id,
      description,
      tools: [{ definition, revision: 1, invoke }],
    });
    let replace: (() => void) | undefined;
    let chat: NativeAgentChat | undefined;
    try {
      chat = await NativeAgentChat.start({
        ...launch(packaged!, path.join(root, "state")),
        cwd,
        provider: "responses",
        providerNetwork: {
          prepare: () => async (body) => {
            const request = JSON.parse(body.toString());
            const call = calls[offers.length];
            offers.push(
              (request.tools ?? []).map((tool: { name: string }) => tool.name)
            );
            if (offers.length === 5) replace?.();
            if (!call)
              results.push(
                ...request.input.filter(
                  (item: { type: string }) =>
                    item.type === "function_call_output"
                )
              );
            return packagedToolResponse(offers.length, call);
          },
        },
      });
      const session = await chat.create();
      const lease = chat.registerEditorSurfaces(
        session,
        { active: null, open: [], truncated: false },
        () => {},
        undefined
      )!;
      const first = lease.registerToolSource(
        source("fixture-first", "First local device status.", oldFirst)
      );
      lease.registerToolSource(
        source("fixture-second", "Second local device status.", second)
      );
      replace = () => {
        first.close();
        lease.registerToolSource(
          source("fixture-first", "First local device status.", newFirst)
        );
      };
      await chat.submit(
        session,
        "source-collision",
        "Check both devices",
        "act",
        lease.selection()
      );
      const active = chat;
      await vi.waitFor(
        async () => {
          expect((await active.observe(session)).latest?.status).toBe(
            "succeeded"
          );
        },
        { timeout: 8000 }
      );
      expect(offers).toHaveLength(7);
      expect(offers[0]).not.toContain(firstName);
      expect(offers[0]).not.toContain(secondName);
      expect(offers[1]).toContain(firstName);
      expect(offers[1]).not.toContain(secondName);
      expect(offers[3]).toContain(secondName);
      expect(oldFirst).toHaveBeenCalledTimes(1);
      expect(newFirst).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(2);
      const outcomes = results.map(({ output }) => JSON.parse(output));
      expect(outcomes[1]).toMatchObject({
        status: "succeeded",
        content: ["first source, original registration"],
      });
      expect(outcomes[3]).toMatchObject({
        status: "succeeded",
        content: ["second source"],
      });
      expect(outcomes[4]).toMatchObject({
        status: "failed",
        content: ["editor_surface_endpoint_unavailable"],
      });
      expect(outcomes[5]).toMatchObject({
        status: "succeeded",
        content: ["second source"],
      });
    } finally {
      try {
        await chat?.close();
      } finally {
        directory.close();
      }
    }
  },
  15_000
);

it.runIf(Boolean(packaged) && process.platform !== "win32")(
  "discovers Browser, presents a tab, and retains a capture through the packaged MCP carrier",
  async () => {
    const directory = state();
    const root = fs.realpathSync(directory.root);
    const cwd = path.join(root, "workspace");
    fs.mkdirSync(cwd, { mode: 0o700 });
    const jpeg = fs.readFileSync(
      new URL("../../../fixtures/images/512.jpg", import.meta.url)
    );
    const capture = {
      target: { kind: "workbench", tabId: "visible-tab" },
      documentId: "visible-document",
    };
    const calls = [
      {
        name: "tool_search",
        arguments: { query: "browser help workbench show" },
      },
      {
        name: "tool_search",
        arguments: { query: "browser_help", source: "browser" },
      },
      { name: "browser_help", arguments: { topic: "targets" } },
      {
        name: "tool_search",
        arguments: { query: "workbench_show", source: "workbench" },
      },
      {
        name: "workbench_show",
        arguments: { target: { kind: "url", url: "https://example.test/" } },
      },
      {
        name: "tool_search",
        arguments: { query: "browser_capture", source: "browser" },
      },
      { name: "browser_capture", arguments: capture },
    ];
    const offers: string[][] = [];
    const bodies: string[] = [];
    const invoke = vi.fn<DesktopBrowserToolLease["invoke"]>();
    invoke
      .mockResolvedValueOnce({
        disposition: "not_dispatched",
        data: { topic: "targets", text: "Use surface_list_open." },
      })
      .mockResolvedValueOnce({
        disposition: "dispatched_verified",
        data: {
          admission: "accepted",
          presentation: "requested",
          tabId: capture.target.tabId,
        },
      })
      .mockResolvedValueOnce({
        disposition: "dispatched_verified",
        data: { documentId: capture.documentId },
        image: { mimeType: "image/jpeg", base64: jpeg.toString("base64") },
      });
    let chat: NativeAgentChat | undefined;
    try {
      chat = await NativeAgentChat.start({
        ...launch(packaged!, path.join(root, "state")),
        cwd,
        provider: "responses",
        model: "gpt-6.1-sol",
        providerNetwork: {
          prepare: () => async (body) => {
            const text = body.toString();
            const request = JSON.parse(text);
            const names = (request.tools ?? []).map(
              (tool: { name: string }) => tool.name
            );
            const call = calls[offers.length];
            bodies.push(text);
            offers.push(names);
            return packagedToolResponse(offers.length, call);
          },
        },
      });
      const session = await chat.create();
      const lease = chat.registerEditorSurfaces(
        session,
        { active: null, open: [], truncated: false },
        () => {},
        () => {
          throw new Error("browser_presentation_must_use_browser_owner");
        },
        1,
        undefined,
        { ready: () => true, invoke, close: () => {} }
      )!;
      await chat.submit(
        session,
        "browser-discovery",
        "Show me the example site and capture it",
        "act",
        lease.selection()
      );
      const active = chat;
      await vi.waitFor(
        async () => {
          expect((await active.observe(session)).latest?.status).toBe(
            "succeeded"
          );
        },
        { timeout: 8000 }
      );
      expect(offers).toHaveLength(8);
      expect(offers[0]).toContain("tool_search");
      expect(offers[0]).not.toContain("browser_help");
      expect(offers[0]).not.toContain("workbench_show");
      expect(offers[1]).not.toContain("browser_help");
      expect(offers[1]).not.toContain("workbench_show");
      expect(offers[2]).toContain("browser_help");
      expect(offers[4]).toContain("workbench_show");
      expect(offers[6]).toContain("browser_capture");
      expect(invoke.mock.calls.map((args) => args.slice(0, 2))).toEqual([
        ["browser_help", { topic: "targets" }],
        [
          "surface_open",
          { target: { kind: "url", url: "https://example.test/" } },
        ],
        ["browser_capture", capture],
      ]);
      expect(bodies[3]).toContain("Use workbench_list_tabs.");
      const page = await chat.transcriptPage(session);
      const images = page.messages.flatMap((message) =>
        (message.activity ?? []).flatMap((item) => item.output?.images ?? [])
      );
      expect(images).toMatchObject([
        { previewId: expect.any(String), mimeType: "image/png" },
      ]);
      const image = images[0];
      const png = Buffer.from(
        await chat.readToolImage(session, image.previewId)
      );
      expect(png.length).toBe(image.size);
      expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      const width = png.readUInt32BE(16);
      const height = png.readUInt32BE(20);
      expect(width).toBeGreaterThan(0);
      expect(width).toBeLessThanOrEqual(512);
      expect(height).toBe(width);
      const captureResult = JSON.parse(bodies[7]).input.find(
        (item: { call_id?: string; type: string }) =>
          item.type === "function_call_output" &&
          item.call_id === "call_tool_fixture_7"
      );
      expect(JSON.parse(captureResult.output[0].text)).toMatchObject({
        status: "succeeded",
        structured: {
          disposition: "dispatched_verified",
          documentId: capture.documentId,
          nativeImage: { width, height },
        },
      });
      expect(captureResult.output[1].image_url).toBe(
        `data:image/png;base64,${png.toString("base64")}`
      );
      const otherSession = await chat.create();
      await expect(
        chat.readToolImage(otherSession, image.previewId)
      ).rejects.toThrow("tool_image_unavailable");
    } finally {
      try {
        await chat?.close();
      } finally {
        directory.close();
      }
    }
  },
  15_000
);

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
