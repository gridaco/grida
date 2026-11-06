const assert = require("node:assert/strict");

module.exports = async function npmReleaseTag({
  github,
  context,
  packageName,
  version,
  create = false,
}) {
  assert.match(
    packageName,
    /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/
  );
  assert.notEqual(packageName, "grida", "The CLI has its own release workflow");
  assert.match(version, /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/);
  assert.match(context.sha, /^[a-f0-9]{40}$/);
  assert.equal(typeof create, "boolean");

  const tag = `${packageName}@${version}`;
  const ref = `tags/${tag}`;
  const repository = context.repo;
  const read = async () => {
    try {
      return (await github.rest.git.getRef({ ...repository, ref })).data;
    } catch (error) {
      if (error.status === 404) return undefined;
      throw error;
    }
  };
  const confirm = (existing) => {
    assert.equal(existing.ref, `refs/${ref}`, `Unexpected release tag: ${tag}`);
    assert.equal(
      existing.object.type,
      "commit",
      `Refusing annotated release tag: ${tag}`
    );
    assert.equal(
      existing.object.sha,
      context.sha,
      `Release tag ${tag} points to another commit`
    );
  };

  const existing = await read();
  if (!create) {
    assert(!existing, `Release tag already exists: ${tag}`);
    return tag;
  }
  if (existing) {
    confirm(existing);
    return tag;
  }

  try {
    const created = await github.rest.git.createRef({
      ...repository,
      ref: `refs/${ref}`,
      sha: context.sha,
    });
    confirm(created.data);
  } catch (error) {
    if (error.status !== 422) throw error;
    // Another attempt may have created the same tag after our lookup.
    const raced = await read();
    if (!raced) throw error;
    confirm(raced);
  }
  return tag;
};
