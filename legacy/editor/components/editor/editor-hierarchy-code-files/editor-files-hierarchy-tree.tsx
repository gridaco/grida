import React, { useCallback, useMemo, useState } from "react";
import { TreeView } from "@editor-ui/editor";
import {
  FileRow,
  IconContainer,
  FileIcon,
} from "./editor-files-hierarchy-item";
import { useEditorState, useWorkspace } from "core/states";
import { useDispatch } from "core/dispatch";
import { File } from "@grida/builder-config/output/output-file";

export function CodeFilesHierarchyTree() {
  const [state] = useEditorState();
  const { highlightLayer, highlightedLayer } = useWorkspace();
  const dispatch = useDispatch();

  const { selectedNodes, selectedPage, code } = state;

  const [expands, setExpands] = useState<string[]>(state?.selectedNodes ?? []);

  const { files: _filesmap } = code;
  const files = Object.values(_filesmap);

  // const layers: FlattenedDisplayItemNode[][] = useMemo(() => {
  //   return root
  //     ? root
  //         .filter(Boolean)
  //         .map((layer) => flattenNodeTree(layer, selectedNodes, expands))
  //     : [];
  // }, [root, state?.selectedNodes, expands]);

  const renderItem = useCallback(
    ({
      path,
      name,
      // expanded,
      // selected,
      type,
    }: File) => {
      const selected = selectedNodes.includes(path);
      const hovered = highlightedLayer === path;

      return (
        <FileRow
          key={path}
          id={path}
          icon={
            <IconContainer>
              <FileIcon
                type={type}
                // todo
                selected={false}
              />
            </IconContainer>
          }
          name={name}
          // todo
          depth={0}
          expanded={undefined}
          selected={selected}
          onClickChevron={() => {
            if (expands.includes(path)) {
              setExpands(expands.filter((e) => e !== path));
            } else {
              setExpands([...expands, path]);
            }
          }}
          onHoverChange={(hovered) => {
            highlightLayer(hovered ? path : undefined);
          }}
          hovered={hovered}
          onMenuClick={() => {}}
          onDoubleClick={() => {}}
          onPress={() => {
            dispatch({ type: "select-node", node: path });
          }}
          menuItems={[]}
          onSelectMenuItem={() => {}}
          onContextMenu={() => {}}
        />
      );
    },
    [dispatch, selectedNodes, files, expands, highlightedLayer]
  );

  return (
    <TreeView.Root
      data={files}
      keyExtractor={useCallback((item: any) => item.id, [])}
      renderItem={renderItem}
    />
  );
}
