//! Owner-projected links from immutable submissions to retained source turns.

use super::*;

const PAGE_SIZE: usize = 16;
const BACKFILL_BATCH: i64 = 128;

pub(super) const SCHEMA: &str = "
ALTER TABLE submissions ADD COLUMN link_projected INTEGER NOT NULL DEFAULT 0
    CHECK(link_projected IN (0,1,2));
CREATE INDEX submissions_pending_link ON submissions(link_projected) WHERE link_projected=0;
CREATE INDEX submissions_unknown_link ON submissions(link_projected) WHERE link_projected=2;
CREATE TABLE turn_submission_links (
    ordinal INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_session TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    parent_turn TEXT,
    session TEXT NOT NULL,
    input TEXT NOT NULL,
    UNIQUE(session,input),
    FOREIGN KEY(parent_session,parent_turn) REFERENCES turns(session,id) ON DELETE CASCADE,
    FOREIGN KEY(session,input) REFERENCES submissions(session,id) ON DELETE CASCADE
);
CREATE INDEX turn_submission_links_source
    ON turn_submission_links(parent_session,parent_turn,ordinal);
";

/// Classify immutable configuration and input with a stable, pure projection.
pub type TurnLinkProjection = fn(&Envelope, &Envelope) -> Result<TurnLinkDecision>;

pub enum TurnLinkDecision {
    Unrelated,
    Linked(TurnLinkParent),
    /// Historical ownership cannot be recovered even at the session level.
    CoverageUnknown,
}

pub struct TurnLinkParent {
    pub session: SessionId,
    /// Known historical ownership whose exact source turn is unavailable.
    pub turn: Option<TurnId>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TurnLinkCursor {
    pub session: SessionId,
    pub input: ChangeId,
}

pub struct TurnLinkEntry<T> {
    pub cursor: TurnLinkCursor,
    pub configuration: Envelope,
    pub disposition: InputDisposition,
    pub turn: Option<(TurnId, T)>,
}

pub struct TurnLinkPage<T> {
    pub entries: Vec<TurnLinkEntry<T>>,
    pub next_after: Option<TurnLinkCursor>,
    /// Some historical submissions could not be attributed to an exact source.
    pub coverage_incomplete: bool,
}

impl SqliteStore {
    /// Read a bounded page for an exact source, including inputs without turns.
    /// The transform runs under the store lock and issues no ownership.
    pub async fn turn_links<T: Send + 'static>(
        &self,
        parent_session: SessionId,
        parent_turn: TurnId,
        after: Option<TurnLinkCursor>,
        project: impl Fn(&TurnState) -> Result<T> + Send + 'static,
    ) -> Result<TurnLinkPage<T>> {
        execute(Arc::clone(&self.inner), move |inner, connection| {
            require_projection(inner)?;
            let after = match &after {
                Some(after) => ordinal(connection, &parent_session, &parent_turn, after)?
                    .ok_or_else(|| error(ErrorKind::InvalidInput, "invalid_turn_link_cursor"))?,
                None => 0,
            };
            let mut cursors = connection
                .prepare_cached(
                    "SELECT session,input FROM turn_submission_links
                     WHERE parent_session=?1 AND parent_turn=?2 AND ordinal>?3
                     ORDER BY ordinal LIMIT ?4",
                )
                .map_err(database_error)?
                .query_map(
                    params![
                        parent_session.as_str(),
                        parent_turn.as_str(),
                        after,
                        (PAGE_SIZE + 1) as i64
                    ],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                )
                .map_err(database_error)?
                .map(|row| cursor(row.map_err(database_error)?))
                .collect::<Result<Vec<_>>>()?;
            let next_after = if cursors.len() > PAGE_SIZE {
                cursors.pop();
                cursors.last().cloned()
            } else {
                None
            };
            let coverage_incomplete = connection
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM turn_submission_links
                     WHERE parent_session=?1 AND parent_turn IS NULL)
                     OR EXISTS(SELECT 1 FROM submissions WHERE link_projected=2)",
                    [parent_session.as_str()],
                    |row| row.get(0),
                )
                .map_err(database_error)?;
            let entries = cursors
                .into_iter()
                .map(|cursor| {
                    let configuration = configuration(connection, &cursor.session)?;
                    let input = load_input(connection, &cursor.session, &cursor.input)?;
                    let turn = input_turn(connection, &cursor.session, &input.disposition)?
                        .map(|state| Ok((state.binding().turn.clone(), project(&state)?)))
                        .transpose()?;
                    Ok(TurnLinkEntry {
                        cursor,
                        configuration,
                        disposition: input.disposition,
                        turn,
                    })
                })
                .collect::<Result<_>>()?;
            Ok(TurnLinkPage {
                entries,
                next_after,
                coverage_incomplete,
            })
        })
        .await
    }

    /// Read the retained turn of an exact linked input. Inputs without a
    /// claimed turn and foreign selectors produce no result.
    pub async fn inspect_turn_link_with<T: Send + 'static>(
        &self,
        parent_session: SessionId,
        parent_turn: TurnId,
        cursor: TurnLinkCursor,
        project: impl FnOnce(&TurnState) -> Result<T> + Send + 'static,
    ) -> Result<Option<T>> {
        execute(Arc::clone(&self.inner), move |inner, connection| {
            require_projection(inner)?;
            if ordinal(connection, &parent_session, &parent_turn, &cursor)?.is_none() {
                return Ok(None);
            }
            let input = load_input(connection, &cursor.session, &cursor.input)?;
            input_turn(connection, &cursor.session, &input.disposition)?
                .as_ref()
                .map(project)
                .transpose()
        })
        .await
    }
}

fn require_projection(inner: &Inner) -> Result<()> {
    inner
        .turn_links
        .map(|_| ())
        .ok_or_else(|| error(ErrorKind::Unsupported, "turn_link_projection_missing"))
}

fn ordinal(
    connection: &Connection,
    parent_session: &SessionId,
    parent_turn: &TurnId,
    cursor: &TurnLinkCursor,
) -> Result<Option<i64>> {
    connection
        .query_row(
            "SELECT ordinal FROM turn_submission_links
             WHERE parent_session=?1 AND parent_turn=?2 AND session=?3 AND input=?4",
            params![
                parent_session.as_str(),
                parent_turn.as_str(),
                cursor.session.as_str(),
                cursor.input.as_str()
            ],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error)
}

fn cursor((session, input): (String, String)) -> Result<TurnLinkCursor> {
    Ok(TurnLinkCursor {
        session: SessionId::new(session)?,
        input: ChangeId::new(input)?,
    })
}

fn configuration(connection: &Connection, session: &SessionId) -> Result<Envelope> {
    let bytes: Vec<u8> = connection
        .prepare_cached("SELECT configuration FROM sessions WHERE id=?1")
        .map_err(database_error)?
        .query_row([session.as_str()], |row| row.get(0))
        .map_err(database_error)?;
    decode(&bytes)
}

fn input_turn(
    connection: &Connection,
    session: &SessionId,
    disposition: &InputDisposition,
) -> Result<Option<TurnState>> {
    match disposition {
        InputDisposition::Claimed { turn } | InputDisposition::Completed { turn } => {
            load_turn(connection, session, turn).map(Some)
        }
        _ => Ok(None),
    }
}

pub(super) fn project_input(
    transaction: &Transaction<'_>,
    session: &SessionId,
    configuration: &Envelope,
    input: &Submission,
    project: TurnLinkProjection,
) -> Result<()> {
    record_projection(
        transaction,
        session,
        &input.id,
        project(configuration, &input.payload)?,
        false,
    )
}

fn record_projection(
    transaction: &Transaction<'_>,
    session: &SessionId,
    input: &ChangeId,
    decision: TurnLinkDecision,
    historical: bool,
) -> Result<()> {
    let unknown = match decision {
        TurnLinkDecision::Unrelated => false,
        TurnLinkDecision::CoverageUnknown if historical => true,
        TurnLinkDecision::CoverageUnknown => {
            return Err(error(ErrorKind::InvalidInput, "turn_link_source_unknown"));
        }
        TurnLinkDecision::Linked(parent) => {
            record_link(transaction, session, input, &parent, historical)?
        }
    };
    transaction
        .execute(
            "UPDATE submissions SET link_projected=?3 WHERE session=?1 AND id=?2",
            params![
                session.as_str(),
                input.as_str(),
                if unknown { 2 } else { 1 }
            ],
        )
        .map_err(database_error)?;
    Ok(())
}

fn record_link(
    transaction: &Transaction<'_>,
    session: &SessionId,
    input: &ChangeId,
    parent: &TurnLinkParent,
    historical: bool,
) -> Result<bool> {
    let parent_turn = parent.turn.as_ref().map(TurnId::as_str);
    let (parent_exists, turn_exists): (bool, bool) = transaction
        .prepare_cached(
            "SELECT EXISTS(SELECT 1 FROM sessions WHERE id=?1),
                    EXISTS(SELECT 1 FROM turns WHERE session=?1 AND id=?2)",
        )
        .map_err(database_error)?
        .query_row(params![parent.session.as_str(), parent_turn], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .map_err(database_error)?;
    if !historical && !turn_exists {
        return Err(error(ErrorKind::InvalidInput, "turn_link_source_missing"));
    }
    if !parent_exists {
        return Ok(true);
    }
    transaction
        .execute(
            "INSERT INTO turn_submission_links(parent_session,parent_turn,session,input)
             VALUES(?1,?2,?3,?4)",
            params![
                parent.session.as_str(),
                parent_turn.filter(|_| turn_exists),
                session.as_str(),
                input.as_str()
            ],
        )
        .map_err(database_error)?;
    Ok(false)
}

fn historical_projection(
    transaction: &Transaction<'_>,
    cursor: &TurnLinkCursor,
    project: TurnLinkProjection,
) -> Result<TurnLinkDecision> {
    let (configuration, payload, fingerprint): (Vec<u8>, Vec<u8>, Vec<u8>) = transaction
        .prepare_cached(
            "SELECT s.configuration,i.payload,i.fingerprint
             FROM submissions i JOIN sessions s ON s.id=i.session
             WHERE i.session=?1 AND i.id=?2",
        )
        .map_err(database_error)?
        .query_row(
            params![cursor.session.as_str(), cursor.input.as_str()],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(database_error)?;
    let (Ok(configuration), Ok(payload)) = (
        decode::<Envelope>(&configuration),
        decode::<Envelope>(&payload),
    ) else {
        return Ok(TurnLinkDecision::CoverageUnknown);
    };
    let input = Submission {
        id: cursor.input.clone(),
        payload,
    };
    if fingerprint.as_slice() != Fingerprint::of(&input)?.bytes() {
        return Ok(TurnLinkDecision::CoverageUnknown);
    }
    project(&configuration, &input.payload)
}

pub(super) fn project_existing(
    connection: &mut Connection,
    project: TurnLinkProjection,
) -> Result<()> {
    loop {
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(database_error)?;
        let pending = transaction
            .prepare_cached(
                "SELECT session,id FROM submissions WHERE link_projected=0
                 ORDER BY rowid LIMIT ?1",
            )
            .map_err(database_error)?
            .query_map([BACKFILL_BATCH], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(database_error)?
            .map(|row| cursor(row.map_err(database_error)?))
            .collect::<Result<Vec<_>>>()?;
        if pending.is_empty() {
            return Ok(());
        }
        for cursor in pending {
            let decision = historical_projection(&transaction, &cursor, project)?;
            record_projection(&transaction, &cursor.session, &cursor.input, decision, true)?;
        }
        transaction.commit().map_err(commit_error)?;
    }
}
