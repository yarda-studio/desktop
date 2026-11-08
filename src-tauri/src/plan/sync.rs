//! Cloud sync for the service plan: the plan's rules for what to send, and when
//! a plan from another device may replace this one.
//!
//! The whole plan is one cloud record (collection `service_plan`, id `current`),
//! and the most recent edit wins, like the rest of cloud sync. The plan is a short
//! running order edited by one operator at a time, so merging steps would add
//! complexity for a case that hardly happens.
//!
//! Songs and slides are not synced and their ids belong to each device, so a plan
//! never sends them. A plan arriving from another device re-links each song and
//! slide step by title (the caller supplies how); a step with no match is kept,
//! shown as not linked, and can be re-added. Everything here lives in `plan.db`
//! beside the plan, so it cannot touch anything else.

use super::model::PlanItem;
use super::store::{clean, read_items, write_items, PlanDb};
use crate::types::{AppError, Result};
use chrono::{DateTime, Duration, SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::Serialize;

/// The cloud refuses a record over 256 KiB; stay clear of that.
const MAX_PAYLOAD_BYTES: usize = 240_000;

/// What to send to the cloud for the plan.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct PlanSyncRecord {
    pub data: serde_json::Value,
    /// When the plan was last edited here, as the cloud will compare it.
    pub client_updated_at: String,
}

fn stamp(at: DateTime<Utc>) -> String {
    at.to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn parse(stamp: &str) -> Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(stamp)
        .map(|d| d.with_timezone(&Utc))
        .map_err(|_| AppError::Other(format!("The plan has an unreadable time: {stamp}")))
}

/// (last edit, not yet sent). A plan never edited since sync existed has no time.
fn read_meta(conn: &Connection) -> Result<(String, bool)> {
    Ok(conn
        .query_row(
            "SELECT updated_at, dirty FROM plan_sync WHERE id = 1",
            [],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)? != 0)),
        )
        .optional()?
        .unwrap_or_default())
}

fn write_meta(conn: &Connection, updated_at: &str, dirty: bool) -> Result<()> {
    conn.execute(
        "INSERT INTO plan_sync (id, updated_at, dirty) VALUES (1, ?1, ?2)
         ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, dirty = excluded.dirty",
        params![updated_at, dirty as i64],
    )?;
    Ok(())
}

/// Note an edit made on this device. Each edit gets a time later than the one
/// before it, so "was this edit sent?" can compare times exactly.
pub(super) fn mark_edited(tx: &Transaction) -> Result<()> {
    let (previous, _) = read_meta(tx)?;
    // To the millisecond, which is what is stored: comparing finer than that
    // would let two edits in one millisecond share a time.
    let mut at =
        DateTime::from_timestamp_millis(Utc::now().timestamp_millis()).unwrap_or_else(Utc::now);
    if let Ok(prev) = parse(&previous) {
        if at <= prev {
            at = prev + Duration::milliseconds(1);
        }
    }
    write_meta(tx, &stamp(at), true)
}

/// The steps as sent: song and slide ids are left out, because they mean nothing elsewhere.
fn payload(items: &[PlanItem]) -> Result<serde_json::Value> {
    let items: Vec<PlanItem> = items
        .iter()
        .map(|i| PlanItem {
            ref_id: None,
            ..i.clone()
        })
        .collect();
    let data = serde_json::json!({ "v": 1, "items": items });
    if data.to_string().len() > MAX_PAYLOAD_BYTES {
        return Err(AppError::Other(
            "The service plan is too large to sync. Shorten the notes or remove some steps.".into(),
        ));
    }
    Ok(data)
}

impl PlanDb {
    /// The plan, if it has changed since it was last sent. A plan that predates
    /// sync (it has steps but no edit time) is sent once.
    pub fn sync_pending(&self) -> Result<Option<PlanSyncRecord>> {
        let conn = self.conn();
        let (mut updated_at, mut dirty) = read_meta(&conn)?;
        let items = read_items(&conn)?;
        if updated_at.is_empty() {
            if items.is_empty() {
                return Ok(None);
            }
            updated_at = stamp(Utc::now());
            dirty = true;
            write_meta(&conn, &updated_at, true)?;
        }
        if !dirty {
            return Ok(None);
        }
        Ok(Some(PlanSyncRecord {
            data: payload(&items)?,
            client_updated_at: updated_at,
        }))
    }

    /// The cloud took the plan as edited at `updated_at`. If the plan has been
    /// edited again since, it stays waiting to be sent.
    pub fn sync_mark_pushed(&self, updated_at: &str) -> Result<()> {
        self.conn().execute(
            "UPDATE plan_sync SET dirty = 0 WHERE id = 1 AND updated_at = ?1",
            params![updated_at],
        )?;
        Ok(())
    }

    /// Take the cloud's plan if it is newer than this device's last edit.
    /// `resolve(kind, title)` finds this device's id for a song or slide.
    /// Returns whether the plan was replaced. A plan that cannot be read changes nothing.
    pub fn sync_apply(
        &self,
        data: &serde_json::Value,
        remote_updated_at: &str,
        resolve: &dyn Fn(&str, &str) -> Option<i64>,
    ) -> Result<bool> {
        let remote_at = parse(remote_updated_at)?;
        let remote_items: Vec<PlanItem> = data
            .get("items")
            .cloned()
            .and_then(|v| serde_json::from_value(v).ok())
            .ok_or_else(|| AppError::Other("The plan in the cloud could not be read.".into()))?;

        let mut conn = self.conn();
        let tx = conn.transaction()?;
        let (local, _) = read_meta(&tx)?;
        if !local.is_empty() && parse(&local)? >= remote_at {
            return Ok(false); // this device's edit is as new or newer
        }

        let current = read_items(&tx)?;
        let linked: Vec<PlanItem> = remote_items
            .into_iter()
            .map(|mut item| {
                item.ref_id = match item.kind.as_str() {
                    "song" | "slide" => current
                        .iter()
                        // The same step as before: keep the link this device already had.
                        .find(|c| c.id == item.id && c.kind == item.kind && c.title == item.title)
                        .and_then(|c| c.ref_id)
                        .or_else(|| resolve(&item.kind, &item.title)),
                    _ => None,
                };
                item
            })
            .collect();
        // Checked before anything is written; a bad plan leaves this one alone.
        let cleaned = clean(&linked, false)?;
        write_items(&tx, &cleaned)?;
        write_meta(&tx, &stamp(remote_at), false)?;
        tx.commit()?;
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn song(id: &str, title: &str, ref_id: i64) -> PlanItem {
        PlanItem {
            id: id.into(),
            kind: "song".into(),
            title: title.into(),
            ref_id: Some(ref_id),
            ..Default::default()
        }
    }

    fn note(id: &str, title: &str) -> PlanItem {
        PlanItem {
            id: id.into(),
            kind: "note".into(),
            title: title.into(),
            ..Default::default()
        }
    }

    fn none(_: &str, _: &str) -> Option<i64> {
        None
    }

    fn titles(db: &PlanDb) -> Vec<String> {
        db.list().unwrap().into_iter().map(|i| i.title).collect()
    }

    fn remote(items: &[PlanItem]) -> serde_json::Value {
        serde_json::json!({ "v": 1, "items": items })
    }

    #[test]
    fn an_edit_is_pending_until_it_is_sent_and_never_carries_local_ids() {
        let db = PlanDb::in_memory();
        assert_eq!(
            db.sync_pending().unwrap(),
            None,
            "an empty, untouched plan sends nothing"
        );

        db.replace(&[song("a", "Amazing Grace", 42), note("b", "Offering")])
            .unwrap();
        let pending = db.sync_pending().unwrap().unwrap();
        let items = pending.data["items"].as_array().unwrap();
        assert_eq!(items.len(), 2);
        assert!(
            items.iter().all(|i| i["ref_id"].is_null()),
            "song ids mean nothing elsewhere"
        );
        assert_eq!(items[0]["title"], "Amazing Grace");

        db.sync_mark_pushed(&pending.client_updated_at).unwrap();
        assert_eq!(db.sync_pending().unwrap(), None);
        assert_eq!(
            db.list().unwrap()[0].ref_id,
            Some(42),
            "the local link is untouched"
        );
    }

    #[test]
    fn an_edit_made_while_sending_stays_pending() {
        let db = PlanDb::in_memory();
        db.replace(&[note("a", "One")]).unwrap();
        let sent = db.sync_pending().unwrap().unwrap();
        db.replace(&[note("a", "One"), note("b", "Two")]).unwrap(); // edited during the push
        db.sync_mark_pushed(&sent.client_updated_at).unwrap();
        let again = db.sync_pending().unwrap().unwrap();
        assert!(again.client_updated_at > sent.client_updated_at);
        assert_eq!(again.data["items"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn a_plan_made_before_sync_existed_is_sent_once() {
        let db = PlanDb::in_memory();
        db.conn()
            .execute(
                "INSERT INTO plan_items (position, id, kind, title) VALUES (0, 'a', 'note', 'Old plan')",
                [],
            )
            .unwrap();
        let first = db.sync_pending().unwrap().unwrap();
        db.sync_mark_pushed(&first.client_updated_at).unwrap();
        assert_eq!(db.sync_pending().unwrap(), None);
    }

    #[test]
    fn edit_times_always_increase() {
        let db = PlanDb::in_memory();
        let mut last = String::new();
        for n in 0..20 {
            db.replace(&[note("a", &format!("v{n}"))]).unwrap();
            let at = db.sync_pending().unwrap().unwrap().client_updated_at;
            assert!(at > last, "{at} should be after {last}");
            last = at;
        }
    }

    #[test]
    fn a_newer_cloud_plan_replaces_ours_and_relinks_songs_by_title() {
        let db = PlanDb::in_memory();
        db.replace(&[note("x", "Old")]).unwrap();
        let cloud = remote(&[
            song("a", "Amazing Grace", 999),
            song("b", "Unknown Hymn", 5),
            note("c", "Offering"),
        ]);
        let resolve =
            |kind: &str, title: &str| (kind == "song" && title == "Amazing Grace").then_some(7);
        let applied = db
            .sync_apply(&cloud, "2999-01-01T00:00:00.000Z", &resolve)
            .unwrap();
        assert!(applied);
        assert_eq!(titles(&db), ["Amazing Grace", "Unknown Hymn", "Offering"]);
        let items = db.list().unwrap();
        assert_eq!(items[0].ref_id, Some(7), "found by title on this device");
        assert_eq!(
            items[1].ref_id, None,
            "a song we do not have is kept, not linked"
        );
        assert_eq!(
            db.sync_pending().unwrap(),
            None,
            "a plan taken from the cloud is not sent back"
        );
    }

    #[test]
    fn the_link_this_device_already_had_is_kept_for_the_same_step() {
        let db = PlanDb::in_memory();
        db.replace(&[song("a", "Amazing Grace", 42)]).unwrap();
        let cloud = remote(&[
            song("a", "Amazing Grace", 999),
            note("b", "Added elsewhere"),
        ]);
        db.sync_apply(&cloud, "2999-01-01T00:00:00.000Z", &none)
            .unwrap();
        assert_eq!(db.list().unwrap()[0].ref_id, Some(42));
    }

    #[test]
    fn the_cloud_plan_loses_to_a_newer_or_equal_local_edit() {
        let db = PlanDb::in_memory();
        db.replace(&[note("a", "Mine")]).unwrap();
        let cloud = remote(&[note("z", "Theirs")]);
        // Older than our edit, and dirty: ours stays and is still waiting to be sent.
        assert!(!db
            .sync_apply(&cloud, "2000-01-01T00:00:00.000Z", &none)
            .unwrap());
        assert_eq!(titles(&db), ["Mine"]);
        assert!(db.sync_pending().unwrap().is_some());
        // The very same edit coming back is not applied either.
        let at = db.sync_pending().unwrap().unwrap().client_updated_at;
        assert!(!db.sync_apply(&cloud, &at, &none).unwrap());
    }

    #[test]
    fn a_cloud_plan_we_cannot_read_changes_nothing() {
        let db = PlanDb::in_memory();
        db.replace(&[note("a", "Mine")]).unwrap();
        let bad_step = remote(&[PlanItem {
            id: "q".into(),
            kind: "mystery".into(),
            ..Default::default()
        }]);
        assert!(db
            .sync_apply(&bad_step, "2999-01-01T00:00:00.000Z", &none)
            .is_err());
        assert!(db
            .sync_apply(
                &serde_json::json!({ "nope": 1 }),
                "2999-01-01T00:00:00.000Z",
                &none
            )
            .is_err());
        assert!(db.sync_apply(&remote(&[]), "not a time", &none).is_err());
        assert_eq!(titles(&db), ["Mine"]);
    }

    #[test]
    fn a_plan_too_large_for_the_cloud_is_reported_not_silently_dropped() {
        let db = PlanDb::in_memory();
        let big: Vec<PlanItem> = (0..150)
            .map(|n| PlanItem {
                note: "x".repeat(2000),
                ..note(&format!("n{n}"), "Long note")
            })
            .collect();
        db.replace(&big).unwrap();
        assert!(db.sync_pending().is_err());
    }
}
