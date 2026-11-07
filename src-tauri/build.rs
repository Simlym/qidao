fn main() {
    println!("cargo:rerun-if-changed=android/MainActivity.kt");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android") {
        // 生成目录不入库；每次安卓编译从受版本管理的入口同步，避免重新 init 丢失修复。
        let root = std::path::PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").unwrap());
        let source = root.join("android/MainActivity.kt");
        let target = root.join("gen/android/app/src/main/java/com/xiangqidao/app/MainActivity.kt");
        if target.parent().is_some_and(|path| path.is_dir()) {
            let bytes = std::fs::read(source).expect("无法读取安卓入口源码");
            if std::fs::read(&target).ok().as_deref() != Some(bytes.as_slice()) {
                std::fs::write(target, bytes).expect("无法同步安卓入口源码");
            }
        }
    }
    tauri_build::build()
}
