fn main() {
    println!("cargo:rerun-if-changed=permissions");
    #[cfg(feature = "desktop-test")]
    let pattern = "permissions/*.toml";
    #[cfg(not(feature = "desktop-test"))]
    let pattern = "permissions/hinge.toml";
    // Exclude generated permissions left by an earlier test-feature build.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().permissions_path_pattern(pattern)),
    )
    .expect("Tauri build configuration");
}
