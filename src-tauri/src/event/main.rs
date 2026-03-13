use crate::connections::main::ConnectionsData;
use crate::file::main::DirectoryInfo;
use crate::sys::main::{DiskUsage, ProcessInfo, SystemData};
use log::{error, trace};
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

const DESTROY_TERMINAL: &str = "destroy";
const UPDATE_FILES: &str = "files";

/// Capacity of the bounded event channel. Large enough to absorb bursts
/// from simultaneous system monitor + PTY output without backpressure,
/// but bounded to prevent unbounded memory growth.
const EVENT_CHANNEL_CAPACITY: usize = 1024;

//TODO: Redesign event later.
#[derive(Debug, Clone)]
pub enum ProcessEvent {
    System { system_data: SystemData },
    Network { network_data: Value },
    Disks { disks_data: Vec<DiskUsage> },
    Process { process_data: Vec<ProcessInfo> },
    Directory { directory_info: DirectoryInfo },
    Connections { connections_data: ConnectionsData },
    // PTY output now emits directly from reader thread (bypasses event channel)
    ProcessExit { id: String, exit_code: Option<u32> }, // Handle Pty Session Exits
}

pub struct EventProcessor {
    event_rx: mpsc::Receiver<ProcessEvent>,
    app_handle: AppHandle,
}

impl EventProcessor {
    pub fn new(app_handle: AppHandle) -> (Self, mpsc::Sender<ProcessEvent>) {
        let (tx, rx) = mpsc::channel(EVENT_CHANNEL_CAPACITY);

        let processor = Self {
            event_rx: rx,
            app_handle,
        };

        (processor, tx)
    }

    pub async fn run(&mut self) {
        while let Some(event) = self.event_rx.recv().await {
            self.handle_event(event)
        }
    }

    fn handle_event(&self, event: ProcessEvent) {
        match event {
            ProcessEvent::ProcessExit { id, exit_code } => {
                self.handle_close(id, exit_code);
            }
            ProcessEvent::System { system_data } => {
                self.send_data("system", system_data);
            }
            ProcessEvent::Network { network_data } => {
                self.send_data("network", network_data);
            }
            ProcessEvent::Disks { disks_data } => {
                self.send_data("disk", disks_data);
            }
            ProcessEvent::Process { process_data } => {
                self.send_data("process", process_data);
            }
            ProcessEvent::Directory { directory_info } => {
                self.send_data(UPDATE_FILES, directory_info);
            }
            ProcessEvent::Connections { connections_data } => {
                self.send_data("connections", connections_data);
            }
        }
    }

    fn send_data<T>(&self, event_name: &str, data: T)
    where
        T: serde::Serialize + Clone,
    {
        match self.app_handle.emit(event_name, data) {
            Ok(_) => {}
            Err(e) => error!("Fail to send {} data. Error: {}", event_name, e),
        }
    }

    fn handle_close(&self, id: String, exit_code: Option<u32>) {
        trace!("Exit status {:?}. Id: {}", &exit_code, &id);
        if let Err(e) = self.app_handle.emit(DESTROY_TERMINAL, id) {
            error!("Fail to send {} event. Error: {}", DESTROY_TERMINAL, e);
        }
    }
}
