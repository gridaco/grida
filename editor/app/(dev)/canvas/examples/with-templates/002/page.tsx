"use client";

import React from "react";
import { editor } from "@/grida-canvas";
import Editor from "../../../editor";
import queryattributes from "@/grida-canvas-react-renderer-dom/nodes/utils/attributes";
import ReferrerPageTemplate from "@/theme/templates/west-referral/referrer/page";

const document: editor.state.IEditorStateInit = {
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
        properties: {
          image: {
            type: "image",
            title: "Main Image",
            required: true,
          },
          title: {
            type: "string",
            title: "Title",
            required: true,
          },
          description: {
            title: "Page Description",
            type: "string",
            required: true,
          },
          article: {
            type: "richtext",
            title: "Article",
            required: true,
          },
        },
        props: {},
        overrides: {},
      },
      join: {
        id: "join",
        type: "template_instance",
        name: "Page",
        position: "absolute",
        template_id: "tabs",
        removable: false,
        active: true,
        locked: false,
        width: 375,
        height: 812,
        properties: {},
        props: {},
        overrides: {},
        top: -400,
        left: 0,
      },
      join_main: {
        id: "join_main",
        name: "Join Page (TabsContent)",
        type: "template_instance",
        template_id: "tmp-2503-join-main",
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
        name: "Join Hello (TabsContent)",
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
        children_refs: ["invite"],
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
        children_refs: ["join", "join_main", "join_hello"],
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
        children_refs: ["portal", "portal_verify"],
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
      properties: {
        title: {
          title: "Page Title",
          type: "string",
          required: true,
        },
        description: {
          title: "Page Description",
          type: "string",
          required: true,
        },
        article: {
          type: "richtext",
          title: "Article",
          required: true,
        },
      },
      default: {},
      version: "0.0.0",
      nodes: {},
      links: {},
    },
    ["tmp-2503-join"]: {
      name: "Join",
      type: "template",
      properties: {},
      default: {},
      version: "0.0.0",
      nodes: {},
      links: {},
    },
    ["tmp-2503-join-main"]: {
      name: "Join",
      type: "template",
      properties: {},
      default: {},
      version: "0.0.0",
      nodes: {},
      links: {},
    },
    ["tmp-2503-portal"]: {
      name: "Portal",
      type: "template",
      properties: {},
      default: {},
      version: "0.0.0",
      nodes: {},
      links: {},
    },
  },
};

export default function FileExamplePage() {
  return (
    <main className="w-screen h-screen overflow-hidden">
      <Editor
        document={document}
        templates={{
          tabs: CustomComponent__Tabs,
          "tmp-2503-invite": CustomComponent__Referrer,
          "tmp-2503-join-main": CustomComponent__Join_Main,
          "tmp-2503-join-hello": CustomComponent__Join_Hello,
          "tmp-2503-portal": CustomComponent__Portal,
        }}
      />
    </main>
  );
}

function CustomComponent__Referrer(componentprops: any) {
  console.log("props", componentprops);
  return (
    <div
      className="rounded-sm shadow border"
      style={{
        ...componentprops.style,
      }}
      {...queryattributes(componentprops)}
    >
      <ReferrerPageTemplate
        design={{
          brand_name: "Apple",
          title: componentprops.props.title as string,
          description: componentprops.props.description as string,
          logo: {
            src: "/logos/thebundle.png",
            srcDark: "/logos/thebundle-dark.png",
          },
          favicon: {
            src: "https://www.apple.com/favicon.ico",
            srcDark: "https://www.apple.com/favicon.ico",
          },
          article: componentprops.props.article,
          cta: "Join Now",
          image: {
            src: componentprops.props.image,
            alt: "Example Image",
          },
          footer: {
            link_privacy: "/privacy",
            link_instagram: "https://www.instagram.com/grida.co/",
            paragraph: {
              html: "1. Hearing Aid and Hearing Test: The Hearing Aid feature has received FDA authorization. The Hearing Test and Hearing Aid features are supported on AirPods Pro 2 with the latest firmware paired with a compatible iPhone or iPad with iOS 18 or iPadOS 18 and later and are intended for people 18 years old or older. The Hearing Aid feature is also supported on a compatible Mac with macOS Sequoia and later. It is intended for people with perceived mild to moderate hearing loss.",
            },
          },
        }}
        locale="en"
        data={{
          campaign: {
            id: "dummy",
            title: "DUMMY",
            description: null,
            www_name: "dummy",
            www_route_path: "/dummy",
            enabled: true,
            max_invitations_per_referrer: 10,
            layout_id: null,
            reward_currency: "USD",
            public: null,
            scheduling_close_at: null,
            scheduling_open_at: null,
            scheduling_tz: null,
          },
          code: "dummy",
          invitation_count: 0,
          invitations: [],
          type: "referrer",
          id: "123",
          referrer_name: "DUMMY",
        }}
      />
    </div>
  );
}

function CustomComponent__Tabs(props: any) {
  return (
    <div
      className="rounded-sm shadow border"
      style={{
        ...props.style,
      }}
      {...queryattributes(props)}
    >
      {/*  */}
    </div>
  );
}

function CustomComponent__Join_Main(props: any) {
  return (
    <div
      className="rounded-sm shadow border"
      style={{
        ...props.style,
      }}
      {...queryattributes(props)}
    >
      {/* <Main
        data={{
          cid: "00000000",
          user: {
            name: "DUMMY",
          },
        }}
      /> */}
    </div>
  );
}

function CustomComponent__Join_Hello(props: any) {
  return (
    <div
      className="rounded-sm shadow border"
      style={{
        ...props.style,
      }}
      {...queryattributes(props)}
    >
      {/* <_002 /> */}
      {/* <Hello
        data={{
          cid: "",
          user: {
            name: "DUMMY",
          },
        }}
      /> */}
    </div>
  );
}

function CustomComponent__Portal(props: any) {
  return (
    <div
      className="rounded-sm shadow border"
      style={{
        ...props.style,
      }}
      {...queryattributes(props)}
    >
      {/* <Portal /> */}
    </div>
  );
}
