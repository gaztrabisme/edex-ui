use crate::event::main::ProcessEvent;
use crate::file::main::{DirectoryWatcherEvent, WatcherPayload};
use dashmap::DashMap;
use log::{error, warn};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Listener};
use tokio::sync::mpsc;

#[derive(Clone, Default)]
pub struct SessionPids(pub Arc<DashMap<String, i32>>);

fn construct_cmd() -> CommandBuilder {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| {
        if cfg!(target_os = "macos") {
            "/bin/zsh".to_string()
        } else {
            "/bin/bash".to_string()
        }
    });
    let mut cmd = CommandBuilder::new(&shell);

    cmd.args(["-l"]);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERM_PROGRAM", "eDEX-UI");
    cmd.env("TERM_PROGRAM_VERSION", "1.0.0");

    for var in ["HOME", "USER", "SHELL", "PATH", "LANG"] {
        if let Ok(val) = std::env::var(var) {
            cmd.env(var, val);
        }
    }

    cmd
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
enum PtySessionCommand {
    Write { data: String },
    Resize { cols: u16, rows: u16 },
    Exit,
}

struct PtySession {
    pid: i32,
}

impl PtySession {
    pub fn new<F>(
        id: &str,
        process_event_sender: mpsc::UnboundedSender<ProcessEvent>,
        app_handle: AppHandle,
        cleanup: F,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>>
    where
        F: FnOnce() + Send + 'static,
    {
        let pty_size = PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        };

        let pty_system = native_pty_system();
        let pty_pair = pty_system.openpty(pty_size)?;

        // Spawn the child process
        let cmd = construct_cmd();
        let mut child = pty_pair.slave.spawn_command(cmd)?;

        // Release any handles owned by the slave: we don't need it now
        // that we've spawned the child.
        drop(pty_pair.slave);

        let master = pty_pair.master;

        let pid = master.process_group_leader().ok_or_else(|| {
            Into::<Box<dyn std::error::Error + Send + Sync>>::into(
                "Failed to get process group leader pid",
            )
        })?;

        // Get reader and writer from master
        let pty_reader = master.try_clone_reader()?;
        let mut reader = BufReader::new(pty_reader);
        let writer = master.take_writer()?;

        // Clone sender for the reader task
        let pty_reader_sender = process_event_sender.clone();
        let id_for_reader = id.to_owned();

        // Spawn reader task to continuously read from PTY
        // We must use either spawn_blocking  or `tokio::task::yield_now().await` with async spawn,
        // otherwise, it will prevent mpsc receiver from receiving the event
        let reader_handle = tauri::async_runtime::spawn_blocking(move || loop {
            match reader.fill_buf() {
                Ok(data) if !data.is_empty() => {
                    let data = data.to_vec();
                    reader.consume(data.len());
                    if let Err(e) = pty_reader_sender.send(ProcessEvent::Forward {
                        id: id_for_reader.clone(),
                        data,
                    }) {
                        error!("Fail to send output. {:?}", e);
                    }
                }
                Ok(_) => {
                    // ✅ EOF reached - exit loop
                    break;
                }
                Err(e) => {
                    error!(
                        "Error when reading from pty for session {}: Error: {}",
                        id_for_reader, e
                    );
                    break;
                }
            }
        });

        let writer = Mutex::new(writer);
        let master = Mutex::new(master);
        let killer = Mutex::new(child.clone_killer());
        let event_id = app_handle.listen(id, move |event| {
            match serde_json::from_str::<PtySessionCommand>(event.payload()) {
                Ok(PtySessionCommand::Write { data }) => {
                    match writer.lock() {
                        Ok(mut w) => {
                            if let Err(e) = w.write(data.as_bytes()) {
                                error!("Failed to write to session: {:?}", e);
                            }
                        }
                        Err(e) => error!("Failed to lock writer mutex: {:?}", e),
                    }
                }
                Ok(PtySessionCommand::Resize { cols, rows }) => {
                    let size = PtySize {
                        rows,
                        cols,
                        ..Default::default()
                    };
                    match master.lock() {
                        Ok(m) => {
                            if let Err(e) = m.resize(size) {
                                error!("Failed to resize session: {:?}", e);
                            }
                        }
                        Err(e) => error!("Failed to lock master mutex: {:?}", e),
                    }
                }
                Ok(PtySessionCommand::Exit) => {
                    match killer.lock() {
                        Ok(mut k) => {
                            if let Err(e) = k.kill() {
                                error!("Failed to kill session: {:?}", e);
                            }
                        }
                        Err(e) => error!("Failed to lock killer mutex: {:?}", e),
                    }
                }
                Err(e) => {
                    error!("Failed to parse command: {:?}", e);
                }
            }
        });

        let id_for_exit = id.to_owned();
        let app_handle_for_cleanup = app_handle;
        let child_watcher_sender = process_event_sender.clone();
        // need to use block here since child.wait is a blocking process
        tauri::async_runtime::spawn_blocking(move || {
            let exit_code = match child.wait() {
                Ok(status) => Some(status.exit_code()),
                Err(e) => {
                    error!("Failed to wait for child process: {:?}", e);
                    None
                }
            };
            reader_handle.abort();
            app_handle_for_cleanup.unlisten(event_id);
            if let Err(e) = child_watcher_sender.send(ProcessEvent::ProcessExit {
                id: id_for_exit,
                exit_code,
            }) {
                error!("Fail to send process exit event. {:?}", e);
            }
            cleanup();
        });

        Ok(Self { pid })
    }

    pub fn pid(&self) -> i32 {
        self.pid
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", content = "payload")]
enum PtySessionManagerCommand {
    Initialize { id: String },
    Switch { id: String },
}

pub struct PtySessionManager {
    process_event_sender: mpsc::UnboundedSender<ProcessEvent>,
    directory_file_watcher_event_sender: mpsc::UnboundedSender<DirectoryWatcherEvent>,
    active_sessions: Arc<DashMap<String, PtySession>>,
    session_pids: SessionPids,
}

impl PtySessionManager {
    pub fn new(
        process_event_sender: mpsc::UnboundedSender<ProcessEvent>,
        directory_file_watcher_event_sender: mpsc::UnboundedSender<DirectoryWatcherEvent>,
        session_pids: SessionPids,
    ) -> Self {
        Self {
            process_event_sender,
            directory_file_watcher_event_sender,
            active_sessions: Arc::new(DashMap::new()),
            session_pids,
        }
    }

    pub fn start(&mut self, app_handle: AppHandle) {
        let active_sessions = self.active_sessions.clone();
        let process_event_sender = self.process_event_sender.clone();
        let directory_file_watcher_sender = self.directory_file_watcher_event_sender.clone();
        let session_pids = self.session_pids.clone();
        let app_handle_clone = app_handle.clone();

        app_handle.listen("manager", move |event| {
            match serde_json::from_str::<PtySessionManagerCommand>(event.payload()) {
                Ok(PtySessionManagerCommand::Initialize { id }) => {
                    Self::spawn_pty(
                        &id,
                        &active_sessions,
                        &process_event_sender,
                        &directory_file_watcher_sender,
                        &app_handle_clone,
                        &session_pids,
                    );
                }
                Ok(PtySessionManagerCommand::Switch { id }) => {
                    Self::switch_session(&id, &active_sessions, &directory_file_watcher_sender);
                }
                Err(e) => {
                    error!("Failed to parse command for session manager: {:?}", e);
                }
            }
        });
    }

    fn spawn_pty(
        id: &str,
        active_sessions: &Arc<DashMap<String, PtySession>>,
        process_event_sender: &mpsc::UnboundedSender<ProcessEvent>,
        directory_file_watcher_sender: &mpsc::UnboundedSender<DirectoryWatcherEvent>,
        app_handle: &AppHandle,
        session_pids: &SessionPids,
    ) {
        let active_sessions_inner = active_sessions.clone();
        let directory_watcher_inner = directory_file_watcher_sender.clone();
        let session_pids_inner = session_pids.clone();
        let id_for_cleanup = id.to_owned();
        let app_handle_for_cleanup = app_handle.clone();

        let pty_session_result = PtySession::new(
            id,
            process_event_sender.clone(),
            app_handle.clone(),
            move || {
                if let Err(e) =
                    directory_watcher_inner.send(DirectoryWatcherEvent::Watch { initial: None })
                {
                    error!(
                        "Fail to send directory update event on session close. {:?}",
                        e
                    )
                }
                active_sessions_inner.remove(&id_for_cleanup);
                session_pids_inner.0.remove(&id_for_cleanup);

                // user closed all sessions, we should exit the app now.
                if active_sessions_inner.is_empty() {
                    app_handle_for_cleanup.exit(0i32);
                }
            },
        );

        match pty_session_result {
            Ok(pty_session) => {
                if active_sessions.contains_key(id) {
                    // Kill the old session's shell process via its event listener,
                    // then remove it. The child-watcher will handle final cleanup.
                    let exit_payload =
                        serde_json::json!({"type": "Exit"}).to_string();
                    if let Err(e) = app_handle.emit(id, &exit_payload) {
                        error!("Failed to send Exit to old session {}: {}", id, e);
                    }
                    active_sessions.remove(id);
                    warn!(
                        "Session {} already existed; killed old session before inserting new one",
                        id
                    );
                }
                let pid = pty_session.pid();
                active_sessions.insert(id.to_owned(), pty_session);
                session_pids.0.insert(id.to_owned(), pid);

                if let Err(e) = directory_file_watcher_sender.send(DirectoryWatcherEvent::Watch {
                    initial: Some(WatcherPayload::new(pid)),
                }) {
                    error!("Fail to send directory update event. {:?}", e);
                }
            }
            Err(e) => {
                error!("Failed to initialize new session: {:?}", e);
            }
        }
    }

    fn switch_session(
        id: &str,
        active_sessions: &Arc<DashMap<String, PtySession>>,
        directory_file_watcher_sender: &mpsc::UnboundedSender<DirectoryWatcherEvent>,
    ) {
        match active_sessions.get(id) {
            Some(pty_session) => {
                if let Err(e) = directory_file_watcher_sender.send(DirectoryWatcherEvent::Watch {
                    initial: Some(WatcherPayload::new(pty_session.pid())),
                }) {
                    error!("Fail to send directory update event. {:?}", e);
                }
            }
            None => {
                error!("Session {} not found on switching", id);
            }
        }
    }
}
