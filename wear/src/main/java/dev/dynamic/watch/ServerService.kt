package dev.dynamic.watch

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import java.io.BufferedInputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.Executors

/**
 * Serves the bundled engine (assets/index.html, watch.html) on 127.0.0.1 so a watch with no system WebView can still run it:
 * the page is opened in the watch's browser from http://127.0.0.1:PORT, which is a secure context (sensors, microphone).
 * Runs as a foreground service so the system keeps it alive while the browser is in front.
 */
class ServerService : Service() {
    private var server: ServerSocket? = null
    private val pool = Executors.newFixedThreadPool(4)

    override fun onBind(i: Intent?): IBinder? = null

    override fun onStartCommand(i: Intent?, flags: Int, id: Int): Int {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("srv", "Dynamic", NotificationManager.IMPORTANCE_MIN))
        val n = Notification.Builder(this, "srv").setSmallIcon(R.mipmap.ic_launcher).setContentTitle("Dynamic is running").setOngoing(true).build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE) else startForeground(1, n)
        if (server == null) {
            try {
                val s = ServerSocket(PORT, 8, InetAddress.getByName("127.0.0.1")); server = s
                Thread {
                    while (!s.isClosed) { try { val c = s.accept(); pool.execute { serve(c) } } catch (e: Exception) { break } }
                }.apply { isDaemon = true }.start()
            } catch (e: Exception) { /* port taken: an earlier instance is still serving */ }
        }
        return START_STICKY
    }

    private fun serve(c: Socket) {
        c.use { sock ->
            sock.soTimeout = 5000
            val inp = BufferedInputStream(sock.getInputStream())
            val line = StringBuilder()
            while (true) { val b = inp.read(); if (b < 0 || b == '\n'.code) break; if (b != '\r'.code) line.append(b.toChar()) }
            while (true) {   // skip the headers
                val l = StringBuilder()
                while (true) { val b = inp.read(); if (b < 0 || b == '\n'.code) break; if (b != '\r'.code) l.append(b.toChar()) }
                if (l.isEmpty()) break
            }
            val parts = line.toString().split(' ')
            var path = (parts.getOrNull(1) ?: "/").substringBefore('?').substringBefore('#')
            if (path == "/" || path.isEmpty()) path = "/index.html"
            val name = path.removePrefix("/")
            val out = sock.getOutputStream()
            val data = try { if (name.contains("..")) null else assets.open(name).use { it.readBytes() } } catch (e: Exception) { null }
            if (data == null) { out.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray()); return }
            val type = when (name.substringAfterLast('.', "")) { "html" -> "text/html; charset=utf-8"; "js" -> "text/javascript"; "json", "webmanifest" -> "application/json"; "png" -> "image/png"; else -> "application/octet-stream" }
            out.write("HTTP/1.1 200 OK\r\nContent-Type: $type\r\nContent-Length: ${data.size}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n".toByteArray())
            if (parts.getOrNull(0) != "HEAD") out.write(data)
            out.flush()
        }
    }

    override fun onDestroy() { try { server?.close() } catch (e: Exception) { }; pool.shutdownNow(); super.onDestroy() }

    companion object { const val PORT = 8787 }
}
