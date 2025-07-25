import React, { useEffect, useReducer } from "react";
import queryattributes from "@/grida-canvas-react-renderer-dom/nodes/utils/attributes";
import ReferrerPageTemplate from "@/theme/templates/west-referral/referrer/page";
import ShareDialog from "@/theme/templates/west-referral/referrer/share";
import InvitationCouponTemplate from "@/theme/templates/west-referral/invitation/coupon";
import InvitationPageTemplate from "@/theme/templates/west-referral/invitation/page";
import {
  StandaloneDocumentEditor,
  ViewportRoot,
  EditorSurface,
  StandaloneSceneContent,
  AutoInitialFitTransformer,
  StandaloneSceneBackground,
  UserCustomTemplatesProvider,
  useCurrentEditor,
} from "@/grida-canvas-react";
import { Zoom } from "@/scaffolds/sidecontrol/sidecontrol-node-selection";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@/components/lib/utils";
import { PreviewProvider } from "@/grida-canvas-react-starter-kit/starterkit-preview";
import { Platform } from "@/lib/platform";
import { TemplateData } from "@/theme/templates/west-referral/templates";
import { ReadonlyPropsEditorInstance } from "@/scaffolds/props-editor";
import MessageAppFrame from "@/components/frames/message-app-frame";
import { editor } from "@/grida-canvas";
import { useEditor } from "@/grida-canvas-react";

const document: editor.state.IEditorStateInit = {
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
        top: 0,
        left: 0,
      },
      "referrer-share": {
        id: "referrer-share",
        name: "Referrer Share Dialog",
        type: "template_instance",
        template_id: "grida_west_referral.duo-000.referrer-share",
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
      "referrer-share-message": {
        id: "referrer-share-message",
        name: "Referrer Share Message",
        type: "template_instance",
        template_id: "grida_west_referral.duo-000.referrer-share-message",
        position: "absolute",
        removable: false,
        active: true,
        locked: false,
        width: 375,
        height: 812,
        properties: {},
        props: {},
        overrides: {},
        top: 0,
        left: 1000,
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
        left: 2000,
        properties: {},
        props: {},
        overrides: {},
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
        left: 2500,
      },
    },
    entry_scene_id: "main",
    scenes: {
      main: {
        type: "scene",
        id: "main",
        name: "Referrer's Page",
        children: [
          "referrer",
          "referrer-share",
          "referrer-share-message",
          "invitation",
          "invitation-ux-overlay",
        ],
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
    ["grida_west_referral.duo-000.referrer-share"]: {
      name: "Referrer Share Dialog",
      type: "template",
      properties: {},
      default: {},
      version: "0.0.0",
      nodes: {},
    },
    ["grida_west_referral.duo-000.referrer-share-message"]: {
      name: "Referrer Share Message",
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
  const instance = useEditor(editor.state.init(document));

  return (
    <CampaignViewerContextAndPropsContext.Provider
      value={{ ...props, campaign: campaign, locale }}
    >
      <StandaloneDocumentEditor editor={instance}>
        <EditorUXServer focus={focus} />
        <UserCustomTemplatesProvider
          templates={{
            "grida_west_referral.duo-000.referrer":
              CustomComponent_Viewer__Referrer,
            "grida_west_referral.duo-000.referrer-share":
              CustomComponent_Viewer__ReferrerShare,
            "grida_west_referral.duo-000.referrer-share-message":
              CustomComponent_Viewer__ReferrerShareMessage,
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
  const editor = useCurrentEditor();

  useEffect(
    () => {
      if (focus.node) {
        editor.select([focus.node]);
        editor.fit([focus.node], { margin: 64, animate: true });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focus.node]
  );
  //
  return <></>;
}

function CustomComponent_Viewer__Referrer(componentprops: any) {
  const { campaign, props, locale } = useViewerContext();

  return (
    <div
      className="rounded-sm shadow border bg-background"
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
        }}
        locale={locale}
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

function CustomComponent_Viewer__ReferrerShare(componentprops: any) {
  const { campaign, props, locale } = useViewerContext();

  return (
    <div
      className="rounded-sm shadow border relative overflow-hidden"
      style={{
        ...componentprops.style,
        minHeight: 812,
      }}
      {...queryattributes(componentprops)}
    >
      <ShareDialog
        defaultOpen
        open
        locale={locale}
        data={{
          article: props?.components?.["referrer-share"]?.article,
          consent: props?.components?.["referrer-share"]?.consent,
          cta: props?.components?.["referrer-share"]?.cta,
        }}
      />
    </div>
  );
}

function CustomComponent_Viewer__ReferrerShareMessage(componentprops: any) {
  const { campaign, props, locale } = useViewerContext();

  const message = props?.components?.["referrer-share-message"]?.message;

  return (
    <div
      className="rounded-sm shadow border relative overflow-hidden"
      style={{
        ...componentprops.style,
        width: 375,
        height: 812,
      }}
      {...queryattributes(componentprops)}
    >
      <MessageAppFrame
        sender={{
          avatar: "JD",
          name: "John Doe",
          phone: "+1 234 567 890",
        }}
        messages={[
          {
            message: "Hello, how are you?",
            role: "incoming",
          },
          {
            message: message || "{{url}}",
            role: "outgoing",
          },
        ]}
      />
    </div>
  );
}

function CustomComponent_Viewer__Invitation(componentprops: any) {
  const { campaign, props, locale } = useViewerContext();

  return (
    <div
      className="rounded-sm shadow border bg-background"
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
      className="rounded-sm shadow border bg-background"
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
