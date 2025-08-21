# OpenType Features Reference

This document provides a comprehensive reference for OpenType features based on the [Microsoft OpenType specification](https://learn.microsoft.com/en-us/typography/opentype/spec/featurelist).

## Feature Table

| Key             | Name                                                | Description                                         |
| --------------- | --------------------------------------------------- | --------------------------------------------------- |
| `aalt`          | Access All Alternates                               | Provides access to all alternates in the font       |
| `abvf`          | Above-base Forms                                    | Forms positioned above the base character           |
| `abvm`          | Above-base Mark Positioning                         | Positioning of marks above the base character       |
| `abvs`          | Above-base Substitutions                            | Substitutions for forms above the base character    |
| `afrc`          | Alternative Fractions                               | Alternative fraction forms                          |
| `akhn`          | Akhand                                              | Conjunct forms that cannot be broken                |
| `apkn`          | Kerning for Alternate Proportional Widths           | Kerning for proportional width alternates           |
| `blwf`          | Below-base Forms                                    | Forms positioned below the base character           |
| `blwm`          | Below-base Mark Positioning                         | Positioning of marks below the base character       |
| `blws`          | Below-base Substitutions                            | Substitutions for forms below the base character    |
| `calt`          | Contextual Alternates                               | Context-sensitive alternate forms                   |
| `case`          | Case-sensitive Forms                                | Forms that are sensitive to case                    |
| `ccmp`          | Glyph Composition / Decomposition                   | Composition and decomposition of glyphs             |
| `cfar`          | Conjunct Form After Ro                              | Conjunct forms that appear after the character "ro" |
| `chws`          | Contextual Half-width Spacing                       | Context-sensitive half-width spacing                |
| `cjct`          | Conjunct Forms                                      | Conjunct forms for Indic scripts                    |
| `clig`          | Contextual Ligatures                                | Context-sensitive ligatures                         |
| `cpct`          | Centered CJK Punctuation                            | Centered punctuation for CJK scripts                |
| `cpsp`          | Capital Spacing                                     | Spacing adjustments for capital letters             |
| `cswh`          | Contextual Swash                                    | Context-sensitive swash forms                       |
| `curs`          | Cursive Positioning                                 | Positioning for cursive connections                 |
| `cv01` - `cv99` | Character Variant 1-99                              | Character variants numbered 1 through 99            |
| `c2pc`          | Petite Capitals From Capitals                       | Petite capitals derived from capital letters        |
| `c2sc`          | Small Capitals From Capitals                        | Small capitals derived from capital letters         |
| `dist`          | Distances                                           | Distance adjustments between characters             |
| `dlig`          | Discretionary Ligatures                             | Optional ligatures for aesthetic purposes           |
| `dnom`          | Denominators                                        | Denominator forms for fractions                     |
| `dtls`          | Dotless Forms                                       | Forms without dots (e.g., dotless i, j)             |
| `expt`          | Expert Forms                                        | Expert typographic forms                            |
| `falt`          | Final Glyph on Line Alternates                      | Alternate forms for final glyphs at line end        |
| `fin2`          | Terminal Forms #2                                   | Second set of terminal forms                        |
| `fin3`          | Terminal Forms #3                                   | Third set of terminal forms                         |
| `fina`          | Terminal Forms                                      | Terminal forms for Arabic scripts                   |
| `flac`          | Flattened Accent Forms                              | Flattened accent characters                         |
| `frac`          | Fractions                                           | Fraction forms                                      |
| `fwid`          | Full Widths                                         | Full-width character forms                          |
| `half`          | Half Forms                                          | Half-width character forms                          |
| `haln`          | Halant Forms                                        | Halant forms for Indic scripts                      |
| `halt`          | Alternate Half Widths                               | Alternate half-width forms                          |
| `hist`          | Historical Forms                                    | Historical character forms                          |
| `hkna`          | Horizontal Kana Alternates                          | Horizontal kana alternate forms                     |
| `hlig`          | Historical Ligatures                                | Historical ligature forms                           |
| `hngl`          | Hangul                                              | Hangul script forms                                 |
| `hojo`          | Hojo Kanji Forms                                    | JIS X 0212-1990 Kanji forms                         |
| `hwid`          | Half Widths                                         | Half-width character forms                          |
| `init`          | Initial Forms                                       | Initial forms for Arabic scripts                    |
| `isol`          | Isolated Forms                                      | Isolated forms for Arabic scripts                   |
| `ital`          | Italics                                             | Italic character forms                              |
| `jalt`          | Justification Alternates                            | Alternates for text justification                   |
| `jp78`          | JIS78 Forms                                         | JIS78 standard forms                                |
| `jp83`          | JIS83 Forms                                         | JIS83 standard forms                                |
| `jp90`          | JIS90 Forms                                         | JIS90 standard forms                                |
| `jp04`          | JIS2004 Forms                                       | JIS2004 standard forms                              |
| `kern`          | Kerning                                             | Kerning adjustments between character pairs         |
| `lfbd`          | Left Bounds                                         | Left boundary adjustments                           |
| `liga`          | Standard Ligatures                                  | Standard ligature forms                             |
| `ljmo`          | Leading Jamo Forms                                  | Leading jamo forms for Hangul                       |
| `lnum`          | Lining Figures                                      | Lining (uppercase) figures                          |
| `locl`          | Localized Forms                                     | Localized character forms                           |
| `ltra`          | Left-to-right Alternates                            | Left-to-right alternate forms                       |
| `ltrm`          | Left-to-right Mirrored Forms                        | Left-to-right mirrored forms                        |
| `mark`          | Mark Positioning                                    | Positioning of diacritical marks                    |
| `med2`          | Medial Forms #2                                     | Second set of medial forms                          |
| `medi`          | Medial Forms                                        | Medial forms for Arabic scripts                     |
| `mgrk`          | Mathematical Greek                                  | Mathematical Greek characters                       |
| `mkmk`          | Mark to Mark Positioning                            | Positioning of marks relative to other marks        |
| `mset`          | Mark Positioning via Substitution                   | Mark positioning through substitution               |
| `nalt`          | Alternate Annotation Forms                          | Alternate annotation forms                          |
| `nlck`          | NLC Kanji Forms                                     | NLC Kanji standard forms                            |
| `nukt`          | Nukta Forms                                         | Nukta forms for Indic scripts                       |
| `numr`          | Numerators                                          | Numerator forms for fractions                       |
| `onum`          | Oldstyle Figures                                    | Oldstyle (lowercase) figures                        |
| `opbd`          | Optical Bounds                                      | Optical boundary adjustments                        |
| `ordn`          | Ordinals                                            | Ordinal number forms                                |
| `ornm`          | Ornaments                                           | Ornamental character forms                          |
| `palt`          | Proportional Alternate Widths                       | Proportional alternate width forms                  |
| `pcap`          | Petite Capitals                                     | Petite capital letter forms                         |
| `pkna`          | Proportional Kana                                   | Proportional kana forms                             |
| `pnum`          | Proportional Figures                                | Proportional figure forms                           |
| `pref`          | Pre-base Forms                                      | Forms positioned before the base character          |
| `pres`          | Pre-base Substitutions                              | Substitutions before the base character             |
| `pstf`          | Post-base Forms                                     | Forms positioned after the base character           |
| `psts`          | Post-base Substitutions                             | Substitutions after the base character              |
| `pwid`          | Proportional Widths                                 | Proportional width forms                            |
| `qwid`          | Quarter Widths                                      | Quarter-width character forms                       |
| `rand`          | Randomize                                           | Random character selection                          |
| `rclt`          | Required Contextual Alternates                      | Required context-sensitive alternates               |
| `rkrf`          | Rakar Forms                                         | Rakar forms for Indic scripts                       |
| `rlig`          | Required Ligatures                                  | Required ligature forms                             |
| `rphf`          | Reph Form                                           | Reph form for Indic scripts                         |
| `rtbd`          | Right Bounds                                        | Right boundary adjustments                          |
| `rtla`          | Right-to-left Alternates                            | Right-to-left alternate forms                       |
| `rtlm`          | Right-to-left Mirrored Forms                        | Right-to-left mirrored forms                        |
| `ruby`          | Ruby Notation Forms                                 | Ruby notation character forms                       |
| `rvrn`          | Required Variation Alternates                       | Required variation alternate forms                  |
| `salt`          | Stylistic Alternates                                | Stylistic alternate character forms                 |
| `sinf`          | Scientific Inferiors                                | Scientific inferior character forms                 |
| `size`          | Optical Size                                        | Optical size adjustments                            |
| `smcp`          | Small Capitals                                      | Small capital letter forms                          |
| `smpl`          | Simplified Forms                                    | Simplified character forms                          |
| `ss01` - `ss20` | Stylistic Set 1-20                                  | Stylistic sets numbered 1 through 20                |
| `ssty`          | Math Script-style Alternates                        | Mathematical script-style alternates                |
| `stch`          | Stretching Glyph Decomposition                      | Stretching glyph decomposition                      |
| `subs`          | Subscript                                           | Subscript character forms                           |
| `sups`          | Superscript                                         | Superscript character forms                         |
| `swsh`          | Swash                                               | Swash character forms                               |
| `titl`          | Titling                                             | Titling character forms                             |
| `tjmo`          | Trailing Jamo Forms                                 | Trailing jamo forms for Hangul                      |
| `tnam`          | Traditional Name Forms                              | Traditional name character forms                    |
| `tnum`          | Tabular Figures                                     | Tabular figure forms                                |
| `trad`          | Traditional Forms                                   | Traditional character forms                         |
| `twid`          | Third Widths                                        | Third-width character forms                         |
| `unic`          | Unicase                                             | Unicase character forms                             |
| `valt`          | Alternate Vertical Metrics                          | Alternate vertical metric forms                     |
| `vapk`          | Kerning for Alternate Proportional Vertical Metrics | Kerning for proportional vertical metrics           |
| `vatu`          | Vattu Variants                                      | Vattu variant forms                                 |
| `vchw`          | Vertical Contextual Half-width Spacing              | Vertical contextual half-width spacing              |
| `vert`          | Vertical Alternates                                 | Vertical alternate forms                            |
| `vhal`          | Alternate Vertical Half Metrics                     | Alternate vertical half metric forms                |
| `vjmo`          | Vowel Jamo Forms                                    | Vowel jamo forms for Hangul                         |
| `vkna`          | Vertical Kana Alternates                            | Vertical kana alternate forms                       |
| `vkrn`          | Vertical Kerning                                    | Vertical kerning adjustments                        |
| `vpal`          | Proportional Alternate Vertical Metrics             | Proportional alternate vertical metrics             |
| `vrt2`          | Vertical Alternates and Rotation                    | Vertical alternates with rotation                   |
| `vrtr`          | Vertical Alternates for Rotation                    | Vertical alternates for rotation                    |
| `zero`          | Slashed Zero                                        | Slashed zero character form                         |

## Usage Notes

- **Character Variants (`cv01`-`cv99`)**: These features provide numbered character variants that can be used for different stylistic purposes.
- **Stylistic Sets (`ss01`-`ss20`)**: These features group related stylistic alternates together for easier application.
- **Contextual Features**: Features like `calt`, `clig`, and `chws` are context-sensitive and apply based on surrounding characters.
- **Script-Specific Features**: Many features are designed for specific writing systems (Arabic, Indic, CJK, etc.).

## References

- [Microsoft OpenType Feature List](https://learn.microsoft.com/en-us/typography/opentype/spec/featurelist)
- [OpenType Specification](https://learn.microsoft.com/en-us/typography/opentype/spec/)
