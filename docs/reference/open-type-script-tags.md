# OpenType Script Tags

OpenType script tags are standardized four-letter identifiers used within the OpenType font specification to represent writing systems (scripts) such as Latin, Cyrillic, Han, Arabic, and others. These tags are embedded in font tables—specifically GSUB (Glyph Substitution) and GPOS (Glyph Positioning)—to enable advanced text layout and shaping according to the typographic and linguistic rules of each script. Script tags allow layout engines to apply the correct features and substitutions for each script encountered in text.

## Reference Sources

- [Microsoft OpenType Layout Tag Registry: Script Tags](https://learn.microsoft.com/en-us/typography/opentype/spec/scripttags)

## Common Script Tags

| Tag    | Script Name       | Primary Languages / Regions            |
| ------ | ----------------- | -------------------------------------- |
| `latn` | Latin             | English, French, German, Spanish, etc. |
| `cyrl` | Cyrillic          | Russian, Bulgarian, Serbian, etc.      |
| `grek` | Greek             | Greek                                  |
| `arab` | Arabic            | Arabic, Persian, Urdu, etc.            |
| `hebr` | Hebrew            | Hebrew                                 |
| `deva` | Devanagari        | Hindi, Marathi, Nepali, Sanskrit, etc. |
| `hang` | Hangul            | Korean                                 |
| `hani` | Han (Ideographic) | Chinese, Japanese, Korean (CJK)        |
| `kana` | Katakana          | Japanese                               |
| `hira` | Hiragana          | Japanese                               |
| `thai` | Thai              | Thai                                   |
| `taml` | Tamil             | Tamil                                  |
| `ethi` | Ethiopic          | Amharic, Tigrinya, etc.                |
| `beng` | Bengali           | Bengali, Assamese                      |
| `guru` | Gurmukhi          | Punjabi                                |

## Usage in OpenType

Script tags are integral to the GSUB (Glyph Substitution) and GPOS (Glyph Positioning) tables in OpenType fonts. Within these tables, a ScriptList maps each script tag to a set of language systems and associated layout features. When rendering text, shaping engines analyze the Unicode codepoints and map them to the appropriate script tag. This mapping ensures that the correct substitutions and positioning rules are applied for the script in use, enabling proper display of complex scripts and ligatures.

## Notes

- OpenType script tags are generally aligned with [ISO 15924](https://unicode.org/iso15924/) script codes, but there are exceptions and some differences in naming or tag assignment. For example, `hani` is used for Han ideographs (Chinese characters), which covers multiple languages.
- Some scripts have multiple tags for historical or compatibility reasons.

## Full List

For the complete registry, see Microsoft's official documentation.

# Common Script Tags

| Tag  | Script Name | Local Name | Example Text | Primary Languages / Regions                                                                                                                       |
| ---- | ----------- | ---------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Latn | Latin       | Latin      | ABC xyz      | English, French, Spanish, German, Vietnamese, Swahili, Turkish, Polish, Italian, and many others worldwide (most widely used script)              |
| Cyrl | Cyrillic    | Кириллица  | Привет       | Russian, Ukrainian, Bulgarian, Serbian, Belarusian, Kazakh, Kyrgyz, Tajik, Mongolian (Cyrillic), used across Eastern Europe, Central Asia         |
| Grek | Greek       | Ελληνικά   | Αθήνα        | Greek (Greece, Cyprus), minority communities                                                                                                      |
| Arab | Arabic      | العربية    | سلام         | Arabic (Middle East, North Africa), Persian (Iran), Urdu (Pakistan), Pashto, Kurdish, Uighur, Sindhi, and others across the Arab world and beyond |
| Hebr | Hebrew      | עברית      | שלום         | Hebrew (Israel), liturgical use in Jewish communities worldwide                                                                                   |
| Deva | Devanagari  | देवनागरी   | नमस्ते       | Hindi, Marathi, Nepali, Sanskrit, Konkani, Maithili, Dogri, and others in India and Nepal                                                         |
| Hang | Hangul      | 한글       | 안녕하세요   | Korean (South Korea, North Korea, Korean diaspora)                                                                                                |
| Hani | Han         | 漢字       | 漢字         | Chinese (Mainland China, Taiwan, Hong Kong, Singapore), Japanese (as Kanji), Korean (as Hanja, historical)                                        |
| Kana | Katakana    | カタカナ   | カタカナ     | Japanese (loanwords, foreign names, emphasis, technical/scientific terms)                                                                         |
| Hira | Hiragana    | ひらがな   | こんにちは   | Japanese (native words, grammatical elements)                                                                                                     |
| Thai | Thai        | ไทย        | สวัสดี       | Thai (Thailand), minority languages in Thailand                                                                                                   |
| Taml | Tamil       | தமிழ்      | தமிழ்        | Tamil (India, Sri Lanka, Singapore, Malaysia, diaspora)                                                                                           |
| Ethi | Ethiopic    | ግዕዝ        | ሰላም          | Amharic, Tigrinya, Tigre, Ge'ez, and other languages in Ethiopia and Eritrea                                                                      |
| Beng | Bengali     | বাংলা      | বাংলা        | Bengali (Bangladesh, India), Assamese (India, as variant), Bishnupriya Manipuri, others in Bengal region                                          |
| Guru | Gurmukhi    | ਗੁਰਮੁਖੀ    | ਪੰਜਾਬੀ       | Punjabi (India, especially Punjab state), diaspora communities                                                                                    |

## Demographic Data

_Last updated: January 2025_

The following demographic data represents native speakers and total users of each script system, compiled from authoritative sources including Ethnologue (2025), UNESCO, and national census data.

### Script Usage by Population

| Script Tag | Script Name   | Native Speakers (Millions) | Total Users (Millions) | Primary Countries/Regions                  | Last Updated |
| ---------- | ------------- | -------------------------- | ---------------------- | ------------------------------------------ | ------------ |
| `latn`     | Latin         | ~1,200                     | ~2,500                 | Global (Europe, Americas, Africa, Oceania) | 2025         |
| `hani`     | Han (Chinese) | ~1,100                     | ~1,400                 | China, Taiwan, Hong Kong, Singapore        | 2025         |
| `deva`     | Devanagari    | ~600                       | ~800                   | India, Nepal                               | 2025         |
| `arab`     | Arabic        | ~310                       | ~420                   | Middle East, North Africa                  | 2025         |
| `cyrl`     | Cyrillic      | ~250                       | ~300                   | Russia, Eastern Europe, Central Asia       | 2025         |
| `hang`     | Hangul        | ~77                        | ~85                    | South Korea, North Korea                   | 2025         |
| `beng`     | Bengali       | ~230                       | ~280                   | Bangladesh, India                          | 2025         |
| `thai`     | Thai          | ~60                        | ~70                    | Thailand                                   | 2025         |
| `taml`     | Tamil         | ~75                        | ~85                    | India, Sri Lanka, Singapore                | 2025         |
| `guru`     | Gurmukhi      | ~120                       | ~140                   | India, Pakistan                            | 2025         |
| `hebr`     | Hebrew        | ~9                         | ~15                    | Israel, Jewish communities                 | 2025         |
| `grek`     | Greek         | ~13                        | ~15                    | Greece, Cyprus                             | 2025         |
| `ethi`     | Ethiopic      | ~25                        | ~30                    | Ethiopia, Eritrea                          | 2025         |
| `kana`     | Katakana      | ~125                       | ~125                   | Japan                                      | 2025         |
| `hira`     | Hiragana      | ~125                       | ~125                   | Japan                                      | 2025         |

### Key Demographic Notes

- **Latin Script**: The most widely used script globally, serving as the primary writing system for over 100 languages including English, Spanish, French, German, Portuguese, Italian, and many others. Used by approximately 70% of the world's population.

- **Han Script (Chinese Characters)**: Primarily used for Chinese languages (Mandarin, Cantonese, etc.) but also historically used in Japanese (Kanji) and Korean (Hanja). The most populous single script system.

- **Devanagari**: The primary script for Hindi and many other Indian languages, used by over 600 million native speakers in South Asia.

- **Arabic Script**: Used for Arabic and many other languages across the Middle East, North Africa, and parts of Asia. Includes significant variations for Persian, Urdu, and other languages.

- **Cyrillic Script**: Used for Russian and many other Slavic and non-Slavic languages across Eastern Europe and Central Asia.

- **Hangul**: The native Korean script, one of the most recently created major writing systems (1443 CE), known for its scientific design.

### Data Sources

- **Ethnologue (2025)**: Primary source for language population data
- **UNESCO Institute for Statistics**: Educational and literacy data
- **National Census Data**: Country-specific population statistics
- **World Bank**: Economic and demographic indicators
- **International Organization for Standardization (ISO)**: Script and language codes

_Note: Population figures are estimates and may vary due to different counting methodologies, language definitions, and the dynamic nature of language use. Some scripts serve multiple languages, and individual language statistics may not directly correlate with script usage statistics._

## Officially Supported by Grida

| Script              | Support Level | Default Font | Tags                    | Note                                                          |
| ------------------- | ------------- | ------------ | ----------------------- | ------------------------------------------------------------- |
| Universal-Inter     | `prod`        | Inter        | `latn`, `cyrl`, `greek` | Default global script, supported universally.                 |
| Universal-Latin     | `prod`        | Inter, Geist | `latn`, `cyrl`          | Default global script, supported universally.                 |
| Emoji               | `planned`     | -            | -                       | -                                                             |
| Korean              | `dev`         | Noto Sans KR | `hang`                  | Fully supported with fallback to Noto Sans KR.                |
| Japanese (Kanji)    | `dev`         | Noto Sans JP | `hani`                  | Officially supported universal core (Han ideographs).         |
| Japanese (Hiragana) | `covered`     | Noto Sans JP | `hira`                  | Provided through Noto Sans JP, but not separately guaranteed. |
| Japanese (Katakana) | `covered`     | Noto Sans JP | `kana`                  | Provided through Noto Sans JP, but not separately guaranteed. |

_Note: **Grida** adopts the same fallback values as Figma to ensure consistency across desktop and web, while the web (browsers) normally uses platform-specific system fonts but is normalized here for clarity._
