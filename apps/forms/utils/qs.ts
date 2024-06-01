/**
 * parsed query value
 */
export const qval = (v?: string | null) => {
  if (v) return v;
  else return null;
};

/**
 * Convert string to boolean (formdata, searchparams)
 */
export const qboolean = (v: string | null): boolean => {
  return v === "1" || v === "true" || v === "on";
};
