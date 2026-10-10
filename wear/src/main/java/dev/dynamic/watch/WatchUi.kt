package dev.dynamic.watch

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import org.json.JSONArray
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * The watch interface drawn over the picture: a short name card when something changes, a ring menu (long-press) and the
 * two pickers (presets, colours) that the crown scrolls. Everything is big, round and reachable with a thumb.
 * It never touches the engine: it asks through [Actions], and reads state the engine reports.
 */
class WatchUi(context: Context, private val act: Actions) : View(context) {
    interface Actions {
        fun cycle(d: Int)
        fun go(index: Int)
        fun setPalette(index: Int)
        fun random()
        fun toggleMic()
        fun cycleTilt()
        fun cycleQuality()
        fun clearCanvas()
        fun togglePause()
        fun tiltLabel(): String
        fun qualityLabel(): String
        fun micOn(): Boolean
        fun paused(): Boolean
        fun presets(): JSONArray     // [[index, name, category], ...]
        fun palettes(): JSONArray    // [[name, [hex...]], ...]
        fun currentPreset(): String
        fun currentPalette(): Int
    }

    private enum class Mode { NONE, MENU, PRESETS, COLOURS }
    private var mode = Mode.NONE
    val active get() = mode != Mode.NONE

    private val dp = resources.displayMetrics.density
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; textAlign = Paint.Align.CENTER; typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL) }

    // name card
    private var toast = ""
    private var toastUntil = 0L
    private var toastSince = 0L

    // ring menu
    private val items = listOf("Presets", "Colour", "Random", "Mic", "Tilt", "Quality", "Pause", "Clear")
    private var openedAt = 0L
    private var pressed = -1

    // pickers
    private var rows = listOf<Row>()
    private var scroll = 0f           // in rows; the row at the centre is round(scroll)
    private var dragFrom = 0f
    private var dragRow = 0f
    private var dragging = false
    private var downX = 0f
    private var downY = 0f
    private var downAt = 0L
    private var sawDown = false
    private class Row(val index: Int, val name: String, val sub: String, val colours: IntArray?)

    fun showToast(t: String, ms: Int) {
        toast = t; toastSince = SystemClock.uptimeMillis(); toastUntil = toastSince + ms + 260
        postInvalidateOnAnimation()
    }

    fun openMenu() { mode = Mode.MENU; openedAt = SystemClock.uptimeMillis(); pressed = -1; invalidate() }
    fun close() { if (mode != Mode.NONE) { mode = Mode.NONE; invalidate() } }

    private fun openPicker(m: Mode) {
        mode = m; openedAt = SystemClock.uptimeMillis()
        if (m == Mode.PRESETS) {
            val a = act.presets(); val cur = act.currentPreset()
            rows = (0 until a.length()).map { val r = a.getJSONArray(it); Row(r.getInt(0), r.getString(1), r.optString(2), null) }
            scroll = max(0, rows.indexOfFirst { it.name == cur }).toFloat()
        } else {
            val a = act.palettes()
            rows = (0 until a.length()).map {
                val r = a.getJSONArray(it); val h = r.getJSONArray(1)
                Row(it, r.getString(0), "", IntArray(h.length()) { k -> Color.parseColor(h.getString(k)) })
            }
            scroll = act.currentPalette().toFloat()
        }
        invalidate()
    }

    /** Crown: one notch moves the picker one row; in the menu it does nothing; with nothing open the activity changes preset. */
    fun rotate(steps: Int): Boolean {
        if (mode != Mode.PRESETS && mode != Mode.COLOURS) return mode != Mode.NONE
        scroll = (scroll.roundToInt() + steps).coerceIn(0, rows.size - 1).toFloat()
        invalidate(); return true
    }

    fun back(): Boolean {
        return when (mode) {
            Mode.NONE -> false
            Mode.MENU -> { close(); true }
            else -> { mode = Mode.MENU; openedAt = SystemClock.uptimeMillis(); invalidate(); true }
        }
    }

    // ---------- touch ----------
    override fun onTouchEvent(e: MotionEvent): Boolean {
        if (mode == Mode.NONE) return false
        val w = width.toFloat(); val h = height.toFloat()
        // a touch that began before the menu opened (the long press itself) is not ours
        if (e.actionMasked == MotionEvent.ACTION_DOWN) sawDown = true
        else if (!sawDown) return true
        if (e.actionMasked == MotionEvent.ACTION_UP || e.actionMasked == MotionEvent.ACTION_CANCEL) { /* handled below, then reset */ }
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downX = e.x; downY = e.y; downAt = SystemClock.uptimeMillis(); dragging = false; dragFrom = e.y; dragRow = scroll
                if (mode == Mode.MENU) { pressed = hit(e.x, e.y); invalidate() }
            }
            MotionEvent.ACTION_MOVE -> {
                if (mode == Mode.PRESETS || mode == Mode.COLOURS) {
                    if (abs(e.y - downY) > 10 * dp) dragging = true
                    if (dragging) { scroll = (dragRow - (e.y - dragFrom) / rowH()).coerceIn(0f, (rows.size - 1).toFloat()); invalidate() }
                } else if (pressed >= 0 && hit(e.x, e.y) != pressed) { pressed = -1; invalidate() }
            }
            MotionEvent.ACTION_UP -> {
                val moved = hypot(e.x - downX, e.y - downY)
                if (mode == Mode.MENU) {
                    val i = if (pressed >= 0) pressed else -1
                    pressed = -1
                    if (i >= 0 && moved < 24 * dp) choose(i)
                    else if (hypot(e.x - w / 2, e.y - h / 2) < min(w, h) * .17f && moved < 24 * dp) close()
                    invalidate()
                } else if (dragging) {
                    scroll = scroll.roundToInt().toFloat(); invalidate()
                } else if (moved < 18 * dp) {
                    val k = ((e.y - h / 2) / rowH()).roundToInt()
                    val target = (scroll.roundToInt() + k)
                    if (k == 0) pick(target) else { scroll = target.coerceIn(0, rows.size - 1).toFloat(); invalidate() }
                }
            }
            MotionEvent.ACTION_CANCEL -> { pressed = -1; dragging = false; invalidate() }
        }
        if (e.actionMasked == MotionEvent.ACTION_UP || e.actionMasked == MotionEvent.ACTION_CANCEL) sawDown = false
        return true
    }

    private fun pick(row: Int) {
        val r = rows.getOrNull(row) ?: return
        if (mode == Mode.PRESETS) { act.go(r.index); close() } else { act.setPalette(r.index); close() }
    }

    private fun choose(i: Int) {
        when (items[i]) {
            "Presets" -> openPicker(Mode.PRESETS)
            "Colour" -> openPicker(Mode.COLOURS)
            "Random" -> { act.random(); close() }
            "Mic" -> { act.toggleMic(); close() }
            "Tilt" -> act.cycleTilt()
            "Quality" -> act.cycleQuality()
            "Pause" -> { act.togglePause(); close() }
            "Clear" -> { act.clearCanvas(); close() }
        }
    }

    // ---------- geometry ----------
    private fun ringR() = min(width, height) * .34f
    private fun btnR() = min(width, height) * .105f
    private fun rowH() = min(width, height) * .19f
    private fun angle(i: Int) = (-90.0 + 360.0 * i / items.size) * Math.PI / 180.0
    private fun hit(x: Float, y: Float): Int {
        val cx = width / 2f; val cy = height / 2f
        for (i in items.indices) {
            val bx = cx + (ringR() * cos(angle(i))).toFloat(); val by = cy + (ringR() * sin(angle(i))).toFloat()
            if (hypot(x - bx, y - by) < btnR() * 1.25f) return i
        }
        return -1
    }

    // ---------- drawing ----------
    override fun onDraw(c: Canvas) {
        val now = SystemClock.uptimeMillis()
        val w = width.toFloat(); val h = height.toFloat(); val s = min(w, h)
        if (mode == Mode.NONE) { drawToast(c, now, w, h, s); if (now < toastUntil) postInvalidateOnAnimation(); return }
        val t = ((now - openedAt) / 220f).coerceIn(0f, 1f)
        val e = 1f - (1f - t) * (1f - t) * (1f - t)
        fill.shader = RadialGradient(w / 2, h / 2, s * .75f, intArrayOf(Color.argb((200 * e).toInt(), 6, 7, 12), Color.argb((235 * e).toInt(), 0, 0, 0)), null, Shader.TileMode.CLAMP)
        c.drawRect(0f, 0f, w, h, fill); fill.shader = null
        when (mode) {
            Mode.MENU -> drawMenu(c, w, h, s, e)
            Mode.PRESETS, Mode.COLOURS -> drawPicker(c, w, h, s, e)
            else -> {}
        }
        if (t < 1f) postInvalidateOnAnimation()
    }

    private fun drawToast(c: Canvas, now: Long, w: Float, h: Float, s: Float) {
        if (now >= toastUntil || toast.isEmpty()) return
        val inT = ((now - toastSince) / 160f).coerceIn(0f, 1f)
        val outT = ((toastUntil - now) / 260f).coerceIn(0f, 1f)
        val a = min(inT, outT)
        text.textSize = s * .066f; text.typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        val tw = min(text.measureText(toast) + s * .09f, s * .8f)
        val cy = h * .82f - (1 - inT) * s * .02f
        fill.color = Color.argb((150 * a).toInt(), 0, 0, 0)
        c.drawRoundRect(RectF(w / 2 - tw / 2, cy - s * .062f, w / 2 + tw / 2, cy + s * .062f), s * .07f, s * .07f, fill)
        text.alpha = (255 * a).toInt()
        c.drawText(ellipsize(toast, tw - s * .06f), w / 2, cy + text.textSize * .34f, text)
        text.alpha = 255
    }

    private fun ellipsize(t: String, max: Float): String {
        if (text.measureText(t) <= max) return t
        var n = t.length
        while (n > 1 && text.measureText(t.substring(0, n) + "…") > max) n--
        return t.substring(0, n) + "…"
    }

    private fun drawMenu(c: Canvas, w: Float, h: Float, s: Float, e: Float) {
        val cx = w / 2; val cy = h / 2
        // centre: what is playing
        text.color = Color.WHITE; text.textSize = s * .062f; text.typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        text.alpha = (255 * e).toInt()
        c.drawText(ellipsize(act.currentPreset(), s * .3f), cx, cy + text.textSize * .1f, text)
        text.textSize = s * .042f; text.alpha = (140 * e).toInt()
        c.drawText("tap to close", cx, cy + s * .075f, text)
        text.alpha = 255
        for (i in items.indices) {
            val r = ringR() * (.7f + .3f * e)
            val bx = cx + (r * cos(angle(i))).toFloat(); val by = cy + (r * sin(angle(i))).toFloat()
            val on = when (items[i]) { "Mic" -> act.micOn(); "Pause" -> act.paused(); else -> false }
            val br = btnR() * (if (pressed == i) 1.08f else 1f)
            fill.color = if (on) Color.argb((235 * e).toInt(), 255, 255, 255) else Color.argb((40 * e).toInt(), 255, 255, 255)
            c.drawCircle(bx, by, br, fill)
            stroke.strokeWidth = 1.5f * dp; stroke.color = Color.argb((on.let { if (it) 0 else 90 } * e).toInt(), 255, 255, 255)
            c.drawCircle(bx, by, br, stroke)
            val label = when (items[i]) { "Tilt" -> act.tiltLabel(); "Quality" -> act.qualityLabel(); "Mic" -> if (on) "Mic on" else "Mic"; "Pause" -> if (on) "Play" else "Pause"; else -> items[i] }
            text.color = if (on) Color.rgb(10, 12, 20) else Color.WHITE
            text.textSize = s * .049f; text.alpha = (255 * e).toInt()
            val parts = label.split(' ', limit = 2)
            if (parts.size == 2 && text.measureText(label) > br * 1.7f) {
                c.drawText(parts[0], bx, by - text.textSize * .1f, text); c.drawText(parts[1], bx, by + text.textSize * 1.0f, text)
            } else c.drawText(label, bx, by + text.textSize * .34f, text)
            text.color = Color.WHITE; text.alpha = 255
        }
    }

    private fun drawPicker(c: Canvas, w: Float, h: Float, s: Float, e: Float) {
        val cx = w / 2; val cy = h / 2; val rh = rowH()
        val first = max(0, (scroll - 3).toInt()); val last = min(rows.size - 1, (scroll + 3).toInt() + 1)
        for (i in first..last) {
            val off = i - scroll
            val y = cy + off * rh
            val f = (1f - abs(off) / 2.6f).coerceIn(0f, 1f)
            val a = (255 * f * e).toInt()
            if (a <= 3) continue
            val row = rows[i]
            val sel = abs(off) < .5f
            if (row.colours != null) {
                val bw = s * (if (sel) .62f else .5f); val bh = rh * (if (sel) .46f else .34f)
                val rect = RectF(cx - bw / 2, y - bh / 2, cx + bw / 2, y + bh / 2)
                fill.shader = LinearGradient(rect.left, 0f, rect.right, 0f, row.colours + row.colours.first(), null, Shader.TileMode.CLAMP)
                fill.alpha = a
                c.drawRoundRect(rect, bh / 2, bh / 2, fill); fill.shader = null
                text.textSize = s * (if (sel) .056f else .046f); text.color = Color.WHITE; text.alpha = a
                c.drawText(row.name, cx, y + bh / 2 + text.textSize * 1.15f * (if (sel) 1f else .9f), text)
            } else {
                text.textSize = s * (if (sel) .074f else .056f)
                text.color = Color.WHITE; text.alpha = a
                c.drawText(ellipsize(row.name, s * .78f), cx, y + text.textSize * .1f, text)
                if (sel && row.sub.isNotEmpty()) { text.textSize = s * .044f; text.alpha = (150 * e).toInt(); c.drawText(row.sub, cx, y + s * .075f, text) }
            }
        }
        text.alpha = 255; text.color = Color.WHITE
        // marker either side of the selected row
        stroke.color = Color.argb((120 * e).toInt(), 255, 255, 255); stroke.strokeWidth = 2f * dp
        c.drawLine(s * .06f, cy, s * .1f, cy, stroke); c.drawLine(w - s * .1f, cy, w - s * .06f, cy, stroke)
    }
}
