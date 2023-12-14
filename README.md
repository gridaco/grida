<div style="text-align:center"><img src="./branding/github-cover.png"/></div>

# Opensource Design Tool for the world.

_For whom eager to create, design, develop and share with the world._

> **Grida (Previously known as _Bridged 2022_ - opensource collaborative realtime ui editor)**
>
> an opensource wasm application explicitly designed for service application design/development

- developer first
- plugin sdk and core engine api is mapped 1:1
- right on to production code

## `Alpha` - This project is under development and Unstable

This project, `Grida` is under development with preview technologies. We are looking forward that Grida will change the industry design/development standard by this piece of OSS Project. For updates, please subscribe our news letter on [grida.co](https://grida.co)

**Stable Ecosystem Projects**

- [Grida Assistant](https://github.com/gridaco/assistant) - A plugin fro figma that allows to import designs to Grida.
- [Grida Code](https://github.com/gridaco/code) - Design to Code Engine. A design ✌️ code standard.

## Engine & Foundation

- studio is built uppon skia graphics library
- the core component used is followed by _[reflect design system](https://refkect-ui,com)_
- studio's surface is built on react

## Docs

Read the Grida usage docs [here](./docs)

## Workspace

artboard workspace

## Scriptable

scripting built in with js/ts sdk and add-on plugin

## Backend

[Live Collaborative Design Server](https://github.com/gridaco/design-server)

## Structure - Packages & Modules

![](./branding/project-maps.png)

**GRAPHICS ENGINE**

- **nothing** - nothing but drawing. everything drawable graphics engine.
  - [github](https://github.com/gridaco/nothing)
  - [website](https://nothing.app/)
  - **@nothing.app/react** - React SDK - Fully built, all-in-one graphics tools for drawing, editing and sharing

**UI LIBRARY**

- **reflect-ui**
  - **reflect-editor-ui** - Editor UI Framework for React - used by enterprise level applications - such as Bridged, Nothing, Design to code, Code.surf
    - [gitHub](https://github.com/reflect-ui/reflect-editor-ui)
  - **reflect-ui-react** - 🌊 reflect components for react
    - [github](github.com/reflect-ui/reflect-ui-react)
  - [github](https://github.com/reflect-ui)
  - [website](https://reflect-ui.com)

**DESIGN DATA STRUCTURE & HANDLING**

- **reflect-core-ts** - reflect core definitions on typescript (nodejs)
  - [github](https://github.com/reflect-ui/reflect-core)
- **design-sdk** - 🎨 A mid wrapper for building consistant figma & sketch & studio plugin, with single api reference
  - [github](github.com/gridaco/design-sdk)
- **design-file-converter** - ➡️🎨➡️🎨 Convert your design from sketch figma xd Grida - to - sketch figma xd Grida.
  - [github](https://github.com/gridaco/design-file-converter)
  - [website](https://grida.co/convert-design)
- **.grida** - .bridged configuration specs for Grida App and Code extensions
  - [github](https://github.com/gridaco/.grida)

**BACKEND - LIVE COLLABORATION / DATA MANAGEMENT**

- **design-server** - Structure & SDK for building realtime collaboration backend service
  - [github](https://github.com/gridaco/design-server)
- **BASE - bridged-app-services** - BASE: Bridged App SErvices
  - [github](https://github.com/bridgedxyz/base)
  - [website](https://bridged.cc)
  - **base-sdk-ts** - Bridged App SErvices SDK for nodejs / browser
    - [github](https://github.com/bridgedxyz/base-sdk-ts)

**WYSIWYG**

- **boring** - 😶 A very boring text editor engine like notion. yet free and open to use
  - [github](https://github.com/gridaco/boring)
  - [website](https://boring.so/)

**DESIGN TO CODE**

- **design-to-code** - Design to code engine. A design ✌️ code standard.
  - [github](https://github.com/gridaco/design-to-code/)
  - [website](https://designto.codes/)

**BUILT-IN SERVICES**

- **accounts.bridged.xyz** - (PRIVATE) accounts & payments web / server
  - [website](https://accounts.bridged.xyz) (source is closed due to security reasons)
- **console.bridged.xyz** - Bridged console for managing your designs, asset, translations with collaboration.
  - [github](https://github.com/bridgedxyz/console.bridged.xyz)
  - [website](https://console.bridged.xyz)

## The design

design of Grida editor on [figma](https://www.figma.com/file/Y0Gh77AqBoHH7dG1GtK3xF/?node-id=0%3A1)

## Bridging the gap between design and development

Here are some concepts that do not exist on current design tools, but only at implementation.

- Theme support
- Responsive layout
- Linting
- Grid
- List
- Slots (Not swapping components)
- States
- Git
- Variables
- Data layer
- Logic layer
- Design to code
- Built in base design system (Reflect - a universal design system built for design systems)

## Key features / modes

- presentation mode
- muggle mode
- developer mode
- graphics mode
- designer mode
- product mode
- prototype mode
- documentation mode
- diagram mode (EDR)
- live collaborative editing
- version control in-the-box
- responsive mode (responsive components)
- visual engine in-the-box
- context engine in-the-box

## Contributing

We'de love to have you change the industry together. _Read below documentations before submitting a PR._

- [contributing.md](./CONTRIBUTING.md)
- [working with submodule packages](https://github.com/bridgedxyz/.github/blob/main/contributing/working-with-submodules.md)
- [how Grida repo `/packages` are structured](./packages)

### Building

```sh
git clone --recurse-submodules https://github.com/gridaco/grida.git
cd grida

yarn
yarn desktop # to run as electron desktop app
# .. or ..
yarn web # to run as web app

```

update pulling - `git submodule update --init --recursive`

## References

- **skia 2d graphics library**
  - [npm](https://www.npmjs.com/package/canvaskit-wasm)
  - [github](https://github.com/google/skia/tree/master/modules/canvaskit)
  - [website](https://skia.org/user/modules/canvaskit)
