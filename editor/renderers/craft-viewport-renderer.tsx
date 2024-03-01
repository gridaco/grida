import { CraftElement, CraftViewportNode } from "@code-editor/craft";

export function CraftViewportRenderer({
  target,
  renderer,
}: {
  target: CraftViewportNode;
  renderer: (props: { target: CraftElement }) => React.ReactNode;
}) {
  return (
    <iframe
      id={target.id}
      style={{
        width: target.width,
        height: target.height,
        background: appearance_background[target.appearance],
        boxShadow: "0 0 16px 1px rgba(0,0,0,.1)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {target.children?.map((target) => renderer({ target }))}
    </iframe>
  );
}

const appearance_background = {
  light: "white",
  dark: "black",
};
