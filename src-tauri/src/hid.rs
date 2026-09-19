//! Read-only HID access. All CF/IOKit handles stay on the owning worker thread.
use core_foundation::{
    base::{CFRelease, CFRetain, CFTypeRef, TCFType},
    dictionary::CFDictionary,
    number::CFNumber,
    string::CFString,
};
use std::{ffi::c_void, marker::PhantomData, ptr, rc::Rc};

type Handle = *const c_void;

/// Same executable, isolated worker mode. The parent can terminate this process
/// if an IOKit call stops returning; no unsafe thread cancellation is needed.
pub fn run_worker(once: bool) -> i32 {
    use std::io::Write;
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };
    let running = Arc::new(AtomicBool::new(true));
    let signal = running.clone();
    if ctrlc::set_handler(move || signal.store(false, Ordering::Relaxed)).is_err() {
        return 2;
    }
    let mut output = std::io::stdout().lock();
    let result = (|| -> Result<(), String> {
        let device = Device::open()?;
        while running.load(Ordering::Relaxed) {
            // Prevent an orphan from polling indefinitely after its parent dies.
            // SAFETY: getppid has no preconditions.
            if !once && unsafe { libc::getppid() } == 1 {
                break;
            }
            let angle = device.read()?;
            writeln!(output, "{}", serde_json::json!({ "angle": angle }))
                .and_then(|()| output.flush())
                .map_err(|e| e.to_string())?;
            if once {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        Ok(())
    })();
    if let Err(error) = result {
        let _ = writeln!(output, "{}", serde_json::json!({ "error": error }));
        let _ = output.flush();
        return 2;
    }
    0
}

#[link(name = "IOKit", kind = "framework")]
extern "C" {
    fn IOHIDManagerCreate(allocator: Handle, options: u32) -> Handle;
    fn IOHIDManagerSetDeviceMatching(manager: Handle, matching: Handle);
    fn IOHIDManagerOpen(manager: Handle, options: u32) -> i32;
    fn IOHIDManagerClose(manager: Handle, options: u32) -> i32;
    fn IOHIDManagerCopyDevices(manager: Handle) -> Handle;
    fn IOHIDDeviceOpen(device: Handle, options: u32) -> i32;
    fn IOHIDDeviceClose(device: Handle, options: u32) -> i32;
    fn IOHIDDeviceGetReport(
        device: Handle,
        report_type: u32,
        report_id: isize,
        report: *mut u8,
        length: *mut isize,
    ) -> i32;
}
#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFSetGetCount(set: Handle) -> isize;
    fn CFSetGetValues(set: Handle, values: *mut Handle);
}

pub fn decode_report(bytes: &[u8]) -> Result<f64, String> {
    if bytes.len() < 3 || bytes[0] != 1 {
        return Err("Invalid lid sensor report".into());
    }
    let angle = u16::from_le_bytes([bytes[1], bytes[2]]);
    if angle > 180 {
        return Err("Lid angle outside protocol range".into());
    }
    Ok(f64::from(angle))
}

// Owns a Create/Copy/Retain reference. Deliberately neither Send nor Sync.
struct Owned(Handle, PhantomData<Rc<()>>);
impl Owned {
    fn new(handle: Handle) -> Result<Self, String> {
        if handle.is_null() {
            Err("HID object unavailable".into())
        } else {
            Ok(Self(handle, PhantomData))
        }
    }
}
impl Drop for Owned {
    fn drop(&mut self) {
        // SAFETY: this wrapper owns one non-null CF reference.
        unsafe { CFRelease(self.0 as CFTypeRef) };
    }
}

pub struct Device {
    device: Owned,
    _manager: Manager,
}
struct Manager(Owned);
impl Drop for Manager {
    fn drop(&mut self) {
        // SAFETY: the manager remains retained until Owned is dropped.
        unsafe { IOHIDManagerClose(self.0 .0, 0) };
    }
}
impl Drop for Device {
    fn drop(&mut self) {
        // SAFETY: close our non-exclusive open before releasing the device.
        unsafe { IOHIDDeviceClose(self.device.0, 0) };
    }
}
impl Device {
    pub fn open() -> Result<Self, String> {
        // SAFETY: default allocator, no exclusive-access flags; owned handles are
        // checked for null and released on every exit path.
        unsafe {
            let manager = Manager(Owned::new(IOHIDManagerCreate(ptr::null(), 0))?);
            let matching = CFDictionary::from_CFType_pairs(&[
                (CFString::new("VendorID"), CFNumber::from(0x05ac_i32)),
                (CFString::new("DeviceUsagePage"), CFNumber::from(0x20_i32)),
                (CFString::new("DeviceUsage"), CFNumber::from(0x8a_i32)),
            ]);
            IOHIDManagerSetDeviceMatching(manager.0 .0, matching.as_concrete_TypeRef().cast());
            let status = IOHIDManagerOpen(manager.0 .0, 0);
            if status != 0 {
                return Err(format!("HID manager open failed: {status:#x}"));
            }
            let devices = Owned::new(IOHIDManagerCopyDevices(manager.0 .0))?;
            let count = CFSetGetCount(devices.0);
            let mut handles = vec![ptr::null(); count.max(0) as usize];
            CFSetGetValues(devices.0, handles.as_mut_ptr());
            for handle in handles {
                if IOHIDDeviceOpen(handle, 0) != 0 {
                    continue;
                }
                if Self::read_handle(handle).is_ok() {
                    return Ok(Self {
                        device: Owned::new(CFRetain(handle))?,
                        _manager: manager,
                    });
                }
                IOHIDDeviceClose(handle, 0);
            }
            Err("No readable lid angle sensor found".into())
        }
    }

    pub fn read(&self) -> Result<f64, String> {
        Self::read_handle(self.device.0)
    }

    fn read_handle(handle: Handle) -> Result<f64, String> {
        let mut bytes = [0u8; 16];
        let mut length = bytes.len() as isize;
        // SAFETY: handle is an open, retained IOHIDDevice; the buffer and length
        // remain valid throughout this synchronous feature-report call.
        let status = unsafe { IOHIDDeviceGetReport(handle, 2, 1, bytes.as_mut_ptr(), &mut length) };
        if status != 0 {
            return Err(format!("Sensor read failed: {status:#x}"));
        }
        let length = usize::try_from(length).map_err(|_| "Invalid report length")?;
        let report = bytes.get(..length).ok_or("Invalid report length")?;
        decode_report(report)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "requires a readable physical lid sensor; does not move the lid"]
    fn hardware_open_read_close_reopen() {
        for _ in 0..2 {
            let device = Device::open().expect("open physical sensor");
            let angle = device.read().expect("read physical sensor");
            println!("Rust HID angle: {angle}");
            assert!((0.0..=180.0).contains(&angle));
        }
    }
    #[test]
    fn validates_feature_report() {
        for angle in [0u16, 90, 180] {
            let [lo, hi] = angle.to_le_bytes();
            assert_eq!(decode_report(&[1, lo, hi]).unwrap(), f64::from(angle));
        }
        for bytes in [&[][..], &[1, 90], &[0, 90, 0], &[1, 181, 0], &[1, 0, 1]] {
            assert!(decode_report(bytes).is_err());
        }
    }
}
