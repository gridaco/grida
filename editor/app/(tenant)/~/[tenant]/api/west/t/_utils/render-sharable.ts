export function renderSharable({
  template,
  context: { baseUrl, referrer_name, invitation_code },
}: {
  template: unknown;
  context: {
    baseUrl: string | URL;
    referrer_name: string;
    invitation_code: string;
  };
}) {
  return {
    // FIXME: content template
    title: "Polestar 시승하고 경품 받아가세요 🎁",
    text: `${referrer_name} 님 께서 Polestar 시승 이벤트에 초대합니다!`,
    url: `${baseUrl.toString()}/t/${invitation_code}`,
  };
}
