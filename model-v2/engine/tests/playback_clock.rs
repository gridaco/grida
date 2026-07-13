//! Pure playback-clock laws. No source format, animation program, frame API,
//! renderer, scheduler, or system clock participates in these tests.

use anchor_engine::playback_clock::{
    HostTime, PlaybackClock, PlaybackClockError, PlaybackDirection, PlaybackRange, PlaybackRate,
};
use anchor_lab::animation::SampleTime;

fn host(nanoseconds: u64) -> HostTime {
    HostTime::from_nanoseconds(nanoseconds)
}

fn sample(nanoseconds: i64) -> SampleTime {
    SampleTime::from_nanoseconds(nanoseconds)
}

fn range(start: i64, end: i64) -> PlaybackRange {
    PlaybackRange::new(sample(start), sample(end)).unwrap()
}

#[test]
fn value_types_close_range_rate_and_initial_state() {
    assert!(matches!(
        PlaybackRange::new(sample(1), sample(0)),
        Err(PlaybackClockError::DescendingRange { .. })
    ));
    assert_eq!(range(4, 4).start(), sample(4));
    assert_eq!(range(4, 4).end(), sample(4));

    assert_eq!(
        PlaybackRate::new(0, 1),
        Err(PlaybackClockError::ZeroRateNumerator)
    );
    assert_eq!(
        PlaybackRate::new(1, 0),
        Err(PlaybackClockError::ZeroRateDenominator)
    );
    assert_eq!(
        PlaybackRate::new(6, 8).unwrap(),
        PlaybackRate::new(3, 4).unwrap()
    );

    assert!(matches!(
        PlaybackClock::new(range(-5, 5), sample(6)),
        Err(PlaybackClockError::PositionOutsideRange { .. })
    ));
    let mut clock = PlaybackClock::new(range(-5, 5), sample(-2)).unwrap();
    assert_eq!(clock.range(), range(-5, 5));
    assert_eq!(clock.rate(), PlaybackRate::ONE);
    assert_eq!(clock.direction(), PlaybackDirection::Forward);
    assert!(!clock.is_playing());
    assert_eq!(clock.sample_time(host(u64::MAX)).unwrap(), sample(-2));
}

#[test]
fn dense_and_sparse_observation_are_the_same_clock() {
    let mut dense = PlaybackClock::new(range(0, 100), sample(0)).unwrap();
    let mut sparse = dense;
    dense.play(host(0)).unwrap();
    sparse.play(host(0)).unwrap();

    for now in 1..=10 {
        assert_eq!(dense.sample_time(host(now)).unwrap(), sample(now as i64));
    }
    assert_eq!(sparse.sample_time(host(10)).unwrap(), sample(10));
    assert_eq!(dense, sparse, "intermediate samples must not re-anchor");
}

#[test]
fn endpoint_crossing_and_explicit_reverse_are_cadence_independent() {
    let mut dense = PlaybackClock::new(range(0, 10), sample(0)).unwrap();
    let mut sparse = dense;
    let rate = PlaybackRate::new(3, 2).unwrap();
    dense.set_rate(rate, host(0)).unwrap();
    sparse.set_rate(rate, host(0)).unwrap();
    dense.play(host(0)).unwrap();
    sparse.play(host(0)).unwrap();

    for now in 1..=10 {
        dense.sample_time(host(now)).unwrap();
    }
    assert_eq!(dense.play(host(20)).unwrap(), sample(10));
    assert_eq!(sparse.play(host(20)).unwrap(), sample(10));
    assert_eq!(dense, sparse);
    assert!(!dense.is_playing());

    for clock in [&mut dense, &mut sparse] {
        assert_eq!(
            clock
                .set_direction(PlaybackDirection::Reverse, host(20))
                .unwrap(),
            sample(10)
        );
        assert!(!clock.is_playing());
        clock.play(host(20)).unwrap();
        assert_eq!(clock.sample_time(host(22)).unwrap(), sample(7));
    }
    assert_eq!(dense, sparse);
}

#[test]
fn fractional_rate_and_idempotent_controls_do_not_accumulate_drift() {
    let one_third = PlaybackRate::new(1, 3).unwrap();
    let mut observed = PlaybackClock::new(range(0, 10), sample(0)).unwrap();
    observed.set_rate(one_third, host(0)).unwrap();
    observed.play(host(0)).unwrap();
    assert_eq!(observed.sample_time(host(1)).unwrap(), sample(0));
    assert_eq!(observed.sample_time(host(2)).unwrap(), sample(0));
    assert_eq!(observed.play(host(2)).unwrap(), sample(0));
    assert_eq!(observed.set_rate(one_third, host(2)).unwrap(), sample(0));
    assert_eq!(
        observed
            .set_direction(PlaybackDirection::Forward, host(2))
            .unwrap(),
        sample(0)
    );
    assert_eq!(observed.sample_time(host(3)).unwrap(), sample(1));

    let mut direct = PlaybackClock::new(range(0, 10), sample(0)).unwrap();
    direct.set_rate(one_third, host(0)).unwrap();
    direct.play(host(0)).unwrap();
    assert_eq!(direct.sample_time(host(3)).unwrap(), sample(1));
    assert_eq!(observed, direct);
}

#[test]
fn actual_controls_reanchor_at_the_visible_integer_sample() {
    let one_third = PlaybackRate::new(1, 3).unwrap();

    let mut rate_change = PlaybackClock::new(range(-10, 10), sample(0)).unwrap();
    rate_change.set_rate(one_third, host(0)).unwrap();
    rate_change.play(host(0)).unwrap();
    assert_eq!(rate_change.sample_time(host(2)).unwrap(), sample(0));
    assert_eq!(
        rate_change
            .set_rate(PlaybackRate::new(2, 3).unwrap(), host(2))
            .unwrap(),
        sample(0)
    );
    assert_eq!(rate_change.sample_time(host(3)).unwrap(), sample(0));
    assert_eq!(rate_change.sample_time(host(4)).unwrap(), sample(1));

    let mut direction_change = PlaybackClock::new(range(-10, 10), sample(0)).unwrap();
    direction_change.set_rate(one_third, host(0)).unwrap();
    direction_change.play(host(0)).unwrap();
    assert_eq!(direction_change.sample_time(host(2)).unwrap(), sample(0));
    assert_eq!(
        direction_change
            .set_direction(PlaybackDirection::Reverse, host(2))
            .unwrap(),
        sample(0)
    );
    assert_eq!(direction_change.sample_time(host(3)).unwrap(), sample(0));
    assert_eq!(direction_change.sample_time(host(5)).unwrap(), sample(-1));
}

#[test]
fn pause_resume_and_seek_preserve_only_declared_continuity() {
    let mut clock = PlaybackClock::new(range(-10, 20), sample(0)).unwrap();
    clock
        .set_rate(PlaybackRate::new(2, 1).unwrap(), host(10))
        .unwrap();
    clock.play(host(10)).unwrap();
    assert_eq!(clock.sample_time(host(13)).unwrap(), sample(6));
    assert_eq!(clock.pause(host(14)).unwrap(), sample(8));
    assert_eq!(clock.sample_time(host(100)).unwrap(), sample(8));

    clock.play(host(100)).unwrap();
    assert_eq!(clock.sample_time(host(102)).unwrap(), sample(12));
    assert_eq!(clock.seek(sample(-4), host(102)).unwrap(), sample(-4));
    assert!(clock.is_playing());
    assert_eq!(clock.sample_time(host(103)).unwrap(), sample(-2));

    assert_eq!(clock.seek(sample(20), host(103)).unwrap(), sample(20));
    assert!(!clock.is_playing());
    let terminal = clock;
    assert_eq!(clock.play(host(103)).unwrap(), sample(20));
    assert_eq!(
        clock, terminal,
        "play at a terminal must not invent replay policy"
    );
}

#[test]
fn rate_and_direction_changes_reanchor_at_the_visible_integer_sample() {
    let mut clock = PlaybackClock::new(range(-10, 20), sample(0)).unwrap();
    clock.play(host(0)).unwrap();
    assert_eq!(clock.sample_time(host(5)).unwrap(), sample(5));
    assert_eq!(
        clock
            .set_rate(PlaybackRate::new(2, 1).unwrap(), host(5))
            .unwrap(),
        sample(5)
    );
    assert_eq!(clock.sample_time(host(7)).unwrap(), sample(9));
    assert_eq!(
        clock
            .set_direction(PlaybackDirection::Reverse, host(7))
            .unwrap(),
        sample(9)
    );
    assert_eq!(clock.sample_time(host(9)).unwrap(), sample(5));
}

#[test]
fn fractional_motion_floors_in_both_directions() {
    let mut floor = PlaybackClock::new(range(0, 10), sample(0)).unwrap();
    floor
        .set_rate(PlaybackRate::new(3, 2).unwrap(), host(0))
        .unwrap();
    floor.play(host(0)).unwrap();
    assert_eq!(floor.sample_time(host(1)).unwrap(), sample(1));

    let mut clock = PlaybackClock::new(range(-10, 10), sample(0)).unwrap();
    clock
        .set_rate(PlaybackRate::new(1, 3).unwrap(), host(0))
        .unwrap();
    clock
        .set_direction(PlaybackDirection::Reverse, host(0))
        .unwrap();
    clock.play(host(0)).unwrap();
    assert_eq!(clock.sample_time(host(1)).unwrap(), sample(0));
    assert_eq!(clock.sample_time(host(2)).unwrap(), sample(0));
    assert_eq!(clock.sample_time(host(3)).unwrap(), sample(-1));
}

#[test]
fn both_endpoints_are_observable_and_extreme_arithmetic_clamps_before_narrowing() {
    let full = range(i64::MIN, i64::MAX);
    let fastest = PlaybackRate::new(u64::MAX, 1).unwrap();

    let mut last_unclamped = PlaybackClock::new(full, sample(i64::MIN)).unwrap();
    last_unclamped.play(host(0)).unwrap();
    assert_eq!(
        last_unclamped.sample_time(host(u64::MAX - 1)).unwrap(),
        sample(i64::MAX - 1)
    );
    assert!(last_unclamped.is_playing());
    assert_eq!(
        last_unclamped.sample_time(host(u64::MAX)).unwrap(),
        sample(i64::MAX)
    );
    assert!(!last_unclamped.is_playing());

    let mut forward = PlaybackClock::new(full, sample(i64::MIN)).unwrap();
    forward.set_rate(fastest, host(0)).unwrap();
    forward.play(host(0)).unwrap();
    assert_eq!(
        forward.sample_time(host(u64::MAX)).unwrap(),
        sample(i64::MAX)
    );
    assert!(!forward.is_playing());
    assert_eq!(
        forward.sample_time(host(u64::MAX)).unwrap(),
        sample(i64::MAX)
    );

    let mut reverse = PlaybackClock::new(full, sample(i64::MAX)).unwrap();
    reverse
        .set_direction(PlaybackDirection::Reverse, host(0))
        .unwrap();
    reverse.set_rate(fastest, host(0)).unwrap();
    reverse.play(host(0)).unwrap();
    assert_eq!(
        reverse.sample_time(host(u64::MAX)).unwrap(),
        sample(i64::MIN)
    );
    assert!(!reverse.is_playing());
}

#[test]
fn clock_regression_and_invalid_seek_are_transactional() {
    let mut clock = PlaybackClock::new(range(0, 100), sample(10)).unwrap();
    clock.play(host(10)).unwrap();
    assert_eq!(clock.sample_time(host(20)).unwrap(), sample(20));

    let before_regression = clock;
    assert!(matches!(
        clock.sample_time(host(19)),
        Err(PlaybackClockError::HostTimeRegressed { .. })
    ));
    assert_eq!(clock, before_regression);

    let before_seek = clock;
    assert!(matches!(
        clock.seek(sample(101), host(21)),
        Err(PlaybackClockError::PositionOutsideRange { .. })
    ));
    assert_eq!(clock, before_seek);
    assert_eq!(clock.sample_time(host(21)).unwrap(), sample(21));
}
