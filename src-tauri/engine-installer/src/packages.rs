//! 固定版本 ZIP 引擎包：本地导入和在线下载共用校验、试算及原子安装。
use super::{cancelled, probe, safe_component, validate_url, verify_file, Progress};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::atomic::AtomicBool,
    time::Duration,
};

const CATALOG: &str = include_str!("../../../docs/engines/native-packages.json");
const MAX_EXPANDED: u64 = 256 * 1024 * 1024;
const HOSTS: &[&str] = &[
    "github.com",
    "release-assets.githubusercontent.com",
    "objects.githubusercontent.com",
];

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Package {
    #[serde(default = "default_os")]
    pub os: String,
    #[serde(default = "default_arch")]
    pub arch: String,
    pub id: String,
    pub variant: String,
    pub engine_id: String,
    pub name: String,
    pub version: String,
    pub file_name: String,
    pub size: u64,
    pub sha256: String,
    pub manifest_sha256: String,
    pub entrypoint: String,
    pub network_path: Option<String>,
    pub source_commit: String,
    pub source_url: String,
    pub license_url: String,
    pub requires_features: Vec<String>,
    pub release_tag: Option<String>,
    pub public_download: bool,
    pub uci_variant: Option<String>,
    pub uci_protocol: Option<String>,
    pub network_license: Option<String>,
    pub network_license_url: Option<String>,
    #[serde(default)]
    pub application_tested: bool,
}

fn default_os() -> String {
    "windows".into()
}
fn default_arch() -> String {
    "x86_64".into()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Catalog {
    schema_version: u32,
    repository: String,
    packages: Vec<Package>,
}

pub fn catalog(variant: &str) -> Result<Vec<Package>, String> {
    if !matches!(variant, "xiangqi" | "jieqi") {
        return Err("不支持的引擎棋种".into());
    }
    let catalog: Catalog = serde_json::from_str(CATALOG).map_err(|e| e.to_string())?;
    if catalog.schema_version != 1 || catalog.repository != "https://github.com/Simlym/qidao" {
        return Err("引擎包清单来源无效".into());
    }
    let mut ids = HashSet::new();
    for p in &catalog.packages {
        if !ids.insert(&p.id)
            || !matches!(p.os.as_str(), "windows" | "linux")
            || p.arch != "x86_64"
            || !safe_component(&p.id)
            || !safe_component(&p.engine_id)
            || !safe_component(&p.version)
            || !matches!(p.variant.as_str(), "xiangqi" | "jieqi")
            || !safe_path(&p.file_name)
            || p.file_name.contains('/')
            || !safe_path(&p.entrypoint)
            || p.network_path
                .as_deref()
                .is_some_and(|path| !safe_path(path))
            || (p.network_path.is_none()
                && (p.variant != "jieqi" || p.network_license.as_deref() != Some("not-applicable")))
            || p.size == 0
            || p.size > MAX_EXPANDED
            || !digest(&p.sha256)
            || !digest(&p.manifest_sha256)
            || p.source_commit.len() != 40
            || !p.source_commit.bytes().all(|c| c.is_ascii_hexdigit())
        {
            return Err("引擎包清单标识或校验信息无效".into());
        }
        if let Some(tag) = &p.release_tag {
            if !safe_component(tag) || !tag.starts_with("engines-") {
                return Err("引擎发行标签无效".into());
            }
        }
    }
    Ok(catalog
        .packages
        .into_iter()
        .filter(|p| p.variant == variant)
        .collect())
}

pub fn compatible(p: &Package, os: &str, arch: &str, features: &[&str]) -> bool {
    os == p.os
        && arch == p.arch
        && p.requires_features
            .iter()
            .all(|f| features.contains(&f.as_str()))
}

pub fn match_archive(path: &Path, packages: &[Package]) -> Result<Package, String> {
    let size = fs::metadata(path)
        .map_err(|e| format!("读取引擎包失败：{e}"))?
        .len();
    let candidates: Vec<_> = packages.iter().filter(|p| p.size == size).collect();
    if candidates.is_empty() {
        return Err("该 ZIP 未在当前棋种和 CPU 的固定版本清单中，请使用手动选择程序".into());
    }
    for p in candidates {
        if verify_file(path, size, &p.sha256).is_ok() {
            return Ok(p.clone());
        }
    }
    Err("引擎包 SHA-256 不匹配，未安装该文件".into())
}

fn digest(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|c| c.is_ascii_hexdigit())
}

fn safe_path(value: &str) -> bool {
    !value.is_empty()
        && !value.contains(['\\', ':'])
        && value.split('/').all(|part| {
            if !safe_component(part) {
                return false;
            }
            let stem = part.split('.').next().unwrap_or("").to_ascii_uppercase();
            !matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
                && !(stem.len() == 4
                    && (stem.starts_with("COM") || stem.starts_with("LPT"))
                    && matches!(stem.as_bytes()[3], b'1'..=b'9'))
        })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    schema_version: u32,
    variant: String,
    runtime: String,
    protocol: String,
    coordinates: String,
    entrypoint: String,
    source_commit: String,
    uci_variant: Option<String>,
    uci_protocol: Option<String>,
    assets: Vec<Asset>,
}
#[derive(Debug, Deserialize)]
struct Asset {
    path: String,
    size: u64,
    sha256: String,
}

fn manifest(directory: &Path, package: &Package) -> Result<Manifest, String> {
    let path = directory.join("engine-manifest.json");
    let size = fs::metadata(&path).map_err(|e| e.to_string())?.len();
    if size > 128 * 1024 {
        return Err("引擎包清单过大".into());
    }
    verify_file(&path, size, &package.manifest_sha256)?;
    let m: Manifest = serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    if m.schema_version != 1
        || m.variant != package.variant
        || m.runtime != "native"
        || m.protocol != "uci"
        || m.coordinates != "a0-i9"
        || m.entrypoint != package.entrypoint
        || m.source_commit != package.source_commit
        || m.uci_variant != package.uci_variant
        || m.uci_protocol != package.uci_protocol
        || m.assets.is_empty()
        || m.assets.len() > 39
    {
        return Err("引擎包棋种、协议或固定源码版本不匹配".into());
    }
    let mut paths = HashSet::new();
    let mut total = 0u64;
    for asset in &m.assets {
        total = total.checked_add(asset.size).ok_or("引擎包过大")?;
        if !safe_path(&asset.path)
            || !paths.insert(asset.path.to_ascii_lowercase())
            || !digest(&asset.sha256)
            || asset.path.eq_ignore_ascii_case("engine-manifest.json")
            || asset.path.eq_ignore_ascii_case("installation.json")
            || total > MAX_EXPANDED
        {
            return Err("引擎资源清单路径或大小无效".into());
        }
    }
    if !paths.contains(&package.entrypoint.to_ascii_lowercase())
        || package
            .network_path
            .as_ref()
            .is_some_and(|path| !paths.contains(&path.to_ascii_lowercase()))
    {
        return Err("引擎包缺少固定程序或匹配权重".into());
    }
    Ok(m)
}

fn regular_file(directory: &Path, relative: &str) -> Result<PathBuf, String> {
    let path = directory.join(relative);
    // 重验已安装文件时也拒绝符号链接、目录联接或指向版本目录外的文件。
    let base = directory.canonicalize().map_err(|e| e.to_string())?;
    let actual = path.canonicalize().map_err(|e| e.to_string())?;
    let mut current = directory.to_path_buf();
    for part in relative.split('/') {
        current.push(part);
        let metadata = fs::symlink_metadata(&current).map_err(|e| e.to_string())?;
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if metadata.file_attributes() & 0x400 != 0 {
                return Err("引擎文件不能包含重解析路径".into());
            }
        }
        if metadata.file_type().is_symlink() {
            return Err("引擎文件不能包含符号链接".into());
        }
    }
    if !actual.starts_with(base) || !path.is_file() {
        return Err("引擎文件超出版本目录".into());
    }
    Ok(path)
}

fn verify_contents(directory: &Path, package: &Package, cancel: &AtomicBool) -> Result<(), String> {
    regular_file(directory, "engine-manifest.json")?;
    let m = manifest(directory, package)?;
    for asset in &m.assets {
        cancelled(cancel)?;
        let path = regular_file(directory, &asset.path)?;
        verify_file(&path, asset.size, &asset.sha256)?;
    }
    let mut signature = [0u8; 4];
    File::open(directory.join(&package.entrypoint))
        .and_then(|mut f| f.read_exact(&mut signature))
        .map_err(|e| e.to_string())?;
    if (package.os == "windows" && signature[..2] != *b"MZ")
        || (package.os == "linux" && signature != *b"\x7fELF")
    {
        return Err("引擎程序与目标系统不匹配".into());
    }
    Ok(())
}

fn executable_permissions(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())?;
    }
    let _ = path;
    Ok(())
}

fn unpack(
    archive: &Path,
    directory: &Path,
    package: &Package,
    cancel: &AtomicBool,
) -> Result<(), String> {
    verify_file(archive, package.size, &package.sha256)?;
    let mut zip = zip::ZipArchive::new(File::open(archive).map_err(|e| e.to_string())?)
        .map_err(|e| format!("无效的 ZIP 引擎包：{e}"))?;
    if zip.len() > 80 {
        return Err("引擎包文件数量超过限制".into());
    }
    let mut names = HashSet::new();
    let mut expanded = 0u64;
    let mut files = 0;
    for i in 0..zip.len() {
        cancelled(cancel)?;
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().trim_end_matches('/').to_string();
        if !safe_path(&name)
            || entry.enclosed_name().is_none()
            || !names.insert(name.to_ascii_lowercase())
            || entry.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000)
        {
            return Err("引擎包包含不安全路径或重复文件".into());
        }
        let target = directory.join(&name);
        if entry.is_dir() {
            fs::create_dir_all(target).map_err(|e| e.to_string())?;
            continue;
        }
        files += 1;
        expanded = expanded.checked_add(entry.size()).ok_or("解压大小超限")?;
        if files > 40 || expanded > MAX_EXPANDED || name.eq_ignore_ascii_case("installation.json") {
            return Err("引擎包文件数量、大小或安装记录无效".into());
        }
        fs::create_dir_all(target.parent().ok_or("引擎包路径无效")?).map_err(|e| e.to_string())?;
        let declared = entry.size();
        let mut output = File::create(target).map_err(|e| e.to_string())?;
        let mut copied = 0;
        let mut buffer = [0u8; 65536];
        loop {
            cancelled(cancel)?;
            let count = entry.read(&mut buffer).map_err(|e| e.to_string())?;
            if count == 0 {
                break;
            }
            copied += count as u64;
            if copied > declared {
                return Err("解压文件超过声明大小".into());
            }
            output
                .write_all(&buffer[..count])
                .map_err(|e| e.to_string())?;
        }
        if copied != declared {
            return Err("解压文件大小不匹配".into());
        }
        output.sync_all().map_err(|e| e.to_string())?;
    }
    let m = manifest(directory, package)?;
    let listed: HashSet<_> = m
        .assets
        .iter()
        .map(|a| a.path.to_ascii_lowercase())
        .chain(std::iter::once("engine-manifest.json".into()))
        .collect();
    // 所有解压出的普通文件必须在固定清单中，目录项不参与比较。
    if files != listed.len() {
        return Err("引擎包包含未登记文件".into());
    }
    for name in listed {
        if !names.contains(&name) {
            return Err("引擎包缺少登记文件".into());
        }
    }
    verify_contents(directory, package, cancel)
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Installation {
    pub package: Package,
    pub engine_path: String,
    pub nnue_path: String,
}

fn directory(root: &Path, p: &Package) -> PathBuf {
    let date =
        p.id.split('-')
            .rev()
            .find(|part| part.len() == 8 && part.bytes().all(|c| c.is_ascii_digit()))
            .unwrap_or("build");
    root.join(format!("{date}-{}", &p.sha256[..12]))
}
fn checked_directory(path: PathBuf) -> Result<PathBuf, String> {
    for current in path.ancestors() {
        if let Ok(metadata) = fs::symlink_metadata(current) {
            if metadata.file_type().is_symlink() {
                return Err("安装目录不能使用符号链接".into());
            }
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                if metadata.file_attributes() & 0x400 != 0 {
                    return Err("安装目录不能使用重解析路径".into());
                }
            }
        }
    }
    Ok(path)
}
fn safe_destination(root: &Path, p: &Package) -> Result<PathBuf, String> {
    checked_directory(directory(root, p))
}
fn existing_directory(root: &Path, p: &Package) -> Result<PathBuf, String> {
    let current = safe_destination(root, p)?;
    if current.exists() {
        return Ok(current);
    }
    // 旧版目录继续原位读取，不移动用户已有的引擎文件。
    checked_directory(root.join(&p.version).join(&p.id))
}
fn installation(dir: &Path, p: &Package) -> Installation {
    Installation {
        package: p.clone(),
        engine_path: dir.join(&p.entrypoint).to_string_lossy().into(),
        nnue_path: p
            .network_path
            .as_ref()
            .map(|path| dir.join(path).to_string_lossy().into_owned())
            .unwrap_or_default(),
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Receipt {
    package_id: String,
    sha256: String,
}

fn receipt_matches(dir: &Path, p: &Package) -> bool {
    regular_file(dir, "installation.json")
        .ok()
        .and_then(|path| fs::read(path).ok())
        .and_then(|bytes| serde_json::from_slice::<Receipt>(&bytes).ok())
        .is_some_and(|r| r.package_id == p.id && r.sha256 == p.sha256)
}

pub fn installed(root: &Path, packages: &[Package]) -> Vec<Installation> {
    packages
        .iter()
        .filter(|p| {
            let Ok(dir) = existing_directory(root, p) else {
                return false;
            };
            receipt_matches(&dir, p) && regular_file(&dir, &p.entrypoint).is_ok()
        })
        .map(|p| installation(&existing_directory(root, p).unwrap(), p))
        .collect()
}

pub fn verify_installation(
    root: &Path,
    p: &Package,
    cancel: &AtomicBool,
) -> Result<Installation, String> {
    let dir = existing_directory(root, p)?;
    if !receipt_matches(&dir, p) {
        return Err("引擎安装记录不匹配".into());
    }
    verify_contents(&dir, p, cancel)?;
    executable_permissions(&dir.join(&p.entrypoint))?;
    probe(
        &dir.join(&p.entrypoint),
        cancel,
        Duration::from_secs(30),
        &p.variant,
        p.uci_protocol.as_deref() == Some("ucicyclone"),
        p.network_path
            .as_ref()
            .map(|path| dir.join(path))
            .as_deref(),
    )?;
    Ok(installation(&dir, p))
}

pub fn install_archive(
    root: &Path,
    p: &Package,
    archive: &Path,
    cancel: &AtomicBool,
    mut progress: impl FnMut(Progress),
) -> Result<Installation, String> {
    cancelled(cancel)?;
    let destination = safe_destination(root, p)?;
    if destination.exists() {
        return verify_installation(root, p, cancel);
    }
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let stage = tempfile::Builder::new()
        .prefix(".install-")
        .tempdir_in(root)
        .map_err(|e| e.to_string())?;
    progress(Progress {
        phase: "extracting",
        downloaded: 0,
        total: p.size,
    });
    unpack(archive, stage.path(), p, cancel)?;
    executable_permissions(&stage.path().join(&p.entrypoint))?;
    progress(Progress {
        phase: "testing",
        downloaded: p.size,
        total: p.size,
    });
    probe(
        &stage.path().join(&p.entrypoint),
        cancel,
        Duration::from_secs(30),
        &p.variant,
        p.uci_protocol.as_deref() == Some("ucicyclone"),
        p.network_path
            .as_ref()
            .map(|path| stage.path().join(path))
            .as_deref(),
    )?;
    let receipt = Receipt {
        package_id: p.id.clone(),
        sha256: p.sha256.clone(),
    };
    fs::write(
        stage.path().join("installation.json"),
        serde_json::to_vec_pretty(&receipt).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    cancelled(cancel)?;
    fs::create_dir_all(destination.parent().ok_or("安装路径无效")?).map_err(|e| e.to_string())?;
    fs::rename(stage.path(), &destination).map_err(|e| format!("安装失败，旧配置未修改：{e}"))?;
    progress(Progress {
        phase: "installed",
        downloaded: p.size,
        total: p.size,
    });
    Ok(installation(&destination, p))
}

pub fn download_url(p: &Package) -> Result<String, String> {
    if !p.public_download {
        return Err("该引擎包尚未公开发布，请本地导入".into());
    }
    let tag = p.release_tag.as_ref().ok_or("缺少固定发行标签")?;
    let url = format!(
        "https://github.com/Simlym/qidao/releases/download/{tag}/{}",
        p.file_name
    );
    validate_url(&url, &HOSTS.iter().map(|s| (*s).into()).collect::<Vec<_>>())?;
    Ok(url)
}

pub fn download_install(
    root: &Path,
    p: &Package,
    cancel: &AtomicBool,
    mut progress: impl FnMut(Progress),
) -> Result<Installation, String> {
    cancelled(cancel)?;
    let url = download_url(p)?;
    if safe_destination(root, p)?.exists() {
        return verify_installation(root, p, cancel);
    }
    let hosts: Vec<String> = HOSTS.iter().map(|s| (*s).into()).collect();
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(300))
        .user_agent("QiDao engine-installer")
        .redirect(reqwest::redirect::Policy::custom(move |attempt| {
            if attempt.previous().len() >= 5
                || validate_url(attempt.url().as_str(), &hosts).is_err()
            {
                attempt.error("下载重定向来源无效")
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|e| e.to_string())?;
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let temp = tempfile::Builder::new()
        .prefix(".download-")
        .tempdir_in(root)
        .map_err(|e| e.to_string())?;
    let archive = temp.path().join("package.zip");
    let mut response = client
        .get(url)
        .send()
        .and_then(reqwest::blocking::Response::error_for_status)
        .map_err(|e| format!("引擎包下载失败，可重试或本地导入：{e}"))?;
    if response.content_length().is_some_and(|n| n != p.size) {
        return Err("下载大小与固定清单不符".into());
    }
    let mut output = File::create(&archive).map_err(|e| e.to_string())?;
    let mut buffer = [0u8; 65536];
    let mut downloaded = 0;
    progress(Progress {
        phase: "downloading",
        downloaded,
        total: p.size,
    });
    loop {
        cancelled(cancel)?;
        let n = response.read(&mut buffer).map_err(|e| e.to_string())?;
        cancelled(cancel)?;
        if n == 0 {
            break;
        }
        downloaded += n as u64;
        if downloaded > p.size {
            return Err("下载超过固定大小".into());
        }
        output.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
        progress(Progress {
            phase: "downloading",
            downloaded,
            total: p.size,
        });
    }
    output.sync_all().map_err(|e| e.to_string())?;
    drop(output);
    progress(Progress {
        phase: "verifying",
        downloaded,
        total: p.size,
    });
    install_archive(root, p, &archive, cancel, progress)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};
    use zip::write::SimpleFileOptions;

    fn hash(bytes: &[u8]) -> String {
        format!("{:x}", Sha256::digest(bytes))
    }

    #[test]
    fn platform_and_cpu_are_both_required() {
        let mut p = catalog("xiangqi").unwrap().remove(0);
        assert!(!compatible(&p, "linux", "x86_64", &["sse4.1", "popcnt"]));
        p.os = "linux".into();
        assert!(compatible(&p, "linux", "x86_64", &["sse4.1", "popcnt"]));
        assert!(!compatible(&p, "windows", "x86_64", &["sse4.1", "popcnt"]));
        assert!(!compatible(&p, "linux", "aarch64", &["sse4.1", "popcnt"]));
        assert!(!compatible(&p, "linux", "x86_64", &[]));
    }

    #[test]
    fn windows_binary_cannot_be_used_as_linux_package() {
        let (root, archive, mut p) = fixture(None, "xiangqi");
        p.os = "linux".into();
        let directory = root.path().join("unpacked");
        fs::create_dir(&directory).unwrap();
        assert!(unpack(&archive, &directory, &p, &AtomicBool::new(false))
            .unwrap_err()
            .contains("目标系统"));
    }

    fn fixture(
        extra: Option<(&str, &[u8])>,
        variant: &str,
    ) -> (tempfile::TempDir, PathBuf, Package) {
        let root = tempfile::tempdir().unwrap();
        let archive = root.path().join("test.zip");
        let mut p = catalog("xiangqi")
            .unwrap()
            .into_iter()
            .find(|p| p.engine_id == "pikafish")
            .unwrap();
        p.public_download = false;
        let engine = b"MZtest";
        let weight = b"weights";
        let manifest = serde_json::to_vec(&serde_json::json!({
            "schemaVersion":1, "variant":variant, "runtime":"native", "protocol":"uci", "coordinates":"a0-i9",
            "entrypoint":p.entrypoint, "sourceCommit":p.source_commit,
            "assets":[{"path":p.entrypoint,"size":engine.len(),"sha256":hash(engine)},
                      {"path":p.network_path,"size":weight.len(),"sha256":hash(weight)}]
        })).unwrap();
        let mut zip = zip::ZipWriter::new(File::create(&archive).unwrap());
        for (name, bytes) in [
            (p.entrypoint.as_str(), engine.as_slice()),
            (p.network_path.as_deref().unwrap(), weight.as_slice()),
            ("engine-manifest.json", manifest.as_slice()),
        ] {
            zip.start_file(name, SimpleFileOptions::default()).unwrap();
            zip.write_all(bytes).unwrap();
        }
        if let Some((name, bytes)) = extra {
            zip.start_file(name, SimpleFileOptions::default()).unwrap();
            zip.write_all(bytes).unwrap();
        }
        zip.finish().unwrap();
        let bytes = fs::read(&archive).unwrap();
        p.size = bytes.len() as u64;
        p.sha256 = hash(&bytes);
        p.manifest_sha256 = hash(&manifest);
        (root, archive, p)
    }

    #[test]
    fn short_directories_preserve_build_identity_and_legacy_installations() {
        let (root, archive, p) = fixture(None, "xiangqi");
        let short = directory(root.path(), &p);
        assert_eq!(short.parent(), Some(root.path()));
        assert!(!short.to_string_lossy().contains(&p.version));
        let mut other = p.clone();
        other.sha256 = "0".repeat(64);
        assert_ne!(short, directory(root.path(), &other));

        let old = root.path().join(&p.version).join(&p.id);
        fs::create_dir_all(&old).unwrap();
        unpack(&archive, &old, &p, &AtomicBool::new(false)).unwrap();
        fs::write(
            old.join("installation.json"),
            serde_json::to_vec(&Receipt {
                package_id: p.id.clone(),
                sha256: p.sha256.clone(),
            })
            .unwrap(),
        )
        .unwrap();
        let found = installed(root.path(), std::slice::from_ref(&p));
        assert_eq!(found.len(), 1);
        assert_eq!(Path::new(&found[0].engine_path), old.join(&p.entrypoint));

        fs::rename(&old, &short).unwrap();
        let found = installed(root.path(), std::slice::from_ref(&p));
        assert_eq!(found.len(), 1);
        assert_eq!(Path::new(&found[0].engine_path), short.join(&p.entrypoint));
        fs::write(short.join("installation.json"), b"{}").unwrap();
        assert!(installed(root.path(), &[p]).is_empty());
    }

    #[test]
    fn browser_download_uses_the_same_pinned_package_as_installer() {
        let packages = catalog("xiangqi").unwrap();
        let mut p = packages.into_iter().find(|p| p.public_download).unwrap();
        let url = download_url(&p).unwrap();
        assert_eq!(
            url,
            format!(
                "https://github.com/Simlym/qidao/releases/download/{}/{}",
                p.release_tag.as_ref().unwrap(),
                p.file_name
            )
        );
        p.public_download = false;
        assert!(download_url(&p).is_err());
    }

    #[test]
    fn catalog_preserves_variant_and_cpu_boundaries() {
        for variant in ["xiangqi", "jieqi"] {
            let entries = catalog(variant).unwrap();
            assert!(entries.iter().any(|p| p.engine_id == "pikafish"));
            if variant == "xiangqi" {
                let fairy = entries
                    .iter()
                    .find(|p| p.engine_id == "fairy-stockfish")
                    .unwrap();
                assert_eq!(fairy.uci_protocol.as_deref(), Some("ucicyclone"));
                assert_eq!(fairy.network_license.as_deref(), Some("CC0-1.0"));
            } else {
                assert!(!entries.iter().any(|p| p.engine_id == "fairy-stockfish"));
            }
            assert!(entries.iter().all(|p| p.variant == variant));
            assert!(compatible(
                &entries[0],
                "windows",
                "x86_64",
                &["sse4.1", "popcnt"]
            ));
            assert!(!compatible(&entries[0], "windows", "x86_64", &[]));
            assert!(!compatible(
                &entries[0],
                "android",
                "aarch64",
                &["sse4.1", "popcnt"]
            ));
        }
        assert!(catalog("../xiangqi").is_err());
    }

    #[test]
    fn verifies_archive_manifest_and_matching_network() {
        let (_root, archive, p) = fixture(None, "xiangqi");
        let stage = tempfile::tempdir().unwrap();
        assert_eq!(
            match_archive(&archive, std::slice::from_ref(&p))
                .unwrap()
                .id,
            p.id
        );
        unpack(&archive, stage.path(), &p, &AtomicBool::new(false)).unwrap();
        fs::write(
            stage.path().join(p.network_path.as_ref().unwrap()),
            b"changed",
        )
        .unwrap();
        assert!(verify_contents(stage.path(), &p, &AtomicBool::new(false)).is_err());
        let mut wrong_hash = p.clone();
        wrong_hash.sha256 = "0".repeat(64);
        assert!(match_archive(&archive, &[wrong_hash]).is_err());
    }

    #[test]
    fn rejects_wrong_variant_even_with_valid_outer_hash() {
        let (_root, archive, p) = fixture(None, "jieqi");
        let stage = tempfile::tempdir().unwrap();
        assert!(unpack(&archive, stage.path(), &p, &AtomicBool::new(false))
            .unwrap_err()
            .contains("棋种"));
    }

    #[test]
    fn rejects_declared_zip_bomb_before_writing_file() {
        let (_root, archive, mut p) = fixture(None, "xiangqi");
        let mut bytes = fs::read(&archive).unwrap();
        let central = bytes.windows(4).position(|w| w == b"PK\x01\x02").unwrap();
        bytes[central + 24..central + 28]
            .copy_from_slice(&((MAX_EXPANDED + 1) as u32).to_le_bytes());
        fs::write(&archive, &bytes).unwrap();
        p.sha256 = hash(&bytes);
        let stage = tempfile::tempdir().unwrap();
        assert!(unpack(&archive, stage.path(), &p, &AtomicBool::new(false)).is_err());
        assert_eq!(fs::read_dir(stage.path()).unwrap().count(), 0);
    }

    #[test]
    fn rejects_zip_symlink_even_with_valid_outer_hash() {
        let (_root, archive, mut p) = fixture(None, "xiangqi");
        let mut bytes = fs::read(&archive).unwrap();
        let central = bytes.windows(4).position(|w| w == b"PK\x01\x02").unwrap();
        bytes[central + 5] = 3;
        bytes[central + 38..central + 42].copy_from_slice(&(0o120777u32 << 16).to_le_bytes());
        fs::write(&archive, &bytes).unwrap();
        p.sha256 = hash(&bytes);
        let stage = tempfile::tempdir().unwrap();
        assert!(unpack(&archive, stage.path(), &p, &AtomicBool::new(false)).is_err());
        assert_eq!(fs::read_dir(stage.path()).unwrap().count(), 0);
    }

    #[test]
    fn rejects_unsafe_duplicate_and_unlisted_zip_paths() {
        for name in [
            "../escaped",
            "/absolute",
            "C:/absolute",
            "a\\b",
            "NUL.txt",
            "trailing.",
            "PIKAFISH.NNUE",
            "extra.exe",
        ] {
            let (_root, archive, p) = fixture(Some((name, b"untrusted")), "xiangqi");
            let stage = tempfile::tempdir().unwrap();
            assert!(
                unpack(&archive, stage.path(), &p, &AtomicBool::new(false)).is_err(),
                "{name}"
            );
        }
    }

    #[test]
    fn cancellation_and_unpublished_download_never_replace_an_old_installation() {
        let (_source, archive, p) = fixture(None, "xiangqi");
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("old-profile"), b"keep").unwrap();
        let cancel = AtomicBool::new(true);
        assert!(
            install_archive(root.path(), &p, &archive, &cancel, |_| panic!(
                "不应开始安装"
            ))
            .is_err()
        );
        assert!(
            download_install(root.path(), &p, &AtomicBool::new(false), |_| panic!(
                "不应下载草稿"
            ))
            .unwrap_err()
            .contains("尚未公开")
        );
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
        assert_eq!(fs::read(root.path().join("old-profile")).unwrap(), b"keep");
    }

    #[test]
    fn cancellation_after_unpack_does_not_commit_version() {
        let (_source, archive, p) = fixture(None, "xiangqi");
        let root = tempfile::tempdir().unwrap();
        let cancel = AtomicBool::new(false);
        let result = install_archive(root.path(), &p, &archive, &cancel, |event| {
            if event.phase == "testing" {
                cancel.store(true, std::sync::atomic::Ordering::Relaxed);
            }
        });
        assert!(result.unwrap_err().contains("取消"));
        assert!(installed(root.path(), &[p]).is_empty());
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 0);
    }

    #[test]
    #[cfg(windows)]
    #[ignore = "需要下载完成的固定 GitHub 测试包"]
    fn real_packages_install_verify_and_detect_changed_weights() {
        let source = PathBuf::from(
            std::env::var("QIDAO_TEST_PACKAGE_DIR").expect("设置 QIDAO_TEST_PACKAGE_DIR"),
        );
        for variant in ["xiangqi", "jieqi"] {
            let packages = catalog(variant).unwrap();
            let p = packages.iter().find(|p| p.release_tag.is_some()).unwrap();
            let root = tempfile::tempdir().unwrap();
            let cancel = AtomicBool::new(false);
            let result =
                install_archive(root.path(), p, &source.join(&p.file_name), &cancel, |_| {})
                    .unwrap();
            assert!(Path::new(&result.engine_path).is_file());
            assert!(Path::new(&result.nnue_path).is_file());
            assert_eq!(installed(root.path(), &packages).len(), 1);
            verify_installation(root.path(), p, &cancel).unwrap();
            // 已存在版本走完整重验，不覆盖重装；权重损坏时拒绝启用。
            fs::write(&result.nnue_path, b"changed").unwrap();
            assert!(verify_installation(root.path(), p, &cancel).is_err());
            assert!(
                install_archive(root.path(), p, &source.join(&p.file_name), &cancel, |_| {})
                    .is_err()
            );
        }
    }

    #[test]
    #[cfg(windows)]
    #[ignore = "需要已构建的固定 Fairy-Stockfish NNUE 测试包"]
    fn real_fairy_package_uses_nnue_and_zero_based_coordinates() {
        let source = PathBuf::from(
            std::env::var("QIDAO_TEST_FAIRY_PACKAGE_DIR")
                .expect("设置 QIDAO_TEST_FAIRY_PACKAGE_DIR"),
        );
        let packages = catalog("xiangqi").unwrap();
        let package_id = std::env::var("QIDAO_TEST_FAIRY_PACKAGE_ID")
            .unwrap_or_else(|_| "xiangqi-fairy-c07e94a5-20261107".to_string());
        let p = packages.iter().find(|p| p.id == package_id).unwrap();
        let root = tempfile::tempdir().unwrap();
        let cancel = AtomicBool::new(false);
        let result =
            install_archive(root.path(), p, &source.join(&p.file_name), &cancel, |_| {}).unwrap();
        assert_eq!(result.package.uci_protocol.as_deref(), Some("ucicyclone"));
        assert_eq!(result.package.network_license.as_deref(), Some("CC0-1.0"));
        verify_installation(root.path(), p, &cancel).unwrap();
        fs::write(&result.nnue_path, b"changed").unwrap();
        assert!(verify_installation(root.path(), p, &cancel).is_err());
    }

    #[test]
    #[cfg(windows)]
    #[ignore = "需要访问正式 GitHub Releases；运行真实匿名下载、安装及重验"]
    fn public_packages_download_install_and_verify() {
        for variant in ["xiangqi", "jieqi"] {
            let packages = catalog(variant).unwrap();
            let p = packages.iter().find(|p| p.public_download).unwrap();
            let root = tempfile::tempdir().unwrap();
            let cancel = AtomicBool::new(false);
            let mut downloaded = false;
            let result = download_install(root.path(), p, &cancel, |event| {
                downloaded |= event.phase == "downloading" && event.downloaded > 0;
            })
            .unwrap();
            assert!(downloaded);
            assert!(Path::new(&result.engine_path).is_file());
            if p.network_path.is_none() {
                assert!(result.nnue_path.is_empty());
                assert!(!Path::new(&result.engine_path)
                    .parent()
                    .unwrap()
                    .join("pikafish.nnue")
                    .exists());
            } else {
                assert!(Path::new(&result.nnue_path).is_file());
            }
            verify_installation(root.path(), p, &cancel).unwrap();
            fs::write(&result.engine_path, b"changed").unwrap();
            assert!(verify_installation(root.path(), p, &cancel).is_err());
        }
    }
}
