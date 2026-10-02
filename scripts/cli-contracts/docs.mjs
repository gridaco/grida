// Inspect the installed native candidate against current documentation contracts.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  buildHostFixture,
  prepareHostFixture,
} from "../cli-release/native-fixture.mjs";
import { CliDocs } from "../cli-docs/check.mjs";
const { values } = parseArgs({
  options: { binary: { type: "string" }, candidate: { type: "string" } },
});
const owned = await mkdtemp(path.join(tmpdir(), "grida-native-docs-"));
try {
  const candidate = values.candidate ?? path.join(owned, "candidate");
  if (!values.candidate) {
    if (values.binary) await prepareHostFixture(values.binary, candidate);
    else await buildHostFixture(candidate);
  }
  console.log(
    JSON.stringify(await CliDocs.run({ nativeCandidate: candidate }))
  );
} finally {
  await rm(owned, { recursive: true, force: true });
}
