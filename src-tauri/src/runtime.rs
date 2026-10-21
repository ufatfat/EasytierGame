//! Shared collection and bounded log streams. WebViews never launch their own CLI pollers.
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet, VecDeque},
    sync::{Mutex, OnceLock},
    time::Duration,
};
use tauri::{Emitter, Manager};
use tokio::sync::Notify;

const MAX_LINES: usize = 5000;
const MAX_BYTES: usize = 2_000_000;
const MAX_LINE_BYTES: usize = 16_384;
#[derive(Clone, Debug, Serialize, PartialEq, Default)]
pub struct RuntimeSnapshot {
    pub revision: u64,
    pub client_running: bool,
    pub server_running: bool,
    pub connected: bool,
    pub members: Vec<Value>,
    pub connections: Vec<Value>,
    pub proxies: Vec<Value>,
    pub routes: Vec<Value>,
}
#[derive(Clone, Debug, Serialize)]
pub struct LogLine {
    pub id: u64,
    pub text: String,
}
#[derive(Clone, Debug, Serialize)]
pub struct LogPacket {
    pub stream: String,
    pub generation: u64,
    pub lines: Vec<LogLine>,
}
#[derive(Default)]
struct LogRing {
    generation: u64,
    next: u64,
    bytes: usize,
    lines: VecDeque<LogLine>,
    sent: u64,
    dirty: bool,
}
impl LogRing {
    fn reset(&mut self) {
        self.generation += 1;
        self.next = 0;
        self.bytes = 0;
        self.lines.clear();
        self.sent = 0;
        self.dirty = true;
    }
    fn push(&mut self, mut text: String) {
        if text.len() > MAX_LINE_BYTES {
            let mut end = MAX_LINE_BYTES;
            while !text.is_char_boundary(end) {
                end -= 1;
            }
            text.truncate(end);
            text.push_str(" …");
        }
        self.next += 1;
        self.bytes += text.len();
        self.lines.push_back(LogLine {
            id: self.next,
            text,
        });
        self.dirty = true;
        while self.lines.len() > MAX_LINES || self.bytes > MAX_BYTES {
            if let Some(line) = self.lines.pop_front() {
                self.bytes -= line.text.len();
            }
        }
    }
    fn packet(&self, stream: &str, after: u64) -> LogPacket {
        LogPacket {
            stream: stream.into(),
            generation: self.generation,
            lines: self
                .lines
                .iter()
                .filter(|line| line.id > after)
                .cloned()
                .collect(),
        }
    }
}
#[derive(Default)]
struct Shared {
    epoch: u64,
    snapshot: RuntimeSnapshot,
    subscriptions: HashMap<String, HashSet<String>>,
    client: LogRing,
    server: LogRing,
}
static SHARED: OnceLock<Mutex<Shared>> = OnceLock::new();
static WAKE: Notify = Notify::const_new();
fn shared() -> &'static Mutex<Shared> {
    SHARED.get_or_init(Mutex::default)
}
pub fn wake() {
    WAKE.notify_one();
}
pub fn remove_window(label: &str) {
    shared().lock().unwrap().subscriptions.remove(label);
    wake();
}
pub fn reset_logs(server: bool) {
    let mut state = shared().lock().unwrap();
    if server {
        state.server.reset()
    } else {
        state.client.reset();
        state.epoch += 1;
        state.snapshot.members.clear();
        state.snapshot.connections.clear();
        state.snapshot.proxies.clear();
        state.snapshot.routes.clear();
        state.snapshot.connected = false;
        state.snapshot.revision += 1;
    }
    drop(state);
    wake();
}
pub fn push_log(server: bool, text: String) {
    let mut state = shared().lock().unwrap();
    if server {
        state.server.push(text)
    } else {
        state.client.push(text)
    }
}
pub fn snapshot() -> RuntimeSnapshot {
    let client_running = crate::platform::is_client_running();
    let server_running = crate::platform::is_server_running();
    let state = shared().lock().unwrap();
    let mut result = state.snapshot.clone();
    result.client_running = client_running;
    result.server_running = server_running;
    if !client_running {
        result.members.clear();
        result.connections.clear();
        result.proxies.clear();
        result.routes.clear();
        result.connected = false;
    }
    if result != state.snapshot {
        result.revision += 1;
    }
    result
}
#[tauri::command]
pub fn get_runtime_snapshot(refresh: Option<bool>) -> RuntimeSnapshot {
    if refresh.unwrap_or(false) {
        wake();
    }
    snapshot()
}
#[tauri::command]
pub fn get_log_snapshot(stream: String) -> Result<LogPacket, String> {
    let state = shared().lock().unwrap();
    match stream.as_str() {
        "client" => Ok(state.client.packet("client", 0)),
        "server" => Ok(state.server.packet("server", 0)),
        _ => Err("无效的日志流".into()),
    }
}
#[tauri::command]
pub fn set_runtime_subscription(
    window: tauri::WebviewWindow,
    topic: String,
    enabled: bool,
) -> Result<(), String> {
    if !["network", "members", "routes", "log-client", "log-server"].contains(&topic.as_str()) {
        return Err("无效的运行数据订阅".into());
    }
    let mut state = shared().lock().unwrap();
    let topics = state
        .subscriptions
        .entry(window.label().into())
        .or_default();
    let changed = if enabled {
        topics.insert(topic)
    } else {
        topics.remove(&topic)
    };
    drop(state);
    if changed {
        wake();
    }
    Ok(())
}
fn parse_array(text: String) -> Vec<Value> {
    serde_json::from_str(&text).unwrap_or_default()
}
async fn bounded_cli(future: impl std::future::Future<Output = String>) -> Vec<Value> {
    tokio::time::timeout(Duration::from_secs(3), future)
        .await
        .map(parse_array)
        .unwrap_or_default()
}
fn labels_for(state: &Shared, topics: &[&str]) -> Vec<String> {
    state
        .subscriptions
        .iter()
        .filter(|(_, set)| topics.iter().any(|topic| set.contains(*topic)))
        .map(|(label, _)| label.clone())
        .collect()
}
// Native visibility also covers tray-hidden windows whose WebView may not emit visibilitychange.
fn visible_subscriptions(app: &tauri::AppHandle) -> HashMap<String, HashSet<String>> {
    let subscriptions = shared().lock().unwrap().subscriptions.clone();
    subscriptions
        .into_iter()
        .filter(|(label, _)| {
            app.get_webview_window(label)
                .is_some_and(|window| window.is_visible().unwrap_or(false))
        })
        .collect()
}
fn connected(members: &[Value]) -> bool {
    members.iter().any(|m| {
        m["cost"] == "Local"
            && m["ipv4"].as_str().is_some_and(|ip| {
                ip.split('/')
                    .next()
                    .unwrap_or("")
                    .parse::<std::net::Ipv4Addr>()
                    .is_ok()
            })
    })
}
fn interval(has_visible_subscriber: bool) -> Duration {
    Duration::from_secs(if has_visible_subscriber { 2 } else { 5 })
}

pub fn start(app: tauri::AppHandle) {
    let collector_app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            let subscriptions = visible_subscriptions(&collector_app);
            let has = |topic: &str| subscriptions.values().any(|set| set.contains(topic));
            let (members_needed, routes_needed, visible) = (
                has("members"),
                has("routes"),
                has("network") || has("members") || has("routes"),
            );
            let epoch = shared().lock().unwrap().epoch;
            let client_running = crate::platform::is_client_running();
            let server_running = crate::platform::is_server_running();
            let (members, connections, proxies, routes) = if client_running {
                // The same peer query serves the main window, lobby, and member panel. No overlapping rounds.
                tokio::join!(
                    bounded_cli(crate::get_members_by_cli()),
                    async {
                        if members_needed {
                            bounded_cli(crate::get_members_connections_cli()).await
                        } else {
                            vec![]
                        }
                    },
                    async {
                        if members_needed {
                            bounded_cli(crate::get_members_proxy()).await
                        } else {
                            vec![]
                        }
                    },
                    async {
                        if routes_needed {
                            bounded_cli(crate::get_route_by_cli()).await
                        } else {
                            vec![]
                        }
                    }
                )
            } else {
                (vec![], vec![], vec![], vec![])
            };
            if epoch != shared().lock().unwrap().epoch
                || client_running != crate::platform::is_client_running()
                || server_running != crate::platform::is_server_running()
            {
                continue;
            }
            let mut next = RuntimeSnapshot {
                revision: 0,
                client_running,
                server_running,
                connected: client_running && connected(&members),
                members,
                connections,
                proxies,
                routes,
            };
            let labels = {
                let mut state = shared().lock().unwrap();
                next.revision = state.snapshot.revision;
                if state.snapshot != next {
                    next.revision += 1;
                    state.snapshot = next.clone();
                    labels_for(&state, &["network", "members", "routes"])
                } else {
                    vec![]
                }
            };
            for label in labels {
                if subscriptions.contains_key(&label) {
                    let _ = collector_app.emit_to(&label, "runtime-snapshot", &next);
                }
            }
            tokio::select! {_=tokio::time::sleep(interval(visible))=>{},_=WAKE.notified()=>{}}
        }
    });
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_millis(100)).await;
            let packets = {
                let mut state = shared().lock().unwrap();
                let mut packets = vec![];
                for server in [false, true] {
                    let stream = if server { "server" } else { "client" };
                    let labels =
                        labels_for(&state, &[if server { "log-server" } else { "log-client" }])
                            .into_iter()
                            .collect::<Vec<_>>();
                    let ring = if server {
                        &mut state.server
                    } else {
                        &mut state.client
                    };
                    if ring.dirty {
                        let packet = if labels.is_empty() {
                            None
                        } else {
                            Some(ring.packet(stream, ring.sent))
                        };
                        ring.sent = ring.next;
                        ring.dirty = false;
                        if let Some(packet) = packet {
                            packets.push((labels, packet));
                        }
                    }
                }
                packets
            };
            for (labels, packet) in packets {
                for label in labels {
                    if app
                        .get_webview_window(&label)
                        .is_some_and(|window| window.is_visible().unwrap_or(false))
                    {
                        let _ = app.emit_to(&label, "runtime-log-batch", &packet);
                    }
                }
            }
        }
    });
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounded_logs_have_ordered_ids_and_reset_generations() {
        let mut ring = LogRing::default();
        ring.reset();
        for i in 0..6000 {
            ring.push(format!("line {i}"));
        }
        assert_eq!(ring.lines.len(), 5000);
        let packet = ring.packet("client", 5998);
        assert_eq!(packet.lines.len(), 2);
        assert_eq!(packet.lines[0].id, 5999);
        ring.reset();
        assert_eq!(ring.generation, 2);
        assert!(ring.lines.is_empty());
        ring.push("next".into());
        assert_eq!(ring.lines[0].id, 1);
    }
    #[test]
    fn byte_limits_and_unicode_are_preserved() {
        let mut ring = LogRing::default();
        for _ in 0..300 {
            ring.push("测试🙂".repeat(5000));
        }
        assert!(ring.bytes <= MAX_BYTES);
        assert!(ring
            .lines
            .iter()
            .all(|line| line.text.len() <= MAX_LINE_BYTES + 4));
    }
    #[test]
    fn topics_gate_details_and_hidden_windows_reduce_poll_rate() {
        let mut state = Shared::default();
        state
            .subscriptions
            .insert("main".into(), HashSet::from(["network".into()]));
        state
            .subscriptions
            .insert("member".into(), HashSet::from(["members".into()]));
        assert_eq!(labels_for(&state, &["members"]), vec!["member"]);
        assert_eq!(interval(true).as_secs(), 2);
        assert_eq!(interval(false).as_secs(), 5);
        assert!(!connected(&[]));
    }
}
