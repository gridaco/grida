/**
 * Required Grida-account gate for first-run onboarding.
 *
 * The canonical entry window routes signed-out users to the sign-in surface.
 * This layout is defense in depth for direct or restored
 * `/desktop/onboarding` loads: onboarding never precedes Grida authentication.
 */
export { DesktopAccountRequired as default } from "../_components/account-required";
