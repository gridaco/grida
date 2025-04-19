import TextareaAutosize from "react-textarea-autosize";

export function Title({
  value,
  onValueChange,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  return (
    <TextareaAutosize
      className="resize-none overflow-hidden p-0 bg-transparent border-none outline-none text-4xl font-bold w-full"
      placeholder="Event Name"
      value={value}
      maxLength={140}
      onChange={(e) => onValueChange?.(e.target.value.replace(/\n/g, " "))}
    />
  );
}
