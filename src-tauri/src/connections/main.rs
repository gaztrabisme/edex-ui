use crate::event::main::ProcessEvent;
use log::{error, warn};
use procfs::net::TcpState;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::net::IpAddr;
use std::time::Duration;
use tokio::sync::mpsc;

#[derive(Serialize, Clone, Debug)]
pub struct GeoLocation {
    pub ip: String,
    pub lat: f64,
    pub lon: f64,
    pub country: String,
    pub city: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct ConnectionsData {
    pub user_lat: f64,
    pub user_lon: f64,
    pub connections: Vec<GeoLocation>,
}

pub struct ConnectionMonitor {
    refresh_interval: Duration,
    event_tx: mpsc::UnboundedSender<ProcessEvent>,
    geo_cache: HashMap<IpAddr, GeoLocation>,
    user_location: Option<(f64, f64)>,
    http_client: reqwest::Client,
}

fn is_public_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            !v4.is_loopback()
                && !v4.is_private()
                && !v4.is_link_local()
                && !v4.is_unspecified()
                && !v4.is_broadcast()
                // Filter 100.64.0.0/10 (Carrier-grade NAT)
                && !(v4.octets()[0] == 100 && (v4.octets()[1] & 0xC0) == 64)
        }
        IpAddr::V6(v6) => {
            !v6.is_loopback()
                && !v6.is_unspecified()
                // fe80::/10 (link-local)
                && (v6.segments()[0] & 0xFFC0) != 0xFE80
                // fc00::/7 (unique local)
                && (v6.segments()[0] & 0xFE00) != 0xFC00
        }
    }
}

impl ConnectionMonitor {
    pub fn new(refresh_interval_secs: u64, event_tx: mpsc::UnboundedSender<ProcessEvent>) -> Self {
        let http_client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            refresh_interval: Duration::from_secs(refresh_interval_secs),
            event_tx,
            geo_cache: HashMap::new(),
            user_location: None,
            http_client,
        }
    }

    pub async fn run(&mut self) {
        let mut interval = tokio::time::interval(self.refresh_interval);

        loop {
            interval.tick().await;

            // Fetch user location on first iteration
            if self.user_location.is_none() {
                self.user_location = Some(self.fetch_user_location().await);
            }

            let (user_lat, user_lon) = self.user_location.unwrap_or((0.0, 0.0));

            // Collect active public IPs from TCP connections
            let active_ips = self.get_active_public_ips();

            // Find IPs not yet cached
            let new_ips: Vec<IpAddr> = active_ips
                .iter()
                .filter(|ip| !self.geo_cache.contains_key(ip))
                .cloned()
                .collect();

            // Batch geolocate new IPs
            if !new_ips.is_empty() {
                self.batch_geolocate(&new_ips).await;
            }

            // Build connections data from currently active IPs that have cached geolocations
            let connections: Vec<GeoLocation> = active_ips
                .iter()
                .filter_map(|ip| self.geo_cache.get(ip).cloned())
                .collect();

            let connections_data = ConnectionsData {
                user_lat,
                user_lon,
                connections,
            };

            if let Err(e) = self
                .event_tx
                .send(ProcessEvent::Connections { connections_data })
            {
                error!("Failed to send connections data: {}", e);
            }
        }
    }

    async fn fetch_user_location(&self) -> (f64, f64) {
        match self
            .http_client
            .get("http://ip-api.com/json/?fields=status,lat,lon")
            .send()
            .await
        {
            Ok(response) => match response.json::<serde_json::Value>().await {
                Ok(json) => {
                    if json.get("status").and_then(|s| s.as_str()) == Some("success") {
                        let lat = json.get("lat").and_then(|v| v.as_f64()).unwrap_or(0.0);
                        let lon = json.get("lon").and_then(|v| v.as_f64()).unwrap_or(0.0);
                        (lat, lon)
                    } else {
                        warn!("ip-api.com returned non-success status for user location");
                        (0.0, 0.0)
                    }
                }
                Err(e) => {
                    warn!("Failed to parse user location response: {}", e);
                    (0.0, 0.0)
                }
            },
            Err(e) => {
                warn!("Failed to fetch user location: {}", e);
                (0.0, 0.0)
            }
        }
    }

    fn get_active_public_ips(&self) -> HashSet<IpAddr> {
        let mut ips = HashSet::new();

        // Read TCP (IPv4) connections
        if let Ok(tcp_entries) = procfs::net::tcp() {
            for entry in tcp_entries {
                if entry.state == TcpState::Established {
                    let ip = entry.remote_address.ip();
                    if is_public_ip(&ip) {
                        ips.insert(ip);
                    }
                }
            }
        }

        // Read TCP6 (IPv6) connections
        if let Ok(tcp6_entries) = procfs::net::tcp6() {
            for entry in tcp6_entries {
                if entry.state == TcpState::Established {
                    let ip = entry.remote_address.ip();
                    if is_public_ip(&ip) {
                        ips.insert(ip);
                    }
                }
            }
        }

        ips
    }

    async fn batch_geolocate(&mut self, ips: &[IpAddr]) {
        // ip-api.com batch endpoint accepts max 100 IPs per request
        for chunk in ips.chunks(100) {
            let batch_body: Vec<serde_json::Value> = chunk
                .iter()
                .map(|ip| {
                    serde_json::json!({
                        "query": ip.to_string(),
                        "fields": "status,lat,lon,country,city,query"
                    })
                })
                .collect();

            match self
                .http_client
                .post("http://ip-api.com/batch")
                .json(&batch_body)
                .send()
                .await
            {
                Ok(response) => match response.json::<Vec<serde_json::Value>>().await {
                    Ok(results) => {
                        for result in results {
                            if result.get("status").and_then(|s| s.as_str()) == Some("success") {
                                let query = result
                                    .get("query")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("");
                                let lat =
                                    result.get("lat").and_then(|v| v.as_f64()).unwrap_or(0.0);
                                let lon =
                                    result.get("lon").and_then(|v| v.as_f64()).unwrap_or(0.0);
                                let country = result
                                    .get("country")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                let city = result
                                    .get("city")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();

                                if let Ok(ip) = query.parse::<IpAddr>() {
                                    let geo = GeoLocation {
                                        ip: query.to_string(),
                                        lat,
                                        lon,
                                        country,
                                        city,
                                    };
                                    self.geo_cache.insert(ip, geo);
                                }
                            }
                        }
                    }
                    Err(e) => {
                        warn!("Failed to parse batch geolocation response: {}", e);
                    }
                },
                Err(e) => {
                    warn!("Failed to send batch geolocation request: {}", e);
                }
            }
        }
    }
}
