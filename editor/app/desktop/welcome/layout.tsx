/**
 * Forced sign-in gate for the desktop front door.
 *
 * The desktop requires a Grida account. This defense-in-depth server gate
 * prevents a direct or restored Welcome URL from rendering while signed out;
 * the native entry controller remains the sole window-lifecycle authority.
 */
export { DesktopAccountRequired as default } from "../_components/account-required";
