"use client";

import React from "react";
import type { IDocumentEditorInit } from "@/grida-react-canvas";
import queryattributes from "@/grida-react-canvas/nodes/utils/attributes";
import ReferrerPageTemplate from "@/theme/templates/west-referral/referrer/page";
import InvitationCouponTemplate from "@/theme/templates/west-referral/invitation/coupon";
import Editor from "@/app/(dev)/canvas/editor";
import InvitationPageTemplate from "@/theme/templates/west-referral/invitation/page";

const document: IDocumentEditorInit = {
  editable: true,
  debug: false,
  document: {
    nodes: {
      invite: {
        id: "invite",
        name: "Referrer Page",
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
      join_main: {
        id: "join_main",
        name: "Invitation Page",
        type: "template_instance",
        template_id: "tmp-2503-join-main",
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
        top: 0,
        left: 0,
      },
      join_hello: {
        id: "join_hello",
        name: "Invitation Coupon (Dialog)",
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
        properties: {
          coupon: {
            type: "image",
            title: "Coupon Image",
            required: true,
          },
        },
        props: {},
        overrides: {},
      },
    },
    entry_scene_id: "invite",
    scenes: {
      invite: {
        type: "scene",
        id: "invite",
        name: "Referrer's Page",
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
        name: "Invitee's Page",
        children: ["join_main", "join_hello"],
        guides: [],
        constraints: {
          children: "multiple",
        },
        order: 2,
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
    },
    ["tmp-2503-join"]: {
      name: "Join",
      type: "template",
      properties: {},
      default: {},
      version: "0.0.0",
      nodes: {},
    },
    ["tmp-2503-join-main"]: {
      name: "Join",
      type: "template",
      properties: {},
      default: {},
      version: "0.0.0",
      nodes: {},
    },
  },
};

export default function CampaignDesignerPage() {
  return (
    <div className="w-full h-full bg-green-200">
      <header></header>
      {/*  */}
      {/*  */}
    </div>
  );
  // <main className="fixed z-10 inset-0 w-screen h-screen overflow-hidden">
  //   <Editor
  //     document={document}
  //     templates={{
  //       "tmp-2503-invite": CustomComponent__Referrer,
  //       "tmp-2503-join-main": CustomComponent__Join_Main,
  //       "tmp-2503-join-hello": CustomComponent__Join_Hello,
  //     }}
  //   />
  // </main>
}

function CustomComponent__Referrer(componentprops: any) {
  return (
    <div
      className="rounded shadow border"
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
          cta: {
            text: "Join Now",
          },
          image: {
            src: componentprops.props.image,
            alt: "Main Image",
          },
          footer: {
            link_privacy: "/privacy",
            link_instagram: "https://www.instagram.com/polestarcars/",
            paragraph: {
              html: "1. Hearing Aid and Hearing Test: The Hearing Aid feature has received FDA authorization. The Hearing Test and Hearing Aid features are supported on AirPods Pro 2 with the latest firmware paired with a compatible iPhone or iPad with iOS 18 or iPadOS 18 and later and are intended for people 18 years old or older. The Hearing Aid feature is also supported on a compatible Mac with macOS Sequoia and later. It is intended for people with perceived mild to moderate hearing loss.",
            },
          },
        }}
        locale="en"
        data={{
          campaign: {
            id: "dummy",
            name: "DUMMY",
            slug: "dummy",
            enabled: true,
            conversion_currency: "USD",
            conversion_value: 0,
            max_invitations_per_referrer: 10,
            reward_currency: "USD",
            public: null,
            scheduling_close_at: null,
            scheduling_open_at: null,
            scheduling_tz: null,
          },
          code: "dummy",
          created_at: "2025-10-01T00:00:00Z",
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

function CustomComponent__Join_Main(componentprops: any) {
  return (
    <div
      className="rounded shadow border"
      style={{
        ...componentprops.style,
      }}
      {...queryattributes(componentprops)}
    >
      <InvitationPageTemplate
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
          cta: {
            text: "Join Now",
          },
          image: {
            src: componentprops.props.image,
            alt: "Main Image",
          },
          footer: {
            link_privacy: "/privacy",
            link_instagram: "https://www.instagram.com/polestarcars/",
            paragraph: {
              html: "1. Hearing Aid and Hearing Test: The Hearing Aid feature has received FDA authorization. The Hearing Test and Hearing Aid features are supported on AirPods Pro 2 with the latest firmware paired with a compatible iPhone or iPad with iOS 18 or iPadOS 18 and later and are intended for people 18 years old or older. The Hearing Aid feature is also supported on a compatible Mac with macOS Sequoia and later. It is intended for people with perceived mild to moderate hearing loss.",
            },
          },
        }}
        locale="en"
        data={{
          signup_form_id: "",
          referrer_id: "dummy",
          referrer_name: "DUMMY",
          is_claimed: false,
          code: "dummy",
          created_at: "2025-10-01T00:00:00Z",
          type: "invitation",
          id: "123",
          campaign: {
            id: "dummy",
            name: "DUMMY",
            slug: "dummy",
            enabled: true,
            conversion_currency: "USD",
            conversion_value: 0,
            max_invitations_per_referrer: 10,
            reward_currency: "USD",
            public: null,
            scheduling_close_at: null,
            scheduling_open_at: null,
            scheduling_tz: null,
          },
        }}
      />
    </div>
  );
}

function CustomComponent__Join_Hello(componentprops: any) {
  return (
    <div
      className="rounded shadow border"
      style={{
        ...componentprops.style,
      }}
      {...queryattributes(componentprops)}
    >
      <InvitationCouponTemplate
        locale={"en"}
        data={{
          referrer_name: "DUMMY",
        }}
        design={{
          logo: {
            src: "/logos/thebundle.png",
            srcDark: "/logos/thebundle-dark.png",
          },
          coupon: {
            src: componentprops.props.coupon,
            alt: "Main Image",
          },
        }}
      />
    </div>
  );
}
