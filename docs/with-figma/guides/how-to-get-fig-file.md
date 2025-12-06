# How to Save a Local .fig Copy from Figma

This guide explains how to download a .fig file from Figma to import into Grida.

> **Note:** The .fig file format is proprietary and subject to change without notice. If you encounter issues importing .fig files, please [report it to us](https://github.com/gridaco/grida/issues) or contact support. Your feedback helps us keep imports working smoothly.

## Requirements

- You need at least **can view** access to the file
- The file owner must not have restricted copying and sharing
- If you don't see the "Save local copy" option, contact the file owner

## In Figma Desktop or Web

1. Open your Figma file
2. Click **Main menu** (top-left corner)
3. Go to **File → Save local copy...**
4. Choose a location on your computer
5. Click **Save**

The file will be saved with a `.fig` extension (Figma Design files).

## File Location by Operating System

After saving, you can find your .fig files in the location you selected:

**macOS**

- Default Downloads folder: `~/Downloads/`
- Custom locations: Wherever you chose during save

**Windows**

- Default Downloads folder: `C:\Users\YourUsername\Downloads\`
- Custom locations: Wherever you chose during save

**Linux**

- Default Downloads folder: `~/Downloads/`
- Custom locations: Wherever you chose during save

## What's Inside a .fig File?

A .fig file contains:

- All pages (canvases) in your Figma document
- Complete node hierarchy with properties
- Vector data, fills, strokes, and effects
- Text content and styling
- Component definitions and instances

**Not included:**

- Version history
- Comments
- Connection to the original file (imported file will be treated as new)

## Importing into Grida

Once you have a .fig file:

1. Open Grida Canvas playground
2. Click the logo menu (top-left)
3. Select **Import Figma**
4. In the **.fig File** tab, click **Select .fig File**
5. Choose your downloaded .fig file
6. Review the pages that will be imported
7. Click **Yes, Import**

Each Figma page will become a Grida scene.

> **Note:** Components in the imported file will become new main components. Instances will connect to these new components and won't receive updates from the original Figma file.

## Troubleshooting

**Can't find "Save local copy" option**

- The file owner may have restricted copying and sharing
- You may not have sufficient access permissions (need at least "can view")
- Contact the file owner to request access or to download the file for you

**"Failed to parse .fig file"**

- Ensure the file is a valid .fig file downloaded from Figma
- Try downloading the file again
- Check if the file is corrupted (file size should be reasonable)
- The .fig format may have changed (see warning above)

**"No pages found"**

- The .fig file may be empty or contain no canvas nodes
- Open the file in Figma to verify it has content

## Related Resources

- [Figma Help: Save a local copy of files](https://help.figma.com/hc/en-us/articles/8403626871063-Save-a-local-copy-of-files)
- [Figma Help: Download files from Figma](https://help.figma.com/hc/en-us/articles/360041003114-Download-files-from-Figma)
- [Copy & Paste from Figma](../../editor/features/copy-paste-figma.md) - Alternative import method using clipboard
