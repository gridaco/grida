# Main Menu Documentation

## File

| Path                    | Name           | Description                                                | Shortcut | Ready |
| ----------------------- | -------------- | ---------------------------------------------------------- | -------- | ----- |
| `File > Open .grida`    | Open .grida    | Opens a Grida document file                                | —        | ✅    |
| `File > Save as .grida` | Save as .grida | Exports current document as a Grida file                   | —        | ✅    |
| `File > Import Image`   | Import Image   | Imports image files (PNG, JPEG, WebP, SVG) into the canvas | —        | ✅    |
| `File > Import Figma`   | Import Figma   | Imports designs from Figma via URL or .fig file            | —        | ✅    |

## Edit

| Path                 | Name        | Description                                                  | Shortcut | Ready |
| -------------------- | ----------- | ------------------------------------------------------------ | -------- | ----- |
| `Edit > Undo`        | Undo        | Undoes the last action                                       | ⌘Z       | ✅    |
| `Edit > Redo`        | Redo        | Redoes the last undone action                                | ⌘⇧Z      | ✅    |
| `Edit > Cut`         | Cut         | Cuts the selected items to clipboard                         | ⌘X       | ✅    |
| `Edit > Copy`        | Copy        | Copies the selected items to clipboard                       | ⌘C       | ✅    |
| `Edit > Paste`       | Paste       | Pastes items from clipboard                                  | ⌘V       | ✅    |
| `Edit > Copy as PNG` | Copy as PNG | Copies the selected items as PNG image (canvas backend only) | ⇧⌘C      | ✅    |
| `Edit > Copy as SVG` | Copy as SVG | Copies the selected items as SVG (canvas backend only)       | —        | ✅    |
| `Edit > Duplicate`   | Duplicate   | Duplicates the selected items                                | ⌘D       | ✅    |
| `Edit > Delete`      | Delete      | Deletes the selected items                                   | ⌫        | ✅    |

## Text

| Path                                      | Name                    | Description                                      | Shortcut | Ready |
| ----------------------------------------- | ----------------------- | ------------------------------------------------ | -------- | ----- |
| `Text > Bold`                             | Bold                    | Toggles bold text style                          | ⌘B       | ✅    |
| `Text > Italic`                           | Italic                  | Toggles italic text style                        | ⌘I       | ✅    |
| `Text > Underline`                        | Underline               | Toggles underline text decoration                | ⌘U       | ✅    |
| `Text > Strikethrough`                    | Strikethrough           | Toggles strikethrough text decoration            | ⇧⌘X      | ✅    |
| `Text > Create link`                      | Create link             | Creates a hyperlink from selected text           | ⇧⌘U      | ❌    |
| `Text > Bulleted list`                    | Bulleted list           | Converts text to a bulleted list                 | ⇧⌘8      | ❌    |
| `Text > Numbered list`                    | Numbered list           | Converts text to a numbered list                 | ⇧⌘7      | ❌    |
| `Text > Alignment > Text align left`      | Text align left         | Aligns text to the left                          | ⌥⌘L      | ✅    |
| `Text > Alignment > Text align center`    | Text align center       | Centers text horizontally                        | ⌥⌘T      | ✅    |
| `Text > Alignment > Text align right`     | Text align right        | Aligns text to the right                         | ⌥⌘R      | ✅    |
| `Text > Alignment > Text align justified` | Text align justified    | Justifies text horizontally                      | ⌥⌘J      | ✅    |
| `Text > Alignment > Text align top`       | Text align top          | Aligns text to the top vertically                | —        | ✅    |
| `Text > Alignment > Text align middle`    | Text align middle       | Centers text vertically                          | —        | ✅    |
| `Text > Alignment > Text align bottom`    | Text align bottom       | Aligns text to the bottom vertically             | —        | ✅    |
| `Text > Adjust > Increase indentation`    | Increase indentation    | Increases text indentation                       | Tab      | ❌    |
| `Text > Adjust > Decrease indentation`    | Decrease indentation    | Decreases text indentation                       | ⇧ + Tab  | ❌    |
| `Text > Adjust > Increase font size`      | Increase font size      | Increases font size by 1px                       | ⇧⌘>      | ✅    |
| `Text > Adjust > Decrease font size`      | Decrease font size      | Decreases font size by 1px                       | ⇧⌘<      | ✅    |
| `Text > Adjust > Increase font weight`    | Increase font weight    | Increases font weight                            | ⌥⌘>      | ❌    |
| `Text > Adjust > Decrease font weight`    | Decrease font weight    | Decreases font weight                            | ⌥⌘<      | ❌    |
| `Text > Adjust > Increase line height`    | Increase line height    | Increases line height                            | ⌥⇧>      | ✅    |
| `Text > Adjust > Decrease line height`    | Decrease line height    | Decreases line height                            | ⌥⇧<      | ✅    |
| `Text > Adjust > Increase letter spacing` | Increase letter spacing | Increases letter spacing                         | ⌥>       | ✅    |
| `Text > Adjust > Decrease letter spacing` | Decrease letter spacing | Decreases letter spacing                         | ⌥<       | ✅    |
| `Text > Case > Original case`             | Original case           | Resets text to original case (removes transform) | —        | ✅    |
| `Text > Case > Uppercase`                 | Uppercase               | Transforms text to uppercase                     | —        | ✅    |
| `Text > Case > Lowercase`                 | Lowercase               | Transforms text to lowercase                     | —        | ✅    |

## Object

| Path                                                          | Name                           | Description                                     | Shortcut | Ready |
| ------------------------------------------------------------- | ------------------------------ | ----------------------------------------------- | -------- | ----- |
| `Object > Container selection`                                | Container selection            | Wraps selection in a container                  | ⌥⌘G      | ✅    |
| `Object > Group selection`                                    | Group selection                | Groups selected items                           | ⌘G       | ✅    |
| `Object > Ungroup selection`                                  | Ungroup selection              | Ungroups selected group                         | ⇧⌘G      | ✅    |
| `Object > Wrap in new section`                                | Wrap in new section            | Wraps selection in a new section                | -        | ❌    |
| `Object > Convert to section`                                 | Convert to section             | Converts selection to a section                 | —        | ❌    |
| `Object > Convert to container`                               | Convert to container           | Converts selection to a container               | —        | ❌    |
| `Object > Use as mask`                                        | Use as mask                    | Uses selection as a clipping mask               | —        | ✅    |
| `Object > Restore default thumbnail`                          | Restore default thumbnail      | Restores the default thumbnail for selection    | —        | ❌    |
| `Object > Add layout`                                         | Add layout                     | Applies layout to selection                     | ⇧A       | ✅    |
| `Object > Create arc`                                         | Create arc                     | Creates an arc shape from current ellipse       | —        | ❌    |
| `Object > More layout options > Suggest layout`               | Suggest layout                 | Suggests layout configuration                   | ⇧⌃A      | ❌    |
| `Object > More layout options > Remove all layout`            | Remove all layout              | Removes layout from selection                   | —        | ❌    |
| `Object > More layout options > Lock aspect ratio`            | Lock aspect ratio              | Locks aspect ratio for selection                | —        | ❌    |
| `Object > More layout options > Unlock aspect ratio`          | Unlock aspect ratio            | Unlocks aspect ratio for selection              | —        | ❌    |
| `Object > More layout options > Resize to fit`                | Resize to fit                  | Resizes selection to fit contents               | ⌥⇧⌘R     | ❌    |
| `Object > More layout options > Set width to hug contents`    | Set width to hug contents      | Sets width to hug contents                      | —        | ❌    |
| `Object > More layout options > Set height to hug contents`   | Set height to hug contents     | Sets height to hug contents                     | —        | ❌    |
| `Object > More layout options > Set width to fill container`  | Set width to fill container    | Sets width to fill container                    | —        | ❌    |
| `Object > More layout options > Set height to fill container` | Set height to fill container   | Sets height to fill container                   | —        | ❌    |
| `Object > Create component`                                   | Create component               | Creates a component from selection              | ⌥⌘K      | ❌    |
| `Object > Reset instance`                                     | Reset instance                 | Resets component instance to main component     | —        | ❌    |
| `Object > Detach instance`                                    | Detach instance                | Detaches component instance                     | ⌥⌘B      | ❌    |
| `Object > Main component > Go to main component`              | Go to main component           | Navigates to the main component                 | ⌃⌥⌘K     | ❌    |
| `Object > Main component > Push changes to main component`    | Push changes to main component | Pushes overrides to main component              | —        | ❌    |
| `Object > Main component > Restore main component`            | Restore main component         | Restores main component state                   | —        | ❌    |
| `Object > Bring to front`                                     | Bring to front                 | Brings selection to the front                   | ]        | ✅    |
| `Object > Bring forward`                                      | Bring forward                  | Brings selection forward one layer              | ⌘]       | ✅    |
| `Object > Send backward`                                      | Send backward                  | Sends selection backward one layer              | ⌘[       | ✅    |
| `Object > Send to back`                                       | Send to back                   | Sends selection to the back                     | [        | ✅    |
| `Object > Flip horizontal`                                    | Flip horizontal                | Flips selection horizontally                    | ⇧H       | ❌    |
| `Object > Flip vertical`                                      | Flip vertical                  | Flips selection vertically                      | ⇧V       | ❌    |
| `Object > Rotate 180°`                                        | Rotate 180°                    | Rotates selection by 180 degrees                | —        | ❌    |
| `Object > Rotate 90° left`                                    | Rotate 90° left                | Rotates selection 90 degrees counterclockwise   | —        | ❌    |
| `Object > Rotate 90° right`                                   | Rotate 90° right               | Rotates selection 90 degrees clockwise          | —        | ❌    |
| `Object > Flatten`                                            | Flatten                        | Converts selection to vector paths              | ⌘E       | ✅    |
| `Object > Outline stroke`                                     | Outline stroke                 | Converts stroke to filled shape                 | ⌥⌘O      | ❌    |
| `Object > Boolean groups > Union`                             | Union                          | Combines shapes using union operation           | —        | ✅    |
| `Object > Boolean groups > Subtract`                          | Subtract                       | Subtracts shapes using subtract operation       | —        | ✅    |
| `Object > Boolean groups > Intersect`                         | Intersect                      | Creates intersection of shapes                  | —        | ✅    |
| `Object > Boolean groups > Exclude`                           | Exclude                        | Creates exclusion of shapes                     | —        | ✅    |
| `Object > Rasterize selection`                                | Rasterize selection            | Converts selection to raster image              | —        | ❌    |
| `Object > Show/Hide selection`                                | Show/Hide selection            | Toggles visibility of selection                 | ⇧⌘H      | ✅    |
| `Object > Lock/Unlock selection`                              | Lock/Unlock selection          | Toggles lock state of selection                 | ⇧⌘L      | ✅    |
| `Object > Hide other layers`                                  | Hide other layers              | Hides all layers except selection               | —        | ❌    |
| `Object > Collapse layers`                                    | Collapse layers                | Collapses layer hierarchy                       | ⌥L       | ❌    |
| `Object > Remove fill`                                        | Remove fill                    | Removes fill from selection                     | ⌥/       | ✅    |
| `Object > Remove stroke`                                      | Remove stroke                  | Removes stroke from selection (sets width to 0) | ⇧/       | ✅    |
| `Object > Swap fill and stroke`                               | Swap fill and stroke           | Swaps fill and stroke paints                    | ⇧X       | ✅    |

## Arrange

| Path                                      | Name                          | Description                               | Shortcut | Ready |
| ----------------------------------------- | ----------------------------- | ----------------------------------------- | -------- | ----- |
| `Arrange > Round to pixel`                | Round to pixel                |                                           | —        | ❌    |
| `Arrange > Align left`                    | Align left                    | Aligns selection to the left              | ⌥A       | ✅    |
| `Arrange > Align horizontal centers`      | Align horizontal centers      | Aligns selection horizontally centered    | ⌥H       | ✅    |
| `Arrange > Align right`                   | Align right                   | Aligns selection to the right             | ⌥D       | ✅    |
| `Arrange > Align top`                     | Align top                     | Aligns selection to the top               | ⌥W       | ✅    |
| `Arrange > Align vertical centers`        | Align vertical centers        | Aligns selection vertically centered      | ⌥V       | ✅    |
| `Arrange > Align bottom`                  | Align bottom                  | Aligns selection to the bottom            | ⌥S       | ✅    |
| `Arrange > Tidy up`                       | Tidy up                       |                                           | ⇧⌥T      | ❌    |
| `Arrange > Pack horizontal`               | Pack horizontal               |                                           | —        | ❌    |
| `Arrange > Pack vertical`                 | Pack vertical                 |                                           | —        | ❌    |
| `Arrange > Distribute horizontal spacing` | Distribute horizontal spacing | Distributes selection evenly horizontally | ⌥⌃V      | ✅    |
| `Arrange > Distribute vertical spacing`   | Distribute vertical spacing   | Distributes selection evenly vertically   | ⌥⌃H      | ✅    |
| `Arrange > Distribute left`               | Distribute left               |                                           | —        | ❌    |
| `Arrange > Distribute horizontal centers` | Distribute horizontal centers |                                           | —        | ❌    |
| `Arrange > Distribute right`              | Distribute right              |                                           | —        | ❌    |
| `Arrange > Distribute top`                | Distribute top                |                                           | —        | ❌    |
| `Arrange > Distribute vertical centers`   | Distribute vertical centers   |                                           | —        | ❌    |
| `Arrange > Distribute bottom`             | Distribute bottom             |                                           | —        | ❌    |

## View

| Path                       | Name              | Description                            | Shortcut | Ready |
| -------------------------- | ----------------- | -------------------------------------- | -------- | ----- |
| `View > Zoom in`           | Zoom in           | Zooms in on the canvas                 | ⌘+       | ✅    |
| `View > Zoom out`          | Zoom out          | Zooms out on the canvas                | ⌘-       | ✅    |
| `View > Zoom to 100%`      | Zoom to 100%      | Resets zoom to 100%                    | ⇧0       | ✅    |
| `View > Zoom to fit`       | Zoom to fit       | Zooms to fit all content on canvas     | ⇧1       | ✅    |
| `View > Zoom to selection` | Zoom to selection | Zooms to fit selected items            | ⇧2       | ✅    |
| `View > Pixel grid`        | Pixel grid        | Toggles pixel grid overlay             | ⇧'       | ✅    |
| `View > Ruler`             | Ruler             | Toggles ruler display                  | ⇧R       | ✅    |
| `View > Show/Hide UI`      | Show/Hide UI      | Toggles UI visibility (when available) | ⌘\       | ✅    |
| `View > Minimize UI`       | Minimize UI       | Minimizes UI elements (when available) | ⇧⌘\      | ✅    |

## Settings

| Path                            | Name               | Description                              | Shortcut | Ready |
| ------------------------------- | ------------------ | ---------------------------------------- | -------- | ----- |
| `Settings > General`            | General            | Opens general settings dialog            | —        | ✅    |
| `Settings > Keyboard shortcuts` | Keyboard shortcuts | Opens keyboard shortcuts settings dialog | —        | ✅    |
