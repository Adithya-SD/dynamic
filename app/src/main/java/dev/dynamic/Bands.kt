package dev.dynamic

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * 24 log-spaced frequency bands plus per-band onset detection, reported every 128 samples (375 per second at 48 kHz).
 * A direct port of the web AudioWorklet (web/src/40_audio.js) so phone and PC react to music identically.
 * A 2048-sample window keeps bass resolution while the short hop keeps transients fast.
 */
class Bands(private val sampleRate: Int, private val onReport: (levels: FloatArray, onsets: FloatArray) -> Unit) {
    private val n = 2048
    private val hop = 128
    private val ring = FloatArray(n)
    private var write = 0
    private var since = 0
    private var frames = 0L
    private val re = FloatArray(n)
    private val im = FloatArray(n)
    private val window = FloatArray(n) { (0.5 - 0.5 * cos(2 * PI * it / (n - 1))).toFloat() }
    private val reverse = IntArray(n) { i -> var x = i; var r = 0; repeat(11) { r = (r shl 1) or (x and 1); x = x shr 1 }; r }
    private val cosT = FloatArray(n / 2) { cos(-2 * PI * it / n).toFloat() }
    private val sinT = FloatArray(n / 2) { sin(-2 * PI * it / n).toFloat() }
    private val edges = IntArray(25) { i ->
        val hz = 35.0 * (min(16000.0, sampleRate / 2.0) / 35.0).pow(i / 24.0)
        max(1, Math.round(hz * n / sampleRate).toInt())
    }
    private val prev = FloatArray(24)
    private val avg = FloatArray(24)
    private val cool = DoubleArray(24) { -1e9 }
    private val fluxScale = 512f / hop
    private val retain = 0.92.pow(hop / 512.0).toFloat()
    private val levels = FloatArray(24)
    private val onsets = FloatArray(24)

    /** Feed mono samples in -1..1. */
    fun push(mono: FloatArray, count: Int) {
        for (j in 0 until count) {
            ring[write] = mono[j]
            write = (write + 1) and (n - 1)
            frames++
            if (++since >= hop) { since -= hop; analyze() }
        }
    }

    private fun analyze() {
        val time = frames.toDouble() / sampleRate
        for (i in 0 until n) { val q = reverse[i]; re[q] = ring[(write + i) and (n - 1)] * window[i]; im[q] = 0f }
        var len = 2
        while (len <= n) {
            val stride = n / len
            var base = 0
            while (base < n) {
                for (k in 0 until len / 2) {
                    val ti = k * stride
                    val wr = cosT[ti]
                    val wi = sinT[ti]
                    val a = base + k
                    val b = a + len / 2
                    val vr = re[b] * wr - im[b] * wi
                    val vi = re[b] * wi + im[b] * wr
                    re[b] = re[a] - vr; im[b] = im[a] - vi
                    re[a] += vr; im[a] += vi
                }
                base += len
            }
            len = len shl 1
        }
        for (b in 0 until 24) {
            var sum = 0f
            var start = edges[b]
            var end = edges[b + 1]
            if (end <= start) { start = min(1023, max(1, start)); end = start + 1 }
            var k = start
            while (k < end && k < 1024) { sum += re[k] * re[k] + im[k] * im[k]; k++ }
            val level = min(1f, sqrt(sum) / 1024f * 4f)
            val flux = max(0f, level - prev[b]) * fluxScale
            val threshold = max(0.025f, avg[b] * 1.8f)
            onsets[b] = if (flux > threshold && level > 0.035f && time - cool[b] >= 0.035) min(1f, flux * 3.2f) else 0f
            if (onsets[b] > 0f) cool[b] = time
            avg[b] = avg[b] * retain + flux * (1 - retain)
            prev[b] = level
            levels[b] = level
        }
        onReport(levels, onsets)
    }
}
