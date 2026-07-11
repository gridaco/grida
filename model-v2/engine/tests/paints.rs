//! Focused data and raster-probe coverage for ordered Grida paint stacks.
//! Native `.grida.xml` has no independent visual oracle, so these are not
//! reftests: model/order is asserted as data and rendering at stable interior
//! points is asserted with probes.

mod support;

use anchor_engine::drawlist::ItemKind;
use anchor_engine::paint::PaintCtx;
use anchor_lab::model::Paint;
use support::render_xml as render;

#[test]
fn drawlist_keeps_visible_paints_in_bottom_to_top_order() {
    let source = r##"
<grida version="0"><container width="40" height="40"><rect width="40" height="40"><fill>
  <solid color="#FF0000"/>
  <solid color="#0000FF" visible="false"/>
  <solid color="#00FF00" opacity="0"/>
  <gradient kind="linear"><stop offset="0" color="#000000"/><stop offset="1" color="#FFFFFF"/></gradient>
</fill></rect></container></grida>
"##;
    let (_, list) = render(source, 40, 40, &PaintCtx::new(None));
    let paints = list
        .items
        .iter()
        .find_map(|item| match &item.kind {
            ItemKind::RectFill { paints, .. } => Some(paints),
            _ => None,
        })
        .expect("rect fill item");
    assert_eq!(paints.len(), 2);
    assert!(matches!(paints[0], Paint::Solid(_)));
    assert!(matches!(paints[1], Paint::LinearGradient(_)));
}

#[test]
fn later_paints_composite_above_earlier_paints() {
    let source = r##"
<grida version="0"><container width="100" height="50">
  <rect x="5" y="5" width="40" height="40"><fill>
    <solid color="#FF0000"/>
    <solid color="#0000FF" opacity="0.5"/>
  </fill></rect>
  <rect x="55" y="5" width="40" height="40"><fill>
    <solid color="#0000FF" opacity="0.5"/>
    <solid color="#FF0000"/>
  </fill></rect>
</container></grida>
"##;
    let (image, _) = render(source, 100, 50, &PaintCtx::new(None));
    let blue_over_red = image.at(25, 25);
    assert!((127..=128).contains(&blue_over_red[0]), "{blue_over_red:?}");
    assert_eq!(blue_over_red[1], 0);
    assert!((127..=128).contains(&blue_over_red[2]), "{blue_over_red:?}");
    assert_eq!(image.at(75, 25), [255, 0, 0, 255]);
}

#[test]
fn bottom_blend_mode_does_not_leak_into_later_paints() {
    let source = r##"
<grida version="0"><container width="40" height="40">
  <fill><solid color="#808080"/></fill>
  <rect width="40" height="40"><fill>
    <solid color="#FF0000" blend-mode="multiply"/>
    <solid color="#0000FF" opacity="0.5"/>
  </fill></rect>
</container></grida>
"##;
    let (image, _) = render(source, 40, 40, &PaintCtx::new(None));
    let pixel = image.at(20, 20);
    assert!((63..=64).contains(&pixel[0]), "{pixel:?}");
    assert_eq!(pixel[1], 0);
    assert!((127..=128).contains(&pixel[2]), "{pixel:?}");
}

#[test]
fn linear_and_radial_gradients_use_the_local_unit_box() {
    let source = r##"
<grida version="0"><container width="100" height="150">
  <rect width="100" height="40"><fill><gradient kind="linear" from="0 0.5" to="1 0.5">
    <stop offset="0" color="#FF0000"/><stop offset="1" color="#0000FF"/>
  </gradient></fill></rect>
  <rect y="50" width="100" height="100"><fill><gradient kind="radial">
    <stop offset="0" color="#FFFFFF"/><stop offset="1" color="#000000"/>
  </gradient></fill></rect>
</container></grida>
"##;
    let (image, _) = render(source, 100, 150, &PaintCtx::new(None));
    let left = image.at(5, 20);
    let right = image.at(95, 20);
    assert!(left[0] > left[2], "left={left:?}");
    assert!(right[2] > right[0], "right={right:?}");

    let center = image.at(50, 100);
    let edge = image.at(2, 100);
    assert!(center[0] > edge[0], "center={center:?} edge={edge:?}");
}

#[test]
fn gradient_opacity_modulates_only_its_paint() {
    let source = r##"
<grida version="0"><container width="40" height="40"><fill><solid color="#000000"/></fill>
  <rect width="40" height="40"><fill><gradient kind="linear" opacity="0.5">
    <stop offset="0" color="#FFFFFF"/><stop offset="1" color="#FFFFFF"/>
  </gradient></fill></rect>
</container></grida>
"##;
    let (image, _) = render(source, 40, 40, &PaintCtx::new(None));
    let pixel = image.at(20, 20);
    for channel in &pixel[..3] {
        assert!((127..=128).contains(channel), "{pixel:?}");
    }
    assert_eq!(pixel[3], 255);
}

#[test]
fn gradient_transform_is_composed_in_unit_space_before_box_scale() {
    let source = r##"
<grida version="0"><container width="100" height="90">
  <rect width="100" height="40"><fill><gradient kind="linear" transform="0.5 0 0 1 0.5 0">
    <stop offset="0" color="#FF0000"/><stop offset="1" color="#0000FF"/>
  </gradient></fill></rect>
  <rect y="50" width="100" height="40"><fill><gradient kind="linear" from="0.5 0.5" to="1 0.5">
    <stop offset="0" color="#FF0000"/><stop offset="1" color="#0000FF"/>
  </gradient></fill></rect>
</container></grida>
"##;
    let (image, _) = render(source, 100, 90, &PaintCtx::new(None));
    for x in [10, 49, 60, 75, 95] {
        assert_eq!(
            image.at(x, 20),
            image.at(x, 70),
            "unit-space transform diverged at x={x}"
        );
    }
}

#[test]
fn linear_gradient_tile_modes_have_distinct_outside_domain_behavior() {
    let source = r##"
<grida version="0"><container width="100" height="80"><fill><solid color="#00FF00"/></fill>
  <rect width="100" height="20"><fill><gradient kind="linear" from="0.25 0.5" to="0.75 0.5">
    <stop offset="0" color="#FF0000"/><stop offset="1" color="#0000FF"/>
  </gradient></fill></rect>
  <rect y="20" width="100" height="20"><fill><gradient kind="linear" from="0.25 0.5" to="0.75 0.5" tile-mode="repeated">
    <stop offset="0" color="#FF0000"/><stop offset="1" color="#0000FF"/>
  </gradient></fill></rect>
  <rect y="40" width="100" height="20"><fill><gradient kind="linear" from="0.25 0.5" to="0.75 0.5" tile-mode="mirror">
    <stop offset="0" color="#FF0000"/><stop offset="1" color="#0000FF"/>
  </gradient></fill></rect>
  <rect y="60" width="100" height="20"><fill><gradient kind="linear" from="0.25 0.5" to="0.75 0.5" tile-mode="decal">
    <stop offset="0" color="#FF0000"/><stop offset="1" color="#0000FF"/>
  </gradient></fill></rect>
</container></grida>
"##;
    let (image, _) = render(source, 100, 80, &PaintCtx::new(None));
    let clamp = image.at(12, 10);
    let repeated = image.at(12, 30);
    let mirror = image.at(12, 50);
    let decal = image.at(12, 70);
    assert!(clamp[0] > 248 && clamp[2] < 8, "clamp={clamp:?}");
    assert!(repeated[2] > repeated[0], "repeated={repeated:?}");
    assert!(mirror[0] > mirror[2], "mirror={mirror:?}");
    assert_eq!(decal, [0, 255, 0, 255]);
}

#[test]
fn paint_visibility_and_blend_mode_are_per_entry() {
    let source = r##"
<grida version="0"><container width="100" height="40">
  <rect width="40" height="40"><fill>
    <solid color="#00FF00"/>
    <solid color="#FF0000" visible="false"/>
  </fill></rect>
  <rect x="60" width="40" height="40"><fill>
    <solid color="#FFFF00"/>
    <solid color="#0000FF" blend-mode="multiply"/>
  </fill></rect>
</container></grida>
"##;
    let (image, _) = render(source, 100, 40, &PaintCtx::new(None));
    assert_eq!(image.at(20, 20), [0, 255, 0, 255]);
    let multiplied = image.at(80, 20);
    assert!(
        multiplied[0] < 8 && multiplied[1] < 8 && multiplied[2] < 8,
        "{multiplied:?}"
    );
}

#[test]
fn sweep_and_diamond_gradient_shader_paths_render() {
    let source = r##"
<grida version="0"><container width="130" height="60">
  <rect width="60" height="60"><fill><gradient kind="sweep">
    <stop offset="0" color="#FF0000"/><stop offset="0.5" color="#00FF00"/><stop offset="1" color="#FF0000"/>
  </gradient></fill></rect>
  <rect x="70" width="60" height="60"><fill><gradient kind="diamond">
    <stop offset="0" color="#FFFFFF"/><stop offset="1" color="#000000"/>
  </gradient></fill></rect>
</container></grida>
"##;
    let (image, _) = render(source, 130, 60, &PaintCtx::new(None));
    assert_ne!(image.at(45, 30), image.at(30, 45));
    let center = image.at(100, 30);
    let edge = image.at(72, 30);
    assert!(center[0] > edge[0], "center={center:?} edge={edge:?}");
}

#[test]
fn image_fit_is_resolved_from_host_resources() {
    const RID: &str = "fixture://border-diamonds";
    const IMAGE: &[u8] = include_bytes!("../../../fixtures/images/border-diamonds.png");
    let source = format!(
        r##"
<grida version="0"><container width="370" height="90">
  <rect width="180" height="90"><fill><solid color="#00FF00"/><image src="{RID}" fit="contain"/></fill></rect>
  <rect x="190" width="180" height="90"><fill><solid color="#00FF00"/><image src="{RID}" fit="cover"/></fill></rect>
</container></grida>
"##
    );
    let mut ctx = PaintCtx::new(None);
    ctx.insert_encoded(RID, IMAGE).unwrap();
    let (image, _) = render(&source, 370, 90, &ctx);
    assert_eq!(image.at(10, 45), [0, 255, 0, 255]);
    assert_ne!(image.at(200, 45), [0, 255, 0, 255]);
}
