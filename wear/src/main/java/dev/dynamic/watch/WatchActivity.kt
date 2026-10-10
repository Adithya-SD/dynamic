package dev.dynamic.watch

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.WindowManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.widget.TextView

/**
 * Dynamic for Wear OS: the full engine (index.html?watch) in a WebView, plus the accelerometer (a wrist tilt moves the
 * picture) and the microphone permission. Rotary input is forwarded to the page as wheel events. If the watch has no
 * WebGL2 the page opens watch.html (Dynamic Lite) instead.
 */
class WatchActivity : Activity() {
    private var web: WebView? = null
    private var hostLaunched = false
    private var micRequest: PermissionRequest? = null
    private var tiltT = 0L
    private var ready = false

    private val tilt = object : SensorEventListener {
        override fun onSensorChanged(e: SensorEvent) {
            val ms = e.timestamp / 1_000_000L
            if (ms - tiltT < 30 || !ready) return
            tiltT = ms
            if (e.sensor.type == Sensor.TYPE_ACCELEROMETER) {
                web?.evaluateJavascript("window.__nativeTilt&&window.__nativeTilt(${e.values[0]},${e.values[1]},${e.values[2]})", null)
            } else {
                val x = e.values[0]; val y = e.values[1]; val z = e.values[2]
                val w = if (e.values.size > 3) e.values[3] else Math.sqrt(Math.max(0.0, 1.0 - (x * x + y * y + z * z).toDouble())).toFloat()
                web?.evaluateJavascript("window.__nativeQuat&&window.__nativeQuat($x,$y,$z,$w)", null)
            }
        }
        override fun onAccuracyChanged(s: Sensor?, a: Int) {}
    }

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val w = try { WebView(this) } catch (e: Throwable) { null }   // a watch can come without any WebView provider
        if (w == null) { showHost(); return }
        web = w
        w.setBackgroundColor(Color.rgb(5, 6, 10))
        w.overScrollMode = WebView.OVER_SCROLL_NEVER
        w.isHorizontalScrollBarEnabled = false
        w.isVerticalScrollBarEnabled = false
        with(w.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = true
        }
        w.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(r: PermissionRequest) {
                runOnUiThread {
                    if (!r.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) { r.deny(); return@runOnUiThread }
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        r.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                    } else {
                        micRequest = r
                        requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 1)
                    }
                }
            }
        }
        w.webViewClient = object : android.webkit.WebViewClient() {
            override fun onPageFinished(v: WebView, url: String) { ready = true }
        }
        setContentView(w)
        w.loadUrl("file:///android_asset/index.html?watch")
    }

    /**
     * No WebView on this watch: the app serves its own bundled engine on 127.0.0.1 (ServerService) and opens it in the watch's
     * browser, full screen. Tapping the screen here opens it again after backing out.
     */
    private fun showHost() {
        val t = TextView(this)
        t.text = "Dynamic" + System.lineSeparator() + "tap to open"
        t.setTextColor(Color.WHITE); t.gravity = Gravity.CENTER; t.textSize = 16f
        t.setBackgroundColor(Color.rgb(5, 6, 10))
        t.setOnClickListener { openInBrowser() }
        setContentView(t)
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 2)
        startForegroundService(Intent(this, ServerService::class.java))
    }

    private fun openInBrowser() {
        startForegroundService(Intent(this, ServerService::class.java))
        Handler(Looper.getMainLooper()).postDelayed({
            val uri = Uri.parse("http://127.0.0.1:${ServerService.PORT}/index.html?watch")
            val i = Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try { startActivity(Intent(i).setPackage("com.sec.android.app.sbrowser")) } catch (e: Exception) { try { startActivity(i) } catch (e2: Exception) { } }
        }, 700)
    }

    override fun onStart() {
        super.onStart()
        if (web == null && !hostLaunched) { hostLaunched = true; openInBrowser() }
    }

    override fun onRequestPermissionsResult(code: Int, p: Array<out String>, g: IntArray) {
        super.onRequestPermissionsResult(code, p, g)
        val r = micRequest ?: return
        micRequest = null
        if (g.isNotEmpty() && g[0] == PackageManager.PERMISSION_GRANTED) r.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) else r.deny()
    }

    /** Rotary crown / bezel → wheel event in the page. */
    override fun onGenericMotionEvent(e: MotionEvent): Boolean {
        if (e.action == MotionEvent.ACTION_SCROLL && e.isFromSource(android.view.InputDevice.SOURCE_ROTARY_ENCODER)) {
            val d = -e.getAxisValue(MotionEvent.AXIS_SCROLL)
            web?.evaluateJavascript("window.dispatchEvent(new WheelEvent('wheel',{deltaY:${if (d > 0) 1 else -1}}))", null)
            return true
        }
        return super.onGenericMotionEvent(e)
    }

    override fun onResume() {
        super.onResume()
        web?.onResume()
        if (web == null) return
        (getSystemService(Context.SENSOR_SERVICE) as SensorManager).let { sm ->
            (sm.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR) ?: sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) ?: sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER))?.let { sm.registerListener(tilt, it, SensorManager.SENSOR_DELAY_GAME) }
        }
    }

    override fun onPause() {
        (getSystemService(Context.SENSOR_SERVICE) as SensorManager).unregisterListener(tilt)
        web?.onPause()
        super.onPause()
    }

    override fun onDestroy() { web?.destroy(); super.onDestroy() }
}
