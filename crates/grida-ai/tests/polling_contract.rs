//! Independently authored lifecycle contracts, with no provider/account I/O.
//! Paused time checks cadence and deadlines without making tests take minutes.
use grida_ai::{
    Catalog, ExecutionAuthority, HttpFuture, Lane, MediaClient, MediaResult, Request, Response,
    ResponseCompletion, Selector, Transport,
};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    collections::VecDeque,
    sync::Arc,
    sync::Mutex,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};
use tokio::time::Instant;
use tokio_util::sync::CancellationToken;

#[derive(Clone, Copy, Debug)]
enum Protocol {
    Fal,
    OpenRouter,
    Tripo,
}
const PROTOCOLS: [Protocol; 3] = [Protocol::Fal, Protocol::OpenRouter, Protocol::Tripo];

struct Step {
    method: &'static str,
    url: &'static str,
    lane: Lane,
    headers: BTreeMap<String, String>,
    body: Option<Value>,
    at_secs: u64,
    response: Response,
}
struct Script {
    started: Instant,
    steps: Mutex<VecDeque<Step>>,
}
impl Script {
    fn new(steps: Vec<Step>) -> Arc<Self> {
        Arc::new(Self {
            started: Instant::now(),
            steps: Mutex::new(steps.into()),
        })
    }
    fn assert_complete(&self) {
        assert!(
            self.steps.lock().unwrap().is_empty(),
            "unfinished lifecycle"
        );
    }
}
impl Transport for Script {
    fn request(&self, request: Request) -> HttpFuture<'_> {
        Box::pin(async move {
            let step = self
                .steps
                .lock()
                .unwrap()
                .pop_front()
                .expect("extra request");
            // Exact ordering also rejects a second paid submission on any path.
            assert_eq!(request.method, step.method);
            assert_eq!(request.url, step.url);
            assert_eq!(request.lane, step.lane);
            assert_eq!(request.headers, step.headers);
            assert_eq!(request.completion, ResponseCompletion::Body);
            if let Some(body) = step.body {
                assert_eq!(
                    serde_json::from_slice::<Value>(&request.body).unwrap(),
                    body
                );
            } else {
                assert!(request.body.is_empty());
            }
            assert_eq!(self.started.elapsed(), Duration::from_secs(step.at_secs));
            Ok(step.response)
        })
    }
}
fn response(body: Vec<u8>, media_type: &str) -> Response {
    Response {
        status: 200,
        headers: BTreeMap::from([("content-type".into(), media_type.into())]),
        body,
    }
}
impl Protocol {
    fn provider(self) -> &'static str {
        match self {
            Self::Fal => "fal",
            Self::OpenRouter => "openrouter",
            Self::Tripo => "tripo",
        }
    }
    fn interval(self) -> u64 {
        match self {
            Self::Fal => 1,
            _ => 2,
        }
    }
    fn deadline(self) -> u64 {
        match self {
            Self::Fal => 120,
            Self::OpenRouter => 300,
            Self::Tripo => 600,
        }
    }
    fn json(
        self,
        method: &'static str,
        url: &'static str,
        body: Option<Value>,
        reply: Value,
        at_secs: u64,
    ) -> Step {
        let mut headers = BTreeMap::from([(
            "authorization".into(),
            match self {
                Self::Fal => "Key synthetic-key",
                _ => "Bearer synthetic-key",
            }
            .into(),
        )]);
        if !matches!(self, Self::Tripo) || body.is_some() {
            headers.insert("content-type".into(), "application/json".into());
        }
        if matches!(self, Self::Tripo) {
            headers.insert("accept".into(), "application/json".into());
        }
        Step {
            method,
            url,
            lane: Lane::Provider,
            headers,
            body,
            at_secs,
            response: response(serde_json::to_vec(&reply).unwrap(), "application/json"),
        }
    }
    fn submit(self) -> Step {
        match self {
            Self::Fal => self.json("POST", "https://queue.fal.run/fal-ai/flux-2-pro", Some(json!({"prompt":"test","num_images":1})), json!({"status_url":"https://queue.fal.run/job/status","response_url":"https://queue.fal.run/job/result"}), 0),
            Self::OpenRouter => self.json("POST", "https://openrouter.ai/api/v1/videos", Some(json!({"model":"bytedance/seedance-2.0","prompt":"test"})), json!({"id":"job"}), 0),
            Self::Tripo => self.json("POST", "https://openapi.tripo3d.ai/v3/generation/text-to-model", Some(json!({"model":"v3.1-20260211","prompt":"test","texture":true,"pbr":true})), json!({"code":0,"data":{"task_id":"task_test"}}), 0),
        }
    }
    fn poll(self, state: &str, at_secs: u64) -> Step {
        let (url, reply) = match self {
            Self::Fal => (
                "https://queue.fal.run/job/status",
                json!({"status":match state {"queued"=>"IN_QUEUE","running"=>"IN_PROGRESS","success"=>"COMPLETED",_=>"FAILED"}}),
            ),
            Self::OpenRouter => (
                "https://openrouter.ai/api/v1/videos/job",
                json!({"status":if state=="success" {"completed"} else {state}}),
            ),
            Self::Tripo => (
                "https://openapi.tripo3d.ai/v3/tasks/task_test",
                json!({"code":0,"data":{"task_id":"task_test","type":"text_to_model","status":state,"progress":50,"credits_consumed":1,"output":{"model_url":"https://cdn.tripo3d.ai/result.glb"}}}),
            ),
        };
        self.json("GET", url, None, reply, at_secs)
    }
    fn result_steps(self, at_secs: u64) -> Vec<Step> {
        // Tiny synthetic payloads exercise transport/container validation, not codecs.
        let (url, media_type, bytes) = match self {
            Self::Fal => (
                "https://fal.media/result.png",
                "image/png",
                b"\x89PNG\r\n\x1a\n".to_vec(),
            ),
            Self::OpenRouter => (
                "https://openrouter.ai/api/v1/videos/job/content?index=0",
                "video/mp4",
                vec![1, 2, 3],
            ),
            Self::Tripo => {
                let json = b"{\"asset\":{\"version\":\"2.0\"}} ";
                let mut glb = b"glTF".to_vec();
                glb.extend(2u32.to_le_bytes());
                glb.extend((20 + json.len() as u32).to_le_bytes());
                glb.extend((json.len() as u32).to_le_bytes());
                glb.extend(b"JSON");
                glb.extend(json);
                (
                    "https://cdn.tripo3d.ai/result.glb",
                    "model/gltf-binary",
                    glb,
                )
            }
        };
        let mut result = self.json("GET", url, None, Value::Null, at_secs);
        result.response = response(bytes, media_type);
        if !matches!(self, Self::OpenRouter) {
            result.lane = Lane::Download;
            result.headers.clear();
        }
        let mut steps = vec![];
        if matches!(self, Self::Fal) {
            steps.push(self.json(
                "GET",
                "https://queue.fal.run/job/result",
                None,
                json!({"images":[{"url":url,"content_type":media_type}]}),
                at_secs,
            ));
        }
        steps.push(result);
        steps
    }
    async fn execute(
        self,
        http: Arc<dyn Transport>,
        cancellation: CancellationToken,
    ) -> grida_ai::Result<MediaResult> {
        let (kind, model) = match self {
            Self::Fal => ("image", "bfl/flux-2-pro"),
            Self::OpenRouter => ("video", "bytedance/seedance-2.0"),
            Self::Tripo => ("three-d", "tripo/h3.1"),
        };
        let parsed = Catalog::bundled()
            .parse_input(
                &Selector {
                    kind: kind.into(),
                    model_id: model.into(),
                    provider: self.provider().into(),
                    variant: Some("text".into()),
                    feature: matches!(self, Self::Tripo).then(|| "model-generation".into()),
                },
                json!({"prompt":"test"}),
            )
            .unwrap();
        MediaClient::new(http)
            .execute(
                &parsed,
                ExecutionAuthority::Byok {
                    provider: self.provider().into(),
                    key: "synthetic-key".into(),
                },
                cancellation,
            )
            .await
    }
}

#[tokio::test(start_paused = true)]
async fn queued_running_success_obeys_cadence_and_submits_once() {
    for protocol in PROTOCOLS {
        let interval = protocol.interval();
        let mut steps = vec![
            protocol.submit(),
            protocol.poll("queued", 0),
            protocol.poll("running", interval),
            protocol.poll("success", 2 * interval),
        ];
        steps.extend(protocol.result_steps(2 * interval));
        let expected_bytes = steps.last().unwrap().response.body.clone();
        let http = Script::new(steps);
        let result = protocol
            .execute(http.clone(), CancellationToken::new())
            .await
            .unwrap();
        assert_eq!(result.assets.len(), 1);
        assert_eq!(result.assets[0].data, expected_bytes);
        if matches!(protocol, Protocol::Tripo) {
            assert_eq!(result.task.unwrap().id, "task_test");
        }
        http.assert_complete();
    }
}

#[tokio::test(start_paused = true)]
async fn cancellation_during_poll_wait_stops_without_another_request() {
    for protocol in PROTOCOLS {
        let http = Script::new(vec![protocol.submit(), protocol.poll("queued", 0)]);
        let cancellation = CancellationToken::new();
        let operation = protocol.execute(http.clone(), cancellation.clone());
        tokio::pin!(operation);
        // Poll until waiting, without allowing paused time to advance to the timer.
        tokio::select! { biased;
            result = &mut operation => panic!("operation completed before cancellation: {result:?}"),
            _ = std::future::ready(()) => {}
        }
        http.assert_complete();
        cancellation.cancel();
        let error = operation.await.unwrap_err();
        assert_eq!(error.code, "aborted");
        assert_eq!(
            error.task_id.as_deref(),
            matches!(protocol, Protocol::Tripo).then_some("task_test")
        );
        assert_eq!(http.started.elapsed(), Duration::ZERO);
    }
}

#[tokio::test(start_paused = true)]
async fn terminal_failure_after_queue_does_not_resubmit_or_fetch_result() {
    for protocol in PROTOCOLS {
        let http = Script::new(vec![
            protocol.submit(),
            protocol.poll("queued", 0),
            protocol.poll("failed", protocol.interval()),
        ]);
        let error = protocol
            .execute(http.clone(), CancellationToken::new())
            .await
            .unwrap_err();
        assert_eq!(error.code, "generation_failed");
        assert_eq!(
            error.task_id.as_deref(),
            matches!(protocol, Protocol::Tripo).then_some("task_test")
        );
        http.assert_complete();
    }
}

#[tokio::test(start_paused = true)]
async fn a_perpetually_queued_task_stops_at_the_deadline_without_resubmission() {
    for protocol in PROTOCOLS {
        let mut steps = vec![protocol.submit()];
        steps.extend(
            (0..protocol.deadline())
                .step_by(protocol.interval() as usize)
                .map(|secs| protocol.poll("queued", secs)),
        );
        let http = Script::new(steps);
        let error = protocol
            .execute(http.clone(), CancellationToken::new())
            .await
            .unwrap_err();
        assert_eq!(error.code, "timeout");
        assert_eq!(
            error.task_id.as_deref(),
            matches!(protocol, Protocol::Tripo).then_some("task_test")
        );
        assert_eq!(
            http.started.elapsed(),
            Duration::from_secs(protocol.deadline())
        );
        http.assert_complete();
    }
}

struct Dropped(Arc<AtomicBool>);
impl Drop for Dropped {
    fn drop(&mut self) {
        self.0.store(true, Ordering::SeqCst);
    }
}
struct HoldingPoll {
    script: Arc<Script>,
    dropped: Arc<AtomicBool>,
}
impl Transport for HoldingPoll {
    fn request(&self, request: Request) -> HttpFuture<'_> {
        Box::pin(async move {
            let hold = request.method == "GET";
            let response = self.script.request(request).await?;
            if hold {
                let _lifetime = Dropped(self.dropped.clone());
                std::future::pending::<()>().await;
            }
            Ok(response)
        })
    }
}

#[tokio::test(start_paused = true)]
async fn absolute_deadline_drops_a_stalled_poll_response_without_resubmission() {
    for protocol in PROTOCOLS {
        let script = Script::new(vec![protocol.submit(), protocol.poll("queued", 0)]);
        let dropped = Arc::new(AtomicBool::new(false));
        let http = Arc::new(HoldingPoll {
            script: script.clone(),
            dropped: dropped.clone(),
        });
        // An independent watchdog makes a missing production deadline fail,
        // rather than hanging the suite or letting the test cancel it for us.
        let error = tokio::time::timeout(
            Duration::from_secs(protocol.deadline() + 1),
            protocol.execute(http, CancellationToken::new()),
        )
        .await
        .expect("production deadline did not settle the held-open request")
        .unwrap_err();
        assert_eq!(error.code, "timeout");
        assert_eq!(
            error.task_id.as_deref(),
            matches!(protocol, Protocol::Tripo).then_some("task_test")
        );
        assert!(dropped.load(Ordering::SeqCst));
        assert_eq!(
            script.started.elapsed(),
            Duration::from_secs(protocol.deadline())
        );
        script.assert_complete();
    }
}
