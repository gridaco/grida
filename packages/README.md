# Packages

> List of packages & modules listed under this directory.

- [editor-ui](https://github.com/bridgedxyz/reflect-editor-ui)
- [reflect-ui](https://github.com/bridgedxyz/reflect-ui-react)
- [reflect-core](https://github.com/bridgedxyz/reflect-core-ts)
- [uiutils](https://github.com/bridgedxyz/uiutils)
- [nothing](https://github.com/bridgedxyz/nothing)
- [design-server](https://github.com/bridgedxyz/design-server)
- [design-git](https://github.com/bridgedxyz/design-git)
- [design-sdk](https://github.com/bridgedxyz/design-sdk)
- [design-lint](https://github.com/bridgedxyz/lint)
- [boring](https://github.com/bridgedxyz/boring)
- [shortcuts](./pakcages/shortcuts)
- [events](./packages/events)

## Submodule pacakages ([Externals](../externals))

- [editor-ui](https://github.com/bridgedxyz/reflect-editor-ui) - A reflect-ui based ui framework for building editor-like applications
- [reflect-ui](https://github.com/bridgedxyz/reflect-ui-react) - A reflect-ui. The standard & universal design framework / system that Bridged develops and uses.
- [nothing](https://github.com/bridgedxyz/nothing) - Nothing Graphics engine. This backs all graphics & drawing relted work. Learn more at [noting.app](https://nothing.app)
- [design-server](https://github.com/bridgedxyz/design-server) - A realtime editing design server built by Bridged and opened for general usage.

## Why using submodule?

For best modularity of each features and ui components, we are spearating all the functionalities down to related repositories. You may feel some of the modules are redundant / inefficient to have as submodule. Yes, that is true. Such like [editor-ui](https://github.com/bridgedxyz/reflect-editor-ui) can be used as a npm package, but most of the work is happening in this Bridged repo, so we are going to use submodule for a while. After the project gets mature enought, we will detatch submodule and use as a npm package.

## Contributor's notice

When contributing to Bridged, you might end up editing bunch lines of code under submodule packages. This workflow makes PR and branch management harder. We recommand you to contact us and join as our managed collaborator to get github access for direct PRs (not forking).

Other wise, You'll have to fork all the repositories that is present as submodule, which will mix this up a lot. Read [this guideline how to fork multiple submodule packages & make PRs](https://github.com/bridgedxyz/.github/blob/main/contributing/working-with-submodules.md) with them.
