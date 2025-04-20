import React, { useEffect, useReducer } from "react";
import type { IDocumentEditorInit } from "@/grida-react-canvas";
import queryattributes from "@/grida-react-canvas/nodes/utils/attributes";
import ReferrerPageTemplate from "@/theme/templates/west-referral/referrer/page";
import InvitationCouponTemplate from "@/theme/templates/west-referral/invitation/coupon";
import InvitationPageTemplate from "@/theme/templates/west-referral/invitation/page";
import {
  initDocumentEditorState,
  StandaloneDocumentEditor,
  ViewportRoot,
  EditorSurface,
  StandaloneSceneContent,
  standaloneDocumentReducer,
  useDocument,
} from "@/grida-react-canvas";
import {
  AutoInitialFitTransformer,
  StandaloneSceneBackground,
  UserCustomTemplatesProvider,
} from "@/grida-react-canvas/renderer";
import { Zoom } from "@/scaffolds/sidecontrol/sidecontrol-node-selection";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@/utils";
import { PreviewProvider } from "@/grida-react-canvas-starter-kit/starterkit-preview";
import { Platform } from "@/lib/platform";
import { TemplateData } from "@/theme/templates/west-referral/templates";
import { ReadonlyPropsEditorInstance } from "@/scaffolds/props-editor";
import { useTransform } from "@/grida-react-canvas/provider";

const document: IDocumentEditorInit = {
  editable: true,
  debug: false,
  document: {
    nodes: {
      referrer: {
        id: "referrer",
        name: "Referrer Page",
        type: "template_instance",
        template_id: "grida_west_referral.duo-000.referrer",
        position: "absolute",
        removable: false,
        active: true,
        locked: false,
        width: 375,
        height: "auto",
        properties: {},
        props: {},
        overrides: {},
        top: -1000,
        left: 0,
      },
      invitation: {
        id: "invitation",
        name: "Invitation Page",
        type: "template_instance",
        template_id: "grida_west_referral.duo-000.invitation",
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
      "invitation-ux-overlay": {
        id: "invitation-ux-overlay",
        name: "Invitation Coupon (Dialog)",
        type: "template_instance",
        template_id: "grida_west_referral.duo-000.invitation-ux-overlay",
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
    },
    entry_scene_id: "main",
    scenes: {
      main: {
        type: "scene",
        id: "main",
        name: "Referrer's Page",
        children: ["referrer", "invitation", "invitation-ux-overlay"],
        guides: [],
        constraints: {
          children: "multiple",
        },
        order: 0,
      },
    },
  },
  templates: {
    ["grida_west_referral.duo-000.referrer"]: {
      name: "Referrer",
      type: "template",
      properties: {},
      default: {},
      version: "0.0.0",
      nodes: {},
    },
    ["grida_west_referral.duo-000.invitation-ux-overlay"]: {
      name: "Invitation UX Overlay",
      type: "template",
      properties: {},
      default: {},
      version: "0.0.0",
      nodes: {},
    },
    ["grida_west_referral.duo-000.invitation"]: {
      name: "Invitation",
      type: "template",
      properties: {},
      default: {},
      version: "0.0.0",
      nodes: {},
    },
  },
};

const CampaignViewerContextAndPropsContext = React.createContext<
  | (ReadonlyPropsEditorInstance<TemplateData.West_Referrral__Duo_001> & {
      campaign: Platform.WEST.Referral.CampaignPublic;
      locale: "en" | "ko";
    })
  | null
>(null);

function useViewerContext() {
  const context = React.useContext(CampaignViewerContextAndPropsContext);
  if (!context) {
    throw new Error(
      "useViewerContext must be used within a CampaignViewerContext"
    );
  }
  return context;
}

export function CampaignTemplateDuo001Viewer({
  focus,
  props,
  campaign,
  locale,
  onDoubleClick,
}: {
  focus: { node?: string };
  props: ReadonlyPropsEditorInstance<TemplateData.West_Referrral__Duo_001>;
  campaign: Platform.WEST.Referral.CampaignPublic;
  locale: "en" | "ko";
  onDoubleClick?: () => void;
}) {
  const [state, dispatch] = useReducer(
    standaloneDocumentReducer,
    initDocumentEditorState(document)
  );

  return (
    <CampaignViewerContextAndPropsContext.Provider
      value={{ ...props, campaign: campaign, locale }}
    >
      <StandaloneDocumentEditor editable initial={state} dispatch={dispatch}>
        <EditorUXServer focus={focus} />
        <UserCustomTemplatesProvider
          templates={{
            "grida_west_referral.duo-000.referrer":
              CustomComponent_Viewer__Referrer,
            "grida_west_referral.duo-000.invitation":
              CustomComponent_Viewer__Invitation,
            "grida_west_referral.duo-000.invitation-ux-overlay":
              CustomComponent_Viewer__InvitationUXOverlay,
          }}
        >
          <PreviewProvider>
            <div className="w-full h-full flex-1">
              <div className="w-full h-full border rounded-xl shadow-xl overflow-hidden">
                <div className="w-full h-full flex">
                  <StandaloneSceneBackground className="w-full h-full flex flex-col relative bg-muted">
                    <div className="absolute top-4 right-4 z-50 pointer-events-auto">
                      <Zoom
                        className={cn(
                          WorkbenchUI.inputVariants({
                            variant: "input",
                            size: "xs",
                          }),
                          "w-auto"
                        )}
                      />
                    </div>
                    <ViewportRoot
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onDoubleClick?.();
                      }}
                      className="relative w-full h-full overflow-hidden"
                    >
                      <EditorSurface />
                      <AutoInitialFitTransformer>
                        <StandaloneSceneContent />
                      </AutoInitialFitTransformer>
                    </ViewportRoot>
                  </StandaloneSceneBackground>
                </div>
              </div>
            </div>
          </PreviewProvider>
        </UserCustomTemplatesProvider>
      </StandaloneDocumentEditor>
    </CampaignViewerContextAndPropsContext.Provider>
  );
}

// will be removed after useEditor is ready
function EditorUXServer({ focus }: { focus: { node?: string } }) {
  const { select } = useDocument();
  const { fit } = useTransform();

  useEffect(() => {
    if (focus.node) {
      select([focus.node]);
      fit([focus.node], { margin: 64, animate: true });
    }
  }, [focus.node]);
  //
  return <></>;
}

function CustomComponent_Viewer__Referrer(componentprops: any) {
  const { campaign, props, locale } = useViewerContext();

  return (
    <div
      className="rounded shadow border bg-background"
      style={{
        ...componentprops.style,
      }}
      {...queryattributes(componentprops)}
    >
      <ReferrerPageTemplate
        design={{
          title: props?.components?.referrer?.title ?? "Enter a Title",
          description: props?.components?.referrer?.description,
          image: props?.components?.referrer?.image,
          logo: props.theme?.navbar?.logo,
          article: props?.components?.referrer?.article,
          cta: props?.components?.referrer?.cta ?? "Join Now",
          // brand_name: "Apple",
          // favicon: {
          //   src: "https://www.apple.com/favicon.ico",
          //   srcDark: "https://www.apple.com/favicon.ico",
          // },
          // footer: {
          //   link_privacy: "/privacy",
          //   link_instagram: "https://www.instagram.com/polestarcars/",
          //   paragraph: {
          //     html: "1. Hearing Aid and Hearing Test: The Hearing Aid feature has received FDA authorization. The Hearing Test and Hearing Aid features are supported on AirPods Pro 2 with the latest firmware paired with a compatible iPhone or iPad with iOS 18 or iPadOS 18 and later and are intended for people 18 years old or older. The Hearing Aid feature is also supported on a compatible Mac with macOS Sequoia and later. It is intended for people with perceived mild to moderate hearing loss.",
          //   },
          // },
        }}
        locale={locale}
        slug="dummy"
        data={{
          campaign: campaign,
          code: Platform.WEST.Referral.TEST_CODE_REFERRER,
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

function CustomComponent_Viewer__Invitation(componentprops: any) {
  const { campaign, props, locale } = useViewerContext();

  return (
    <div
      className="rounded shadow border bg-background"
      style={{
        ...componentprops.style,
      }}
      {...queryattributes(componentprops)}
    >
      <InvitationPageTemplate
        design={{
          title: props?.components?.invitation?.title ?? "Enter a Title",
          description: props?.components?.invitation?.description,
          logo: props.theme?.navbar?.logo,
          article: props?.components?.invitation?.article,
          cta: props?.components?.invitation?.cta ?? "Join Now",
          image: props?.components?.invitation?.image,
          // brand_name: "Apple",
          // favicon: {
          //   src: "https://www.apple.com/favicon.ico",
          //   srcDark: "https://www.apple.com/favicon.ico",
          // },
          // footer: {
          //   link_privacy: "/privacy",
          //   link_instagram: "https://www.instagram.com/polestarcars/",
          //   paragraph: {
          //     html: "1. Hearing Aid and Hearing Test: The Hearing Aid feature has received FDA authorization. The Hearing Test and Hearing Aid features are supported on AirPods Pro 2 with the latest firmware paired with a compatible iPhone or iPad with iOS 18 or iPadOS 18 and later and are intended for people 18 years old or older. The Hearing Aid feature is also supported on a compatible Mac with macOS Sequoia and later. It is intended for people with perceived mild to moderate hearing loss.",
          //   },
          // },
        }}
        locale={locale}
        data={{
          signup_form_id: "",
          referrer_id: "dummy",
          referrer_name: "DUMMY",
          is_claimed: false,
          code: Platform.WEST.Referral.TEST_CODE_INVITATION,
          created_at: "2025-10-01T00:00:00Z",
          type: "invitation",
          id: "123",
          campaign: campaign,
        }}
      />
    </div>
  );
}

function CustomComponent_Viewer__InvitationUXOverlay(componentprops: any) {
  const { campaign, props, locale } = useViewerContext();

  return (
    <div
      className="rounded shadow border bg-background"
      style={{
        ...componentprops.style,
      }}
      {...queryattributes(componentprops)}
    >
      <InvitationCouponTemplate
        locale={locale}
        data={{
          referrer_name: "DUMMY",
        }}
        design={{
          logo: props.theme?.navbar?.logo,
          coupon: props.components["invitation-ux-overlay"]?.image,
        }}
      />
    </div>
  );
}
