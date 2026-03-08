use std::env;
use std::fs;
use std::path::PathBuf;

// ── State ─────────────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppState {
    pub status: String,
    pub config_path: String,
    pub snapshots: Vec<SnapshotMeta>,
    pub watching: bool,
    pub port: u16,
    pub openclaw_version: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotMeta {
    pub id: String,
    pub timestamp: String,
    pub openclaw_version: String,
    pub trigger: String,
    pub diff_summary: String,
    pub config_hash: String,
}

fn get_config_path() -> String {
    env::var("GUARDIAN_CONFIG_PATH").unwrap_or_else(|_| {
        let home = env::var("HOME").unwrap_or_default();
        format!("{home}/.openclaw/openclaw.json")
    })
}

fn get_storage_dir() -> PathBuf {
    let base = env::var("GUARDIAN_STORAGE_DIR").unwrap_or_else(|_| {
        let home = env::var("HOME").unwrap_or_default();
        format!("{home}/.guardian/snapshots")
    });
    PathBuf::from(base)
}

fn load_snapshots() -> Vec<SnapshotMeta> {
    let dir = get_storage_dir();
    let index = dir.join("index.json");
    if !index.exists() {
        return vec![];
    }
    let content = fs::read_to_string(&index).unwrap_or_default();
    // Parse index.json: array of { id, timestamp, openclawVersion, trigger, diffSummary, configHash }
    if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(&content) {
        arr.iter()
            .filter_map(|v| {
                Some(SnapshotMeta {
                    id: v["id"].as_str()?.to_string(),
                    timestamp: v["timestamp"].as_str().unwrap_or("").to_string(),
                    openclaw_version: v["openclawVersion"].as_str().unwrap_or("unknown").to_string(),
                    trigger: v["trigger"].as_str().unwrap_or("manual").to_string(),
                    diff_summary: v["diffSummary"].as_str().unwrap_or("").to_string(),
                    config_hash: v["configHash"].as_str().unwrap_or("").to_string(),
                })
            })
            .collect()
    } else {
        vec![]
    }
}

fn check_config_status() -> String {
    let path = get_config_path();
    if !std::path::Path::new(&path).exists() {
        return "error".to_string();
    }
    match fs::read_to_string(&path) {
        Ok(content) => {
            if serde_json::from_str::<serde_json::Value>(&content).is_ok() {
                "ok".to_string()
            } else {
                "error".to_string()
            }
        }
        Err(_) => "error".to_string(),
    }
}

fn read_openclaw_version(config_path: &str) -> String {
    fs::read_to_string(config_path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v["meta"]["lastTouchedVersion"].as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "unknown".to_string())
}

// ── Commands ──────────────────────────────────────────────

#[tauri::command]
fn get_app_state() -> AppState {
    AppState {
        status: check_config_status(),
        config_path: get_config_path(),
        snapshots: load_snapshots(),
        watching: false,
        port: 7749,
        openclaw_version: read_openclaw_version(&get_config_path()),
    }
}

#[tauri::command]
fn start_watch() -> Result<String, String> {
    // TODO: spawn background watcher in future iteration
    Ok(format!("Watching: {}", get_config_path()))
}

#[tauri::command]
fn open_history() -> Vec<SnapshotMeta> {
    load_snapshots()
}

#[tauri::command]
fn restore_snapshot(snapshot_id: String) -> Result<String, String> {
    let dir = get_storage_dir();
    let snap_file = dir.join(format!("{snapshot_id}.json"));
    if !snap_file.exists() {
        return Err(format!("Snapshot not found: {snapshot_id}"));
    }

    let content = fs::read_to_string(&snap_file).map_err(|e| e.to_string())?;
    let snap: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let config_snapshot = &snap["configSnapshot"];
    let restored = serde_json::to_string_pretty(config_snapshot).map_err(|e| e.to_string())?;

    let config_path = get_config_path();

    // Backup current before restore
    let bak = format!("{config_path}.bak");
    let _ = fs::copy(&config_path, &bak);

    fs::write(&config_path, restored).map_err(|e| e.to_string())?;

    Ok(format!("Restored from {snapshot_id}"))
}

#[tauri::command]
fn llm_fix() -> Result<String, String> {
    // Diagnose current config and suggest fix
    let path = get_config_path();
    let content =
        fs::read_to_string(&path).map_err(|e| format!("Cannot read config: {e}"))?;

    match serde_json::from_str::<serde_json::Value>(&content) {
        Ok(_) => Ok("Config is valid JSON — no fix needed.".to_string()),
        Err(e) => Err(format!(
            "Config parse error at {e}. Use 'Restore' to recover from a snapshot."
        )),
    }
}

#[tauri::command]
fn open_settings() -> serde_json::Value {
    serde_json::json!({
        "configPath": get_config_path(),
        "storageDir": get_storage_dir().to_string_lossy(),
        "port": 7749,
        "maxSnapshots": 20,
    })
}

#[tauri::command]
fn open_dashboard() -> Result<(), String> {
    open::that("https://openclaw.ai/dashboard").map_err(|e| e.to_string())
}

// ── Entry ─────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_app_state,
            start_watch,
            open_history,
            restore_snapshot,
            llm_fix,
            open_settings,
            open_dashboard,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
