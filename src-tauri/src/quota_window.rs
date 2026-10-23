use tauri::{LogicalSize, Manager, PhysicalPosition, WebviewWindow};

pub fn configure(window: &WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let target = window.clone();
        window
            .run_on_main_thread(move || {
                use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior as Behavior};
                let Ok(pointer) = target.ns_window() else {
                    return;
                };
                // Tauri owns this NSWindow; access it only on AppKit's main thread.
                let native = unsafe { &*pointer.cast::<NSWindow>() };
                let mut behavior = native.collectionBehavior();
                behavior.remove(Behavior::FullScreenPrimary | Behavior::FullScreenNone);
                behavior.insert(Behavior::CanJoinAllSpaces | Behavior::FullScreenAuxiliary);
                if objc2::available!(macos = 13.0) {
                    behavior.remove(Behavior::Primary | Behavior::Auxiliary);
                    behavior.insert(Behavior::CanJoinAllApplications);
                }
                native.setCollectionBehavior(behavior);
                native.setHidesOnDeactivate(false);
            })
            .map_err(|error| error.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    let _ = window;
    Ok(())
}

#[tauri::command]
pub fn set_quota_collapsed(app: tauri::AppHandle, collapsed: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("quota")
        .ok_or("Quota window is unavailable")?;
    let (width, height) = if collapsed {
        (88.0, 88.0)
    } else {
        (352.0, 178.0)
    };
    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|e| e.to_string())?;
    // Expanding a ball parked at the screen edge must keep the controls reachable.
    if let Some(monitor) = window.current_monitor().map_err(|e| e.to_string())? {
        let area = monitor.work_area();
        let scale = monitor.scale_factor();
        let position = window.outer_position().map_err(|e| e.to_string())?;
        let max_x = area.position.x + (area.size.width as f64 - width * scale).max(0.0) as i32;
        let max_y = area.position.y + (area.size.height as f64 - height * scale).max(0.0) as i32;
        window
            .set_position(PhysicalPosition::new(
                position.x.clamp(area.position.x, max_x),
                position.y.clamp(area.position.y, max_y),
            ))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(feature = "e2e")]
#[tauri::command]
pub async fn quota_native_state(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let window = app
        .get_webview_window("quota")
        .ok_or("Quota window is unavailable")?;
    let (sender, receiver) = std::sync::mpsc::channel();
    let target = window.clone();
    window
        .run_on_main_thread(move || {
            #[cfg(target_os = "macos")]
            let value = {
                use objc2_app_kit::{
                    NSWindow, NSWindowCollectionBehavior as Behavior, NSWindowOcclusionState,
                };
                let pointer = target.ns_window().unwrap();
                let native = unsafe { &*pointer.cast::<NSWindow>() };
                let behavior = native.collectionBehavior();
                serde_json::json!({
                    "fullScreenAuxiliary": behavior.contains(Behavior::FullScreenAuxiliary),
                    "canJoinAllApplications": behavior.contains(Behavior::CanJoinAllApplications),
                    "onActiveSpace": native.isOnActiveSpace(),
                    "visibleOnScreen": native.occlusionState().contains(NSWindowOcclusionState::Visible),
                })
            };
            #[cfg(not(target_os = "macos"))]
            let value = {
                let _ = target;
                serde_json::json!({})
            };
            let _ = sender.send(value);
        })
        .map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || receiver.recv().map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}
