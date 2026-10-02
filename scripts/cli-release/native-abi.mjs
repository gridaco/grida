import assert from "node:assert/strict";

export function verifyMuslStatic(programHeaders, dynamic) {
  assert(
    /Program Headers:/.test(programHeaders) &&
      /^\s*LOAD\s/m.test(programHeaders),
    "Missing musl ELF program headers"
  );
  assert(
    !/^\s*INTERP\s/m.test(programHeaders),
    "Static musl executable must not request a dynamic interpreter"
  );
  assert(
    /Dynamic section at offset/.test(dynamic) ||
      /There is no dynamic section in this file\./.test(dynamic),
    "Missing musl ELF dynamic-section inspection"
  );
  assert(
    !/\(NEEDED\)/.test(dynamic),
    "Static musl executable must not depend on shared libraries"
  );
  return { linkage: "static", needed: [] };
}

export function verifyGlibcBaseline(versions, dynamic) {
  const names = [...versions.matchAll(/\bGLIBC_([A-Za-z0-9_.]+)\b/g)].map(
    (match) => match[1]
  );
  assert(names.length, "GNU executable has no glibc version requirements");
  for (const name of names) {
    assert(
      /^\d+\.\d+(?:\.\d+)?$/.test(name),
      `Unsupported glibc requirement: ${name}`
    );
    const [major, minor] = name.split(".").map(Number);
    assert(
      major < 2 || (major === 2 && minor <= 28),
      `Executable requires glibc ${name}; maximum is 2.28`
    );
  }
  const libraries = [...dynamic.matchAll(/\(NEEDED\).*\[([^\]]+)\]/g)].map(
    (match) => match[1]
  );
  assert(libraries.includes("libc.so.6"));
  const allowed = new Set([
    "libc.so.6",
    "libm.so.6",
    "libdl.so.2",
    "libpthread.so.0",
    "librt.so.1",
    "libgcc_s.so.1",
    "ld-linux-x86-64.so.2",
    "ld-linux-aarch64.so.1",
  ]);
  for (const library of libraries)
    assert(allowed.has(library), `Unbundled runtime dependency: ${library}`);
  return { glibc_maximum: "2.28", needed: libraries.sort() };
}
