> fonts for testing & embedded in the distribution

## What's included?

Fonts from Google Fonts and other sources. For variable fonts, only the VF file is kept (static deleted); Pretendard includes both.

## Font Directory

| family              | variable | static | test       | description                                                                  | url                                                     |
| ------------------- | -------- | ------ | ---------- | ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| Adobe Blank         | No       | 1      |            | Special-purpose font for testing, forces CSS "no fallback"                   | https://github.com/adobe-fonts/adobe-blank              |
| Adobe NotDef        | No       | 1      |            | Special-purpose font for testing, renders ".notdef" glyph for all characters | https://github.com/adobe-fonts/adobe-notdef             |
| Allerta             | No       | 1      |            | Its the smallest one available. (16kb)                                       | https://fonts.google.com/specimen/Allerta               |
| AR One Sans         | Yes      | -      |            | Modern Arabic variable font with excellent readability                       | https://fonts.google.com/specimen/AR+One+Sans           |
| Bungee              | No       | 1      |            | Bold display font with strong geometric characteristics                      | https://fonts.google.com/specimen/Bungee                |
| Bytesized           | No       | 1      |            | Monospace font designed for code and technical content                       | https://fonts.google.com/specimen/Bytesized             |
| Caveat              | Yes      | -      |            | Handwriting-style variable font with natural flow                            | https://fonts.google.com/specimen/Caveat                |
| Geo                 | No       | 2      |            | Geometric sans-serif with Regular and Italic variants                        | https://fonts.google.com/specimen/Geo                   |
| Geist               | Yes      | -      |            | Modern system font designed for UI and web applications                      | https://fonts.google.com/specimen/Geist                 |
| Inter               | Yes      | -      |            | Modern sans-serif designed for computer screens                              | https://fonts.google.com/specimen/Inter                 |
| Molle               | No       | 1      |            | Italic-only font family, rare example of single italic variant               | https://fonts.google.com/specimen/Molle                 |
| Noto Sans           | Yes      | -      |            | Universal sans-serif font supporting Latin, Greek, and Cyrillic              | https://fonts.google.com/specimen/Noto+Sans             |
| Noto Sans JP        | Yes      | -      |            | Japanese variant of Noto Sans with full Japanese character support           | https://fonts.google.com/specimen/Noto+Sans+JP          |
| Noto Sans KR        | Yes      | -      |            | Korean variant of Noto Sans with full Korean character support               | https://fonts.google.com/specimen/Noto+Sans+KR          |
| Noto Sans SC        | Yes      | -      |            | Simplified Chinese variant of Noto Sans with full Chinese character support  | https://fonts.google.com/specimen/Noto+Sans+SC          |
| Noto Sans TC        | Yes      | -      |            | Traditional Chinese variant of Noto Sans with full Chinese character support | https://fonts.google.com/specimen/Noto+Sans+TC          |
| Noto Sans Hebrew    | Yes      | -      |            | Hebrew variant of Noto Sans with full Hebrew character support               | https://fonts.google.com/specimen/Noto+Sans+Hebrew      |
| Noto Sans HK        | Yes      | -      |            | Hong Kong variant of Noto Sans with Traditional Chinese character support    | https://fonts.google.com/specimen/Noto+Sans+HK          |
| Noto Sans Arabic    | Yes      | -      |            | Arabic variant of Noto Sans with full Arabic character support               | https://fonts.google.com/specimen/Noto+Sans+Arabic      |
| Noto Color Emoji    | No       | 1      |            | Color emoji font with comprehensive Unicode emoji support                    | https://fonts.google.com/noto/specimen/Noto+Color+Emoji |
| Noto Serif          | Yes      | -      |            | Universal serif font supporting Latin, Greek, and Cyrillic                   | https://fonts.google.com/specimen/Noto+Serif            |
| PT Serif            | No       | 4      |            | Serif font family with Regular, Bold, Italic, and BoldItalic                 | https://fonts.google.com/specimen/PT+Serif              |
| Pretendard          | No       | 9      |            | Korean sans-serif (static). See [Pretendard](#pretendard) below.             | https://github.com/orioncactus/pretendard               |
| Pretendard Variable | Yes      | -      |            | Korean sans-serif (variable). See [Pretendard](#pretendard) below.           | https://github.com/orioncactus/pretendard               |
| Recursive           | Yes      | -      | fvar, GSUB | Highly customizable variable font with multiple axes                         | https://fonts.google.com/specimen/Recursive             |
| Roboto Flex         | Yes      | -      | fvar       | Flexible variable font with extensive customization options                  | https://fonts.google.com/specimen/Roboto+Flex           |
| Unifont             | No       | 1      |            | Bitmap font covering entire Basic Multilingual Plane (BMP)                   | https://unifoundry.com/unifont/                         |
| VT323               | No       | 1      |            | Monospace font with retro terminal/console appearance                        | https://fonts.google.com/specimen/VT323                 |

## Notable fixtures

### Pretendard

Non-Google font actively used in Korea. Includes both static (family: "Pretendard") and variable ("Pretendard Variable"). **They do not alias** — designs may reference either; both must be supplied if used together. Good fixture for fragmented font distribution where one project ships two distinct family names.

## Build Configurations

| Build Type | Fonts            | Description                                         |
| ---------- | ---------------- | --------------------------------------------------- |
| Minimal    | Allerta          | Smallest font for basic testing (16kb)              |
| Geist      | Geist, GeistMono | Standard fonts for UI and web applications          |
| Inter      | Inter            | Modern sans-serif designed for computer screens     |
| Technical  | Unifont          | Bitmap font for Unicode testing and debugging (5mb) |

## Helpful Links

### Font Testing & Development Tools

- [FontForge](https://fontforge.org/) - Open source font editor for visually testing and editing fonts
- [FontDrop](https://fontdrop.info/) - Online font inspector and validator
- [Font Squirrel Webfont Generator](https://www.fontsquirrel.com/tools/webfont-generator) - Convert fonts to web formats
- [Google Fonts](https://fonts.google.com/) - Source for most fonts in this collection

### Font Analysis Tools

- [FontTools](https://fonttools.readthedocs.io/) - Python library for manipulating font files
- [TTX](https://fonttools.readthedocs.io/en/latest/ttx.html) - Font file format converter and inspector
- [Font Bakery](https://fontbakery.readthedocs.io/) - Font quality assurance tool
- [axis-praxis](https://www.axis-praxis.org/samsa/) - Varialbe font inspector

## Internal

**Used in Rust tests and examples**

The following fonts are embedded with `include_bytes!` and used only for testing and example binaries:

- Caveat
- Bungee
- Recursive
- VT323
- Roboto Flex
- Unifont

## See also

- [Grida Fonts](https://fonts.grida.co/)
- [Grida Fonts Repo](https://github.com/gridaco/fonts)
- [Italic Fonts](../../docs/reference/italic-fonts.md)
- [AppleColorEmoji (subset for testing)](../apple-emoji-linux)
