package dev.dynamic

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/**
 * Captures what other apps play (where they allow it) and hands 16-bit stereo PCM to [Run.onPcm].
 * Consent comes from the foreground Activity. The service is promoted to the foreground before anything else,
 * so a quick cancel cannot trip Android's foreground-start timeout.
 */
class PlaybackCaptureService : Service() {
    private var run: Run? = null
    private var projection: MediaProjection? = null
    private val main = Handler(Looper.getMainLooper())
    private var foregroundReady = false

    class Run(val onStatus: (String) -> Unit, val onPcm: (ByteBuffer, Int) -> Unit) {
        val active = AtomicBoolean(true)
        private var worker: Thread? = null

        @Synchronized
        fun launch(action: () -> Unit) {
            if (active.get()) worker = Thread(action, "Dynamic playback PCM").also { it.start() }
        }

        fun stop() {
            val t = synchronized(this) { active.set(false); worker }
            if (t !== Thread.currentThread()) t?.join(500)
        }
    }

    companion object {
        private val next = AtomicLong(1)
        private val sessions = ConcurrentHashMap<Long, Run>()
        @Volatile private var activeService: PlaybackCaptureService? = null
        private const val ID = "captureId"
        private const val RESULT = "projectionResult"
        private const val DATA = "projectionData"
        private const val STOP = "dev.dynamic.STOP_PLAYBACK_CAPTURE"

        fun begin(context: Context, resultCode: Int, data: Intent, target: Run): Long {
            val id = next.getAndIncrement()
            sessions[id] = target
            try {
                context.startForegroundService(
                    Intent(context, PlaybackCaptureService::class.java).putExtra(ID, id).putExtra(RESULT, resultCode).putExtra(DATA, data)
                )
            } catch (error: Exception) {
                sessions.remove(id); target.stop(); throw error
            }
            return id
        }

        fun end(id: Long) {
            sessions.remove(id)?.stop()
            activeService?.let { s -> s.main.post { if (sessions.isEmpty() && s.foregroundReady) s.stopSelf() } }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        activeService = this
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == STOP) {
            run?.onStatus?.invoke("Phone audio stopped")
            run?.stop()
            stopSelf()
            return START_NOT_STICKY
        }
        val id = intent?.getLongExtra(ID, -1) ?: -1
        val target = sessions[id]
        try {
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(NotificationChannel("playback_capture", "Phone audio", NotificationManager.IMPORTANCE_LOW))
            val stop = PendingIntent.getService(
                this, 1, Intent(this, PlaybackCaptureService::class.java).setAction(STOP),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            val notification = Notification.Builder(this, "playback_capture")
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle("Dynamic is listening to phone audio")
                .setContentText("Only apps that allow capture can be heard")
                .setOngoing(true)
                .addAction(Notification.Action.Builder(null, "Stop", stop).build())
                .build()
            startForeground(4102, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
            foregroundReady = true
            if (target == null || !target.active.get()) { stopSelf(startId); return START_NOT_STICKY }
            run?.stop(); projection?.stop(); projection = null
            run = target
            @Suppress("DEPRECATION")
            val data = intent?.getParcelableExtra<Intent>(DATA) ?: error("Capture consent missing")
            require(intent.getIntExtra(RESULT, Activity.RESULT_CANCELED) == Activity.RESULT_OK) { "Capture consent declined" }
            val granted = getSystemService(MediaProjectionManager::class.java).getMediaProjection(Activity.RESULT_OK, data)
            projection = granted
            granted.registerCallback(object : MediaProjection.Callback() {
                override fun onStop() {
                    val was = target.active.get()
                    target.stop()
                    if (run === target) {
                        if (was) target.onStatus("Phone audio stopped")
                        stopSelf()
                    }
                }
            }, main)
            val config = AudioPlaybackCaptureConfiguration.Builder(granted)
                .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                .addMatchingUsage(AudioAttributes.USAGE_GAME)
                .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                .build()
            target.launch { capture(target, config) }
        } catch (e: Exception) {
            target?.onStatus?.invoke("Phone audio unavailable: ${e.message ?: e.javaClass.simpleName}")
            target?.stop()
            stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun capture(target: Run, config: AudioPlaybackCaptureConfiguration) {
        var recorder: AudioRecord? = null
        try {
            val min = AudioRecord.getMinBufferSize(48000, AudioFormat.CHANNEL_IN_STEREO, AudioFormat.ENCODING_PCM_16BIT)
            require(min > 0) { "capture format unavailable" }
            recorder = AudioRecord.Builder().setAudioPlaybackCaptureConfig(config)
                .setAudioFormat(
                    AudioFormat.Builder().setSampleRate(48000).setChannelMask(AudioFormat.CHANNEL_IN_STEREO)
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT).build()
                )
                .setBufferSizeInBytes(maxOf(min * 2, 8192)).build()
            require(recorder.state == AudioRecord.STATE_INITIALIZED) { "capture could not start" }
            val pcm = ByteBuffer.allocateDirect(1024).order(ByteOrder.LITTLE_ENDIAN)
            var lastSignal = System.nanoTime()
            var warned = false
            recorder.startRecording()
            main.post { if (target.active.get()) target.onStatus("Listening to phone audio") }
            while (target.active.get()) {
                pcm.clear()
                val read = recorder.read(pcm, pcm.capacity(), AudioRecord.READ_NON_BLOCKING)
                if (read < 0) error("capture interrupted ($read)")
                if (read == 0) { Thread.sleep(2); continue }
                target.onPcm(pcm, read)
                val now = System.nanoTime()
                var signal = false
                for (o in 0 until read step 2) if (kotlin.math.abs(pcm.getShort(o).toInt()) > 8) { signal = true; break }
                if (signal) {
                    lastSignal = now
                    if (warned) { warned = false; main.post { if (target.active.get()) target.onStatus("Listening to phone audio") } }
                } else if (!warned && now - lastSignal >= 3_000_000_000L) {
                    warned = true
                    main.post { if (target.active.get()) target.onStatus("No audio heard. Play music, or try the microphone") }
                }
            }
        } catch (e: Exception) {
            main.post { if (target.active.get()) target.onStatus("Phone audio unavailable: ${e.message ?: e.javaClass.simpleName}") }
        } finally {
            try { recorder?.stop() } catch (_: IllegalStateException) { }
            recorder?.release()
        }
    }

    override fun onDestroy() {
        if (activeService === this) activeService = null
        foregroundReady = false
        val ending = run
        run = null
        val was = ending?.active?.get() == true
        ending?.stop(); projection?.stop(); projection = null
        if (was) ending?.onStatus?.invoke("Phone audio stopped")
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }
}
