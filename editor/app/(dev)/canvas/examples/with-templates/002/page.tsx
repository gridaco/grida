"use client";

import type { IDocumentEditorInit } from "@/grida-react-canvas";
import Editor from "../../../editor";
import React from "react";
import queryattributes from "@/grida-react-canvas/nodes/utils/attributes";
import _002 from "@/theme/templates/formstart/002/page";
import Invite from "@/app/(demo)/demo/sales/campaign/polestar-kr-2503/[cid]/invite/main";
import Portal from "@/app/(demo)/demo/sales/campaign/polestar-kr-2503/portal/_flows/page";
import Verify from "@/app/(demo)/demo/sales/campaign/polestar-kr-2503/portal/_flows/step-verify";
import Main from "@/app/(demo)/demo/sales/campaign/polestar-kr-2503/[cid]/join/_flows/main";

export default function FileExamplePage() {
  return (
    <main className="w-screen h-screen overflow-hidden">
      <Editor
        document={document}
        templates={{
          "tmp-2503-invite": CustomComponent__Invite,
          "tmp-2503-join": CustomComponent__Join,
          "tmp-2503-join-hello": CustomComponent__Join_Hello,
          "tmp-2503-portal": CustomComponent__Portal,
          "tmp-2503-portal-verify": CustomComponent__Portal_Verify,
        }}
      />
    </main>
  );
}

const document: IDocumentEditorInit = {
  editable: true,
  debug: false,
  document: {
    nodes: {
      invite: {
        id: "invite",
        name: "Invite Page",
        type: "template_instance",
        template_id: "tmp-2503-invite",
        position: "absolute",
        removable: false,
        active: true,
        locked: false,
        width: 375,
        height: "auto",
        properties: {},
        props: {},
        overrides: {},
      },
      join: {
        id: "join",
        name: "Join Page",
        type: "template_instance",
        template_id: "tmp-2503-join",
        position: "absolute",
        removable: false,
        active: true,
        locked: false,
        width: 375,
        height: "auto",
        properties: {},
        props: {},
        overrides: {},
        top: 0,
        left: 0,
      },
      join_hello: {
        id: "join_hello",
        name: "Join Hello (Overlay)",
        type: "template_instance",
        template_id: "tmp-2503-join-hello",
        position: "absolute",
        removable: false,
        active: true,
        locked: false,
        width: 375,
        height: 812,
        top: 0,
        left: -500,
        properties: {},
        props: {},
        overrides: {},
      },
      portal: {
        id: "portal",
        name: "Portal Page",
        type: "template_instance",
        template_id: "tmp-2503-portal",
        position: "absolute",
        removable: false,
        active: true,
        locked: false,
        width: 375,
        height: "auto",
        properties: {},
        props: {},
        overrides: {},
        top: 0,
        left: 0,
      },
      portal_verify: {
        id: "portal_verify",
        name: "Verify (Overlay)",
        type: "template_instance",
        template_id: "tmp-2503-portal-verify",
        position: "absolute",
        removable: false,
        active: true,
        locked: false,
        width: 375,
        height: "auto",
        properties: {},
        props: {},
        overrides: {},
        top: 0,
        left: 500,
      },
    },
    entry_scene_id: "invite",
    scenes: {
      invite: {
        type: "scene",
        id: "invite",
        name: "Invite",
        children: ["invite"],
        guides: [],
        constraints: {
          children: "multiple",
        },
        order: 1,
      },
      join: {
        type: "scene",
        id: "join",
        name: "Join",
        children: ["join", "join_hello"],
        guides: [],
        constraints: {
          children: "multiple",
        },
        order: 2,
      },
      portal: {
        type: "scene",
        id: "portal",
        name: "Portal",
        children: ["portal", "portal_verify"],
        guides: [],
        constraints: {
          children: "multiple",
        },
        order: 3,
      },
    },
  },
  templates: {
    ["tmp-2503-invite"]: {
      name: "Invite",
      type: "template",
      properties: {},
      default: {},
      version: "0.0.0",
      nodes: {},
    },
    ["tmp-2503-join"]: {
      name: "Join",
      type: "template",
      properties: {},
      default: {},
      version: "0.0.0",
      nodes: {},
    },
    ["tmp-2503-portal"]: {
      name: "Portal",
      type: "template",
      properties: {},
      default: {},
      version: "0.0.0",
      nodes: {},
    },
  },
};

function CustomComponent__Invite(props: any) {
  return (
    <div
      className="rounded shadow border"
      style={{
        ...props.style,
      }}
      {...queryattributes(props)}
    >
      <Invite params={{ cid: "00000000" }} />
    </div>
  );
}

function CustomComponent__Join(props: any) {
  return (
    <div
      className="rounded shadow border"
      style={{
        ...props.style,
      }}
      {...queryattributes(props)}
    >
      <Main />
    </div>
  );
}

function CustomComponent__Join_Hello(props: any) {
  return (
    <div
      className="rounded shadow border"
      style={{
        ...props.style,
      }}
      {...queryattributes(props)}
    >
      <_002 />
    </div>
  );
}

function CustomComponent__Portal(props: any) {
  return (
    <div
      className="rounded shadow border"
      style={{
        ...props.style,
      }}
      {...queryattributes(props)}
    >
      <Portal />
    </div>
  );
}

function CustomComponent__Portal_Verify(props: any) {
  return (
    <div
      className="rounded shadow border"
      style={{
        ...props.style,
      }}
      {...queryattributes(props)}
    >
      <Verify />
    </div>
  );
}
