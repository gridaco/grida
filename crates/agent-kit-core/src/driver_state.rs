//! Opaque state retained by the session's driver, independent of turn history.

use crate::{Envelope, Error, ErrorKind, Fingerprint, Result};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct DriverStateRevision(pub u64);

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DriverStateChange {
    pub expected: DriverStateRevision,
    pub value: Option<Envelope>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
pub struct DriverStateSnapshot {
    revision: DriverStateRevision,
    value: Option<Envelope>,
}

impl DriverStateSnapshot {
    pub const MAX_BYTES: usize = 64 * 1024;

    pub fn revision(&self) -> DriverStateRevision {
        self.revision
    }

    pub fn value(&self) -> Option<&Envelope> {
        self.value.as_ref()
    }

    pub fn is_initial(&self) -> bool {
        self.revision.0 == 0
    }

    pub fn content_fingerprint(&self) -> Result<Fingerprint> {
        Fingerprint::of(&self.value)
    }

    pub fn apply(&mut self, change: DriverStateChange) -> Result<()> {
        if self.revision != change.expected {
            return Err(Error::new(
                ErrorKind::Conflict,
                "driver_state_revision_changed",
            ));
        }
        let next = Self {
            revision: DriverStateRevision(self.revision.0.checked_add(1).ok_or_else(|| {
                Error::new(ErrorKind::LimitExceeded, "driver_state_revision_overflow")
            })?),
            value: change.value,
        };
        next.validate()?;
        *self = next;
        Ok(())
    }

    fn validate(&self) -> Result<()> {
        if self.is_initial() && self.value.is_some() {
            return Err(Error::new(ErrorKind::InvalidState, "driver_state_invalid"));
        }
        if self
            .value
            .as_ref()
            .is_some_and(|value| value.bytes().len() > Self::MAX_BYTES)
        {
            return Err(Error::new(ErrorKind::LimitExceeded, "driver_state_limit"));
        }
        Ok(())
    }
}

impl<'de> Deserialize<'de> for DriverStateSnapshot {
    fn deserialize<D: serde::Deserializer<'de>>(
        deserializer: D,
    ) -> std::result::Result<Self, D::Error> {
        #[derive(Deserialize)]
        struct Data {
            revision: DriverStateRevision,
            value: Option<Envelope>,
        }
        let data = Data::deserialize(deserializer)?;
        let state = Self {
            revision: data.revision,
            value: data.value,
        };
        state.validate().map_err(serde::de::Error::custom)?;
        Ok(state)
    }
}
