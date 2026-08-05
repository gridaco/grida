/**
 * Official ElevenLabs "11" symbol for compact applications.
 * @see https://elevenlabs.io/brand
 */
const ElevenLabsLogo = ({
  className,
  ...props
}: React.ComponentProps<"svg">) => {
  return (
    <svg
      width="876"
      height="876"
      viewBox="0 0 876 876"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <path d="M468 292H528V584H468V292Z" fill="currentColor" />
      <path d="M348 292H408V584H348V292Z" fill="currentColor" />
    </svg>
  );
};

export default ElevenLabsLogo;
