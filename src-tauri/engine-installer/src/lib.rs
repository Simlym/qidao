use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{BufRead, BufReader, Read, Write},
    path::Path,
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    time::{Duration, Instant},
};

const MANIFEST: &str = include_str!("../../../docs/engines/install-catalog.json");
const LICENSE: &str = include_str!("../licenses/Fairy-Stockfish-GPL-3.0.txt");
pub const INITIAL_FEN: &str =
    "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Artifact {
    pub id: String,
    pub file_name: String,
    pub url: String,
    pub size: u64,
    pub sha256: String,
    pub requires_features: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Catalog {
    pub schema_version: u32,
    pub engine_id: String,
    pub name: String,
    pub version: String,
    pub platform: String,
    pub uci_variant: String,
    pub uci_protocol: String,
    pub use_nnue: bool,
    pub license: String,
    pub source_url: String,
    pub license_url: String,
    pub allowed_hosts: Vec<String>,
    pub artifacts: Vec<Artifact>,
}

fn safe_component(value: &str) -> bool {
    !value.is_empty()
        && value != "."
        && value != ".."
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"-_ .".contains(&c))
        && !value.ends_with(['.', ' '])
}

pub fn catalog() -> Result<Catalog, String> {
    let catalog: Catalog =
        serde_json::from_str(MANIFEST).map_err(|e| format!("安装清单无效：{e}"))?;
    if catalog.schema_version != 1
        || !safe_component(&catalog.engine_id)
        || !safe_component(&catalog.version)
        || catalog.artifacts.is_empty()
    {
        return Err("安装清单版本或目录标识无效".into());
    }
    for artifact in &catalog.artifacts {
        if !safe_component(&artifact.id)
            || artifact.size == 0
            || artifact.size > 64 * 1024 * 1024
            || artifact.sha256.len() != 64
            || !artifact.sha256.bytes().all(|c| c.is_ascii_hexdigit())
        {
            return Err("安装清单中的文件标识、大小或校验值无效".into());
        }
        validate_url(&artifact.url, &catalog.allowed_hosts)?;
    }
    Ok(catalog)
}

fn validate_url(value: &str, hosts: &[String]) -> Result<(), String> {
    let url = reqwest::Url::parse(value).map_err(|e| format!("下载地址无效：{e}"))?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || !url
            .host_str()
            .is_some_and(|host| hosts.iter().any(|allowed| allowed == host))
    {
        return Err("下载地址必须使用清单允许的 HTTPS 来源".into());
    }
    Ok(())
}

pub fn compatible<'a>(
    catalog: &'a Catalog,
    os: &str,
    arch: &str,
    features: &[&str],
) -> Vec<&'a Artifact> {
    if os != "windows" || arch != "x86_64" {
        return Vec::new();
    }
    catalog
        .artifacts
        .iter()
        .filter(|artifact| {
            artifact
                .requires_features
                .iter()
                .all(|feature| features.contains(&feature.as_str()))
        })
        .collect()
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Receipt {
    pub engine_id: String,
    pub name: String,
    pub version: String,
    pub artifact_id: String,
    pub sha256: String,
    pub size: u64,
    pub uci_variant: String,
    pub uci_protocol: String,
    pub use_nnue: bool,
    pub source_url: String,
    pub license_url: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Installation {
    pub receipt: Receipt,
    pub engine_path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub phase: &'static str,
    pub downloaded: u64,
    pub total: u64,
}

fn cancelled(cancel: &AtomicBool) -> Result<(), String> {
    if cancel.load(Ordering::Relaxed) {
        Err("安装已取消，原引擎配置未修改".into())
    } else {
        Ok(())
    }
}

fn verify_file(path: &Path, size: u64, sha256: &str) -> Result<(), String> {
    let mut file = File::open(path).map_err(|e| format!("读取引擎失败：{e}"))?;
    let mut hash = Sha256::new();
    let mut bytes = [0; 65536];
    let mut length = 0;
    loop {
        let count = file
            .read(&mut bytes)
            .map_err(|e| format!("读取引擎失败：{e}"))?;
        if count == 0 {
            break;
        }
        hash.update(&bytes[..count]);
        length += count as u64;
    }
    if length != size || format!("{:x}", hash.finalize()) != sha256 {
        return Err("引擎大小或 SHA-256 校验失败，未启用下载文件".into());
    }
    Ok(())
}

fn installation(directory: &Path, receipt: Receipt) -> Installation {
    Installation {
        receipt,
        engine_path: directory.join("engine.exe").to_string_lossy().into_owned(),
    }
}

pub fn installed(root: &Path) -> Result<Vec<Installation>, String> {
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut found = Vec::new();
    for version in fs::read_dir(root)
        .map_err(|e| format!("读取安装记录失败：{e}"))?
        .flatten()
    {
        if !version.file_type().is_ok_and(|t| t.is_dir()) {
            continue;
        }
        for build in fs::read_dir(version.path()).into_iter().flatten().flatten() {
            if !build.file_type().is_ok_and(|t| t.is_dir()) {
                continue;
            }
            let dir = build.path();
            let Ok(content) = fs::read(dir.join("installation.json")) else {
                continue;
            };
            let Ok(receipt) = serde_json::from_slice::<Receipt>(&content) else {
                continue;
            };
            if receipt.version != version.file_name().to_string_lossy()
                || receipt.artifact_id != build.file_name().to_string_lossy()
                || !dir.join("engine.exe").is_file()
            {
                continue;
            }
            found.push(installation(&dir, receipt));
        }
    }
    found.sort_by(|a, b| b.receipt.version.cmp(&a.receipt.version));
    Ok(found)
}

pub fn verify_installation(
    root: &Path,
    version: &str,
    artifact_id: &str,
    cancel: &AtomicBool,
) -> Result<Installation, String> {
    if !safe_component(version) || !safe_component(artifact_id) {
        return Err("安装标识无效".into());
    }
    let found = installed(root)?
        .into_iter()
        .find(|item| item.receipt.version == version && item.receipt.artifact_id == artifact_id)
        .ok_or("找不到已安装的引擎")?;
    verify_file(
        Path::new(&found.engine_path),
        found.receipt.size,
        &found.receipt.sha256,
    )?;
    smoke_test(
        Path::new(&found.engine_path),
        cancel,
        Duration::from_secs(15),
    )?;
    Ok(found)
}

pub fn install(
    catalog: &Catalog,
    artifact: &Artifact,
    root: &Path,
    cancel: &AtomicBool,
    mut progress: impl FnMut(Progress),
) -> Result<Installation, String> {
    cancelled(cancel)?;
    let destination = root.join(&catalog.version).join(&artifact.id);
    if destination.exists() {
        return verify_installation(root, &catalog.version, &artifact.id, cancel);
    }
    fs::create_dir_all(root).map_err(|e| format!("创建安装目录失败：{e}"))?;
    // 在目标文件系统暂存，只有校验与试算全部成功才原子移入版本目录。
    let stage = tempfile::Builder::new()
        .prefix(".install-")
        .tempdir_in(root)
        .map_err(|e| format!("创建下载暂存目录失败：{e}"))?;
    let executable = stage.path().join("engine.exe");
    let allowed_hosts = catalog.allowed_hosts.clone();
    let client = reqwest::blocking::Client::builder()
        .user_agent("Xiangqidao/0.1 engine-installer")
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(120))
        .redirect(reqwest::redirect::Policy::custom(move |attempt| {
            if attempt.previous().len() >= 5 {
                return attempt.error("下载重定向过多");
            }
            if validate_url(attempt.url().as_str(), &allowed_hosts).is_err() {
                return attempt.error("下载被重定向到未允许的来源");
            }
            attempt.follow()
        }))
        .build()
        .map_err(|e| format!("初始化下载失败：{e}"))?;
    validate_url(&artifact.url, &catalog.allowed_hosts)?;
    progress(Progress {
        phase: "downloading",
        downloaded: 0,
        total: artifact.size,
    });
    let mut response = client
        .get(&artifact.url)
        .send()
        .and_then(reqwest::blocking::Response::error_for_status)
        .map_err(|e| format!("GitHub 下载失败，请检查网络或手动导入：{e}"))?;
    if response
        .content_length()
        .is_some_and(|size| size != artifact.size)
    {
        return Err("下载文件大小与固定版本清单不一致".into());
    }
    let mut file = File::create(&executable).map_err(|e| format!("创建引擎文件失败：{e}"))?;
    let mut bytes = [0; 65536];
    let mut downloaded = 0;
    loop {
        cancelled(cancel)?;
        let count = response
            .read(&mut bytes)
            .map_err(|e| format!("下载中断，可重试：{e}"))?;
        cancelled(cancel)?;
        if count == 0 {
            break;
        }
        downloaded += count as u64;
        if downloaded > artifact.size {
            return Err("下载超过清单声明大小".into());
        }
        file.write_all(&bytes[..count])
            .map_err(|e| format!("写入引擎失败：{e}"))?;
        progress(Progress {
            phase: "downloading",
            downloaded,
            total: artifact.size,
        });
    }
    file.sync_all().map_err(|e| format!("保存引擎失败：{e}"))?;
    drop(file);
    progress(Progress {
        phase: "verifying",
        downloaded,
        total: artifact.size,
    });
    verify_file(&executable, artifact.size, &artifact.sha256)?;
    let mut signature = [0; 2];
    File::open(&executable)
        .and_then(|mut f| f.read_exact(&mut signature))
        .map_err(|e| e.to_string())?;
    if signature != *b"MZ" {
        return Err("下载文件不是 Windows 可执行程序".into());
    }
    cancelled(cancel)?;
    progress(Progress {
        phase: "testing",
        downloaded,
        total: artifact.size,
    });
    smoke_test(&executable, cancel, Duration::from_secs(15))?;
    let receipt = Receipt {
        engine_id: catalog.engine_id.clone(),
        name: catalog.name.clone(),
        version: catalog.version.clone(),
        artifact_id: artifact.id.clone(),
        sha256: artifact.sha256.clone(),
        size: artifact.size,
        uci_variant: catalog.uci_variant.clone(),
        uci_protocol: catalog.uci_protocol.clone(),
        use_nnue: catalog.use_nnue,
        source_url: catalog.source_url.clone(),
        license_url: catalog.license_url.clone(),
    };
    fs::write(stage.path().join("COPYING.txt"), LICENSE).map_err(|e| e.to_string())?;
    fs::write(
        stage.path().join("installation.json"),
        serde_json::to_vec_pretty(&receipt).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    cancelled(cancel)?;
    fs::create_dir_all(destination.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::rename(stage.path(), &destination)
        .map_err(|e| format!("完成安装失败，已有版本未修改：{e}"))?;
    progress(Progress {
        phase: "installed",
        downloaded,
        total: artifact.size,
    });
    Ok(installation(&destination, receipt))
}

struct ChildGuard(Child);
impl Drop for ChildGuard {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

pub fn smoke_test(path: &Path, cancel: &AtomicBool, timeout: Duration) -> Result<(), String> {
    cancelled(cancel)?;
    let mut command = Command::new(path);
    command
        .current_dir(path.parent().unwrap_or(Path::new(".")))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = ChildGuard(
        command
            .spawn()
            .map_err(|e| format!("引擎试运行失败：{e}"))?,
    );
    let stdout = child.0.stdout.take().ok_or("无法读取试运行输出")?;
    let (sender, receiver) = mpsc::sync_channel(32);
    let reader = std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if sender.send(line).is_err() {
                break;
            }
        }
    });
    let result = (|| {
        let input = child.0.stdin.as_mut().ok_or("无法连接试运行输入")?;
        input.write_all(b"uci\n").map_err(|e| e.to_string())?;
        let deadline = Instant::now() + timeout;
        wait_for(&receiver, "uciok", deadline, cancel)?;
        input.write_all(b"setoption name UCI_Variant value xiangqi\nsetoption name Protocol value ucicyclone\nsetoption name Use NNUE value false\nsetoption name Threads value 1\nsetoption name Hash value 16\nisready\n").map_err(|e| e.to_string())?;
        wait_for(&receiver, "readyok", deadline, cancel)?;
        input
            .write_all(
                format!("position fen {INITIAL_FEN}\ngo depth 1 searchmoves h2e2\n").as_bytes(),
            )
            .map_err(|e| e.to_string())?;
        let line = wait_for(&receiver, "bestmove ", deadline, cancel)?;
        let best = line.split_whitespace().nth(1).unwrap_or("");
        let bytes = best.as_bytes();
        if best != "h2e2"
            || bytes.len() != 4
            || ![bytes[0], bytes[2]]
                .iter()
                .all(|c| (b'a'..=b'i').contains(c))
            || ![bytes[1], bytes[3]].iter().all(|c| c.is_ascii_digit())
        {
            return Err("象棋试算未返回有效着法".into());
        }
        Ok(())
    })();
    drop(child);
    drop(receiver);
    let _ = reader.join();
    result
}

fn wait_for(
    receiver: &mpsc::Receiver<String>,
    prefix: &str,
    deadline: Instant,
    cancel: &AtomicBool,
) -> Result<String, String> {
    loop {
        cancelled(cancel)?;
        if Instant::now() >= deadline {
            return Err(format!("引擎试算等待 {prefix} 超时"));
        }
        match receiver.recv_timeout(Duration::from_millis(100)) {
            Ok(line) if line.starts_with(prefix) => return Ok(line),
            Ok(_) | Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(_) => return Err("引擎在试算完成前退出".into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pinned_catalog_and_cpu_selection() {
        let c = catalog().unwrap();
        assert_eq!(c.version, "fairy_sf_14");
        assert!(!c.use_nnue);
        assert_eq!(compatible(&c, "windows", "x86_64", &[])[0].id, "generic");
        assert_eq!(
            compatible(&c, "windows", "x86_64", &["ssse3", "sse4.1", "popcnt"])[0].id,
            "modern"
        );
        assert_eq!(
            compatible(
                &c,
                "windows",
                "x86_64",
                &["ssse3", "sse4.1", "popcnt", "avx2", "bmi2"]
            )[0]
            .id,
            "bmi2"
        );
        assert!(compatible(&c, "windows", "aarch64", &[]).is_empty());
        assert!(compatible(&c, "linux", "x86_64", &[]).is_empty());
    }

    #[test]
    fn source_validation_and_path_identifiers() {
        let c = catalog().unwrap();
        for url in [
            "http://github.com/a",
            "https://github.com.evil.example/a",
            "https://user:pass@github.com/a",
            "file:///tmp/a",
        ] {
            assert!(validate_url(url, &c.allowed_hosts).is_err());
        }
        for value in ["..", "../escape", "C:\\escape", "/tmp/a", "trailing."] {
            assert!(!safe_component(value));
        }
        assert!(safe_component("fairy_sf_14"));
    }

    #[test]
    fn rejects_changed_bytes_or_wrong_size() {
        let stage = tempfile::tempdir().unwrap();
        let p = stage.path().join("engine.exe");
        fs::write(&p, b"MZexample").unwrap();
        let digest = format!("{:x}", Sha256::digest(b"MZexample"));
        assert!(verify_file(&p, 9, &digest).is_ok());
        assert!(verify_file(&p, 8, &digest).is_err());
        fs::write(&p, b"MZchanged").unwrap();
        assert!(verify_file(&p, 9, &digest).is_err());
    }

    #[test]
    fn cancellation_does_not_touch_existing_installations() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("old-profile"), b"keep").unwrap();
        let c = catalog().unwrap();
        let cancelled = AtomicBool::new(true);
        let result = install(&c, &c.artifacts[0], root.path(), &cancelled, |_| {
            panic!("不应开始下载")
        });
        assert!(result.unwrap_err().contains("取消"));
        assert_eq!(fs::read(root.path().join("old-profile")).unwrap(), b"keep");
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
    }

    #[test]
    fn partial_or_malformed_installation_is_not_listed() {
        let root = tempfile::tempdir().unwrap();
        let partial = root.path().join("version/generic");
        fs::create_dir_all(&partial).unwrap();
        fs::write(partial.join("engine.exe"), b"partial").unwrap();
        assert!(installed(root.path()).unwrap().is_empty());
        fs::write(partial.join("installation.json"), b"{}").unwrap();
        assert!(installed(root.path()).unwrap().is_empty());
        assert!(
            verify_installation(root.path(), "../escape", "generic", &AtomicBool::new(false))
                .is_err()
        );
    }

    #[cfg(unix)]
    fn fake_engine(script: &str) -> (tempfile::TempDir, std::path::PathBuf) {
        use std::os::unix::fs::PermissionsExt;
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("fake-engine");
        fs::write(&path, format!("#!/bin/sh\n{script}")).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).unwrap();
        (root, path)
    }

    #[test]
    #[cfg(unix)]
    fn uci_probe_requires_handshake_ready_and_valid_move() {
        let (_root, path) = fake_engine("while IFS= read -r line; do\ncase \"$line\" in\nuci) echo uciok;;\nisready) echo readyok;;\n'go depth 1 searchmoves h2e2') echo 'bestmove h2e2';;\nesac\ndone\n");
        assert!(smoke_test(&path, &AtomicBool::new(false), Duration::from_secs(2)).is_ok());
        let (_root, bad) = fake_engine("while IFS= read -r line; do\ncase \"$line\" in\nuci) echo uciok;;\nisready) echo readyok;;\n'go depth 1 searchmoves h2e2') echo 'bestmove (none)';;\nesac\ndone\n");
        assert!(
            smoke_test(&bad, &AtomicBool::new(false), Duration::from_secs(2))
                .unwrap_err()
                .contains("有效着法")
        );
    }

    #[test]
    #[cfg(unix)]
    fn unresponsive_engine_is_killed_on_timeout() {
        let (_root, path) = fake_engine("while IFS= read -r line; do :; done\n");
        let start = Instant::now();
        assert!(
            smoke_test(&path, &AtomicBool::new(false), Duration::from_millis(150))
                .unwrap_err()
                .contains("超时")
        );
        assert!(start.elapsed() < Duration::from_secs(2));
    }

    #[test]
    #[ignore = "需要已下载的上游本机可执行文件"]
    fn real_upstream_engine_smoke() {
        let path = std::env::var("XIANGQIDAO_TEST_ENGINE").expect("请设置 XIANGQIDAO_TEST_ENGINE");
        smoke_test(
            Path::new(&path),
            &AtomicBool::new(false),
            Duration::from_secs(15),
        )
        .unwrap();
    }
}
