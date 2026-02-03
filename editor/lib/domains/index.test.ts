import {
  DEFAULT_PLATFORM_APEX_DOMAIN,
  getDomainKind,
  isBlacklistedHostname,
  isPlatformSiteHostname,
  isReservedAppHostname,
  normalizeHostname,
  platformSiteHostnameForTenant,
  platformSiteTenantFromHostname,
} from "./index";

describe("lib/domains", () => {
  describe("normalizeHostname", () => {
    test("lowercases and strips trailing dot", () => {
      expect(normalizeHostname("ExAmPlE.CoM.")).toBe("example.com");
    });

    test("rejects scheme, path, query, fragment", () => {
      expect(normalizeHostname("https://example.com")).toBeNull();
      expect(normalizeHostname("example.com/foo")).toBeNull();
      expect(normalizeHostname("example.com?x=1")).toBeNull();
      expect(normalizeHostname("example.com#hash")).toBeNull();
    });

    test("rejects ports", () => {
      expect(normalizeHostname("example.com:3000")).toBeNull();
    });

    test("rejects empty / whitespace", () => {
      expect(normalizeHostname("")).toBeNull();
      expect(normalizeHostname("   ")).toBeNull();
    });
  });

  describe("isBlacklistedHostname", () => {
    test('blocks anything containing "vercel"', () => {
      expect(isBlacklistedHostname("foo.vercel.app")).toBe(true);
      expect(isBlacklistedHostname("VERCEL-dns.com")).toBe(true);
      expect(
        isBlacklistedHostname("i-bought-vercel-keyword-containing-domain.com")
      ).toBe(true);
    });

    test("does not block normal domains", () => {
      expect(isBlacklistedHostname("example.com")).toBe(false);
      expect(isBlacklistedHostname("tenant.grida.site")).toBe(false);
    });
  });

  describe("isReservedAppHostname", () => {
    test("reserves app apex domains and all subdomains", () => {
      expect(isReservedAppHostname("grida.co")).toBe(true);
      expect(isReservedAppHostname("hacked.grida.co")).toBe(true);

      expect(isReservedAppHostname("bridged.xyz")).toBe(true);
      expect(isReservedAppHostname("anything.bridged.xyz")).toBe(true);
    });

    test("does not reserve platform site suffixes", () => {
      expect(isReservedAppHostname("grida.site")).toBe(false);
      expect(isReservedAppHostname("tenant.grida.site")).toBe(false);
    });
  });

  describe("isPlatformSiteHostname", () => {
    test("matches platform apexes and any subdomains", () => {
      expect(isPlatformSiteHostname("grida.site")).toBe(true);
      expect(isPlatformSiteHostname("tenant.grida.site")).toBe(true);
      expect(isPlatformSiteHostname("grida.app")).toBe(true);
      expect(isPlatformSiteHostname("tenant.grida.app")).toBe(true);
    });

    test("does not match other apexes", () => {
      expect(isPlatformSiteHostname("grida.co")).toBe(false);
      expect(isPlatformSiteHostname("example.com")).toBe(false);
    });
  });

  describe("platformSiteTenantFromHostname", () => {
    test("extracts tenant and apex", () => {
      expect(platformSiteTenantFromHostname("tenant.grida.site")).toEqual({
        tenant: "tenant",
        apex: "grida.site",
      });
    });

    test("returns null for apex-only", () => {
      expect(platformSiteTenantFromHostname("grida.site")).toBeNull();
    });

    test("supports nested subdomains (tenant identity includes dots)", () => {
      expect(platformSiteTenantFromHostname("a.b.grida.site")).toEqual({
        tenant: "a.b",
        apex: "grida.site",
      });
    });
  });

  describe("platformSiteHostnameForTenant", () => {
    test("uses default platform apex", () => {
      expect(platformSiteHostnameForTenant("tenant")).toBe(
        `tenant.${DEFAULT_PLATFORM_APEX_DOMAIN}`
      );
    });
  });

  describe("getDomainKind", () => {
    test("treats two labels as apex, more as subdomain", () => {
      expect(getDomainKind("example.com")).toBe("apex");
      expect(getDomainKind("app.example.com")).toBe("subdomain");
    });
  });
});
