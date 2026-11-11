import { randomBytes } from "node:crypto";
import path from "node:path";
import { Daemon } from "@grida/daemon/server";
import { runAcpStdio } from "../acp";
import { createAgentDaemon } from "../server";
import { AgentTransport } from "../transport";

const fixtureRoot = process.argv[2];
if (!fixtureRoot || !path.isAbsolute(fixtureRoot)) {
  throw new Error("An absolute fixture directory is required");
}

const stateDir = path.join(fixtureRoot, "state");
const password = randomBytes(32).toString("base64url");
const origin = Daemon.LOCAL_CLIENT_ORIGIN;
const refererPath = Daemon.LOCAL_CLIENT_REFERER_PATH;
const host = createAgentDaemon({
  password,
  user_data_path: stateDir,
  provider_home: stateDir,
  scratch_base: path.join(fixtureRoot, "scratch"),
  http_access: {
    allowed_origins: [origin],
    allowed_referer_paths: [refererPath],
  },
});

async function run() {
  await host.start();
  try {
    const client = new AgentTransport.Client({
      base_url: AgentTransport.baseUrl(host.port),
      password,
      origin,
      referer: origin + refererPath,
    });
    await runAcpStdio({ client }).closed;
  } finally {
    await host.stop();
  }
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
