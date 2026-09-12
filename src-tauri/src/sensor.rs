use serde::Serialize;
use std::{
    io::{BufRead, BufReader, Read},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{mpsc, Arc, Mutex},
    thread::{self, JoinHandle},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct SensorFrame {
    pub available: bool,
    pub angle: Option<f64>,
    pub message: String,
    pub timestamp: u64,
}
impl SensorFrame {
    fn offline(message: &str) -> Self {
        Self {
            available: false,
            angle: None,
            message: message.into(),
            timestamp: 0,
        }
    }
}

pub fn parse_line(line: &str) -> Option<SensorFrame> {
    let value: serde_json::Value = serde_json::from_str(line).ok()?;
    if let Some(angle) = value.get("angle").and_then(|v| v.as_f64()) {
        if angle.is_finite() && (0.0..=180.0).contains(&angle) {
            return Some(SensorFrame {
                available: true,
                angle: Some(angle),
                message: "Live sensor".into(),
                timestamp: 0,
            });
        }
    }
    value
        .get("error")
        .and_then(|v| v.as_str())
        .map(SensorFrame::offline)
}

#[derive(Clone, Copy, Debug)]
pub enum Control {
    Suspend,
    Resume,
    Stop,
}

enum Event {
    Control(Control),
    Line(u64, String),
    End(u64),
}
trait Process: Send {
    fn stop(&mut self);
}
struct NativeProcess {
    child: Child,
    reader: Option<JoinHandle<()>>,
}
impl Process for NativeProcess {
    fn stop(&mut self) {
        // Termination is followed by wait and reader join before another child starts.
        if matches!(self.child.try_wait(), Ok(None)) {
            // This PID is owned by Child and cannot be reused until it is reaped.
            #[cfg(unix)]
            unsafe {
                libc::kill(self.child.id() as libc::pid_t, libc::SIGTERM);
            }
            let deadline = Instant::now() + Duration::from_millis(200);
            while matches!(self.child.try_wait(), Ok(None)) && Instant::now() < deadline {
                thread::sleep(Duration::from_millis(5));
            }
            if matches!(self.child.try_wait(), Ok(None)) {
                let _ = self.child.kill();
            }
        }
        let _ = self.child.wait();
        if let Some(reader) = self.reader.take() {
            let _ = reader.join();
        }
    }
}
impl Drop for NativeProcess {
    fn drop(&mut self) {
        self.stop();
    }
}

type Launch = Box<dyn FnMut(u64) -> Result<Box<dyn Process>, String> + Send>;
type Publish = Box<dyn FnMut(SensorFrame) + Send>;
struct Supervisor {
    child: Option<Box<dyn Process>>,
    generation: u64,
    last: Duration,
    watchdog: Duration,
    retry: Option<Duration>,
    paused: bool,
    stopped: bool,
    launch: Launch,
    publish: Publish,
}
impl Supervisor {
    fn new(launch: Launch, publish: Publish) -> Self {
        Self {
            child: None,
            generation: 0,
            last: Duration::ZERO,
            watchdog: Duration::ZERO,
            retry: None,
            paused: false,
            stopped: false,
            launch,
            publish,
        }
    }
    fn stop_child(&mut self) {
        if let Some(mut child) = self.child.take() {
            child.stop();
        }
        self.generation += 1;
        self.retry = None;
    }
    fn start(&mut self, now: Duration) {
        self.stop_child();
        if self.paused || self.stopped {
            return;
        }
        self.last = now;
        self.watchdog = now + Duration::from_secs(1);
        match (self.launch)(self.generation) {
            Ok(child) => self.child = Some(child),
            Err(_) => self.failed(now),
        }
    }
    fn failed(&mut self, now: Duration) {
        self.stop_child();
        (self.publish)(SensorFrame::offline(
            "Sensor unavailable. Reconnecting… or try Simulate.",
        ));
        if !self.paused && !self.stopped {
            self.retry = Some(now + Duration::from_secs(3));
        }
    }
    fn event(&mut self, event: Event, now: Duration) {
        match event {
            Event::Control(Control::Stop) => {
                self.stopped = true;
                self.stop_child();
            }
            Event::Control(Control::Suspend) => {
                self.paused = true;
                self.stop_child();
                (self.publish)(SensorFrame::offline("Sensor paused during sleep"));
            }
            Event::Control(Control::Resume) if !self.stopped => {
                self.paused = false;
                self.start(now);
            }
            Event::Line(generation, line)
                if generation == self.generation && self.child.is_some() =>
            {
                if let Some(frame) = parse_line(&line) {
                    if frame.available {
                        self.last = now;
                    }
                    (self.publish)(frame);
                }
            }
            Event::End(generation) if generation == self.generation && self.child.is_some() => {
                self.failed(now)
            }
            _ => {}
        }
    }
    fn tick(&mut self, now: Duration) {
        if self.stopped || self.paused {
            return;
        }
        if self.retry.is_some_and(|retry| now >= retry) {
            self.start(now);
        }
        if self.child.is_some() && now >= self.watchdog {
            self.watchdog = now + Duration::from_secs(1);
            if now.saturating_sub(self.last) > Duration::from_millis(1500) {
                (self.publish)(SensorFrame::offline("Sensor timed out. Reconnecting…"));
                self.start(now);
            }
        }
    }
}
impl Drop for Supervisor {
    fn drop(&mut self) {
        self.stop_child();
    }
}

pub struct SensorService {
    snapshot: Arc<Mutex<SensorFrame>>,
    sender: mpsc::Sender<Event>,
    worker: Mutex<Option<JoinHandle<()>>>,
}
impl SensorService {
    pub fn start(helper: PathBuf, emit: impl Fn(SensorFrame) + Send + 'static) -> Self {
        let snapshot = Arc::new(Mutex::new(SensorFrame::offline(
            "Connecting to lid sensor…",
        )));
        let shared = snapshot.clone();
        let (sender, receiver) = mpsc::channel();
        let events = sender.clone();
        let worker = thread::spawn(move || {
            let launch: Launch = Box::new(move |generation| {
                let mut child = Command::new(&helper)
                    .stdin(Stdio::null())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::null())
                    .spawn()
                    .map_err(|e| e.to_string())?;
                let stdout = child.stdout.take().expect("piped stdout");
                let tx = events.clone();
                let reader = thread::spawn(move || {
                    let mut input = BufReader::new(stdout);
                    loop {
                        let mut line = String::new();
                        // Bound malformed output. A too-long or invalid line closes this stream.
                        match input.by_ref().take(4097).read_line(&mut line) {
                            Ok(0) | Err(_) => break,
                            Ok(_) if line.len() > 4096 => break,
                            Ok(_) => {
                                if tx.send(Event::Line(generation, line)).is_err() {
                                    return;
                                }
                            }
                        }
                    }
                    let _ = tx.send(Event::End(generation));
                });
                Ok(Box::new(NativeProcess {
                    child,
                    reader: Some(reader),
                }))
            });
            let publish: Publish = Box::new(move |mut frame| {
                let mut latest = shared.lock().expect("snapshot mutex");
                let epoch = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64;
                frame.timestamp = epoch.max(latest.timestamp + 1);
                *latest = frame.clone();
                drop(latest);
                emit(frame);
            });
            let clock = Instant::now();
            let mut supervisor = Supervisor::new(launch, publish);
            supervisor.start(clock.elapsed());
            while !supervisor.stopped {
                match receiver.recv_timeout(Duration::from_millis(20)) {
                    Ok(event) => supervisor.event(event, clock.elapsed()),
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                }
                supervisor.tick(clock.elapsed());
            }
        });
        Self {
            snapshot,
            sender,
            worker: Mutex::new(Some(worker)),
        }
    }
    pub fn snapshot(&self) -> SensorFrame {
        self.snapshot.lock().expect("snapshot mutex").clone()
    }
    pub fn control(&self, control: Control) {
        let _ = self.sender.send(Event::Control(control));
    }
    pub fn shutdown(&self) {
        self.control(Control::Stop);
        if let Some(worker) = self.worker.lock().expect("worker mutex").take() {
            let _ = worker.join();
        }
    }
}
impl Drop for SensorService {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fake(Arc<Mutex<Vec<&'static str>>>);
    impl Process for Fake {
        fn stop(&mut self) {
            self.0.lock().unwrap().push("stop");
        }
    }
    type TestRig = (
        Supervisor,
        Arc<Mutex<Vec<&'static str>>>,
        Arc<Mutex<Vec<SensorFrame>>>,
    );
    fn rig(fail: bool) -> TestRig {
        let actions = Arc::new(Mutex::new(vec![]));
        let log = actions.clone();
        let frames = Arc::new(Mutex::new(vec![]));
        let output = frames.clone();
        let s = Supervisor::new(
            Box::new(move |_| {
                log.lock().unwrap().push("start");
                if fail {
                    Err("missing".into())
                } else {
                    Ok(Box::new(Fake(log.clone())))
                }
            }),
            Box::new(move |frame| output.lock().unwrap().push(frame)),
        );
        (s, actions, frames)
    }
    fn ms(n: u64) -> Duration {
        Duration::from_millis(n)
    }
    #[test]
    fn validates_protocol_including_zero() {
        assert_eq!(parse_line(r#"{"angle":0}"#).unwrap().angle, Some(0.0));
        assert!(parse_line(r#"{"angle":180}"#).unwrap().available);
        for line in [
            "garbage",
            r#"{"angle":181}"#,
            r#"{"angle":-1}"#,
            r#"{"angle":"90"}"#,
        ] {
            assert!(parse_line(line).is_none());
        }
        assert!(!parse_line(r#"{"error":"missing"}"#).unwrap().available);
    }
    #[test]
    fn timeout_reaps_before_restart_and_rejects_old_frames() {
        let (mut s, log, frames) = rig(false);
        s.start(ms(0));
        let old = s.generation;
        s.tick(ms(1000));
        assert_eq!(log.lock().unwrap().len(), 1);
        s.tick(ms(2000));
        assert_eq!(*log.lock().unwrap(), ["start", "stop", "start"]);
        let count = frames.lock().unwrap().len();
        s.event(Event::Line(old, r#"{"angle":30}"#.into()), ms(2001));
        s.event(Event::End(old), ms(2002));
        assert_eq!(frames.lock().unwrap().len(), count);
        s.event(
            Event::Line(s.generation, r#"{"angle":90}"#.into()),
            ms(2500),
        );
        assert_eq!(frames.lock().unwrap().last().unwrap().angle, Some(90.0));
    }
    #[test]
    fn exit_and_spawn_failure_retry_after_three_seconds() {
        for fail in [false, true] {
            let (mut s, log, _) = rig(fail);
            s.start(ms(0));
            if !fail {
                s.event(Event::End(s.generation), ms(0));
            }
            let count = log.lock().unwrap().len();
            s.tick(ms(2999));
            assert_eq!(log.lock().unwrap().len(), count);
            s.tick(ms(3000));
            assert_eq!(log.lock().unwrap().len(), count + 1);
        }
    }
    #[test]
    fn sleep_cancels_retry_resume_starts_once_exit_is_terminal() {
        let (mut s, log, frames) = rig(false);
        s.start(ms(0));
        s.event(Event::End(s.generation), ms(100));
        s.event(Event::Control(Control::Suspend), ms(200));
        let count = log.lock().unwrap().len();
        s.tick(ms(10000));
        assert_eq!(log.lock().unwrap().len(), count);
        assert!(!frames.lock().unwrap().last().unwrap().available);
        s.event(Event::Control(Control::Resume), ms(10001));
        assert_eq!(log.lock().unwrap().len(), count + 1);
        s.event(Event::Control(Control::Stop), ms(10002));
        let count = log.lock().unwrap().len();
        s.event(Event::Control(Control::Resume), ms(10003));
        s.tick(ms(20000));
        assert_eq!(log.lock().unwrap().len(), count);
    }
}
