use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::Serialize;
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Manager, State};
use uuid::Uuid;

const SCHEMA_VERSION: i64 = 1;
#[cfg(any(target_os = "windows", target_os = "macos"))]
const CREDENTIAL_SERVICE: &str = "AWAI创作工作台";

struct Library {
    root: PathBuf,
    db: Connection,
}

struct AppState {
    library: Mutex<Option<Library>>,
    config_path: PathBuf,
    suggested_path: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryStatus {
    initialized: bool,
    path: Option<String>,
    suggested_path: String,
    unavailable_path: Option<String>,
}

#[derive(Serialize)]
struct CredentialInfo {
    id: String,
    label: String,
    available: bool,
}

fn open_library(root: &Path) -> Result<Library, String> {
    let metadata = root.join("metadata");
    let db = Connection::open(metadata.join("awai.db")).map_err(|error| error.to_string())?;
    db.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")
        .map_err(|error| error.to_string())?;
    migrate(&db)?;
    cleanup_temp_files(root)?;
    Ok(Library {
        root: root.to_path_buf(),
        db,
    })
}

fn open_existing_library(root: &Path) -> Result<Library, String> {
    if !root.join("metadata/awai.db").is_file() {
        return Err("所选目录不是现有 AWAI 素材库".to_string());
    }
    open_library(root)
}

fn migrate(db: &Connection) -> Result<(), String> {
    db.execute_batch(
        "BEGIN;
         CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
         CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, json TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS favorites (id TEXT PRIMARY KEY, json TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS agent_conversations (id TEXT PRIMARY KEY, json TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, json TEXT NOT NULL, relative_path TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS thumbnails (id TEXT PRIMARY KEY, json TEXT NOT NULL, relative_path TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS credentials (id TEXT PRIMARY KEY, label TEXT NOT NULL);
         INSERT OR IGNORE INTO schema_migrations(version) VALUES (1);
         COMMIT;"
    ).map_err(|error| error.to_string())?;
    let version: i64 = db
        .query_row("SELECT MAX(version) FROM schema_migrations", [], |row| {
            row.get(0)
        })
        .map_err(|error| error.to_string())?;
    if version != SCHEMA_VERSION {
        return Err(format!("不支持的素材库 schema 版本：{version}"));
    }
    Ok(())
}

fn cleanup_temp_files(root: &Path) -> Result<(), String> {
    for directory in ["generated", "references", "metadata/thumbnails"] {
        let path = root.join(directory);
        if !path.exists() {
            continue;
        }
        for entry in fs::read_dir(path).map_err(|error| error.to_string())? {
            let path = entry.map_err(|error| error.to_string())?.path();
            if path.extension().and_then(|value| value.to_str()) == Some("tmp") {
                fs::remove_file(path).map_err(|error| error.to_string())?;
            }
        }
    }
    Ok(())
}

fn create_library(root: &Path) -> Result<Library, String> {
    for directory in [
        "generated",
        "references",
        "exports",
        "metadata",
        "metadata/thumbnails",
    ] {
        fs::create_dir_all(root.join(directory)).map_err(|error| error.to_string())?;
    }
    open_library(root)
}

fn with_library<T>(
    state: &State<AppState>,
    operation: impl FnOnce(&mut Library) -> Result<T, String>,
) -> Result<T, String> {
    let mut guard = state
        .library
        .lock()
        .map_err(|_| "素材库状态不可用".to_string())?;
    operation(
        guard
            .as_mut()
            .ok_or_else(|| "请先确认素材库位置".to_string())?,
    )
}

fn write_config(path: &Path, library_path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(
        path,
        serde_json::to_vec(&serde_json::json!({ "path": library_path }))
            .map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())
}

fn configured_library_path(config_path: &Path) -> Option<PathBuf> {
    fs::read(config_path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
        .and_then(|value| value.get("path").and_then(Value::as_str).map(PathBuf::from))
}

fn library_status_from_state(state: &AppState, library: &Option<Library>) -> LibraryStatus {
    let unavailable_path = if library.is_none() {
        configured_library_path(&state.config_path).map(|path| path.to_string_lossy().into_owned())
    } else {
        None
    };
    LibraryStatus {
        initialized: library.is_some(),
        path: library
            .as_ref()
            .map(|library| library.root.to_string_lossy().into_owned()),
        suggested_path: state.suggested_path.to_string_lossy().into_owned(),
        unavailable_path,
    }
}

fn copy_directory(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|error| error.to_string())?;
    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let target_path = target.join(entry.file_name());
        if path.is_dir() {
            copy_directory(&path, &target_path)?;
        } else if path.is_file() {
            fs::copy(&path, &target_path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn verify_library(library: &Library) -> Result<(), String> {
    migrate(&library.db)?;
    for table in ["images", "thumbnails"] {
        let mut statement = library
            .db
            .prepare(&format!("SELECT relative_path FROM {table}"))
            .map_err(|error| error.to_string())?;
        let paths = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<String>, _>>()
            .map_err(|error| error.to_string())?;
        if let Some(path) = paths.iter().find(|path| !library.root.join(path).is_file()) {
            return Err(format!("素材库缺少登记文件：{path}"));
        }
    }
    Ok(())
}

fn parse_data_url(data_url: &str) -> Result<(String, Vec<u8>), String> {
    let (header, encoded) = data_url
        .split_once(',')
        .ok_or_else(|| "文件数据无效".to_string())?;
    if !header.ends_with(";base64") {
        return Err("仅支持 base64 文件数据".to_string());
    }
    let media_type = header
        .strip_prefix("data:")
        .and_then(|value| value.strip_suffix(";base64"))
        .unwrap_or("application/octet-stream");
    STANDARD
        .decode(encoded)
        .map(|bytes| (media_type.to_string(), bytes))
        .map_err(|error| error.to_string())
}

fn extension_for_media_type(media_type: &str) -> &'static str {
    match media_type {
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => "png",
    }
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<bool, String> {
    if path.exists() {
        return Ok(false);
    }
    let temp = path.with_extension(format!("{}.tmp", Uuid::new_v4()));
    fs::write(&temp, bytes).map_err(|error| error.to_string())?;
    if let Err(error) = fs::rename(&temp, path) {
        let _ = fs::remove_file(&temp);
        return Err(error.to_string());
    }
    Ok(true)
}

fn collection_table(collection: &str) -> Result<&'static str, String> {
    match collection {
        "tasks" => Ok("tasks"),
        "agentConversations" => Ok("agent_conversations"),
        "images" => Ok("images"),
        "thumbnails" => Ok("thumbnails"),
        _ => Err("未知记录类型".to_string()),
    }
}

fn json_id(value: &str) -> Result<String, String> {
    serde_json::from_str::<Value>(value)
        .map_err(|error| error.to_string())?
        .get("id")
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| "记录缺少 id".to_string())
}

fn put_json(tx: &Transaction<'_>, table: &str, id: &str, value: &str) -> Result<(), String> {
    tx.execute(&format!("INSERT INTO {table}(id, json) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET json = excluded.json"), params![id, value])
        .map(|_| ()).map_err(|error| error.to_string())
}

#[tauri::command]
fn library_status(state: State<AppState>) -> Result<LibraryStatus, String> {
    let guard = state
        .library
        .lock()
        .map_err(|_| "素材库状态不可用".to_string())?;
    Ok(library_status_from_state(&state, &guard))
}

#[tauri::command]
fn library_initialize(path: String, state: State<AppState>) -> Result<LibraryStatus, String> {
    let root = PathBuf::from(path);
    let mut guard = state
        .library
        .lock()
        .map_err(|_| "素材库状态不可用".to_string())?;
    if let Some(current) = guard.as_ref() {
        if current.root == root {
            return Ok(library_status_from_state(&state, &guard));
        }
        let running: i64 = current
            .db
            .query_row(
                "SELECT COUNT(*) FROM tasks WHERE json_extract(json, '$.status') = 'running'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        if running > 0 {
            return Err("任务运行期间不能更改素材库位置".to_string());
        }
        return Err("素材库迁移由后续迁移流程处理".to_string());
    }
    let library = create_library(&root)?;
    write_config(&state.config_path, &root)?;
    *guard = Some(library);
    Ok(library_status_from_state(&state, &guard))
}

#[tauri::command]
fn library_reconnect(state: State<AppState>) -> Result<LibraryStatus, String> {
    let path = configured_library_path(&state.config_path)
        .ok_or_else(|| "没有可恢复的素材库位置".to_string())?;
    let library = open_existing_library(&path)?;
    let mut guard = state
        .library
        .lock()
        .map_err(|_| "素材库状态不可用".to_string())?;
    *guard = Some(library);
    Ok(library_status_from_state(&state, &guard))
}

#[tauri::command]
fn library_relocate(path: String, state: State<AppState>) -> Result<LibraryStatus, String> {
    let root = PathBuf::from(path);
    let library = open_existing_library(&root)?;
    verify_library(&library)?;
    write_config(&state.config_path, &root)?;
    let mut guard = state
        .library
        .lock()
        .map_err(|_| "素材库状态不可用".to_string())?;
    *guard = Some(library);
    Ok(library_status_from_state(&state, &guard))
}

#[tauri::command]
fn library_migrate(path: String, state: State<AppState>) -> Result<LibraryStatus, String> {
    let target = PathBuf::from(path);
    let mut guard = state
        .library
        .lock()
        .map_err(|_| "素材库状态不可用".to_string())?;
    let current = guard.as_mut().ok_or_else(|| "请先连接素材库".to_string())?;
    if current.root == target {
        return Ok(library_status_from_state(&state, &guard));
    }
    if target.exists() {
        return Err("目标目录已存在，请选择一个尚未创建的目录".to_string());
    }
    let running: i64 = current
        .db
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE json_extract(json, '$.status') = 'running'",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if running > 0 {
        return Err("任务运行期间不能迁移素材库位置".to_string());
    }
    current
        .db
        .execute_batch("PRAGMA wal_checkpoint(FULL);")
        .map_err(|error| error.to_string())?;
    let staging = target.with_file_name(format!(".awai-migration-{}", Uuid::new_v4()));
    copy_directory(&current.root, &staging)?;
    let migrated = open_existing_library(&staging)?;
    verify_library(&migrated)?;
    drop(migrated);
    fs::rename(&staging, &target).map_err(|error| error.to_string())?;
    let library = open_existing_library(&target)?;
    write_config(&state.config_path, &target)?;
    *guard = Some(library);
    Ok(library_status_from_state(&state, &guard))
}

#[tauri::command]
fn desktop_base_url() -> String {
    option_env!("AWAI_SUB2API_BASE_URL")
        .unwrap_or("https://sub2api.example.invalid")
        .trim_end_matches('/')
        .to_string()
}

#[tauri::command]
fn metadata_get(key: String, state: State<AppState>) -> Result<Option<String>, String> {
    with_library(&state, |library| {
        library
            .db
            .query_row("SELECT value FROM app_state WHERE key = ?1", [key], |row| {
                row.get(0)
            })
            .optional()
            .map_err(|error| error.to_string())
    })
}

#[tauri::command]
fn metadata_set(key: String, value: String, state: State<AppState>) -> Result<(), String> {
    with_library(&state, |library| {
        let tx = library
            .db
            .transaction()
            .map_err(|error| error.to_string())?;
        tx.execute("INSERT INTO app_state(key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value", params![key, value]).map_err(|error| error.to_string())?;
        if let Ok(root) = serde_json::from_str::<Value>(&value) {
            if let Some(favorites) = root
                .pointer("/state/favoriteCollections")
                .and_then(Value::as_array)
            {
                tx.execute("DELETE FROM favorites", [])
                    .map_err(|error| error.to_string())?;
                for favorite in favorites {
                    if let Some(id) = favorite.get("id").and_then(Value::as_str) {
                        put_json(&tx, "favorites", id, &favorite.to_string())?;
                    }
                }
            }
        }
        tx.commit().map_err(|error| error.to_string())
    })
}

#[tauri::command]
fn metadata_remove(key: String, state: State<AppState>) -> Result<(), String> {
    with_library(&state, |library| {
        library
            .db
            .execute("DELETE FROM app_state WHERE key = ?1", [key])
            .map(|_| ())
            .map_err(|error| error.to_string())
    })
}

#[tauri::command]
fn record_get(
    collection: String,
    id: String,
    state: State<AppState>,
) -> Result<Option<String>, String> {
    let table = collection_table(&collection)?;
    with_library(&state, |library| {
        library
            .db
            .query_row(
                &format!("SELECT json FROM {table} WHERE id = ?1"),
                [id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| error.to_string())
    })
}

#[tauri::command]
fn record_list(collection: String, state: State<AppState>) -> Result<Vec<String>, String> {
    let table = collection_table(&collection)?;
    with_library(&state, |library| {
        let mut statement = library
            .db
            .prepare(&format!("SELECT json FROM {table} ORDER BY rowid DESC"))
            .map_err(|error| error.to_string())?;
        let values = statement
            .query_map([], |row| row.get(0))
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<String>, _>>()
            .map_err(|error| error.to_string())?;
        Ok(values)
    })
}

#[tauri::command]
fn record_ids(collection: String, state: State<AppState>) -> Result<Vec<String>, String> {
    let table = collection_table(&collection)?;
    with_library(&state, |library| {
        let mut statement = library
            .db
            .prepare(&format!("SELECT id FROM {table}"))
            .map_err(|error| error.to_string())?;
        let ids = statement
            .query_map([], |row| row.get(0))
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<String>, _>>()
            .map_err(|error| error.to_string())?;
        Ok(ids)
    })
}

#[tauri::command]
fn record_put(
    collection: String,
    id: String,
    value: String,
    state: State<AppState>,
) -> Result<String, String> {
    let table = collection_table(&collection)?;
    with_library(&state, |library| {
        if table == "thumbnails" {
            let relative = format!("metadata/thumbnails/{id}.webp");
            library.db.execute(
                "INSERT INTO thumbnails(id, json, relative_path) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET json = excluded.json, relative_path = excluded.relative_path",
                params![id, value, relative],
            ).map_err(|error| error.to_string())?;
        } else {
            library.db.execute(&format!("INSERT INTO {table}(id, json) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET json = excluded.json"), params![id, value]).map_err(|error| error.to_string())?;
        }
        Ok(id)
    })
}

#[tauri::command]
fn record_delete(collection: String, id: String, state: State<AppState>) -> Result<(), String> {
    let table = collection_table(&collection)?;
    with_library(&state, |library| {
        library
            .db
            .execute(&format!("DELETE FROM {table} WHERE id = ?1"), [id])
            .map(|_| ())
            .map_err(|error| error.to_string())
    })
}

#[tauri::command]
fn records_clear(collection: String, state: State<AppState>) -> Result<(), String> {
    let table = collection_table(&collection)?;
    with_library(&state, |library| {
        library
            .db
            .execute(&format!("DELETE FROM {table}"), [])
            .map(|_| ())
            .map_err(|error| error.to_string())
    })
}

#[tauri::command]
fn records_replace(
    collection: String,
    records: Vec<String>,
    state: State<AppState>,
) -> Result<(), String> {
    let table = collection_table(&collection)?;
    with_library(&state, |library| {
        let tx = library
            .db
            .transaction()
            .map_err(|error| error.to_string())?;
        tx.execute(&format!("DELETE FROM {table}"), [])
            .map_err(|error| error.to_string())?;
        for record in records {
            put_json(&tx, table, &json_id(&record)?, &record)?;
        }
        tx.commit().map_err(|error| error.to_string())
    })
}

#[tauri::command]
fn records_commit_task_deletion(
    deleted_task_ids: Vec<String>,
    updated_tasks: Vec<String>,
    updated_conversations: Vec<String>,
    state: State<AppState>,
) -> Result<(), String> {
    with_library(&state, |library| {
        let tx = library
            .db
            .transaction()
            .map_err(|error| error.to_string())?;
        for id in deleted_task_ids {
            tx.execute("DELETE FROM tasks WHERE id = ?1", [id])
                .map_err(|error| error.to_string())?;
        }
        for value in updated_tasks {
            put_json(&tx, "tasks", &json_id(&value)?, &value)?;
        }
        for value in updated_conversations {
            put_json(&tx, "agent_conversations", &json_id(&value)?, &value)?;
        }
        tx.commit().map_err(|error| error.to_string())
    })
}

fn registered_file(library: &Library, logical_path: &str) -> Result<Option<PathBuf>, String> {
    let parts: Vec<&str> = logical_path.split('/').collect();
    if parts.len() != 2 || parts[1].contains("..") {
        return Err("文件路径无效".to_string());
    }
    let id = parts[1].split('.').next().unwrap_or_default();
    let table = match parts[0] {
        "images" => "images",
        "thumbnails" => "thumbnails",
        _ => return Err("文件路径无效".to_string()),
    };
    let relative: Option<String> = library
        .db
        .query_row(
            &format!("SELECT relative_path FROM {table} WHERE id = ?1"),
            [id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    Ok(relative.map(|path| library.root.join(path)))
}

#[tauri::command]
fn file_read(path: String, state: State<AppState>) -> Result<Option<String>, String> {
    with_library(&state, |library| {
        let Some(path) = registered_file(library, &path)? else {
            return Ok(None);
        };
        if !path.exists() {
            return Ok(None);
        }
        let bytes = fs::read(&path).map_err(|error| error.to_string())?;
        let media_type = match path.extension().and_then(|value| value.to_str()) {
            Some("jpg" | "jpeg") => "image/jpeg",
            Some("webp") => "image/webp",
            Some("gif") => "image/gif",
            _ => "image/png",
        };
        Ok(Some(format!(
            "data:{media_type};base64,{}",
            STANDARD.encode(bytes)
        )))
    })
}

#[tauri::command]
fn file_write(path: String, data_url: String, state: State<AppState>) -> Result<(), String> {
    with_library(&state, |library| {
        let parts: Vec<&str> = path.split('/').collect();
        if parts.len() != 2 || parts[0] != "thumbnails" || parts[1].contains("..") {
            return Err("文件路径无效".to_string());
        }
        let (_, bytes) = parse_data_url(&data_url)?;
        atomic_write(
            &library.root.join("metadata/thumbnails").join(parts[1]),
            &bytes,
        )
        .map(|_| ())
    })
}

#[tauri::command]
fn file_remove(path: String, state: State<AppState>) -> Result<(), String> {
    with_library(&state, |library| {
        if let Some(path) = registered_file(library, &path)? {
            if path.exists() {
                fs::remove_file(path).map_err(|error| error.to_string())?;
            }
        }
        Ok(())
    })
}

#[tauri::command]
fn files_clear(state: State<AppState>) -> Result<(), String> {
    images_clear(state)
}

#[tauri::command]
fn image_put(
    id: String,
    data_url: String,
    metadata: String,
    source: String,
    state: State<AppState>,
) -> Result<String, String> {
    with_library(&state, |library| {
        let (media_type, bytes) = parse_data_url(&data_url)?;
        let directory = if source == "generated" {
            "generated"
        } else {
            "references"
        };
        let relative = format!("{directory}/{id}.{}", extension_for_media_type(&media_type));
        let final_path = library.root.join(&relative);
        let previous_path: Option<String> = library
            .db
            .query_row(
                "SELECT relative_path FROM images WHERE id = ?1",
                [&id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        let created = atomic_write(&final_path, &bytes)?;
        let transaction = library
            .db
            .transaction()
            .map_err(|error| error.to_string())?;
        let result = transaction.execute(
            "INSERT INTO images(id, json, relative_path) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET json = excluded.json, relative_path = excluded.relative_path",
            params![id, metadata, relative],
        ).and_then(|_| transaction.commit()).map_err(|error| error.to_string());
        if result.is_err() && created {
            let _ = fs::remove_file(final_path);
        }
        if result.is_ok() {
            if let Some(previous) = previous_path.filter(|previous| previous != &relative) {
                let _ = fs::remove_file(library.root.join(previous));
            }
        }
        result.map(|_| id)
    })
}

#[tauri::command]
fn image_delete(id: String, state: State<AppState>) -> Result<(), String> {
    with_library(&state, |library| {
        let image_path: Option<String> = library
            .db
            .query_row(
                "SELECT relative_path FROM images WHERE id = ?1",
                [&id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        let thumbnail_path: Option<String> = library
            .db
            .query_row(
                "SELECT relative_path FROM thumbnails WHERE id = ?1",
                [&id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        let tx = library
            .db
            .transaction()
            .map_err(|error| error.to_string())?;
        tx.execute("DELETE FROM images WHERE id = ?1", [&id])
            .map_err(|error| error.to_string())?;
        tx.execute("DELETE FROM thumbnails WHERE id = ?1", [&id])
            .map_err(|error| error.to_string())?;
        tx.commit().map_err(|error| error.to_string())?;
        for path in [image_path, thumbnail_path].into_iter().flatten() {
            let path = library.root.join(path);
            if path.exists() {
                fs::remove_file(path).map_err(|error| error.to_string())?;
            }
        }
        Ok(())
    })
}

#[tauri::command]
fn images_clear(state: State<AppState>) -> Result<(), String> {
    with_library(&state, |library| {
        let tx = library
            .db
            .transaction()
            .map_err(|error| error.to_string())?;
        tx.execute("DELETE FROM images", [])
            .map_err(|error| error.to_string())?;
        tx.execute("DELETE FROM thumbnails", [])
            .map_err(|error| error.to_string())?;
        tx.commit().map_err(|error| error.to_string())?;
        for directory in ["generated", "references", "metadata/thumbnails"] {
            let path = library.root.join(directory);
            if path.exists() {
                fs::remove_dir_all(&path).map_err(|error| error.to_string())?;
            }
            fs::create_dir_all(path).map_err(|error| error.to_string())?;
        }
        Ok(())
    })
}

#[tauri::command]
fn download_write(path: String, data_url: String) -> Result<(), String> {
    let (_, bytes) = parse_data_url(&data_url)?;
    fs::write(path, bytes).map_err(|error| error.to_string())
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
fn credential_set_secret(id: &str, value: &str) -> Result<(), String> {
    keyring::Entry::new(CREDENTIAL_SERVICE, id)
        .map_err(|error| error.to_string())?
        .set_password(value)
        .map_err(|error| error.to_string())
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
fn credential_get_secret(id: &str) -> Result<Option<String>, String> {
    match keyring::Entry::new(CREDENTIAL_SERVICE, id)
        .map_err(|error| error.to_string())?
        .get_password()
    {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn credential_set_secret(_id: &str, _value: &str) -> Result<(), String> {
    Err("系统凭据仅支持 Windows Credential Manager 和 macOS Keychain".to_string())
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn credential_get_secret(_id: &str) -> Result<Option<String>, String> {
    Ok(None)
}

#[tauri::command]
fn credential_list(state: State<AppState>) -> Result<Vec<CredentialInfo>, String> {
    with_library(&state, |library| {
        let mut statement = library
            .db
            .prepare("SELECT id, label FROM credentials ORDER BY rowid")
            .map_err(|error| error.to_string())?;
        let entries = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|error| error.to_string())?;
        entries
            .map(|entry| {
                let (id, label) = entry.map_err(|error| error.to_string())?;
                Ok(CredentialInfo {
                    available: credential_get_secret(&id)?.is_some(),
                    id,
                    label,
                })
            })
            .collect()
    })
}

#[tauri::command]
fn credential_create(
    label: String,
    value: String,
    state: State<AppState>,
) -> Result<CredentialInfo, String> {
    if label.trim().is_empty() || value.trim().is_empty() {
        return Err("凭据名称和 Key 不能为空".to_string());
    }
    let id = Uuid::new_v4().to_string();
    credential_set_secret(&id, value.trim())?;
    with_library(&state, |library| {
        library
            .db
            .execute(
                "INSERT INTO credentials(id, label) VALUES (?1, ?2)",
                params![id, label.trim()],
            )
            .map_err(|error| error.to_string())
    })?;
    Ok(CredentialInfo {
        id,
        label: label.trim().to_string(),
        available: true,
    })
}

#[tauri::command]
fn credential_get(id: String) -> Result<Option<String>, String> {
    credential_get_secret(&id)
}

#[tauri::command]
fn credential_set(id: String, value: String) -> Result<(), String> {
    credential_set_secret(&id, &value)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let config_path = app.path().app_config_dir()?.join("library.json");
            let suggested_path = app.path().document_dir()?.join("AWAI创作工作台");
            let library = fs::read(&config_path)
                .ok()
                .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
                .and_then(|value| value.get("path").and_then(Value::as_str).map(PathBuf::from))
                .filter(|path| path.join("metadata/awai.db").exists())
                .and_then(|path| open_library(&path).ok());
            app.manage(AppState {
                library: Mutex::new(library),
                config_path,
                suggested_path,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            library_status,
            library_initialize,
            library_reconnect,
            library_relocate,
            library_migrate,
            desktop_base_url,
            metadata_get,
            metadata_set,
            metadata_remove,
            record_get,
            record_list,
            record_ids,
            record_put,
            record_delete,
            records_clear,
            records_replace,
            records_commit_task_deletion,
            file_read,
            file_write,
            file_remove,
            files_clear,
            image_put,
            image_delete,
            images_clear,
            download_write,
            credential_list,
            credential_create,
            credential_get,
            credential_set,
        ])
        .run(tauri::generate_context!())
        .expect("AWAI 桌面宿主启动失败");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_library(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "awai-{name}-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn first_run_does_not_create_suggested_directory_before_confirmation() {
        let root = temp_library("unconfirmed");
        assert!(!root.exists());
        let _status = LibraryStatus {
            initialized: false,
            path: None,
            suggested_path: root.to_string_lossy().into_owned(),
            unavailable_path: None,
        };
        assert!(!root.exists());
    }

    #[test]
    fn creates_versioned_library_schema_and_required_directories() {
        let root = temp_library("schema");
        let library = create_library(&root).unwrap();
        for directory in ["generated", "references", "exports", "metadata"] {
            assert!(root.join(directory).is_dir());
        }
        let version: i64 = library
            .db
            .query_row("SELECT MAX(version) FROM schema_migrations", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(version, SCHEMA_VERSION);
        drop(library);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn atomic_image_write_registers_relative_path_and_restores_after_reopen() {
        let root = temp_library("atomic");
        let mut library = create_library(&root).unwrap();
        let path = root.join("generated/result.png");
        assert!(atomic_write(&path, b"image").unwrap());
        let tx = library.db.transaction().unwrap();
        tx.execute("INSERT INTO images(id, json, relative_path) VALUES ('result', '{}', 'generated/result.png')", []).unwrap();
        tx.commit().unwrap();
        drop(library);
        let reopened = open_library(&root).unwrap();
        let relative: String = reopened
            .db
            .query_row(
                "SELECT relative_path FROM images WHERE id = 'result'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(relative, "generated/result.png");
        assert_eq!(fs::read(root.join(relative)).unwrap(), b"image");
        drop(reopened);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn failed_registration_can_remove_new_file_and_cleanup_stale_temp_files() {
        let root = temp_library("cleanup");
        let library = create_library(&root).unwrap();
        fs::write(root.join("generated/orphan.tmp"), b"partial").unwrap();
        drop(library);
        let reopened = open_library(&root).unwrap();
        assert!(!root.join("generated/orphan.tmp").exists());
        drop(reopened);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn verifies_migrated_library_before_switching_and_keeps_source() {
        let source = temp_library("migration-source");
        let target = temp_library("migration-target");
        let library = create_library(&source).unwrap();
        fs::write(source.join("generated/result.png"), b"image").unwrap();
        library
            .db
            .execute(
                "INSERT INTO images(id, json, relative_path) VALUES ('result', '{}', 'generated/result.png')",
                [],
            )
            .unwrap();
        verify_library(&library).unwrap();
        drop(library);

        copy_directory(&source, &target).unwrap();
        let migrated = open_existing_library(&target).unwrap();
        verify_library(&migrated).unwrap();
        assert_eq!(
            fs::read(target.join("generated/result.png")).unwrap(),
            b"image"
        );
        assert!(source.join("generated/result.png").is_file());
        drop(migrated);
        fs::remove_dir_all(source).unwrap();
        fs::remove_dir_all(target).unwrap();
    }

    #[test]
    fn failed_migration_validation_keeps_original_library_available() {
        let source = temp_library("migration-rollback-source");
        let target = temp_library("migration-rollback-target");
        let library = create_library(&source).unwrap();
        library
            .db
            .execute(
                "INSERT INTO images(id, json, relative_path) VALUES ('missing', '{}', 'generated/missing.png')",
                [],
            )
            .unwrap();
        drop(library);

        copy_directory(&source, &target).unwrap();
        let migrated = open_existing_library(&target).unwrap();
        assert!(verify_library(&migrated).is_err());
        drop(migrated);
        assert!(open_existing_library(&source).is_ok());
        fs::remove_dir_all(source).unwrap();
        fs::remove_dir_all(target).unwrap();
    }

    #[test]
    fn recovery_only_opens_existing_libraries() {
        let root = temp_library("missing-library");
        assert!(open_existing_library(&root).is_err());
        assert!(!root.exists());
    }

    #[test]
    fn credential_table_contains_references_only() {
        let root = temp_library("credentials");
        let library = create_library(&root).unwrap();
        library
            .db
            .execute(
                "INSERT INTO credentials(id, label) VALUES ('credential-1', '主 Key')",
                [],
            )
            .unwrap();
        let schema: String = library
            .db
            .query_row(
                "SELECT sql FROM sqlite_master WHERE name = 'credentials'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(!schema.to_lowercase().contains("secret"));
        assert!(!schema.to_lowercase().contains("value"));
        drop(library);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn production_base_url_is_fixed_and_not_empty() {
        assert!(desktop_base_url().starts_with("https://"));
    }
}
