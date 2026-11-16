// GRIDA-SEC-004 / GRIDA-SEC-014 — native file/network denial and inherited IPC.
import fs from "node:fs";
import files from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { once } from "node:events";
import { createRequire } from "node:module";
import { ProviderCredentialStore } from "@grida/auth/providers";
import { afterEach, describe, expect, it } from "vitest";
import { RetainedServiceSandbox } from "./retained-service-sandbox";

const roots: string[] = [];
async function temporary() {
  const root = await files.mkdtemp(
    path.join(
      await files.realpath(process.platform === "win32" ? os.tmpdir() : "/tmp"),
      "grida-retained-boundary-"
    )
  );
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => files.rm(root, { recursive: true, force: true }))
  );
});
function configuration(
  root: string,
  read: string[] = [],
  write: string[] = []
): RetainedServiceSandbox.Configuration {
  return {
    network: {
      allowedDomains: [],
      deniedDomains: [],
      allowLocalBinding: false,
    },
    filesystem: { denyRead: read, denyWrite: write, allowWrite: [root] },
  };
}

describe("retained service native scope", () => {
  it("refuses direct destinations, local listening, nonliteral paths and a root write grant", async () => {
    const base = configuration(await temporary());
    expect(
      () =>
        new RetainedServiceSandbox({
          ...base,
          network: { ...base.network, allowedDomains: ["example.com"] },
        })
    ).toThrow("retained_service_direct_network_forbidden");
    expect(
      () =>
        new RetainedServiceSandbox({
          ...base,
          network: { ...base.network, allowLocalBinding: true },
        })
    ).toThrow("retained_service_direct_network_forbidden");
    expect(() => new RetainedServiceSandbox(configuration("relative"))).toThrow(
      "retained_service_path_not_literal"
    );
    expect(() => new RetainedServiceSandbox(configuration("/tmp/*"))).toThrow(
      "retained_service_path_not_literal"
    );
    expect(RetainedServiceSandbox.isSupportedPlatform("win32")).toBe(false);
    expect(() => new RetainedServiceSandbox(configuration("/"))).toThrow(
      "retained_service_root_write_forbidden"
    );
  });

  it.runIf(process.platform === "darwin")(
    "captures configuration and binds the executable identity before launch",
    async () => {
      const root = await temporary();
      const input = configuration(root);
      const sandbox = new RetainedServiceSandbox(input);
      expect(Object.isFrozen(sandbox.configuration.filesystem.allowWrite)).toBe(
        true
      );
      expect(sandbox.configuration.filesystem.allowWrite).toEqual([root]);
      const binary = path.join(root, "program");
      await files.copyFile(process.execPath, binary);
      await files.chmod(binary, 0o700);
      const plan = sandbox.prepare(binary, ["-e", "void 0"]);
      await files.appendFile(binary, "changed");
      expect(() => plan.recheck()).toThrow(
        "retained_service_executable_changed"
      );
      expect(plan.arguments).toContain(binary);
    }
  );

  it.runIf(RetainedServiceSandbox.isSupportedPlatform())(
    "resolves existing aliases and absent protected descendants, refusing dangling aliases",
    async () => {
      const root = await temporary();
      const target = path.join(root, "real");
      await files.mkdir(target);
      const alias = path.join(root, "alias");
      await files.symlink(target, alias);
      expect(
        RetainedServiceSandbox.aliases(path.join(alias, "absent"))
      ).toEqual([path.join(alias, "absent"), path.join(target, "absent")]);
      const dangling = path.join(root, "dangling");
      await files.symlink(path.join(root, "missing"), dangling);
      expect(() =>
        RetainedServiceSandbox.aliases(path.join(dangling, "child"))
      ).toThrow("retained_service_path_alias_unresolved");
    }
  );

  it.runIf(RetainedServiceSandbox.isSupportedPlatform())(
    "binds existing private authority without copying it and projects exclusions into aliases",
    async () => {
      const root = await temporary();
      const input = {
        state: path.join(root, "settings with spaces"),
        providerHome: path.join(root, "custody"),
        media: path.join(root, "media"),
      };
      const denied = path.join(input.state, "endpoints.json");
      const view = new RetainedServiceSandbox.PrivateNamespace(
        input,
        [root],
        [denied],
        [denied]
      );
      const argv = view.arguments([
        `--user-data=${input.state}`,
        `--provider-home=${input.providerHome}`,
        `--media-root=${input.media}`,
        "--agent=disabled",
      ]);
      expect(argv).toContain("--user-data=/retained-service/state");
      expect(argv).toContain("--provider-home=/retained-service/custody");
      expect(argv).toContain("--media-root=/retained-service/media");
      expect(argv).toContain(`--protected-file-root=${input.state}`);
      expect(argv).toContain(
        `--protected-file-root=${path.join(input.providerHome, "providers")}`
      );
      expect(argv).toContain("--protected-file-root=/retained-service");
      expect(view.project([denied])).toEqual([
        "/retained-service/state/endpoints.json",
      ]);
      expect(view.physical("/retained-service/state/endpoints.json")).toBe(
        denied
      );
      expect(view.mounts()).toContain(input.state);
      await files.writeFile(
        path.join(input.providerHome, "providers/credentials.toml"),
        "retained authority",
        { mode: 0o600 }
      );
      expect(() => view.recheck()).not.toThrow();
      await files.chmod(input.state, 0o755);
      expect(() => view.recheck()).toThrow(
        "retained_service_private_directory_changed"
      );
    }
  );

  it.runIf(RetainedServiceSandbox.isSupportedPlatform())(
    "refuses extra binding authority, changed arguments and unsafe existing permissions without repair",
    async () => {
      const root = await temporary();
      const input = {
        state: path.join(root, "state"),
        providerHome: path.join(root, "custody"),
        media: path.join(root, "media"),
      };
      expect(
        () => new RetainedServiceSandbox.PrivateNamespace(input, [], [], [])
      ).toThrow("retained_service_private_scope_denied");
      expect(fs.existsSync(input.state)).toBe(false);
      const view = new RetainedServiceSandbox.PrivateNamespace(
        input,
        [root],
        [],
        []
      );
      expect(() =>
        view.arguments([
          `--user-data=${input.media}`,
          `--provider-home=${input.providerHome}`,
          `--media-root=${input.media}`,
        ])
      ).toThrow("retained_service_private_argument_mismatch");
      expect(() => view.arguments([`--user-data=${input.state}`])).toThrow(
        "retained_service_private_argument_missing"
      );
      const providers = path.join(input.providerHome, "providers");
      await files.chmod(providers, 0o755);
      expect(
        () => new RetainedServiceSandbox.PrivateNamespace(input, [root], [], [])
      ).toThrow("retained_service_private_directory_invalid");
      expect((await files.stat(providers)).mode & 0o777).toBe(0o755);
      expect(
        () =>
          new RetainedServiceSandbox.PrivateNamespace(
            input,
            [root],
            [input.state],
            []
          )
      ).toThrow("retained_service_private_scope_denied");
    }
  );

  it.runIf(RetainedServiceSandbox.isSupportedPlatform())(
    "keeps mountpoint masks until all owners close and preserves changed or pre-existing files",
    async () => {
      const root = await temporary();
      const target = path.join(root, "absent");
      const a = new RetainedServiceSandbox.MountLease();
      const b = new RetainedServiceSandbox.MountLease();
      a.mountpoint(target);
      b.mountpoint(target);
      a.release();
      expect(fs.existsSync(target)).toBe(true);
      b.release();
      expect(fs.existsSync(target)).toBe(false);
      const nested = path.join(root, "missing", "nested");
      const nestedLease = new RetainedServiceSandbox.MountLease();
      nestedLease.mountpoint(nested);
      nestedLease.release();
      expect(fs.existsSync(path.dirname(nested))).toBe(false);
      const c = new RetainedServiceSandbox.MountLease();
      c.mountpoint(target);
      await files.writeFile(target, "new owner");
      c.release();
      expect(await files.readFile(target, "utf8")).toBe("new owner");
      const d = new RetainedServiceSandbox.MountLease();
      d.mountpoint(target);
      d.release();
      expect(await files.readFile(target, "utf8")).toBe("new owner");
    }
  );

  it.each(["x64", "arm64"] as const)(
    "denies sockets and inspection on the native %s syscall ABI",
    (arch) => {
      const program = RetainedServiceSandbox.seccomp(arch);
      const evaluate = (architecture: number, syscall: number) => {
        let accumulator = 0;
        for (let pc = 0; pc < program.length / 8; ) {
          const offset = pc * 8,
            code = program.readUInt16LE(offset),
            yes = program[offset + 2]!,
            no = program[offset + 3]!,
            value = program.readUInt32LE(offset + 4);
          if (code === 0x20) {
            accumulator = value === 4 ? architecture : syscall;
            pc++;
          } else if (code === 0x15)
            pc += 1 + (accumulator === value ? yes : no);
          else if (code === 0x35) pc += 1 + (accumulator >= value ? yes : no);
          else if (code === 0x06) return value;
          else throw new Error("invalid BPF");
        }
        throw new Error("missing verdict");
      };
      const audit = arch === "x64" ? 0xc000003e : 0xc00000b7;
      for (const syscall of arch === "x64"
        ? [41, 53, 101, 310, 438, 425, 272, 308]
        : [198, 199, 117, 270, 438, 425, 97, 268])
        expect(evaluate(audit, syscall)).toBe(0x00050001);
      expect(evaluate(audit, 435)).toBe(0x00050026);
      expect(evaluate(audit, arch === "x64" ? 0 : 63)).toBe(0x7fff0000);
      expect(evaluate(0, 0)).toBe(0x80000000);
      expect(evaluate(audit, arch === "x64" ? 0x40000000 : 63)).toBe(
        arch === "x64" ? 0x80000000 : 0x7fff0000
      );
    }
  );
});

const native =
  process.env.GRIDA_TEST_NATIVE_RETAINED === "1" &&
  RetainedServiceSandbox.isSupportedPlatform();
it.runIf(native)(
  "allows ordinary files and a Main-transferred socket while denying secret/native state and new networking",
  async () => {
    const root = await temporary();
    const workspace = path.join(root, "workspace"),
      secret = path.join(root, "secret"),
      state = path.join(root, "native-state");
    await Promise.all(
      [workspace, secret, state].map((p) => files.mkdir(p, { mode: 0o700 }))
    );
    await files.writeFile(path.join(workspace, "input"), "workspace");
    await files.writeFile(path.join(secret, "key"), "secret");
    const nested = path.join(secret, "nested");
    await files.mkdir(nested);
    await files.writeFile(path.join(state, "history"), "retained");
    const readonly = path.join(root, "readonly");
    await files.mkdir(path.join(readonly, "hidden"), { recursive: true });
    await files.writeFile(path.join(readonly, "public"), "visible");
    await files.writeFile(path.join(readonly, "hidden", "key"), "protected");
    const sandbox = new RetainedServiceSandbox(
      configuration(
        root,
        [secret, nested, path.join(readonly, "hidden")],
        [secret, state, readonly]
      )
    );
    const code = `
    const fs=require('node:fs'),net=require('node:net'),path=require('node:path'),assert=require('node:assert/strict');
    const root=process.argv[1], workspace=path.join(root,'workspace'),secret=path.join(root,'secret/key'),state=path.join(root,'native-state/history');
    const denied=(f)=>{try{f();return false}catch(e){return ['EPERM','EACCES','EROFS','ENOENT'].includes(e.code)}};
    assert.equal(fs.readFileSync(path.join(workspace,'input'),'utf8'),'workspace');
    fs.writeFileSync(path.join(workspace,'output'),'saved');
    assert.ok(denied(()=>fs.readFileSync(secret)));
    assert.ok(denied(()=>fs.writeFileSync(state,'changed')));
    assert.equal(fs.readFileSync(path.join(root,'readonly/public'),'utf8'),'visible');
    assert.ok(denied(()=>fs.readFileSync(path.join(root,'readonly/hidden/key'))));
    assert.ok(denied(()=>fs.writeFileSync(path.join(root,'readonly/public'),'changed')));
    if(process.platform==='darwin'){
      assert.equal(fs.realpathSync(path.join(root,'secret')),path.join(root,'secret'));
      assert.equal(fs.realpathSync(path.join(root,'secret/nested')),path.join(root,'secret/nested'));
      assert.ok(denied(()=>fs.readdirSync(path.join(root,'secret'))));
      assert.ok(denied(()=>fs.statSync(secret)));
    }
    const blocked=(operation)=>new Promise((resolve,reject)=>{const value=operation();value.once('error',e=>['EPERM','EACCES'].includes(e.code)?resolve():reject(e));value.once('listening',()=>reject(Error('listening admitted')));value.once('connect',()=>reject(Error('connect admitted')));});
    Promise.resolve().then(async()=>{
      const {WorkspaceRegistry}=require(process.argv[2]);
      const registry=new WorkspaceRegistry(path.join(root,'catalog'),path.join(root,'fresh-projects'),[path.join(root,'secret'),path.join(root,'secret/nested')]);
      const workspace=await registry.ensureDefault();
      assert.ok(workspace?.is_default,'fresh managed workspace must be available under confinement');
      await assert.rejects(registry.open(path.join(root,'secret')));
      await Promise.all([blocked(()=>net.createServer().listen(0,'127.0.0.1')),blocked(()=>net.connect({host:'127.0.0.1',port:9})),blocked(()=>net.connect({path:path.join(root,'forbidden.sock')}))]);
    }).then(()=>{
      process.send({ready:true});
      process.on('message',(_,socket)=>{socket.once('data',data=>{assert.equal(data.toString(),'request');socket.end('response',()=>process.disconnect());});socket.resume();});
    }).catch(e=>{console.error(e.code||e.message);process.exit(1)});
  `;
    const plan = sandbox.prepare(process.execPath, [
      "-e",
      code,
      root,
      createRequire(import.meta.url).resolve("@grida/daemon/server"),
    ]);
    const forbidden = net.createServer((socket) => socket.destroy());
    forbidden.listen(path.join(root, "forbidden.sock"));
    await once(forbidden, "listening");
    const child = RetainedServiceSandbox.start(plan, {
      PATH: "/usr/bin:/bin",
      HOME: root,
      TMPDIR: root,
      ELECTRON_RUN_AS_NODE: "1",
    });
    let stderr = "";
    child.stderr!.on("data", (data) => {
      stderr += data;
    });
    const closed = once(child, "close");
    const server = net.createServer({ pauseOnConnect: true }, (socket) => {
      socket.pause();
      child.send!({ connected: true }, socket);
    });
    try {
      const bounded = async <T>(
        promise: Promise<T>,
        phase: string
      ): Promise<T> => {
        let timer: NodeJS.Timeout | undefined;
        try {
          return await Promise.race([
            promise,
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () =>
                  reject(
                    new Error(`native ${phase} did not settle: ${stderr}`)
                  ),
                3000
              );
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      };
      const [ready] = await bounded(
        Promise.race([
          once(child, "message"),
          closed.then(([code]) => {
            throw new Error(`native launch exited ${code}: ${stderr}`);
          }),
        ]),
        "ready"
      );
      expect(ready).toEqual({ ready: true });
      server.listen(0, "127.0.0.1");
      await bounded(once(server, "listening"), "parent listener");
      const client = net.connect(
        (server.address() as net.AddressInfo).port,
        "127.0.0.1"
      );
      const reply = once(client, "data");
      client.end("request");
      expect((await bounded(reply, "transferred response"))[0].toString()).toBe(
        "response"
      );
      expect((await bounded(closed, "child close"))[0]).toBe(0);
      expect(stderr).toBe("");
      expect(await files.readFile(path.join(workspace, "output"), "utf8")).toBe(
        "saved"
      );
      expect(await files.readFile(path.join(state, "history"), "utf8")).toBe(
        "retained"
      );
    } finally {
      child.kill();
      server.close();
      forbidden.close();
    }
  },
  15000
);

it.runIf(native && process.platform === "linux")(
  "shares an existing provider authority through mapped private ancestors",
  async () => {
    const root = await temporary();
    const input = {
      state: path.join(root, "state"),
      providerHome: path.join(root, "custody"),
      media: path.join(root, "media"),
    };
    await Promise.all(
      Object.values(input).map((directory) =>
        files.mkdir(directory, { mode: 0o700 })
      )
    );
    await files.writeFile(
      path.join(input.state, "endpoints.json"),
      "retained settings",
      { mode: 0o600 }
    );
    const store = new ProviderCredentialStore({ home: input.providerHome });
    await store.set("fixture", "fixture-native-key");
    const lock = await files.stat(
      path.join(input.providerHome, "providers/profile.lock.sqlite")
    );
    const sdk = createRequire(import.meta.url).resolve("@grida/auth/providers");
    const code = `
    const fs=require('node:fs'),assert=require('node:assert/strict'),{ProviderCredentialStore}=require(${JSON.stringify(sdk)});
    const value=name=>process.argv.find(arg=>arg.startsWith('--'+name+'=')).slice(name.length+3);
    const home=value('provider-home'),state=value('user-data'),media=value('media-root');
    assert.equal(home,'/retained-service/custody');assert.equal(state,'/retained-service/state');
    const lock=fs.statSync(home+'/providers/profile.lock.sqlite');assert.equal(lock.dev+':'+lock.ino,${JSON.stringify(`${lock.dev}:${lock.ino}`)});
    assert.equal(fs.readFileSync(state+'/endpoints.json','utf8'),'retained settings');
    fs.writeFileSync(media+'/output','retained media');
    const store=new ProviderCredentialStore({home});
    store.read('fixture').then(key=>{assert.equal(key,'fixture-native-key');return store.remove('fixture')}).then(()=>process.send({removed:true},()=>process.disconnect())).catch(error=>{console.error(error);process.exit(1)});
  `;
    const sandbox = new RetainedServiceSandbox(configuration(root));
    const plan = sandbox.prepare(
      process.execPath,
      [
        "-e",
        code,
        "--",
        `--user-data=${input.state}`,
        `--provider-home=${input.providerHome}`,
        `--media-root=${input.media}`,
      ],
      process,
      input
    );
    const child = RetainedServiceSandbox.start(plan, {
      PATH: "/usr/bin:/bin",
      HOME: root,
      ELECTRON_RUN_AS_NODE: "1",
    });
    let stderr = "";
    child.stderr!.on("data", (bytes) => {
      stderr += bytes;
    });
    const closed = once(child, "close");
    const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
    try {
      const [message] = await Promise.race([
        once(child, "message"),
        closed.then(([code]) => {
          throw new Error(`native custody exited ${code}: ${stderr}`);
        }),
      ]);
      expect(message).toEqual({ removed: true });
      expect((await closed)[0]).toBe(0);
      expect(await store.read("fixture")).toBeNull();
      expect(
        await files.readFile(path.join(input.media, "output"), "utf8")
      ).toBe("retained media");
      expect(
        await files.readFile(path.join(input.state, "endpoints.json"), "utf8")
      ).toBe("retained settings");
    } finally {
      clearTimeout(timer);
      child.kill();
    }
  },
  15000
);
