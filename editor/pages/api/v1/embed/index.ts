import { Language } from "@grida/builder-platform-types";
import { code } from "@grida/code";
import { Request, Response } from "express";

export default async function handler(req: Request, res: Response) {
  // get the access token from the query string
  const { figma, fpat, fat } = req.query;

  if (!figma) {
    res.status(400).send("<h1>No figma file url is provided</h1>");
    return;
  }

  if (!fpat && !fat) {
    res.status(400).send("<h1>No figma access token is provided</h1>");
    return;
  }

  try {
    const { src } = await code({
      uri: figma as string,
      framework: {
        framework: "preview",
        imgage_alt: {},
        language: Language.html,
      },
      auth: {
        accessToken: fat as string,
        personalAccessToken: fpat as string,
      },
    });

    res.status(200).send(src);
  } catch (e) {
    res.status(500).send(`<h1>${e.message}</h1><pre>${e.stack}</pre>`);
    throw e;
  }
}
