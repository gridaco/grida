#[path = "support/wire.rs"]
mod wire;
use base64::{Engine, engine::general_purpose::STANDARD};
use grida_ai::{
    Catalog, ExecutionAuthority, HttpFuture, MediaClient, Request, Response, Selector, Transport,
    TransportError,
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use tokio_util::sync::CancellationToken;
struct Fault {
    id: String,
    entries: Vec<Value>,
    fault: Value,
    calls: Mutex<usize>,
    cancel: CancellationToken,
}
impl Fault {
    fn expected_request(&self, step: usize) -> Value {
        let mut expected = self.entries[step]["request"].clone();
        let fault_step = self.fault["step"].as_u64().unwrap() as usize;
        if step > fault_step && self.fault["body_json"].is_object() {
            let bytes = STANDARD
                .decode(
                    self.entries[fault_step]["response"]["base64"]
                        .as_str()
                        .unwrap(),
                )
                .unwrap();
            let original: Value = serde_json::from_slice(&bytes).unwrap();
            // Only these two response fields select later request URLs. The
            // method, authority, headers and body retain their pinned values.
            for field in ["status_url", "response_url"] {
                if original[field].is_string()
                    && self.fault["body_json"][field].is_string()
                    && expected["url"] == original[field]
                {
                    expected["url"] = self.fault["body_json"][field].clone();
                }
            }
        }
        expected
    }
}
impl Transport for Fault {
    fn request(&self, request: Request) -> HttpFuture<'_> {
        Box::pin(async move {
            let mut calls = self.calls.lock().unwrap();
            let step = *calls;
            *calls += 1;
            let entry = self
                .entries
                .get(step)
                .unwrap_or_else(|| panic!("{}: unexpected request at step {step}", self.id));
            wire::compare(&request, &self.expected_request(step))
                .unwrap_or_else(|error| panic!("{} wire step {step}: {error}", self.id));
            let response = &entry["response"];
            let target = step == self.fault["step"].as_u64().unwrap() as usize;
            if target && self.fault["cancel"] == true {
                self.cancel.cancel();
            }
            if target && self.fault["throw"] == true {
                return Err(TransportError);
            }
            Ok(Response {
                status: if target {
                    self.fault["status"]
                        .as_u64()
                        .unwrap_or_else(|| response["status"].as_u64().unwrap())
                        as u16
                } else {
                    response["status"].as_u64().unwrap() as u16
                },
                headers: serde_json::from_value(response["headers"].clone()).unwrap(),
                body: if target && self.fault.get("body_text").is_some() {
                    self.fault["body_text"]
                        .as_str()
                        .unwrap()
                        .as_bytes()
                        .to_vec()
                } else if target && self.fault.get("body_json").is_some() {
                    serde_json::to_vec(&self.fault["body_json"]).unwrap()
                } else if target && self.fault["malformed"] == true {
                    b"not-json".to_vec()
                } else {
                    STANDARD
                        .decode(response["base64"].as_str().unwrap())
                        .unwrap()
                },
            })
        })
    }
}
#[tokio::test]
async fn faults_preserve_existing_safe_errors_receipts_and_request_counts() {
    let wires: Vec<Value> =
        serde_json::from_str(include_str!("fixtures/media-wire-vectors.json")).unwrap();
    let by_id = wires
        .iter()
        .map(|v| (v["id"].as_str().unwrap(), v))
        .collect::<HashMap<_, _>>();
    let mut mismatches = Vec::new();
    for line in include_str!("fixtures/error-vectors.jsonl").lines() {
        let case: Value = serde_json::from_str(line).unwrap();
        let wire = by_id[case["operation_id"].as_str().unwrap()];
        let selector: Selector = serde_json::from_value(wire["selector"].clone()).unwrap();
        let parsed = Catalog::bundled()
            .parse_input(&selector, wire["input"].clone())
            .unwrap();
        let cancel = CancellationToken::new();
        let transport = Arc::new(Fault {
            id: case["id"].as_str().unwrap().into(),
            entries: wire["transcript"].as_array().unwrap().clone(),
            fault: case["fault"].clone(),
            calls: Mutex::new(0),
            cancel: cancel.clone(),
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
        let actual = match MediaClient::new(transport.clone())
            .execute(&parsed, authority, cancel)
            .await
        {
            Ok(_) => json!({"ok":true}),
            Err(e) => serde_json::to_value(e).unwrap(),
        };
        if actual != case["expected"]
            || *transport.calls.lock().unwrap() != case["calls"].as_u64().unwrap() as usize
        {
            mismatches.push(format!(
                "{}: actual {} expected {} calls {}/{}",
                case["id"],
                actual,
                case["expected"],
                *transport.calls.lock().unwrap(),
                case["calls"]
            ));
        }
    }
    assert!(
        mismatches.is_empty(),
        "{} mismatches: {}",
        mismatches.len(),
        mismatches.join("\n")
    );
}
