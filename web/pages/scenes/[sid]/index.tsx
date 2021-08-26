import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { useRouter } from "next/router";
import { buildFlutterFrameUrl } from "@base-sdk/base/frame-embed";
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
import { ResizableIframeAppRunnerFrame } from "@app/scene-view/components";
import { useAuthState } from "@base-sdk-fp/auth-components-react";
import { redirectionSignin } from "util/auth";
import { getUserProfile } from "services/user-profile";
/** dev only */ import { profile_mockup } from "__test__/mockfile";
import { UserProfile } from "../../../../app/3rd-party-api/type";

import { ScaffoldSceneView } from "@app/scene-view/components/scaffold";
import { ElevatedSceneWrap } from "@app/scene-view/components/elevated-scene-wrapper";
import { QuicklookQueryParams } from "@base-sdk/base/features/quicklook";
import { IPlayer } from "../../../../app/components/top-bar/player-type";
/**
 * frame or url is required
 * @param frame the frame id of selected node, which uploaded to default bridged quicklook s3 buket.
 * @param url the custom url of the compiled js file. any source is allowed.
 */
export default function ScenesId() {
  const router = useRouter();
  const authState = useAuthState();
  const [source, setSource] = useState<__TMP_CodeData>();
  const [scene, setScene] = useState<SceneRecord>();
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [isPublic, setIsPublic] = useState<boolean>(false);
  const [players, setPlayers] = useState<IPlayer[]>();
  const [_appRunnerConfig, _setAppRunnerConfig] =
    useState<QuicklookQueryParams>();

  const service = makeService();

  let editingSource: string;

  useEffect(() => {
    redirectionSignin(authState);
    const fetchData = async () => {
      const sid = router.query.sid as string;
      await service
        .get(sid)
        .then((_scene) => {
          const _appConfig: QuicklookQueryParams = {
            framework: _framework(_scene.customdata_1p),
            url: extractSource____temporary(_scene).flutter.executable.url,
            language: _language(_scene.customdata_1p),
            name: _scene.rawname || "No Name",
            w: _scene.width,
            h: _scene.height,
            id: _scene.id,
          };
          _setAppRunnerConfig({
            ..._appConfig,
          });
          setScene(_scene);
          setSource(extractSource____temporary(_scene));
          setIsPublic(isSharingPolicyPublic(_scene.sharing));
        })
        .catch((error) => {
          console.log("error while fetching scnene data", error);
        });

      const { id, profileImage, username } = await getUserProfile();
      await getUserProfile()
        .then((_profile) => {
          const _player: IPlayer = {
            name: _profile.username,
            image: _profile.profileImage,
            id: _profile.id,
          };
          // TEMPORAY!!
          // Since there is no players information except for profile, only profile is put in the array.
          setPlayers([_player]);
        })
        .catch((error) => {
          console.log(error);
        });
    };

    if (router.query.sid) {
      fetchData();
    }
  }, [router.query, authState]);

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
    if (code.flutter !== "undefined") {
      return AppFramework.flutter;
    } else if (code.react !== "undefined") {
      return AppFramework.react;
    }
  }

  function _language(code) {
    if (code.flutter !== "undefined") {
      return AppLanguage.dart;
    } else if (code.react !== "undefined") {
      return AppLanguage.js;
    }
  }

  return (
    <>
      <EditorThemeProvider light>
        <TopBar
          controlDoubleClick={() => {}}
          // title={query.name || "No Name"}
          contorlModal={() => setIsShareModalOpen(!isShareModalOpen)}
          players={players}
        />
        <ShareModalContents
          sharableLink={makeSharableLink(scene?.id ?? "")}
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          isPublic={isPublic}
          onSharingPolicyChange={onSharingPolicyUpdate}
        />
        <Wrapper>
          <SideContainer style={{ width: "55vw" }}>
            <Background>
              {!scene ? (
                <CircularProgress />
              ) : (
                <>
                  <ElevatedSceneWrap>
                    {/* <ScaffoldSceneView
                      scene={scene}
                      mode="run"
                      appRunnerConfig={_appRunnerConfig}
                    /> */}
                    <ScaffoldSceneView scene={scene} mode="design" />
                  </ElevatedSceneWrap>
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

  const _emb_url = buildFlutterFrameUrl({
    id: props.id,
    src: props.source,
    mode: "url",
    language: "dart",
  });
  return (
    <>
      {/* TODO: add max width & initial height based on aspect ratio = w/h */}
      <ResizableIframeAppRunnerFrame width={props.width} height={props.height}>
        <IFrame id={props.id} src={_emb_url} />
      </ResizableIframeAppRunnerFrame>
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
