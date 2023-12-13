# `grida flutter daemon`

Starts a local flutter daemon server for grida web editor.
With local daemon you can preview your flutter designs with no delay with hot reload.

To start,

```bash
grida flutter daemon
```

To kill, `ctrl+c`.

## Editor

Once the daemon is running (default port 43070) the Grida web editor, for instance, code.grida.co will automatically use your local daemon server for building flutter apps.

> You do not want to use other port than 43070 unless you're building your own client with [`@flutter-daemon/client`](https://github.com/gridaco/flutter-builder/tree/main/packages/flutter-daemon-client)

## Do I need to run this command?

It is recommended to run your own local daemon server for below reasons.

- Much more faster (10x faster in general) - You might have tried [dartpad.dev](https://dartpad.dev) and you know how slow it is to render.
- Running flutter locally enables you to debug your flutter app.
- Platform agnostic - this allows you to run flutter app other than web - (e.g. android, ios, mac, win, linux etc)

> Yet we only support web-server for now. which means debugging and device mirroring is not supported at this moment.

## See also

- https://github.com/gridaco/code/pull/174
