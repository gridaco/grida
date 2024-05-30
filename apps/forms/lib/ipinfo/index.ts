const ACCESS_TOKEN = process.env.IPINFO_ACCESS_TOKEN;

export async function ipinfo(ip: string, access_token?: string) {
  const res = await fetch(
    `https://ipinfo.io/${ip}/json?token=${access_token || ACCESS_TOKEN}`
  );
  return res.json();
}
