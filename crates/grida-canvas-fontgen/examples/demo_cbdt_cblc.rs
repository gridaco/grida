use grida_canvas_fontgen::fontgen::png_processor::PngInfo;
use grida_canvas_fontgen::{CbdtGenerator, CblcGenerator, PngProcessor};
use std::fs;

static EMOJI_PNG: &[u8] = include_bytes!("emoji.png");

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Process the PNG to get PngInfo
    let png_info = PngProcessor::process_png(EMOJI_PNG)?;

    // Generate CBDT and CBLC tables using the custom generators
    let cbdt_data = CbdtGenerator::generate_cbdt(&[png_info.clone()])?;
    let cblc_data = CblcGenerator::generate_cblc(&[png_info])?;

    // Create a minimal TTF structure manually
    let mut ttf_data = Vec::new();

    // TTF header (12 bytes)
    let num_tables = 7u16; // CBDT, CBLC, cmap, name, OS/2, post, head
    let search_range = 16u16; // 2^4 = 16
    let entry_selector = 4u16; // log2(16)
    let range_shift = 0u16; // num_tables * 16 - search_range

    ttf_data.extend_from_slice(&[0x00, 0x01, 0x00, 0x00]); // sfntVersion (TTF)
    ttf_data.extend_from_slice(&num_tables.to_be_bytes());
    ttf_data.extend_from_slice(&search_range.to_be_bytes());
    ttf_data.extend_from_slice(&entry_selector.to_be_bytes());
    ttf_data.extend_from_slice(&range_shift.to_be_bytes());

    // Table directory entries
    let mut current_offset = 12 + (num_tables as u32 * 16); // header + table directory

    // CBDT table entry
    let cbdt_checksum = calculate_checksum(&cbdt_data);
    ttf_data.extend_from_slice(b"CBDT");
    ttf_data.extend_from_slice(&cbdt_checksum.to_be_bytes());
    ttf_data.extend_from_slice(&current_offset.to_be_bytes());
    ttf_data.extend_from_slice(&(cbdt_data.len() as u32).to_be_bytes());
    current_offset += cbdt_data.len() as u32;

    // CBLC table entry
    let cblc_checksum = calculate_checksum(&cblc_data);
    ttf_data.extend_from_slice(b"CBLC");
    ttf_data.extend_from_slice(&cblc_checksum.to_be_bytes());
    ttf_data.extend_from_slice(&current_offset.to_be_bytes());
    ttf_data.extend_from_slice(&(cblc_data.len() as u32).to_be_bytes());
    current_offset += cblc_data.len() as u32;

    // Create minimal required tables
    let cmap_data = create_minimal_cmap();
    let name_data = create_minimal_name();
    let os2_data = create_minimal_os2();
    let post_data = create_minimal_post();
    let head_data = create_minimal_head();

    // cmap table entry
    let cmap_checksum = calculate_checksum(&cmap_data);
    ttf_data.extend_from_slice(b"cmap");
    ttf_data.extend_from_slice(&cmap_checksum.to_be_bytes());
    ttf_data.extend_from_slice(&current_offset.to_be_bytes());
    ttf_data.extend_from_slice(&(cmap_data.len() as u32).to_be_bytes());
    current_offset += cmap_data.len() as u32;

    // name table entry
    let name_checksum = calculate_checksum(&name_data);
    ttf_data.extend_from_slice(b"name");
    ttf_data.extend_from_slice(&name_checksum.to_be_bytes());
    ttf_data.extend_from_slice(&current_offset.to_be_bytes());
    ttf_data.extend_from_slice(&(name_data.len() as u32).to_be_bytes());
    current_offset += name_data.len() as u32;

    // OS/2 table entry
    let os2_checksum = calculate_checksum(&os2_data);
    ttf_data.extend_from_slice(b"OS/2");
    ttf_data.extend_from_slice(&os2_checksum.to_be_bytes());
    ttf_data.extend_from_slice(&current_offset.to_be_bytes());
    ttf_data.extend_from_slice(&(os2_data.len() as u32).to_be_bytes());
    current_offset += os2_data.len() as u32;

    // post table entry
    let post_checksum = calculate_checksum(&post_data);
    ttf_data.extend_from_slice(b"post");
    ttf_data.extend_from_slice(&post_checksum.to_be_bytes());
    ttf_data.extend_from_slice(&current_offset.to_be_bytes());
    ttf_data.extend_from_slice(&(post_data.len() as u32).to_be_bytes());
    current_offset += post_data.len() as u32;

    // head table entry
    let head_checksum = calculate_checksum(&head_data);
    ttf_data.extend_from_slice(b"head");
    ttf_data.extend_from_slice(&head_checksum.to_be_bytes());
    ttf_data.extend_from_slice(&current_offset.to_be_bytes());
    ttf_data.extend_from_slice(&(head_data.len() as u32).to_be_bytes());

    // Write table data
    ttf_data.extend_from_slice(&cbdt_data);
    ttf_data.extend_from_slice(&cblc_data);
    ttf_data.extend_from_slice(&cmap_data);
    ttf_data.extend_from_slice(&name_data);
    ttf_data.extend_from_slice(&os2_data);
    ttf_data.extend_from_slice(&post_data);
    ttf_data.extend_from_slice(&head_data);

    // Write the TTF file
    fs::write("emoji-cbdt.ttf", &ttf_data)?;
    println!("Wrote emoji-cbdt.ttf");

    // Verify with ttx
    println!("Verifying with ttx...");
    let output = std::process::Command::new("ttx")
        .args(["-t", "CBLC", "-t", "CBDT", "emoji-cbdt.ttf"])
        .output()?;

    if output.status.success() {
        println!("TTX verification successful!");
        println!("CBLC/CBDT tables found in the generated TTF");
        println!("TTX output:");
        println!("{}", String::from_utf8_lossy(&output.stdout));
    } else {
        println!("TTX verification failed:");
        println!("{}", String::from_utf8_lossy(&output.stderr));
    }

    Ok(())
}

fn calculate_checksum(data: &[u8]) -> u32 {
    let mut sum = 0u32;
    let mut i = 0;
    while i < data.len() {
        let mut value = 0u32;
        if i < data.len() {
            value |= (data[i] as u32) << 24;
        }
        if i + 1 < data.len() {
            value |= (data[i + 1] as u32) << 16;
        }
        if i + 2 < data.len() {
            value |= (data[i + 2] as u32) << 8;
        }
        if i + 3 < data.len() {
            value |= data[i + 3] as u32;
        }
        sum = sum.wrapping_add(value);
        i += 4;
    }
    sum
}

fn create_minimal_cmap() -> Vec<u8> {
    let mut data = Vec::new();

    // Format 4 cmap table (most compatible)
    data.extend_from_slice(&[0x00, 0x04]); // format
    data.extend_from_slice(&[0x00, 0x00]); // length (placeholder)
    data.extend_from_slice(&[0x00, 0x00]); // language
    data.extend_from_slice(&[0x00, 0x00]); // segCountX2 (placeholder)
    data.extend_from_slice(&[0x00, 0x00]); // searchRange (placeholder)
    data.extend_from_slice(&[0x00, 0x00]); // entrySelector (placeholder)
    data.extend_from_slice(&[0x00, 0x00]); // rangeShift (placeholder)

    // For now, just add minimal structure - will be filled in properly later
    data.extend_from_slice(&vec![0u8; 32]);

    data
}

fn create_minimal_name() -> Vec<u8> {
    let mut data = Vec::new();

    // Name table header
    data.extend_from_slice(&[0x00, 0x00]); // format
    data.extend_from_slice(&[0x00, 0x01]); // count
    data.extend_from_slice(&[0x00, 0x06]); // stringOffset

    // Name record
    data.extend_from_slice(&[0x00, 0x03]); // platformID (Windows)
    data.extend_from_slice(&[0x00, 0x01]); // encodingID (Unicode BMP)
    data.extend_from_slice(&[0x04, 0x09]); // languageID (English US)
    data.extend_from_slice(&[0x00, 0x01]); // nameID (Family name)
    data.extend_from_slice(&[0x00, 0x0C]); // length
    data.extend_from_slice(&[0x00, 0x00]); // offset

    // String data
    data.extend_from_slice(b"CBDT Emoji Demo");

    data
}

fn create_minimal_os2() -> Vec<u8> {
    let mut data = Vec::new();

    // OS/2 table version 1
    data.extend_from_slice(&[0x00, 0x01]); // version
    data.extend_from_slice(&[0x00, 0x00]); // xAvgCharWidth
    data.extend_from_slice(&[0x01, 0x90]); // usWeightClass (400)
    data.extend_from_slice(&[0x00, 0x05]); // usWidthClass (5)
    data.extend_from_slice(&[0x00, 0x00]); // fsType
    data.extend_from_slice(&[0x01, 0x90]); // ySubscriptXSize
    data.extend_from_slice(&[0x01, 0x90]); // ySubscriptYSize
    data.extend_from_slice(&[0x00, 0x00]); // ySubscriptXOffset
    data.extend_from_slice(&[0x00, 0x00]); // ySubscriptYOffset
    data.extend_from_slice(&[0x01, 0x90]); // ySuperscriptXSize
    data.extend_from_slice(&[0x01, 0x90]); // ySuperscriptYSize
    data.extend_from_slice(&[0x00, 0x00]); // ySuperscriptXOffset
    data.extend_from_slice(&[0x00, 0x00]); // ySuperscriptYOffset
    data.extend_from_slice(&[0x00, 0x00]); // yStrikeoutSize
    data.extend_from_slice(&[0x00, 0x00]); // yStrikeoutPosition
    data.extend_from_slice(&[0x00, 0x00]); // sFamilyClass
    data.extend_from_slice(&[0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // panose
    data.extend_from_slice(&[
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00,
    ]); // ulUnicodeRange
    data.extend_from_slice(&[
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00,
    ]); // ulCodePageRange
    data.extend_from_slice(&[0x00, 0x00]); // sxHeight
    data.extend_from_slice(&[0x00, 0x00]); // sCapHeight
    data.extend_from_slice(&[0x00, 0x00]); // usDefaultChar
    data.extend_from_slice(&[0x00, 0x00]); // usBreakChar
    data.extend_from_slice(&[0x00, 0x00]); // usMaxContext

    data
}

fn create_minimal_post() -> Vec<u8> {
    let mut data = Vec::new();

    // Post table version 3.0
    data.extend_from_slice(&[0x00, 0x03, 0x00, 0x00]); // version
    data.extend_from_slice(&[0x00, 0x00, 0x00, 0x00]); // italicAngle
    data.extend_from_slice(&[0x00, 0x00]); // underlinePosition
    data.extend_from_slice(&[0x00, 0x00]); // underlineThickness
    data.extend_from_slice(&[0x00, 0x00, 0x00, 0x00]); // isFixedPitch
    data.extend_from_slice(&[0x00, 0x00, 0x00, 0x00]); // minMemType42
    data.extend_from_slice(&[0x00, 0x00, 0x00, 0x00]); // maxMemType42
    data.extend_from_slice(&[0x00, 0x00, 0x00, 0x00]); // minMemType1
    data.extend_from_slice(&[0x00, 0x00, 0x00, 0x00]); // maxMemType1

    data
}

fn create_minimal_head() -> Vec<u8> {
    let mut data = Vec::new();

    // Head table
    data.extend_from_slice(&[0x00, 0x01, 0x00, 0x00]); // version
    data.extend_from_slice(&[0x00, 0x01, 0x00, 0x00]); // fontRevision
    data.extend_from_slice(&[0x00, 0x00, 0x00, 0x00]); // checksumAdjustment
    data.extend_from_slice(&[0x5F, 0x0F, 0x3C, 0xF5]); // magicNumber
    data.extend_from_slice(&[0x00, 0x01]); // flags
    data.extend_from_slice(&[0x03, 0xE8]); // unitsPerEm (1000)
    data.extend_from_slice(&[0x00, 0x00, 0x00, 0x00]); // created
    data.extend_from_slice(&[0x00, 0x00, 0x00, 0x00]); // modified
    data.extend_from_slice(&[0x00, 0x00]); // xMin
    data.extend_from_slice(&[0x00, 0x00]); // yMin
    data.extend_from_slice(&[0x03, 0xE8]); // xMax (1000)
    data.extend_from_slice(&[0x03, 0x20]); // yMax (800)
    data.extend_from_slice(&[0x00, 0x00]); // macStyle
    data.extend_from_slice(&[0x00, 0x00]); // lowestRecPPEM
    data.extend_from_slice(&[0x00, 0x00]); // fontDirectionHint
    data.extend_from_slice(&[0x00, 0x00]); // indexToLocFormat
    data.extend_from_slice(&[0x00, 0x00]); // glyphDataFormat

    data
}
