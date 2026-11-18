//! Captures written before image support keep their original provider policy.

use super::*;
use agent_kit_core::inference::{
    InferenceControl, InferenceRequest, InferenceRun, PreparedRequest,
};
use agent_kit_sessions::SessionStore;

struct ImageProfile(Arc<dyn Provider>);

impl Provider for ImageProfile {
    fn capabilities(&self, model: &ModelId) -> Result<ModelCapabilities> {
        let mut capabilities = self.0.capabilities(model)?;
        capabilities.revision = BindingId::new("upgraded-image-profile")?;
        capabilities.input_modalities.insert(Modality::Image);
        Ok(capabilities)
    }
    fn prepare(&self, _: InferenceRequest) -> Result<PreparedRequest> {
        panic!("selection and acceptance must not prepare inference")
    }
    fn start(&self, _: PreparedRequest, _: InferenceControl) -> Result<InferenceRun> {
        panic!("selection and acceptance must not dispatch inference")
    }
}

#[tokio::test]
async fn legacy_serialized_input_selects_original_profile_and_does_not_gain_image_tools() {
    let root = tempfile::tempdir().unwrap();
    let mut host = Host::open(
        &root.path().join("state"),
        Some(ProviderOptions {
            endpoint: "http://127.0.0.1:9/v1".into(),
            protocol: ProviderProtocol::OpenAiCompatible,
            model: ModelId::new("fixture-text").unwrap(),
            credential_env: None,
            credential_home: None,
            max_output_tokens: 1024,
            compatible_output_limit_field: None,
            llama_cpp_input_count: false,
            reasoning: false,
        }),
    )
    .unwrap();
    {
        let execution = Arc::get_mut(host.execution.as_mut().unwrap()).unwrap();
        let legacy = execution.provider.clone();
        execution.legacy_subscription_provider = Some(legacy.clone());
        execution.provider = Arc::new(ImageProfile(legacy));
        execution.accepts_selected_png = true;
        execution.tool_result_images = true;
        execution.legacy_tool_result_images = false;
    }
    let session = host
        .new_session(root.path().canonicalize().unwrap())
        .await
        .unwrap();
    let view = host.store.inspect(session.clone()).await.unwrap();
    let request = PromptRequest {
        id: ChangeId::new("captured").unwrap(),
        session: session.clone(),
        parts: vec![PromptPart::Text {
            text: "Accepted without a model call.".into(),
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
    let execution = host.execution().unwrap();
    let new = host
        .prepare_input(
            execution,
            &session,
            &super::session_configuration(&view).unwrap().cwd,
            &input,
            None,
            false,
            InputAuthority::RequireCaptured,
        )
        .unwrap();
    assert!(new.subscription_image_input && new.image_tool_results);
    assert_eq!(new.image_view, crate::file_tools::ImageView::Raster);
    assert!(
        execution
            .subscription_provider_for_capture(new.subscription_image_input)
            .is_none()
    );

    // Produce the exact older JSON shape before admission, rather than
    // rewriting an accepted database record or changing any runtime journal.
    let mut old: serde_json::Value = serde_json::from_slice(input.payload.bytes()).unwrap();
    old.as_object_mut()
        .unwrap()
        .remove("subscription_image_input");
    old.as_object_mut().unwrap().remove("image_tool_results");
    old.as_object_mut().unwrap().remove("image_view");
    let old = Submission {
        id: input.id.clone(),
        payload: encode(INPUT_SCHEMA, INPUT_VERSION, &old).unwrap(),
    };
    let original = host
        .prepare_input(
            execution,
            &session,
            &super::session_configuration(&view).unwrap().cwd,
            &old,
            None,
            false,
            InputAuthority::RequireCaptured,
        )
        .unwrap();
    assert!(!original.subscription_image_input && !original.image_tool_results);
    assert_eq!(original.image_view, crate::file_tools::ImageView::LegacyPng);
    let provider = execution
        .subscription_provider_for_capture(original.subscription_image_input)
        .unwrap();
    assert!(
        !provider
            .capabilities(&execution.config.model)
            .unwrap()
            .input_modalities
            .contains(&Modality::Image)
    );
}
