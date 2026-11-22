//! Render Desktop guidance at acceptance. Older checkpoints fingerprinted the original text.

use super::{Envelope, Result, StoredPrompt, encode_stored_prompt};
use crate::editor_surfaces::DesktopToolCatalog;
use grida_agent_master::presentation;

const LEGACY_OPEN: &str = "When producing or editing a primary artifact, request surface_open at the first meaningful renderable checkpoint so the user can follow the work. Keep working after the request. Open the existing primary artifact before substantial edits when it is not already visible. Reopen it only when the user asks or the primary artifact changes. Treat presentation as optional and verify the artifact independently.";
const LEGACY_SHOW: &str = "When producing or editing a primary artifact, request workbench_show with its workspace file target at the first meaningful renderable checkpoint so the user can follow the work. The workbench chooses the viewer. Keep working after the request. Show the existing primary artifact before substantial edits when it is not already visible. Show it again only when the user asks or the primary artifact changes. Treat presentation as optional and verify the artifact independently.";

impl StoredPrompt {
    pub(super) fn encode_for_acceptance(mut self) -> Result<Envelope> {
        let mut text = String::new();
        self.render_editor_instructions(&mut text, self.image_tool_results.unwrap_or(false), false);
        self.editor_instructions = (!text.is_empty()).then_some(text);
        encode_stored_prompt(&self)
    }

    pub(super) fn append_editor_instructions(&self, text: &mut String, images: bool) {
        match &self.editor_instructions {
            Some(captured) => text.push_str(captured),
            None => self.render_editor_instructions(text, images, true),
        }
    }

    fn render_editor_instructions(&self, text: &mut String, images: bool, legacy: bool) {
        let catalog = self.editor_tool_catalog.as_ref();
        let workbench = self.workbench_tools;
        let browser = self.editor_browser_tools;
        let presentation = self.editor_presentation;
        let browser_mcp = catalog.is_some_and(DesktopToolCatalog::uses_browser_mcp);
        if browser && catalog.is_none() {
            text.push_str("\n\n");
            crate::browser_tools::append_legacy_browser_guidance(text, legacy);
            let capture_guidance = if images {
                " Keep browser captures as image results."
            } else {
                " This model connection cannot receive browser captures. Use browser snapshots for inspection and report the screenshot limitation if asked."
            };
            text.push_str(capture_guidance);
        } else if browser && !browser_mcp && !images {
            text.push_str("\n\nThis model connection cannot receive browser captures.");
        }
        let granted = if browser && !browser_mcp {
            presentation
        } else {
            catalog.map_or(presentation, DesktopToolCatalog::has_presentation)
        };
        if granted {
            if legacy {
                text.push_str("\n\n");
                text.push_str(if workbench { LEGACY_SHOW } else { LEGACY_OPEN });
            } else {
                let workbench_paths = catalog.is_some_and(DesktopToolCatalog::uses_workbench_paths);
                presentation::append_instructions(text, workbench, browser, workbench_paths);
            }
        }
    }
}
