const RecraftLogo = ({ className, ...props }: React.ComponentProps<"svg">) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M19.667 8.275C19.667 3.705 15.517 0 10.397 0C8.623 0 7.184 3.705 7.184 8.275C7.184 9.418 7.274 10.508 7.437 11.499H4.29L1 23H10.4V16.553C15.517 16.553 19.666 12.846 19.666 8.278L19.667 8.275ZM10.397 1.515C11.327 1.515 12.079 4.543 12.079 8.275C12.079 12.008 11.327 15.035 10.398 15.035C9.468 15.035 8.717 12.008 8.717 8.275C8.717 4.543 9.469 1.515 10.397 1.515Z"
        fill="currentColor"
      />
      <path
        d="M19.848 16.552H10.408L14.028 23H23.466L19.848 16.552Z"
        fill="currentColor"
      />
    </svg>
  );
};

export default RecraftLogo;
