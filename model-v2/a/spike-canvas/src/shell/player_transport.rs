//! Transport policy for the disposable native animation player.
//!
//! This module owns the player-specific state machine layered over
//! [`PlaybackClock`]: autoplay, play/pause, restart, seeking, scrubbing, and
//! the exact-frame-before-resume presentation handshake. It deliberately does
//! not own ambient time, rendering, windows, or controls, and is not an engine
//! runtime API.

use anchor_engine::playback_clock::{HostTime, PlaybackClock, PlaybackClockError, PlaybackRange};
use anchor_lab::animation::SampleTime;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ScrubPhase {
    Begin,
    Update,
    End,
}

#[derive(Debug)]
pub(super) struct PlayerTransport {
    clock: PlaybackClock,
    play_after_present: Option<SampleTime>,
    presented_playback_requested: bool,
    scrub_resume: Option<bool>,
}

impl PlayerTransport {
    pub(super) fn new(range: PlaybackRange) -> Result<Self, PlaybackClockError> {
        Ok(Self {
            clock: PlaybackClock::new(range, range.start())?,
            play_after_present: Some(range.start()),
            presented_playback_requested: true,
            scrub_resume: None,
        })
    }

    pub(super) fn range(&self) -> PlaybackRange {
        self.clock.range()
    }

    pub(super) fn sample(&mut self, now: HostTime) -> Result<SampleTime, PlaybackClockError> {
        self.clock.sample_time(now)
    }

    /// Whether animation policy requires the host to schedule a frame without
    /// a new window or control event.
    ///
    /// A pending exact-before-resume sample creates automatic demand even while
    /// the clock is paused. A discrete paused seek does not: the control adapter
    /// invalidates that one frame directly.
    pub(super) fn has_automatic_frame_demand(&self) -> bool {
        self.clock.is_playing() || self.play_after_present.is_some()
    }

    /// The playback state represented by the controls in the last presented
    /// frame. A click must invert this value, not state changed while painting
    /// that same frame.
    pub(super) fn presented_playback_requested(&self) -> bool {
        self.presented_playback_requested
    }

    pub(super) fn present_complete(
        &mut self,
        sample: SampleTime,
        playback_requested: bool,
        now: HostTime,
    ) -> Result<(), PlaybackClockError> {
        self.presented_playback_requested = playback_requested;
        if self.play_after_present == Some(sample) {
            self.clock.play(now)?;
            self.play_after_present = None;
        }
        Ok(())
    }

    pub(super) fn toggle_playback(&mut self, now: HostTime) -> Result<(), PlaybackClockError> {
        let requested = self.has_automatic_frame_demand() || self.scrub_resume == Some(true);
        self.set_playback(!requested, now)
    }

    pub(super) fn set_playback(
        &mut self,
        playing: bool,
        now: HostTime,
    ) -> Result<(), PlaybackClockError> {
        self.scrub_resume = None;
        if playing && self.play_after_present.is_some() {
            return Ok(());
        }

        self.play_after_present = None;
        if !playing {
            self.clock.pause(now)?;
            return Ok(());
        }

        let position = self.clock.sample_time(now)?;
        if self.clock.is_playing() {
            return Ok(());
        }

        if position == self.clock.range().end() {
            self.prepare_restart(now)?;
            self.play_after_present = Some(self.clock.range().start());
        } else {
            self.clock.play(now)?;
        }
        Ok(())
    }

    pub(super) fn restart(&mut self, now: HostTime) -> Result<(), PlaybackClockError> {
        self.scrub_resume = None;
        self.prepare_restart(now)?;
        self.play_after_present = Some(self.clock.range().start());
        Ok(())
    }

    pub(super) fn seek(
        &mut self,
        position: SampleTime,
        now: HostTime,
    ) -> Result<(), PlaybackClockError> {
        let resume_after_present = self.has_automatic_frame_demand();
        self.scrub_resume = None;
        self.seek_to(position, now, resume_after_present)
    }

    pub(super) fn scrub(
        &mut self,
        position: SampleTime,
        phase: ScrubPhase,
        now: HostTime,
    ) -> Result<(), PlaybackClockError> {
        match phase {
            ScrubPhase::Begin => {
                self.scrub_resume = Some(self.has_automatic_frame_demand());
                self.seek_to(position, now, false)?;
            }
            ScrubPhase::Update => {
                if self.scrub_resume.is_none() {
                    self.scrub_resume = Some(self.has_automatic_frame_demand());
                }
                self.seek_to(position, now, false)?;
            }
            ScrubPhase::End => {
                let resume_after_present = self
                    .scrub_resume
                    .take()
                    .unwrap_or_else(|| self.has_automatic_frame_demand());
                self.seek_to(position, now, resume_after_present)?;
            }
        }
        Ok(())
    }

    fn prepare_restart(&mut self, now: HostTime) -> Result<(), PlaybackClockError> {
        self.clock.pause(now)?;
        self.clock.seek(self.clock.range().start(), now)?;
        Ok(())
    }

    fn seek_to(
        &mut self,
        position: SampleTime,
        now: HostTime,
        resume_after_present: bool,
    ) -> Result<(), PlaybackClockError> {
        self.clock.pause(now)?;
        self.clock.seek(position, now)?;
        self.play_after_present =
            (resume_after_present && position != self.clock.range().end()).then_some(position);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn range() -> PlaybackRange {
        PlaybackRange::new(SampleTime::ZERO, SampleTime::from_nanoseconds(100)).unwrap()
    }

    #[test]
    fn autoplay_waits_until_the_start_sample_is_presented() {
        let mut transport = PlayerTransport::new(range()).unwrap();

        assert!(transport.has_automatic_frame_demand());
        assert_eq!(transport.sample(HostTime::ZERO).unwrap(), range().start());

        transport
            .present_complete(range().start(), true, HostTime::ZERO)
            .unwrap();
        assert!(transport.has_automatic_frame_demand());
        assert_eq!(
            transport.sample(HostTime::from_nanoseconds(10)).unwrap(),
            SampleTime::from_nanoseconds(10)
        );
    }

    #[test]
    fn terminal_sample_quiesces_and_play_presents_start_before_restarting() {
        let mut transport = PlayerTransport::new(range()).unwrap();
        transport
            .present_complete(range().start(), true, HostTime::ZERO)
            .unwrap();

        let end_time = HostTime::from_nanoseconds(200);
        assert_eq!(transport.sample(end_time).unwrap(), range().end());
        assert!(!transport.has_automatic_frame_demand());

        transport.set_playback(true, end_time).unwrap();
        assert!(transport.has_automatic_frame_demand());
        assert_eq!(transport.sample(end_time).unwrap(), range().start());

        transport
            .present_complete(range().start(), true, end_time)
            .unwrap();
        assert_eq!(
            transport.sample(HostTime::from_nanoseconds(210)).unwrap(),
            SampleTime::from_nanoseconds(10)
        );
    }

    #[test]
    fn pause_at_the_terminal_timestamp_does_not_replay() {
        let mut transport = PlayerTransport::new(range()).unwrap();
        transport
            .present_complete(range().start(), true, HostTime::ZERO)
            .unwrap();

        let now = HostTime::from_nanoseconds(200);
        transport.set_playback(false, now).unwrap();
        assert_eq!(transport.sample(now).unwrap(), range().end());
        assert!(!transport.has_automatic_frame_demand());
    }

    #[test]
    fn playing_seek_presents_the_target_before_resuming() {
        let mut transport = PlayerTransport::new(range()).unwrap();
        transport
            .present_complete(range().start(), true, HostTime::ZERO)
            .unwrap();
        let now = HostTime::from_nanoseconds(10);
        let target = SampleTime::from_nanoseconds(60);

        transport.seek(target, now).unwrap();
        assert_eq!(transport.sample(now).unwrap(), target);

        transport.present_complete(target, true, now).unwrap();
        assert_eq!(
            transport.sample(HostTime::from_nanoseconds(15)).unwrap(),
            SampleTime::from_nanoseconds(65)
        );
    }

    #[test]
    fn repeated_pending_seeks_preserve_the_resume_intent() {
        let mut transport = PlayerTransport::new(range()).unwrap();
        transport
            .present_complete(range().start(), true, HostTime::ZERO)
            .unwrap();
        let now = HostTime::from_nanoseconds(10);
        let first = SampleTime::from_nanoseconds(40);
        let second = SampleTime::from_nanoseconds(70);

        transport.seek(first, now).unwrap();
        transport.seek(second, now).unwrap();
        assert_eq!(transport.sample(now).unwrap(), second);

        transport.present_complete(second, true, now).unwrap();
        assert_eq!(
            transport.sample(HostTime::from_nanoseconds(15)).unwrap(),
            SampleTime::from_nanoseconds(75)
        );
    }

    #[test]
    fn paused_seek_stays_paused_and_terminal_seek_never_resumes() {
        let mut paused = PlayerTransport::new(range()).unwrap();
        paused.set_playback(false, HostTime::ZERO).unwrap();
        let target = SampleTime::from_nanoseconds(60);
        paused.seek(target, HostTime::ZERO).unwrap();
        assert_eq!(paused.sample(HostTime::ZERO).unwrap(), target);
        assert!(!paused.has_automatic_frame_demand());

        let mut playing = PlayerTransport::new(range()).unwrap();
        playing
            .present_complete(range().start(), true, HostTime::ZERO)
            .unwrap();
        playing.seek(range().end(), HostTime::ZERO).unwrap();
        assert_eq!(playing.sample(HostTime::ZERO).unwrap(), range().end());
        assert!(!playing.has_automatic_frame_demand());
    }

    #[test]
    fn restart_prepares_an_exact_start_sample_then_resumes() {
        let mut transport = PlayerTransport::new(range()).unwrap();
        transport
            .present_complete(range().start(), true, HostTime::ZERO)
            .unwrap();
        let now = HostTime::from_nanoseconds(40);

        transport.restart(now).unwrap();
        assert_eq!(transport.sample(now).unwrap(), range().start());
        transport
            .present_complete(range().start(), true, now)
            .unwrap();
        assert_eq!(
            transport.sample(HostTime::from_nanoseconds(45)).unwrap(),
            SampleTime::from_nanoseconds(5)
        );
    }

    #[test]
    fn scrub_restores_prior_playback_only_after_the_final_sample_is_presented() {
        let mut transport = PlayerTransport::new(range()).unwrap();
        transport
            .present_complete(range().start(), true, HostTime::ZERO)
            .unwrap();
        let now = HostTime::from_nanoseconds(10);

        transport
            .scrub(SampleTime::from_nanoseconds(30), ScrubPhase::Begin, now)
            .unwrap();
        assert!(!transport.has_automatic_frame_demand());
        transport
            .scrub(SampleTime::from_nanoseconds(50), ScrubPhase::Update, now)
            .unwrap();
        transport
            .scrub(SampleTime::from_nanoseconds(70), ScrubPhase::End, now)
            .unwrap();
        assert!(transport.has_automatic_frame_demand());
        assert_eq!(
            transport.sample(now).unwrap(),
            SampleTime::from_nanoseconds(70)
        );

        transport
            .present_complete(SampleTime::from_nanoseconds(70), true, now)
            .unwrap();
        assert_eq!(
            transport.sample(HostTime::from_nanoseconds(15)).unwrap(),
            SampleTime::from_nanoseconds(75)
        );
    }

    #[test]
    fn paused_scrub_stays_paused_after_its_final_sample_is_presented() {
        let mut transport = PlayerTransport::new(range()).unwrap();
        transport.set_playback(false, HostTime::ZERO).unwrap();
        let now = HostTime::from_nanoseconds(10);
        let target = SampleTime::from_nanoseconds(70);

        transport.scrub(target, ScrubPhase::Begin, now).unwrap();
        transport.scrub(target, ScrubPhase::End, now).unwrap();
        assert_eq!(transport.sample(now).unwrap(), target);
        assert!(!transport.has_automatic_frame_demand());

        transport.present_complete(target, false, now).unwrap();
        assert!(!transport.has_automatic_frame_demand());
        assert_eq!(
            transport.sample(HostTime::from_nanoseconds(20)).unwrap(),
            target
        );
    }

    #[test]
    fn presented_playback_state_changes_only_at_present_complete() {
        let mut transport = PlayerTransport::new(range()).unwrap();
        assert!(transport.presented_playback_requested());

        transport.set_playback(false, HostTime::ZERO).unwrap();
        assert!(transport.presented_playback_requested());

        transport
            .present_complete(range().start(), false, HostTime::ZERO)
            .unwrap();
        assert!(!transport.presented_playback_requested());
    }
}
