use crate::cg::types::*;
use crate::node::schema::NodeId;
use crate::painter::cvt;
use crate::runtime::repository::FontRepository;
use crate::text::text_style::textstyle;
use skia_safe::textlayout;
use std::cell::RefCell;
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::rc::Rc;

#[derive(Clone, Debug)]
pub struct ParagraphCacheEntry {
    pub hash: u64,
    pub font_generation: usize,
    pub paragraph: Rc<RefCell<textlayout::Paragraph>>,
}

#[derive(Default, Debug, Clone)]
pub struct ParagraphCache {
    entries: Rc<RefCell<HashMap<NodeId, ParagraphCacheEntry>>>,
}

impl ParagraphCache {
    pub fn new() -> Self {
        Self {
            entries: Rc::new(RefCell::new(HashMap::new())),
        }
    }

    fn shape_key(
        text: &str,
        style: &TextStyleRec,
        align: &TextAlign,
        max_lines: &Option<usize>,
    ) -> u64 {
        let mut h = DefaultHasher::new();
        text.hash(&mut h);
        style.text_decoration_line.hash(&mut h);
        style.font_family.hash(&mut h);
        style.font_size.to_bits().hash(&mut h);
        style.font_weight.0.hash(&mut h);
        style.italic.hash(&mut h);
        style.letter_spacing.map(|v| v.to_bits()).hash(&mut h);
        style.line_height.map(|v| v.to_bits()).hash(&mut h);
        style.text_transform.hash(&mut h);
        (*align as u8).hash(&mut h);
        max_lines.hash(&mut h);
        h.finish()
    }

    pub fn get(&self, id: &NodeId) -> Option<ParagraphCacheEntry> {
        self.entries.borrow().get(id).cloned()
    }

    pub fn get_or_create(
        &mut self,
        id: &NodeId,
        text: &str,
        fill: &Paint,
        align: &TextAlign,
        style: &TextStyleRec,
        max_lines: &Option<usize>,
        ellipsis: &Option<String>,
        fonts: &FontRepository,
    ) -> Rc<RefCell<textlayout::Paragraph>> {
        let fonts_gen = fonts.generation();
        let hash = Self::shape_key(text, style, align, max_lines);
        if let Some(entry) = self.entries.borrow().get(id) {
            if entry.hash == hash && entry.font_generation == fonts_gen {
                return entry.paragraph.clone();
            }
        }

        // Build the paragraph (expensive operation)
        let fill_paint = cvt::sk_paint(
            fill,
            1.0,
            // FIXME: pass the resolved size - using default for now
            // required for gradients
            (0.0, 0.0),
        );
        let mut paragraph_style = textlayout::ParagraphStyle::new();
        paragraph_style.set_text_direction(textlayout::TextDirection::LTR);
        paragraph_style.set_text_align(align.clone().into());

        // Set max lines if specified
        if let Some(max_lines) = max_lines {
            paragraph_style.set_max_lines(*max_lines);
            paragraph_style.set_ellipsis(ellipsis.as_ref().unwrap_or(&"...".to_string()));
        }

        let ctx = TextStyleRecBuildContext {
            color: fill.solid_color().unwrap_or(CGColor::TRANSPARENT),
        };
        let mut para_builder =
            textlayout::ParagraphBuilder::new(&paragraph_style, &fonts.font_collection());
        let mut ts = textstyle(style, &Some(ctx));
        ts.set_foreground_paint(&fill_paint);
        para_builder.push_style(&ts);
        let transformed_text =
            crate::text::text_transform::transform_text(text, style.text_transform);
        para_builder.add_text(&transformed_text);
        let paragraph: skia_safe::textlayout::Paragraph = para_builder.build();
        para_builder.pop();

        // Store the paragraph for future use
        let paragraph_rc = Rc::new(RefCell::new(paragraph));
        self.entries.borrow_mut().insert(
            id.clone(),
            ParagraphCacheEntry {
                hash,
                font_generation: fonts_gen,
                paragraph: paragraph_rc.clone(),
            },
        );

        paragraph_rc
    }

    pub fn invalidate(&mut self) {
        self.entries.borrow_mut().clear();
    }

    pub fn len(&self) -> usize {
        self.entries.borrow().len()
    }
}
