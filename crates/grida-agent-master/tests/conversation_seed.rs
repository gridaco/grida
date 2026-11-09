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
    ConversationAnchor, ConversationCut, ConversationSeed, ConversationSource, SeedOmissionKind,
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
