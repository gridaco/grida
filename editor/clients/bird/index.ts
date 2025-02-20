export class Bird {
  constructor(
    readonly workspaceId: string,
    readonly channelId: string,
    // readonly connector: string,
    readonly auth: {
      access_key: string;
    }
  ) {}

  async sendsms({
    text,
    contacts,
  }: {
    text: string;
    contacts: {
      identifierValue: string;
      identifierKey: "phonenumber";
    }[];
  }) {
    const response = await fetch(
      "https://api.bird.com" +
        `/workspaces/${this.workspaceId}/channels/${this.channelId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `AccessKey ${this.auth.access_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          body: {
            type: "text",
            text: {
              text: text,
            },
          },
          receiver: {
            contacts: contacts,
          },
        }),
      }
    );

    return response.json();
  }
}
