//! EmberOS desktop shell.
//!
//! The desktop app is a thin, hardened native wrapper around the *same*
//! EmberOS web app that ships to Netlify — so accounts, data and realtime
//! sync are shared with zero duplication. This crate adds the things a
//! browser can't: a frameless native window, a splash screen, a system
//! tray, global shortcuts, launch-at-startup and signed auto-updates.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::PageLoadEvent,
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder,
};

/// Production origin — the live Netlify deployment. Release builds load this.
const PROD_URL: &str = "https://ember-os.netlify.app/";
/// Dev origin — `next dev`. Debug builds load this so hot-reload works.
const DEV_URL: &str = "http://localhost:3000/";

fn target_url() -> String {
    // An explicit override always wins (handy for staging / previews).
    if let Ok(url) = std::env::var("EMBER_URL") {
        if !url.is_empty() {
            return url;
        }
    }
    if cfg!(debug_assertions) {
        DEV_URL.to_string()
    } else {
        PROD_URL.to_string()
    }
}

/// True when launched by the OS at login (we pass `--minimized` from autostart).
fn started_minimized() -> bool {
    std::env::args().any(|a| a == "--minimized" || a == "--hidden")
}

/// Bring the main window to the front, creating nothing (it always exists).
fn show_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// Toggle main window visibility (used by the global show/hide hotkey).
fn toggle_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_visible().unwrap_or(false) && !win.is_minimized().unwrap_or(false) {
            let _ = win.hide();
        } else {
            let _ = win.show();
            let _ = win.unminimize();
            let _ = win.set_focus();
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        // A single running instance; a second launch just focuses the window.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_main(app);
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .setup(|app| {
            setup(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running EmberOS");
}

fn setup(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    let minimized = started_minimized();

    // ---- launch at startup (default ON; the UI exposes a toggle) ----
    #[cfg(desktop)]
    {
        use tauri_plugin_autostart::ManagerExt;
        // Only enable the first time so we never fight a user who turned it off.
        if app.autolaunch().is_enabled().unwrap_or(false) == false
            && std::env::var("EMBER_AUTOSTART_INITIALIZED").is_err()
        {
            let _ = app.autolaunch().enable();
        }
    }

    // ---- splash screen (skipped for a silent login start) ----
    if !minimized {
        let _ = WebviewWindowBuilder::new(
            app,
            "splashscreen",
            WebviewUrl::App("splashscreen.html".into()),
        )
        .title("EmberOS")
        .inner_size(440.0, 380.0)
        .decorations(false)
        .resizable(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .center()
        .skip_taskbar(true)
        .build();
    }

    // ---- main window: the live web app, frameless (custom title bar) ----
    let shown = Arc::new(AtomicBool::new(false));
    let shown_cb = shown.clone();
    let handle_pl = handle.clone();

    WebviewWindowBuilder::new(
        app,
        "main",
        WebviewUrl::External(tauri::Url::parse(&target_url())?),
    )
    .title("EmberOS")
    .inner_size(1280.0, 820.0)
    .min_inner_size(940.0, 600.0)
    .decorations(false)
    .shadow(true)
    .resizable(true)
    .visible(false)
    .center()
    .on_page_load(move |_webview, payload| {
        if payload.event() == PageLoadEvent::Finished
            && !shown_cb.swap(true, Ordering::SeqCst)
        {
            // First real paint is done — reveal the app and drop the splash.
            if !started_minimized() {
                show_main(&handle_pl);
            }
            if let Some(splash) = handle_pl.get_webview_window("splashscreen") {
                let _ = splash.close();
            }
        }
    })
    .build()?;

    // Safety net: if the page is slow/offline, reveal after 12s so we never
    // strand the user on a splash forever.
    if !minimized {
        let handle_to = handle.clone();
        let shown_to = shown.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(12));
            if !shown_to.swap(true, Ordering::SeqCst) {
                show_main(&handle_to);
                if let Some(splash) = handle_to.get_webview_window("splashscreen") {
                    let _ = splash.close();
                }
            }
        });
    }

    // ---- system tray ----
    build_tray(app)?;

    // ---- global show/hide hotkey ----
    #[cfg(desktop)]
    {
        use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
        let handle_gs = handle.clone();
        let _ = app
            .global_shortcut()
            .on_shortcut("CmdOrControl+Shift+E", move |_app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    toggle_main(&handle_gs);
                }
            });
    }

    Ok(())
}

fn build_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItemBuilder::with_id("show", "Open EmberOS").build(app)?;
    let tasks = MenuItemBuilder::with_id("tasks", "Today's tasks").build(app)?;
    let update = MenuItemBuilder::with_id("update", "Check for updates…").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit EmberOS").build(app)?;

    let menu = MenuBuilder::new(app)
        .items(&[&show, &tasks])
        .separator()
        .items(&[&update])
        .separator()
        .items(&[&quit])
        .build()?;

    let _tray = TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("EmberOS")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main(app),
            "tasks" => {
                show_main(app);
                emit_tray_action(app, "tasks");
            }
            "update" => emit_tray_action(app, "update"),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

/// Forward a tray quick-action into the web app so it can react (navigate,
/// open the composer, run an update check…). The web layer listens for this.
fn emit_tray_action(app: &AppHandle, action: &str) {
    use tauri::Emitter;
    let _ = app.emit("ember-tray-action", action.to_string());
}
