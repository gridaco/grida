import React, { useEffect, useState } from "react";
import { designToCode, Result } from "@designto/code";
import { config } from "@grida/builder-config";
import { useTargetContainer } from "hooks/use-target-node";
import { useWorkspaceState } from "core/states";
import { MonacoEditor } from "components/code-editor";
import { InspectorSection } from "components/inspector";
import { Button } from "@editor-ui/button";
import { useDispatch } from "core/dispatch";

export function CodeSection() {
  const wstate = useWorkspaceState();
  const { target, root } = useTargetContainer();
  const [result, setResult] = useState<Result>();
  const dispatch = useDispatch();

  const on_result = (result: Result) => {
    setResult(result);
  };

  const on_open = () => {
    dispatch({ type: "mode", mode: "code" });
  };

  useEffect(() => {
    if (target) {
      const _input = {
        id: target.id,
        name: target.name,
        entry: target,
        repository: root.repository,
      };
      const build_config = {
        ...config.default_build_configuration,
        disable_components: true,
      };

      designToCode({
        input: _input,
        framework: wstate.preferences.framework_config,
        asset_config: { skip_asset_replacement: true },
        build_config: build_config,
      })
        .then(on_result)
        .catch(console.error);
    }
  }, [target?.id]);

  const { code, scaffold, name: componentName, framework } = result ?? {};
  if (code) {
    return (
      <InspectorSection
        border
        label={"Code"}
        contentPadding="8px 0 0 0"
        actions={
          <>
            <Button id="open-code-editor" onClick={on_open}>
              Open Code editor
            </Button>
          </>
        }
      >
        <MonacoEditor
          readonly
          width={"100%"}
          value={code.raw}
          height={target.isRoot ? 800 : 400}
          options={{
            lineNumbers: "off",
            glyphMargin: false,
            minimap: { enabled: false },
          }}
        />
      </InspectorSection>
    );
  }

  return <></>;
}
