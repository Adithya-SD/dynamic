package dev.dynamic.watch

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Color
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Bundle
import android.view.MotionEvent
import android.view.WindowManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebView

/**
 * Dynamic for Wear OS: the full engine (index.html?watch) in a WebView, plus the accelerometer (a wrist tilt moves the
 * picture) and the microphone permission. Rotary input is forwarded to the page as wheel events. If the watch has no
 * WebGL2 the page opens watch.html (Dynamic Lite) instead.
 */
class WatchActivity : Activity() {
    private lateinit var web: WebView
    private var micRequest: PermissionRequest? = null
    private var tiltT = 0L
    private var ready = false

    private val tilt = object : SensorEventListener {
        override fun onSensorChanged(e: SensorEvent) {
            val ms = e.timestamp / 1_000_000L
            if (ms - tiltT < 30 || !ready) return
            tiltT = ms
            if (e.sensor.type == Sensor.TYPE_ACCELEROMETER) {
                web.evaluateJavascript("window.__nativeTilt&&window.__nativeTilt(${e.values[0]},${e.values[1]},${e.values[2]})", null)
            } else {
                val x = e.values[0]; val y = e.values[1]; val z = e.values[2]
                val w = if (e.values.size > 3) e.values[3] else Math.sqrt(Math.max(0.0, 1.0 - (x * x + y * y + z * z).toDouble())).toFloat()
                web.evaluateJavascript("window.__nativeQuat&&window.__nativeQuat($x,$y,$z,$w)", null)
            }
        }
        override fun onAccuracyChanged(s: Sensor?, a: Int) {}
    }

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        web = WebView(this)
        web.setBackgroundColor(Color.rgb(5, 6, 10))
        web.overScrollMode = WebView.OVER_SCROLL_NEVER
        web.isHorizontalScrollBarEnabled = false
        web.isVerticalScrollBarEnabled = false
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = true
        }
        web.webChromeClient = object : WebChromeClient() {
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
        web.webViewClient = object : android.webkit.WebViewClient() {
            override fun onPageFinished(v: WebView, url: String) { ready = true }
        }
        setContentView(web)
        web.loadUrl("file:///android_asset/index.html?watch")
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
            web.evaluateJavascript("window.dispatchEvent(new WheelEvent('wheel',{deltaY:${if (d > 0) 1 else -1}}))", null)
            return true
        }
        return super.onGenericMotionEvent(e)
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        (getSystemService(Context.SENSOR_SERVICE) as SensorManager).let { sm ->
            (sm.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR) ?: sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) ?: sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER))?.let { sm.registerListener(tilt, it, SensorManager.SENSOR_DELAY_GAME) }
        }
    }

    override fun onPause() {
        (getSystemService(Context.SENSOR_SERVICE) as SensorManager).unregisterListener(tilt)
        web.onPause()
        super.onPause()
    }

    override fun onDestroy() { web.destroy(); super.onDestroy() }
}
