// GRIDA-SEC-010 / GRIDA-SEC-015 — exact organization choice, bounded paging, no partial success.
use super::*;

fn organization(id: i64) -> Organization {
    Organization {
        id,
        name: format!("org-{id}"),
        display_name: format!("Organization {id}"),
    }
}
fn page(ids: &[i64], next_cursor: Option<i64>) -> OrganizationsPage {
    OrganizationsPage {
        organizations: ids.iter().copied().map(organization).collect(),
        next_cursor,
    }
}

#[test]
fn auto_selection_requires_a_single_terminal_membership() {
    assert_eq!(
        select_from(None, |_| Ok(page(&[1], None))).unwrap(),
        organization(1)
    );
    let empty = select_from(None, |_| Ok(page(&[], None))).unwrap_err();
    assert_eq!(empty.value["code"], "no_organizations");
    for (ids, next, shown, truncated) in [
        (vec![1, 2], None, 2, false),
        (vec![1], Some(1), 1, true),
        ((1..=100).collect(), Some(100), 10, true),
    ] {
        let mut calls = 0;
        let error = select_from(None, |_| {
            calls += 1;
            Ok(page(&ids, next))
        })
        .unwrap_err();
        assert_eq!(calls, 1);
        assert_eq!(error.value["code"], "organization_required");
        assert_eq!(error.value["choices"].as_array().unwrap().len(), shown);
        assert_eq!(error.value["choices_truncated"], truncated);
    }
}

#[test]
fn numeric_names_and_ids_are_distinct_exact_selectors() {
    let mut named = organization(1);
    named.name = "7".into();
    let numbered = organization(7);
    for (selector, expected) in [
        (Selector::Name("7".into()), named.clone()),
        (Selector::Id(7), numbered.clone()),
    ] {
        assert_eq!(
            select_from(Some(&selector), |_| Ok(OrganizationsPage {
                organizations: vec![named.clone(), numbered.clone()],
                next_cursor: None
            }))
            .unwrap(),
            expected
        );
    }
    let absent = select_from(Some(&Selector::Id(4)), |_| Ok(page(&[], None))).unwrap_err();
    assert_eq!(absent.value["code"], "organization_not_found");
}

#[test]
fn explicit_selection_follows_server_cursors_and_accepts_the_hundredth_page() {
    for wanted in [3, 100, 101] {
        let mut cursors = vec![];
        let result = select_from(Some(&Selector::Id(wanted)), |after| {
            cursors.push(after);
            let id = after.unwrap_or(0) + 1;
            Ok(page(&[id], Some(id)))
        });
        assert_eq!(cursors.len(), wanted.min(100) as usize);
        assert_eq!(cursors[0], None);
        assert_eq!(
            cursors.last().copied().flatten(),
            Some(wanted.min(100) as i64 - 1)
        );
        if wanted <= 100 {
            assert_eq!(result.unwrap(), organization(wanted as i64));
        } else {
            assert_eq!(result.unwrap_err().value["code"], "selection_unavailable");
        }
    }
}

#[test]
fn account_view_returns_only_a_complete_membership_walk() {
    assert!(
        organizations_from(|_| Ok(page(&[], None)))
            .unwrap()
            .is_empty()
    );
    for terminal in [true, false] {
        let mut calls = 0;
        let result = organizations_from(|after| {
            calls += 1;
            let id = after.unwrap_or(0) + 1;
            Ok(page(
                &[id],
                if terminal && id == 100 {
                    None
                } else {
                    Some(id)
                },
            ))
        });
        assert_eq!(calls, 100);
        if terminal {
            assert_eq!(
                result.unwrap(),
                (1..=100).map(organization).collect::<Vec<_>>()
            );
        } else {
            assert_eq!(result.unwrap_err().value["code"], "selection_unavailable");
        }
    }
}

#[test]
fn later_page_rejection_is_preserved_without_retry_or_partial_success() {
    // Malformed wire pages are rejected by grida-auth before these typed pages
    // reach selection; this checks that the host does not hide that failure.
    for code in [
        "invalid_response",
        "token_rejected",
        "forbidden",
        "unavailable",
    ] {
        let mut calls = 0;
        let error = organizations_from(|after| {
            calls += 1;
            if after.is_none() {
                Ok(page(&[1], Some(1)))
            } else {
                Err(failure(grida_auth::Error::new(code)))
            }
        })
        .unwrap_err();
        assert_eq!(calls, 2);
        assert_eq!(error.value["code"], code);
        let mut calls = 0;
        let error = select_from(Some(&Selector::Id(2)), |after| {
            calls += 1;
            if after.is_none() {
                Ok(page(&[1], Some(1)))
            } else {
                Err(failure(grida_auth::Error::new(code)))
            }
        })
        .unwrap_err();
        assert_eq!(calls, 2);
        assert_eq!(error.value["code"], code);
    }
}
