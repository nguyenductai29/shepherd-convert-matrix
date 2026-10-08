use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{fs, io::Write, path::Path, sync::Mutex, time::Duration};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub executed_at: String,
    pub file: String,
    pub tables: u64,
    pub records: u64,
    pub errors: u64,
    pub warnings: u64,
    pub user: String,
    pub status: String,
    pub master_filepath: Option<String>,
    pub table_definition_filename: String,
    pub generated_sql_path: Option<String>,
    pub output_directory: Option<String>,
    pub output_files: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub validation: Option<Value>,
}

fn open_database(directory: &Path) -> Result<Connection, String> {
    fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    let connection =
        Connection::open(directory.join("history.sqlite3")).map_err(|e| e.to_string())?;
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    connection
        .execute_batch(
            "PRAGMA journal_mode=WAL;
         CREATE TABLE IF NOT EXISTS conversion_history (
           id TEXT PRIMARY KEY NOT NULL,
           executed_at TEXT NOT NULL,
           master_filename TEXT NOT NULL,
           master_filepath TEXT,
           table_definition_filename TEXT NOT NULL,
           record_count INTEGER NOT NULL CHECK(record_count >= 0),
           error_count INTEGER NOT NULL CHECK(error_count >= 0),
           warning_count INTEGER NOT NULL CHECK(warning_count >= 0),
           status TEXT NOT NULL,
           generated_sql_path TEXT,
           payload TEXT NOT NULL
         );
         CREATE INDEX IF NOT EXISTS ix_history_executed_at ON conversion_history(executed_at DESC);
         PRAGMA user_version=1;",
        )
        .map_err(|e| e.to_string())?;
    Ok(connection)
}

pub fn save_history(directory: &Path, entry: &HistoryEntry) -> Result<(), String> {
    if entry.id.is_empty() || entry.executed_at.is_empty() {
        return Err("History id and execution date are required".into());
    }
    if !matches!(
        entry.status.as_str(),
        "success" | "validation_error" | "failed"
    ) {
        return Err("Invalid history status".into());
    }
    let connection = open_database(directory)?;
    let payload = serde_json::to_string(entry).map_err(|e| e.to_string())?;
    let records = i64::try_from(entry.records).map_err(|e| e.to_string())?;
    let errors = i64::try_from(entry.errors).map_err(|e| e.to_string())?;
    let warnings = i64::try_from(entry.warnings).map_err(|e| e.to_string())?;
    connection.execute(
        "INSERT INTO conversion_history
         (id,executed_at,master_filename,master_filepath,table_definition_filename,record_count,error_count,warning_count,status,generated_sql_path,payload)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
         ON CONFLICT(id) DO UPDATE SET
           executed_at=excluded.executed_at,master_filename=excluded.master_filename,
           master_filepath=excluded.master_filepath,table_definition_filename=excluded.table_definition_filename,
           record_count=excluded.record_count,error_count=excluded.error_count,warning_count=excluded.warning_count,
           status=excluded.status,generated_sql_path=excluded.generated_sql_path,payload=excluded.payload",
        params![entry.id, entry.executed_at, entry.file, entry.master_filepath, entry.table_definition_filename,
            records, errors, warnings, entry.status, entry.generated_sql_path, payload],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn list_history(directory: &Path) -> Result<Vec<HistoryEntry>, String> {
    let connection = open_database(directory)?;
    let mut query = connection
        .prepare("SELECT payload FROM conversion_history ORDER BY executed_at DESC, id DESC")
        .map_err(|e| e.to_string())?;
    let rows = query
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    rows.map(|row| {
        let payload = row.map_err(|e| e.to_string())?;
        serde_json::from_str(&payload).map_err(|e| e.to_string())
    })
    .collect()
}

pub fn get_history(directory: &Path, id: &str) -> Result<Option<HistoryEntry>, String> {
    let connection = open_database(directory)?;
    let payload: Option<String> = connection
        .query_row(
            "SELECT payload FROM conversion_history WHERE id=?1",
            [id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    payload
        .map(|json| serde_json::from_str(&json).map_err(|e| e.to_string()))
        .transpose()
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub action: String,
    pub severity: String,
    pub detail: Option<String>,
}

static LOG_LOCK: Mutex<()> = Mutex::new(());
const MAX_LOG_BYTES: u64 = 1024 * 1024;

pub fn append_log(directory: &Path, entry: &LogEntry) -> Result<(), String> {
    if !matches!(entry.severity.as_str(), "info" | "warning" | "error") {
        return Err("Invalid log severity".into());
    }
    let _guard = LOG_LOCK.lock().map_err(|e| e.to_string())?;
    fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    let current = directory.join("shepherd.jsonl");
    if current
        .metadata()
        .map(|m| m.len() >= MAX_LOG_BYTES)
        .unwrap_or(false)
    {
        let oldest = directory.join("shepherd.5.jsonl");
        if oldest.exists() {
            fs::remove_file(oldest).map_err(|e| e.to_string())?;
        }
        for index in (1..5).rev() {
            let source = directory.join(format!("shepherd.{index}.jsonl"));
            if source.exists() {
                fs::rename(
                    source,
                    directory.join(format!("shepherd.{}.jsonl", index + 1)),
                )
                .map_err(|e| e.to_string())?;
            }
        }
        fs::rename(&current, directory.join("shepherd.1.jsonl")).map_err(|e| e.to_string())?;
    }
    let bounded = LogEntry {
        timestamp: entry.timestamp.chars().take(40).collect(),
        action: entry.action.chars().take(160).collect(),
        severity: entry.severity.clone(),
        detail: entry
            .detail
            .as_ref()
            .map(|value| value.chars().take(16_384).collect()),
    };
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(current)
        .map_err(|e| e.to_string())?;
    let mut line = serde_json::to_vec(&bounded).map_err(|e| e.to_string())?;
    line.push(b'\n');
    file.write_all(&line).map_err(|e| e.to_string())?;
    file.flush().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn test_directory() -> PathBuf {
        std::env::temp_dir().join(format!(
            "shepherd-storage-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    fn entry(id: &str, executed_at: &str) -> HistoryEntry {
        HistoryEntry {
            id: id.into(),
            executed_at: executed_at.into(),
            file: "部門マスタ.xlsm".into(),
            tables: 2,
            records: 7,
            errors: 0,
            warnings: 1,
            user: "ローカル".into(),
            status: "success".into(),
            master_filepath: Some("C:\\部門\\マスタ.xlsm".into()),
            table_definition_filename: "テーブル定義.xlsx".into(),
            generated_sql_path: None,
            output_directory: None,
            output_files: vec![],
            validation: None,
        }
    }

    #[test]
    fn history_survives_reopening_and_updates_same_run() {
        let dir = test_directory();
        let mut first = entry("run-1", "2026-10-08T10:00:00Z");
        save_history(&dir, &first).unwrap();
        assert_eq!(get_history(&dir, "run-1").unwrap(), Some(first.clone()));
        first.generated_sql_path = Some("C:\\出力\\insert.sql".into());
        save_history(&dir, &first).unwrap();
        assert_eq!(list_history(&dir).unwrap(), vec![first]);
        assert!(get_history(&dir, "' OR 1=1 --").unwrap().is_none());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn history_orders_newest_first_and_preserves_validation_report() {
        let dir = test_directory();
        let first = entry("run-1", "2026-10-08T10:00:00Z");
        let mut second = entry("run-2", "2026-10-08T11:00:00Z");
        second.status = "validation_error".into();
        second.errors = 2;
        second.validation =
            Some(serde_json::json!({"errorCount":2,"items":[{"message":"必須値がありません"}]}));
        save_history(&dir, &second).unwrap();
        save_history(&dir, &first).unwrap();
        assert_eq!(list_history(&dir).unwrap(), vec![second, first]);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn logs_are_json_lines_with_rotation() {
        let dir = test_directory();
        let entry = LogEntry {
            timestamp: "2026-10-08T10:00:00Z".into(),
            action: "conversion.failed".into(),
            severity: "error".into(),
            detail: Some("日本語\n診断".into()),
        };
        append_log(&dir, &entry).unwrap();
        let text = fs::read_to_string(dir.join("shepherd.jsonl")).unwrap();
        assert_eq!(text.lines().count(), 1);
        let json: Value = serde_json::from_str(text.trim()).unwrap();
        assert_eq!(json["detail"], "日本語\n診断");
        fs::write(
            dir.join("shepherd.jsonl"),
            vec![b' '; MAX_LOG_BYTES as usize],
        )
        .unwrap();
        append_log(&dir, &entry).unwrap();
        assert!(dir.join("shepherd.1.jsonl").exists());
        assert!(dir.join("shepherd.jsonl").metadata().unwrap().len() < MAX_LOG_BYTES);
        fs::remove_dir_all(dir).unwrap();
    }
}
