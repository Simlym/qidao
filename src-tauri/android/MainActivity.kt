package com.xiangqidao.app

import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.webkit.ServiceWorkerClientCompat
import androidx.webkit.ServiceWorkerControllerCompat
import androidx.webkit.WebViewFeature
import java.io.ByteArrayInputStream

class MainActivity : TauriActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
    }

    override fun onWebViewCreate(webView: WebView) {
        super.onWebViewCreate(webView)
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE)
            || !WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_SHOULD_INTERCEPT_REQUEST)) return
        val webViewId = (webView as RustWebView).id
        // Service Worker 脚本请求不经过普通 WebViewClient，必须单独接入应用资源处理器。
        // 同一处理器也服务离线壳的 fetch，否则升级后新哈希的脚本会落入网络而白屏。
        // 只接受应用入口与构建资源；不代理业务 API、用户引擎路径或外部来源。
        ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(object : ServiceWorkerClientCompat() {
            override fun shouldInterceptRequest(request: WebResourceRequest): WebResourceResponse? {
                val uri = request.url
                val bundledAsset = uri.path in setOf("/", "/index.html", "/sw.js", "/manifest.webmanifest", "/icon.svg")
                    || Regex("^/assets/[A-Za-z0-9_.-]+$").matches(uri.path ?: "")
                if (request.method != "GET" || uri.host != "tauri.localhost"
                    || uri.scheme !in listOf("http", "https") || !bundledAsset
                    || uri.port != -1 || uri.query != null) return null
                val response = Rust.handleRequest(webViewId, request, true)
                    ?: return WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", emptyMap(), ByteArrayInputStream(byteArrayOf()))
                response.responseHeaders = (response.responseHeaders ?: emptyMap()) + mapOf(
                    "Service-Worker-Allowed" to "/",
                    "Cache-Control" to "no-cache"
                )
                return response
            }
        })
    }
}
