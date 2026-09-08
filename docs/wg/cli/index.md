---
title: Grida CLI — doctrine
description: A local command interface for Grida, with independent product capabilities and a shared contract for people, scripts, and future MCP clients.
keywords: [grida, cli, local-first, command-line, mcp, architecture]
sidebar_label: Doctrine
sidebar_position: 1
tags: [internal, wg, cli, architecture]
format: md
---

# Grida CLI

> **Status: proposed doctrine, awaiting ratification.** Examples describe the
> replacement CLI; they are not available in the legacy npm release.
> See the [v1 spec](./v1.md) for the immediate scope.

Sign in, inspect your account, use a Grida tool, and keep the result in your
own workflow. Type the commands yourself, put them in a script, or give them
to your preferred agent harness. The command means the same thing in each case.

## Start with Desktop's account and AI capabilities

The immediate work exposes the account services and AI tools used by Grida
Desktop as ordinary CLI operations:

```sh
grida auth login
grida account credits --org studio
grida models list --modality image
grida generate --provider gg --model openai/gpt-image-2 \
  --org studio --input @image.json --out ./images
```

Desktop and CLI are clients of the same capability owners. Exporting a feature
means exposing its operation, inputs, permissions, and results through another
interface. It does not require Desktop to be running or automate its UI.

Auth and account access, model discovery, provider credentials, and media
generation are the [immediate scope](./v1.md). The [AI tools design](./media.md)
defines GG/BYOK availability and schema-driven invocation. Agent and render
commands, Canvas integration, subscription billing, and MCP are deferred.
Account work starts with login, organization membership and the credit check
needed before generation.

The [credential custody study](./credential-custody.md) defines Grida account
storage and refresh coordination. Its accepted
[provider credential design](./credential-custody.md#provider-credentials)
uses a shared, private TOML file for Desktop and CLI BYOK, with explicit
configuration/removal and one-time legacy Desktop migration in the preview.

## One name, independent products

`grida` is the branded entry point. Its command tree organizes what you can
do; it does not determine where a product's implementation belongs. Account
services and media tools retain independent owners, reusable by Desktop and
other clients. The CLI translates arguments into their operations and presents
the results.

Use `grida models` and `grida generate` at the root. An `ai` prefix adds no
useful distinction to these operations today. Command depth does not determine
package ownership.

Products can arrive or retire independently. Removing a command removes its
adapter and distribution dependency; its capability owner stays intact. A
public command's removal is still an explicit compatibility change in a release.

| Layer                     | Responsibility                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------- |
| Branded CLI               | Command composition, argument parsing, help, terminal output, and exit behavior.   |
| Shared access foundations | Account sessions, credential storage, organization context, and service transport. |
| Capability owner          | Its operations, domain validation, data contracts, and lifecycle.                  |
| Command adapter           | A small mapping from the command vocabulary to its owner's operations.             |

Adapters depend on capability owners; owners never import the branded CLI.
Other clients can reuse the access foundations and domain data contracts.

Compose built-in commands explicitly. No plugin system or package per verb is
needed. Unrelated commands must not initialize a renderer or agent runtime.

## Local first

Install a local executable and use it with Desktop closed. Desktop may later
offer another installation path; distribution and process lifetime are
separate choices.

Local tools use local inputs. Hosted operations make explicit service requests.
Account reads and hosted AI generation need a connection. Installed help works
offline; `docs` prints links to the canonical documentation home, which requires
a connection to read. Unavailable services produce honest errors.

Introduce a persistent service only for operations needing shared or
long-lived state. `grida account view` must not start an agent, launch Desktop,
or leave a background server behind.

## Ordinary commands, ordinary data

Each command names an operation. Human output explains its result; structured
output makes the same result scriptable. Inputs, files, errors, and side
effects are documented contracts.

Your harness learns Grida through help, docs, and skills teaching these
commands. An AI service can be a capability; the CLI itself has no model,
prompt loop, or dependency on Grida's agent runtime.

File operations preserve their format's public contract. Each capability owns
its file semantics; the branded CLI defines no private format or canvas model.

## Deferred: MCP over the same operations

The CLI is the canonical public command contract. Establish it before MCP;
capability owners remain the source of truth for underlying behavior.

MCP may call shared operations or the CLI's structured interface. It preserves
authorization, validation, side effects, and result meaning. It never parses
human terminal output or duplicates product behavior.

The intended outcomes are:

- Your own harness uses `grida` and Grida skills.
- Your own harness connects to a local Grida MCP server.
- A cloud client can eventually use a remotely hosted Grida MCP server.

Local MCP follows the CLI. Remote MCP infrastructure is deferred.

## Deferred: agent, render, and other products

The overall design can accommodate `grida agent` and `grida render figma`.
Neither is part of the immediate work or a dependency of account and AI tools.
Reusing media execution currently housed beside the agent requires independent
capability ownership; it does not bring the agent runtime into the CLI.

If added, Refig and `grida-agent` retain their own implementations and standalone
entry points. Their command details can be designed when those products enter
scope. The same boundary applies to future Library or Canvas capabilities.
