use grida_ai::{
    HttpFuture, Lane, MediaClient, Request, Response, Transport, VoiceFilter, normalize_key,
};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, VecDeque},
    sync::{Arc, Mutex},
};
use tokio_util::sync::CancellationToken;

struct Fake {
    responses: Mutex<VecDeque<Response>>,
    requests: Mutex<Vec<Request>>,
}
impl Fake {
    fn new(responses: Vec<Response>) -> Arc<Self> {
        Arc::new(Self {
            responses: Mutex::new(responses.into()),
            requests: Mutex::new(vec![]),
        })
    }
}
impl Transport for Fake {
    fn request(&self, request: Request) -> HttpFuture<'_> {
        Box::pin(async move {
            self.requests.lock().unwrap().push(request);
            Ok(self
                .responses
                .lock()
                .unwrap()
                .pop_front()
                .expect("unexpected network request"))
        })
    }
}
fn response(status: u16, body: Value) -> Response {
    Response {
        status,
        headers: BTreeMap::from([(
            "content-type".into(),
            "application/json; charset=utf-8".into(),
        )]),
        body: serde_json::to_vec(&body).unwrap(),
    }
}
fn filter() -> VoiceFilter {
    VoiceFilter {
        provider: "elevenlabs".into(),
    }
}

#[tokio::test]
async fn credential_checks_are_read_only_fixed_origin_and_project_no_account_data() {
    for (provider, key, url, payload) in [
        (
            "openrouter",
            "sk-or-synthetic",
            "https://openrouter.ai/api/v1/key",
            json!({"data":{"is_management_key":false,"private":"discard"}}),
        ),
        (
            "tripo",
            "synthetic",
            "https://openapi.tripo3d.ai/v3/account/balance",
            json!({"code":0,"data":{"balance":2,"frozen":0}}),
        ),
        (
            "vercel",
            "synthetic",
            "https://ai-gateway.vercel.sh/v1/credits",
            json!({"balance":"-1.5e2","total_used":"0"}),
        ),
        (
            "fal",
            "synthetic:key",
            "https://api.fal.ai/v1/models/pricing?endpoint_id=fal-ai/flux/dev",
            json!({"prices":[{"endpoint_id":"fal-ai/flux/dev","unit_price":-0.1,"unit":"image","currency":"USD"}]}),
        ),
    ] {
        let fake = Fake::new(vec![response(200, payload)]);
        assert_eq!(
            MediaClient::new(fake.clone())
                .verify(provider, key, CancellationToken::new())
                .await
                .unwrap(),
            json!({"status":"accepted"})
        );
        let requests = fake.requests.lock().unwrap();
        assert_eq!(requests.len(), 1);
        let request = &requests[0];
        assert_eq!(request.url, url);
        assert_eq!(request.method, "GET");
        assert_eq!(request.lane, Lane::Provider);
        assert!(request.body.is_empty());
        assert_eq!(request.max_bytes, 65536);
        assert_eq!(
            request.headers["authorization"],
            format!("{} {key}", if provider == "fal" { "Key" } else { "Bearer" })
        );
    }
    let fake = Fake::new(vec![]);
    let client = MediaClient::new(fake.clone());
    assert_eq!(
        client
            .verify("elevenlabs", "synthetic", CancellationToken::new())
            .await
            .unwrap(),
        json!({"status":"not_supported"})
    );
    let cancel = CancellationToken::new();
    cancel.cancel();
    assert_eq!(
        client
            .verify("elevenlabs", "synthetic", cancel)
            .await
            .unwrap_err()
            .code,
        "aborted"
    );
    assert!(fake.requests.lock().unwrap().is_empty());
}

#[tokio::test]
async fn credential_errors_are_safe_and_requests_are_not_retried() {
    for (status, body, code) in [
        (401, json!({"private":"discard"}), "credential_rejected"),
        (403, json!({}), "access_denied"),
        (429, json!({}), "unavailable"),
        (500, json!({}), "unavailable"),
        (
            200,
            json!({"data":{"is_management_key":true}}),
            "credential_rejected",
        ),
        (200, json!({"data":{}}), "invalid_response"),
    ] {
        let fake = Fake::new(vec![response(status, body)]);
        let failure = MediaClient::new(fake.clone())
            .verify("openrouter", "sk-or-synthetic", CancellationToken::new())
            .await
            .unwrap_err();
        assert_eq!(
            serde_json::to_value(failure).unwrap(),
            json!({"code":code,"message":code})
        );
        assert_eq!(fake.requests.lock().unwrap().len(), 1);
    }
    for (provider, key) in [
        ("openrouter", "sk-or-"),
        ("vercel", "vck_"),
        ("fal", "single"),
        ("tripo", "PASTE_TRIPO_KEY_HERE"),
        ("elevenlabs", "secret\nother"),
    ] {
        assert_eq!(
            normalize_key(provider, key).unwrap_err().code,
            "invalid_input"
        );
    }
    assert_eq!(
        normalize_key("tripo", "\u{feff} opaque \n").unwrap(),
        "opaque"
    );
}

#[tokio::test]
async fn voices_paginate_with_one_authority_deduplicate_project_and_sort_utf16() {
    let fake = Fake::new(vec![
        response(
            200,
            json!({"voices":[{"voice_id":" z ","name":"😀","secret":"discard"},{"voice_id":"a","name":"Same"},{"voice_id":"b","name":"Same"}],"has_more":true,"next_page_token":" next & / "}),
        ),
        response(
            200,
            json!({"voices":[{"voice_id":"z","name":"replacement"},{"voice_id":"c","name":"\u{e000}"}],"has_more":false}),
        ),
    ]);
    let voices = MediaClient::new(fake.clone())
        .voices(" synthetic ", &filter(), CancellationToken::new())
        .await
        .unwrap();
    assert_eq!(voices,json!([{"voice_id":"a","name":"Same"},{"voice_id":"b","name":"Same"},{"voice_id":"z","name":"😀"},{"voice_id":"c","name":"\u{e000}"}]).as_array().unwrap().clone());
    let requests = fake.requests.lock().unwrap();
    assert_eq!(requests.len(), 2);
    assert_eq!(
        requests[0].url,
        "https://api.elevenlabs.io/v2/voices?page_size=100"
    );
    assert_eq!(
        requests[1].url,
        "https://api.elevenlabs.io/v2/voices?page_size=100&next_page_token=next+%26+%2F"
    );
    for request in requests.iter() {
        assert_eq!(request.headers["xi-api-key"], "synthetic");
        assert_eq!(request.max_bytes, 2097152);
    }
}

#[tokio::test]
async fn voices_refuse_bad_pages_repeated_cursors_and_cancel_before_network() {
    for (status, body, code) in [
        (401, json!({}), "provider_access_denied"),
        (403, json!({}), "provider_access_denied"),
        (429, json!({}), "generation_failed"),
        (
            200,
            json!({"voices":[],"has_more":true}),
            "invalid_response",
        ),
        (
            200,
            json!({"voices":[{"voice_id":"id","name":" "}],"has_more":false}),
            "invalid_response",
        ),
    ] {
        let fake = Fake::new(vec![response(status, body)]);
        assert_eq!(
            MediaClient::new(fake.clone())
                .voices("synthetic", &filter(), CancellationToken::new())
                .await
                .unwrap_err()
                .code,
            code
        );
        assert_eq!(fake.requests.lock().unwrap().len(), 1);
    }
    let page = json!({"voices":[],"has_more":true,"next_page_token":"same"});
    let fake = Fake::new(vec![response(200, page.clone()), response(200, page)]);
    assert_eq!(
        MediaClient::new(fake.clone())
            .voices("synthetic", &filter(), CancellationToken::new())
            .await
            .unwrap_err()
            .code,
        "invalid_response"
    );
    assert_eq!(fake.requests.lock().unwrap().len(), 2);
    let cancel = CancellationToken::new();
    cancel.cancel();
    let fake = Fake::new(vec![]);
    assert_eq!(
        MediaClient::new(fake.clone())
            .voices("synthetic", &filter(), cancel)
            .await
            .unwrap_err()
            .code,
        "aborted"
    );
    assert!(fake.requests.lock().unwrap().is_empty());
}
