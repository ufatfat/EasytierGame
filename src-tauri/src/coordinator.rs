use serde_json::Value;
use std::time::Duration;

#[derive(Debug, serde::Serialize)]
pub struct CoordinatorError {
    message: String,
    retryable: bool,
    replay_safe: bool,
}
impl From<&str> for CoordinatorError {
    fn from(message: &str) -> Self {
        Self {
            message: message.into(),
            retryable: false,
            replay_safe: false,
        }
    }
}
impl From<String> for CoordinatorError {
    fn from(message: String) -> Self {
        Self {
            message,
            retryable: false,
            replay_safe: false,
        }
    }
}
fn unavailable(message: &str, replay_safe: bool) -> CoordinatorError {
    CoordinatorError {
        message: message.into(),
        retryable: true,
        replay_safe,
    }
}

// Request paths and methods are deliberately bounded; no redirects may forward credentials.
#[tauri::command(rename_all = "snake_case")]
pub async fn coordinator_request(
    base_url: String,
    service_token: String,
    client_token: String,
    endpoint: String,
    method: String,
    body: Option<Value>,
) -> Result<Value, CoordinatorError> {
    let mut url = reqwest::Url::parse(&base_url).map_err(|_| "服务地址无效")?;
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if !(url.scheme() == "https" || (url.scheme() == "http" && local))
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("请使用 HTTPS 服务地址；本机调试可使用 HTTP".into());
    }
    let is_id = |id: &str| id.len() == 36 && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-');
    let room = endpoint.strip_prefix("/v1/rooms/");
    let allowed_room = matches!(
        (method.as_str(), endpoint.as_str()),
        ("GET" | "POST", "/v1/rooms")
    ) || (matches!(method.as_str(), "PATCH" | "DELETE")
        && room.is_some_and(is_id))
        || (method == "PUT"
            && room
                .and_then(|p| p.strip_suffix("/heartbeat"))
                .is_some_and(is_id))
        || (method == "GET"
            && room
                .and_then(|p| p.strip_suffix("/connection"))
                .is_some_and(is_id));
    let member = endpoint.strip_prefix("/v1/admin/members/");
    let allowed = matches!(
        (method.as_str(), endpoint.as_str()),
        ("GET", "/v1/state" | "/v1/state/mine")
            | ("PUT", "/v1/claim")
            | ("DELETE", "/v1/claim")
            | ("POST", "/v1/announcements")
            | ("GET" | "POST", "/v1/admin/members")
    ) || (method == "DELETE"
        && endpoint
            .strip_prefix("/v1/announcements/")
            .is_some_and(is_id))
        || (matches!(method.as_str(), "PATCH" | "DELETE") && member.is_some_and(is_id))
        || (method == "POST"
            && member
                .and_then(|rest| rest.strip_suffix("/key"))
                .is_some_and(is_id))
        || (method == "DELETE"
            && endpoint
                .strip_prefix("/v1/admin/claims/")
                .is_some_and(|ip| ip.parse::<std::net::Ipv4Addr>().is_ok()));
    if !allowed && !allowed_room {
        return Err("不支持的协调服务请求".into());
    }
    url.set_path(&format!("{}{}", url.path().trim_end_matches('/'), endpoint));
    url.set_query(None);
    url.set_fragment(None);
    if endpoint == "/v1/claim" && method != "GET" && crate::platform::is_core_running() {
        return Err("请停止联机和自建服务器后再修改 IP 登记".into());
    }
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;
    let mut request = client
        .request(method.parse().map_err(|_| "请求方法无效")?, url)
        .bearer_auth(service_token)
        .header("X-Client-Token", client_token);
    if let Some(body) = body {
        request = request.json(&body);
    }
    let mut response = request.send().await.map_err(|error| {
        if error.is_builder() {
            CoordinatorError::from("协调服务请求参数无效")
        } else {
            unavailable("无法连接协调服务，请检查地址和网络", error.is_connect())
        }
    })?;
    let status = response.status();
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| unavailable("读取协调服务响应失败", false))?
    {
        if bytes.len() + chunk.len() > 2_000_000 {
            return Err("协调服务响应过大".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    if !status.is_success() {
        let value: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
        let message = value["error"].as_str().unwrap_or("协调服务请求失败");
        if status.is_server_error() || status == reqwest::StatusCode::REQUEST_TIMEOUT {
            return Err(unavailable(message, false));
        }
        return Err(message.into());
    }
    let value: Value =
        serde_json::from_slice(&bytes).map_err(|_| unavailable("协调服务返回了无效数据", false))?;
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        thread,
    };
    fn request(base: &str, endpoint: &str, method: &str) -> Result<Value, String> {
        tauri::async_runtime::block_on(coordinator_request(
            base.into(),
            "service-test-token".into(),
            "a".repeat(64),
            endpoint.into(),
            method.into(),
            None,
        ))
        .map_err(|error| error.message)
    }
    #[test]
    fn rejects_remote_http_credentials_in_url_and_unknown_paths() {
        assert!(request("http://192.168.1.2", "/v1/state", "GET").is_err());
        assert!(request("https://user:password@example.com", "/v1/state", "GET").is_err());
        assert!(request("http://127.0.0.1:1", "/arbitrary", "GET").is_err());
        assert!(request("http://127.0.0.1:1", "/v1/state", "POST").is_err());
        assert!(request("http://127.0.0.1:1", "/v1/admin/members/x/key", "POST").is_err());
        assert!(request("http://127.0.0.1:1", "/v1/admin/claims/../state", "DELETE").is_err());
    }
    #[test]
    fn allows_supported_endpoints_through_to_the_network() {
        let id = "0f8fad5b-d9cb-469f-a165-70867728950e";
        for (endpoint, method) in [
            ("/v1/rooms".to_string(), "GET"),
            ("/v1/rooms".to_string(), "POST"),
            (format!("/v1/rooms/{id}"), "PATCH"),
            (format!("/v1/rooms/{id}"), "DELETE"),
            (format!("/v1/rooms/{id}/heartbeat"), "PUT"),
            (format!("/v1/rooms/{id}/connection"), "GET"),
            ("/v1/admin/members".to_string(), "GET"),
            ("/v1/admin/members".to_string(), "POST"),
            (format!("/v1/admin/members/{id}"), "PATCH"),
            (format!("/v1/admin/members/{id}"), "DELETE"),
            (format!("/v1/admin/members/{id}/key"), "POST"),
            ("/v1/admin/claims/10.126.126.8".to_string(), "DELETE"),
        ] {
            let error = request("http://127.0.0.1:1", &endpoint, method).unwrap_err();
            assert!(error.contains("无法连接"), "{endpoint} {method}: {error}");
        }
    }
    #[test]
    fn transport_errors_distinguish_safe_connection_failures_from_ambiguous_writes() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        drop(listener);
        let call = |base: String| {
            tauri::async_runtime::block_on(coordinator_request(
                base,
                "member-key".into(),
                "a".repeat(64),
                "/v1/announcements".into(),
                "POST".into(),
                Some(serde_json::json!({"title":"test"})),
            ))
        };
        let error = call(format!("http://{address}")).unwrap_err();
        assert!(error.retryable && error.replay_safe);
        for (status, body, retryable, partial) in [
            ("503 Service Unavailable", "{}", true, false),
            ("401 Unauthorized", "{\"error\":\"denied\"}", false, false),
            ("200 OK", "{", true, true),
        ] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let handle = thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                let mut buffer = [0; 4096];
                stream.read(&mut buffer).unwrap();
                let length = if partial { 100 } else { body.len() };
                write!(stream,"HTTP/1.1 {status}\r\nContent-Length: {length}\r\nConnection: close\r\n\r\n{body}").unwrap();
            });
            let error = call(format!("http://{address}")).unwrap_err();
            handle.join().unwrap();
            assert_eq!(error.retryable, retryable);
            assert!(!error.replay_safe);
        }
    }
    #[test]
    fn supports_loopback_http_and_does_not_follow_redirects() {
        for (status, body, success) in [
            ("200 OK", "{\"pool\":\"10.126.126.0/24\"}", true),
            (
                "302 Found\r\nLocation: http://127.0.0.1:1/leak",
                "{}",
                false,
            ),
        ] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let handle = thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                let mut bytes = [0; 4096];
                stream.read(&mut bytes).unwrap();
                write!(stream, "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).unwrap();
            });
            assert_eq!(
                request(&format!("http://{address}"), "/v1/state", "GET").is_ok(),
                success
            );
            handle.join().unwrap();
        }
    }
}

#[tauri::command]
pub async fn get_network_snapshot() -> Value {
    let state = crate::runtime::snapshot();
    serde_json::json!({"running":state.client_running,"connected":state.connected,"members":state.members})
}

#[tauri::command]
pub async fn probe_server(server: String) -> Option<u64> {
    let url = reqwest::Url::parse(&server).ok()?;
    if !matches!(url.scheme(), "tcp" | "ws" | "wss") {
        return None;
    }
    let host = url.host_str()?.trim_matches(['[', ']']).to_owned();
    let port = url.port().or_else(|| match url.scheme() {
        "ws" => Some(80),
        "wss" => Some(443),
        _ => None,
    })?;
    let start = std::time::Instant::now();
    let addresses = tokio::time::timeout(
        Duration::from_secs(2),
        tokio::net::lookup_host((host.as_str(), port)),
    )
    .await
    .ok()?
    .ok()?;
    for address in addresses.take(4) {
        if matches!(
            tokio::time::timeout(
                Duration::from_secs(2),
                tokio::net::TcpStream::connect(address)
            )
            .await,
            Ok(Ok(_))
        ) {
            return Some(start.elapsed().as_millis() as u64);
        }
    }
    None
}
