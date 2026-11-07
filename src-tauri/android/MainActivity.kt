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
        // 仅处理本应用固定脚本，其他来源及业务请求继续使用 WebView 默认网络行为。
        ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(object : ServiceWorkerClientCompat() {
            override fun shouldInterceptRequest(request: WebResourceRequest): WebResourceResponse? {
                val uri = request.url
                if (request.method != "GET" || uri.host != "tauri.localhost"
                    || uri.scheme !in listOf("http", "https") || uri.path != "/sw.js"
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
