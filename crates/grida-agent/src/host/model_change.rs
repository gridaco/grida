//! Private connection replacement preflight and terminal admission barrier.
//! GRIDA-SEC-004: only the supervisor may prepare retirement; no authority leaves custody.

use super::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ModelChangeBlocker {
    PendingWork,
    ActiveTurn,
    RetainedTurn,
    QueuedInput,
    UnresolvedGoal,
    DelegatedSession,
    BackgroundProcess,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ModelChangeInspection {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blocker: Option<ModelChangeBlocker>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub prepared: bool,
}

impl Host {
    /// Observation never claims work. Preparation is terminal for this worker:
    /// when clear it closes admission while holding every acceptance boundary.
    /// A replacement failure requires reopening the prior connection in a new
    /// worker, so a stale inspection can never authorize retiring newer work.
    pub(crate) async fn inspect_model_change(
        &self,
        session: Option<SessionId>,
        prepare: bool,
    ) -> Result<ModelChangeInspection> {
        if prepare && session.is_some() {
            return Err(problem(
                ErrorKind::InvalidInput,
                "model_change_prepare_requires_worker",
            ));
        }
        if self.work.lock().await.model_change_prepared {
            return Ok(ModelChangeInspection {
                prepared: true,
                ..Default::default()
            });
        }
        // Mutating controls may already hold accepted work before a turn is
        // visible. Taking every permit is a non-waiting admission fence.
        let controls = if prepare {
            match self
                .controls
                .clone()
                .try_acquire_many_owned(MAX_OWNED_CONTROLS as u32)
            {
                Ok(permits) => Some(permits),
                Err(_) => return Ok(blocked(ModelChangeBlocker::PendingWork)),
            }
        } else {
            None
        };
        if !prepare && session.is_none() && self.controls.available_permits() != MAX_OWNED_CONTROLS
        {
            return Ok(blocked(ModelChangeBlocker::PendingWork));
        }
        let _admission = self.configuration_admission.lock().await;
        let mut work = self.work.lock().await;
        if work.closed {
            return Err(problem(ErrorKind::Unavailable, "host_shutting_down"));
        }
        let native_work = match &session {
            Some(id) => work.active.get(id),
            None => work.active.values().next(),
        };
        if let Some(active) = native_work {
            return Ok(blocked(if active.admitted {
                ModelChangeBlocker::ActiveTurn
            } else {
                ModelChangeBlocker::PendingWork
            }));
        }
        if session.is_none()
            && (self.workers.load(Ordering::Acquire) != 0
                || !self.title_workers.lock().unwrap().is_empty()
                || !work.retiring.is_empty())
        {
            return Ok(blocked(ModelChangeBlocker::PendingWork));
        }
        let mut after = None;
        loop {
            let (sessions, next) = match &session {
                Some(id) => (vec![id.clone()], None),
                None => {
                    let page = self.store.session_page(after).await?;
                    (page.entries, page.next_after)
                }
            };
            for id in sessions {
                let view = self.store.inspect(id.clone()).await?;
                if let Some(current) = &view.current {
                    return Ok(blocked(
                        if current.disposition == TurnDisposition::Running {
                            ModelChangeBlocker::ActiveTurn
                        } else {
                            ModelChangeBlocker::RetainedTurn
                        },
                    ));
                }
                if !view.queued.is_empty() {
                    return Ok(blocked(ModelChangeBlocker::QueuedInput));
                }
                let configuration = session_configuration(&view)?;
                if configuration.subagent.is_none()
                    && goals::require_resolved_goal(&view.driver_state).is_err()
                {
                    return Ok(blocked(ModelChangeBlocker::UnresolvedGoal));
                }
                if self
                    .processes
                    .list(&id)
                    .iter()
                    .any(|entry| entry.state == crate::processes::ProcessState::Running)
                {
                    return Ok(blocked(ModelChangeBlocker::BackgroundProcess));
                }
                // An inert child does not prevent its parent from selecting a
                // connection. Direct child route changes remain forbidden.
                if configuration.side.is_some()
                    || (session.is_some() && configuration.subagent.is_some())
                {
                    return Ok(blocked(ModelChangeBlocker::DelegatedSession));
                }
            }
            match next {
                Some(next) => after = Some(next),
                None => break,
            }
        }
        if prepare {
            work.closed = true;
            work.model_change_prepared = true;
            self.controls.close();
        }
        drop(controls);
        Ok(ModelChangeInspection {
            blocker: None,
            prepared: prepare,
        })
    }
}

fn blocked(blocker: ModelChangeBlocker) -> ModelChangeInspection {
    ModelChangeInspection {
        blocker: Some(blocker),
        prepared: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn host(path: &Path) -> Host {
        Host::open(
            path,
            Some(ProviderOptions {
                endpoint: "http://127.0.0.1:9/v1".into(),
                protocol: ProviderProtocol::OpenAiCompatible,
                model: ModelId::new("fixture").unwrap(),
                credential_env: None,
                credential_home: None,
                max_output_tokens: 1024,
                compatible_output_limit_field: None,
                llama_cpp_input_count: false,
                reasoning: false,
            }),
        )
        .unwrap()
    }

    #[tokio::test]
    async fn worker_preparation_refuses_pending_controls_and_background_titles_without_closing_admission()
     {
        let root = tempfile::tempdir().unwrap();
        let host = host(&root.path().join("state"));
        let permit = host.controls.clone().try_acquire_owned().unwrap();
        assert_eq!(
            host.inspect_model_change(None, true).await.unwrap().blocker,
            Some(ModelChangeBlocker::PendingWork)
        );
        assert!(!host.work.lock().await.closed);
        drop(permit);
        let session = SessionId::new("titling").unwrap();
        host.title_workers.lock().unwrap().insert(session.clone());
        assert_eq!(
            host.inspect_model_change(None, true).await.unwrap().blocker,
            Some(ModelChangeBlocker::PendingWork)
        );
        assert!(!host.work.lock().await.closed);
        host.title_workers.lock().unwrap().remove(&session);
        assert!(
            host.inspect_model_change(None, true)
                .await
                .unwrap()
                .prepared
        );
        host.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn worker_preparation_checks_unattached_queued_sessions_and_is_terminal_only_after_resolution()
     {
        let root = tempfile::tempdir().unwrap();
        let host = host(&root.path().join("state"));
        let session = host
            .new_session(root.path().canonicalize().unwrap())
            .await
            .unwrap();
        let view = host.store.inspect(session.clone()).await.unwrap();
        let request = PromptRequest {
            session: session.clone(),
            id: ChangeId::new("queued").unwrap(),
            parts: vec![PromptPart::Text {
                text: "Retain this work".into(),
            }],
            questions: false,
            operating_regime: None,
            effort: None,
            reasoning: None,
        };
        let policy = host.submission_policy(&request, false).unwrap();
        let input = host
            .capture_input(&view, request.id, request.parts, policy)
            .await
            .unwrap();
        host.store.submit(session.clone(), input).await.unwrap();
        let blocked = host.inspect_model_change(None, true).await.unwrap();
        assert_eq!(blocked.blocker, Some(ModelChangeBlocker::QueuedInput));
        assert!(!blocked.prepared);
        assert!(!host.work.lock().await.closed);
        let view = host.store.inspect(session.clone()).await.unwrap();
        host.edit_queue(
            session.clone(),
            ChangeId::new("withdraw").unwrap(),
            view.revision,
            QueueEdit::Withdraw {
                input: ChangeId::new("queued").unwrap(),
            },
        )
        .await
        .unwrap();
        assert!(
            host.inspect_model_change(None, true)
                .await
                .unwrap()
                .prepared
        );
        assert_eq!(
            host.new_session(root.path().canonicalize().unwrap())
                .await
                .unwrap_err()
                .code,
            "host_shutting_down"
        );
        assert!(
            host.inspect_model_change(None, true)
                .await
                .unwrap()
                .prepared
        );
        assert!(host.store.inspect(session).await.unwrap().queued.is_empty());
        host.shutdown().await.unwrap();
    }
}
