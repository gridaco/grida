/** Public compatibility metadata shared by Desktop Main and the hosted editor. */
export namespace DesktopCompatibility {
  export type Policy = Readonly<{
    /** The first patch of the oldest supported release line, or null. */
    minimumSupportedVersion: string | null;
    /** An installable stable release tag version, or null. */
    updateVersion: string | null;
  }>;

  type Version = {
    numbers: readonly [number, number, number];
    prerelease: readonly string[];
    build?: string;
  };

  const SEMVER =
    /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*))?(?:\+([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*))?$/;
  const NUMERIC = /^[0-9]+$/;

  function version(value: unknown): Version | null {
    if (typeof value !== "string" || value.length > 256) return null;
    const match = SEMVER.exec(value);
    if (!match || match[0] !== value) return null;
    const [, major, minor, patch, pre, build] = match;
    const numbers = [Number(major), Number(minor), Number(patch)] as const;
    if (!numbers.every(Number.isSafeInteger)) return null;
    const prerelease = pre?.split(".") ?? [];
    if (prerelease.some((part) => /^0[0-9]+$/.test(part))) return null;
    return { numbers, prerelease, build };
  }

  function stable(value: unknown): Version | null {
    const parsed = version(value);
    return parsed && !parsed.prerelease.length && parsed.build === undefined
      ? parsed
      : null;
  }

  function order<T extends number | string>(left: T, right: T): number {
    return left === right ? 0 : left < right ? -1 : 1;
  }

  function precedence(left: Version, right: Version): number {
    for (const index of [0, 1, 2] as const) {
      const core = order(left.numbers[index], right.numbers[index]);
      if (core) return core;
    }
    const a = left.prerelease;
    const b = right.prerelease;
    if (!a.length || !b.length)
      return order(Number(!a.length), Number(!b.length));
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] === b[i]) continue;
      const aNumeric = NUMERIC.test(a[i]);
      const bNumeric = NUMERIC.test(b[i]);
      if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
      if (aNumeric && a[i].length !== b[i].length) {
        return order(a[i].length, b[i].length);
      }
      return order(a[i], b[i]);
    }
    return order(a.length, b.length);
  }

  export function compare(left: string, right: string): number | null {
    const a = version(left);
    const b = version(right);
    return a && b ? precedence(a, b) : null;
  }

  export function parse(value: unknown): Policy | null {
    if (
      typeof value !== "object" ||
      value === null ||
      !("minimumSupportedVersion" in value) ||
      !("updateVersion" in value)
    ) {
      return null;
    }

    const { minimumSupportedVersion, updateVersion } = value;
    const update = stable(updateVersion);
    if (
      updateVersion !== null &&
      (typeof updateVersion !== "string" || !update)
    ) {
      return null;
    }
    if (minimumSupportedVersion === null) {
      return { minimumSupportedVersion, updateVersion };
    }
    const minimum = stable(minimumSupportedVersion);
    if (
      typeof minimumSupportedVersion !== "string" ||
      !minimum ||
      minimum.numbers[2] !== 0 ||
      !update ||
      precedence(update, minimum) < 0
    ) {
      return null;
    }
    return { minimumSupportedVersion, updateVersion };
  }

  export function requiresUpdate(
    installedVersion: string,
    policy: Policy
  ): boolean {
    if (policy.minimumSupportedVersion === null) return false;
    const result = compare(installedVersion, policy.minimumSupportedVersion);
    return result === null || result < 0;
  }

  /** Recovery uses the exact verified release tag, with a fixed publisher. */
  export function releaseUrl(releaseVersion: string): string | null {
    return stable(releaseVersion)
      ? `https://github.com/gridaco/grida/releases/tag/v${releaseVersion}`
      : null;
  }
}
