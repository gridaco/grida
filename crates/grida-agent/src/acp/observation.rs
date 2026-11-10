//! Connection-owned observation and retirement barriers for saved chats.

use super::*;

pub(super) struct Observation {
    sessions: Arc<Mutex<ConnectionSessions>>,
    session: Option<SessionId>,
}

impl Observation {
    pub(super) fn begin(
        sessions: &Arc<Mutex<ConnectionSessions>>,
        session: Option<&SessionId>,
    ) -> Result<Self> {
        let mut state = sessions.lock().unwrap();
        if let Some(session) = session {
            state.ensure_observable(session)?;
            *state.observing.entry(session.clone()).or_default() += 1;
        } else {
            if !state.retiring.is_empty() {
                return Err(unavailable("session_deletion_in_progress"));
            }
            state.catalog_observers += 1;
        }
        Ok(Self {
            sessions: sessions.clone(),
            session: session.cloned(),
        })
    }
}

impl Drop for Observation {
    fn drop(&mut self) {
        let mut state = self.sessions.lock().unwrap();
        if let Some(session) = &self.session {
            let count = state
                .observing
                .get_mut(session)
                .expect("registered observation");
            *count -= 1;
            if *count == 0 {
                state.observing.remove(session);
            }
        } else {
            state.catalog_observers -= 1;
        }
    }
}

pub(super) struct Retirement {
    sessions: Arc<Mutex<ConnectionSessions>>,
    session: SessionId,
}

impl Retirement {
    pub(super) fn begin(
        sessions: &Arc<Mutex<ConnectionSessions>>,
        session: &SessionId,
    ) -> Result<Option<Self>> {
        let mut state = sessions.lock().unwrap();
        state.ensure_observable(session)?;
        if !state.attached.contains(session) {
            return Ok(None);
        }
        if state.active.contains_key(session)
            || state.observing.contains_key(session)
            || state.catalog_observers != 0
        {
            return Err(unavailable("session_deletion_observation_in_progress"));
        }
        state.retiring.insert(session.clone());
        Ok(Some(Self {
            sessions: sessions.clone(),
            session: session.clone(),
        }))
    }

    pub(super) fn revoke(&self) {
        self.sessions.lock().unwrap().attached.remove(&self.session);
    }
}

impl Drop for Retirement {
    fn drop(&mut self) {
        self.sessions.lock().unwrap().retiring.remove(&self.session);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retirement_and_catalog_or_session_observation_are_mutually_exclusive() {
        let session = SessionId::new("session").unwrap();
        let sessions = Arc::new(Mutex::new(ConnectionSessions::default()));
        sessions.lock().unwrap().attached.insert(session.clone());
        let catalog = Observation::begin(&sessions, None).unwrap();
        let replay = Observation::begin(&sessions, Some(&session)).unwrap();
        assert!(Retirement::begin(&sessions, &session).is_err());
        drop(catalog);
        assert!(Retirement::begin(&sessions, &session).is_err());
        drop(replay);
        let fence = Retirement::begin(&sessions, &session).unwrap().unwrap();
        assert!(Observation::begin(&sessions, None).is_err());
        assert!(Observation::begin(&sessions, Some(&session)).is_err());
        assert!(!sessions.lock().unwrap().can_deliver(&session));
        fence.revoke();
        drop(fence);
        assert!(Retirement::begin(&sessions, &session).unwrap().is_none());
    }
}
