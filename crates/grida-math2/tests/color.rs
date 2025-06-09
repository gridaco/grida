use grida_cmath::{
    RGBA8888, RGBAf, hex_to_rgba8888, rgba_to_unit8_chunk, rgba8888_to_hex, rgbaf_to_rgba8888,
};

#[test]
fn hex_short() {
    let c = hex_to_rgba8888("#F80");
    assert_eq!(
        c,
        RGBA8888 {
            r: 255,
            g: 136,
            b: 0,
            a: 1.0
        }
    );
}

#[test]
fn hex_long() {
    let c = hex_to_rgba8888("#00ff0080");
    assert_eq!(c.r, 0);
    assert_eq!(c.g, 255);
    assert_eq!(c.b, 0);
    assert!((c.a - 0.5019608).abs() < 0.00001);
}

#[test]
fn rgba_to_hex_roundtrip() {
    let c = RGBA8888 {
        r: 10,
        g: 20,
        b: 30,
        a: 0.5,
    };
    let hex = rgba8888_to_hex(c);
    assert_eq!(hex, "#0a141e80");
    let out = hex_to_rgba8888(&hex);
    assert_eq!(out.r, c.r);
    assert_eq!(out.g, c.g);
    assert_eq!(out.b, c.b);
    assert!((out.a - c.a).abs() < 0.01);
}

#[test]
fn rgbaf_conversion() {
    let c = RGBAf {
        r: 1.0,
        g: 0.5,
        b: 0.0,
        a: 0.75,
    };
    let i = rgbaf_to_rgba8888(c);
    assert_eq!(
        i,
        RGBA8888 {
            r: 255,
            g: 128,
            b: 0,
            a: 0.75
        }
    );
    let v = rgba_to_unit8_chunk(i);
    assert_eq!(v, [255.0, 128.0, 0.0, 191.0]);
}
