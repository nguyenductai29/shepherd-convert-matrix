mod storage;

use storage::{HistoryEntry, LogEntry};
use tauri::Manager;

fn app_data(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

#[tauri::command]
async fn history_list(app: tauri::AppHandle) -> Result<Vec<HistoryEntry>, String> {
    let directory = app_data(&app)?;
    tauri::async_runtime::spawn_blocking(move || storage::list_history(&directory))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn history_get(app: tauri::AppHandle, id: String) -> Result<Option<HistoryEntry>, String> {
    let directory = app_data(&app)?;
    tauri::async_runtime::spawn_blocking(move || storage::get_history(&directory, &id))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn history_save(app: tauri::AppHandle, entry: HistoryEntry) -> Result<(), String> {
    let directory = app_data(&app)?;
    tauri::async_runtime::spawn_blocking(move || storage::save_history(&directory, &entry))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn append_log(app: tauri::AppHandle, entry: LogEntry) -> Result<(), String> {
    let directory = app_data(&app)?.join("logs");
    tauri::async_runtime::spawn_blocking(move || storage::append_log(&directory, &entry))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn log_directory(app: tauri::AppHandle) -> Result<String, String> {
    let directory = app_data(&app)?.join("logs");
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    Ok(directory.to_string_lossy().into_owned())
}

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            app_version,
            history_list,
            history_get,
            history_save,
            append_log,
            log_directory
        ])
        .run(tauri::generate_context!())
        .expect("error while running Shepherd Master SQL Generator");
}
