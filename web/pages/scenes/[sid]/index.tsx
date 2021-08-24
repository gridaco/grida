import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { useRouter } from "next/router";

import { QuicklookQueryParams } from "@base-sdk/base/features/quicklook";
import Editor, { useMonaco } from "@monaco-editor/react";
import CircularProgress from "@material-ui/core/CircularProgress";
import { checkFrameSourceMode } from "@base-sdk/base/frame-embed";
import { AppFramework, AppLanguage } from "@base-sdk/base/types";
import Background from "@app/scene-view/components/canves/background";
import { EditorThemeProvider } from "../../../../ui/editor-ui/packages/editor-ui-theme";
import { TopBar } from "../../../../app/components";
import { ShareModalContents } from "@app/scene-view";
import { makeService } from "services/scenes-store";
import { SceneRecord } from "@base-sdk/scene-store";
import { __PutSharingPolicy } from "@base-sdk/scene-store/dist/__api/server-types";
import { FrameFlutter } from "@app/scene-view/components";

/**
 * frame or url is required
 * @param frame the frame id of selected node, which uploaded to default bridged quicklook s3 buket.
 * @param url the custom url of the compiled js file. any source is allowed.
 */
export default function ScenesId() {
  const router = useRouter();
  const [source, setSource] = useState<__TMP_CodeData>();
  const [scene, setScene] = useState<SceneRecord>();
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [isPublic, setIsPublic] = useState<boolean>(false);

  const service = makeService();

  let editingSource: string;

  useEffect(() => {
    const fetchData = async () => {
      const sid = router.query.sid as string;
      await service
        .get(sid)
        .then((scene) => {
          console.log(scene);
          setScene(scene);
          setSource(extractSource____temporary(scene));
          setIsPublic(isSharingPolicyPublic(scene.sharing));
        })
        .catch((error) => {
          console.log("error while fetching scnene data", error);
        });
    };

    if (router.query.sid) {
      fetchData();
    }
  }, [router.query]);

  async function onSharingPolicyUpdate(isPublic: boolean) {
    setIsPublic(isPublic);
    const newPolicyBasedOnUserControl = isPublic ? "*" : "none";
    await service
      .updateSharing(scene.id, {
        sharingPolicy: { policy: newPolicyBasedOnUserControl },
      })
      .then(() => {
        setIsPublic(isPublic);
      })
      .catch((error) => {
        setIsPublic(!isPublic); // revert to previous.
        console.log("Update Sharing policy failed", error);
      });
  }

  function _framework(code) {
    if (!!code.flutter) {
      return AppFramework.flutter;
    } else if (!!code.react) {
      return AppFramework.react;
    }
  }

  function _language(code) {
    if (!!code.flutter) {
      return AppLanguage.dart;
    } else if (!!code.react) {
      return AppLanguage.js;
    }
  }

  return (
    <>
      <EditorThemeProvider light>
        <TopBar
          controlDoubleClick={() => {}}
          // title={query.name || "No Name"}
          title={""}
          contorlModal={() => setIsShareModalOpen(!isShareModalOpen)}
        />
        <ShareModalContents
          sharableLink={makeSharableLink(scene?.id ?? "")}
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          isPublic={isPublic}
          onSharingPolicyChange={onSharingPolicyUpdate}
        />
        <Wrapper>
          <SideContainer>
            <Background>
              {!scene ? (
                <CircularProgress />
              ) : (
                <>
                  {AppRunnerFrame({
                    id: scene.id,
                    framework: _framework(scene.customdata_1p),
                    source: scene.preview, // TODO:
                    preview: scene.preview,
                    language: _language(scene.customdata_1p),
                    width: scene.width,
                    height: scene.height,
                  })}
                </>
              )}
            </Background>
          </SideContainer>
          <SideContainer
            style={{ width: "45vw", background: "#1e1e1e", paddingTop: "70px" }}
          >
            <Editor
              language="dart"
              theme="vs-dark"
              value={source?.flutter?.widget.raw}
              options={{
                unusualLineTerminators: "off",
              }}
              onChange={(value: string) => {
                editingSource = value;
              }}
            />
          </SideContainer>
        </Wrapper>
      </EditorThemeProvider>
    </>
  );
}

interface __TMP_PlatformCode {
  widget: {
    raw: string;
    url: string;
  };
  executable: {
    raw: string;
    url: string;
  };
}
interface __TMP_CodeData {
  flutter?: __TMP_PlatformCode;
  react?: __TMP_PlatformCode;
}

interface __TMP_1stparty_custom_data_shape {
  code: __TMP_CodeData;
}
function extractSource____temporary(scene: SceneRecord): __TMP_CodeData {
  /** we use customdata_1p temporarily. this is configured on upload from assistant. */
  return (
    scene.customdata_1p as {
      code: {
        flutter: {
          widget: {
            raw: string;
            url: string;
          };
          executable: {
            raw: string;
            url: string;
          };
        };
      };
    }
  ).code;
}

function makeSharableLink(id: string): string {
  return `https://app.grida.co/preview?scene=${id}`;
}

function isSharingPolicyPublic(sharing: "*" | "none"): boolean {
  switch (sharing) {
    case "*":
      return true;
    case "none":
      return false;
    default:
      return false;
  }
}

function AppRunnerFrame(props: {
  id: string;
  source: string;
  preview: string;
  framework: AppFramework;
  language: AppLanguage;
  width: number;
  height: number;
}) {
  // region check mode
  const mode = checkFrameSourceMode(props.framework, props.source);
  // endregion check mode

  const loading = <CircularProgress />;

  if (!props.source && !props.id) {
    return loading;
  }

  return (
    <>
      <FrameFlutter width={props.width} height={props.height}>
        <IFrame id={props.id} src={props.preview} />
      </FrameFlutter>
    </>
  );
}

const Wrapper = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  height: 100vh;
  overflow-y: hidden;
`;

const SideContainer = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
`;

const IFrame = styled.iframe`
  background: #ffffff;
  box-shadow: 0px 0px 4px rgba(222, 222, 222, 0.25),
    0px 0px 32px 4px rgba(220, 220, 220, 0.12);
  border-radius: 2px;
  width: 100%;
  height: 100%;
`;

const ButtonList = styled.div`
  display: flex;
  align-items: center;
`;

const Button = styled.button`
  color: white;
  padding: 8px 12px;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  span {
    font-weight: 500;
    font-size: 14px;
    line-height: 1.2;
    text-transform: capitalize;
  }

  &:active,
  &:focus {
    outline: 0;
  }
`;

const ButtonIconImage = styled.img`
  width: 16px;
  height: 16px;
  margin-right: 8px;
`;
