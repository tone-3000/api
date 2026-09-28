package com.example.tone3000.t3k

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import com.example.tone3000.ui.ExampleTheme

/**
 * Process-wide WebView for TONE3000 OAuth and the hosted Select / Load Tone
 * UI. Cookies and localStorage live in the app's [CookieManager] (flushed to
 * disk), so a sign-in survives restarts; reusing one WebView also keeps
 * sessionStorage for the rest of the launch.
 */
object T3KWebSession {
    @Volatile var onRedirect: ((Uri) -> Unit)? = null
    private var webView: WebView? = null

    @SuppressLint("SetJavaScriptEnabled")
    fun obtain(context: Context): WebView = webView ?: synchronized(this) {
        webView ?: WebView(context.applicationContext).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.javaScriptCanOpenWindowsAutomatically = true
            // The hosted catalog's preview players start on a user tap.
            settings.mediaPlaybackRequiresUserGesture = false
            CookieManager.getInstance().setAcceptCookie(true)
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                    intercept(request.url)

                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    if (request.isForMainFrame) intercept(request.url)
                }
            }
        }.also { webView = it }
    }

    fun detach() {
        webView?.let { (it.parent as? ViewGroup)?.removeView(it) }
        CookieManager.getInstance().flush()
    }

    private fun intercept(uri: Uri): Boolean {
        if (uri.scheme != T3KConfig.redirectScheme) return false
        onRedirect?.invoke(uri)
        return true
    }
}

/** In-app TONE3000 browser. Close / back out of the first page cancels. */
class AuthBrowserActivity : ComponentActivity() {

    private var delivered = false

    @OptIn(ExperimentalMaterial3Api::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val url = intent.getStringExtra(EXTRA_URL)
        if (url.isNullOrBlank()) {
            finish()
            return
        }

        T3KWebSession.onRedirect = { uri -> runOnUiThread { deliver(uri) } }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val web = T3KWebSession.obtain(this@AuthBrowserActivity)
                if (web.canGoBack()) web.goBack() else finish()
            }
        })

        setContent {
            ExampleTheme {
                Scaffold(
                    topBar = {
                        TopAppBar(
                            title = { Text("TONE3000") },
                            navigationIcon = {
                                IconButton(onClick = { finish() }) {
                                    Icon(Icons.Filled.Close, contentDescription = "Close")
                                }
                            },
                        )
                    },
                ) { padding ->
                    Box(Modifier.padding(padding).fillMaxSize()) {
                        AndroidView(
                            modifier = Modifier.fillMaxSize(),
                            factory = { context ->
                                T3KWebSession.obtain(context).also { web ->
                                    (web.parent as? ViewGroup)?.removeView(web)
                                    web.layoutParams = FrameLayout.LayoutParams(
                                        ViewGroup.LayoutParams.MATCH_PARENT,
                                        ViewGroup.LayoutParams.MATCH_PARENT,
                                    )
                                    web.loadUrl(url)
                                }
                            },
                        )
                    }
                }
            }
        }
    }

    override fun onDestroy() {
        T3KWebSession.onRedirect = null
        T3KWebSession.detach()
        if (!delivered && isFinishing) AuthManager.deliver(null)
        super.onDestroy()
    }

    private fun deliver(uri: Uri) {
        if (delivered) return
        delivered = true
        CookieManager.getInstance().flush()
        AuthManager.deliver(uri)
        finish()
    }

    companion object {
        private const val EXTRA_URL = "auth_url"

        fun start(context: Context, url: Uri) {
            context.startActivity(
                Intent(context, AuthBrowserActivity::class.java).apply {
                    putExtra(EXTRA_URL, url.toString())
                    if (context !is Activity) addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                },
            )
        }
    }
}
