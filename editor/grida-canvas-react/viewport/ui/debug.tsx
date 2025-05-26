export function DebugPointer({ position }: { position: [number, number] }) {
  return (
    <div
      style={{
        position: "absolute",
        transform: `translate(${position[0]}px, ${position[1]}px)`,
        pointerEvents: "none",
        zIndex: 1000,
      }}
    >
      <div
        className="rounded-full bg-red-500 size-2"
        style={{
          transform: "translate(-50%, -50%)",
        }}
      />
    </div>
  );
}
