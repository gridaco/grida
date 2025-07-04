use math2::{plot_distribution_geometry, DistributionGeometry1D, Range, SnapProjectionPoint};

fn range(a: f32, b: f32) -> Range {
    [a, b]
}

#[test]
fn empty_loops_when_no_gap() {
    let ranges = vec![range(0.0, 10.0), range(5.0, 15.0)];
    let result = plot_distribution_geometry(&ranges, None);
    assert!(result.loops.is_empty());
    assert!(result.gaps.is_empty());
    assert!(result.a.is_empty());
    assert!(result.b.is_empty());
}

#[test]
fn single_gap_non_overlapping() {
    let ranges = vec![range(0.0, 10.0), range(20.0, 30.0)];
    let result = plot_distribution_geometry(&ranges, None);
    assert_eq!(result.loops, vec![[0, 1]]);
    assert_eq!(result.gaps, vec![10.0]);
    assert_eq!(
        result.a[0],
        vec![SnapProjectionPoint {
            p: 40.0,
            o: 30.0,
            fwd: 0
        }]
    );
    assert_eq!(
        result.b[0],
        vec![SnapProjectionPoint {
            p: -10.0,
            o: 0.0,
            fwd: 0
        }]
    );
}

#[test]
fn multiple_loops_more_ranges() {
    let ranges = vec![range(0.0, 10.0), range(20.0, 30.0), range(40.0, 50.0)];
    let result = plot_distribution_geometry(&ranges, None);
    assert_eq!(result.loops.len(), 3);
    assert_eq!(result.gaps.len(), 3);
    assert_eq!(result.a.len(), 3);
    assert_eq!(result.b.len(), 3);
}

#[test]
fn center_based_when_agent_smaller_than_gap() {
    let ranges = vec![range(0.0, 10.0), range(20.0, 30.0)];
    let result = plot_distribution_geometry(&ranges, Some(5.0));
    assert_eq!(result.a[0].len(), 2);
    assert_eq!(result.b[0].len(), 2);
    let center_a = result.a[0][1];
    let center_b = result.b[0][1];
    assert_eq!(center_a.fwd, -1);
    assert_eq!(center_b.fwd, -1);
}

#[test]
fn skip_center_based_when_agent_ge_gap() {
    let ranges = vec![range(0.0, 10.0), range(20.0, 30.0)];
    let result = plot_distribution_geometry(&ranges, Some(10.0));
    assert_eq!(result.a[0].len(), 1);
    assert_eq!(result.b[0].len(), 1);
}

#[test]
fn sizes_match_complex_inputs() {
    let ranges = vec![
        range(0.0, 15.0),
        range(10.0, 25.0),
        range(25.0, 30.0),
        range(40.0, 55.0),
        range(50.0, 65.0),
        range(80.0, 95.0),
        range(150.0, 165.0),
    ];
    let result = plot_distribution_geometry(&ranges, Some(10.0));
    assert_eq!(result.loops.len(), result.a.len());
    assert_eq!(result.loops.len(), result.b.len());
    for i in 0..result.loops.len() {
        assert!(result.a.get(i).is_some());
        assert!(result.b.get(i).is_some());
    }
    assert_eq!(result.loops.len(), result.gaps.len());
}
