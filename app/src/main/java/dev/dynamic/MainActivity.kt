package dev.dynamic

import android.Manifest
import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.provider.MediaStore
import android.provider.Settings
import android.util.Base64
import android.util.Log
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.OutputStream
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Dynamic for Android: one engine, shared with the web app (docs/index.html is bundled as an asset).
 * This shell adds what a browser tab cannot do: hear other apps' audio, read Spotify's session, vibrate,
 * save files to the gallery, and share presets through the system share sheet.
 */
open class MainActivity : Activity() {
    /** Page to load; Dynamic Pad overrides it. */
    protected open val page = "index.html"
    /** Dynamic Pad keeps listening (and rumbling) when the screen is off or another app is in front. */
    protected open val keepAudio = false

    private lateinit var web: WebView
    private val main = Handler(Looper.getMainLooper())
    private var chooser: ValueCallback<Array<Uri>>? = null
    private var micRequest: PermissionRequest? = null
    private var captureId = -1L
    private var bands: Bands? = null
    private val batch = FloatArray(24)
    private val batchOnsets = FloatArray(24)
    private var batchCount = 0
    private val sending = AtomicBoolean(false)
    private var save: SaveJob? = null
    private var artKey = 0
    private var artUrl = ""
    private var pendingImport: String? = null
    private var pageReady = false

    private val spotifyListener: (SpotifyState) -> Unit = { s -> main.post { pushSpotify(s) } }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        if (Build.VERSION.SDK_INT >= 28) window.attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        WebView.setWebContentsDebuggingEnabled((applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0)

        web = WebView(this)
        web.setBackgroundColor(0xFF05060A.toInt())
        web.overScrollMode = View.OVER_SCROLL_NEVER
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            cacheMode = WebSettings.LOAD_DEFAULT
            textZoom = 100
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) { runOnUiThread { handleWebPermission(request) } }
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                chooser?.onReceiveValue(null)
                chooser = callback
                return try { startActivityForResult(params.createIntent(), REQ_FILE); true } catch (_: Exception) { chooser = null; false }
            }
            override fun onConsoleMessage(m: android.webkit.ConsoleMessage): Boolean {
                if (m.messageLevel() == android.webkit.ConsoleMessage.MessageLevel.ERROR) Log.e("Dynamic", "${m.message()} (${m.sourceId()}:${m.lineNumber()})")
                return true
            }
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.scheme == "file") return false
                try { startActivity(Intent(Intent.ACTION_VIEW, request.url)) } catch (_: Exception) { }
                return true
            }
            override fun onPageFinished(view: WebView, url: String) { pageReady = true; flushImport() }
        }
        web.addJavascriptInterface(Bridge(), "DynamicNative")
        setContentView(web)
        immersive()
        acceptIntent(intent)
        web.loadUrl("file:///android_asset/$page")
    }

    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); acceptIntent(intent) }

    private fun acceptIntent(intent: Intent?) {
        if (intent?.action == Intent.ACTION_SEND && intent.type == "text/plain") {
            pendingImport = intent.getStringExtra(Intent.EXTRA_TEXT)
            flushImport()
        }
    }

    private fun flushImport() {
        val text = pendingImport ?: return
        if (!pageReady) return
        pendingImport = null
        web.evaluateJavascript("window.__importPreset&&window.__importPreset(${JSONObject.quote(text)})", null)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) { super.onWindowFocusChanged(hasFocus); if (hasFocus) immersive() }

    @Suppress("DEPRECATION")
    private fun immersive() {
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let {
                it.hide(WindowInsets.Type.systemBars())
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LAYOUT_STABLE or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        }
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        NowPlayingService.listeners.add(spotifyListener)
        pushSpotify(NowPlayingService.latest)
    }

    override fun onPause() {
        NowPlayingService.listeners.remove(spotifyListener)
        web.onPause()
        super.onPause()
    }

    override fun onStop() {
        if (!keepAudio) stopCapture()
        super.onStop()
    }

    override fun onDestroy() {
        stopCapture()
        PadOut.release()
        web.destroy()
        super.onDestroy()
    }

    @Deprecated("Back closes the settings sheet first, then the app")
    override fun onBackPressed() {
        web.evaluateJavascript("(typeof UI!=='undefined'&&UI.open)?(UI.shut(),1):0") { if (it != "1") finish() }
    }

    // ---- permissions: microphone for the web app, projection consent for phone audio ----

    private fun handleWebPermission(request: PermissionRequest) {
        val wantsAudio = request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
        if (!wantsAudio) { request.deny(); return }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
        } else {
            micRequest = request
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQ_MIC)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        val ok = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
        when (requestCode) {
            REQ_MIC -> { val r = micRequest; micRequest = null; if (ok) r?.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) else r?.deny() }
            REQ_CAPTURE_PERM -> if (ok) askProjection() else audioStatus(false, "Microphone permission is needed to hear phone audio.")
        }
    }

    private fun askProjection() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_NOTIFY)
        startActivityForResult(getSystemService(MediaProjectionManager::class.java).createScreenCaptureIntent(), REQ_CAPTURE)
    }

    @Deprecated("Result routing for file picker and projection consent")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        when (requestCode) {
            REQ_FILE -> { chooser?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data)); chooser = null }
            REQ_CAPTURE -> if (resultCode == RESULT_OK && data != null) beginCapture(resultCode, data) else audioStatus(false, "Phone audio was not allowed.")
        }
    }

    // ---- phone audio: PCM -> 24 bands (same analysis as the web app) -> JS ----

    private fun beginCapture(resultCode: Int, data: Intent) {
        stopCapture()
        val mono = FloatArray(256)
        batchCount = 0
        val analyzer = Bands(48000) { levels, onsets -> report(levels, onsets) }
        bands = analyzer
        val run = PlaybackCaptureService.Run(
            onStatus = { text -> main.post { audioStatus(text.startsWith("Listening") || text.startsWith("No audio"), text) } },
            onPcm = { buf, bytes ->
                var i = 0
                val frames = bytes / 4
                while (i < frames) {
                    val n = minOf(mono.size, frames - i)
                    for (j in 0 until n) {
                        val o = (i + j) * 4
                        mono[j] = (buf.getShort(o) + buf.getShort(o + 2)) / 65536f
                    }
                    analyzer.push(mono, n)
                    i += n
                }
            }
        )
        try { captureId = PlaybackCaptureService.begin(this, resultCode, data, run) }
        catch (e: Exception) { audioStatus(false, "Phone audio unavailable: ${e.message}") }
    }

    private fun stopCapture() {
        if (captureId >= 0) { PlaybackCaptureService.end(captureId); captureId = -1; audioStatus(false, "Pick a source. Low notes draw near the centre, high notes near the edge; loudness drives the motion.") }
        bands = null
    }

    /** Called ~375 times a second from the capture thread; every third report is forwarded (about 125 Hz). */
    private fun report(levels: FloatArray, onsets: FloatArray) {
        PadOut.feed(levels, onsets)   // controller rumble at the full analysis rate, independent of the page
        for (b in 0 until 24) { batch[b] = levels[b]; if (onsets[b] > batchOnsets[b]) batchOnsets[b] = onsets[b] }
        if (++batchCount < 3) return
        batchCount = 0
        if (!sending.compareAndSet(false, true)) { batchOnsets.fill(0f); return }
        val sb = StringBuilder(640).append("window.__nativeBands&&__nativeBands([")
        for (b in 0 until 24) { if (b > 0) sb.append(','); sb.append((batch[b] * 1000).toInt() / 1000f) }
        sb.append("],[")
        for (b in 0 until 24) { if (b > 0) sb.append(','); sb.append((batchOnsets[b] * 1000).toInt() / 1000f) }
        sb.append("])")
        batchOnsets.fill(0f)
        val js = sb.toString()
        web.post { web.evaluateJavascript(js, null); sending.set(false) }
    }

    private fun audioStatus(on: Boolean, text: String) {
        web.evaluateJavascript("window.__nativeAudio&&__nativeAudio($on,${JSONObject.quote(text)})", null)
    }

    // ---- Spotify session -> JS ----

    private fun pushSpotify(s: SpotifyState) {
        val access = Settings.Secure.getString(contentResolver, "enabled_notification_listeners")?.contains(packageName) == true
        val o = JSONObject()
        o.put("connected", s.connected)
        o.put("playing", s.playing)
        o.put("positionMs", s.positionMs)
        o.put("durationMs", s.durationMs)
        o.put("status", when {
            !access -> "Tap Allow access, switch on Dynamic, then play something in Spotify."
            !s.connected -> "Open Spotify and play something."
            s.playing -> "Playing in Spotify"
            else -> "Paused in Spotify"
        })
        if (s.connected) o.put("track", JSONObject().put("title", s.title ?: "").put("artist", s.artist ?: ""))
        val bmp = s.artwork
        if (bmp != null) {
            val key = bmp.generationId
            if (key != artKey || artUrl.isEmpty()) { artKey = key; artUrl = dataUrl(bmp) }
            o.put("artwork", artUrl)
        }
        web.evaluateJavascript("window.__nativeSpotify&&__nativeSpotify($o)", null)
    }

    private fun dataUrl(bmp: Bitmap): String {
        val size = 160
        val scaled = if (bmp.width > size) Bitmap.createScaledBitmap(bmp, size, size * bmp.height / bmp.width, true) else bmp
        val out = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.JPEG, 82, out)
        return "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }

    // ---- saving images and video to the gallery, chunk by chunk ----

    private class SaveJob(val uri: Uri, val stream: OutputStream, val where: String)

    private inner class Bridge {
        @JavascriptInterface fun haptic(ms: Int) {
            val v = getSystemService(Vibrator::class.java) ?: return
            if (v.hasVibrator()) v.vibrate(VibrationEffect.createOneShot(ms.coerceIn(1, 200).toLong(), VibrationEffect.DEFAULT_AMPLITUDE))
        }

        @JavascriptInterface fun startPlaybackCapture() = runOnUiThread {
            stopCapture()
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQ_CAPTURE_PERM)
            else askProjection()
        }

        @JavascriptInterface fun stopPlaybackCapture() = runOnUiThread { stopCapture() }

        @JavascriptInterface fun padRumble(strong: Float, weak: Float) = PadOut.rumble(strong, weak)
        @JavascriptInterface fun padLight(argb: Int) = PadOut.light(argb)
        @JavascriptInterface fun padLightCount(): Int = PadOut.lightCount()
        @JavascriptInterface fun padName(): String = PadOut.name()
        /** mode 0 off, 1 music, 2 beats: used by the native rumble that runs while phone audio is captured. */
        @JavascriptInterface fun padConfig(mode: Int, gain: Float) { PadOut.mode = mode; PadOut.gain = gain }

        @JavascriptInterface fun spotify(action: String, positionMs: Long) { NowPlayingService.command(action, positionMs) }

        @JavascriptInterface fun openNotificationAccess() = runOnUiThread {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }

        @JavascriptInterface fun share(text: String) = runOnUiThread {
            startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), "Share preset"))
        }

        @JavascriptInterface fun copy(text: String) = runOnUiThread {
            getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Dynamic preset", text))
        }

        @JavascriptInterface fun beginSave(name: String, mime: String) {
            try {
                val video = mime.startsWith("video")
                val values = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, name.replace(Regex("[^A-Za-z0-9._-]"), "_"))
                    put(MediaStore.MediaColumns.MIME_TYPE, mime)
                    put(MediaStore.MediaColumns.RELATIVE_PATH, (if (video) Environment.DIRECTORY_MOVIES else Environment.DIRECTORY_PICTURES) + "/Dynamic")
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }
                val collection = if (video) MediaStore.Video.Media.EXTERNAL_CONTENT_URI else MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                val uri = contentResolver.insert(collection, values) ?: return
                val stream = contentResolver.openOutputStream(uri) ?: return
                save = SaveJob(uri, stream, if (video) "Movies/Dynamic" else "Pictures/Dynamic")
            } catch (e: Exception) { Log.e("Dynamic", "save failed", e); save = null }
        }

        @JavascriptInterface fun saveChunk(b64: String) {
            try { save?.stream?.write(Base64.decode(b64, Base64.DEFAULT)) } catch (e: Exception) { Log.e("Dynamic", "save chunk failed", e) }
        }

        @JavascriptInterface fun endSave(): String {
            val job = save ?: return "Could not save the file."
            save = null
            return try {
                job.stream.close()
                contentResolver.update(job.uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
                "Saved to ${job.where}"
            } catch (e: Exception) { "Could not save the file." }
        }
    }

    private companion object {
        const val REQ_FILE = 11
        const val REQ_CAPTURE = 12
        const val REQ_MIC = 13
        const val REQ_CAPTURE_PERM = 14
        const val REQ_NOTIFY = 15
    }
}
