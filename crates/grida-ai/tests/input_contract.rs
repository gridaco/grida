use grida_ai::{Catalog, Selector};
use serde_json::{Value, json};
#[test]
fn existing_typescript_input_contracts() {
    let vectors: Vec<Value> = include_str!("fixtures/input-vectors.jsonl")
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    assert!(vectors.len() > 2000);
    let catalog = Catalog::bundled();
    for vector in vectors {
        let selector: Selector = serde_json::from_value(vector["selector"].clone()).unwrap();
        let actual = match catalog.parse_input(&selector, vector["input"].clone()) {
            Ok(parsed) => json!({"ok":true,"input":parsed.input}),
            Err(error) => json!({"ok":false,"code":error.code}),
        };
        assert_eq!(actual, vector["expected"], "{}", vector["id"]);
    }
}
#[test]
fn pinned_vercel_video_rejects_zero_seed() {
    let selector = Selector {
        kind: "video".into(),
        model_id: "google/veo-3.1".into(),
        provider: "vercel".into(),
        variant: Some("text".into()),
        feature: None,
    };
    let catalogue = Catalog::bundled();
    assert!(
        catalogue
            .parse_input(&selector, json!({"prompt":"test","seed":1}))
            .is_ok()
    );
    assert_eq!(
        catalogue
            .parse_input(&selector, json!({"prompt":"test","seed":0}))
            .unwrap_err()
            .code,
        "invalid_input"
    );
}
