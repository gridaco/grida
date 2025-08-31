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

For the complete registry, see Microsoft’s official documentation.

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

## Officially Supported by Grida

| Script   | Support Level | Note                                           |
| -------- | ------------- | ---------------------------------------------- |
| Latin    | `prod`        | Default global script, supported universally.  |
| Korean   | `dev`         | Fully supported with fallback to Noto Sans KR. |
| Japanese | `dev`         | Fully supported with fallback to Noto Sans JP. |

## Fallback Table

| system   | grida        | figma        | web                                                                                                          |
| -------- | ------------ | ------------ | ------------------------------------------------------------------------------------------------------------ |
| Korean   | Noto Sans KR | Noto Sans KR | Noto Sans KR (platform dependent on system, but effectively Noto Sans KR for consistency)                    |
| Japanese | Noto Sans JP | Noto Sans JP | Noto Sans JP (or platform-dependent default such as Meiryo / Hiragino, but Figma normalizes to Noto Sans JP) |

_Note: **Grida** adopts the same fallback values as Figma to ensure consistency across desktop and web, while the web (browsers) normally uses platform-specific system fonts but is normalized here for clarity._
