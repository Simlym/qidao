package com.xiangqidao.app

import android.os.Bundle
import android.app.Dialog
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.view.Gravity
import android.view.Window
import android.view.WindowManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.activity.OnBackPressedCallback
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.widget.AppCompatButton
import androidx.webkit.ServiceWorkerClientCompat
import androidx.webkit.ServiceWorkerControllerCompat
import androidx.webkit.WebViewFeature
import java.io.ByteArrayInputStream

class MainActivity : TauriActivity() {
    private var appWebView: WebView? = null
    private var backPending = false

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        // 接管系统返回键与手势，先让网页关闭面板或确认离开棋局。
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (backPending) return
                backPending = true
                val webView = appWebView
                if (webView == null) {
                    confirmAppExit()
                    return
                }
                webView.evaluateJavascript(
                    "(() => !window.dispatchEvent(new Event('qidao:back', {cancelable: true})))()"
                ) { handled ->
                    if (handled == "true") backPending = false else confirmAppExit()
                }
            }
        })
    }

    private fun confirmAppExit() {
        // 与应用内确认框使用相同的米白卡片、暖灰描边和棕红主按钮。
        val dialog = Dialog(this)
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(24), dp(24), dp(24))
            background = roundedBackground("#fffdf9", "#e5ddd3", 14)
        }
        card.addView(TextView(this).apply {
            text = "退出棋岛？"
            textSize = 18f
            setTextColor(Color.parseColor("#3f372f"))
            setTypeface(typeface, Typeface.BOLD)
            gravity = Gravity.CENTER
        })
        card.addView(TextView(this).apply {
            text = "确定要退出应用吗？"
            textSize = 14f
            setTextColor(Color.parseColor("#756b60"))
            gravity = Gravity.CENTER
            setPadding(0, dp(12), 0, dp(20))
        })
        val actions = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        fun action(text: String, primary: Boolean, onClick: () -> Unit) = AppCompatButton(this).apply {
            this.text = text
            textSize = 14f
            setTypeface(typeface, Typeface.BOLD)
            isAllCaps = false
            minWidth = 0
            minimumWidth = 0
            minHeight = dp(44)
            minimumHeight = dp(44)
            setPadding(dp(8), dp(8), dp(8), dp(8))
            backgroundTintList = null
            background = RippleDrawable(
                ColorStateList.valueOf(Color.parseColor(if (primary) "#24ffffff" else "#149f432f")),
                roundedBackground(if (primary) "#a94b42" else "#f7f3ed", if (primary) "#a94b42" else "#d6cec4", 10),
                null
            )
            setTextColor(Color.parseColor(if (primary) "#ffffff" else "#4c433a"))
            stateListAnimator = null
            setOnClickListener { onClick() }
        }
        actions.addView(action("取消", false) { dialog.dismiss() }, LinearLayout.LayoutParams(0, -2, 1f).apply { marginEnd = dp(10) })
        actions.addView(action("退出", true) { dialog.dismiss(); finish() }, LinearLayout.LayoutParams(0, -2, 1f))
        card.addView(actions)
        dialog.setContentView(card)
        dialog.setCanceledOnTouchOutside(true)
        dialog.setOnDismissListener { backPending = false }
        dialog.show()
        dialog.window?.apply {
            setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
            setDimAmount(0.45f)
            setLayout(minOf(dp(360), resources.displayMetrics.widthPixels - dp(32)), WindowManager.LayoutParams.WRAP_CONTENT)
        }
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density + 0.5f).toInt()

    private fun roundedBackground(fill: String, border: String, radius: Int) = GradientDrawable().apply {
        setColor(Color.parseColor(fill))
        setStroke(dp(1), Color.parseColor(border))
        cornerRadius = dp(radius).toFloat()
    }

    override fun onWebViewCreate(webView: WebView) {
        super.onWebViewCreate(webView)
        appWebView = webView
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
