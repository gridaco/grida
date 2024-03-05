export function EditableFormTitle({
  value,
  onChange,
}: {
  value?: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <input
      className="shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
      type="text"
      value={value}
      onChange={onChange}
    />
  );
}
