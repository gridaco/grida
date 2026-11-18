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
import { NativeInputImages } from "./native-input-images";
import { NativeToolImages } from "./native-tool-images";
import { NativeQueuedMessages } from "./native-queued-messages";
import { NativeSelectedImages } from "./native-selected-images";
import { NativeSubagentActivity } from "./native-subagent-activity";
import { NativeActivityOrder } from "./native-activity-order";
import { NativeEditorSurfaceEndpoints } from "./native-editor-surfaces";

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
  imageInput = false
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
      live({sessionUpdate:'agent_message_chunk',messageId:'live-message',content:{type:'text',text:'Later'}},{offsetBytes:0,replace:false},{activityOrder:8});
      live({sessionUpdate:'tool_call',toolCallId:'live-call',title:'read_file',kind:'read',status:'completed'},{messageId:'live-container',activity:'read',outcome:'succeeded'},{activityOrder:4});
      live({sessionUpdate:'agent_message_chunk',messageId:'live-message',content:{type:'text',text:' grows'}},{offsetBytes:5,replace:false},{activityOrder:8});
      send({method:'session/update',params:{sessionId:'chat',_meta:meta({activityOrder:1}),update:{sessionUpdate:'user_message_chunk',messageId:'request',content:{type:'resource_link',name:'report.txt',uri:'file:///workspace/report.txt',mimeType:'text/plain',size:4}}}});
      text('work','First ',{activityOrder:2},{phase:'progress'});
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
      expect(work).toMatchObject({
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
          replace: false,
          activityOrder: 8,
        },
        {
          kind: "activity",
          messageId: "live-container",
          turnId: "live-turn",
          activity: {
            callId: "live-call",
            title: "read_file",
            kind: "read",
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
    const test = fixture(
      `
      if (request.method === 'session/new') { send({id:request.id,result:{sessionId:'chat'}}); return; }
      if (request.method === '_co.grida/session/snapshot') { send({id:request.id,result:{sessionId:request.params.sessionId,sessionRevision:3,queuedInputs:1,queue:[{inputId:'queued',inputPosition:2,settings:{}}],admissionPaused:true,current:null,latest:null}}); return; }
      if (request.method === '${NativeQueuedMessages.inspectMethod}') {
        if(request.params.sessionId!=='chat'||request.params.inputId!=='queued'||request.params.expectedSessionRevision!==3) throw Error('wrong queue basis');
        send({id:request.id,result:{inputId:'queued',textOnly:false,prompt:[{type:'text',text:'Full text\\nsecond line'},{type:'resource_link',name:'original.webp',uri:'${uri}',mimeType:'image/webp',size:3}]}});return;
      }
      if (request.method === '${NativeQueuedMessages.readMethod}') {
        if(request.params.sessionId!=='chat'||request.params.inputId!=='queued'||request.params.expectedSessionRevision!==3||request.params.attachmentUri!=='${uri}'||request.params.offset!==0)throw Error('wrong queue image basis');
        send({id:request.id,result:{inputId:'queued',attachmentUri:'${uri}',mimeType:'image/webp',totalBytes:3,offset:0,data:'YWJj',nextOffset:null}});return;
      }
      if (request.method === '_co.grida/session/input') { send({id:request.id,result:{receipt:{sessionId:'chat',inputId:'queued',inputPosition:2,turnId:null,disposition:'queued'},textOnly:false,prompt:[{type:'text',text:'Image attached.'}]}});return; }
      throw Error('unexpected effect '+request.method);
    `,
      1,
      { [NativeQueuedMessages.capability]: 1 }
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

  it("rejects an excess browser operation and keeps the worker connected", async () => {
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
    let invoked = 0;
    let agent: NativeAgentProcess | undefined;
    try {
      agent = await NativeAgentProcess.start({
        ...test.options,
        providerNetwork: { prepare: () => null },
      });
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
            await admitted.promise;
            return { disposition: "not_dispatched" };
          },
          close: () => {},
        }
      );
      const selection = lease!.selection();
      expect(selection.editorBrowserTools).toBe(true);
      const endpointId = selection.editorEndpointId;
      await expect(
        agent.request("fixture/browser-flood", { endpointId })
      ).resolves.toEqual({
        sessionId: "session",
        endpointId,
        callId: callId(17),
        result: { disposition: "not_dispatched", error: "backend_busy" },
      });
      expect(invoked).toBe(16);
      expect(agent.connected).toBe(true);
      await expect(agent.request("fixture/ping", {})).resolves.toEqual({
        pong: true,
      });
    } finally {
      admitted.resolve();
      try {
        await agent?.close();
      } finally {
        test.close();
      }
    }
  });

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
