"use client";

export function Toggle({
  label,
  disabled,
  value,
  name,
  onChange,
}: {
  label?: string;
  disabled?: boolean;
  value?: boolean;
  name?: string;
  onChange?: (value: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center mb-5 cursor-pointer">
      <input
        type="checkbox"
        name={name}
        // className="sr-only peer" // the sr-only breaks the scroll layout.
        className="hidden peer"
        disabled={disabled}
        checked={value}
        onChange={(e) => {
          onChange?.(e.target.checked);
        }}
      />
      <div className="relative w-11 h-6 bg-neutral-200 rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-neutral-600 peer-checked:bg-blue-600"></div>
      {label && (
        <span className="ms-3 text-sm font-medium text-neutral-400 dark:text-neutral-600">
          {label}
        </span>
      )}
    </label>
  );
}
