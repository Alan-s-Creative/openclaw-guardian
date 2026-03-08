use std::env;
use std::fs;
use std::path::{Path, PathBuf};

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

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSnapshot {
    id: String,
    timestamp: String,
    #[serde(default = "default_unknown")]
    openclaw_version: String,
    #[serde(default = "default_manual")]
    trigger: String,
    #[serde(default)]
    diff_summary: String,
    #[serde(default)]
    config_hash: String,
    config_snapshot: Option<serde_json::Value>,
}

#[derive(serde::Deserialize)]
#[serde(untagged)]
enum StoredIndex {
    SnapshotList(Vec<StoredSnapshot>),
    SnapshotIds { ids: Vec<String> },
}

fn default_unknown() -> String {
    "unknown".to_string()
}

fn default_manual() -> String {
    "manual".to_string()
}

fn is_valid_snapshot_id(snapshot_id: &str) -> bool {
    snapshot_id.starts_with("snap_")
        && snapshot_id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-')
}

fn snapshot_file_for_id(storage_dir: &Path, snapshot_id: &str) -> Result<PathBuf, String> {
    if !is_valid_snapshot_id(snapshot_id) {
        return Err("Invalid snapshot id".to_string());
    }

    Ok(storage_dir.join(format!("{snapshot_id}.json")))
}

fn snapshot_meta_from_stored(snapshot: StoredSnapshot) -> SnapshotMeta {
    SnapshotMeta {
        id: snapshot.id,
        timestamp: snapshot.timestamp,
        openclaw_version: snapshot.openclaw_version,
        trigger: snapshot.trigger,
        diff_summary: snapshot.diff_summary,
        config_hash: snapshot.config_hash,
    }
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
    let mut snapshots = match serde_json::from_str::<StoredIndex>(&content) {
        Ok(StoredIndex::SnapshotList(entries)) => entries
            .into_iter()
            .map(snapshot_meta_from_stored)
            .collect(),
        Ok(StoredIndex::SnapshotIds { ids }) => ids
            .into_iter()
            .filter_map(|snapshot_id| {
                let snapshot_path = snapshot_file_for_id(&dir, &snapshot_id).ok()?;
                let snapshot_content = fs::read_to_string(snapshot_path).ok()?;
                let stored = serde_json::from_str::<StoredSnapshot>(&snapshot_content).ok()?;
                Some(snapshot_meta_from_stored(stored))
            })
            .collect(),
        Err(_) => vec![],
    };

    snapshots.sort_by(|left, right| right.timestamp.cmp(&left.timestamp));
    snapshots
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
        .and_then(|v| {
            v["version"]
                .as_str()
                .or_else(|| v["meta"]["lastTouchedVersion"].as_str())
                .map(|s| s.to_string())
        })
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
    let snap_file = snapshot_file_for_id(&dir, &snapshot_id)?;
    if !snap_file.exists() {
        return Err(format!("Snapshot not found: {snapshot_id}"));
    }

    let content = fs::read_to_string(&snap_file).map_err(|e| e.to_string())?;
    let snap: StoredSnapshot = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let config_snapshot = snap
        .config_snapshot
        .ok_or_else(|| format!("Snapshot missing configSnapshot: {snapshot_id}"))?;
    let restored = if let Some(raw) = config_snapshot.as_str() {
        raw.to_string()
    } else {
        let mut pretty = serde_json::to_string_pretty(&config_snapshot).map_err(|e| e.to_string())?;
        pretty.push('\n');
        pretty
    };

    let config_path = get_config_path();

    // Backup current before restore
    let bak = format!("{config_path}.bak");
    if Path::new(&config_path).exists() {
        let _ = fs::copy(&config_path, &bak);
    }

    fs::write(&config_path, restored).map_err(|e| e.to_string())?;

    Ok(format!("Restored from {snapshot_id}"))
}

fn get_gemini_api_key() -> Option<String> {
    // 1. Check environment variable first
    if let Ok(key) = std::env::var("GEMINI_API_KEY") {
        if !key.is_empty() {
            return Some(key);
        }
    }
    // 2. Read from openclaw config env.GEMINI_API_KEY
    let config_path = get_config_path();
    let content = fs::read_to_string(&config_path).ok()?;
    let v: serde_json::Value = serde_json::from_str(&content).ok()?;
    v["env"]["GEMINI_API_KEY"].as_str().map(|s| s.to_string())
}

#[tauri::command]
fn llm_fix() -> Result<String, String> {
    let path = get_config_path();
    let content =
        fs::read_to_string(&path).map_err(|e| format!("Cannot read config: {e}"))?;

    // Local JSON validation first
    let parse_result = serde_json::from_str::<serde_json::Value>(&content);

    // Get API key
    let api_key = get_gemini_api_key()
        .ok_or_else(|| "No Gemini API key found. Set GEMINI_API_KEY env var or add env.GEMINI_API_KEY in openclaw config.".to_string())?;

    // Build prompt
    let is_valid_json = parse_result.is_ok();
    let prompt = if is_valid_json {
        format!(
            "You are an OpenClaw config validator. Analyze this openclaw.json config for issues, misconfigurations, or security concerns. Be concise (max 3 bullet points). Config:\n\n```json\n{}\n```",
            &content[..content.len().min(3000)]
        )
    } else {
        let err = parse_result.unwrap_err();
        format!(
            "This openclaw.json config has a JSON syntax error: {}. Here is the broken content:\n\n{}\n\nExplain what's wrong and how to fix it in 2-3 sentences.",
            err,
            &content[..content.len().min(1000)]
        )
    };

    // Call Gemini API (gemini-2.0-flash)
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key={}",
        api_key
    );

    let body = serde_json::json!({
        "contents": [{
            "parts": [{ "text": prompt }]
        }],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 512
        }
    });

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .map_err(|e| format!("Gemini API error: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().unwrap_or_default();
        return Err(format!("Gemini API returned {status}: {text}"));
    }

    let json: serde_json::Value = resp
        .json()
        .map_err(|e| format!("Failed to parse Gemini response: {e}"))?;

    let text = json["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or("No response from Gemini")
        .to_string();

    Ok(text)
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
    open::that("http://127.0.0.1:18789/").map_err(|e| e.to_string())
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
