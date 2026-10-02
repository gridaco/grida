#[path = "support/wire.rs"]
mod wire;
use base64::{Engine, engine::general_purpose::STANDARD};
use grida_ai::{
    Catalog, ExecutionAuthority, HttpFuture, MediaClient, Request, Response, Selector, Transport,
};
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};
use tokio_util::sync::CancellationToken;

struct Replay {
    id: String,
    entries: Mutex<Vec<Value>>,
    count: Mutex<usize>,
}
impl Transport for Replay {
    fn request(&self, request: Request) -> HttpFuture<'_> {
        Box::pin(async move {
            let mut count = self.count.lock().unwrap();
            let entries = self.entries.lock().unwrap();
            let step = entries.get(*count).unwrap_or_else(|| {
                panic!(
                    "{}: unexpected request {} {}",
                    self.id, request.method, request.url
                )
            });
            *count += 1;
            wire::compare(&request, &step["request"])
                .unwrap_or_else(|error| panic!("{} wire step {}: {error}", self.id, *count));
            let response = &step["response"];
            let bytes = STANDARD
                .decode(response["base64"].as_str().unwrap())
                .unwrap();
            assert!(bytes.len() <= request.max_bytes);
            Ok(Response {
                status: response["status"].as_u64().unwrap() as u16,
                headers: serde_json::from_value(response["headers"].clone()).unwrap(),
                body: bytes,
            })
        })
    }
}

#[tokio::test]
async fn every_existing_operation_matches_typescript_wire_and_output() {
    let vectors: Vec<Value> =
        serde_json::from_str(include_str!("fixtures/media-wire-vectors.json")).unwrap();
    assert_eq!(vectors.len(), 112);
    for vector in vectors {
        let selector: Selector = serde_json::from_value(vector["selector"].clone()).unwrap();
        let parsed = Catalog::bundled()
            .parse_input(&selector, vector["input"].clone())
            .unwrap_or_else(|e| panic!("{}: {e}", vector["id"]));
        let replay = Arc::new(Replay {
            id: vector["id"].as_str().unwrap().into(),
            entries: Mutex::new(vector["transcript"].as_array().unwrap().clone()),
            count: Mutex::new(0),
        });
        let authority = if selector.provider == "gg" {
            ExecutionAuthority::Gateway {
                token: "synthetic-token".into(),
                base_url: "https://gg.example".into(),
                expires_at_ms: i64::MAX,
            }
        } else {
            ExecutionAuthority::Byok {
                provider: selector.provider,
                key: "synthetic-key".into(),
            }
        };
        let result = MediaClient::new(replay.clone())
            .execute(&parsed, authority, CancellationToken::new())
            .await
            .unwrap_or_else(|e| panic!("{}: {e}", vector["id"]));
        assert_eq!(
            *replay.count.lock().unwrap(),
            replay.entries.lock().unwrap().len(),
            "{} incomplete transcript",
            vector["id"]
        );
        let mut encoded = json!({});
        if let Some(findings) = result.findings {
            encoded = findings;
        } else {
            let assets=result.assets.iter().map(|a|json!({"data":{"base64":STANDARD.encode(&a.data)},"media_type":a.media_type})).collect::<Vec<_>>();
            encoded[&result.field] = if result.field == "audio" || result.field == "glb" {
                assets[0].clone()
            } else {
                assets.into()
            };
        }
        if let Some(task) = result.task {
            encoded["task"] = serde_json::to_value(task).unwrap();
        }
        assert_eq!(encoded, vector["result"], "{} output", vector["id"]);
    }
}

struct Refuse {
    calls: Mutex<usize>,
}
impl Transport for Refuse {
    fn request(&self, _request: Request) -> HttpFuture<'_> {
        *self.calls.lock().unwrap() += 1;
        Box::pin(async { Err(grida_ai::TransportError) })
    }
}

#[tokio::test]
async fn failed_paid_requests_are_not_replayed_and_errors_have_no_cause() {
    let http = Arc::new(Refuse {
        calls: Mutex::new(0),
    });
    let client = MediaClient::new(http.clone());
    let selector = Selector {
        kind: "image".into(),
        model_id: "openai/gpt-image-2".into(),
        provider: "openrouter".into(),
        variant: Some("text".into()),
        feature: None,
    };
    let parsed = Catalog::bundled()
        .parse_input(&selector, json!({"prompt":"secret","n":8}))
        .unwrap();
    let error = client
        .execute(
            &parsed,
            ExecutionAuthority::Byok {
                provider: "openrouter".into(),
                key: "secret-key".into(),
            },
            CancellationToken::new(),
        )
        .await
        .unwrap_err();
    assert_eq!(
        serde_json::to_value(error).unwrap(),
        json!({"code":"generation_failed","message":"generation_failed"})
    );
    assert_eq!(*http.calls.lock().unwrap(), 1);
}

#[tokio::test]
async fn pre_cancelled_invocations_and_invalid_inputs_never_acquire_transport() {
    let http = Arc::new(Refuse {
        calls: Mutex::new(0),
    });
    let client = MediaClient::new(http.clone());
    let token = CancellationToken::new();
    token.cancel();
    let selector = Selector {
        kind: "image".into(),
        model_id: "openai/gpt-image-2".into(),
        provider: "openrouter".into(),
        variant: None,
        feature: None,
    };
    let mut parsed = Catalog::bundled()
        .parse_input(&selector, json!({"prompt":"test"}))
        .unwrap();
    let error = client
        .execute(
            &parsed,
            ExecutionAuthority::Byok {
                provider: "openrouter".into(),
                key: "key".into(),
            },
            token,
        )
        .await
        .unwrap_err();
    assert_eq!(error.code, "aborted");
    parsed.input["n"] = 17.into();
    let error = client
        .execute(
            &parsed,
            ExecutionAuthority::Byok {
                provider: "openrouter".into(),
                key: "key".into(),
            },
            CancellationToken::new(),
        )
        .await
        .unwrap_err();
    assert_eq!(error.code, "invalid_input");
    assert_eq!(*http.calls.lock().unwrap(), 0);
}

struct Pending;

struct VideoBudgetTransport {
    event: Mutex<Option<Vec<u8>>>,
    downloads: Mutex<Vec<usize>>,
}
impl Transport for VideoBudgetTransport {
    fn request(&self, request: Request) -> HttpFuture<'_> {
        Box::pin(async move {
            let body = if request.method == "POST" {
                assert_eq!(
                    request.url,
                    "https://ai-gateway.vercel.sh/v3/ai/video-model"
                );
                self.event
                    .lock()
                    .unwrap()
                    .take()
                    .expect("one paid submission")
            } else {
                assert_eq!(request.method, "GET");
                assert_eq!(request.url, "https://ai-gateway.vercel.sh/generated.mp4");
                assert!(request.headers.is_empty());
                self.downloads.lock().unwrap().push(request.max_bytes);
                vec![4, 5, 6]
            };
            assert!(body.len() <= request.max_bytes);
            Ok(Response {
                status: 200,
                headers: Default::default(),
                body,
            })
        })
    }
}

async fn video_budget_result(
    videos: Value,
) -> (grida_ai::Result<grida_ai::MediaResult>, Vec<usize>) {
    let mut event = b"data: ".to_vec();
    serde_json::to_writer(&mut event, &json!({"type":"result","videos":videos})).unwrap();
    event.extend_from_slice(b"\n\n");
    let http = Arc::new(VideoBudgetTransport {
        event: Mutex::new(Some(event)),
        downloads: Mutex::new(vec![]),
    });
    let descriptor = Catalog::bundled()
        .list(&grida_ai::Filter {
            kind: Some("video".into()),
            provider: Some("vercel".into()),
            ..Default::default()
        })
        .unwrap()
        .into_iter()
        .find(|d| d["variant"] == "text")
        .unwrap();
    let parsed = Catalog::bundled()
        .parse_input(
            &Selector {
                kind: "video".into(),
                provider: "vercel".into(),
                model_id: descriptor["model_id"].as_str().unwrap().into(),
                variant: Some("text".into()),
                feature: None,
            },
            json!({"prompt":"test"}),
        )
        .unwrap();
    let result = MediaClient::new(http.clone())
        .execute(
            &parsed,
            ExecutionAuthority::Byok {
                provider: "vercel".into(),
                key: "synthetic-key".into(),
            },
            CancellationToken::new(),
        )
        .await;
    let downloads = http.downloads.lock().unwrap().clone();
    (result, downloads)
}

#[tokio::test]
async fn video_aggregate_limit_precedes_a_later_url_download() {
    // Each inline item fits on its own, and their encoding fits the response
    // envelope. Neither an exhausted budget nor a one-byte overflow may grant
    // the later download. Build large bytes in memory, never as a checked-in fixture.
    let half = 32 * 1024 * 1024;
    for excess in [0, 1] {
        let videos = json!([
            {"type":"base64","mediaType":"video/mp4","data":STANDARD.encode(vec![0; half])},
            {"type":"base64","mediaType":"video/mp4","data":STANDARD.encode(vec![0; half + excess])},
            {"type":"url","mediaType":"video/mp4","url":"https://ai-gateway.vercel.sh/generated.mp4"}
        ]);
        let (result, downloads) = video_budget_result(videos).await;
        assert_eq!(result.unwrap_err().code, "invalid_response");
        assert!(
            downloads.is_empty(),
            "no download budget remains (excess {excess})"
        );
    }
}

#[tokio::test]
async fn mixed_video_results_lend_only_the_remaining_download_budget() {
    let (result, downloads) = video_budget_result(json!([
        {"type":"base64","mediaType":"video/mp4","data":"AQID"},
        {"type":"url","mediaType":"video/mp4","url":"https://ai-gateway.vercel.sh/generated.mp4"}
    ]))
    .await;
    let result = result.unwrap();
    assert_eq!(result.assets.len(), 2);
    assert_eq!(result.assets[0].data, [1, 2, 3]);
    assert_eq!(result.assets[1].data, [4, 5, 6]);
    assert_eq!(downloads, [64 * 1024 * 1024 - 3]);
}

impl Transport for Pending {
    fn request(&self, _request: Request) -> HttpFuture<'_> {
        Box::pin(std::future::pending())
    }
}
#[tokio::test]
async fn cancellation_settles_an_uncooperative_host() {
    let client = MediaClient::new(Arc::new(Pending));
    let selector = Selector {
        kind: "image".into(),
        model_id: "openai/gpt-image-2".into(),
        provider: "openrouter".into(),
        variant: None,
        feature: None,
    };
    let parsed = Catalog::bundled()
        .parse_input(&selector, json!({"prompt":"test"}))
        .unwrap();
    let cancel = CancellationToken::new();
    let future = client.execute(
        &parsed,
        ExecutionAuthority::Byok {
            provider: "openrouter".into(),
            key: "key".into(),
        },
        cancel.clone(),
    );
    tokio::pin!(future);
    tokio::select! {r=&mut future=>panic!("unexpected settlement {r:?}"),_=tokio::task::yield_now()=>{}}
    cancel.cancel();
    assert_eq!(
        tokio::time::timeout(std::time::Duration::from_secs(1), future)
            .await
            .unwrap()
            .unwrap_err()
            .code,
        "aborted"
    );
}

#[test]
fn wire_assertions_reject_header_and_completion_regressions() {
    use grida_ai::{Lane, ResponseCompletion};
    let expected = json!({
        "lane":"provider", "method":"POST",
        "url":"https://ai-gateway.vercel.sh/v3/ai/video-model",
        "headers":{"authorization":"Bearer synthetic-key", "content-type":"application/json", "accept":"text/event-stream", "ai-gateway-protocol-version":"0.0.1", "ai-gateway-auth-method":"api-key"},
        "body":{"prompt":"quoted \"text\"\n\\ Unicode 😀"}
    });
    let request = || Request {
        lane: Lane::Provider,
        method: "POST".into(),
        url: expected["url"].as_str().unwrap().into(),
        headers: serde_json::from_value(expected["headers"].clone()).unwrap(),
        body: serde_json::to_vec(&expected["body"]).unwrap(),
        max_bytes: 1024,
        completion: ResponseCompletion::FirstSseEvent,
    };
    assert!(wire::compare(&request(), &expected).is_ok());
    for mutation in [
        "content-type",
        "accept",
        "authorization",
        "ai-gateway-protocol-version",
        "ai-gateway-auth-method",
        "cookie",
        "completion",
        "url",
        "body",
    ] {
        let mut changed = request();
        match mutation {
            "content-type" => {
                changed.headers.remove("content-type");
            }
            "accept" => {
                changed
                    .headers
                    .insert("accept".into(), "application/json".into());
            }
            "authorization" => {
                changed
                    .headers
                    .insert("authorization".into(), "Bearer wrong-key".into());
            }
            "ai-gateway-protocol-version" | "ai-gateway-auth-method" => {
                changed.headers.remove(mutation);
            }
            "cookie" => {
                changed
                    .headers
                    .insert("cookie".into(), "unexpected=credential".into());
            }
            "completion" => changed.completion = ResponseCompletion::Body,
            "url" => changed.url = "https://attacker.example/video-model".into(),
            "body" => changed.body = br#"{"prompt":"changed"}"#.to_vec(),
            _ => unreachable!(),
        }
        assert!(
            wire::compare(&changed, &expected).is_err(),
            "missed {mutation}"
        );
    }
    // Streaming completion must also be refused on otherwise valid non-video requests.
    let mut ordinary = expected.clone();
    ordinary["url"] = "https://ai-gateway.vercel.sh/v3/ai/image-model".into();
    let mut changed = request();
    changed.url = ordinary["url"].as_str().unwrap().into();
    assert!(wire::compare(&changed, &ordinary).is_err());
    changed.completion = ResponseCompletion::Body;
    assert!(wire::compare(&changed, &ordinary).is_ok());
}

#[test]
fn multipart_boundary_normalization_requires_matching_header_and_body() {
    use grida_ai::{Lane, ResponseCompletion};
    let expected = json!({
        "lane":"provider", "method":"POST", "url":"https://openapi.tripo3d.ai/v3/files",
        "headers":{"authorization":"Bearer synthetic-key", "accept":"application/json", "content-type":"multipart/form-data; boundary=<boundary>"},
        "body":{"multipart":{"name":"file", "filename":"mesh.glb", "media_type":"model/gltf-binary", "base64":"cmF3"}}
    });
    let mut request = Request {
        lane: Lane::Provider,
        method: "POST".into(),
        url: expected["url"].as_str().unwrap().into(),
        headers: serde_json::from_value(expected["headers"].clone()).unwrap(),
        body: b"--native-boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"mesh.glb\"\r\nContent-Type: model/gltf-binary\r\n\r\nraw\r\n--native-boundary--\r\n".to_vec(),
        max_bytes: 1024,
        completion: ResponseCompletion::Body,
    };
    request.headers.insert(
        "content-type".into(),
        "multipart/form-data; boundary=native-boundary".into(),
    );
    assert!(wire::compare(&request, &expected).is_ok());
    let valid_body = String::from_utf8(request.body.clone()).unwrap();
    for (label, from, to) in [
        (
            "missing disposition",
            "Content-Disposition:",
            "X-Unrelated:",
        ),
        ("wrong disposition", "form-data;", "attachment;"),
        (
            "unknown header",
            "Content-Type:",
            "X-Unrelated: value\r\nContent-Type:",
        ),
        (
            "duplicate disposition",
            "Content-Disposition:",
            "content-disposition: form-data; name=\"file\"; filename=\"mesh.glb\"\r\nContent-Disposition:",
        ),
        (
            "duplicate content type",
            "Content-Type:",
            "content-type: model/gltf-binary\r\nContent-Type:",
        ),
        (
            "missing content type",
            "Content-Type: model/gltf-binary\r\n",
            "",
        ),
        (
            "duplicate parameter",
            "filename=\"mesh.glb\"",
            "filename=\"mesh.glb\"; filename=\"other.glb\"",
        ),
    ] {
        request.body = valid_body.replace(from, to).into_bytes();
        assert!(
            wire::compare(&request, &expected).is_err(),
            "missed {label}"
        );
    }
    request.body = valid_body.into_bytes();
    request.headers.insert(
        "content-type".into(),
        "multipart/form-data; boundary=wrong-boundary".into(),
    );
    assert!(wire::compare(&request, &expected).is_err());
    request.headers.insert(
        "content-type".into(),
        "multipart/form-data; boundary=native-boundary".into(),
    );
    request.body.truncate(request.body.len() - 4);
    assert!(wire::compare(&request, &expected).is_err());
}
