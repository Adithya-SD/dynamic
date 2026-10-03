package dev.dynamic

import android.content.ComponentName
import android.content.Context
import android.graphics.Bitmap
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSession
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.Handler
import android.os.Looper
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import java.util.concurrent.CopyOnWriteArraySet

/** Snapshot of Spotify's own media session: track, artwork, position and the transport actions it allows. */
data class SpotifyState(
    val title: String? = null,
    val artist: String? = null,
    val artwork: Bitmap? = null,
    val durationMs: Long = 0,
    val positionMs: Long = 0,
    val playing: Boolean = false,
    val connected: Boolean = false,
    val actions: Set<String> = emptySet()
)

/**
 * Reads Spotify's media session through notification access (no account login, no API keys).
 * It supplies metadata, artwork and transport controls only; Spotify does not share audio, so beat
 * sync comes from phone-audio capture or the microphone.
 */
class NowPlayingService : NotificationListenerService() {
    private val main = Handler(Looper.getMainLooper())
    private var manager: MediaSessionManager? = null
    private val watched = LinkedHashMap<MediaSession.Token, MediaController>()
    private val callback = object : MediaController.Callback() {
        override fun onMetadataChanged(metadata: MediaMetadata?) = publish()
        override fun onPlaybackStateChanged(state: PlaybackState?) = publish()
        override fun onSessionDestroyed() = refresh()
    }
    private val sessionsChanged = MediaSessionManager.OnActiveSessionsChangedListener { refresh() }

    companion object {
        private const val SPOTIFY = "com.spotify.music"
        val listeners = CopyOnWriteArraySet<(SpotifyState) -> Unit>()
        @Volatile var latest = SpotifyState()
            private set
        @Volatile private var controller: MediaController? = null

        fun component(context: Context) = ComponentName(context, NowPlayingService::class.java)

        /** Sends a transport command if the session allows it; returns false otherwise. */
        fun command(action: String, positionMs: Long = 0): Boolean {
            val c = controller ?: return false
            if (action !in latest.actions) return false
            return try {
                when (action) {
                    "play" -> c.transportControls.play()
                    "pause" -> c.transportControls.pause()
                    "next" -> c.transportControls.skipToNext()
                    "previous" -> c.transportControls.skipToPrevious()
                    "seek" -> c.transportControls.seekTo(positionMs.coerceAtLeast(0))
                    else -> return false
                }
                true
            } catch (_: SecurityException) { false } catch (_: IllegalStateException) { false }
        }
    }

    override fun onListenerConnected() {
        manager = getSystemService(MediaSessionManager::class.java)
        try {
            manager?.addOnActiveSessionsChangedListener(sessionsChanged, component(this), main)
            refresh()
        } catch (_: SecurityException) { release(); push(SpotifyState()) }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) = refresh()
    override fun onNotificationRemoved(sbn: StatusBarNotification?) = refresh()
    override fun onListenerDisconnected() { release(); push(SpotifyState()) }
    override fun onDestroy() { release(); push(SpotifyState()); super.onDestroy() }

    /** Reconcile by session token so notification churn does not re-register callbacks. */
    private fun refresh() {
        val m = manager ?: return
        val active = try { m.getActiveSessions(component(this)) } catch (_: SecurityException) { release(); push(SpotifyState()); return }
        val next = active.associateBy { it.sessionToken }
        for ((token, old) in watched.toMap()) if (token !in next) { old.unregisterCallback(callback); watched.remove(token) }
        for ((token, c) in next) if (token !in watched) { watched[token] = c; c.registerCallback(callback, main) }
        publish()
    }

    private fun publish() {
        val spotify = watched.values.firstOrNull { it.packageName == SPOTIFY && it.playbackState?.state == PlaybackState.STATE_PLAYING }
            ?: watched.values.firstOrNull { it.packageName == SPOTIFY }
        controller = spotify
        push(spotify?.let(::snapshot) ?: SpotifyState())
    }

    private fun push(state: SpotifyState) {
        if (state == latest) return
        latest = state
        listeners.forEach { l -> runCatching { l(state) } }
    }

    private fun snapshot(c: MediaController): SpotifyState {
        val md = c.metadata
        val ps = c.playbackState
        val flags = ps?.actions ?: 0L
        val actions = buildSet {
            val pp = (flags and PlaybackState.ACTION_PLAY_PAUSE) != 0L
            if ((flags and PlaybackState.ACTION_PLAY) != 0L || pp) add("play")
            if ((flags and PlaybackState.ACTION_PAUSE) != 0L || pp) add("pause")
            if ((flags and PlaybackState.ACTION_SKIP_TO_NEXT) != 0L) add("next")
            if ((flags and PlaybackState.ACTION_SKIP_TO_PREVIOUS) != 0L) add("previous")
            if ((flags and PlaybackState.ACTION_SEEK_TO) != 0L) add("seek")
        }
        var position = ps?.position?.takeIf { it >= 0 } ?: 0L
        if (ps?.state == PlaybackState.STATE_PLAYING) position += ((android.os.SystemClock.elapsedRealtime() - ps.lastPositionUpdateTime) * ps.playbackSpeed).toLong()
        return SpotifyState(
            title = md?.getString(MediaMetadata.METADATA_KEY_TITLE),
            artist = md?.getString(MediaMetadata.METADATA_KEY_ARTIST),
            artwork = md?.getBitmap(MediaMetadata.METADATA_KEY_ART) ?: md?.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART) ?: md?.getBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON),
            durationMs = md?.getLong(MediaMetadata.METADATA_KEY_DURATION)?.takeIf { it > 0 } ?: 0L,
            positionMs = position,
            playing = ps?.state == PlaybackState.STATE_PLAYING,
            connected = true,
            actions = actions
        )
    }

    private fun release() {
        manager?.removeOnActiveSessionsChangedListener(sessionsChanged)
        watched.values.forEach { it.unregisterCallback(callback) }
        watched.clear()
        manager = null
        controller = null
    }
}
