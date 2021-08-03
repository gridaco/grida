export const _IS_INTERNAL_DEV = process.env.INTERNAL_DEV
  ? (JSON.parse(process.env.INTERNAL_DEV) as boolean)
  : false;

/**
 * this indicates currnet app is running in internal dev mode
 * */
export function _is_internal_dev(): boolean {
  return _IS_INTERNAL_DEV;
}
