use grida_cmath::{Range, group_ranges_by_uniform_gap};

fn r(a: f32, b: f32) -> Range {
    [a, b]
}

#[test]
fn group_three_uniform_gaps() {
    let ranges = vec![r(0.0, 10.0), r(15.0, 25.0), r(30.0, 40.0)];
    let result = group_ranges_by_uniform_gap(&ranges, None, 0.0);
    assert!(result.contains(&grida_cmath::range::UniformGapGroup {
        loop_indices: vec![0, 1, 2],
        min: 0.0,
        max: 40.0,
        gap: 5.0
    }));
}
