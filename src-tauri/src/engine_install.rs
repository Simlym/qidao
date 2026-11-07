use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use tauri::{ipc::Channel, Manager};
use xiangqidao_engine_installer as installer;

#[derive(Default)]
pub struct InstallState {
    busy: AtomicBool,
    cancel: AtomicBool,
}

struct BusyGuard(Arc<InstallState>);
impl Drop for BusyGuard {
    fn drop(&mut self) {
        self.0.busy.store(false, Ordering::Release);
    }
}

fn root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("engines")
        .join("xiangqi")
        .join("fairy-stockfish"))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallInfo {
    catalog: installer::Catalog,
    supported_artifacts: Vec<installer::Artifact>,
    recommended_artifact_id: Option<String>,
    installed: Vec<installer::Installation>,
    busy: bool,
}

#[tauri::command]
pub fn native_engine_install_info(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<InstallState>>,
) -> Result<InstallInfo, String> {
    let catalog = installer::catalog()?;
    let platform = super::platform_info();
    let supported_artifacts =
        installer::compatible(&catalog, platform.os, platform.arch, &platform.features)
            .into_iter()
            .cloned()
            .collect::<Vec<_>>();
    Ok(InstallInfo {
        recommended_artifact_id: supported_artifacts
            .first()
            .map(|artifact| artifact.id.clone()),
        installed: installer::installed(&root(&app)?)?,
        catalog,
        supported_artifacts,
        busy: state.busy.load(Ordering::Acquire),
    })
}

#[tauri::command]
pub async fn install_native_engine(
    artifact_id: String,
    progress: Channel<installer::Progress>,
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<InstallState>>,
) -> Result<installer::Installation, String> {
    let catalog = installer::catalog()?;
    let platform = super::platform_info();
    let artifact = installer::compatible(&catalog, platform.os, platform.arch, &platform.features)
        .into_iter()
        .find(|artifact| artifact.id == artifact_id)
        .cloned()
        .ok_or("该引擎构建不支持当前系统或 CPU，请使用手动导入")?;
    if state
        .busy
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err("已有引擎安装或检测正在进行".into());
    }
    let state = state.inner().clone();
    let guard = BusyGuard(state.clone());
    state.cancel.store(false, Ordering::Relaxed);
    let root = root(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        installer::install(&catalog, &artifact, &root, &state.cancel, |event| {
            let _ = progress.send(event);
        })
    })
    .await
    .map_err(|e| format!("安装任务异常：{e}"))?
}

#[tauri::command]
pub fn cancel_native_engine_install(state: tauri::State<'_, Arc<InstallState>>) {
    state.cancel.store(true, Ordering::Relaxed);
}

#[tauri::command]
pub async fn verify_native_engine_installation(
    version: String,
    artifact_id: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<InstallState>>,
) -> Result<installer::Installation, String> {
    if !cfg!(target_os = "windows") || !cfg!(target_arch = "x86_64") {
        return Err("当前仅支持 Windows x64 引导安装".into());
    }
    if state
        .busy
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err("已有引擎安装或检测正在进行".into());
    }
    let state = state.inner().clone();
    let guard = BusyGuard(state.clone());
    state.cancel.store(false, Ordering::Relaxed);
    let root = root(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        installer::verify_installation(&root, &version, &artifact_id, &state.cancel)
    })
    .await
    .map_err(|e| format!("引擎检测异常：{e}"))?
}

#[tauri::command]
pub fn open_engine_install_link(
    link: String,
    variant: Option<String>,
    package_id: Option<String>,
) -> Result<(), String> {
    let url = if let Some(id) = package_id {
        let package = installer::packages::catalog(variant.as_deref().ok_or("缺少引擎棋种")?)?
            .into_iter()
            .find(|p| p.id == id)
            .ok_or("未知的引擎包")?;
        match link.as_str() {
            "source" => package.source_url,
            "license" => package.license_url,
            "network" => package.network_license_url.unwrap_or_else(|| {
                "https://github.com/official-pikafish/Networks/blob/master/README.md".into()
            }),
            _ => return Err("未知的引擎链接".into()),
        }
    } else {
        let catalog = installer::catalog()?;
        match link.as_str() {
            "source" => catalog.source_url,
            "license" => catalog.license_url,
            _ => return Err("未知的引擎链接".into()),
        }
    };
    #[cfg(target_os = "windows")]
    {
        // URL 仅来自随包清单，不经 shell 拼接。
        use super::WindowsCommandExt;
        std::process::Command::new("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", &url])
            .creation_flags_for_windows()
            .spawn()
            .map_err(|e| format!("打开浏览器失败：{e}"))?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = url;
        Err("请在浏览器中查看安装清单中的来源与许可链接".into())
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageInfo {
    packages: Vec<installer::packages::Package>,
    installed: Vec<installer::packages::Installation>,
    busy: bool,
}

fn package_base(app: &tauri::AppHandle, variant: &str) -> Result<PathBuf, String> {
    // 先由随包清单校验棋种，目录不接受前端自由拼接。
    installer::packages::catalog(variant)?;
    Ok(app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("engines")
        .join(variant))
}

#[tauri::command]
pub fn native_package_info(
    variant: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<InstallState>>,
) -> Result<PackageInfo, String> {
    let packages = installer::packages::catalog(&variant)?;
    let platform = super::platform_info();
    let base = package_base(&app, &variant)?;
    let installed = packages
        .iter()
        .flat_map(|p| {
            installer::packages::installed(&base.join(&p.engine_id), std::slice::from_ref(p))
        })
        .collect();
    Ok(PackageInfo {
        packages: packages
            .into_iter()
            .filter(|p| {
                installer::packages::compatible(p, platform.os, platform.arch, &platform.features)
            })
            .collect(),
        installed,
        busy: state.busy.load(Ordering::Acquire),
    })
}

#[tauri::command]
pub async fn manage_native_package(
    variant: String,
    action: String,
    package_id: Option<String>,
    archive_path: Option<String>,
    progress: Channel<installer::Progress>,
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<InstallState>>,
) -> Result<installer::packages::Installation, String> {
    let platform = super::platform_info();
    let packages: Vec<_> = installer::packages::catalog(&variant)?
        .into_iter()
        .filter(|p| {
            installer::packages::compatible(p, platform.os, platform.arch, &platform.features)
        })
        .collect();
    if packages.is_empty() {
        return Err("当前系统或 CPU 不支持已登记的引擎包".into());
    }
    if !matches!(action.as_str(), "import" | "download" | "verify") {
        return Err("未知的引擎包操作".into());
    }
    let base = package_base(&app, &variant)?;
    if state
        .busy
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err("已有引擎安装或检测正在进行".into());
    }
    let state = state.inner().clone();
    let guard = BusyGuard(state.clone());
    state.cancel.store(false, Ordering::Relaxed);
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let package = if action == "import" {
            installer::packages::match_archive(
                std::path::Path::new(archive_path.as_ref().ok_or("请选择 ZIP 引擎包")?),
                &packages,
            )?
        } else {
            packages
                .into_iter()
                .find(|p| Some(&p.id) == package_id.as_ref())
                .ok_or("引擎包不在固定版本清单中")?
        };
        let report = |event| {
            let _ = progress.send(event);
        };
        let root = base.join(&package.engine_id);
        match action.as_str() {
            "import" => installer::packages::install_archive(
                &root,
                &package,
                std::path::Path::new(archive_path.as_ref().unwrap()),
                &state.cancel,
                report,
            ),
            "download" => {
                installer::packages::download_install(&root, &package, &state.cancel, report)
            }
            _ => installer::packages::verify_installation(&root, &package, &state.cancel),
        }
    })
    .await
    .map_err(|e| format!("引擎包安装任务异常：{e}"))?
}
