---
title: Grida CLI authentication
description: Sign in to Grida, inspect your CLI session, choose credential storage, and sign out.
keywords: [grida, cli, authentication, login, credentials]
sidebar_label: Auth
sidebar_position: 2
tags: [cli]
format: md
---

# Grida CLI authentication

Grida login is for account services and Grida Gateway (GG). [BYOK generation](./providers.md)
uses your provider key independently and does not require this login.

## Sign in

```sh
grida auth login
```

Login opens the system browser and saves a separate CLI session. Complete
sign-in on the same machine; Desktop cookies are not used. The command
temporarily listens on a registered loopback port and exits when finished.
Occupied callback ports cause failure before the browser opens.

To open the sign-in URL yourself:

```sh
grida auth login --no-browser
```

This still needs a browser on the same machine. It is not a remote device-code
or headless login. Login requires terminal interaction.

## Inspect your session

```sh
grida auth status --json
```

Status reads local metadata without contacting the server or displaying
credentials. A saved session is not proof that the server still accepts it.
Use [account view](./account.md) for an online check. Account commands refresh
expired access when possible and otherwise ask you to log in again; they never
start login automatically.

## Choose credential storage

New profiles use the OS keyring. File storage is an explicit alternative:

```sh
grida auth login --storage file
grida auth storage show
grida auth storage migrate keyring
```

`auth storage migrate file` switches an existing profile to file storage.
An unavailable keyring never silently selects a file. Account custody currently
supports macOS and Linux and is separate from the [BYOK TOML file](./providers.md).
Account profile files live under `~/.grida/auth`, or `$GRIDA_HOME/auth` when an
absolute `GRIDA_HOME` is supplied. An empty or relative auth home override is
an error. Use the storage commands to change the backend; editing profile files
manually does not revoke a session or safely migrate its credentials.

## Sign out

```sh
grida auth logout
```

Logout removes this CLI's credentials and requests remote session revocation.
Local removal still happens offline; unconfirmed revocation is reported with
exit code `1`. When online, logout renews expired credentials if needed to revoke
that session, without saving them again. Already signed out locally is a successful no-op. Logout leaves
provider API keys intact.
