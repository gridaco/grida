import Typr from "../typr";
import { Parser } from "../parse/parser";
import type { FontFeature } from "../parse/features";
import type { FvarData } from "../parse/fvar";
import type { StatData } from "../parse/stat";

interface RequestMessage {
  id: number;
  type: "parse" | "details";
  buffer: ArrayBuffer;
}

interface ResponseMessage {
  id: number;
  result?: any;
  error?: string;
}

self.onmessage = (ev: MessageEvent<RequestMessage>) => {
  const { id, type, buffer } = ev.data;
  try {
    if (type === "parse") {
      const font = Typr.parse(buffer);
      const response: ResponseMessage = { id, result: font };
      self.postMessage(response);
      return;
    }

    if (type === "details") {
      const parser = new Parser(buffer);
      const result: {
        fvar: FvarData;
        features: FontFeature[];
        stat: StatData;
        postscriptName?: string;
      } = {
        fvar: parser.fvar(),
        features: parser.features(),
        stat: parser.stat(),
        postscriptName: parser.postscriptName(),
      };
      self.postMessage({ id, result });
      return;
    }

    self.postMessage({ id, error: "Unknown message type" });
  } catch (error: any) {
    self.postMessage({ id, error: error?.message ?? String(error) });
  }
};
