use std::collections::HashMap;

use ttf_parser::{Face, Tag};

/// Represents a single variation axis from the `fvar` table.
#[derive(Debug, Clone)]
pub struct FvarAxis {
    pub tag: String,
    pub min: f32,
    pub def: f32,
    pub max: f32,
    pub flags: u16,
    pub name: String,
}

/// Represents a named instance from the `fvar` table.
#[derive(Debug, Clone)]
pub struct FvarInstance {
    pub name: String,
    pub coordinates: HashMap<String, f32>,
    pub flags: u16,
    pub postscript_name: Option<String>,
}

/// Parsed data from the `fvar` table.
#[derive(Debug, Clone, Default)]
pub struct FvarData {
    pub axes: HashMap<String, FvarAxis>,
    pub instances: Vec<FvarInstance>,
}

/// Represents an axis record in the `STAT` table.
#[derive(Debug, Clone)]
pub struct StatAxisValue {
    pub name: String,
    pub value: f32,
    pub linked_value: Option<f32>,
    pub range_min_value: Option<f32>,
    pub range_max_value: Option<f32>,
}

#[derive(Debug, Clone)]
pub struct StatAxis {
    pub tag: String,
    pub name: String,
    pub values: Vec<StatAxisValue>,
}

#[derive(Debug, Clone)]
pub struct StatCombination {
    pub name: String,
    pub values: Vec<(String, f32)>,
}

#[derive(Debug, Clone, Default)]
pub struct StatData {
    pub axes: Vec<StatAxis>,
    pub combinations: Vec<StatCombination>,
    pub elided_fallback_name: Option<String>,
}

/// Font metadata parser backed by `ttf-parser`.
pub struct Parser<'a> {
    face: Face<'a>,
}

impl<'a> Parser<'a> {
    /// Creates a new parser from raw font data.
    pub fn new(data: &'a [u8]) -> Result<Self, ttf_parser::FaceParsingError> {
        let face = Face::parse(data, 0)?;
        Ok(Self { face })
    }

    /// Parses the `fvar` table, returning variation axes and named instances.
    pub fn fvar(&self) -> FvarData {
        let table = match self.face.raw_face().table(Tag::from_bytes(b"fvar")) {
            Some(t) => t,
            None => return FvarData::default(),
        };
        parse_fvar(&self.face, table)
    }

    /// Parses the `STAT` table providing axis values and combinations.
    pub fn stat(&self) -> StatData {
        let table = match self.face.raw_face().table(Tag::from_bytes(b"STAT")) {
            Some(t) => t,
            None => return StatData::default(),
        };
        parse_stat(&self.face, table)
    }
}

fn parse_fvar(face: &Face<'_>, data: &[u8]) -> FvarData {
    if data.len() < 16 {
        return FvarData::default();
    }
    let axis_offset = be_u16(data, 4) as usize;
    let axis_count = be_u16(data, 8) as usize;
    let axis_size = be_u16(data, 10) as usize;
    let instance_count = be_u16(data, 12) as usize;
    let instance_size = be_u16(data, 14) as usize;

    let mut axes: HashMap<String, FvarAxis> = HashMap::new();
    let mut axis_tags: Vec<String> = Vec::new();

    for i in 0..axis_count {
        let off = axis_offset + i * axis_size;
        if off + axis_size > data.len() {
            break;
        }
        let tag = tag_to_string(&data[off..off + 4]);
        let min = be_fixed(data, off + 4);
        let def = be_fixed(data, off + 8);
        let max = be_fixed(data, off + 12);
        let flags = be_u16(data, off + 16);
        let name_id = be_u16(data, off + 18);
        let name = lookup_name(face, name_id).unwrap_or_default();
        axis_tags.push(tag.clone());
        axes.insert(
            tag.clone(),
            FvarAxis {
                tag,
                min,
                def,
                max,
                flags,
                name,
            },
        );
    }

    let mut instances: Vec<FvarInstance> = Vec::new();
    let mut inst_off = axis_offset + axis_count * axis_size;
    for _ in 0..instance_count {
        if inst_off + instance_size > data.len() {
            break;
        }
        let name_id = be_u16(data, inst_off);
        let flags = be_u16(data, inst_off + 2);
        let mut coords = HashMap::new();
        let mut coord_off = inst_off + 4;
        for tag in &axis_tags {
            if coord_off + 4 > data.len() {
                break;
            }
            let v = be_fixed(data, coord_off);
            coords.insert(tag.clone(), v);
            coord_off += 4;
        }
        let mut postscript_name = None;
        if instance_size >= 4 + axis_tags.len() * 4 + 2 {
            let ps_id = be_u16(data, inst_off + instance_size - 2);
            if ps_id != 0 && ps_id != 0xFFFF {
                postscript_name = lookup_name(face, ps_id);
            }
        }
        let name = lookup_name(face, name_id).unwrap_or_default();
        instances.push(FvarInstance {
            name,
            coordinates: coords,
            flags,
            postscript_name,
        });
        inst_off += instance_size;
    }

    FvarData { axes, instances }
}

fn parse_stat(face: &Face<'_>, data: &[u8]) -> StatData {
    let table = match ttf_parser::stat::Table::parse(data) {
        Some(t) => t,
        None => return StatData::default(),
    };

    let mut axes: Vec<StatAxis> = Vec::new();
    let mut tags: Vec<String> = Vec::new();
    for record in table.axes.clone() {
        let tag = tag_to_string(&record.tag.to_bytes());
        let name = lookup_name(face, record.name_id).unwrap_or_default();
        tags.push(tag.clone());
        axes.push(StatAxis {
            tag,
            name,
            values: Vec::new(),
        });
    }

    let mut combinations: Vec<StatCombination> = Vec::new();
    for sub in table.subtables() {
        match sub {
            ttf_parser::stat::AxisValueSubtable::Format1(v) => {
                if let Some(axis) = axes.get_mut(v.axis_index as usize) {
                    let name = lookup_name(face, v.value_name_id).unwrap_or_default();
                    axis.values.push(StatAxisValue {
                        name,
                        value: v.value.0,
                        linked_value: None,
                        range_min_value: None,
                        range_max_value: None,
                    });
                }
            }
            ttf_parser::stat::AxisValueSubtable::Format2(v) => {
                if let Some(axis) = axes.get_mut(v.axis_index as usize) {
                    let name = lookup_name(face, v.value_name_id).unwrap_or_default();
                    axis.values.push(StatAxisValue {
                        name,
                        value: v.nominal_value.0,
                        linked_value: None,
                        range_min_value: Some(v.range_min_value.0),
                        range_max_value: Some(v.range_max_value.0),
                    });
                }
            }
            ttf_parser::stat::AxisValueSubtable::Format3(v) => {
                if let Some(axis) = axes.get_mut(v.axis_index as usize) {
                    let name = lookup_name(face, v.value_name_id).unwrap_or_default();
                    axis.values.push(StatAxisValue {
                        name,
                        value: v.value.0,
                        linked_value: Some(v.linked_value.0),
                        range_min_value: None,
                        range_max_value: None,
                    });
                }
            }
            ttf_parser::stat::AxisValueSubtable::Format4(v) => {
                let name = lookup_name(face, v.value_name_id).unwrap_or_default();
                let mut values = Vec::new();
                for av in v.values {
                    if let Some(tag) = tags.get(av.axis_index as usize) {
                        values.push((tag.clone(), av.value.0));
                    }
                }
                combinations.push(StatCombination { name, values });
            }
        }
    }

    let elided_fallback_name = table.fallback_name_id.and_then(|id| lookup_name(face, id));

    StatData {
        axes,
        combinations,
        elided_fallback_name,
    }
}

fn lookup_name(face: &Face<'_>, id: u16) -> Option<String> {
    face.names()
        .into_iter()
        .find(|n| n.name_id == id && n.is_unicode())
        .and_then(|n| n.to_string())
}

fn tag_to_string(bytes: &[u8]) -> String {
    std::str::from_utf8(bytes).unwrap_or("").to_string()
}

fn be_u16(data: &[u8], offset: usize) -> u16 {
    let b = [data[offset], data[offset + 1]];
    u16::from_be_bytes(b)
}

fn be_fixed(data: &[u8], offset: usize) -> f32 {
    let b = [
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ];
    let v = i32::from_be_bytes(b);
    v as f32 / 65536.0
}
