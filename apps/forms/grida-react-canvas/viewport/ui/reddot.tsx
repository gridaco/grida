import React from "react";

export const RedDotHandle = React.forwardRef(
  (
    props: React.HTMLAttributes<HTMLButtonElement>,
    forwaredRef: React.Ref<HTMLButtonElement>
  ) => {
    return (
      <button
        ref={forwaredRef}
        className="
          absolute
          w-0.5 h-0.5 
          group-hover:w-2 group-hover:h-2
          rounded-full
          border border-pink-500
          hover:bg-pink-500
          ring-1 ring-white
        "
        style={{
          transform: "translate(-50%, -50%)",
          touchAction: "none",
        }}
        {...props}
      />
    );
  }
);

RedDotHandle.displayName = "RedDotHandle";
