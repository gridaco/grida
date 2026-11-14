# Agent missions

Practical requests that tell whether the Grida agent harness works end to end:
reading a project, editing files, running commands, planning, refusing what
the permission policy refuses, and carrying context across turns. Each mission
is a realistic task a person would ask for, with fixed inputs and criteria for
judging the result. Generated workspaces and run reports do not belong here.

Missions run headlessly through the native agent CLI. Desktop is a thin client
over the same host, so a mission that passes headlessly is expected to work
there; Desktop only adds presentation.

| Mission                                                          | Exercises                                           | Preset    |
| ---------------------------------------------------------------- | --------------------------------------------------- | --------- |
| [Locate a bug without touching files](missions/01-locate-bug.md) | Read, search, explain; no writes                    | Read only |
| [Fix the failing tests](missions/02-fix-failing-tests.md)        | Run tests, diagnose, edit code, re-run              | Default   |
| [Add a feature with tests](missions/03-add-feature.md)           | Create and edit files, extend tests                 | Default   |
| [Rename across files](missions/04-rename-across-files.md)        | Multi-file edit, verification                       | Default   |
| [Document the module](missions/05-write-readme.md)               | Read code, write a new file                         | Default   |
| [Plan before acting](missions/06-plan-only.md)                   | Plan mode leaves the project unchanged              | Default   |
| [Protected metadata](missions/07-protected-path.md)              | Writes to version-control metadata are refused      | Default   |
| [Network needs approval](missions/08-network.md)                 | A command needing the network is refused, explained | Default   |
| [Context across turns](missions/09-two-turns.md)                 | A later turn uses what an earlier turn established  | Default   |
| [New repository](missions/10-new-repository.md)                  | Start a repository; its metadata is then protected  | Default   |
| [Launch kit from a brief](missions/11-launch-kit.md)             | A long creative turn: brand, social and web assets  | Default   |

Each mission file holds a `json` block with the machine-readable run: the seed
project, the preset, the prompts (one per turn, in one session), and named
checks the runner evaluates in the finished workspace (`tests-pass`,
`unchanged [path]`, `contains path text`, `absent path text`, `exists path`,
`files folder extension minimum`, `script path`, plus words the final answer
must mention, or one of several it may use). `script` runs a Node script the
agent wrote, in the disposable mission copy. A long mission sets
`deadline_minutes`; the default turn deadline is two minutes. The prose criteria are for
a person judging quality; checks only catch outright failure.

## Run

Build the agent, then run every mission or a selection against a model through
a stored provider key:

```sh
cargo build -p grida-agent --locked
node scripts/agent-missions/run.mjs --model openai/gpt-6.1-terra --credential-home ~/.grida
node scripts/agent-missions/run.mjs --model openai/gpt-6.1-terra --credential-home ~/.grida 02 04
```

The runner copies the seed into a fresh temporary workspace, runs each prompt
in one session, runs the checks, and writes a report with the transcript,
final answers, checks and token usage. Paid models are billed to the selected
key; report the model and usage with any result you share.

Each reply may use up to 65536 output tokens (`--max-output-tokens`), the
allowance Desktop gives a catalogued model with a larger limit. A smaller
allowance cuts off long replies, such as a large file written in one call.
`--desktop-profile` runs the Default preset under the exact permission profile
Desktop stages.

## Add a mission

Prefer a request a person would really make, with an outcome that can be
checked from the files the agent leaves behind. Keep seeds tiny and
dependency-free so a check runs anywhere Node runs.
