#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#[cfg(target_os = "macos")]
mod power;
mod sensor;
use sensor::{SensorFrame, SensorService};
use tauri::{Emitter, Manager};

fn trusted(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("Unknown window".into())
    }
}
#[tauri::command]
fn hinge_snapshot(
    window: tauri::WebviewWindow,
    service: tauri::State<'_, SensorService>,
) -> Result<SensorFrame, String> {
    trusted(&window)?;
    Ok(service.snapshot())
}
#[tauri::command]
fn hinge_fullscreen(window: tauri::WebviewWindow, enabled: bool) -> Result<(), String> {
    trusted(&window)?;
    window.set_fullscreen(enabled).map_err(|e| e.to_string())
}
#[tauri::command]
fn hinge_fullscreen_state(window: tauri::WebviewWindow) -> Result<bool, String> {
    trusted(&window)?;
    window.is_fullscreen().map_err(|e| e.to_string())
}
#[cfg(feature = "desktop-test")]
#[tauri::command]
fn hinge_test_control(
    service: tauri::State<'_, SensorService>,
    action: &str,
) -> Result<(), String> {
    let control = match action {
        "suspend" => sensor::Control::Suspend,
        "resume" => sensor::Control::Resume,
        _ => return Err("Unknown test action".into()),
    };
    service.control(control);
    Ok(())
}
fn main() {
    let builder = tauri::Builder::default();
    #[cfg(feature = "desktop-test")]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init())
        .invoke_handler(tauri::generate_handler![
            hinge_snapshot,
            hinge_fullscreen,
            hinge_fullscreen_state,
            hinge_test_control
        ]);
    #[cfg(not(feature = "desktop-test"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        hinge_snapshot,
        hinge_fullscreen,
        hinge_fullscreen_state
    ]);
    let app = builder.setup(|app| {
        let exit_handle = app.handle().clone();
        ctrlc::set_handler(move || exit_handle.exit(0))?;
        #[cfg(feature = "desktop-test")]
        app.add_capability(r#"{"identifier":"desktop-test","windows":["main"],"permissions":["wdio:default","core:window:allow-set-size","core:window:allow-set-focus","allow-hinge-test-control"]}"#)?;
        let helper = std::env::current_exe()?.parent().ok_or("Missing executable directory")?.join("lid-sensor");
        let handle = app.handle().clone();
        app.manage(SensorService::start(helper, move |frame| { let _ = handle.emit_to("main", "hinge:frame", frame); }));
        tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
            .on_navigation(|url| {
                (url.scheme() == "tauri" && url.host_str() == Some("localhost")) ||
                (url.scheme() == "http" && url.host_str() == Some("tauri.localhost")) ||
                (tauri::is_dev() && url.scheme() == "http" && url.host_str() == Some("127.0.0.1") && url.port() == Some(5173))
            })
            .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
            .build()?;
        Ok(())
    }).on_window_event(|window, event| {
        if matches!(event, tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Focused(_)) {
            if let Ok(enabled) = window.is_fullscreen() { let _ = window.emit("hinge:fullscreen-changed", enabled); }
        }
        if matches!(event, tauri::WindowEvent::Destroyed) {
            window.state::<SensorService>().shutdown(); window.app_handle().exit(0);
        }
    }).build(tauri::generate_context!()).expect("Could not start HyperHinge");
    #[cfg(target_os = "macos")]
    let mut observer = Some(power::PowerObserver::new(app.handle()));
    app.run(move |app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            #[cfg(target_os = "macos")]
            {
                observer.take();
            }
            app.state::<SensorService>().shutdown();
        }
    });
}
