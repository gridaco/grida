// GRIDA-SEC-010 / GRIDA-SEC-014 — synthetic source-owner process adapter.
import { createInterface } from "node:readline";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
const source = (name) =>
  new URL(`../../packages/grida-auth/src/${name}`, import.meta.url);
const [
  { AuthClient },
  { CredentialStore },
  { ProviderCredentialStore },
  { CredentialLock },
  { Keyring },
] = await Promise.all([
  import(source("auth-client.ts")),
  import(source("credential-store.ts")),
  import(source("provider-credential-store.ts")),
  import(source("credential-lock.ts")),
  import(source("keyring.ts")),
]);
const lines = createInterface({ input: process.stdin })[Symbol.asyncIterator]();
const receive = async () => {
  const line = await lines.next();
  if (line.done || line.value.length > 1_048_576) throw Error("driver_failed");
  return JSON.parse(line.value);
};
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\n");
const args = await receive();
if (
  (await readFile(path.join(args.home, ".grida-auth-conformance"), "utf8")) !==
  "synthetic-fixture-only\n"
)
  throw Error("driver_failed");
try {
  let result;
  const operation = args.operation;
  if (operation.startsWith("provider-")) {
    const store = new ProviderCredentialStore({ home: args.home });
    switch (operation) {
      case "provider-set":
        await store.set(args.provider, args.key);
        result = null;
        break;
      case "provider-read":
        result = await store.read(args.provider);
        break;
      case "provider-list":
        result = await store.list();
        break;
      case "provider-remove":
        await store.remove(args.provider);
        result = null;
        break;
      case "provider-migrate":
        await store.migrate({
          async read() {
            emit({ event: "source-read" });
            return args.entries.map(([provider, apiKey]) => ({
              provider,
              apiKey,
            }));
          },
          async retire() {
            emit({ event: "retire" });
            if (!(await receive()).ok) throw Error("synthetic-retire-failure");
          },
        });
        result = null;
        break;
      default:
        throw Error("driver_failed");
    }
  } else if (operation === "lock") {
    await new CredentialLock({
      directory: path.join(args.home, "providers"),
    }).run(async () => {
      emit({ event: "locked" });
      await receive();
    });
    result = null;
  } else {
    const config = args.config;
    if (
      !config.issuer.startsWith("http://127.0.0.1:") ||
      !config.apiOrigin.startsWith("http://127.0.0.1:") ||
      !config.clientId.startsWith("synthetic-")
    )
      throw Error("driver_failed");
    const storage = args.storage ?? "file";
    if (!["file", "keyring"].includes(storage)) throw Error("driver_failed");
    const keyringModule = process.env.GRIDA_AUTH_KEYTAR_MODULE;
    const store = await CredentialStore.open(config, {
      home: args.home,
      storage,
      ...(storage === "keyring" && keyringModule
        ? {
            keyring: new Keyring(async () =>
              createRequire(import.meta.url)(keyringModule)
            ),
          }
        : {}),
    });
    if (operation === "seed" || operation === "snapshot") {
      result = await store.exclusive(async (tx) => {
        if (operation === "seed") {
          if (!args.session.identity.id.startsWith("synthetic-"))
            throw Error("driver_failed");
          await tx.write(args.session);
        }
        return tx.read();
      });
    } else {
      const unsupported = async () => {
        throw Error("unsupported driver capability");
      };
      const client = new AuthClient(config, {
        custody: store,
        now: Date.now,
        pkce: unsupported,
        listen: unsupported,
        openBrowser: unsupported,
        request(request) {
          emit({ event: "request", request });
          return { result: receive(), cancel() {} };
        },
      });
      if (operation === "storage-info") result = await store.info();
      else if (["status", "refresh", "verify", "logout"].includes(operation))
        result = await client[operation]();
      else throw Error("driver_failed");
    }
  }
  emit({ ok: true, result });
} catch (error) {
  emit({
    ok: false,
    code: typeof error?.code === "string" ? error.code : "driver_failed",
  });
}
process.exit(0);
