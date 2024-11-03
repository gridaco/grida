export function RGBAChip({
  rgba,
}: {
  rgba: { r: number; g: number; b: number; a: number };
}) {
  return (
    <div>
      <div
        className="rounded-sm border border-gray-300 w-6 h-6"
        style={{
          backgroundColor: `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a})`,
        }}
      />
    </div>
  );
}
