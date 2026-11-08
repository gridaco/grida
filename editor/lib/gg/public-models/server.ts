import "server-only";
import { createCatalogueReader } from "./cache";
import { ggConfig } from "../config";

// Deliberately separate from authenticated product transport: discovery sends no key.
// Share page/route-handler entrypoints and development reloads within one process.
const { origin, allowInsecureLoopback } = ggConfig.publicModels();
const readers = globalThis as typeof globalThis & {
  __gridaPublicModelReaderV1?: {
    origin: string;
    allowInsecureLoopback: boolean;
    read: ReturnType<typeof createCatalogueReader>;
  };
};
if (
  readers.__gridaPublicModelReaderV1?.origin !== origin ||
  readers.__gridaPublicModelReaderV1?.allowInsecureLoopback !==
    allowInsecureLoopback
) {
  readers.__gridaPublicModelReaderV1 = {
    origin,
    allowInsecureLoopback,
    read: createCatalogueReader({
      origin,
      allowInsecureLoopback,
    }),
  };
}
export const readPublicModels = readers.__gridaPublicModelReaderV1.read;
