//! Add verified context to the current conversation without admitting new work.

use super::history::View;
use super::*;
use agent_kit_core::history::{History, HistoryPosition};

#[derive(Serialize, Deserialize)]
struct AnnotationReceipt {
    view: SessionRevision,
    record: Fingerprint,
}

fn current_view(db: &Connection, session: &SessionId) -> Result<(SessionRevision, i64)> {
    let (view, after) = db
        .query_row(
            "SELECT view,after_ordinal FROM history_views WHERE session=?1 AND end_ordinal IS NULL",
            [session.as_str()],
            |row| Ok((row.get::<_, i64>(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(database_error)?
        .ok_or_else(|| error(ErrorKind::InvalidInput, "session_missing"))?;
    Ok((SessionRevision(unsigned(view)?), after))
}

impl SqliteStore {
    /// Fingerprints of selected, verified contributions in the currently retained view.
    pub async fn context_annotation_receipts(
        &self,
        session: SessionId,
        ids: Vec<ChangeId>,
    ) -> Result<BTreeMap<ChangeId, Fingerprint>> {
        execute(Arc::clone(&self.inner), move |_, db| {
            let (view, _) = current_view(db, &session)?;
            let mut found = BTreeMap::new();
            let mut query = db.prepare_cached("SELECT receipt FROM requests WHERE session=?1 AND kind='context-annotation' AND id=?2").map_err(database_error)?;
            for id in ids {
                let bytes: Option<Vec<u8>> = query.query_row(params![session.as_str(), id.as_str()], |row| row.get(0)).optional().map_err(database_error)?;
                if let Some(bytes) = bytes {
                    let receipt: AnnotationReceipt = decode(&bytes)?;
                    if receipt.view == view {
                        found.insert(id, receipt.record);
                    }
                }
            }
            Ok(found)
        }).await
    }

    /// Derive an annotation from a retained source in the current view. Verification,
    /// placement and the idempotency receipt share a transaction. A running turn
    /// receives a journal contribution. An idle conversation retains it immediately
    /// after its last turn, without changing that turn's terminal result.
    pub async fn annotate_context(
        &self,
        session: SessionId,
        source: TurnId,
        id: ChangeId,
        verify: impl FnOnce(&TurnState) -> Result<HistoryRecord> + Send + 'static,
    ) -> Result<()> {
        execute(Arc::clone(&self.inner), move |inner, db| {
            let tx = db
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(database_error)?;
            let (view, after) = current_view(&tx, &session)?;
            let source_ordinal: Option<i64> = tx
                .query_row(
                    "SELECT ordinal FROM turns WHERE session=?1 AND id=?2",
                    params![session.as_str(), source.as_str()],
                    |row| row.get(0),
                )
                .optional()
                .map_err(database_error)?;
            if source_ordinal.is_none_or(|ordinal| ordinal <= after) {
                return Err(error(
                    ErrorKind::Conflict,
                    "context_annotation_source_superseded",
                ));
            }
            let identity = Fingerprint::of(&(&source, view, &id))?;
            let prior = lookup_request::<AnnotationReceipt>(
                &tx,
                &session,
                "context-annotation",
                &id,
                identity,
            )?;
            if prior.is_some() {
                return Ok(());
            }
            let record = verify(&load_turn(inner, &tx, &session, &source)?)?;
            History::new().append(HistoryPosition::default(), std::slice::from_ref(&record))?;
            let receipt = AnnotationReceipt {
                view,
                record: Fingerprint::of(&record)?,
            };
            let bytes = encode(&record)?;
            if bytes.len() > MAX_HISTORY_BYTES {
                return Err(error(ErrorKind::LimitExceeded, "history_projection_limit"));
            }
            let mut chat = load_session(&tx, &session)?;
            let active = match &chat.active_turn {
                Some(turn) if has_submission(&tx, &session, turn)? => {
                    let state = load_turn(inner, &tx, &session, turn)?;
                    (!state.controls().cancelled).then_some(state)
                }
                _ => None,
            };
            if let Some(state) = active {
                let request = ControlRequest {
                    id: id.clone(),
                    session: session.clone(),
                    expected_revision: chat.revision,
                    action: SessionControl::AppendHistory {
                        turn: state.binding().turn.clone(),
                        expected: state.controls().revision,
                        expected_history: state.history().position(),
                        records: vec![record],
                    },
                };
                apply_control(inner, &tx, &request, chat, Some(state))?;
            } else {
                // An unprompted maintenance turn has a fixed summary source.
                // New contributions there, or while a turn is stopping, follow it.
                tx.execute(
                    "INSERT INTO context_annotations(session,view,after_turn,record)
                     SELECT ?1,?2,max(ordinal),?3 FROM turns WHERE session=?1 AND ordinal>?4",
                    params![session.as_str(), sql_number(view.0)?, bytes, after],
                )
                .map_err(database_error)?;
                bump_revision(&mut chat)?;
                save_session(&tx, &session, &chat)?;
            }
            save_request(&tx, &session, "context-annotation", &id, identity, &receipt)?;
            commit(inner, tx)?;
            inner.changed.notify_waiters();
            Ok(())
        })
        .await
    }
}

fn has_submission(db: &Connection, session: &SessionId, turn: &TurnId) -> Result<bool> {
    db.query_row(
        "SELECT EXISTS(SELECT 1 FROM submissions WHERE session=?1 AND turn=?2)",
        params![session.as_str(), turn.as_str()],
        |row| row.get(0),
    )
    .map_err(database_error)
}

pub(super) fn idle_records(
    db: &Connection,
    session: &SessionId,
    view: &View,
    before: Option<i64>,
) -> Result<BTreeMap<u64, Vec<HistoryRecord>>> {
    let mut records = BTreeMap::<_, Vec<_>>::new();
    let Some(after) = view.annotation_after else {
        return Ok(records);
    };
    let mut query = db
        .prepare(
            "SELECT after_turn,record FROM context_annotations
        WHERE session=?1 AND view=?2 AND after_turn>?3 AND (?4 IS NULL OR after_turn<=?4)
        AND (?5 IS NULL OR after_turn<?5) ORDER BY after_turn,ordinal LIMIT ?6",
        )
        .map_err(database_error)?;
    let mut rows = query
        .query(params![
            session.as_str(),
            sql_number(view.id.0)?,
            after,
            view.end,
            before,
            MAX_HISTORY_RECORDS as i64 + 1
        ])
        .map_err(database_error)?;
    let mut bytes = 0;
    let mut count = 0;
    while let Some(row) = rows.next().map_err(database_error)? {
        let data = row
            .get_ref(1)
            .map_err(database_error)?
            .as_blob()
            .map_err(|_| error(ErrorKind::InvalidState, "stored_data_invalid"))?;
        count += 1;
        bytes += data.len();
        if bytes > MAX_HISTORY_BYTES || count > MAX_HISTORY_RECORDS {
            return Err(error(ErrorKind::LimitExceeded, "history_projection_limit"));
        }
        records
            .entry(unsigned(row.get(0).map_err(database_error)?)?)
            .or_default()
            .push(decode(data)?);
    }
    Ok(records)
}
