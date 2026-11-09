//! 服务端命令行入口，与 PC 共用固定清单、下载校验、试算和原子安装。
use serde_json::json;
use std::{
    io::{self, BufRead, Write},
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};
use xiangqidao_engine_installer::{packages, probe};

fn emit(value: serde_json::Value) {
    println!("{value}");
    let _ = io::stdout().flush();
}

fn features() -> Vec<&'static str> {
    let mut result = Vec::new();
    #[cfg(target_arch = "x86_64")]
    {
        if std::is_x86_feature_detected!("sse4.1") {
            result.push("sse4.1");
        }
        if std::is_x86_feature_detected!("popcnt") {
            result.push("popcnt");
        }
        if std::is_x86_feature_detected!("ssse3") {
            result.push("ssse3");
        }
        if std::is_x86_feature_detected!("avx2") {
            result.push("avx2");
        }
        if std::is_x86_feature_detected!("bmi2") {
            result.push("bmi2");
        }
    }
    result
}

fn run() -> Result<(), String> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() < 4 {
        return Err("需要操作、棋种和安装目录".into());
    }
    let (action, variant, root) = (&args[1], &args[2], Path::new(&args[3]));
    let all = packages::catalog(variant)?;
    let cpu = features();
    let supported: Vec<_> = all
        .into_iter()
        .filter(|p| packages::compatible(p, std::env::consts::OS, std::env::consts::ARCH, &cpu))
        .collect();
    if action == "info" {
        emit(
            json!({"packages": supported, "installed": packages::installed(root, &supported), "os": std::env::consts::OS, "arch": std::env::consts::ARCH}),
        );
        return Ok(());
    }
    let cancel = Arc::new(AtomicBool::new(false));
    let input_cancel = cancel.clone();
    std::thread::spawn(move || {
        // 连接断开或父进程退出也取消，不留下无人持有的搜索。
        let _ = io::stdin().lock().lines().next();
        input_cancel.store(true, Ordering::Relaxed);
    });
    let value = args.get(4).ok_or("缺少安装包或程序路径")?;
    if action == "probe" {
        let path = Path::new(value);
        let network = path
            .parent()
            .and_then(|dir| std::fs::read_dir(dir).ok())
            .map(|entries| {
                entries
                    .flatten()
                    .map(|e| e.path())
                    .filter(|p| p.extension().is_some_and(|e| e == "nnue"))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        if network.len() > 1 {
            return Err("同目录存在多个权重，请使用固定版本引擎包".into());
        }
        let manifest = path
            .parent()
            .and_then(|dir| std::fs::read(dir.join("engine-manifest.json")).ok())
            .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok());
        let fairy = manifest
            .as_ref()
            .and_then(|m| m.get("uciProtocol"))
            .and_then(|v| v.as_str())
            == Some("ucicyclone");
        probe(
            path,
            &cancel,
            Duration::from_secs(30),
            variant,
            fairy,
            network.first().map(|p| p.as_path()),
        )?;
        emit(json!({"type": "result", "data": {"enginePath": value}}));
        return Ok(());
    }
    let p = supported
        .iter()
        .find(|p| p.id == *value)
        .ok_or("当前服务器没有适配的固定引擎包")?;
    let progress = |p| emit(json!({"type": "progress", "data": p}));
    let installed = match action.as_str() {
        "download" => packages::download_install(root, p, &cancel, progress)?,
        "verify" => packages::verify_installation(root, p, &cancel)?,
        "import" => packages::install_archive(
            root,
            p,
            Path::new(args.get(5).ok_or("缺少服务器 ZIP 路径")?),
            &cancel,
            progress,
        )?,
        _ => return Err("不支持的安装操作".into()),
    };
    emit(json!({"type": "result", "data": installed}));
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        emit(json!({"type": "error", "data": {"message": error}}));
        std::process::exit(1);
    }
}
