use cg::shape::vn::{VectorNetwork, VectorNetworkSegment};

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
        VectorNetworkSegment {
            a: 0,
            b: 1,
            ta: None,
            tb: None,
        },
        VectorNetworkSegment {
            a: 1,
            b: 2,
            ta: None,
            tb: None,
        },
        VectorNetworkSegment {
            a: 2,
            b: 3,
            ta: None,
            tb: None,
        },
        VectorNetworkSegment {
            a: 3,
            b: 0,
            ta: None,
            tb: None,
        },
        VectorNetworkSegment {
            a: 4,
            b: 5,
            ta: None,
            tb: None,
        },
        VectorNetworkSegment {
            a: 5,
            b: 6,
            ta: None,
            tb: None,
        },
        VectorNetworkSegment {
            a: 6,
            b: 7,
            ta: None,
            tb: None,
        },
        VectorNetworkSegment {
            a: 7,
            b: 4,
            ta: None,
            tb: None,
        },
    ];

    let vn = VectorNetwork { vertices, segments };
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
