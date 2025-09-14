use cg::vectornetwork::*;

#[test]
fn vector_network_into_path_handles_multiple_shapes() {
    let vertices = vec![
        (10.0, 10.0),
        (60.0, 10.0),
        (60.0, 60.0),
        (10.0, 60.0),
        (80.0, 10.0),
        (130.0, 10.0),
        (130.0, 60.0),
        (80.0, 60.0),
    ];

    let segments = vec![
        VectorNetworkSegment::ab(0, 1),
        VectorNetworkSegment::ab(1, 2),
        VectorNetworkSegment::ab(2, 3),
        VectorNetworkSegment::ab(3, 0),
        VectorNetworkSegment::ab(4, 5),
        VectorNetworkSegment::ab(5, 6),
        VectorNetworkSegment::ab(6, 7),
        VectorNetworkSegment::ab(7, 4),
    ];

    let vn = VectorNetwork {
        vertices,
        segments,
        regions: vec![],
    };
    let path: skia_safe::Path = vn.into();

    let mut iter = skia_safe::path::Iter::new(&path, false);
    let mut move_count = 0;
    while let Some((verb, _)) = iter.next() {
        if verb == skia_safe::path::Verb::Move {
            move_count += 1;
        }
    }
    assert_eq!(move_count, 2);
}
