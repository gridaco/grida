//! Product controls over the session store and its owned turn workers.

use super::*;

#[cfg(test)]
mod tests {
    use super::*;
    use agent_kit_core::messages::OutcomeStatus;
    use agent_kit_core::turn::{JournalAction, JournalChange};

    #[test]
    fn queue_readiness_coalesces_recovery_without_restricting_ordinary_wakes() {
        let session = SessionId::new("queued").unwrap();
        let mut work = Work::default();
        for revision in [2, 1, 3] {
            work.defer(ReadyWork::Queue(
                session.clone(),
                Some(SessionRevision(revision)),
            ));
        }
        assert_eq!(work.ready.len(), 1);
        assert!(matches!(
            work.ready.front(),
            Some(ReadyWork::Queue(_, Some(SessionRevision(3))))
        ));
        work.defer(ReadyWork::Queue(session.clone(), None));
        work.defer(ReadyWork::Queue(session, Some(SessionRevision(4))));
        assert_eq!(work.ready.len(), 1);
        assert!(matches!(
            work.ready.front(),
            Some(ReadyWork::Queue(_, None))
        ));
    }

    #[tokio::test]
    async fn stop_recovery_survives_pre_admission_worker_handoff() {
        let root = tempfile::tempdir().unwrap();
        let host = Host::open(
            &root.path().join("state"),
            Some(ProviderOptions {
                endpoint: "http://127.0.0.1:9/v1".into(),
                protocol: ProviderProtocol::OpenAiCompatible,
                model: ModelId::new("fixture").unwrap(),
                credential_env: None,
                credential_home: None,
                max_output_tokens: 1024,
                compatible_output_limit_field: None,
                llama_cpp_input_count: false,
                reasoning: Default::default(),
            }),
        )
        .unwrap();
        let session = host
            .new_session(root.path().canonicalize().unwrap())
            .await
            .unwrap();
        let prompt = |id| PromptRequest {
            id: ChangeId::new(id).unwrap(),
            session: session.clone(),
            parts: vec![PromptPart::Text {
                text: "Fixture".into(),
            }],
            questions: false,
            question_batches: false,
            operating_regime: None,
            effort: None,
            reasoning: Default::default(),
        };
        let view = host.store.inspect(session.clone()).await.unwrap();
        let original = prompt("original");
        let policy = host.submission_policy(&original, false).unwrap();
        let captured = host
            .capture_input(&view, original.id, original.parts, policy)
            .await
            .unwrap();
        let input = captured.id.clone();
        host.store.submit(session.clone(), captured).await.unwrap();
        let view = host.store.inspect(session.clone()).await.unwrap();
        let turn = TurnId::new("original-turn").unwrap();
        let claim = new_claim(session.clone(), turn.clone(), view.revision, vec![input]).unwrap();
        let ClaimOutcome::Acquired(owner) = host.store.claim(claim).await.unwrap() else {
            panic!("expected original turn lease")
        };
        let state = owner.lease.journal().load().await.unwrap();
        owner
            .lease
            .journal()
            .commit(
                JournalChange::new(
                    change_id().unwrap(),
                    state.binding().clone(),
                    state.position(),
                    state.controls().revision,
                    vec![JournalAction::Suspend],
                )
                .unwrap(),
            )
            .await
            .unwrap();
        drop(owner);

        let view = host.store.inspect(session.clone()).await.unwrap();
        let current = view.current.unwrap();
        assert_eq!(current.disposition, TurnDisposition::Suspended);
        let stop_request = ChangeId::new("stop-original").unwrap();
        let stop = || {
            host.stop(
                session.clone(),
                turn.clone(),
                stop_request.clone(),
                view.revision,
                current.controls.revision,
            )
        };

        // The admission lock holds a real worker before it can inspect the
        // store. The drain lock lets a second registration win the handoff.
        let drain = host.wake_lock.lock().await;
        let mut admission = host.configuration_admission.lock().await;
        let competing = prompt("competing");
        let policy = host.submission_policy(&competing, false).unwrap();
        let first = host
            .register_prompt(competing, PromptAdmission::Immediate, policy, None)
            .await
            .unwrap();
        let receipt = stop().await.unwrap();
        assert_eq!(receipt.turn.as_ref().unwrap().record().binding.turn, turn);
        {
            let work = host.work.lock().await;
            let active = work.active.get(&session).unwrap();
            assert!(!active.admitted);
            assert_ne!(active.turn, turn);
            assert_eq!(active.pending_stop.as_ref(), Some(&turn));
        }
        drop(admission);
        assert_eq!(
            first.admission.await.unwrap().err().unwrap().code,
            "session_admission_paused"
        );

        admission = host.configuration_admission.lock().await;
        let another = prompt("another");
        let policy = host.submission_policy(&another, false).unwrap();
        let second = host
            .register_prompt(another, PromptAdmission::Immediate, policy, None)
            .await
            .unwrap();
        {
            let work = host.work.lock().await;
            assert!(work.ready.iter().any(|ready| matches!(ready, ReadyWork::Stop(owner, target) if owner == &session && target == &turn)));
        }
        drop(admission);
        assert_eq!(
            second.admission.await.unwrap().err().unwrap().code,
            "session_admission_paused"
        );
        drop(drain);

        tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                let settled = host
                    .store
                    .inspect_turn_with(session.clone(), turn.clone(), |state| {
                        assert!(state.operations().is_empty());
                        Ok(state.outcome().map(|outcome| outcome.status))
                    })
                    .await
                    .unwrap();
                if let Some(status) = settled {
                    assert_eq!(status, OutcomeStatus::Cancelled);
                    break;
                }
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
        })
        .await
        .unwrap();
        assert_eq!(stop().await.unwrap(), receipt);
        let settled = host.store.inspect(session.clone()).await.unwrap();
        assert!(settled.current.is_none() && settled.queued.is_empty());
        assert_eq!(settled.latest.unwrap().binding.turn, turn);
        host.shutdown().await.unwrap();
    }

    fn fixture_host(state: &std::path::Path, model: &str) -> Host {
        fixture_host_at(state, model, "http://127.0.0.1:9/v1".into())
    }

    fn fixture_host_at(state: &std::path::Path, model: &str, endpoint: String) -> Host {
        Host::open(
            state,
            Some(ProviderOptions {
                endpoint,
                protocol: ProviderProtocol::OpenAiCompatible,
                model: ModelId::new(model).unwrap(),
                credential_env: None,
                credential_home: None,
                max_output_tokens: 1024,
                compatible_output_limit_field: None,
                llama_cpp_input_count: false,
                reasoning: Default::default(),
            }),
        )
        .unwrap()
    }

    fn fixture_prompt(session: &SessionId, id: &str) -> PromptRequest {
        PromptRequest {
            id: ChangeId::new(id).unwrap(),
            session: session.clone(),
            parts: vec![PromptPart::Text {
                text: "Fixture".into(),
            }],
            questions: false,
            question_batches: false,
            operating_regime: None,
            effort: None,
            reasoning: Default::default(),
        }
    }

    #[tokio::test]
    async fn settled_worker_keeps_the_next_queued_input_scheduled_during_handoff() {
        let root = tempfile::tempdir().unwrap();
        let provider = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let host = fixture_host_at(
            &root.path().join("state"),
            "fixture",
            format!("http://{}/v1", provider.local_addr().unwrap()),
        );
        let session = host
            .new_session(root.path().canonicalize().unwrap())
            .await
            .unwrap();
        tokio::time::timeout(Duration::from_secs(10), async {
            let run = host
                .start_prompt(fixture_prompt(&session, "first"))
                .await
                .unwrap();
            host.enqueue(fixture_prompt(&session, "next"))
                .await
                .unwrap();
            // The worker sends completion after releasing its active slot. Hold the ready
            // drain so a snapshot lands exactly before it kicks the next queued input.
            let drain = host.wake_lock.lock().await;
            sponsorship::tests::synthetic_reply(&provider).await;
            assert!(matches!(
                run.completion.await.unwrap().unwrap(),
                RunResult::Settled(_)
            ));
            let (view, _, resume) = host.inspect_snapshot(session.clone()).await.unwrap();
            assert!(view.current.is_none() && !view.admission_paused);
            assert_eq!(view.queued[0].input.id.as_str(), "next");
            let queued: StoredPrompt = decode_input(&view.queued[0].input).unwrap();
            assert!(queued.preceding_turn.is_none());
            assert!(settled_predecessor(&view).unwrap().is_none());
            assert!(!resume);
            drop(drain);
            sponsorship::tests::synthetic_reply(&provider).await;
            loop {
                let view = host.store.inspect(session.clone()).await.unwrap();
                if view.current.is_none() && view.queued.is_empty() {
                    let latest = &view.latest.as_ref().unwrap().binding.turn;
                    let expected = preceding_turn_fingerprint(&session, latest).unwrap();
                    assert_eq!(settled_predecessor(&view).unwrap(), Some(expected));
                    break;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        host.shutdown().await.unwrap();
    }

    async fn paused_turn(host: &Host, session: &SessionId) -> TurnView {
        let view = host.store.inspect(session.clone()).await.unwrap();
        let prompt = fixture_prompt(session, "original");
        let policy = host.submission_policy(&prompt, false).unwrap();
        let input = host
            .capture_input(&view, prompt.id, prompt.parts, policy)
            .await
            .unwrap();
        suspend_input(host, session, input, None).await
    }

    async fn suspend_input(
        host: &Host,
        session: &SessionId,
        input: Submission,
        checkpoint: Option<Envelope>,
    ) -> TurnView {
        let id = input.id.clone();
        host.store.submit(session.clone(), input).await.unwrap();
        let view = host.store.inspect(session.clone()).await.unwrap();
        let claim = new_claim(
            session.clone(),
            TurnId::new("paused-turn").unwrap(),
            view.revision,
            vec![id],
        )
        .unwrap();
        let ClaimOutcome::Acquired(owner) = host.store.claim(claim).await.unwrap() else {
            panic!("expected turn lease")
        };
        let state = owner.lease.journal().load().await.unwrap();
        let mut actions = Vec::new();
        if let Some(checkpoint) = checkpoint {
            actions.push(JournalAction::SetCheckpoint(checkpoint));
        }
        actions.extend([
            JournalAction::Control(ControlDirective::Pause),
            JournalAction::Suspend,
        ]);
        owner
            .lease
            .journal()
            .commit(
                JournalChange::new(
                    change_id().unwrap(),
                    state.binding().clone(),
                    state.position(),
                    state.controls().revision,
                    actions,
                )
                .unwrap(),
            )
            .await
            .unwrap();
        drop(owner);
        host.store
            .inspect(session.clone())
            .await
            .unwrap()
            .current
            .unwrap()
    }

    #[tokio::test]
    async fn resume_of_a_capped_checkpoint_is_refused_before_claim_and_stop_shuts_down_cleanly() {
        let root = tempfile::tempdir().unwrap();
        let host = fixture_host(&root.path().join("state"), "fixture");
        let session = host
            .new_session(root.path().canonicalize().unwrap())
            .await
            .unwrap();
        let view = host.store.inspect(session.clone()).await.unwrap();
        let prompt = fixture_prompt(&session, "historical");
        let policy = host.submission_policy(&prompt, false).unwrap();
        let mut input = host
            .capture_input(&view, prompt.id, prompt.parts, policy)
            .await
            .unwrap();
        let mut captured: serde_json::Value = decode_input(&input).unwrap();
        let defaults = serde_json::json!({"context":{"max_input_tokens":1}});
        let revision =
            Fingerprint::of(b"schema_version = 1\n[context]\nmax_input_tokens = 1\n".as_slice())
                .unwrap();
        captured["configuration"] = serde_json::json!({
            "identity": Fingerprint::of(&(Some(revision), &defaults)).unwrap(),
            "source_revision": revision,
            "defaults": defaults,
        });
        input.payload = encode(INPUT_SCHEMA, INPUT_VERSION, &captured).unwrap();
        // Even a pre-generation pause with no request or operation is bound to its old configuration.
        let checkpoint = encode("grida.agent.conversation", 1, &serde_json::json!({
            "configuration": Fingerprint::of(&"historical master configuration").unwrap(), "step": 0,
            "request": null, "interrupted": true, "outcome": null, "request_history": null,
            "request_generation": 0
        })).unwrap();
        let paused = suspend_input(&host, &session, input, Some(checkpoint)).await;
        let view = host.store.inspect(session.clone()).await.unwrap();
        let turn = paused.binding.turn.clone();
        let error = host
            .resume(
                TurnControl {
                    session: session.clone(),
                    turn: turn.clone(),
                    request: change_id().unwrap(),
                    expected_session: view.revision,
                    expected_control: paused.controls.revision,
                },
                paused.binding.epoch,
                paused.position,
            )
            .await
            .unwrap_err();
        assert_eq!(error.code, "retired_input_cap_requires_restart");
        assert_eq!(host.store.inspect(session.clone()).await.unwrap(), view);

        host.stop(
            session.clone(),
            turn.clone(),
            change_id().unwrap(),
            view.revision,
            paused.controls.revision,
        )
        .await
        .unwrap();
        tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                let outcome = host
                    .store
                    .inspect_turn_with(session.clone(), turn.clone(), |state| {
                        assert!(state.operations().is_empty());
                        Ok(state.outcome().map(|outcome| outcome.status))
                    })
                    .await
                    .unwrap();
                if let Some(status) = outcome {
                    assert_eq!(status, OutcomeStatus::Cancelled);
                    break;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        host.shutdown().await.unwrap();
    }

    async fn finishing_worker(
        host: &Host,
        session: &SessionId,
        turn: TurnId,
        admitted: bool,
    ) -> tokio::task::JoinHandle<()> {
        let finishing = tokio::spawn(std::future::pending::<()>());
        host.work.lock().await.active.insert(
            session.clone(),
            Active {
                turn,
                admitted,
                queued_steer: None,
                handle: finishing.abort_handle(),
                pending_stop: None,
                missed_stop: false,
            },
        );
        finishing
    }

    #[tokio::test]
    async fn resume_waits_for_the_exact_suspended_turn_worker_to_release_the_session() {
        let root = tempfile::tempdir().unwrap();
        let host = fixture_host(&root.path().join("state"), "fixture");
        let session = host
            .new_session(root.path().canonicalize().unwrap())
            .await
            .unwrap();
        let paused = paused_turn(&host, &session).await;
        let view = host.store.inspect(session.clone()).await.unwrap();
        let finishing = finishing_worker(&host, &session, paused.binding.turn.clone(), true).await;
        let control = || TurnControl {
            session: session.clone(),
            turn: paused.binding.turn.clone(),
            request: ChangeId::new("resume-after-suspension").unwrap(),
            expected_session: view.revision,
            expected_control: paused.controls.revision,
        };
        let work = host.suspended_work(&session, &paused.binding.turn);
        tokio::pin!(work);
        assert!(futures_util::poll!(work.as_mut()).is_pending());
        // The helper holds Work throughout its SQLite read. Acquiring Work
        // while the helper is still pending proves it reached the Notify wait.
        let mut barrier = tokio::select! {
            work = host.work.lock() => work,
            result = work.as_mut() => panic!("returned before retirement: {:?}", result.err()),
        };
        assert!(barrier.active.contains_key(&session));
        barrier.active.remove(&session);
        host.changed.notify_waiters();
        drop(barrier);
        finishing.abort();
        let released = tokio::time::timeout(Duration::from_secs(5), work)
            .await
            .unwrap()
            .unwrap();
        assert!(!released.active.contains_key(&session));
        drop(released);
        let resumed = host
            .resume(control(), paused.binding.epoch, paused.position)
            .await
            .unwrap();
        assert_eq!(resumed.binding.turn, paused.binding.turn);
        assert_eq!(resumed.binding.epoch, paused.binding.epoch + 1);
        assert!(!resumed.controls.paused);
        let retried = host
            .resume(control(), paused.binding.epoch, paused.position)
            .await
            .unwrap();
        assert_eq!(retried.binding, resumed.binding);
        host.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn a_suspended_worker_handoff_keeps_the_original_resume_basis() {
        for (basis, code) in [
            ("session", "stale_session_revision"),
            ("epoch", "suspension_mismatch"),
            ("position", "suspension_mismatch"),
            ("control", "pause_state_changed"),
        ] {
            let root = tempfile::tempdir().unwrap();
            let host = fixture_host(&root.path().join("state"), "fixture");
            let session = host
                .new_session(root.path().canonicalize().unwrap())
                .await
                .unwrap();
            let paused = paused_turn(&host, &session).await;
            let view = host.store.inspect(session.clone()).await.unwrap();
            let finishing =
                finishing_worker(&host, &session, paused.binding.turn.clone(), true).await;
            let mut control = TurnControl {
                session: session.clone(),
                turn: paused.binding.turn.clone(),
                request: ChangeId::new("stale-resume").unwrap(),
                expected_session: view.revision,
                expected_control: paused.controls.revision,
            };
            let mut epoch = paused.binding.epoch;
            let mut position = paused.position;
            match basis {
                "session" => control.expected_session.0 += 1,
                "epoch" => epoch += 1,
                "position" => position.0 += 1,
                "control" => control.expected_control.0 += 1,
                _ => unreachable!(),
            }
            let waiting = host.suspended_work(&session, &paused.binding.turn);
            tokio::pin!(waiting);
            assert!(futures_util::poll!(waiting.as_mut()).is_pending());
            let mut barrier = tokio::select! {
                work = host.work.lock() => work,
                result = waiting.as_mut() => panic!("returned before retirement: {:?}", result.err()),
            };
            let resume = tokio::spawn({
                let host = host.clone();
                async move { host.resume(control, epoch, position).await }
            });
            barrier.active.remove(&session);
            host.changed.notify_waiters();
            drop(barrier);
            finishing.abort();
            drop(waiting.await.unwrap());
            assert_eq!(resume.await.unwrap().unwrap_err().code, code, "{basis}");
            let unchanged = host.store.inspect(session.clone()).await.unwrap();
            assert_eq!(unchanged.revision, view.revision);
            assert_eq!(unchanged.current.unwrap(), paused);
            host.shutdown().await.unwrap();
        }
    }

    #[tokio::test]
    async fn resume_does_not_wait_for_running_foreign_or_unadmitted_work() {
        for condition in ["running", "foreign", "unadmitted", "closed", "retiring"] {
            let root = tempfile::tempdir().unwrap();
            let host = fixture_host(&root.path().join("state"), "fixture");
            let session = host
                .new_session(root.path().canonicalize().unwrap())
                .await
                .unwrap();
            let paused = paused_turn(&host, &session).await;
            let owner = if condition == "running" {
                let view = host.store.inspect(session.clone()).await.unwrap();
                let ClaimOutcome::Acquired(owner) = host
                    .store
                    .claim(ClaimRequest {
                        id: change_id().unwrap(),
                        session: session.clone(),
                        expected_revision: view.revision,
                        selection: TurnSelection::ResumePaused {
                            turn: paused.binding.turn.clone(),
                            epoch: paused.binding.epoch,
                            position: paused.position,
                            control_revision: paused.controls.revision,
                        },
                    })
                    .await
                    .unwrap()
                else {
                    panic!("expected running turn lease")
                };
                Some(owner)
            } else {
                None
            };
            let finishing = finishing_worker(
                &host,
                &session,
                if condition == "foreign" {
                    TurnId::new("another-turn").unwrap()
                } else {
                    paused.binding.turn.clone()
                },
                condition != "unadmitted",
            )
            .await;
            let view = host.store.inspect(session.clone()).await.unwrap();
            {
                let mut work = host.work.lock().await;
                work.closed = condition == "closed";
                if condition == "retiring" {
                    work.retiring.insert(session.clone());
                }
            }
            let work = tokio::time::timeout(
                Duration::from_secs(5),
                host.suspended_work(&session, &paused.binding.turn),
            )
            .await
            .unwrap_or_else(|_| panic!("waited for {condition} work"))
            .unwrap();
            assert!(work.active.contains_key(&session));
            assert!(!finishing.is_finished());
            drop(work);
            assert_eq!(host.store.inspect(session.clone()).await.unwrap(), view);
            {
                let mut work = host.work.lock().await;
                work.active.remove(&session);
                work.retiring.remove(&session);
                work.closed = false;
            }
            finishing.abort();
            drop(owner);
            host.shutdown().await.unwrap();
        }
    }

    #[tokio::test]
    async fn a_queued_request_keeps_its_editor_binding() {
        let root = tempfile::tempdir().unwrap();
        let host = fixture_host(&root.path().join("state"), "fixture");
        let session = host
            .new_session(root.path().canonicalize().unwrap())
            .await
            .unwrap();
        let endpoint = BindingId::new("6f9619ff-8b86-4011-b42d-00c04fc964ff").unwrap();
        let bound = || SubmissionContext {
            editor_endpoint: Some(endpoint.clone()),
            editor_presentation: true,
            ..SubmissionContext::default()
        };
        // Rules a submitted request follows apply before anything is queued.
        let mut plan = fixture_prompt(&session, "plan");
        plan.operating_regime = Some(OperatingRegime::Plan);
        assert_eq!(
            host.enqueue_with_context(plan, bound())
                .await
                .unwrap_err()
                .code,
            "editor_surface_requires_workspace_act_text"
        );
        let target = SubmissionContext {
            editor_svg_target: Some(endpoint.clone()),
            ..SubmissionContext::default()
        };
        assert_eq!(
            host.enqueue_with_context(fixture_prompt(&session, "target"), target)
                .await
                .unwrap_err()
                .code,
            "svg_text_requires_attached_act"
        );
        let accepted = host
            .enqueue_with_context(fixture_prompt(&session, "queued"), bound())
            .await
            .unwrap();
        let view = host
            .store
            .input(session.clone(), accepted.input)
            .await
            .unwrap()
            .unwrap();
        let stored: StoredPrompt = decode_input(&view.input).unwrap();
        assert_eq!(stored.editor_endpoint.as_ref(), Some(&endpoint));
        assert!(stored.editor_presentation);
        assert!(stored.editor_svg_target.is_none());

        let prepare = |input: &Submission| {
            host.prepare_input(
                host.execution().unwrap(),
                &session,
                root.path(),
                input,
                None,
                false,
                InputAuthority::RequireCaptured,
            )
            .unwrap()
            .config
            .instructions
        };
        let captured = stored.editor_instructions.as_deref().unwrap();
        assert!(captured.contains("Observe the viewer"));
        let current = prepare(&view.input);
        assert!(current.contains(captured));

        // Checkpoints fingerprint the entire configuration. Inputs accepted before
        // Desktop began retaining this text must rebuild their original prompt.
        let mut legacy: serde_json::Value =
            serde_json::from_slice(view.input.payload.bytes()).unwrap();
        legacy
            .as_object_mut()
            .unwrap()
            .remove("editor_instructions");
        let legacy = Submission {
            id: view.input.id.clone(),
            payload: encode(INPUT_SCHEMA, INPUT_VERSION, &legacy).unwrap(),
        };
        let old = prepare(&legacy);
        assert!(
            old.contains("Treat presentation as optional and verify the artifact independently.")
        );
        assert!(!old.contains(captured));
        let _ = host.shutdown().await;
    }

    #[tokio::test]
    async fn compaction_waits_for_a_settled_turn_worker_to_release_the_session() {
        let root = tempfile::tempdir().unwrap();
        let host = fixture_host(&root.path().join("state"), "fixture");
        let session = host
            .new_session(root.path().canonicalize().unwrap())
            .await
            .unwrap();
        // The store shows no turn, while a finishing worker still holds the
        // session in the work table.
        let finishing = tokio::spawn(std::future::pending::<()>());
        host.work.lock().await.active.insert(
            session.clone(),
            Active {
                turn: TurnId::new("finishing").unwrap(),
                admitted: true,
                queued_steer: None,
                handle: finishing.abort_handle(),
                pending_stop: None,
                missed_stop: false,
            },
        );
        let compaction = tokio::spawn({
            let host = host.clone();
            let session = session.clone();
            async move {
                host.compact(CompactRequest {
                    session,
                    request: ChangeId::new("compact-after-answer").unwrap(),
                    recover: false,
                })
                .await
            }
        });
        tokio::time::sleep(Duration::from_millis(50)).await;
        assert!(!compaction.is_finished());
        host.work.lock().await.active.remove(&session);
        host.changed.notify_waiters();
        finishing.abort();
        let report = tokio::time::timeout(Duration::from_secs(5), compaction)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert_eq!(report.status, CompactionStatus::NoChange);
        host.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn legacy_inputs_with_no_model_can_only_use_the_exact_original_execution() {
        let root = tempfile::tempdir().unwrap();
        let original = fixture_host(&root.path().join("original"), "fixture");
        let session = original
            .new_session(root.path().canonicalize().unwrap())
            .await
            .unwrap();
        let view = original.store.inspect(session.clone()).await.unwrap();
        let request = fixture_prompt(&session, "legacy");
        let policy = original.submission_policy(&request, false).unwrap();
        let mut input = original
            .capture_input(&view, request.id, request.parts, policy)
            .await
            .unwrap();
        let mut stored: StoredPrompt = decode_input(&input).unwrap();
        stored.model = None;
        input.payload = encode_stored_prompt(&stored).unwrap();
        let birth = session_configuration(&view).unwrap().execution;
        assert!(CapturedRoute::admits(
            &input,
            original.execution().unwrap(),
            birth
        ));
        let selected = fixture_host(&root.path().join("selected"), "another-fixture");
        assert!(!CapturedRoute::admits(
            &input,
            selected.execution().unwrap(),
            birth
        ));
        let id = input.id.clone();
        original.store.submit(session.clone(), input).await.unwrap();
        let revision = original
            .store
            .inspect(session.clone())
            .await
            .unwrap()
            .revision;
        let turn = TurnId::new("legacy-turn").unwrap();
        let claim = new_claim(session.clone(), turn.clone(), revision, vec![id]).unwrap();
        let owner = original.store.claim(claim).await.unwrap();
        assert!(
            original
                .captured_turn_model(&session, &turn)
                .await
                .unwrap()
                .is_none()
        );
        assert!(
            original
                .transcript_input_facts(session, &[turn])
                .await
                .unwrap()
                .models
                .is_empty()
        );
        drop(owner);
        original.shutdown().await.unwrap();
        selected.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn a_chat_keeps_the_route_its_queued_input_was_accepted_under() {
        let root = tempfile::tempdir().unwrap();
        let state = root.path().join("state");
        let first = fixture_host(&state, "fixture");
        let session = first
            .new_session(root.path().canonicalize().unwrap())
            .await
            .unwrap();
        let view = first.store.inspect(session.clone()).await.unwrap();
        let queued = fixture_prompt(&session, "queued");
        let policy = first.submission_policy(&queued, false).unwrap();
        let captured = first
            .capture_input(&view, queued.id, queued.parts, policy)
            .await
            .unwrap();
        first.store.submit(session.clone(), captured).await.unwrap();
        first.shutdown().await.unwrap();
        drop(first);

        // The same credential owner, another model.
        let second = fixture_host(&state, "another-fixture");
        let view = second.store.inspect(session.clone()).await.unwrap();
        assert_eq!(
            second.check_execution(&view).await.unwrap_err().code,
            "session_queued_route_changed"
        );
        let resumed = second
            .resume_queue(
                session.clone(),
                ChangeId::new("resume").unwrap(),
                view.revision,
            )
            .await
            .unwrap_err();
        assert_eq!(resumed.code, "session_queued_route_changed");

        // Withdrawing the queued input lets the chat follow the new model.
        second
            .edit_queue(
                session.clone(),
                ChangeId::new("withdraw").unwrap(),
                view.revision,
                QueueEdit::Withdraw {
                    input: ChangeId::new("queued").unwrap(),
                },
            )
            .await
            .unwrap();
        let view = second.store.inspect(session.clone()).await.unwrap();
        assert!(view.queued.is_empty());
        second.check_execution(&view).await.unwrap();

        // Work accepted under the new route keeps the chat movable.
        let next = fixture_prompt(&session, "next");
        let policy = second.submission_policy(&next, false).unwrap();
        let captured = second
            .capture_input(&view, next.id, next.parts, policy)
            .await
            .unwrap();
        second
            .store
            .submit(session.clone(), captured)
            .await
            .unwrap();
        let view = second.store.inspect(session.clone()).await.unwrap();
        second.check_execution(&view).await.unwrap();
        second.shutdown().await.unwrap();
    }
}

pub enum QueueEdit {
    Replace {
        input: ChangeId,
        replacement: ChangeId,
        parts: Vec<PromptPart>,
        questions: bool,
        question_batches: bool,
    },
    Withdraw {
        input: ChangeId,
    },
    Reorder {
        inputs: Vec<ChangeId>,
    },
}

pub struct TurnControl {
    pub session: SessionId,
    pub turn: TurnId,
    pub request: ChangeId,
    pub expected_session: SessionRevision,
    pub expected_control: ControlRevision,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InputSettings {
    pub model: Option<agent_kit_core::ModelId>,
    #[serde(default)]
    pub operating_regime: OperatingRegime,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effort: Option<EffortPreset>,
    /// The reasoning level the input was accepted with. Part of the input's
    /// identity on retry; not published with its settings.
    #[serde(skip)]
    pub reasoning: Option<agent_kit_core::inference::ReasoningEffort>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_context_window: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_auto_compact_token_limit: Option<u64>,
    pub max_output_tokens: Option<u64>,
    #[serde(default)]
    pub questions: bool,
    #[serde(default)]
    pub allow_wakeups: bool,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub allow_library_selection: bool,
    /// Permission captured when this input was accepted, including on receipt-only retries.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub web_search: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub goal_start: Option<GoalRequest>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub goal_max_cost_mills: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub skills: Vec<crate::skills::SkillDescription>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_instruction_revision: Option<String>,
}

pub struct InputInspection {
    pub receipt: DurableSubmission,
    pub settings: InputSettings,
    pub parts: Vec<PromptPart>,
    pub text_editable: bool,
}

impl InputSettings {
    /// A retried input must carry the effort it was accepted with: its preset
    /// and its reasoning level, when the retry names them.
    pub(super) fn require_effort(
        &self,
        selection: Option<EffortPreset>,
        reasoning: Option<agent_kit_core::inference::ReasoningEffort>,
    ) -> Result<()> {
        if selection.is_some_and(|selected| selected != self.effort.unwrap_or_default())
            || reasoning.is_some_and(|level| Some(level) != self.reasoning)
        {
            return Err(problem(ErrorKind::Conflict, "submission_effort_changed"));
        }
        Ok(())
    }

    pub fn for_input(input: &Submission) -> Result<Self> {
        Self::with_parts(input).map(|(settings, _)| settings)
    }

    pub(crate) fn with_parts(input: &Submission) -> Result<(Self, Vec<PromptPart>)> {
        if input.payload.schema().as_str() != INPUT_SCHEMA {
            return Err(problem(
                ErrorKind::Unsupported,
                "unsupported_submission_schema",
            ));
        }
        match input.payload.version() {
            INPUT_VERSION => {
                let stored: StoredPrompt = decode_input(input)?;
                let goal_max_cost_mills = matches!(&stored.goal, Some(goals::GoalInput::Start(_)))
                    .then(|| {
                        stored
                            .spending
                            .as_ref()
                            .map(|selection| selection.maximum().to_owned())
                    })
                    .flatten();
                let settings = Self {
                    goal_max_cost_mills,
                    model: stored.model,
                    operating_regime: stored.operating_regime,
                    effort: stored.effort.map(|policy| policy.preset()),
                    reasoning: stored.reasoning,
                    model_context_window: stored
                        .context_limits
                        .and_then(|limits| limits.window)
                        .map(NonZeroU64::get),
                    model_auto_compact_token_limit: stored
                        .context_limits
                        .and_then(|limits| limits.auto_compact)
                        .map(NonZeroU64::get),
                    max_output_tokens: stored.max_output_tokens,
                    questions: stored.questions,
                    allow_wakeups: stored.allow_wakeups,
                    allow_library_selection: stored.allow_library_selection,
                    web_search: stored.request_options.web_search,
                    goal_start: match stored.goal {
                        Some(goals::GoalInput::Start(goal)) => Some(goal),
                        _ => None,
                    },
                    skills: stored
                        .guidance
                        .as_ref()
                        .map(|guidance| guidance.selected())
                        .unwrap_or_default(),
                    project_instruction_revision: stored
                        .guidance
                        .as_ref()
                        .and_then(|guidance| guidance.project_revision())
                        .map(str::to_owned),
                };
                Ok((settings, stored.parts))
            }
            _ => Err(problem(
                ErrorKind::Unsupported,
                "unsupported_submission_schema",
            )),
        }
    }
}

impl Host {
    pub(crate) async fn inspect_snapshot(
        &self,
        session: SessionId,
    ) -> Result<(SessionView, Option<u64>, bool)> {
        let (view, retry) = self
            .store
            .inspect_with_current(session.clone(), |current| {
                current.map_or(Ok(None), grida_agent_master::pending_retry_not_before)
            })
            .await?;
        let mut idle_queue_resume_available = false;
        if !view.admission_paused
            && view.current.is_none()
            && subagents::queued_work(&view).is_some()
        {
            // Enqueue and Resume hold admission from the durable write through their queue kick.
            let _admission = self.configuration_admission.lock().await;
            let work = self.work.lock().await;
            if !work.closed
                && !work.retiring.contains(&session)
                && !work.owns_queue_dispatch(&session)
            {
                // A worker may have claimed and completed this input since the initial read.
                // Confirm the same durable basis while dispatch cannot register a new worker.
                idle_queue_resume_available =
                    self.store.inspect(session).await?.revision == view.revision;
            }
        }
        Ok((view, retry, idle_queue_resume_available))
    }

    pub(super) async fn owned_control<T, F>(
        &self,
        operation: impl FnOnce(Host) -> F + Send + 'static,
    ) -> Result<T>
    where
        T: Send + 'static,
        F: std::future::Future<Output = Result<T>> + Send + 'static,
    {
        let permit = self.controls.clone().try_acquire_owned().map_err(|error| {
            if error == tokio::sync::TryAcquireError::Closed {
                problem(ErrorKind::Unavailable, "host_shutting_down")
            } else {
                problem(ErrorKind::LimitExceeded, "host_control_limit")
            }
        })?;
        let host = self.clone();
        tokio::spawn(async move {
            // A disconnected caller drops its response, while the bounded
            // host task keeps its settings capture and durable write together.
            let changed = host.changed.clone();
            let result = operation(host).await;
            drop(permit);
            changed.notify_waiters();
            result
        })
        .await
        .map_err(|_| problem(ErrorKind::Uncertain, "control_worker_interrupted"))?
    }

    pub async fn enqueue(&self, request: PromptRequest) -> Result<DurableSubmission> {
        self.enqueue_with_context(request, SubmissionContext::default())
            .await
    }

    /// Queue a request that keeps its editor binding until it runs.
    pub(crate) async fn enqueue_with_context(
        &self,
        request: PromptRequest,
        context: SubmissionContext,
    ) -> Result<DurableSubmission> {
        self.owned_control(move |host| async move { host.enqueue_owned(request, context).await })
            .await
    }

    async fn enqueue_owned(
        &self,
        request: PromptRequest,
        context: SubmissionContext,
    ) -> Result<DurableSubmission> {
        validate_prompt_parts(&request.parts)?;
        if let Some(accepted) = self.existing_submission(&request, &context).await? {
            return Ok(accepted);
        }
        let (host, options) = self.for_foreground(&request.session, &context).await?;
        let admission = self.configuration_admission.lock().await;
        if let Some(accepted) = self.existing_submission(&request, &context).await? {
            return Ok(accepted);
        }
        if self.work.lock().await.closed {
            return Err(problem(ErrorKind::Unavailable, "host_shutting_down"));
        }
        let view = self.store.inspect(request.session.clone()).await?;
        host.check_new_submission(&view).await?;
        if view.current.is_none() && !view.admission_paused {
            self.check_ready_capacity(&request.session).await?;
        }
        let mut policy = host.submission_policy(&request, context.allow_wakeups)?;
        policy.selection_revision = context.selection_revision;
        policy.request_options = options;
        host.bind_editor(&mut policy, &request, &context)?;
        let title = host.title_candidate(&view, &request.parts, context.initial_title)?;
        let input = host
            .capture_input(&view, request.id, request.parts, policy)
            .await?;
        let acceptance = host
            .accept_with_title(request.session, input, None, title)
            .await?
            .start_title();
        self.kick_queue(acceptance.session.clone()).await;
        drop(admission);
        Ok(DurableSubmission {
            session: acceptance.session,
            input: acceptance.input,
            position: acceptance.position,
            disposition: InputDisposition::Queued,
        })
    }

    pub(super) async fn check_ready_capacity(&self, session: &SessionId) -> Result<()> {
        let work = self.work.lock().await;
        if work.active.len() >= MAX_ACTIVE_RUNS
            && work.ready.len() >= MAX_READY_SESSIONS
            && !work.ready.iter().any(|ready| ready.session() == session)
            && !work.active.contains_key(session)
        {
            return Err(problem(ErrorKind::LimitExceeded, "host_ready_queue_limit"));
        }
        Ok(())
    }

    pub async fn inspect_input(&self, session: SessionId, id: ChangeId) -> Result<InputInspection> {
        let view = self
            .store
            .input(session.clone(), id.clone())
            .await?
            .ok_or_else(|| problem(ErrorKind::Unavailable, "input_unavailable"))?;
        let (settings, mut parts) = InputSettings::with_parts(&view.input)?;
        let mut selected = settings.skills.iter();
        for part in &mut parts {
            // The snapshot retains explicit selections in input order. Two
            // packages can contribute the same local name.
            if let PromptPart::Skill { reference } = part
                && let Some(skill) = selected.next()
                && reference.uri().is_none()
            {
                *reference =
                    crate::skills::SkillReference::from_uri(&skill.uri)?.ok_or_else(|| {
                        problem(ErrorKind::InvalidState, "invalid_captured_skill_reference")
                    })?;
            }
        }
        Ok(InputInspection {
            text_editable: view.disposition == InputDisposition::Queued
                && super::queued_text::text_editable(&view.input),
            receipt: DurableSubmission {
                session,
                input: id,
                position: view.position,
                disposition: view.disposition,
            },
            settings,
            parts,
        })
    }

    pub async fn edit_queue(
        &self,
        session: SessionId,
        request: ChangeId,
        expected: SessionRevision,
        edit: QueueEdit,
    ) -> Result<ControlReceipt> {
        self.owned_control(move |host| async move {
            host.edit_queue_owned(session, request, expected, edit)
                .await
        })
        .await
    }

    async fn edit_queue_owned(
        &self,
        session: SessionId,
        request: ChangeId,
        expected: SessionRevision,
        edit: QueueEdit,
    ) -> Result<ControlReceipt> {
        let host = if let QueueEdit::Replace {
            input, replacement, ..
        } = &edit
            && self.has_routes()
            && self
                .store
                .input(session.clone(), replacement.clone())
                .await?
                .is_none()
            && let Some(previous) = self.store.input(session.clone(), input.clone()).await?
        {
            self.for_retained_input(&previous.input, "session_queued_route_changed")
                .await?
        } else {
            self.clone()
        };
        // Capture settings atomically with new queue inputs. A retry reuses
        // the retained replacement's payload rather than recapturing defaults.
        let _admission = self.configuration_admission.lock().await;
        let action = match edit {
            QueueEdit::Replace {
                input,
                replacement,
                parts,
                questions,
                question_batches,
            } => {
                validate_prompt_parts(&parts)?;
                let original = self.store.input(session.clone(), input.clone()).await?;
                let original = original
                    .as_ref()
                    .filter(|input| input.disposition == InputDisposition::Queued)
                    .map(|input| &input.input);
                let original_settings = original.map(InputSettings::for_input).transpose()?;
                if original_settings
                    .as_ref()
                    .is_some_and(|settings| settings.goal_start.is_some())
                {
                    return Err(problem(
                        ErrorKind::Conflict,
                        "queued_goal_requires_withdrawal",
                    ));
                }
                if original_settings
                    .as_ref()
                    .is_some_and(|settings| settings.allow_library_selection)
                {
                    return Err(problem(
                        ErrorKind::Conflict,
                        "queued_library_selection_requires_withdrawal",
                    ));
                }
                let replacement = if let Some(previous) = self
                    .store
                    .input(session.clone(), replacement.clone())
                    .await?
                {
                    check_input(&previous.input, &parts)?;
                    if InputSettings::for_input(&previous.input)?.allow_library_selection {
                        return Err(problem(
                            ErrorKind::Conflict,
                            "queued_library_selection_requires_withdrawal",
                        ));
                    }
                    previous.input
                } else {
                    let view = self.store.inspect(session.clone()).await?;
                    host.check_new_submission(&view).await?;
                    let operating_regime = if !self.operating_regime.is_act() {
                        self.operating_regime
                    } else {
                        original_settings
                            .map_or(self.operating_regime, |settings| settings.operating_regime)
                    };
                    let stored = original
                        .filter(|input| is_stored_input(&input.payload))
                        .map(decode_input::<StoredPrompt>)
                        .transpose()?;
                    let capture = stored
                        .as_ref()
                        .and_then(|input| input.host_tools_capture.as_ref());
                    if let Some(capture) = capture {
                        host.retained_host_tools(capture)?;
                    }
                    let allow_host_tools = capture.is_some();
                    let desktop_image_generation = stored
                        .as_ref()
                        .and_then(|input| input.desktop_image_generation.clone());
                    let allow_image_placement = stored
                        .as_ref()
                        .is_some_and(|input| input.allow_image_placement);
                    let spending = stored.as_ref().and_then(|input| input.spending.clone());
                    let reasoning = stored.as_ref().and_then(|input| input.reasoning);
                    let options = stored
                        .as_ref()
                        .map(|input| input.request_options)
                        .unwrap_or_default();
                    let effort = stored.and_then(|input| input.effort);
                    host.capture_input(
                        &view,
                        replacement,
                        parts,
                        SubmissionPolicy {
                            request_options: options,
                            selection_revision: None,
                            selection_goal: false,
                            questions,
                            question_batches,
                            allow_wakeups: false,
                            allow_library_selection: false,
                            allow_host_tools,
                            desktop_image_generation,
                            allow_image_placement,
                            editor_endpoint: None,
                            editor_presentation: false,
                            editor_browser_tools: false,
                            editor_svg_target: None,
                            editor_tool_context_id: None,
                            operating_regime,
                            subagent: None,
                            effort,
                            reasoning,
                            spending,
                        },
                    )
                    .await?
                };
                SessionControl::ReplaceQueued { input, replacement }
            }
            QueueEdit::Withdraw { input } => SessionControl::WithdrawQueued { input },
            QueueEdit::Reorder { inputs } => SessionControl::ReorderQueued { inputs },
        };
        self.store
            .control(ControlRequest {
                id: request,
                session,
                expected_revision: expected,
                action,
            })
            .await
    }

    pub async fn resume_queue(
        &self,
        session: SessionId,
        request: ChangeId,
        expected: SessionRevision,
    ) -> Result<ControlReceipt> {
        self.owned_control(move |host| async move {
            let control = ControlRequest {
                id: request,
                session: session.clone(),
                expected_revision: expected,
                action: SessionControl::ResumeAdmission,
            };
            if let Some(receipt) = host.store.control_receipt(control.clone()).await? {
                // Recover a committed Resume whose worker never claimed its
                // queue, without allowing the retry to release newer work.
                host.kick_queue_at(session, Some(receipt.revision)).await;
                return Ok(receipt);
            }
            let view = host.store.inspect(session.clone()).await?;
            if view.current.is_none()
                && let Some(head) = super::subagents::queued_work(&view)
            {
                host.for_retained_input(head, "session_queued_route_changed")
                    .await?
                    .check_execution(&view)
                    .await?;
                host.check_ready_capacity(&session).await?;
            }
            let _admission = host.configuration_admission.lock().await;
            let receipt = host.store.control(control).await?;
            host.kick_queue(session).await;
            Ok(receipt)
        })
        .await
    }

    pub async fn pause(&self, control: TurnControl) -> Result<ControlReceipt> {
        self.owned_control(move |host| async move {
            host.pause_sponsorship(ControlRequest {
                id: control.request,
                session: control.session,
                expected_revision: control.expected_session,
                action: SessionControl::Turn {
                    turn: control.turn,
                    expected: control.expected_control,
                    directive: ControlDirective::Pause,
                },
            })
            .await
        })
        .await
    }

    pub async fn resume(
        &self,
        control: TurnControl,
        epoch: u64,
        position: JournalPosition,
    ) -> Result<TurnView> {
        let request = ClaimRequest {
            id: control.request,
            session: control.session.clone(),
            expected_revision: control.expected_session,
            selection: TurnSelection::ResumePaused {
                turn: control.turn.clone(),
                epoch,
                position,
                control_revision: control.expected_control,
            },
        };
        self.resume_claim(request, control.turn).await
    }

    /// Suspension is durable before the old worker releases its host slot.
    /// A client resuming that exact turn waits for the existing owner to leave;
    /// other active work keeps the ordinary registration refusal.
    async fn suspended_work(
        &self,
        session: &SessionId,
        turn: &TurnId,
    ) -> Result<MutexGuard<'_, Work>> {
        let deadline = tokio::time::Instant::now() + SETTLING_WORKER_WAIT;
        loop {
            let released = self.changed.notified();
            tokio::pin!(released);
            released.as_mut().enable();
            let work = self.work.lock().await;
            if work.closed
                || work.retiring.contains(session)
                || !work
                    .active
                    .get(session)
                    .is_some_and(|active| active.admitted && active.turn == *turn)
            {
                return Ok(work);
            }
            // This concrete store read has no Host callbacks. Keep registration
            // locked so a new owner of the same turn cannot replace this one
            // between observing suspension and deciding to await retirement.
            let view = self.store.inspect(session.clone()).await?;
            if !view.current.as_ref().is_some_and(|current| {
                current.binding.turn == *turn && current.disposition == TurnDisposition::Suspended
            }) {
                return Ok(work);
            }
            drop(work);
            if tokio::time::timeout_at(deadline, released).await.is_err() {
                return Ok(self.work.lock().await);
            }
        }
    }

    pub(super) async fn resume_claim(
        &self,
        request: ClaimRequest,
        turn: TurnId,
    ) -> Result<TurnView> {
        if let Some(view) = self.resume_receipt(request.clone()).await? {
            return Ok(view);
        }
        let session = request.session.clone();
        // A goal's work turn resumes only through goal control. Decide that
        // before admission, so the refusal does not depend on whether the
        // paused turn's worker has released the session yet.
        let goal_turn = self
            .store
            .inspect_turn_with(session.clone(), turn.clone(), |state| {
                Ok(grida_agent_master::goals::Goal::reservation_for_turn(state)?.is_some())
            })
            .await?;
        if goal_turn {
            let view = self.store.inspect(session.clone()).await?;
            goals::require_resumable(&view, &turn)?;
        }
        let ticket = {
            let mut work = self.suspended_work(&session, &turn).await?;
            self.register(
                &mut work,
                session.clone(),
                turn.clone(),
                Launch::Resume(request.clone()),
            )
        };
        let ticket = match ticket {
            Ok(ticket) => ticket,
            Err(error) => return self.resume_receipt(request).await?.ok_or(error),
        };
        ticket
            .admission
            .await
            .map_err(|_| problem(ErrorKind::Uncertain, "admission_worker_interrupted"))??;
        self.store.inspect_turn(session, turn).await
    }

    pub(super) async fn kick_stopped(&self, session: SessionId, turn: TurnId) {
        if self.work.lock().await.closed {
            return;
        }
        let Ok(view) = self.store.inspect_turn(session.clone(), turn.clone()).await else {
            return;
        };
        if !view.controls.cancelled
            || !matches!(
                view.disposition,
                TurnDisposition::Suspended | TurnDisposition::Interrupted
            )
        {
            return;
        }
        let Ok(id) = change_id() else { return };
        let recovery = RecoveryRequest {
            id,
            session: session.clone(),
            turn: turn.clone(),
            expected_epoch: view.binding.epoch,
        };
        let mut work = self.work.lock().await;
        if work.closed {
            return;
        }
        if let Some(active) = work.active.get_mut(&session) {
            match &active.pending_stop {
                None => active.pending_stop = Some(turn),
                Some(pending) if pending != &turn => {
                    // Revisit other durable stops after this worker releases.
                    active.missed_stop = true;
                }
                Some(_) => {}
            }
            return;
        }
        if work.active.len() >= MAX_ACTIVE_RUNS {
            work.defer(ReadyWork::Stop(session, turn));
            return;
        }
        let _ = self.register(&mut work, session, turn, Launch::RecoverStopped(recovery));
    }

    /// Revisit one bounded page after a stop wake could not fit in memory.
    /// Only a durably cancelled turn under this host's authority can be
    /// registered; inspection itself never starts provider work.
    pub(super) async fn scan_missed_stops(&self) {
        let after = {
            let mut work = self.work.lock().await;
            if work.closed || work.active.len() >= MAX_ACTIVE_RUNS {
                return;
            }
            if !work.stop_scan_active {
                if !work.missed_stops {
                    return;
                }
                work.missed_stops = false;
                work.stop_scan_active = true;
                work.stop_scan_after = None;
            }
            work.stop_scan_after.clone()
        };

        let page = self.store.active_turn_page(after).await;
        let mut last = None;
        let mut more = false;
        if let Ok(page) = &page {
            for (index, entry) in page.entries.iter().enumerate() {
                {
                    let work = self.work.lock().await;
                    if work.closed || work.active.len() >= MAX_ACTIVE_RUNS {
                        more = true;
                        break;
                    }
                }
                last = Some(entry.session.clone());
                more = index + 1 < page.entries.len() || page.next_after.is_some();
                if self
                    .retire_worker_if_owner_finished(&entry.session, &entry.turn)
                    .await
                    .is_err()
                {
                    self.work.lock().await.missed_stops = true;
                }
                let Ok(turn) = self
                    .store
                    .inspect_turn(entry.session.clone(), entry.turn.clone())
                    .await
                else {
                    continue;
                };
                if !turn.controls.cancelled
                    || !matches!(
                        turn.disposition,
                        TurnDisposition::Suspended | TurnDisposition::Interrupted
                    )
                {
                    continue;
                }
                let Ok(view) = self.store.inspect(entry.session.clone()).await else {
                    continue;
                };
                if !view
                    .current
                    .as_ref()
                    .is_some_and(|current| current.binding.turn == entry.turn)
                {
                    continue;
                }
                self.kick_stopped(entry.session.clone(), entry.turn.clone())
                    .await;
                // Interleave ordinary ready work with cancellation recovery.
                break;
            }
        }

        let mut work = self.work.lock().await;
        if page.is_err() {
            work.stop_scan_active = false;
            work.stop_scan_after = None;
            eprintln!("[agent] stopped-turn recovery scan unavailable");
        } else if more {
            if let Some(last) = last {
                work.stop_scan_after = Some(last);
            }
        } else {
            work.stop_scan_active = false;
            work.stop_scan_after = None;
        }
    }

    pub async fn steer(
        &self,
        control: TurnControl,
        expected_history: HistoryPosition,
        parts: Vec<PromptPart>,
    ) -> Result<ControlReceipt> {
        validate_prompt_parts(&parts)?;
        if parts
            .iter()
            .any(|part| matches!(part, PromptPart::Skill { .. }))
        {
            return Err(problem(
                ErrorKind::InvalidInput,
                "skill_selection_requires_new_input",
            ));
        }
        let mut messages = prompt_input(&control.request, &parts)?;
        for message in &mut messages {
            message.id = MessageId::new(format!("steer/{}", message.id.as_str()))?;
        }
        self.owned_control(move |host| async move {
            if host
                .compaction_plan(control.session.clone(), control.turn.clone())
                .await?
                .is_some()
            {
                return Err(problem(ErrorKind::Conflict, "cannot_steer_compaction"));
            }
            host.store
                .control(ControlRequest {
                    id: control.request,
                    session: control.session,
                    expected_revision: control.expected_session,
                    action: SessionControl::AppendHistory {
                        turn: control.turn,
                        expected: control.expected_control,
                        expected_history,
                        records: messages.into_iter().map(HistoryRecord::Message).collect(),
                    },
                })
                .await
        })
        .await
    }
}

pub(super) fn check_input(input: &Submission, parts: &[PromptPart]) -> Result<StoredPrompt> {
    if input.payload.schema().as_str() != INPUT_SCHEMA || input.payload.version() != INPUT_VERSION {
        return Err(problem(
            ErrorKind::Unsupported,
            "unsupported_submission_schema",
        ));
    }
    let previous: StoredPrompt = decode_input(input)?;
    if previous.goal.is_some() || !images::same_prompt(&previous.parts, parts) {
        return Err(problem(ErrorKind::Conflict, "submission_input_changed"));
    }
    Ok(previous)
}
