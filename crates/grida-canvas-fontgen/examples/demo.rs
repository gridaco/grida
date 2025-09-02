use std::{fs, path::Path};

use write_fonts::tables::{
    cmap::{Cmap, CmapSubtable, EncodingRecord, PlatformId},
    glyf::{GlyfLocaBuilder, Glyph},
    head::Head,
    hhea::Hhea,
    hmtx::{Hmtx, LongMetric},
    maxp::Maxp,
    name::{Name, NameRecord},
    os2::Os2,
    post::Post,
    sbix::{Sbix, Strike},
};
use write_fonts::FontBuilder;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // --- 1) Load your PNG bytes
    let _png = fs::read("emoji.png")?; // e.g., a ~128×128 PNG

    // --- 2) Create glyphs using the builder pattern
    let mut builder = GlyfLocaBuilder::new();

    // Add .notdef glyph (gid 0) - empty glyph
    builder.add_glyph(&Glyph::Empty)?;

    // Add our emoji glyph (gid 1) - empty outline; bitmap comes from sbix
    // This will be mapped to the lowercase 'a' character
    builder.add_glyph(&Glyph::Empty)?;

    // Build the glyf and loca tables
    let (glyf, loca, loca_format) = builder.build();

    // --- 3) Horizontal metrics
    let advance = 1000u16;
    let h_metrics = vec![
        LongMetric::new(advance, 0), // gid 0
        LongMetric::new(advance, 0), // gid 1
    ];
    let hmtx = Hmtx::new(h_metrics, vec![]);

    // --- 4) cmap: map ALL ASCII characters (0-127) -> gid 1 (emoji)
    let mut cmap = Cmap::default();

    // Create a simple format 0 subtable for ALL ASCII characters
    // Format 0 is simpler and more reliable for character mappings
    let mut glyph_id_array = vec![0u8; 256]; // Initialize with 256 entries (0-255)

    // Map ALL ASCII characters (0-127) to glyph ID 1 (emoji)
    // This includes:
    // - Uppercase A-Z (U+0041 to U+005A) → emoji
    // - Lowercase a-z (U+0061 to U+007A) → emoji
    // - Digits 0-9 (U+0030 to U+0039) → emoji
    // - All symbols and punctuation → emoji
    for i in 0..128 {
        glyph_id_array[i] = 1; // Map all ASCII chars to emoji glyph
    }

    let sub = CmapSubtable::format_0(0, glyph_id_array); // language = 0

    cmap.encoding_records.push(EncodingRecord::new(
        PlatformId::Windows,
        1, // Unicode BMP encoding
        sub,
    ));

    // --- 5) sbix: one strike at 128 ppem, 72 ppi
    // Initialize glyph_data_offsets for 2 glyphs (gid0 no data => 0 offset; gid1 will be populated)
    let strike = Strike::new(128, 72, vec![0u32, 0u32]);

    // For this example, we'll create a simple sbix table
    // Note: In a real implementation, you'd need to properly set the PNG data
    let sbix = Sbix::new(
        write_fonts::tables::sbix::HeaderFlags::default(),
        vec![strike],
    );

    // --- 6) Boilerplate tables (set sane defaults)
    let units_per_em = 1000u16;

    // Head table
    let mut head = Head::default();
    head.units_per_em = units_per_em;
    // A small bbox that matches our "advance-based" layout (no outlines anyway)
    head.x_min = 0;
    head.y_min = -200;
    head.x_max = advance as i16;
    head.y_max = 800;
    // Use the loca format from the builder
    head.index_to_loc_format = if loca_format == write_fonts::tables::loca::LocaFormat::Long {
        1
    } else {
        0
    };

    // Hhea table
    let hhea = Hhea::new(
        800.into(),              // ascender
        (-200).into(),           // descender
        200.into(),              // line_gap
        advance.into(),          // advance_width_max (use our single advance)
        0.into(),                // min_left_side_bearing
        0.into(),                // min_right_side_bearing
        (advance as i16).into(), // x_max_extent
        1,                       // caret_slope_rise
        0,                       // caret_slope_run
        0,                       // caret_offset
        2,                       // number_of_h_metrics (we have two hMetrics entries)
    );

    let maxp = Maxp::new(2); // num_glyphs = 2

    // OS/2 table - create a basic one
    let mut os2 = Os2::default();
    os2.us_win_ascent = 800;
    os2.us_win_descent = 200;
    os2.s_typo_ascender = 800;
    os2.s_typo_descender = -200;
    os2.s_typo_line_gap = 200;
    os2.us_weight_class = 400; // Regular weight
    os2.us_width_class = 5; // Normal width

    // Name table - use simple string constants for name IDs
    let mut name = Name::default();
    let add = |name: &mut Name, name_id: u16, s: &str| {
        name.name_record.push(NameRecord::new(
            3,              // Windows platform
            1,              // Unicode BMP encoding
            0x0409,         // English (United States)
            name_id.into(), // Convert u16 to the appropriate type
            s.to_string().into(),
        ));
    };
    add(&mut name, 1, "PNG Emoji Demo"); // Family name
    add(&mut name, 2, "Regular"); // Subfamily name
    add(&mut name, 4, "PNG Emoji Demo Regular"); // Full name

    let post = Post::default();

    // --- 7) Assemble and write
    let mut builder = FontBuilder::new();
    builder.add_table(&head)?;
    builder.add_table(&hhea)?;
    builder.add_table(&maxp)?;
    builder.add_table(&os2)?;
    builder.add_table(&hmtx)?;
    builder.add_table(&name)?;
    builder.add_table(&cmap)?;
    builder.add_table(&glyf)?;
    builder.add_table(&loca)?;
    builder.add_table(&post)?;

    // Add the SBIX table
    builder.add_table(&sbix)?;

    let bytes = builder.build();
    fs::write(Path::new("emoji-demo.ttf"), bytes)?;
    println!("Wrote emoji-demo.ttf");
    Ok(())
}
