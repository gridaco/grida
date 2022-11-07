import React, { useEffect, useState } from "react";
import {
  PropertyLine,
  PropertyGroup,
  PropertyGroupHeader,
} from "@editor-ui/property";
import { Result } from "@designto/code";
import { useTargetContainer } from "hooks/use-target-node";
import { useWorkspaceState } from "core/states";
import { MonacoEditor } from "components/code-editor";
import { InspectorSection } from "components/inspector";
import { Button } from "@editor-ui/button";
import { useDispatch } from "core/dispatch";
import { code as wwcode } from "../code/code-worker-messenger";
import { CircularProgress } from "@mui/material";

export function CodeSection() {
  const wstate = useWorkspaceState();
  const { target, root } = useTargetContainer();
  const [result, setResult] = useState<Result>(null);
  const dispatch = useDispatch();

  const on_result = (result: Result) => {
    setResult(result);
  };

  const on_open = () => {
    dispatch({ type: "mode", mode: "code" });
  };

  useEffect(() => {
    // clear data.
    setResult(null);

    if (!target) {
      return;
    }

    wwcode({
      target: target.id,
      framework: wstate.preferences.framework_config,
    }).then(on_result);
  }, [target?.id]);

  const { code } = result ?? {};
  const viewheight = target?.isRoot ? 800 : 400;

  return (
    <PropertyGroup>
      <PropertyGroupHeader>
        <h6>Code</h6>
        <Button id="open-code-editor" onClick={on_open}>
          Open Code editor
        </Button>
      </PropertyGroupHeader>
      {code ? (
        <>
          <MonacoEditor
            readonly
            width={"100%"}
            value={code.raw}
            height={viewheight}
            fold_comments_on_load
            options={{
              lineNumbers: "off",
              glyphMargin: false,
              minimap: { enabled: false },
            }}
          />
        </>
      ) : (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: viewheight,
          }}
        >
          <CircularProgress size={24} />
        </div>
      )}
    </PropertyGroup>
  );
}
