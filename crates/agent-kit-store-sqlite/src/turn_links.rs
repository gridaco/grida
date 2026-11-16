//! Owner-projected links from immutable submissions to retained source turns.

use super::*;

const PAGE_SIZE: usize = 16;

/// Classify immutable configuration and input with a stable, pure projection.
pub type TurnLinkProjection = fn(&Envelope, &Envelope) -> Result<TurnLinkDecision>;

pub enum TurnLinkDecision {
    Unrelated,
    Linked(TurnLinkParent),
}

/// The retained turn a submission was made from.
pub struct TurnLinkParent {
    pub session: SessionId,
    pub turn: TurnId,
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
                    "SELECT session,input FROM submission_links
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
            let entries = cursors
                .into_iter()
                .map(|cursor| {
                    let configuration = configuration(connection, &cursor.session)?;
                    let input = load_input(connection, &cursor.session, &cursor.input)?;
                    let turn = input_turn(inner, connection, &cursor.session, &input.disposition)?
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
            input_turn(inner, connection, &cursor.session, &input.disposition)?
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
            "SELECT ordinal FROM submission_links
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
    inner: &Inner,
    connection: &Connection,
    session: &SessionId,
    disposition: &InputDisposition,
) -> Result<Option<TurnState>> {
    match disposition {
        InputDisposition::Claimed { turn } | InputDisposition::Completed { turn } => {
            load_turn(inner, connection, session, turn).map(Some)
        }
        _ => Ok(None),
    }
}

/// Record the owner's link for a submission accepted in this transaction.
/// A linked source turn must be retained.
pub(super) fn project_input(
    transaction: &Transaction<'_>,
    session: &SessionId,
    configuration: &Envelope,
    input: &Submission,
    project: TurnLinkProjection,
) -> Result<()> {
    let TurnLinkDecision::Linked(parent) = project(configuration, &input.payload)? else {
        return Ok(());
    };
    let retained: bool = transaction
        .prepare_cached("SELECT EXISTS(SELECT 1 FROM turns WHERE session=?1 AND id=?2)")
        .map_err(database_error)?
        .query_row(
            params![parent.session.as_str(), parent.turn.as_str()],
            |row| row.get(0),
        )
        .map_err(database_error)?;
    if !retained {
        return Err(error(ErrorKind::InvalidInput, "turn_link_source_missing"));
    }
    transaction
        .execute(
            "INSERT INTO submission_links(session,input,parent_session,parent_turn)
             VALUES(?1,?2,?3,?4)",
            params![
                session.as_str(),
                input.id.as_str(),
                parent.session.as_str(),
                parent.turn.as_str()
            ],
        )
        .map_err(database_error)?;
    Ok(())
}
