# github.🏄‍♂️



![](./branding/logo.png)

> 🏄‍♂️ Surf your repository like a pro

![github.surf url example](branding/url-example.png)



## Chrome extension

Download our official chrome [here](https://chrome.google.com/webstore/detail/aipkghikndfblkikafmbahbekkhmppia) (It's currently under review)

![surf chrome extension](./docs/gifs/surf-extension-chrome-demo.gif)

[Building and installing chrome extension on your own](./chrome-extension/README.md)



## 🏄‍♂️ `surf` CLI

Like vscode's `code .`, we support our command `surf`

```shell
# === install the cli ===
npm -g install @bridged.xyz/surf
		# or with yarn
		yarn global add @bridged.xyz/surf

# and surf 🏄 !
surf .
```

You can use this as you sub editor, which can be useful when you're exploring your master/main repository when you are at your own branch on your local machine

```sh
# different branch
surf -b <branch-name>
```



Learn more at [surf-cli](https://github.com/bridgedxyz/surf-cli)



## Supported languages / frameworks

[As listed here](./extensions),

- Vue
- JS/TS/JSX/TSX (React, Svelete, and other js based frrameworks)
- Dart & Flutter
- Elm
- Kotlin
- Scala
- Ocaml
- Vetur





## Remote compile / App preview (for ui applications) & CLI Capabilities.

For repositories containing project such like flutter, react and other main ui frameworks we are planning to suport live-compile-preview feature of the application. the main issue with this will be the pricing and performance limitation. since we are going to keep this project free / fast for everyone

The technology behind this is under development in [appbox](https://github.com/bridgedyxz/appbox) and [console](https://github.com/bridgedxyz/console.bridged.xyz). you can see the remote-compile demo on [assistant](https://github.com/bridgedxyz/assistant)




## Contribution

### Join the community

Learn more about contribution at [CONTRIBUTING.md](./CONTRIBUTING.md)



## Disclamer

this project is inspired from [cdr/code-server](https://github.com/cdr/code-server) and [conwnet/github1s](https://github.com/conwnet/github1s). the base code was forked from github1s (MIT License at the point of fork), which we are replacing it with our own implementations and approaches.



## References

- [cdr/code-server](https://github.com/cdr/code-server)
- [microsoft/vscode](https://github.com/microsoft/vscode)
- [conwnet/github1s](https://github.com/conwnet/github1s)
- [bridgedxyz/node-services](https://github.com/bridgedxyz/node-services)
- [bridgedxyz/assistant](https://github.com/bridgedxyz/assistant)
- [bridgedxyz/console.bridged.xyz](https://github.com/bridgedxyz/console.bridged.xyz)
- [bridgedxyz/appbox](https://github.com/bridgedxyz/appbox)

