package dev.dynamic.watch

import android.content.res.AssetManager

/**
 * The phone's engine, played natively: assets/engine.js (the shared modules, shaders, presets and palettes) runs in QuickJS and draws
 * with OpenGL ES through a bridge (src/main/cpp/engine.c). Every function here must be called on the GLSurfaceView render thread.
 */
object NativeEngine {
    interface Host { fun onEvent(name: String, text: String) }

    init { System.loadLibrary("dynamicengine") }

    external fun nativeInit(assets: AssetManager, filesDir: String, host: Host): String?
    external fun nativeCall(name: String, args: DoubleArray?)
    external fun nativeEval(code: String): String?
    external fun nativeBands(levels: FloatArray)
    external fun nativeLastError(): String?
    external fun nativeShutdown()

    fun call(name: String, vararg args: Double) = nativeCall(name, if (args.isEmpty()) null else args)
}
