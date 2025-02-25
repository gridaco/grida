const ACCESS_TOKEN = process.env.IPINFO_ACCESS_TOKEN;

export async function ipinfo(
  ip: string,
  access_token?: string
): Promise<IpInfo> {
  const res = await fetch(
    `https://ipinfo.io/${ip}/json?token=${access_token || ACCESS_TOKEN}`
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch ipinfo: ${res.status}`);
  }
  return res.json();
}

export interface IpInfo {
  ip: string;
  city?: string;
  region?: string;
  country?: string;
  /**
   * E.g. "37.5660,126.9784"
   */
  loc?: string;
  org?: string;
  postal?: string;
  timezone?: string;
}
