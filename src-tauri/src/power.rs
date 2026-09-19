use crate::sensor::{Control, SensorService};
use block2::RcBlock;
use objc2::{rc::Retained, runtime::ProtocolObject};
use objc2_app_kit::{
    NSWorkspace, NSWorkspaceDidWakeNotification, NSWorkspaceWillSleepNotification,
};
use objc2_foundation::{NSNotification, NSNotificationCenter, NSObjectProtocol};
use std::ptr::NonNull;
use tauri::Manager;

/// Kept on the main thread for the lifetime of the app run loop.
pub struct PowerObserver {
    center: Retained<NSNotificationCenter>,
    tokens: Vec<Retained<ProtocolObject<dyn NSObjectProtocol>>>,
}
impl PowerObserver {
    pub fn new(app: &tauri::AppHandle) -> Self {
        let center = NSWorkspace::sharedWorkspace().notificationCenter();
        let mut tokens = Vec::new();
        // NSWorkspace owns each copied block; captures are Send and access only managed Rust state.
        unsafe {
            for (name, control) in [
                (NSWorkspaceWillSleepNotification, Control::Suspend),
                (NSWorkspaceDidWakeNotification, Control::Resume),
            ] {
                let app = app.clone();
                let callback = RcBlock::new(move |_: NonNull<NSNotification>| {
                    app.state::<SensorService>().control(control);
                });
                tokens.push(center.addObserverForName_object_queue_usingBlock(
                    Some(name),
                    None,
                    None,
                    &callback,
                ));
            }
        }
        Self { center, tokens }
    }
}
impl Drop for PowerObserver {
    fn drop(&mut self) {
        for token in &self.tokens {
            // These exact tokens were registered with this center and are still retained.
            unsafe {
                self.center.removeObserver((**token).as_ref());
            }
        }
    }
}
