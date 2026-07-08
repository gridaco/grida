//! ENG-5.1 · the journal records issued ops in order with their results
//! (errors included) and can report whether anything wrote since a mark —
//! the "keep or drop the undo snapshot" test a gesture uses.

use anchor_engine::journal::Journal;
use anchor_lab::ops::{Op, OpError};

#[test]
fn records_ops_in_order_with_results() {
    let mut j = Journal::new();
    assert!(j.is_empty());

    j.record(Op::SetX { id: 1, value: 5.0 }, Ok(1));
    let after_first = j.len();
    j.record(
        Op::SetWidth { id: 1, value: -3.0 },
        Err(OpError::NegativeExtent),
    );

    assert_eq!(j.len(), 2);
    let ops: Vec<_> = j.ops().cloned().collect();
    assert_eq!(
        ops,
        vec![
            Op::SetX { id: 1, value: 5.0 },
            Op::SetWidth { id: 1, value: -3.0 }
        ]
    );

    // Only the errored op followed `after_first` — nothing wrote since.
    assert!(!j.wrote_since(after_first));
    // From the start, the first op wrote.
    assert!(j.wrote_since(0));
}
