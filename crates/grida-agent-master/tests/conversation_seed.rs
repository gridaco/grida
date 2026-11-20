use agent_kit_core::history::HistoryRecord;
use agent_kit_core::messages::{
    Content, Message, OutcomeStatus, Provenance, ProvenanceKind, ProviderState, ResultContent,
    Role, ToolArguments, ToolCall, ToolResult,
};
use agent_kit_core::turn::JournalPosition;
use agent_kit_core::{
    BindingId, Envelope, ErrorKind, Fingerprint, MessageId, ProviderId, SchemaId, SessionId,
    ToolCallId, ToolId, TurnId,
};
use grida_agent_master::conversation_seed::{
    ConversationAnchor, ConversationCut, ConversationSeed, ConversationSource,
    EDITOR_OBSERVATION_SOURCE, MESSAGE_CONTEXT_SOURCE, SeedOmissionKind,
};

fn message(id: &str, role: Role, source: &str, content: Vec<Content>) -> HistoryRecord {
    HistoryRecord::Message(Message {
        id: MessageId::new(id).unwrap(),
        role,
        phase: None,
        content,
        provenance: Provenance {
            source: source.into(),
            kind: ProvenanceKind::Supplied,
            fingerprint: None,
        },
    })
}

fn text(id: &str, role: Role, content: &str) -> HistoryRecord {
    message(id, role, "fixture", vec![Content::Text(content.into())])
}

fn source(session: &str) -> ConversationSource {
    ConversationSource {
        session: SessionId::new(session).unwrap(),
        view: 0,
        tail: Some((turn(), JournalPosition(7))),
        fingerprint: Fingerprint::of(&session).unwrap(),
    }
}

fn turn() -> TurnId {
    TurnId::new("original-turn").unwrap()
}

fn local(record: HistoryRecord) -> (TurnId, JournalPosition, HistoryRecord) {
    (turn(), JournalPosition(7), record)
}

fn anchor(id: &str) -> ConversationAnchor {
    ConversationAnchor::Turn {
        turn: turn(),
        message: MessageId::new(id).unwrap(),
    }
}

#[test]
fn portable_prefix_keeps_context_with_typed_omissions_and_source_positions() {
    let call = ToolCallId::new("call").unwrap();
    let records = [
        text("system", Role::System, "active source instructions"),
        text("user", Role::User, "Make the title smaller"),
        message(
            "call",
            Role::Assistant,
            "provider",
            vec![
                Content::ToolCall(ToolCall {
                    id: call.clone(),
                    tool: ToolId::new("editor").unwrap(),
                    arguments: ToolArguments::Text("private path".into()),
                }),
                Content::Reasoning("private reasoning".into()),
                Content::ProviderState(ProviderState {
                    producer: ProviderId::new("provider").unwrap(),
                    binding: BindingId::new("source-only").unwrap(),
                    validity: Fingerprint::of(&"source-only").unwrap(),
                    payload: Envelope::new(
                        SchemaId::new("opaque").unwrap(),
                        1,
                        b"encrypted".to_vec(),
                    )
                    .unwrap(),
                }),
            ],
        ),
        message(
            "result",
            Role::Tool,
            "tool",
            vec![Content::ToolResult(ToolResult {
                call,
                status: OutcomeStatus::Uncertain,
                content: vec![ResultContent::Text("private raw output".into())],
                structured: Some(serde_json::json!({"private": "value"})),
                truncated: true,
            })],
        ),
        text("assistant", Role::Assistant, "I checked the title."),
        text("later", Role::User, "This came after the selected cut."),
    ];
    let seed = ConversationSeed::lower(
        source("source"),
        ConversationCut::Through(anchor("assistant")),
        None,
        records.clone().into_iter().map(local),
    )
    .unwrap();
    let provenance = seed.provenance();
    assert_eq!(provenance.entries.len(), 5);
    assert_eq!(
        provenance.entries[0].omissions[0].kind,
        SeedOmissionKind::Instruction
    );
    assert_eq!(provenance.entries[1].origin.message.as_str(), "user");
    assert_eq!(provenance.entries[1].origin.position, JournalPosition(7));
    assert!(provenance.entries[1].editable);
    assert_eq!(
        provenance.entries[2]
            .omissions
            .iter()
            .map(|part| part.kind.clone())
            .collect::<Vec<_>>(),
        vec![
            SeedOmissionKind::ToolCall,
            SeedOmissionKind::Reasoning,
            SeedOmissionKind::ProviderState
        ]
    );
    assert_eq!(
        provenance.entries[3].omissions[0].kind,
        SeedOmissionKind::ToolResult {
            text: true,
            media: false,
            structured: true,
        }
    );
    assert!(provenance.entries[2].message.is_none());

    let (portable, envelope) = seed.clone().into_parts().unwrap();
    assert_eq!(
        ConversationSeed::from_parts(portable.clone(), &envelope).unwrap(),
        seed
    );
    let messages: Vec<_> = portable
        .into_iter()
        .map(|HistoryRecord::Message(message)| message)
        .collect();
    agent_kit_core::history::validate_exchanges(&messages, false).unwrap();
    assert_eq!(messages.len(), 3);
    assert!(
        messages
            .iter()
            .all(|item| item.id.as_str().starts_with("seed/"))
    );
    assert_eq!(
        messages[0].content,
        vec![Content::Text("Make the title smaller".into())]
    );
    assert_eq!(messages[1].role, Role::Assistant);
    assert_eq!(
        messages[1].content,
        vec![Content::Text(
            "Prior tool result (Uncertain) [truncated]".into()
        )]
    );
    assert_eq!(
        messages[2].content,
        vec![Content::Text("I checked the title.".into())]
    );
    let raw = serde_json::to_string(&records).unwrap();
    assert!(raw.contains("private raw output") && raw.contains("active source instructions"));
}

#[test]
fn further_derivation_preserves_origin_and_can_cut_before_inherited_user() {
    let seed = ConversationSeed::lower(
        source("source"),
        ConversationCut::Through(anchor("answer")),
        None,
        [
            text("request", Role::User, "first message"),
            text("answer", Role::Assistant, "first response"),
        ]
        .into_iter()
        .map(local),
    )
    .unwrap();
    let original_entry = seed.provenance().entries[0].clone();
    let visible = original_entry.message.as_ref().unwrap();
    assert_eq!(
        seed.provenance().retained_message_id("request"),
        Some(visible)
    );
    assert_eq!(
        seed.provenance().retained_message_id(visible.as_str()),
        Some(visible)
    );
    let inherited = ConversationAnchor::Inherited {
        message: original_entry.message.clone().unwrap(),
    };
    let fork = ConversationSeed::lower(
        source("fork"),
        ConversationCut::Through(inherited.clone()),
        Some(seed.clone()),
        std::iter::empty(),
    )
    .unwrap();
    assert_eq!(fork.provenance().source.session.as_str(), "fork");
    assert_eq!(fork.provenance().retained_message_id("request"), None);
    assert_eq!(
        fork.provenance().retained_message_id(visible.as_str()),
        Some(visible)
    );
    assert_eq!(fork.provenance().entries, vec![original_entry]);
    assert_eq!(fork.into_parts().unwrap().0.len(), 1);

    let revision = ConversationSeed::lower(
        source("fork"),
        ConversationCut::BeforeEditableUser(inherited),
        Some(seed),
        [local(text(
            "later",
            Role::User,
            "obsolete local continuation",
        ))],
    )
    .unwrap();
    assert!(revision.provenance().entries.is_empty());
    assert!(revision.into_parts().unwrap().0.is_empty());
}

#[test]
fn fork_through_an_input_keeps_its_observed_context_and_stops_before_later_records() {
    const INPUT: &str = "input/request";
    let observed = |id: &str, source: &str, value: &str| {
        let HistoryRecord::Message(mut record) =
            message(id, Role::User, source, vec![Content::Text(value.into())]);
        record.provenance.kind = ProvenanceKind::Observed;
        HistoryRecord::Message(record)
    };
    let context = observed(
        "message-context/input/request",
        MESSAGE_CONTEXT_SOURCE,
        "selected reference guidance",
    );
    let observation = observed(
        "editor-context/request",
        EDITOR_OBSERVATION_SOURCE,
        "captured editor selection",
    );
    let unrelated = observed(
        "message-context/input/another-request",
        MESSAGE_CONTEXT_SOURCE,
        "separate input context",
    );
    let reply = text("answer", Role::Assistant, "a later answer");
    let through_input = ConversationCut::Through(anchor(INPUT));
    let before_reply = [
        text(INPUT, Role::User, "Use this material."),
        context.clone(),
        observation,
        unrelated.clone(),
    ];
    let direct = ConversationSeed::lower(
        source("source"),
        through_input.clone(),
        None,
        before_reply
            .iter()
            .cloned()
            .chain([reply.clone()])
            .map(local),
    )
    .unwrap();
    assert_eq!(direct.provenance().cut, through_input);
    assert_eq!(direct.records().len(), 3);
    assert_eq!(
        direct.provenance().entries[2].origin.message.as_str(),
        "editor-context/request"
    );

    let complete = ConversationSeed::lower(
        source("source"),
        ConversationCut::Through(anchor("answer")),
        None,
        before_reply.into_iter().chain([reply.clone()]).map(local),
    )
    .unwrap();
    let authored = complete.provenance().entries[0].message.clone().unwrap();
    let seeded = ConversationSeed::lower(
        source("first-fork"),
        ConversationCut::Through(ConversationAnchor::Inherited { message: authored }),
        Some(complete),
        std::iter::empty(),
    )
    .unwrap();
    assert_eq!(seeded.records(), direct.records());

    let display_only = ConversationSeed::lower(
        source("source"),
        through_input,
        None,
        [
            message(INPUT, Role::User, "fixture", Vec::new()),
            context,
            unrelated,
            reply,
        ]
        .into_iter()
        .map(local),
    )
    .unwrap();
    let (records, retained) = display_only.into_parts().unwrap();
    let reopened = ConversationSeed::from_parts(records, &retained).unwrap();
    assert_eq!(reopened.provenance().entries.len(), 2);
    assert!(reopened.provenance().entries[0].message.is_none());
    assert_eq!(reopened.records(), &direct.records()[1..2]);
}

#[test]
fn revision_refuses_noneditable_anchors_and_a_cut_without_visible_material() {
    let question_answer = message(
        "answer",
        Role::User,
        "question_response",
        vec![Content::Text("selected option".into())],
    );
    let cases = [
        (
            ConversationCut::BeforeEditableUser(anchor("answer")),
            question_answer,
            "history_anchor_not_editable",
        ),
        (
            ConversationCut::BeforeEditableUser(anchor("assistant")),
            text("assistant", Role::Assistant, "response"),
            "history_anchor_not_editable",
        ),
        (
            ConversationCut::Through(anchor("system")),
            text("system", Role::System, "instructions"),
            "history_anchor_not_visible",
        ),
        (
            ConversationCut::Through(anchor("missing")),
            text("user", Role::User, "visible"),
            "history_anchor_missing",
        ),
    ];
    for (cut, record, code) in cases {
        let error =
            ConversationSeed::lower(source("source"), cut, None, [local(record)]).unwrap_err();
        assert_eq!(error.kind, ErrorKind::InvalidInput);
        assert_eq!(error.code, code);
    }
}

#[test]
fn file_references_keep_their_model_text_through_forks_and_compaction() {
    use agent_kit_core::messages::{MediaRef, Retention};
    use agent_kit_core::{ArtifactId, ModelId};
    use grida_agent_master::compaction::summary_request;
    use grida_agent_master::conversation_seed::SeedOmissions;
    use grida_agent_master::file_reference::{self, FileReference};

    let reference = FileReference {
        name: "clip.mov".into(),
        path: "/Users/someone/Movies/clip.mov".into(),
        workspace_path: None,
        mime_type: Some("video/quicktime".into()),
        size: Some(4096),
        preview: None,
    };
    let media = |id: &str, media_type: &str, locator: String| {
        Content::Media(MediaRef {
            id: ArtifactId::new(id).unwrap(),
            media_type: media_type.into(),
            locator,
            access_scope: BindingId::new("fixture").unwrap(),
            retention: Retention::Retained,
        })
    };
    let described = reference.describe();
    let records = [message(
        "user",
        Role::User,
        "fixture",
        vec![
            Content::Text("Trim this clip".into()),
            media(
                "file-reference/one",
                file_reference::MEDIA_TYPE,
                file_reference::locator(&reference),
            ),
            media("image/one", "image/png", "asset:private".into()),
        ],
    )];
    let seed = ConversationSeed::lower(
        source("source"),
        ConversationCut::Through(anchor("user")),
        None,
        records.clone().into_iter().map(local),
    )
    .unwrap();
    // The reference's description stays; other media is still omitted.
    assert_eq!(
        seed.provenance().entries[0]
            .omissions
            .iter()
            .map(|omission| (omission.part, omission.kind.clone()))
            .collect::<Vec<_>>(),
        vec![(2, SeedOmissionKind::Media)]
    );
    let HistoryRecord::Message(seeded) = &seed.records()[0];
    assert_eq!(
        seeded.content,
        vec![
            Content::Text("Trim this clip".into()),
            Content::Text(described.clone()),
        ]
    );
    assert!(described.contains(r#""path":"/Users/someone/Movies/clip.mov""#));

    let HistoryRecord::Message(original) = records[0].clone();
    let request = summary_request(
        ModelId::new("summary-model").unwrap(),
        None,
        vec![original],
        Vec::new(),
        SeedOmissions::default(),
    )
    .unwrap()
    .unwrap();
    assert_eq!(request.coverage.omissions.media, 1);
    let source = serde_json::to_string(&request.inference.messages[1]).unwrap();
    assert!(
        source.contains("/Users/someone/Movies/clip.mov"),
        "{source}"
    );
}

#[test]
fn directory_references_keep_their_folder_description_through_forks_and_compaction() {
    use agent_kit_core::messages::{MediaRef, Retention};
    use agent_kit_core::{ArtifactId, ModelId};
    use grida_agent_master::compaction::summary_request;
    use grida_agent_master::conversation_seed::SeedOmissions;
    use grida_agent_master::file_reference::{self, FileReference};

    let reference = FileReference {
        name: "source".into(),
        path: "/work/project/source".into(),
        workspace_path: Some("source".into()),
        mime_type: Some(file_reference::DIRECTORY_MEDIA_TYPE.into()),
        size: None,
        preview: None,
    };
    let record = message(
        "folder",
        Role::User,
        "fixture",
        vec![Content::Media(MediaRef {
            id: ArtifactId::new("file-reference/folder").unwrap(),
            media_type: file_reference::MEDIA_TYPE.into(),
            locator: file_reference::locator(&reference),
            access_scope: BindingId::new("fixture").unwrap(),
            retention: Retention::Retained,
        })],
    );
    let seed = ConversationSeed::lower(
        source("source"),
        ConversationCut::Through(anchor("folder")),
        None,
        [record.clone()].into_iter().map(local),
    )
    .unwrap();
    let HistoryRecord::Message(seeded) = &seed.records()[0];
    assert_eq!(seeded.content, vec![Content::Text(reference.describe())]);
    assert!(
        reference
            .describe()
            .contains("Attached folder by reference")
    );
    let HistoryRecord::Message(original) = record;
    let request = summary_request(
        ModelId::new("summary-model").unwrap(),
        None,
        vec![original],
        Vec::new(),
        SeedOmissions::default(),
    )
    .unwrap()
    .unwrap();
    assert_eq!(request.coverage.omissions.media, 0);
    let supplied = serde_json::to_string(&request.inference.messages[1]).unwrap();
    assert!(supplied.contains("Attached folder by reference"));
    assert!(supplied.contains("/work/project/source"));
    assert!(!supplied.contains("\"size\""));
}
