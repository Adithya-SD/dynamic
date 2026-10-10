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
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.opengl.GLSurfaceView
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.Choreographer
import android.view.Gravity
import android.view.InputDevice
import android.view.MotionEvent
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.sqrt

/**
 * Dynamic for Wear OS. The phone's engine runs natively (NativeEngine: QuickJS + OpenGL ES, no WebView, no browser) and this
 * activity is the watch around it: a GPU surface, touch (drag draws, double-tap next preset, two fingers next colour, hold for the
 * menu), the crown, wrist tilt, the microphone and haptics.
 */
class WatchActivity : Activity(), NativeEngine.Host, WatchUi.Actions {
    private val main = Handler(Looper.getMainLooper())
    private lateinit var glView: GLSurfaceView
    private lateinit var ui: WatchUi
    private lateinit var splash: TextView

    // engine state as last reported (read on the UI thread, written on the render thread)
    @Volatile private var ready = false
    @Volatile private var state = JSONObject()
    @Volatile private var presets = JSONArray()
    @Volatile private var palettes = JSONArray()
    private var screenW = 450
    private var screenH = 450

    // frames: the render thread draws on request, paced to a target rate
    private val frameCb = object : Choreographer.FrameCallback {
        override fun doFrame(t: Long) {
            if (!running) return
            if (t - lastFrame >= interval - 3_000_000L) { lastFrame = t; glView.requestRender() }
            Choreographer.getInstance().postFrameCallback(this)
        }
    }
    private var running = false
    private var lastFrame = 0L
    private var interval = 1_000_000_000L / 30

    // gestures
    private var downAt = 0L
    private var downX = 0f
    private var downY = 0f
    private var moved = false
    private var lastTap = 0L
    private var swallow = false
    private val activeIds = HashSet<Int>()
    private val longPress = Runnable {
        swallow = true
        for (id in activeIds) glView.queueEvent { NativeEngine.call("__pointer", 3.0, id.toDouble(), 0.0, 0.0) }
        activeIds.clear()
        haptic(20)
        ui.openMenu()
    }
    private var lastCrown = 0L

    // sensors
    private var tiltT = 0L
    private val tilt = object : SensorEventListener {
        override fun onSensorChanged(e: SensorEvent) {
            if (!ready) return
            val ms = e.timestamp / 1_000_000L
            if (ms - tiltT < 30) return
            tiltT = ms
            if (e.sensor.type == Sensor.TYPE_ACCELEROMETER) {
                val a = e.values[0].toDouble(); val b = e.values[1].toDouble(); val c = e.values[2].toDouble()
                glView.queueEvent { NativeEngine.call("__nativeTilt", a, b, c) }
            } else {
                val x = e.values[0]; val y = e.values[1]; val z = e.values[2]
                val w = if (e.values.size > 3) e.values[3] else sqrt(max(0.0, 1.0 - (x * x + y * y + z * z).toDouble())).toFloat()
                glView.queueEvent { NativeEngine.call("__nativeQuat", x.toDouble(), y.toDouble(), z.toDouble(), w.toDouble()) }
            }
        }
        override fun onAccuracyChanged(s: Sensor?, a: Int) {}
    }

    // microphone
    @Volatile private var micRun = false
    private var micThread: Thread? = null

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val root = FrameLayout(this)
        root.setBackgroundColor(Color.BLACK)
        glView = GLSurfaceView(this).apply {
            setEGLContextClientVersion(3)
            setEGLConfigChooser(8, 8, 8, 0, 0, 0)
            preserveEGLContextOnPause = true
            setRenderer(Renderer())
            renderMode = GLSurfaceView.RENDERMODE_WHEN_DIRTY
        }
        ui = WatchUi(this, this)
        splash = TextView(this).apply {
            text = "Dynamic"; setTextColor(Color.WHITE); textSize = 18f; gravity = Gravity.CENTER; setBackgroundColor(Color.BLACK)
        }
        val match = ViewGroup.LayoutParams.MATCH_PARENT
        root.addView(glView, FrameLayout.LayoutParams(match, match))
        root.addView(ui, FrameLayout.LayoutParams(match, match))
        root.addView(splash, FrameLayout.LayoutParams(match, match))
        setContentView(root)
    }

    private inner class Renderer : GLSurfaceView.Renderer {
        private var needInit = false
        override fun onSurfaceCreated(g: GL10?, c: EGLConfig?) { ready = false; needInit = true }
        override fun onSurfaceChanged(g: GL10?, w: Int, h: Int) {
            if (!needInit) return   // later size changes come from the engine's own render size; nothing to redo
            needInit = false
            screenW = glView.width.takeIf { it > 0 } ?: w
            screenH = glView.height.takeIf { it > 0 } ?: h
            val err = NativeEngine.nativeInit(assets, filesDir.path, this@WatchActivity)
            if (err != null) { showError(err); return }
            NativeEngine.call("__resize", screenW.toDouble(), screenH.toDouble())
            NativeEngine.call("__start")
            NativeEngine.nativeLastError()?.let { showError(it) }
        }
        override fun onDrawFrame(g: GL10?) { NativeEngine.call("__frame", System.nanoTime() / 1e6) }
    }

    private fun showError(t: String) = runOnUiThread { splash.visibility = android.view.View.VISIBLE; splash.textSize = 11f; splash.text = t.take(400) }

    // ---------- events from the engine (render thread) ----------
    override fun onEvent(name: String, text: String) {
        when (name) {
            "size" -> {
                val p = text.split(','); val w = p[0].toIntOrNull() ?: return; val h = p[1].toIntOrNull() ?: return
                runOnUiThread { glView.holder.setFixedSize(w, h) }
            }
            "ready" -> glView.queueEvent {   // not inside the script's own call: queue it
                presets = JSONArray(NativeEngine.nativeEval("WatchApp.presets()") ?: "[]")
                palettes = JSONArray(NativeEngine.nativeEval("WatchApp.palettes()") ?: "[]")
                refresh()
                ready = true
                runOnUiThread { splash.animate().alpha(0f).setDuration(350).withEndAction { splash.visibility = android.view.View.GONE }.start(); ui.showToast(text, 1600) }
            }
            "error" -> showError(text)
            "toast" -> { val a = JSONArray(text); runOnUiThread { ui.showToast(a.getString(0), a.optInt(1, 1500)) } }
            "haptic" -> haptic(text.toIntOrNull() ?: 10)
            "preset" -> if (ready) { glView.queueEvent { refresh() }; runOnUiThread { ui.showToast(text, 1300) } }
        }
    }

    private fun refresh() {
        NativeEngine.nativeEval("WatchApp.state()")?.let { try { state = JSONObject(it) } catch (e: Exception) { } }
        ui.postInvalidate()
    }

    private fun haptic(ms: Int) {
        val v = getSystemService(Vibrator::class.java) ?: return
        try { v.vibrate(VibrationEffect.createOneShot(ms.toLong().coerceIn(5, 80), VibrationEffect.DEFAULT_AMPLITUDE)) } catch (e: Exception) { }
    }

    // ---------- WatchUi.Actions (UI thread; engine work is queued onto the render thread) ----------
    private fun gl(block: () -> Unit) = glView.queueEvent { block(); refresh() }
    override fun cycle(d: Int) = gl { NativeEngine.nativeEval("WatchApp.cycle($d)") }
    override fun go(index: Int) = gl { NativeEngine.nativeEval("WatchApp.go($index)") }
    override fun setPalette(index: Int) = gl { NativeEngine.nativeEval("UI.change('pal',$index);notice(SCHEMA.palettes[$index][0],900)") }
    override fun random() = gl { NativeEngine.nativeEval("WatchApp.random()") }
    override fun clearCanvas() = gl { NativeEngine.nativeEval("WatchApp.clear()") }
    override fun togglePause() = gl { NativeEngine.nativeEval("WatchApp.pause()") }
    override fun cycleTilt() {
        val i = tiltIdx(); val n = TILT[(i + 1) % TILT.size]
        gl { NativeEngine.nativeEval("WatchApp.set('tilt',${n.first})") }
    }
    override fun cycleQuality() {
        val i = QUALITY.indexOfFirst { it.first == state.optInt("qual", 4) }.let { if (it < 0) 1 else it }
        val n = QUALITY[(i + 1) % QUALITY.size]
        gl { NativeEngine.nativeEval("WatchApp.quality(${n.first})") }
    }
    override fun toggleMic() { if (micRun) stopMic() else startMic() }
    private fun tiltIdx(): Int { val t = state.optDouble("tilt", 1.0); return TILT.indices.minByOrNull { abs(TILT[it].first - t) } ?: 2 }
    override fun tiltLabel() = "Tilt " + TILT[tiltIdx()].second
    override fun qualityLabel() = QUALITY.firstOrNull { it.first == state.optInt("qual", 4) }?.second ?: "Quality"
    override fun micOn() = micRun
    override fun paused() = state.optBoolean("paused", false)
    override fun presets(): JSONArray = presets
    override fun palettes(): JSONArray = palettes
    override fun currentPreset(): String = state.optString("preset", "")
    override fun currentPalette(): Int = state.optInt("palIdx", 0)

    // ---------- touch ----------
    private fun pointer(code: Int, e: MotionEvent, idx: Int) {
        val id = e.getPointerId(idx).toDouble(); val x = e.getX(idx).toDouble(); val y = e.getY(idx).toDouble()
        glView.queueEvent { NativeEngine.call("__pointer", code.toDouble(), id, x, y) }
    }

    override fun dispatchTouchEvent(e: MotionEvent): Boolean {
        if (!ready) return true
        if (ui.active) { ui.onTouchEvent(e); return true }
        val dp = resources.displayMetrics.density
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                swallow = false; moved = false; downAt = SystemClock.uptimeMillis(); downX = e.x; downY = e.y
                activeIds.clear(); activeIds.add(e.getPointerId(0)); pointer(0, e, 0)
                main.postDelayed(longPress, 650)
            }
            MotionEvent.ACTION_POINTER_DOWN -> if (!swallow) {
                main.removeCallbacks(longPress); activeIds.add(e.getPointerId(e.actionIndex)); pointer(0, e, e.actionIndex)
                if (e.pointerCount == 2) { moved = true; haptic(10); palette(1) }
            }
            MotionEvent.ACTION_MOVE -> if (!swallow) {
                for (i in 0 until e.pointerCount) pointer(1, e, i)
                if (hypot(e.x - downX, e.y - downY) > 14 * dp) { moved = true; main.removeCallbacks(longPress) }
            }
            MotionEvent.ACTION_POINTER_UP -> if (!swallow) { activeIds.remove(e.getPointerId(e.actionIndex)); pointer(2, e, e.actionIndex) }
            MotionEvent.ACTION_UP -> {
                main.removeCallbacks(longPress)
                if (!swallow) {
                    activeIds.clear(); pointer(2, e, 0)
                    val now = SystemClock.uptimeMillis()
                    if (!moved && now - downAt < 350) {
                        if (now - lastTap < 320) { lastTap = 0; haptic(15); cycle(1) } else lastTap = now
                    }
                }
                swallow = false
            }
            MotionEvent.ACTION_CANCEL -> {
                main.removeCallbacks(longPress)
                for (id in activeIds) glView.queueEvent { NativeEngine.call("__pointer", 3.0, id.toDouble(), 0.0, 0.0) }
                activeIds.clear(); swallow = false
            }
        }
        return true
    }

    private fun palette(d: Int) = gl { NativeEngine.nativeEval("WatchApp.palette($d)") }

    /** Crown / bezel: scrolls an open picker, otherwise changes preset. */
    override fun onGenericMotionEvent(e: MotionEvent): Boolean {
        if (e.action == MotionEvent.ACTION_SCROLL && e.isFromSource(InputDevice.SOURCE_ROTARY_ENCODER)) {
            val step = if (-e.getAxisValue(MotionEvent.AXIS_SCROLL) > 0) 1 else -1
            val now = SystemClock.uptimeMillis()
            if (ui.active) { ui.rotate(step); haptic(6); return true }
            if (now - lastCrown < 180) return true
            lastCrown = now; haptic(8); cycle(step)
            return true
        }
        return super.onGenericMotionEvent(e)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { if (!ui.back()) super.onBackPressed() }

    // ---------- microphone ----------
    private fun startMic() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) { requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 7); return }
        val rate = 22050
        val min = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val rec = try { AudioRecord(MediaRecorder.AudioSource.MIC, rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, max(min, 8192)) } catch (e: Exception) { null }
        if (rec == null || rec.state != AudioRecord.STATE_INITIALIZED) { ui.showToast("No microphone", 1600); return }
        micRun = true
        gl { NativeEngine.nativeEval("WatchApp.mic(true,'Listening to the microphone')") }
        ui.showToast("Listening", 1200); haptic(25)
        micThread = Thread {
            val bands = Bands(rate, 256) { levels, _ ->
                if (ready) { val copy = levels.copyOf(); glView.queueEvent { NativeEngine.nativeBands(copy) } }
            }
            val pcm = ShortArray(1024); val f = FloatArray(1024)
            try {
                rec.startRecording()
                while (micRun) {
                    val n = rec.read(pcm, 0, pcm.size)
                    if (n <= 0) continue
                    for (i in 0 until n) f[i] = pcm[i] / 32768f
                    bands.push(f, n)
                }
            } catch (e: Exception) { } finally { try { rec.stop() } catch (e: Exception) { }; rec.release() }
        }.also { it.isDaemon = true; it.start() }
    }

    private fun stopMic() {
        if (!micRun) return
        micRun = false
        gl { NativeEngine.nativeEval("WatchApp.mic(false,'')") }
        ui.showToast("Mic off", 900)
    }

    override fun onRequestPermissionsResult(code: Int, p: Array<out String>, g: IntArray) {
        super.onRequestPermissionsResult(code, p, g)
        if (code == 7 && g.isNotEmpty() && g[0] == PackageManager.PERMISSION_GRANTED) startMic()
    }

    // ---------- lifecycle ----------
    override fun onResume() {
        super.onResume()
        glView.onResume()
        running = true; lastFrame = 0
        Choreographer.getInstance().postFrameCallback(frameCb)
        val sm = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        (sm.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR) ?: sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) ?: sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER))
            ?.let { sm.registerListener(tilt, it, SensorManager.SENSOR_DELAY_GAME) }
    }

    override fun onPause() {
        running = false
        (getSystemService(Context.SENSOR_SERVICE) as SensorManager).unregisterListener(tilt)
        stopMic()
        main.removeCallbacks(longPress)
        glView.queueEvent { if (ready) NativeEngine.nativeEval("__flush()") }   // save settings before the system may stop us
        glView.onPause()
        super.onPause()
    }

    companion object {
        private val TILT = listOf(0.0 to "off", 0.5 to "soft", 1.0 to "normal", 1.7 to "strong")
        private val QUALITY = listOf(5 to "Battery", 4 to "Light", 3 to "Balanced", 2 to "High", 0 to "Auto")
    }
}
