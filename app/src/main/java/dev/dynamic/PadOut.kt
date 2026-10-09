package dev.dynamic

import android.hardware.lights.Light
import android.hardware.lights.LightState
import android.hardware.lights.LightsManager
import android.hardware.lights.LightsRequest
import android.os.Build
import android.os.CombinedVibration
import android.os.SystemClock
import android.os.VibrationEffect
import android.view.InputDevice
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/**
 * Game controller output: two rumble motors and, on Android 12+, light bars and player LEDs.
 * [Feel] is the same algorithm as web/src/46_pad.js, so the phone, the web app and Dynamic Pad all feel identical.
 */
object PadOut {
    @Volatile var mode = 1          // 0 off, 1 music, 2 beats
    @Volatile var gain = 1f
    @Volatile var hiMode = 0      // light motor: 0 treble, 1 bass, 2 off
    private var device: InputDevice? = null
    private var checked = 0L
    private var lastSend = 0L
    private var lastS = -1f
    private var lastW = -1f
    private var quiet = true
    private var lights: LightsManager.LightsSession? = null
    private var lightsFor = -1

    fun find(): InputDevice? {
        val now = SystemClock.uptimeMillis()
        if (now - checked > 2000) {
            checked = now
            device = InputDevice.getDeviceIds().asSequence().mapNotNull { InputDevice.getDevice(it) }.firstOrNull {
                !it.isVirtual && (it.sources and InputDevice.SOURCE_GAMEPAD == InputDevice.SOURCE_GAMEPAD ||
                    it.sources and InputDevice.SOURCE_JOYSTICK == InputDevice.SOURCE_JOYSTICK)
            }
        }
        return device
    }

    fun name(): String = find()?.name ?: ""

    /** Drive both motors, 0..1 each. At most 60 updates a second; each effect lasts 120 ms and the next replaces it. */
    @Synchronized fun rumble(strong: Float, weak: Float) {
        val s = strong.coerceIn(0f, 1f); val w = weak.coerceIn(0f, 1f)
        val off = s < .02f && w < .02f
        if (off && quiet) return
        val now = SystemClock.uptimeMillis()
        if (!off && now - lastSend < 16) return
        if (kotlin.math.abs(s - lastS) < .015f && kotlin.math.abs(w - lastW) < .015f && now - lastSend < 80) return
        lastSend = now; lastS = s; lastW = w; quiet = off
        val d = find() ?: return
        try {
            if (Build.VERSION.SDK_INT >= 31) {
                val vm = d.vibratorManager
                val ids = vm.vibratorIds
                if (ids.isEmpty()) return
                if (off) { vm.cancel(); return }
                if (ids.size >= 2) vm.vibrate(CombinedVibration.startParallel().addVibrator(ids[0], shot(s)).addVibrator(ids[1], shot(w)).combine())
                else vm.vibrate(CombinedVibration.createParallel(shot(max(s, w))))
            } else {
                @Suppress("DEPRECATION") val v = d.vibrator
                if (!v.hasVibrator()) return
                if (off) v.cancel() else v.vibrate(shot(max(s, w)))
            }
        } catch (_: Exception) { }
    }

    private fun shot(a: Float) = VibrationEffect.createOneShot(120, (a * 255).toInt().coerceIn(1, 255))

    fun lightCount(): Int {
        if (Build.VERSION.SDK_INT < 31) return 0
        return try { find()?.lightsManager?.lights?.size ?: 0 } catch (_: Exception) { 0 }
    }

    /** Colour lights take the colour; player-number LEDs show a 1-4 level meter from the colour's brightness. */
    fun light(argb: Int) {
        if (Build.VERSION.SDK_INT < 31) return
        val d = find() ?: return
        try {
            val lm = d.lightsManager
            if (lights == null || lightsFor != d.id) { lights?.close(); lights = lm.openSession(); lightsFor = d.id }
            val r = (argb shr 16) and 255; val g = (argb shr 8) and 255; val b = argb and 255
            val level = 1 + (max(r, max(g, b)) * 3 / 255)
            val req = LightsRequest.Builder()
            for (l in lm.lights) {
                if (l.hasRgbControl()) req.addLight(l, LightState.Builder().setColor(argb).build())
                else if (l.type == Light.LIGHT_TYPE_PLAYER_ID) req.addLight(l, LightState.Builder().setPlayerId(level).build())
            }
            lights?.requestLights(req.build())
        } catch (_: Exception) { }
    }

    fun release() { try { lights?.close() } catch (_: Exception) { }; lights = null; lightsFor = -1; rumble(0f, 0f) }

    /** Port of Feel in web/src/46_pad.js: per-band peak normalisation, gated envelopes, kick and hat punches. */
    object Feel {
        private val peak = FloatArray(24) { .02f }
        private var t = 0L
        var lo = 0f; var hi = 0f; var punchL = 0f; var punchH = 0f; var strong = 0f; var weak = 0f; var beat = 0f

        @Synchronized fun bands(levels: FloatArray, onsets: FloatArray, mode: Int, hiMode: Int) {
            val now = SystemClock.elapsedRealtimeNanos()
            val dt = if (t == 0L) .003f else ((now - t) / 1e9f).coerceIn(.001f, .1f); t = now
            val fall = exp(-dt / 8f)
            var l = 0f; var h = 0f; var kl = 0f; var kh = 0f
            for (b in 0 until 24) {
                val v = levels[b]
                val p = max(max(v, peak[b] * fall), .006f); peak[b] = p
                val n = ((v / p - .5f) / .5f).coerceIn(0f, 1f) * ((v - .015f) / .03f).coerceIn(0f, 1f)
                if (b < 6) { l += n / 6; kl = max(kl, onsets[b]) } else if (b >= 9) { h += n / 15; if (b >= 12) kh = max(kh, onsets[b]) }
            }
            val att = 1 - exp(-dt / .008f); val rel = 1 - exp(-dt / .03f)
            lo += (l - lo) * (if (l > lo) att else rel); hi += (h - hi) * (if (h > hi) att else rel)
            punchL = max(punchL * exp(-dt / .04f), if (kl > .15f) min(1f, .5f + kl) else 0f)
            punchH = max(punchH * exp(-dt / .025f), if (kh > .2f) min(1f, .3f + kh * .8f) else 0f)
            beat = max(punchL, beat * exp(-dt / .15f))
            strong = if (mode == 2) punchL else (lo * lo * .8f + punchL * .8f).coerceIn(0f, 1f)
            weak = when {
                hiMode == 2 -> 0f
                hiMode == 1 -> strong * .7f
                mode == 2 -> punchH * .8f
                else -> (hi.pow(1.6f) * .7f + punchH * .5f).coerceIn(0f, 1f)
            }
        }
    }

    /** Called from the capture thread at the analysis rate (~375/s). */
    fun feed(levels: FloatArray, onsets: FloatArray) {
        val m = mode
        if (m == 0) return
        Feel.bands(levels, onsets, m, hiMode)
        rumble(Feel.strong * gain, Feel.weak * gain)
    }
}
