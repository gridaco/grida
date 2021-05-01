import React, { useEffect, useState } from "react";
import { figmacomp, canvas, code, runner } from "../../components";
import dynamic from "next/dynamic";
import { flutter } from "@designto/codes";
import { composeAppWithHome } from "@bridged.xyz/flutter-builder/dist/lib/composer";
import { utils_dart } from "../../utils";
import styled from "@emotion/styled";

import { ReflectSceneNode } from "@bridged.xyz/design-sdk/lib/nodes";
const CodemirrorEditor = dynamic(
  import("../../components/code-editor/code-mirror"),
  {
    ssr: false,
  }
);

export default function FigmaDeveloperPage() {
  const [reflect, setReflect] = useState<ReflectSceneNode>();
  const flutterAppBuild = reflect && flutter.buildApp(reflect);
  const widget = flutterAppBuild?.widget;
  const app =
    widget &&
    flutter.makeApp({
      widget: widget,
      scrollable: flutterAppBuild.scrollable,
    });

  const widgetCode = utils_dart.format(widget?.build()?.finalize());
  const rootAppCode = app && utils_dart.format(composeAppWithHome(app));

  const handleOnDesignImported = (reflect: ReflectSceneNode) => {
    setReflect(reflect);
  };

  return (
    <>
      <canvas.DefaultCanvas />
      <figmacomp.FigmaScreenImporter onImported={handleOnDesignImported} />
      <ContentWrap>
        <CodemirrorEditor
          value={
            widgetCode
              ? widgetCode
              : "// No input design provided to be converted.."
          }
          options={{
            mode: "dart",
            theme: "monokai",
            lineNumbers: true,
          }}
        />
        {widgetCode && (
          <runner.FlutterAppRunner
            q={{
              src: rootAppCode,
              mode: "content",
              language: "dart",
            }}
            width={375}
            height={812}
          />
        )}
      </ContentWrap>
    </>
  );
}

const ContentWrap = styled.div`
  display: flex;
  flex-direction: row;
  align-items: stretch;
`;
