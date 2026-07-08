const VercelLogo = ({ className, ...props }: React.ComponentProps<"svg">) => {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <path
        d="M35.5 33.5949H4.5L20 6.40511L35.5 33.5949Z"
        fill="currentColor"
      />
    </svg>
  );
};

export default VercelLogo;
