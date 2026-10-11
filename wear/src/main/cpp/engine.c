/* Dynamic for Wear OS: the phone's engine, running natively.
 *
 * QuickJS (quickjs/, MIT) runs assets/engine.js, the same JavaScript, shaders, presets and palettes as the phone app, and
 * this file gives it what a browser would: a WebGL2-shaped `gl` object backed by OpenGL ES 3, a clock, a tiny file
 * store and logging. Nothing here draws or decides anything; the pictures come from the shared engine.
 *
 * Threading: every entry point is called on the GLSurfaceView render thread, which owns the EGL context and this runtime.
 */
#include <jni.h>
#include <android/log.h>
#include <android/asset_manager.h>
#include <android/asset_manager_jni.h>
#include <GLES3/gl3.h>
#include <EGL/egl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "quickjs/quickjs.h"

#define LOG(...) __android_log_print(ANDROID_LOG_INFO, "Dynamic", __VA_ARGS__)
#define ERR(...) __android_log_print(ANDROID_LOG_ERROR, "Dynamic", __VA_ARGS__)

static JSRuntime *rt;
static JSContext *ctx;
static JNIEnv *cur_env;
static jobject host_obj;
static jmethodID host_event;
static char files_dir[512];
static char last_error[2048];

/* ---------- argument helpers ---------- */
static int I(JSContext *c, JSValueConst v) { int32_t x = 0; JS_ToInt32(c, &x, v); return x; }
static float F(JSContext *c, JSValueConst v) { double d = 0; JS_ToFloat64(c, &d, v); return (float)d; }
static int isnum(JSValueConst v) { return JS_IsNumber(v); }

/* Pointer to the bytes behind a typed array / ArrayBuffer (NULL for null, undefined and anything else). */
static uint8_t *bytes_of(JSContext *c, JSValueConst v, size_t *len) {
    size_t off = 0, blen = 0, bpe = 0;
    if (JS_GetTypedArrayType(v) >= 0) {
        JSValue ab = JS_GetTypedArrayBuffer(c, v, &off, &blen, &bpe);
        if (JS_IsException(ab)) { JS_FreeValue(c, JS_GetException(c)); return NULL; }
        size_t sz = 0; uint8_t *p = JS_GetArrayBuffer(c, &sz, ab);
        JS_FreeValue(c, ab);
        if (!p) return NULL;
        if (len) *len = blen;
        return p + off;
    }
    if (JS_IsArrayBuffer(v)) { size_t sz = 0; uint8_t *p = JS_GetArrayBuffer(c, &sz, v); if (len) *len = sz; return p; }
    return NULL;
}

/* Float data from a Float32Array (no copy) or a plain JS array (copied into tmp). */
static const float *floats_of(JSContext *c, JSValueConst v, int *n, float *tmp, int tmpmax) {
    size_t len = 0; uint8_t *p;
    if (JS_GetTypedArrayType(v) == JS_TYPED_ARRAY_FLOAT32 && (p = bytes_of(c, v, &len))) { *n = (int)(len / 4); return (const float *)p; }
    int32_t l = 0; JSValue lv = JS_GetPropertyStr(c, v, "length"); JS_ToInt32(c, &l, lv); JS_FreeValue(c, lv);
    if (l > tmpmax) l = tmpmax;
    for (int i = 0; i < l; i++) { JSValue e = JS_GetPropertyUint32(c, v, i); double d = 0; JS_ToFloat64(c, &d, e); JS_FreeValue(c, e); tmp[i] = (float)d; }
    *n = l; return tmp;
}

#define FN(name) static JSValue gl_##name(JSContext *c, JSValueConst thisv, int argc, JSValueConst *argv)
#define ARG(i) ((i) < argc ? argv[i] : JS_UNDEFINED)
#define ID(i) ((GLuint)I(c, ARG(i)))      /* null / undefined -> 0, as WebGL's null object */
#define GI(i) I(c, ARG(i))
#define GF(i) F(c, ARG(i))
#define RET_ID(x) return JS_NewInt32(c, (int)(x))

static void safe_name(const char *in, char *out, size_t n);
/* ---------- shaders and programs ---------- */
FN(createProgram) { RET_ID(glCreateProgram()); }
FN(createShader) { RET_ID(glCreateShader(GI(0))); }
FN(shaderSource) { const char *s = JS_ToCString(c, ARG(1)); if (s) { glShaderSource(ID(0), 1, &s, NULL); JS_FreeCString(c, s); } return JS_UNDEFINED; }
FN(compileShader) { glCompileShader(ID(0)); return JS_UNDEFINED; }
FN(attachShader) { glAttachShader(ID(0), ID(1)); return JS_UNDEFINED; }
FN(detachShader) { glDetachShader(ID(0), ID(1)); return JS_UNDEFINED; }
FN(deleteShader) { glDeleteShader(ID(0)); return JS_UNDEFINED; }
FN(deleteProgram) { glDeleteProgram(ID(0)); return JS_UNDEFINED; }
FN(linkProgram) { glProgramParameteri(ID(0), GL_PROGRAM_BINARY_RETRIEVABLE_HINT, GL_TRUE); glLinkProgram(ID(0)); return JS_UNDEFINED; }

/* Compiled programs are kept on disk (keyed by a hash of their source and by this GPU/driver), so only the first launch pays for
   compiling the shaders. A binary the driver no longer accepts simply fails to load and the shader is compiled again. */
static unsigned drv_hash(void) {
    static unsigned h; if (h) return h;
    const char *a = (const char *)glGetString(GL_RENDERER), *b = (const char *)glGetString(GL_VERSION); h = 2166136261u;
    for (const char *p = a; p && *p; p++) h = (h ^ (unsigned char)*p) * 16777619u;
    for (const char *p = b; p && *p; p++) h = (h ^ (unsigned char)*p) * 16777619u;
    return h ? h : 1;
}
static void bin_path(JSContext *c, JSValueConst key, char *out, size_t n) {
    const char *k = JS_ToCString(c, key); char nm[64]; safe_name(k ? k : "x", nm, sizeof nm); if (k) JS_FreeCString(c, k);
    snprintf(out, n, "%s/shaders-%s-%08x.bin", files_dir, nm, drv_hash());
}
FN(loadProgramBinary) {
    char path[768]; bin_path(c, ARG(1), path, sizeof path);
    FILE *f = fopen(path, "rb"); if (!f) return JS_FALSE;
    fseek(f, 0, SEEK_END); long n = ftell(f); fseek(f, 0, SEEK_SET);
    if (n < 8) { fclose(f); return JS_FALSE; }
    uint8_t *b = malloc(n); size_t got = fread(b, 1, n, f); fclose(f);
    GLenum fmt; memcpy(&fmt, b, 4);
    GLuint p = ID(0); GLint ok = 0;
    if (got == (size_t)n) { glProgramBinary(p, fmt, b + 4, (GLsizei)(n - 4)); glGetProgramiv(p, GL_LINK_STATUS, &ok); }
    free(b);
    if (!ok) remove(path);
    return JS_NewBool(c, ok != 0);
}
FN(saveProgramBinary) {
    GLuint p = ID(0); GLint len = 0; glGetProgramiv(p, GL_PROGRAM_BINARY_LENGTH, &len);
    if (len <= 0) return JS_FALSE;
    uint8_t *b = malloc(len + 4); GLsizei got = 0; GLenum fmt = 0;
    glGetProgramBinary(p, len, &got, &fmt, b + 4);
    int ok = 0;
    if (got > 0) {
        char path[768], tmp[800]; bin_path(c, ARG(1), path, sizeof path); snprintf(tmp, sizeof tmp, "%s.tmp", path);
        FILE *f = fopen(tmp, "wb");
        if (f) { memcpy(b, &fmt, 4); ok = fwrite(b, 1, (size_t)got + 4, f) == (size_t)got + 4; fclose(f); if (ok) rename(tmp, path); }
    }
    free(b); return JS_NewBool(c, ok);
}
FN(useProgram) { glUseProgram(ID(0)); return JS_UNDEFINED; }
FN(getProgramParameter) {
    GLint v = 0; int p = GI(1); glGetProgramiv(ID(0), p, &v);
    if (p == GL_LINK_STATUS || p == GL_DELETE_STATUS || p == GL_VALIDATE_STATUS) return JS_NewBool(c, v != 0);
    return JS_NewInt32(c, v);
}
FN(getShaderParameter) {
    GLint v = 0; int p = GI(1); glGetShaderiv(ID(0), p, &v);
    if (p == GL_COMPILE_STATUS || p == GL_DELETE_STATUS) return JS_NewBool(c, v != 0);
    return JS_NewInt32(c, v);
}
static JSValue info_log(JSContext *c, GLuint obj, int program) {
    GLint n = 0; if (program) glGetProgramiv(obj, GL_INFO_LOG_LENGTH, &n); else glGetShaderiv(obj, GL_INFO_LOG_LENGTH, &n);
    if (n < 2) return JS_NewString(c, "");
    char *b = malloc(n + 1); GLsizei got = 0;
    if (program) glGetProgramInfoLog(obj, n, &got, b); else glGetShaderInfoLog(obj, n, &got, b);
    b[got] = 0; JSValue s = JS_NewString(c, b); free(b); return s;
}
FN(getProgramInfoLog) { return info_log(c, ID(0), 1); }
FN(getShaderInfoLog) { return info_log(c, ID(0), 0); }
FN(getActiveUniform) {
    char name[256]; GLsizei len = 0; GLint size = 0; GLenum type = 0;
    glGetActiveUniform(ID(0), ID(1), sizeof name - 1, &len, &size, &type, name); name[len] = 0;
    JSValue o = JS_NewObject(c);
    JS_SetPropertyStr(c, o, "name", JS_NewString(c, name));
    JS_SetPropertyStr(c, o, "type", JS_NewInt32(c, (int)type));
    JS_SetPropertyStr(c, o, "size", JS_NewInt32(c, size));
    return o;
}
FN(getUniformLocation) {
    const char *s = JS_ToCString(c, ARG(1)); if (!s) return JS_NULL;
    GLint l = glGetUniformLocation(ID(0), s); JS_FreeCString(c, s);
    return l < 0 ? JS_NULL : JS_NewInt32(c, l);
}

/* ---------- uniforms (location null = ignored, as in WebGL) ---------- */
#define LOC(i) (JS_IsNull(ARG(i)) || JS_IsUndefined(ARG(i)) ? -1 : GI(i))
FN(uniform1i) { int l = LOC(0); if (l >= 0) glUniform1i(l, JS_IsBool(ARG(1)) ? JS_ToBool(c, ARG(1)) : GI(1)); return JS_UNDEFINED; }
FN(uniform1f) { int l = LOC(0); if (l >= 0) glUniform1f(l, GF(1)); return JS_UNDEFINED; }
#define VECN(name, N, call) FN(name) { int l = LOC(0); if (l < 0) return JS_UNDEFINED; float tmp[256]; int n = 0; const float *p = floats_of(c, ARG(1), &n, tmp, 256); if (n >= N) call(l, n / N, p); return JS_UNDEFINED; }
VECN(uniform1fv, 1, glUniform1fv)
VECN(uniform2fv, 2, glUniform2fv)
VECN(uniform3fv, 3, glUniform3fv)
VECN(uniform4fv, 4, glUniform4fv)
FN(uniformMatrix3fv) { int l = LOC(0); if (l < 0) return JS_UNDEFINED; float tmp[144]; int n = 0; const float *p = floats_of(c, ARG(2), &n, tmp, 144); if (n >= 9) glUniformMatrix3fv(l, n / 9, GL_FALSE, p); return JS_UNDEFINED; }

/* ---------- textures ---------- */
FN(createTexture) { GLuint t; glGenTextures(1, &t); RET_ID(t); }
FN(deleteTexture) { GLuint t = ID(0); glDeleteTextures(1, &t); return JS_UNDEFINED; }
FN(bindTexture) { glBindTexture(GI(0), ID(1)); return JS_UNDEFINED; }
FN(activeTexture) { glActiveTexture(GI(0)); return JS_UNDEFINED; }
FN(texParameteri) { glTexParameteri(GI(0), GI(1), GI(2)); return JS_UNDEFINED; }
FN(texStorage2D) { glTexStorage2D(GI(0), GI(1), GI(2), GI(3), GI(4)); return JS_UNDEFINED; }
FN(generateMipmap) { glGenerateMipmap(GI(0)); return JS_UNDEFINED; }
FN(pixelStorei) { int p = GI(0); if (p == GL_UNPACK_ALIGNMENT || p == GL_PACK_ALIGNMENT) glPixelStorei(p, GI(1)); return JS_UNDEFINED; }
/* texImage2D(target, level, internal, w, h, border, format, type, pixels|null); the canvas / image overloads upload nothing here. */
FN(texImage2D) {
    if (argc < 9) return JS_UNDEFINED;
    size_t len = 0; uint8_t *p = bytes_of(c, argv[8], &len);
    glTexImage2D(GI(0), GI(1), GI(2), GI(3), GI(4), GI(5), GI(6), GI(7), p);
    return JS_UNDEFINED;
}
FN(texSubImage2D) {
    if (argc < 9) return JS_UNDEFINED;
    size_t len = 0; uint8_t *p = bytes_of(c, argv[8], &len);
    if (p) glTexSubImage2D(GI(0), GI(1), GI(2), GI(3), GI(4), GI(5), GI(6), GI(7), p);
    return JS_UNDEFINED;
}

/* ---------- framebuffers ---------- */
FN(createFramebuffer) { GLuint f; glGenFramebuffers(1, &f); RET_ID(f); }
FN(deleteFramebuffer) { GLuint f = ID(0); glDeleteFramebuffers(1, &f); return JS_UNDEFINED; }
FN(bindFramebuffer) { glBindFramebuffer(GI(0), ID(1)); return JS_UNDEFINED; }
FN(framebufferTexture2D) { glFramebufferTexture2D(GI(0), GI(1), GI(2), ID(3), GI(4)); return JS_UNDEFINED; }
FN(checkFramebufferStatus) { return JS_NewInt32(c, (int)glCheckFramebufferStatus(GI(0))); }
FN(viewport) { glViewport(GI(0), GI(1), GI(2), GI(3)); return JS_UNDEFINED; }
FN(clearColor) { glClearColor(GF(0), GF(1), GF(2), GF(3)); return JS_UNDEFINED; }
FN(clear) { glClear(GI(0)); return JS_UNDEFINED; }
FN(readPixels) {
    if (argc < 7) return JS_UNDEFINED;
    size_t len = 0; uint8_t *p = bytes_of(c, argv[6], &len);
    if (p) glReadPixels(GI(0), GI(1), GI(2), GI(3), GI(4), GI(5), p);
    return JS_UNDEFINED;
}

/* ---------- drawing ---------- */
FN(drawArrays) { glDrawArrays(GI(0), GI(1), GI(2)); return JS_UNDEFINED; }
FN(drawArraysInstanced) { glDrawArraysInstanced(GI(0), GI(1), GI(2), GI(3)); return JS_UNDEFINED; }
FN(createVertexArray) { GLuint v; glGenVertexArrays(1, &v); RET_ID(v); }
FN(deleteVertexArray) { GLuint v = ID(0); glDeleteVertexArrays(1, &v); return JS_UNDEFINED; }
FN(bindVertexArray) { glBindVertexArray(ID(0)); return JS_UNDEFINED; }
FN(enableVertexAttribArray) { glEnableVertexAttribArray(ID(0)); return JS_UNDEFINED; }
FN(vertexAttribPointer) { glVertexAttribPointer(ID(0), GI(1), GI(2), GI(3) != 0, GI(4), (const void *)(intptr_t)GI(5)); return JS_UNDEFINED; }
FN(vertexAttribDivisor) { glVertexAttribDivisor(ID(0), ID(1)); return JS_UNDEFINED; }
FN(createBuffer) { GLuint b; glGenBuffers(1, &b); RET_ID(b); }
FN(deleteBuffer) { GLuint b = ID(0); glDeleteBuffers(1, &b); return JS_UNDEFINED; }
FN(bindBuffer) { glBindBuffer(GI(0), ID(1)); return JS_UNDEFINED; }
FN(bufferData) {
    if (isnum(ARG(1))) { glBufferData(GI(0), GI(1), NULL, GI(2)); return JS_UNDEFINED; }
    size_t len = 0; uint8_t *p = bytes_of(c, ARG(1), &len);
    glBufferData(GI(0), (GLsizeiptr)len, p, GI(2));
    return JS_UNDEFINED;
}
FN(enable) { glEnable(GI(0)); return JS_UNDEFINED; }
FN(disable) { glDisable(GI(0)); return JS_UNDEFINED; }
FN(blendFunc) { glBlendFunc(GI(0), GI(1)); return JS_UNDEFINED; }
FN(flush) { glFlush(); return JS_UNDEFINED; }
FN(finish) { glFinish(); return JS_UNDEFINED; }
FN(getError) { return JS_NewInt32(c, (int)glGetError()); }
FN(getParameter) {
    int p = GI(0);
    if (p == GL_RENDERER || p == GL_VERSION || p == GL_VENDOR || p == GL_SHADING_LANGUAGE_VERSION) { const char *s = (const char *)glGetString(p); return JS_NewString(c, s ? s : ""); }
    GLint v = 0; glGetIntegerv(p, &v); return JS_NewInt32(c, v);
}
FN(getExtension) {
    const char *n = JS_ToCString(c, ARG(0)); if (!n) return JS_NULL;
    const char *ext = (const char *)glGetString(GL_EXTENSIONS), *ver = (const char *)glGetString(GL_VERSION);
    int es32 = ver && strstr(ver, "OpenGL ES 3.") && ver[strlen("OpenGL ES 3.")] >= '2';
    int ok = ext && strstr(ext, n) != NULL;
    if (!ok && es32 && (!strcmp(n, "EXT_color_buffer_float") || !strcmp(n, "EXT_color_buffer_half_float"))) ok = 1;   /* core in ES 3.2 */
    JS_FreeCString(c, n);
    return ok ? JS_NewObject(c) : JS_NULL;
}

#define K(n) { #n, GL_##n }
static const struct { const char *n; int v; } consts[] = {
    K(TEXTURE_2D), K(TEXTURE0), K(RGBA), K(RGB), K(RED), K(RG), K(RGBA16F), K(RG16F), K(R16F), K(RGBA32F), K(RGBA8), K(HALF_FLOAT), K(FLOAT), K(UNSIGNED_BYTE),
    K(UNSIGNED_SHORT), K(TEXTURE_MIN_FILTER), K(TEXTURE_MAG_FILTER), K(TEXTURE_WRAP_S), K(TEXTURE_WRAP_T), K(NEAREST), K(LINEAR), K(LINEAR_MIPMAP_LINEAR),
    K(CLAMP_TO_EDGE), K(REPEAT), K(MIRRORED_REPEAT), K(FRAMEBUFFER), K(COLOR_ATTACHMENT0), K(FRAMEBUFFER_COMPLETE), K(COLOR_BUFFER_BIT), K(VERTEX_SHADER),
    K(FRAGMENT_SHADER), K(LINK_STATUS), K(COMPILE_STATUS), K(ACTIVE_UNIFORMS), K(SAMPLER_2D), K(FLOAT_VEC2), K(FLOAT_VEC3), K(FLOAT_VEC4), K(FLOAT_MAT3),
    K(INT), K(BOOL), K(TRIANGLES), K(ARRAY_BUFFER), K(STREAM_DRAW), K(STATIC_DRAW), K(DYNAMIC_DRAW), K(BLEND), K(ONE), K(ZERO), K(SRC_ALPHA),
    K(ONE_MINUS_SRC_ALPHA), K(MAX_TEXTURE_SIZE), K(RENDERER), K(VERSION), K(VENDOR), K(DEPTH_TEST), K(CULL_FACE),
};
#define M(n) { #n, gl_##n, 0 }
#define NFN 80
static const struct { const char *n; JSCFunction *f; int dummy; } fns[] = {
    M(createProgram), M(createShader), M(shaderSource), M(compileShader), M(attachShader), M(detachShader), M(deleteShader), M(deleteProgram), M(linkProgram),
    M(useProgram), M(loadProgramBinary), M(saveProgramBinary), M(getProgramParameter), M(getShaderParameter), M(getProgramInfoLog), M(getShaderInfoLog), M(getActiveUniform), M(getUniformLocation),
    M(uniform1i), M(uniform1f), M(uniform1fv), M(uniform2fv), M(uniform3fv), M(uniform4fv), M(uniformMatrix3fv),
    M(createTexture), M(deleteTexture), M(bindTexture), M(activeTexture), M(texParameteri), M(texStorage2D), M(generateMipmap), M(pixelStorei), M(texImage2D), M(texSubImage2D),
    M(createFramebuffer), M(deleteFramebuffer), M(bindFramebuffer), M(framebufferTexture2D), M(checkFramebufferStatus), M(viewport), M(clearColor), M(clear), M(readPixels),
    M(drawArrays), M(drawArraysInstanced), M(createVertexArray), M(deleteVertexArray), M(bindVertexArray), M(enableVertexAttribArray), M(vertexAttribPointer),
    M(vertexAttribDivisor), M(createBuffer), M(deleteBuffer), M(bindBuffer), M(bufferData), M(enable), M(disable), M(blendFunc), M(flush), M(finish), M(getError),
    M(getParameter), M(getExtension),
};

/* Time spent inside the GL bridge, per function: the app can tell script time from driver time (__host.glStats). */
static unsigned long long gl_ns[NFN], gl_cnt[NFN];
static inline unsigned long long now_ns(void) { struct timespec ts; clock_gettime(CLOCK_MONOTONIC, &ts); return (unsigned long long)ts.tv_sec * 1000000000ull + (unsigned long long)ts.tv_nsec; }
static JSValue gl_tramp(JSContext *c, JSValueConst t, int argc, JSValueConst *argv, int magic) {
    unsigned long long t0 = now_ns();
    JSValue r = fns[magic].f(c, t, argc, argv);
    gl_ns[magic] += now_ns() - t0; gl_cnt[magic]++;
    return r;
}
/* "calls N in-GL ms X | name ms (count) ..." for the busiest functions, then resets. */
static JSValue host_glstats(JSContext *c, JSValueConst t, int argc, JSValueConst *argv) {
    size_t n = sizeof fns / sizeof fns[0]; unsigned long long tot = 0, calls = 0; int top[6] = { -1, -1, -1, -1, -1, -1 };
    for (size_t i = 0; i < n; i++) {
        tot += gl_ns[i]; calls += gl_cnt[i];
        for (int k = 0; k < 6; k++) if (top[k] < 0 || gl_ns[i] > gl_ns[top[k]]) { for (int j = 5; j > k; j--) top[j] = top[j - 1]; top[k] = (int)i; break; }
    }
    char buf[600]; int p = snprintf(buf, sizeof buf, "calls %llu in-GL %.1f ms |", calls, tot / 1e6);
    for (int k = 0; k < 6 && top[k] >= 0; k++) p += snprintf(buf + p, sizeof buf - p, " %s %.1f (%llu)", fns[top[k]].n, gl_ns[top[k]] / 1e6, gl_cnt[top[k]]);
    memset(gl_ns, 0, sizeof gl_ns); memset(gl_cnt, 0, sizeof gl_cnt);
    return JS_NewString(c, buf);
}
/* ---------- host: clock, files, events, console ---------- */
static JSValue host_now(JSContext *c, JSValueConst t, int argc, JSValueConst *argv) {
    struct timespec ts; clock_gettime(CLOCK_MONOTONIC, &ts);
    return JS_NewFloat64(c, ts.tv_sec * 1000.0 + ts.tv_nsec / 1e6);
}
static void safe_name(const char *in, char *out, size_t n) {
    size_t i = 0; for (; in[i] && i + 1 < n; i++) out[i] = (in[i] >= 'a' && in[i] <= 'z') || (in[i] >= 'A' && in[i] <= 'Z') || (in[i] >= '0' && in[i] <= '9') || in[i] == '.' || in[i] == '-' ? in[i] : '_';
    out[i] = 0;
}
/* Size of the surface being drawn to (it can differ from the engine's render size for a few frames after a change). */
static JSValue host_surface(JSContext *c, JSValueConst t, int argc, JSValueConst *argv) {
    EGLint w = 0, h = 0; EGLDisplay d = eglGetCurrentDisplay(); EGLSurface sf = eglGetCurrentSurface(EGL_DRAW);
    if (d != EGL_NO_DISPLAY && sf != EGL_NO_SURFACE) { eglQuerySurface(d, sf, EGL_WIDTH, &w); eglQuerySurface(d, sf, EGL_HEIGHT, &h); }
    JSValue a = JS_NewArray(c); JS_SetPropertyUint32(c, a, 0, JS_NewInt32(c, w)); JS_SetPropertyUint32(c, a, 1, JS_NewInt32(c, h)); return a;
}
static JSValue host_read(JSContext *c, JSValueConst t, int argc, JSValueConst *argv) {
    const char *k = JS_ToCString(c, ARG(0)); if (!k) return JS_NULL;
    char nm[128], path[700]; safe_name(k, nm, sizeof nm); JS_FreeCString(c, k);
    snprintf(path, sizeof path, "%s/%s.json", files_dir, nm);
    FILE *f = fopen(path, "rb"); if (!f) return JS_NULL;
    fseek(f, 0, SEEK_END); long n = ftell(f); fseek(f, 0, SEEK_SET);
    if (n < 0 || n > (8 << 20)) { fclose(f); return JS_NULL; }
    char *b = malloc(n + 1); size_t got = fread(b, 1, n, f); fclose(f); b[got] = 0;
    JSValue s = JS_NewStringLen(c, b, got); free(b); return s;
}
static JSValue host_write(JSContext *c, JSValueConst t, int argc, JSValueConst *argv) {
    const char *k = JS_ToCString(c, ARG(0)); if (!k) return JS_UNDEFINED;
    size_t n = 0; const char *v = JS_ToCStringLen(c, &n, ARG(1));
    char nm[128], path[700], tmp[720]; safe_name(k, nm, sizeof nm); JS_FreeCString(c, k);
    snprintf(path, sizeof path, "%s/%s.json", files_dir, nm); snprintf(tmp, sizeof tmp, "%s.tmp", path);
    if (v) { FILE *f = fopen(tmp, "wb"); if (f) { fwrite(v, 1, n, f); fclose(f); rename(tmp, path); } JS_FreeCString(c, v); }
    return JS_UNDEFINED;
}
/* __host.emit(name, text): the engine telling the app something (a toast, a haptic tick, new state). */
static JSValue host_emit(JSContext *c, JSValueConst t, int argc, JSValueConst *argv) {
    if (!cur_env || !host_obj) return JS_UNDEFINED;
    const char *a = JS_ToCString(c, ARG(0)), *b = JS_ToCString(c, ARG(1));
    if (a && b) {
        jstring ja = (*cur_env)->NewStringUTF(cur_env, a), jb = (*cur_env)->NewStringUTF(cur_env, b);
        (*cur_env)->CallVoidMethod(cur_env, host_obj, host_event, ja, jb);
        (*cur_env)->DeleteLocalRef(cur_env, ja); (*cur_env)->DeleteLocalRef(cur_env, jb);
        if ((*cur_env)->ExceptionCheck(cur_env)) (*cur_env)->ExceptionClear(cur_env);
    }
    if (a) JS_FreeCString(c, a);
    if (b) JS_FreeCString(c, b);
    return JS_UNDEFINED;
}
static JSValue console_log(JSContext *c, JSValueConst t, int argc, JSValueConst *argv, int magic) {
    char buf[1024]; size_t pos = 0; buf[0] = 0;
    for (int i = 0; i < argc && pos + 1 < sizeof buf; i++) {
        const char *s = JS_ToCString(c, argv[i]); if (!s) continue;
        pos += snprintf(buf + pos, sizeof buf - pos, "%s%s", i ? " " : "", s); JS_FreeCString(c, s);
    }
    __android_log_write(magic ? ANDROID_LOG_ERROR : ANDROID_LOG_INFO, "DynamicJS", buf);
    return JS_UNDEFINED;
}

static void remember_error(JSContext *c, const char *where) {
    JSValue e = JS_GetException(c);
    const char *s = JS_ToCString(c, e);
    JSValue st = JS_GetPropertyStr(c, e, "stack");
    const char *ss = JS_IsUndefined(st) ? NULL : JS_ToCString(c, st);
    snprintf(last_error, sizeof last_error, "%s: %s\n%s", where, s ? s : "?", ss ? ss : "");
    ERR("%s", last_error);
    if (s) JS_FreeCString(c, s);
    if (ss) JS_FreeCString(c, ss);
    JS_FreeValue(c, st); JS_FreeValue(c, e);
}

static void run_jobs(void) {
    JSContext *c1;
    for (int i = 0; i < 64; i++) { int r = JS_ExecutePendingJob(rt, &c1); if (r <= 0) { if (r < 0) remember_error(c1, "job"); break; } }
}

static void setup_globals(void) {
    JSValue g = JS_GetGlobalObject(ctx);
    JSValue gl = JS_NewObject(ctx);
    for (size_t i = 0; i < sizeof fns / sizeof fns[0]; i++) JS_SetPropertyStr(ctx, gl, fns[i].n, JS_NewCFunctionMagic(ctx, gl_tramp, fns[i].n, 0, JS_CFUNC_generic_magic, (int)i));
    for (size_t i = 0; i < sizeof consts / sizeof consts[0]; i++) JS_SetPropertyStr(ctx, gl, consts[i].n, JS_NewInt32(ctx, consts[i].v));
    JS_SetPropertyStr(ctx, gl, "UNPACK_FLIP_Y_WEBGL", JS_NewInt32(ctx, 0x9240));
    JS_SetPropertyStr(ctx, g, "__gl", gl);
    JSValue host = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, host, "now", JS_NewCFunction(ctx, host_now, "now", 0));
    JS_SetPropertyStr(ctx, host, "glStats", JS_NewCFunction(ctx, host_glstats, "glStats", 0));
    JS_SetPropertyStr(ctx, host, "surface", JS_NewCFunction(ctx, host_surface, "surface", 0));
    JS_SetPropertyStr(ctx, host, "read", JS_NewCFunction(ctx, host_read, "read", 1));
    JS_SetPropertyStr(ctx, host, "write", JS_NewCFunction(ctx, host_write, "write", 2));
    JS_SetPropertyStr(ctx, host, "emit", JS_NewCFunction(ctx, host_emit, "emit", 2));
    JS_SetPropertyStr(ctx, g, "__host", host);
    JSValue con = JS_NewObject(ctx);
    const char *names[] = { "log", "info", "debug", "warn", "error" };
    for (int i = 0; i < 5; i++) JS_SetPropertyStr(ctx, con, names[i], JS_NewCFunctionMagic(ctx, console_log, names[i], 0, JS_CFUNC_generic_magic, i >= 3));
    JS_SetPropertyStr(ctx, g, "console", con);
    JS_FreeValue(ctx, g);
}

/* Call a global function by name with number arguments. Returns a malloc'd string result or NULL. */
static char *call_global(const char *fn, int argc, const double *args, int want) {
    JSValue g = JS_GetGlobalObject(ctx), f = JS_GetPropertyStr(ctx, g, fn);
    char *out = NULL;
    if (JS_IsFunction(ctx, f)) {
        JSValue a[8]; if (argc > 8) argc = 8;
        for (int i = 0; i < argc; i++) a[i] = JS_NewFloat64(ctx, args[i]);
        JSValue r = JS_Call(ctx, f, g, argc, a);
        for (int i = 0; i < argc; i++) JS_FreeValue(ctx, a[i]);
        if (JS_IsException(r)) remember_error(ctx, fn);
        else if (want) { const char *s = JS_ToCString(ctx, r); if (s) { out = strdup(s); JS_FreeCString(ctx, s); } }
        JS_FreeValue(ctx, r);
    }
    JS_FreeValue(ctx, f); JS_FreeValue(ctx, g);
    run_jobs();
    return out;
}

/* ---------- JNI ---------- */
#define JNI(name) JNIEXPORT JNICALL Java_dev_dynamic_watch_NativeEngine_##name

JNIEXPORT jstring JNICALL Java_dev_dynamic_watch_NativeEngine_nativeInit(JNIEnv *env, jobject self, jobject assets, jstring jfiles, jobject host, jboolean dev) {
    cur_env = env;
    const char *fd = (*env)->GetStringUTFChars(env, jfiles, NULL); snprintf(files_dir, sizeof files_dir, "%s", fd); (*env)->ReleaseStringUTFChars(env, jfiles, fd);
    if (host_obj) (*env)->DeleteGlobalRef(env, host_obj);
    host_obj = (*env)->NewGlobalRef(env, host);
    host_event = (*env)->GetMethodID(env, (*env)->GetObjectClass(env, host), "onEvent", "(Ljava/lang/String;Ljava/lang/String;)V");
    if (ctx) { JS_FreeContext(ctx); JS_FreeRuntime(rt); ctx = NULL; rt = NULL; }
    rt = JS_NewRuntime();
    JS_SetMemoryLimit(rt, 192u << 20);
    JS_SetMaxStackSize(rt, 2u << 20);
    ctx = JS_NewContext(rt);
    setup_globals();

    char *src = NULL; size_t n = 0;
    if (dev) {   /* debug builds only: a script pushed into the app's files folder replaces the bundled one (fast edits without a rebuild) */
        char path[720]; snprintf(path, sizeof path, "%s/dev-engine.js", files_dir);
        FILE *f = fopen(path, "rb");
        if (f) { fseek(f, 0, SEEK_END); n = (size_t)ftell(f); fseek(f, 0, SEEK_SET); src = malloc(n + 1); n = fread(src, 1, n, f); src[n] = 0; fclose(f); LOG("using dev-engine.js (%zu bytes)", n); }
    }
    if (!src) {
        AAssetManager *am = AAssetManager_fromJava(env, assets);
        AAsset *a = AAssetManager_open(am, "engine.js", AASSET_MODE_BUFFER);
        if (!a) return (*env)->NewStringUTF(env, "engine.js is missing from the app");
        n = AAsset_getLength(a);
        src = malloc(n + 1); memcpy(src, AAsset_getBuffer(a), n); src[n] = 0; AAsset_close(a);
    }
    last_error[0] = 0;
    JSValue r = JS_Eval(ctx, src, n, "engine.js", JS_EVAL_TYPE_GLOBAL);
    free(src);
    if (JS_IsException(r)) remember_error(ctx, "engine.js");
    JS_FreeValue(ctx, r);
    run_jobs();
    return last_error[0] ? (*env)->NewStringUTF(env, last_error) : NULL;
}

/* Run a call into the engine: name, up to 8 numbers. */
JNIEXPORT void JNICALL Java_dev_dynamic_watch_NativeEngine_nativeCall(JNIEnv *env, jobject self, jstring jname, jdoubleArray jargs) {
    if (!ctx) return;
    cur_env = env;
    const char *name = (*env)->GetStringUTFChars(env, jname, NULL);
    double args[8]; int n = 0;
    if (jargs) { n = (*env)->GetArrayLength(env, jargs); if (n > 8) n = 8; (*env)->GetDoubleArrayRegion(env, jargs, 0, n, args); }
    free(call_global(name, n, args, 0));
    (*env)->ReleaseStringUTFChars(env, jname, name);
}

/* Evaluate a script (UI actions: "WatchApp.cycle(1)") and return its result as text. */
JNIEXPORT jstring JNICALL Java_dev_dynamic_watch_NativeEngine_nativeEval(JNIEnv *env, jobject self, jstring jcode) {
    if (!ctx) return NULL;
    cur_env = env;
    const char *code = (*env)->GetStringUTFChars(env, jcode, NULL);
    JSValue r = JS_Eval(ctx, code, strlen(code), "ui", JS_EVAL_TYPE_GLOBAL);
    jstring out = NULL;
    if (JS_IsException(r)) { remember_error(ctx, code); }
    else { const char *s = JS_ToCString(ctx, r); if (s) { out = (*env)->NewStringUTF(env, s); JS_FreeCString(ctx, s); } }
    JS_FreeValue(ctx, r);
    (*env)->ReleaseStringUTFChars(env, jcode, code);
    run_jobs();
    return out;
}

/* Spectrum from the microphone: 24 band levels in 0..1. */
JNIEXPORT void JNICALL Java_dev_dynamic_watch_NativeEngine_nativeBands(JNIEnv *env, jobject self, jfloatArray jl) {
    if (!ctx) return;
    cur_env = env;
    float v[24]; (*env)->GetFloatArrayRegion(env, jl, 0, 24, v);
    JSValue g = JS_GetGlobalObject(ctx), f = JS_GetPropertyStr(ctx, g, "__nativeBands");
    if (JS_IsFunction(ctx, f)) {
        JSValue arr = JS_NewArray(ctx);
        for (int i = 0; i < 24; i++) JS_SetPropertyUint32(ctx, arr, i, JS_NewFloat64(ctx, v[i]));
        JSValue r = JS_Call(ctx, f, g, 1, &arr);
        if (JS_IsException(r)) remember_error(ctx, "__nativeBands");
        JS_FreeValue(ctx, r); JS_FreeValue(ctx, arr);
    }
    JS_FreeValue(ctx, f); JS_FreeValue(ctx, g);
}

JNIEXPORT jstring JNICALL Java_dev_dynamic_watch_NativeEngine_nativeLastError(JNIEnv *env, jobject self) {
    return last_error[0] ? (*env)->NewStringUTF(env, last_error) : NULL;
}

JNIEXPORT void JNICALL Java_dev_dynamic_watch_NativeEngine_nativeShutdown(JNIEnv *env, jobject self) {
    if (ctx) { JS_FreeContext(ctx); JS_FreeRuntime(rt); ctx = NULL; rt = NULL; }
    if (host_obj) { (*env)->DeleteGlobalRef(env, host_obj); host_obj = NULL; }
}
