import dynamic from "next/dynamic";
import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { figmacomp, canvas, runner } from "../../components";
import { flutter } from "@designto/code";
import { composeAppWithHome } from "@bridged.xyz/flutter-builder";
import { features, types, hosting } from "@bridged.xyz/base-sdk";
import { ReflectSceneNode } from "@design-sdk/core/nodes";
import { utils_dart } from "../../utils";
import { nanoid } from "nanoid";
import { MainImageRepository } from "@design-sdk/core/assets-repository";
import { ImageRepositories } from "@design-sdk/figma/asset-repository";

// set image repo for figma platform
MainImageRepository.instance = new ImageRepositories();

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
          <div>
            <runner.FlutterAppRunner
              q={{
                src: rootAppCode,
                mode: "content",
                language: "dart",
              }}
              width={375}
              height={812}
            />
            <br />
            <button
              onClick={() => {
                const _name = "fluttercodefromdesigntocode";
                hosting
                  .upload({
                    file: rootAppCode,
                    name: `${_name}.dart`,
                  })
                  .then((r) => {
                    const qlurl = features.quicklook.buildConsoleQuicklookUrl({
                      id: nanoid(),
                      framework: types.AppFramework.flutter,
                      language: types.AppLanguage.dart,
                      url: r.url,
                      name: _name,
                    });
                    open(qlurl);
                  });
              }}
            >
              open in console
            </button>
          </div>
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
