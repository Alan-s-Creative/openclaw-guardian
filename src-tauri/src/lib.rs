use std::env;
use std::fs;
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::time::Duration;

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
    pub guardian_version: String,
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

// ── Health Check ─────────────────────────────────────────

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PluginPathStatus {
    name: String,
    enabled: bool,
    exists: Option<bool>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthReport {
    gateway_reachable: bool,
    port_listening: bool,
    plugin_paths_ok: Vec<PluginPathStatus>,
    launch_agent_loaded: bool,
    recent_errors: Vec<String>,
    checked_at: String,
}

#[tauri::command]
async fn health_check() -> Result<HealthReport, String> {
    tokio::task::spawn_blocking(health_check_sync)
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

fn health_check_sync() -> Result<HealthReport, String> {
    // 1. Port 18789 listening
    let port_listening = TcpStream::connect_timeout(
        &"127.0.0.1:18789".parse().unwrap(),
        Duration::from_secs(2),
    )
    .is_ok();

    // 2. Gateway HTTP reachable — if port is listening, gateway is reachable
    // (reqwest blocking may conflict with Tauri async runtime, so we trust TcpStream)
    let gateway_reachable = if port_listening {
        // try a quick HTTP check via std; fallback to port_listening result
        use std::io::{Read, Write};
        let mut stream = TcpStream::connect_timeout(
            &"127.0.0.1:18789".parse().unwrap(),
            Duration::from_secs(2)
        );
        if let Ok(ref mut s) = stream {
            let _ = s.write_all(b"GET / HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n");
            let mut buf = [0u8; 16];
            let _ = s.read(&mut buf);
            // any response means gateway is up
            String::from_utf8_lossy(&buf).starts_with("HTTP")
        } else {
            true // port is listening, assume reachable
        }
    } else {
        false
    };

    // 3. Plugin paths
    let config_path = get_config_path();
    let plugin_paths_ok = if let Ok(content) = fs::read_to_string(&config_path) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
            let entries = v["plugins"]["entries"]
                .as_object()
                .cloned()
                .unwrap_or_default();
            entries
                .iter()
                .map(|(name, val)| {
                    let enabled = val["enabled"].as_bool().unwrap_or(true);
                    let exists = val["path"].as_str().map(|p| {
                        let expanded = if p.starts_with("~/") {
                            let home = env::var("HOME").unwrap_or_default();
                            format!("{}{}", home, &p[1..])
                        } else {
                            p.to_string()
                        };
                        Path::new(&expanded).exists()
                    });
                    PluginPathStatus {
                        name: name.clone(),
                        enabled,
                        exists,
                    }
                })
                .collect()
        } else {
            vec![]
        }
    } else {
        vec![]
    };

    // 4. LaunchAgent
    let launch_agent_loaded = std::process::Command::new("launchctl")
        .args(["list"])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).contains("openclaw"))
        .unwrap_or(false);

    // 5. Recent errors
    let log_path = dirs::home_dir()
        .unwrap_or_default()
        .join(".openclaw/logs/gateway.err.log");
    let recent_errors: Vec<String> = if let Ok(content) = fs::read_to_string(&log_path) {
        content
            .lines()
            .filter(|l| !l.trim().is_empty())
            .rev()
            .take(5)
            .map(|l| l.to_string())
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect()
    } else {
        vec![]
    };

    let checked_at = chrono::Local::now().format("%H:%M:%S").to_string();

    Ok(HealthReport {
        gateway_reachable,
        port_listening,
        plugin_paths_ok,
        launch_agent_loaded,
        recent_errors,
        checked_at,
    })
}

// ── Version Manager ──────────────────────────────────────

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct VersionItem {
    version: String,
    is_current: bool,
    is_latest: bool,
    published_at: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct VersionList {
    versions: Vec<VersionItem>,
    current: String,
    latest: String,
}

#[tauri::command]
async fn list_versions() -> Result<VersionList, String> {
    let config_path = get_config_path();
    let current = if let Ok(content) = fs::read_to_string(&config_path) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
            v["meta"]["lastTouchedVersion"]
                .as_str()
                .or_else(|| v["version"].as_str())
                .unwrap_or("unknown")
                .to_string()
        } else {
            "unknown".to_string()
        }
    } else {
        "unknown".to_string()
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get("https://registry.npmjs.org/openclaw")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("npm registry error: {e}"))?;

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {e}"))?;

    let latest = json["dist-tags"]["latest"]
        .as_str()
        .unwrap_or("unknown")
        .to_string();

    let versions: Vec<VersionItem> = json["versions"]
        .as_object()
        .map(|m| {
            let mut vers: Vec<String> = m.keys().cloned().collect();
            vers.sort_by(|a, b| {
                let parse = |s: &str| -> Vec<u64> {
                    s.split('.').filter_map(|x| x.parse().ok()).collect()
                };
                parse(b).cmp(&parse(a))
            });
            vers.into_iter()
                .take(25)
                .map(|v| {
                    let published_at = json["time"][&v]
                        .as_str()
                        .map(|s| s[..s.len().min(10)].to_string());
                    VersionItem {
                        is_current: v == current,
                        is_latest: v == latest,
                        version: v,
                        published_at,
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(VersionList {
        versions,
        current,
        latest,
    })
}

#[tauri::command]
async fn install_version(version: String) -> Result<String, String> {
    // 1. Snapshot before switching
    let config_path = get_config_path();
    let storage_dir = get_storage_dir();

    let content =
        fs::read_to_string(&config_path).map_err(|e| format!("Cannot read config: {e}"))?;
    let config: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Invalid config JSON: {e}"))?;
    let current_version = config["meta"]["lastTouchedVersion"]
        .as_str()
        .unwrap_or("unknown")
        .to_string();

    let snapshot_id = format!(
        "snap_{}_pre_switch",
        chrono::Local::now().timestamp_millis()
    );
    let snapshot_path = storage_dir.join(format!("{snapshot_id}.json"));

    // Read plugin list from config
    let plugins: serde_json::Value = config
        .get("plugins")
        .cloned()
        .unwrap_or(serde_json::json!([]));

    // Get npm openclaw version
    let npm_version = tokio::process::Command::new("npm")
        .args(["list", "-g", "openclaw", "--json", "--depth=0"])
        .output()
        .await
        .ok()
        .and_then(|o| serde_json::from_slice::<serde_json::Value>(&o.stdout).ok())
        .and_then(|v| {
            v["dependencies"]["openclaw"]["version"]
                .as_str()
                .map(String::from)
        })
        .unwrap_or_else(|| current_version.clone());

    let snapshot = serde_json::json!({
        "id": snapshot_id,
        "timestamp": chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
        "config_snapshot": config,
        "trigger": format!("pre-version-switch-to-{version}"),
        "openclawVersion": current_version,
        "targetVersion": version,
        "previousNpmVersion": npm_version,
        "plugins": plugins,
        "nodeVersion": std::process::Command::new("node")
            .arg("--version")
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default(),
        "platform": std::env::consts::OS,
    });

    fs::create_dir_all(&storage_dir).ok();
    fs::write(
        &snapshot_path,
        serde_json::to_string_pretty(&snapshot).unwrap(),
    )
    .map_err(|e| format!("Snapshot failed: {e}"))?;

    // Update index.json
    let index_path = storage_dir.join("index.json");
    let mut ids: Vec<String> = if let Ok(data) = fs::read_to_string(&index_path) {
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        vec![]
    };
    ids.insert(0, snapshot_id.clone());
    ids.truncate(20);
    fs::write(&index_path, serde_json::to_string(&ids).unwrap()).ok();

    // 2. npm install -g openclaw@{version}
    let output = tokio::process::Command::new("npm")
        .args(["install", "-g", &format!("openclaw@{version}")])
        .output()
        .await
        .map_err(|e| format!("npm install failed: {e}"))?;

    if output.status.success() {
        Ok(format!(
            "Switched to openclaw@{version}\nPre-switch snapshot: {snapshot_id}"
        ))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("npm install failed:\n{stderr}"))
    }
}

// ── Release Notes ────────────────────────────────────────

#[tauri::command]
async fn get_release_notes(version: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("openclaw-guardian/0.1")
        .build()
        .map_err(|e| e.to_string())?;

    // Try exact tag first, then with/without 'v' prefix
    let tags = vec![
        format!("v{}", version),
        version.clone(),
    ];

    for tag in &tags {
        let url = format!(
            "https://api.github.com/repos/nicholasgasior/openclaw/releases/tags/{}",
            tag
        );
        let resp = client
            .get(&url)
            .header("Accept", "application/vnd.github.v3+json")
            .send()
            .await;

        if let Ok(r) = resp {
            if r.status().is_success() {
                let json: serde_json::Value = r.json().await.map_err(|e| e.to_string())?;
                let body = json["body"].as_str().unwrap_or("").trim().to_string();
                let name = json["name"].as_str().unwrap_or(&version).to_string();
                let published = json["published_at"]
                    .as_str()
                    .and_then(|s| s.get(..10))
                    .unwrap_or("")
                    .to_string();

                if body.is_empty() {
                    return Ok(format!(
                        "**{}** ({})\n\nNo release notes available.",
                        name, published
                    ));
                }
                return Ok(format!("**{}** ({})\n\n{}", name, published, body));
            }
        }
    }

    // Fallback: list releases and find matching
    let list_url =
        "https://api.github.com/repos/nicholasgasior/openclaw/releases?per_page=50";
    let resp = client
        .get(list_url)
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
        .map_err(|e| format!("GitHub API error: {e}"))?;

    let releases: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    if let Some(arr) = releases.as_array() {
        for release in arr {
            let tag = release["tag_name"].as_str().unwrap_or("");
            let clean_tag = tag.trim_start_matches('v');
            if clean_tag == version || tag == version {
                let body = release["body"].as_str().unwrap_or("").trim().to_string();
                let name = release["name"].as_str().unwrap_or(&version).to_string();
                let published = release["published_at"]
                    .as_str()
                    .and_then(|s| s.get(..10))
                    .unwrap_or("")
                    .to_string();

                return Ok(format!(
                    "**{}** ({})\n\n{}",
                    name,
                    published,
                    if body.is_empty() {
                        "No release notes available.".to_string()
                    } else {
                        body
                    }
                ));
            }
        }
    }

    Ok(format!("No release notes found for version {}.", version))
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
        guardian_version: env!("CARGO_PKG_VERSION").to_string(),
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
async fn llm_fix() -> Result<String, String> {
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
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={}",
        api_key
    );

    let body = serde_json::json!({
        "contents": [{
            "parts": [{ "text": prompt }]
        }],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 4096
        }
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Gemini API error: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Gemini API returned {status}: {text}"));
    }

    let json: serde_json::Value = resp
        .json()
        .await
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

// ── Rollback ──────────────────────────────────────────────

#[tauri::command]
async fn rollback_version(snapshot_id: String) -> Result<String, String> {
    let config_path = get_config_path();
    let storage_dir = get_storage_dir();

    // 1. Read snapshot
    let snapshot_path = snapshot_file_for_id(&storage_dir, &snapshot_id)?;
    let content = fs::read_to_string(&snapshot_path)
        .map_err(|e| format!("Snapshot not found: {e}"))?;
    let snapshot: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid snapshot: {e}"))?;

    // 2. Restore openclaw.json
    let config = snapshot
        .get("config_snapshot")
        .ok_or("Snapshot missing config")?;

    // Backup current config
    let bak = format!("{config_path}.bak");
    if Path::new(&config_path).exists() {
        let _ = fs::copy(&config_path, &bak);
    }

    fs::write(&config_path, serde_json::to_string_pretty(config).unwrap())
        .map_err(|e| format!("Cannot restore config: {e}"))?;

    // 3. Determine previous version to rollback to
    let prev_version = snapshot["previousNpmVersion"]
        .as_str()
        .or_else(|| snapshot["openclawVersion"].as_str())
        .unwrap_or("latest");

    let mut steps: Vec<String> = vec![
        format!("Config restored from snapshot `{}`", snapshot_id),
    ];

    // 4. npm install -g openclaw@{prevVersion}
    if prev_version != "unknown" && prev_version != "latest" {
        let output = tokio::process::Command::new("npm")
            .args(["install", "-g", &format!("openclaw@{}", prev_version)])
            .output()
            .await
            .map_err(|e| format!("npm install failed: {e}"))?;

        if output.status.success() {
            steps.push(format!("Reinstalled openclaw@{}", prev_version));
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            steps.push(format!(
                "npm install openclaw@{} failed:\n{}",
                prev_version,
                &stderr[..stderr.len().min(200)]
            ));
        }
    } else {
        steps.push("Previous version unknown, skipped npm reinstall".to_string());
    }

    // 5. Suggest restart
    steps.push("Please restart the OpenClaw gateway: `openclaw gateway restart`".to_string());

    Ok(steps.join("\n"))
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
            rollback_version,
            llm_fix,
            open_settings,
            open_dashboard,
            health_check,
            list_versions,
            install_version,
            get_release_notes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
