#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use log::{info, LevelFilter};
use std::time::Duration;
use sysinfo::System;
use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};

use crate::event::main::EventProcessor;
use crate::file::main::DirectoryFileWatcher;
use crate::session::main::PtySessionManager;
use crate::sys::main::SystemMonitor;

/// How often system stats (CPU, GPU, memory, processes) are polled
const SYSTEM_POLL_INTERVAL: Duration = Duration::from_secs(1);
/// How often TCP connections are scanned and geolocated
const CONNECTION_POLL_INTERVAL: Duration = Duration::from_secs(5);

mod connections;
mod event;
mod file;
mod session;
mod sys;

#[tauri::command]
async fn kernel_version() -> Result<String, String> {
    System::kernel_version()
        .map(|v| v.chars().take_while(|&ch| ch != '-').collect::<String>())
        .ok_or_else(|| "Failed to get kernel version".to_string())
}

#[tauri::command]
async fn read_history() -> Result<Vec<String>, String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let path = std::path::Path::new(&home).join(".bash_history");
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut lines: Vec<String> = content
        .lines()
        .filter(|l| !l.is_empty())
        .map(|l| l.to_string())
        .collect();
    lines.reverse();
    lines.dedup();
    Ok(lines)
}

fn main() {
    let log_level = if cfg!(debug_assertions) {
        LevelFilter::Info
    } else {
        LevelFilter::Error
    };

    info!("Log Level: {:?}", log_level);
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_os::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                ])
                .level(log_level)
                .build(),
        )
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app
                .get_webview_window("main")
                .expect("no main window")
                .set_focus();
        }))
        .invoke_handler(tauri::generate_handler![kernel_version, read_history])
        .setup(move |app| {
            let (mut event_processor, process_event_sender) =
                EventProcessor::new(app.handle().clone());

            // Start event processor in background
            tauri::async_runtime::spawn(async move {
                event_processor.run().await;
            });

            let (mut directory_file_watcher, directory_file_watcher_event_sender) =
                DirectoryFileWatcher::new(process_event_sender.clone());

            // Start directory file watcher processor in background
            tauri::async_runtime::spawn(async move {
                directory_file_watcher.run().await;
            });

            let mut pty_manager = PtySessionManager::new(
                process_event_sender.clone(),
                directory_file_watcher_event_sender.clone(),
            );
            pty_manager.start(app.handle().clone());

            // refresh and emit system information
            let mut monitor =
                SystemMonitor::new(SYSTEM_POLL_INTERVAL, process_event_sender.clone());
            tauri::async_runtime::spawn(async move { monitor.run().await });

            // monitor active TCP connections and geolocate remote IPs
            let mut connection_monitor = connections::main::ConnectionMonitor::new(
                CONNECTION_POLL_INTERVAL,
                process_event_sender.clone(),
            );
            tauri::async_runtime::spawn(async move { connection_monitor.run().await });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running edex");
}
