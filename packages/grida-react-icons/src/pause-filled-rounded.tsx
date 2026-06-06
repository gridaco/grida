/**
 * Pause glyph — filled, rounded corners. The `Rounded` is explicit because its
 * pair `PlayFilledIcon` is sharp-cornered (see the README naming rules).
 */
export default function PauseFilledRoundedIcon({
  className,
  ...props
}: React.ComponentProps<"svg">) {
  return (
    <svg
      height={24}
      width={24}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 47.607 47.607"
      fill="currentColor"
      className={className}
      {...props}
    >
      <g>
        <path d="M17.991,40.976c0,3.662-2.969,6.631-6.631,6.631l0,0c-3.662,0-6.631-2.969-6.631-6.631V6.631C4.729,2.969,7.698,0,11.36,0l0,0c3.662,0,6.631,2.969,6.631,6.631V40.976z" />
        <path d="M42.877,40.976c0,3.662-2.969,6.631-6.631,6.631l0,0c-3.662,0-6.631-2.969-6.631-6.631V6.631C29.616,2.969,32.585,0,36.246,0l0,0c3.662,0,6.631,2.969,6.631,6.631V40.976z" />
      </g>
    </svg>
  );
}
