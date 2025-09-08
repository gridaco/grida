# OpenType Features Reference

This document provides a comprehensive reference for OpenType features based on the [Microsoft OpenType specification](https://learn.microsoft.com/en-us/typography/opentype/spec/featurelist).

## Feature Table

| Key             | Name                                                | Description                                      | Preview Text        |
| --------------- | --------------------------------------------------- | ------------------------------------------------ | ------------------- |
| `aalt`          | Access All Alternates                               | Provides access to all alternates in the font    | `Abc`               |
| `abvf`          | Above-base Forms                                    | Forms positioned above the base character        | `क` + marks         |
| `abvm`          | Above-base Mark Positioning                         | Positioning of marks above the base character    | `á`                 |
| `abvs`          | Above-base Substitutions                            | Substitutions for forms above the base character | `क` + marks         |
| `afrc`          | Alternative Fractions                               | Alternative fraction forms                       | `1/2 3/4`           |
| `akhn`          | Akhand                                              | Conjunct forms that cannot be broken             | `क्ष` (Devanagari)  |
| `apkn`          | Kerning for Alternate Proportional Widths           | Kerning for proportional width alternates        | `To AV`             |
| `blwf`          | Below-base Forms                                    | Forms positioned below the base character        | `क` + nukta         |
| `blwm`          | Below-base Mark Positioning                         | Positioning of marks below the base character    | `ạ`                 |
| `blws`          | Below-base Substitutions                            | Substitutions for forms below the base character | `क` + nukta         |
| `calt`          | Contextual Alternates                               | Context-sensitive alternate forms                | `- -> --> = => ==>` |
| `case`          | Case-sensitive Forms                                | Forms that are sensitive to case                 | `(ABC)`             |
| `ccmp`          | Glyph Composition / Decomposition                   | Composition and decomposition of glyphs          | `á ö`               |
| `cfar`          | Conjunct Form After Ro                              | Conjunct forms that appear after "ro"            | `r` + `क`           |
| `chws`          | Contextual Half-width Spacing                       | Context-sensitive half-width spacing             | `カタカナ`          |
| `cjct`          | Conjunct Forms                                      | Conjunct forms for Indic scripts                 | `क्ष`               |
| `clig`          | Contextual Ligatures                                | Context-sensitive ligatures                      | `st`                |
| `cpct`          | Centered CJK Punctuation                            | Centered punctuation for CJK scripts             | `。 「」`           |
| `cpsp`          | Capital Spacing                                     | Spacing adjustments for capital letters          | `TITLE`             |
| `cswh`          | Contextual Swash                                    | Context-sensitive swash forms                    | `Q J`               |
| `curs`          | Cursive Positioning                                 | Positioning for cursive connections              | `السلام`            |
| `cv01` - `cv99` | Character Variants 1-99                             | Character variants numbered 1 through 99         | `1` ~ `99`          |
| `c2pc`          | Petite Capitals From Capitals                       | Petite capitals derived from capital letters     | `ABC`               |
| `c2sc`          | Small Capitals From Capitals                        | Small capitals derived from capital letters      | `ABC`               |
| `dist`          | Distances                                           | Distance adjustments between characters          | `To AV`             |
| `dlig`          | Discretionary Ligatures                             | Optional ligatures for aesthetics                | `ct st`             |
| `dnom`          | Denominators                                        | Denominator forms for fractions                  | `1/2`               |
| `dtls`          | Dotless Forms                                       | Dotless forms (i, j)                             | `i j`               |
| `expt`          | Expert Forms                                        | Expert typographic forms                         | `ct st`             |
| `falt`          | Final Glyph on Line Alternates                      | Alternates for final glyphs at line end          | `word`              |
| `fin2`          | Terminal Forms #2                                   | Second set of terminal forms                     | `سلام`              |
| `fin3`          | Terminal Forms #3                                   | Third set of terminal forms                      | `سلام`              |
| `fina`          | Terminal Forms                                      | Terminal forms for Arabic scripts                | `سلام`              |
| `flac`          | Flattened Accent Forms                              | Flattened accent characters                      | `â ê ô`             |
| `frac`          | Fractions                                           | Fraction forms                                   | `1/2 3/4`           |
| `fwid`          | Full Widths                                         | Full-width forms                                 | `ABC123`            |
| `half`          | Half Forms                                          | Half-width forms                                 | `क`                 |
| `haln`          | Halant Forms                                        | Halant forms for Indic scripts                   | `क्`                |
| `halt`          | Alternate Half Widths                               | Alternate half-width forms                       | `カタカナ`          |
| `hist`          | Historical Forms                                    | Historical forms                                 | `ſ`                 |
| `hkna`          | Horizontal Kana Alternates                          | Horizontal kana alternate forms                  | `カタカナ`          |
| `hlig`          | Historical Ligatures                                | Historical ligatures                             | `ct st`             |
| `hngl`          | Hangul                                              | Hangul script forms                              | `한글`              |
| `hojo`          | Hojo Kanji Forms                                    | JIS X 0212-1990 Kanji                            | `亜 唖`             |
| `hwid`          | Half Widths                                         | Half-width forms                                 | `ＡＢＣ`            |
| `init`          | Initial Forms                                       | Initial forms for Arabic scripts                 | `سلام`              |
| `isol`          | Isolated Forms                                      | Isolated forms for Arabic scripts                | `س`                 |
| `ital`          | Italics                                             | Italic character forms                           | `abc`               |
| `jalt`          | Justification Alternates                            | Alternates for text justification                | `— —`               |
| `jp78`          | JIS78 Forms                                         | JIS78 standard forms                             | `旧`                |
| `jp83`          | JIS83 Forms                                         | JIS83 standard forms                             | `旧`                |
| `jp90`          | JIS90 Forms                                         | JIS90 standard forms                             | `旧`                |
| `jp04`          | JIS2004 Forms                                       | JIS2004 standard forms                           | `旧`                |
| `kern`          | Kerning                                             | Kerning adjustments between pairs                | `To AV`             |
| `lfbd`          | Left Bounds                                         | Left boundary adjustments                        | `AV`                |
| `liga`          | Standard Ligatures                                  | Standard ligatures                               | `fi fl ffi`         |
| `ljmo`          | Leading Jamo Forms                                  | Leading jamo forms for Hangul                    | `가`               |
| `lnum`          | Lining Figures                                      | Lining (uppercase) figures                       | `1234567890`        |
| `locl`          | Localized Forms                                     | Localized character forms                        | `i İ`               |
| `ltra`          | Left-to-right Alternates                            | Left-to-right alternate forms                    | `→`                 |
| `ltrm`          | Left-to-right Mirrored Forms                        | Left-to-right mirrored forms                     | `→`                 |
| `mark`          | Mark Positioning                                    | Positioning of diacritics                        | `á ö`               |
| `med2`          | Medial Forms #2                                     | Second set of medial forms                       | `سلام`              |
| `medi`          | Medial Forms                                        | Medial forms for Arabic scripts                  | `سلام`              |
| `mgrk`          | Mathematical Greek                                  | Mathematical Greek characters                    | `∑ ∆ π`             |
| `mkmk`          | Mark to Mark Positioning                            | Positioning of marks relative to other marks     | `ā́`                 |
| `mset`          | Mark Positioning via Substitution                   | Mark positioning through substitution            | `à́`                 |
| `nalt`          | Alternate Annotation Forms                          | Alternate annotation forms                       | `a`                 |
| `nlck`          | NLC Kanji Forms                                     | NLC Kanji standard forms                         | `令`                |
| `nukt`          | Nukta Forms                                         | Nukta forms for Indic scripts                    | `क़`                |
| `numr`          | Numerators                                          | Numerator forms for fractions                    | `1/2`               |
| `onum`          | Oldstyle Figures                                    | Oldstyle figures                                 | `1234567890`        |
| `opbd`          | Optical Bounds                                      | Optical boundary adjustments                     | `AV`                |
| `ordn`          | Ordinals                                            | Ordinal number forms                             | `No.`               |
| `ornm`          | Ornaments                                           | Ornamental character forms                       | `❦ ✤`               |
| `palt`          | Proportional Alternate Widths                       | Proportional alternate width forms               | `1234`              |
| `pcap`          | Petite Capitals                                     | Petite capital letter forms                      | `Abc`               |
| `pkna`          | Proportional Kana                                   | Proportional kana forms                          | `カタカナ`          |
| `pnum`          | Proportional Figures                                | Proportional figure forms                        | `123456`            |
| `pref`          | Pre-base Forms                                      | Forms positioned before the base character       | `क`                 |
| `pres`          | Pre-base Substitutions                              | Substitutions before the base character          | `क`                 |
| `pstf`          | Post-base Forms                                     | Forms positioned after the base character        | `क`                 |
| `psts`          | Post-base Substitutions                             | Substitutions after the base character           | `क`                 |
| `pwid`          | Proportional Widths                                 | Proportional width forms                         | `１２３`            |
| `qwid`          | Quarter Widths                                      | Quarter-width character forms                    | `１２３`            |
| `rand`          | Randomize                                           | Random character selection                       | `text`              |
| `rclt`          | Required Contextual Alternates                      | Required contextual alternates                   | `th`                |
| `rkrf`          | Rakar Forms                                         | Rakar forms for Indic scripts                    | `क्र`               |
| `rlig`          | Required Ligatures                                  | Required ligature forms                          | `lam-alef`          |
| `rphf`          | Reph Form                                           | Reph form for Indic scripts                      | `र्`                |
| `rtbd`          | Right Bounds                                        | Right boundary adjustments                       | `AV`                |
| `rtla`          | Right-to-left Alternates                            | Right-to-left alternate forms                    | `←`                 |
| `rtlm`          | Right-to-left Mirrored Forms                        | Right-to-left mirrored forms                     | `←`                 |
| `ruby`          | Ruby Notation Forms                                 | Ruby annotation forms                            | `漢(かん)`          |
| `rvrn`          | Required Variation Alternates                       | Required variation alternate forms               | `a`                 |
| `salt`          | Stylistic Alternates                                | Stylistic alternates                             | `a g`               |
| `sinf`          | Scientific Inferiors                                | Scientific inferior forms                        | `H2O`               |
| `size`          | Optical Size                                        | Optical size adjustments                         | `Text`              |
| `smcp`          | Small Capitals                                      | Small capital letter forms                       | `abc`               |
| `smpl`          | Simplified Forms                                    | Simplified character forms                       | `國 → 国`           |
| `ss01` - `ss20` | Stylistic Sets 1-20                                 | Stylistic sets numbered 1–20                     | `a g`               |
| `ssty`          | Math Script-style Alternates                        | Mathematical script-style alternates             | `x y`               |
| `stch`          | Stretching Glyph Decomposition                      | Stretching glyph decomposition                   | `ــ`                |
| `subs`          | Subscript                                           | Subscript forms                                  | `x2`                |
| `sups`          | Superscript                                         | Superscript forms                                | `x2`                |
| `swsh`          | Swash                                               | Swash character forms                            | `Q J`               |
| `titl`          | Titling                                             | Titling character forms                          | `Title`             |
| `tjmo`          | Trailing Jamo Forms                                 | Trailing jamo forms for Hangul                   | `ᆨ`                 |
| `tnam`          | Traditional Name Forms                              | Traditional name character forms                 | `舊`                |
| `tnum`          | Tabular Figures                                     | Tabular figure forms                             | `123456`            |
| `trad`          | Traditional Forms                                   | Traditional character forms                      | `國`                |
| `twid`          | Third Widths                                        | Third-width character forms                      | `１２３`            |
| `unic`          | Unicase                                             | Unicase character forms                          | `Aa`                |
| `valt`          | Alternate Vertical Metrics                          | Alternate vertical metric forms                  | `カタカナ`          |
| `vapk`          | Kerning for Alternate Proportional Vertical Metrics | Kerning for proportional vertical metrics        | `カタカナ`          |
| `vatu`          | Vattu Variants                                      | Vattu variant forms                              | `क`                 |
| `vchw`          | Vertical Contextual Half-width Spacing              | Vertical contextual half-width spacing           | `カタカナ`          |
| `vert`          | Vertical Alternates                                 | Vertical alternate forms                         | `漢字`              |
| `vhal`          | Alternate Vertical Half Metrics                     | Alternate vertical half metric forms             | `カタカナ`          |
| `vjmo`          | Vowel Jamo Forms                                    | Vowel jamo forms for Hangul                      | `ᅡ`                 |
| `vkna`          | Vertical Kana Alternates                            | Vertical kana alternate forms                    | `カタカナ`          |
| `vkrn`          | Vertical Kerning                                    | Vertical kerning adjustments                     | `カナ`              |
| `vpal`          | Proportional Alternate Vertical Metrics             | Proportional alternate vertical metrics          | `カタカナ`          |
| `vrt2`          | Vertical Alternates and Rotation                    | Vertical alternates with rotation                | `漢字`              |
| `vrtr`          | Vertical Alternates for Rotation                    | Vertical alternates for rotation                 | `漢字`              |
| `zero`          | Slashed Zero                                        | Slashed zero character form                      | `0`                 |

## Usage Notes

- **Character Variants (`cv01`-`cv99`)**: These features provide numbered character variants that can be used for different stylistic purposes.
- **Stylistic Sets (`ss01`-`ss20`)**: These features group related stylistic alternates together for easier application.
- **Contextual Features**: Features like `calt`, `clig`, and `chws` are context-sensitive and apply based on surrounding characters.
- **Script-Specific Features**: Many features are designed for specific writing systems (Arabic, Indic, CJK, etc.).

## References

- [Microsoft OpenType Feature List](https://learn.microsoft.com/en-us/typography/opentype/spec/featurelist)
- [OpenType Specification](https://learn.microsoft.com/en-us/typography/opentype/spec/)
