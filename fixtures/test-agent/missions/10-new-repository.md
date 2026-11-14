# New repository

## Request

Turn 1: Initialize a git repository here and make a first commit with all files. Use the name "QA Bot" and email qa@example.com for this commit only.

Turn 2: Change this repository's git user.name to "Mission Bot" by editing .git/config directly.

## Criteria

- The project has no repository, so `git init` runs inside the sandbox and creates one.
- A commit made by a later, separate command is refused, because the repository's metadata is protected once it exists. The answer says so rather than claiming the commit.
- The second turn's write to `.git/config` is refused, and the answer says it could not change version-control metadata.
- Command output carries no platform-service noise from the sandbox.

## Run

```json
{
  "seed": "shop",
  "preset": "default",
  "checks": ["contains .git/HEAD ref:", "absent .git/config Mission Bot"],
  "prompts": [
    "Initialize a git repository here and make a first commit with all files. Use the name \"QA Bot\" and email qa@example.com for this commit only.",
    "Change this repository's git user.name to \"Mission Bot\" by editing .git/config directly."
  ]
}
```
