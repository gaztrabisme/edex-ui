use crate::event::main::ProcessEvent;
use log::{error, info, warn};
use procfs::net::TcpState;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::net::IpAddr;
use std::time::Duration;
use tokio::sync::mpsc;

/// Timeout for geolocation HTTP requests
const GEOLOCATION_TIMEOUT: Duration = Duration::from_secs(5);
/// Maximum IPs per batch geolocation request
const GEOLOCATION_BATCH_SIZE: usize = 100;
/// Maximum number of entries in the geolocation cache before clearing
const GEO_CACHE_MAX_SIZE: usize = 500;

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

/// Response from ip-api.com for a single IP or user location query
#[derive(Deserialize, Debug)]
struct GeoApiResponse {
    status: Option<String>,
    lat: Option<f64>,
    lon: Option<f64>,
    country: Option<String>,
    city: Option<String>,
    query: Option<String>,
}

pub struct ConnectionMonitor {
    refresh_interval: Duration,
    event_tx: mpsc::UnboundedSender<ProcessEvent>,
    geo_cache: HashMap<IpAddr, GeoLocation>,
    user_location: Option<(f64, f64)>,
    http_client: reqwest::Client,
}

#[allow(clippy::nonminimal_bool)]
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
    pub fn new(refresh_interval: Duration, event_tx: mpsc::UnboundedSender<ProcessEvent>) -> Self {
        let http_client = reqwest::Client::builder()
            .timeout(GEOLOCATION_TIMEOUT)
            .build()
            .unwrap_or_else(|e| {
                warn!("Failed to create HTTP client with timeout, using default: {}", e);
                reqwest::Client::new()
            });

        Self {
            refresh_interval,
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

            self.send_event(ProcessEvent::Connections { connections_data });
        }
    }

    fn send_event(&self, event: ProcessEvent) {
        if let Err(e) = self.event_tx.send(event) {
            error!("Failed to send event: {}", e);
        }
    }

    async fn fetch_user_location(&self) -> (f64, f64) {
        match self
            .http_client
            // ip-api.com free tier requires HTTP (HTTPS is pro-only)
            .get("http://ip-api.com/json/?fields=status,lat,lon")
            .send()
            .await
        {
            Ok(response) => match response.json::<GeoApiResponse>().await {
                Ok(geo) => {
                    if geo.status.as_deref() == Some("success") {
                        (geo.lat.unwrap_or(0.0), geo.lon.unwrap_or(0.0))
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
        // Evict cache if it exceeds the size limit
        if self.geo_cache.len() >= GEO_CACHE_MAX_SIZE {
            info!(
                "Geo cache reached {} entries, clearing to prevent unbounded growth",
                self.geo_cache.len()
            );
            self.geo_cache.clear();
        }

        for chunk in ips.chunks(GEOLOCATION_BATCH_SIZE) {
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
                // ip-api.com free tier requires HTTP (HTTPS is pro-only)
                .post("http://ip-api.com/batch")
                .json(&batch_body)
                .send()
                .await
            {
                Ok(response) => match response.json::<Vec<GeoApiResponse>>().await {
                    Ok(results) => {
                        for result in results {
                            if result.status.as_deref() == Some("success") {
                                let query = result.query.as_deref().unwrap_or("");
                                if let Ok(ip) = query.parse::<IpAddr>() {
                                    let geo = GeoLocation {
                                        ip: query.to_string(),
                                        lat: result.lat.unwrap_or(0.0),
                                        lon: result.lon.unwrap_or(0.0),
                                        country: result
                                            .country
                                            .unwrap_or_default(),
                                        city: result.city.unwrap_or_default(),
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
