export namespace desktopPlatform {
  export type OS = "mac" | "windows" | "linux";

  export function detect(userAgent: string, maxTouchPoints = 0): OS | null {
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)) return null;
    // iPadOS can request a desktop site using a macOS user agent.
    if (userAgent.includes("Mac") && maxTouchPoints > 1) return null;
    if (userAgent.includes("Win")) return "windows";
    if (userAgent.includes("Mac")) return "mac";
    if (userAgent.includes("Linux")) return "linux";
    return null;
  }
}
