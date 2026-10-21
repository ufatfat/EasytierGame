use std::{
    collections::HashMap,
    fs,
    io::{BufRead, BufReader, Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
    thread,
    time::Duration,
};
use tauri::{Emitter, Manager};

static STARTING: AtomicBool = AtomicBool::new(false);
struct StartingGuard;
impl Drop for StartingGuard {
    fn drop(&mut self) {
        STARTING.store(false, Ordering::SeqCst);
    }
}

static DATA_DIR: OnceLock<PathBuf> = OnceLock::new();
struct RunningCore {
    server: bool,
    elevated: bool,
    cancelled: Arc<AtomicBool>,
}
static CORES: OnceLock<Mutex<HashMap<u32, RunningCore>>> = OnceLock::new();
fn cores() -> &'static Mutex<HashMap<u32, RunningCore>> {
    CORES.get_or_init(Mutex::default)
}

pub trait CommandVisibility {
    fn hide_console(&mut self) -> &mut Self;
}
impl CommandVisibility for Command {
    fn hide_console(&mut self) -> &mut Self {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            self.creation_flags(0x08000000);
        }
        self
    }
}
pub trait TokioCommandVisibility {
    fn hide_console(&mut self) -> &mut Self;
}
impl TokioCommandVisibility for tokio::process::Command {
    fn hide_console(&mut self) -> &mut Self {
        #[cfg(windows)]
        self.creation_flags(0x08000000);
        self
    }
}

pub fn initialize(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let resources = app.path().resource_dir()?;
    let data = if cfg!(windows) {
        resources.clone()
    } else {
        app.path().app_data_dir()?
    };
    if !cfg!(windows) {
        copy_missing(&resources.join("easytier"), &data.join("easytier"))?;
    }
    fs::create_dir_all(data.join("easytier/logs"))?;
    let _ = DATA_DIR.set(data);
    Ok(())
}
fn copy_missing(from: &Path, to: &Path) -> std::io::Result<()> {
    fs::create_dir_all(to)?;
    if !from.exists() {
        return Ok(());
    }
    for item in fs::read_dir(from)? {
        let item = item?;
        let destination = to.join(item.file_name());
        if item.file_type()?.is_dir() {
            copy_missing(&item.path(), &destination)?;
        } else if !destination.exists() {
            fs::copy(item.path(), &destination)?;
            make_executable(&destination);
        }
    }
    Ok(())
}
pub fn tool_path(relative: &str) -> PathBuf {
    let relative = relative.replace('\\', "/");
    let mut relative = relative.trim_start_matches('/').to_owned();
    if !cfg!(windows) {
        relative = relative
            .strip_suffix(".exe")
            .unwrap_or(&relative)
            .to_owned();
    }
    DATA_DIR
        .get()
        .cloned()
        .unwrap_or_else(|| {
            std::env::current_exe()
                .unwrap()
                .parent()
                .unwrap()
                .to_path_buf()
        })
        .join(relative)
}
pub fn make_executable(path: &Path) {
    #[cfg(unix)]
    if matches!(
        path.file_name().and_then(|s| s.to_str()),
        Some("easytier-core" | "easytier-cli")
    ) {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o755));
    }
    #[cfg(not(unix))]
    let _ = path;
}
pub fn release_target() -> &'static str {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => "macos-aarch64",
        ("macos", _) => "macos-x86_64",
        ("windows", "aarch64") => "windows-aarch64",
        _ => "windows-x86_64",
    }
}
#[tauri::command]
pub fn get_platform() -> &'static str {
    std::env::consts::OS
}
#[tauri::command]
pub fn is_core_running() -> bool {
    STARTING.load(Ordering::SeqCst) || !cores().lock().unwrap().is_empty()
}

pub fn is_client_running() -> bool {
    cores().lock().unwrap().values().any(|core| !core.server)
}
pub fn is_server_running() -> bool {
    cores().lock().unwrap().values().any(|core| core.server)
}
fn publish_output(app: &tauri::AppHandle, server: bool, line: String) {
    if !server && line.contains("tun device ready") {
        let _ = app.emit("command-output", &line);
    }
    crate::runtime::push_log(server, line);
}
fn event(server: bool, name: &str) -> String {
    if server {
        format!("server-{name}")
    } else {
        name.to_string()
    }
}
fn finished(app: &tauri::AppHandle, pid: u32, server: bool, error: Option<String>) {
    let core = cores().lock().unwrap().remove(&pid);
    let error = if core
        .as_ref()
        .is_none_or(|c| c.cancelled.load(Ordering::SeqCst))
    {
        None
    } else {
        error
    };
    crate::runtime::wake();
    let _ = app.emit(
        &event(server, "command-exit"),
        serde_json::json!({"pid": pid, "error": error.unwrap_or_default()}),
    );
}

pub fn start_core(app: tauri::AppHandle, args: Vec<String>, server: bool) -> Result<(), String> {
    if STARTING.swap(true, Ordering::SeqCst) {
        return Err("内核正在启动，请稍候".into());
    }
    let _starting = StartingGuard;
    let core = tool_path("easytier/easytier-core.exe");
    if !core.is_file() {
        return Err("未找到当前平台的 EasyTier 内核，请先安装或下载内核".into());
    }
    crate::runtime::reset_logs(server);
    #[cfg(target_os = "macos")]
    if !server && !args.iter().any(|arg| arg == "--no-tun") {
        return start_elevated(app, core, args, server);
    }
    let mut child = Command::new(core)
        .args(args)
        .current_dir(tool_path(""))
        .hide_console()
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("启动内核失败: {e}"))?;
    let pid = child.id();
    let cancelled = Arc::new(AtomicBool::new(false));
    cores().lock().unwrap().insert(
        pid,
        RunningCore {
            server,
            elevated: false,
            cancelled: cancelled.clone(),
        },
    );
    crate::runtime::wake();
    let _ = app.emit(&event(server, "thread-id"), pid);
    for stream in [
        Box::new(child.stdout.take().unwrap()) as Box<dyn Read + Send>,
        Box::new(child.stderr.take().unwrap()) as Box<dyn Read + Send>,
    ] {
        let app = app.clone();
        thread::spawn(move || {
            for line in BufReader::new(stream).lines().map_while(Result::ok) {
                publish_output(&app, server, line);
            }
        });
    }
    thread::spawn(move || {
        let error = match child.wait() {
            Ok(status) if status.success() => None,
            Ok(status) => Some(format!("内核已退出 ({status})")),
            Err(e) => Some(e.to_string()),
        };
        finished(
            &app,
            pid,
            server,
            if cancelled.load(Ordering::SeqCst) {
                None
            } else {
                error
            },
        );
    });
    Ok(())
}

#[cfg(target_os = "macos")]
fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}
#[cfg(target_os = "macos")]
fn administrator(script: &str) -> Result<String, String> {
    // Encode AppleScript strings separately from POSIX shell arguments.
    let source = format!(
        "do shell script {} with administrator privileges",
        serde_json::to_string(script).unwrap()
    );
    let output = Command::new("/usr/bin/osascript")
        .args(["-e", &source])
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err("管理员授权被取消或执行失败".into());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_owned())
}
#[cfg(target_os = "macos")]
fn start_elevated(
    app: tauri::AppHandle,
    core: PathBuf,
    args: Vec<String>,
    server: bool,
) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let folder = std::env::temp_dir().join(format!("etgame-{:032x}", rand::random::<u128>()));
    fs::create_dir(&folder).map_err(|e| e.to_string())?;
    fs::set_permissions(&folder, fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())?;
    let log = folder.join("core.log");
    fs::File::create(&log).map_err(|e| e.to_string())?;
    let command = std::iter::once(core.to_string_lossy().into_owned())
        .chain(args)
        .map(|s| shell_quote(&s))
        .collect::<Vec<_>>()
        .join(" ");
    let script = format!(
        "cd {} || exit; {} > {} 2>&1 < /dev/null & echo $!",
        shell_quote(&tool_path("").to_string_lossy()),
        command,
        shell_quote(&log.to_string_lossy())
    );
    let output = match administrator(&script) {
        Ok(out) => out,
        Err(error) => {
            let _ = fs::remove_dir_all(folder);
            return Err(error);
        }
    };
    let pid = output.parse::<u32>().map_err(|_| "无法读取内核进程 ID")?;
    let cancelled = Arc::new(AtomicBool::new(false));
    cores().lock().unwrap().insert(
        pid,
        RunningCore {
            server,
            elevated: true,
            cancelled: cancelled.clone(),
        },
    );
    crate::runtime::wake();
    let _ = app.emit(&event(server, "thread-id"), pid);
    thread::spawn(move || {
        let mut offset = 0;
        let mut pending = String::new();
        loop {
            if let Ok(mut file) = fs::File::open(&log) {
                let _ = file.seek(SeekFrom::Start(offset));
                let mut bytes = Vec::new();
                if file.read_to_end(&mut bytes).is_ok() {
                    offset += bytes.len() as u64;
                    pending.push_str(&String::from_utf8_lossy(&bytes));
                    while let Some(end) = pending.find('\n') {
                        let line: String = pending.drain(..=end).collect();
                        publish_output(&app, server, line.trim_end().into());
                    }
                }
            }
            let alive = Command::new("/bin/ps")
                .args(["-p", &pid.to_string(), "-o", "stat="])
                .output()
                .is_ok_and(|o| {
                    o.status.success()
                        && !String::from_utf8_lossy(&o.stdout).trim().starts_with('Z')
                });
            if cancelled.load(Ordering::SeqCst) || !alive {
                break;
            }
            thread::sleep(Duration::from_millis(500));
        }
        let _ = fs::remove_dir_all(folder);
        finished(
            &app,
            pid,
            server,
            if cancelled.load(Ordering::SeqCst) {
                None
            } else {
                Some("内核已停止，请查看联机日志".into())
            },
        );
    });
    Ok(())
}

pub fn stop_all() {
    let pids = cores().lock().unwrap().keys().copied().collect::<Vec<_>>();
    for pid in pids {
        if let Err(error) = stop_core(pid) {
            log::error!("{error}");
        }
    }
    #[cfg(not(windows))]
    allow_sleep();
}

pub fn stop_core(pid: u32) -> Result<(), String> {
    if pid == 0 {
        return Ok(());
    }
    let (elevated, cancelled) = {
        let running = cores().lock().unwrap();
        let Some(core) = running.get(&pid) else {
            return Ok(());
        };
        (core.elevated, core.cancelled.clone())
    };
    #[cfg(not(target_os = "macos"))]
    let _ = elevated;
    #[cfg(target_os = "macos")]
    if elevated {
        administrator(&format!("/bin/kill -TERM {pid}"))?;
        wait_stopped(pid)?;
        cancelled.store(true, Ordering::SeqCst);
        cores().lock().unwrap().remove(&pid);
        return Ok(());
    }
    #[cfg(windows)]
    let output = Command::new("taskkill")
        .args(["/F", "/PID", &pid.to_string()])
        .hide_console()
        .output();
    #[cfg(not(windows))]
    let output = Command::new("/bin/kill")
        .args(["-TERM", &pid.to_string()])
        .output();
    let output = output.map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err("停止内核失败，请重试".into());
    }
    #[cfg(not(windows))]
    wait_stopped(pid)?;
    cancelled.store(true, Ordering::SeqCst);
    cores().lock().unwrap().remove(&pid);
    Ok(())
}

#[cfg(not(windows))]
fn wait_stopped(pid: u32) -> Result<(), String> {
    for _ in 0..60 {
        let alive = Command::new("/bin/ps")
            .args(["-p", &pid.to_string(), "-o", "stat="])
            .output()
            .is_ok_and(|o| {
                o.status.success() && !String::from_utf8_lossy(&o.stdout).trim().starts_with('Z')
            });
        if !alive {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(50));
    }
    Err("内核仍在退出，请稍后重试".into())
}

#[cfg(not(windows))]
#[tauri::command(rename_all = "snake_case")]
pub fn get_network_adapter_guids() -> Vec<[String; 2]> {
    Vec::new()
}
#[cfg(not(windows))]
#[tauri::command]
pub fn autostart_is_enabled() -> bool {
    false
}
#[cfg(not(windows))]
#[tauri::command]
pub fn spawn_autostart(_enabled: bool) -> Result<(), String> {
    Err("当前平台暂不支持开机自启".into())
}
static SLEEP_PID: OnceLock<Mutex<Option<std::process::Child>>> = OnceLock::new();
#[cfg(not(windows))]
#[tauri::command]
pub fn prevent_sleep() -> bool {
    let mut child = SLEEP_PID.get_or_init(Mutex::default).lock().unwrap();
    if child.is_none() {
        *child = Command::new("/usr/bin/caffeinate")
            .args(["-di", "-w", &std::process::id().to_string()])
            .spawn()
            .ok();
    }
    child.is_some()
}
#[cfg(not(windows))]
#[tauri::command]
pub fn allow_sleep() -> bool {
    if let Some(mut child) = SLEEP_PID.get_or_init(Mutex::default).lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unmanaged_processes_cannot_be_terminated() {
        assert!(stop_core(std::process::id()).is_ok());
    }
    #[test]
    fn paths_are_native_and_assets_match_platform() {
        let path = tool_path("\\easytier\\easytier-core.exe");
        assert_eq!(
            path.file_name().unwrap(),
            if cfg!(windows) {
                "easytier-core.exe"
            } else {
                "easytier-core"
            }
        );
        assert!(!path.to_string_lossy().contains('\\') || cfg!(windows));
        if cfg!(target_os = "macos") {
            assert!(release_target().starts_with("macos-"));
        }
    }
    #[cfg(target_os = "macos")]
    #[test]
    fn shell_arguments_cannot_inject_commands() {
        let arg = "room ' with $(touch /tmp/never); `id`";
        let output = Command::new("/bin/sh")
            .args(["-c", &format!("printf %s {}", shell_quote(arg))])
            .output()
            .unwrap();
        assert_eq!(String::from_utf8(output.stdout).unwrap(), arg);
    }
}
