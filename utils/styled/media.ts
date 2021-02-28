export const media = (min: string | null, max: string | null) =>
  [
    "@media only screen",
    min && `(min-width: ${min})`,
    max && `(max-width: calc(${max} - 1px))`,
  ]
    .filter(x => x)
    .join(" and ");
