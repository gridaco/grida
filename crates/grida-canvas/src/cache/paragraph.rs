use crate::node::schema::{NodeId, Paint, Size, TextAlign, TextAlignVertical, TextStyle};
use crate::painter::{cvt, make_textstyle};
use crate::runtime::repository::FontRepository;
use skia_safe::textlayout;
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::rc::Rc;

#[derive(Clone, Debug)]
pub struct ParagraphCacheEntry {
    pub hash: u64,
    pub font_generation: usize,
    pub paragraph: Rc<textlayout::Paragraph>,
}

#[derive(Default, Clone, Debug)]
pub struct ParagraphCache {
    entries: HashMap<NodeId, ParagraphCacheEntry>,
}

impl ParagraphCache {
    pub fn new() -> Self {
        Self {
            entries: HashMap::new(),
        }
    }

    fn text_hash(
        text: &str,
        style: &TextStyle,
        align: &TextAlign,
        valign: &TextAlignVertical,
        size: &Size,
    ) -> u64 {
        let mut h = DefaultHasher::new();
        text.hash(&mut h);
        style.text_decoration.hash(&mut h);
        style.font_family.hash(&mut h);
        style.font_size.to_bits().hash(&mut h);
        style.font_weight.0.hash(&mut h);
        style.italic.hash(&mut h);
        style.letter_spacing.map(|v| v.to_bits()).hash(&mut h);
        style.line_height.map(|v| v.to_bits()).hash(&mut h);
        style.text_transform.hash(&mut h);
        (*align as u8).hash(&mut h);
        (*valign as u8).hash(&mut h);
        size.width.to_bits().hash(&mut h);
        size.height.to_bits().hash(&mut h);
        h.finish()
    }

    pub fn get_or_create(
        &mut self,
        id: &NodeId,
        text: &str,
        size: &Size,
        fill: &Paint,
        align: &TextAlign,
        valign: &TextAlignVertical,
        style: &TextStyle,
        fonts: &FontRepository,
    ) -> Rc<textlayout::Paragraph> {
        let fonts_gen = fonts.generation();
        let hash = Self::text_hash(text, style, align, valign, size);
        if let Some(entry) = self.entries.get(id) {
            if entry.hash == hash && entry.font_generation == fonts_gen {
                return entry.paragraph.clone();
            }
        }
        let fill_paint = cvt::sk_paint(fill, 1.0, (size.width, size.height));
        let mut paragraph_style = textlayout::ParagraphStyle::new();
        paragraph_style.set_text_direction(textlayout::TextDirection::LTR);
        paragraph_style.set_text_align(align.clone().into());

        let mut para_builder =
            textlayout::ParagraphBuilder::new(&paragraph_style, &fonts.font_collection());
        let mut ts = make_textstyle(style);
        ts.set_foreground_paint(&fill_paint);
        para_builder.push_style(&ts);
        let transformed_text =
            crate::text::text_transform::transform_text(text, style.text_transform);
        para_builder.add_text(&transformed_text);
        let mut paragraph = para_builder.build();
        para_builder.pop();
        paragraph.layout(size.width);

        let rc = Rc::new(paragraph);
        self.entries.insert(
            id.clone(),
            ParagraphCacheEntry {
                hash,
                font_generation: fonts_gen,
                paragraph: rc.clone(),
            },
        );
        rc
    }

    pub fn invalidate(&mut self) {
        self.entries.clear();
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn get(&self, id: &NodeId) -> Option<&ParagraphCacheEntry> {
        self.entries.get(id)
    }
}
