/* Minimal Canvas 2D (see canvas2d.h). Paths are flattened to polylines in device space when they are built; a stroke is the union of
   round-capped segments (a coverage mask, so overlaps never double up), then the colour is blended through the mask. */
#include "canvas2d.h"
#include <math.h>
#include <stdlib.h>
#include <string.h>

typedef struct { float a, b, c, d, e, f; } Mat;
typedef struct { Mat m; float sr, sg, sb, sa, fr, fg, fb, fa, lw; int comp; } State;   /* comp: 0 source-over, 1 lighter */
typedef struct {
    int w, h; uint8_t *px, *mask;
    State st, stack[8]; int sp;
    float *pt; int np, cap;          /* flattened path points (x,y pairs) */
    int *sub; int ns, subcap;        /* index of each subpath's first point */
    uint8_t *closed;
    float cx, cy; int have;          /* current point (device space) */
} C2D;

#define MAXC 4
static C2D cv[MAXC];
static int ncv;

static Mat identity(void) { Mat m = { 1, 0, 0, 1, 0, 0 }; return m; }
static void default_state(State *s) {
    s->m = identity(); s->sr = s->sg = s->sb = 0; s->sa = 1; s->fr = s->fg = s->fb = 0; s->fa = 1; s->lw = 1; s->comp = 0;
}

int c2d_new(int w, int h) {
    if (ncv >= MAXC) return -1;
    C2D *c = &cv[ncv]; memset(c, 0, sizeof *c);
    c->w = w > 0 ? w : 1; c->h = h > 0 ? h : 1;
    c->px = calloc((size_t)c->w * c->h, 4); c->mask = calloc((size_t)c->w * c->h, 1);
    default_state(&c->st);
    return ncv++;
}

void c2d_size(int id, int w, int h) {
    if (id < 0 || id >= ncv || w < 1 || h < 1) return;
    C2D *c = &cv[id];
    if (w != c->w || h != c->h) {
        free(c->px); free(c->mask);
        c->w = w; c->h = h; c->px = calloc((size_t)w * h, 4); c->mask = calloc((size_t)w * h, 1);
    } else memset(c->px, 0, (size_t)w * h * 4);   /* resetting the size clears a canvas */
    default_state(&c->st); c->sp = 0; c->np = c->ns = 0; c->have = 0;
}

int c2d_get(int id, int *w, int *h, uint8_t **px) {
    if (id < 0 || id >= ncv) return 0;
    *w = cv[id].w; *h = cv[id].h; *px = cv[id].px; return 1;
}

/* ---------- path building ---------- */
static void tr(const Mat *m, double x, double y, float *ox, float *oy) {
    *ox = (float)(m->a * x + m->c * y + m->e); *oy = (float)(m->b * x + m->d * y + m->f);
}
static void new_sub(C2D *c) {
    if (c->ns >= c->subcap) { c->subcap = c->subcap ? c->subcap * 2 : 16; c->sub = realloc(c->sub, c->subcap * sizeof(int)); c->closed = realloc(c->closed, c->subcap); }
    c->sub[c->ns] = c->np; c->closed[c->ns] = 0; c->ns++;
}
static void add_pt(C2D *c, float x, float y) {
    if (c->np >= c->cap) { c->cap = c->cap ? c->cap * 2 : 256; c->pt = realloc(c->pt, c->cap * 2 * sizeof(float)); }
    c->pt[c->np * 2] = x; c->pt[c->np * 2 + 1] = y; c->np++; c->cx = x; c->cy = y;
}
static void move_to(C2D *c, float x, float y) { new_sub(c); add_pt(c, x, y); c->have = 1; }
static void line_to(C2D *c, float x, float y) { if (!c->have || !c->ns) { move_to(c, x, y); return; } add_pt(c, x, y); }

static void arc(C2D *c, double x, double y, double r, double a0, double a1, int ccw) {
    const double TAU = 6.283185307179586;
    double da = a1 - a0;
    if (!ccw) { if (da >= TAU) da = TAU; else while (da < 0) da += TAU; }
    else { if (da <= -TAU) da = -TAU; else while (da > 0) da -= TAU; }
    double sc = sqrt(fabs(c->st.m.a * c->st.m.d - c->st.m.b * c->st.m.c));
    int n = (int)ceil(fabs(da) * fmax(r * sc, 1.0) / 3.0); if (n < 8) n = 8; if (n > 400) n = 400;
    for (int i = 0; i <= n; i++) {
        double a = a0 + da * i / n; float px, py; tr(&c->st.m, x + r * cos(a), y + r * sin(a), &px, &py);
        if (i == 0) line_to(c, px, py); else add_pt(c, px, py);
    }
}
static void quad(C2D *c, double cx, double cy, double x, double y) {
    float x0 = c->cx, y0 = c->cy, x1, y1, x2, y2; tr(&c->st.m, cx, cy, &x1, &y1); tr(&c->st.m, x, y, &x2, &y2);
    if (!c->have) { move_to(c, x1, y1); x0 = x1; y0 = y1; }
    for (int i = 1; i <= 16; i++) {
        float t = i / 16.f, u = 1 - t; add_pt(c, u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2);
    }
}

/* ---------- compositing ---------- */
static inline void blend(C2D *c, int i, float r, float g, float b, float a, float cov) {
    uint8_t *p = c->px + (size_t)i * 4; float s = a * cov;
    if (s <= 0) return;
    if (c->st.comp == 1) {   /* lighter: add the premultiplied colour */
        float v;
        v = p[0] + r * s; p[0] = v > 255 ? 255 : (uint8_t)v;
        v = p[1] + g * s; p[1] = v > 255 ? 255 : (uint8_t)v;
        v = p[2] + b * s; p[2] = v > 255 ? 255 : (uint8_t)v;
        v = p[3] + 255 * s; p[3] = v > 255 ? 255 : (uint8_t)v;
    } else {
        p[0] = (uint8_t)(r * s + p[0] * (1 - s) + .5f); p[1] = (uint8_t)(g * s + p[1] * (1 - s) + .5f); p[2] = (uint8_t)(b * s + p[2] * (1 - s) + .5f);
        float v = p[3] + 255 * s * (1 - p[3] / 255.f); p[3] = v > 255 ? 255 : (uint8_t)v;
    }
}

static void stroke_seg(C2D *c, float x0, float y0, float x1, float y1, float hw, int *bx0, int *by0, int *bx1, int *by1) {
    int minx = (int)floorf(fminf(x0, x1) - hw - 1), maxx = (int)ceilf(fmaxf(x0, x1) + hw + 1);
    int miny = (int)floorf(fminf(y0, y1) - hw - 1), maxy = (int)ceilf(fmaxf(y0, y1) + hw + 1);
    if (minx < 0) minx = 0; if (miny < 0) miny = 0; if (maxx >= c->w) maxx = c->w - 1; if (maxy >= c->h) maxy = c->h - 1;
    if (minx > maxx || miny > maxy) return;
    if (minx < *bx0) *bx0 = minx; if (miny < *by0) *by0 = miny; if (maxx > *bx1) *bx1 = maxx; if (maxy > *by1) *by1 = maxy;
    float dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy, reach = hw + .5f, reach2 = reach * reach;
    for (int y = miny; y <= maxy; y++) {
        uint8_t *row = c->mask + (size_t)y * c->w;
        for (int x = minx; x <= maxx; x++) {
            float px = x + .5f - x0, py = y + .5f - y0, t = l2 > 0 ? (px * dx + py * dy) / l2 : 0;
            if (t < 0) t = 0; else if (t > 1) t = 1;
            float ex = px - t * dx, ey = py - t * dy, d2 = ex * ex + ey * ey;
            if (d2 >= reach2) continue;
            float cov = reach - sqrtf(d2); if (cov > 1) cov = 1;
            uint8_t m = (uint8_t)(cov * 255.f + .5f);
            if (m > row[x]) row[x] = m;
        }
    }
}

static void do_stroke(C2D *c) {
    State *s = &c->st;
    float sc = sqrtf(fabsf(s->m.a * s->m.d - s->m.b * s->m.c)), hw = .5f * s->lw * sc;
    if (hw < .25f) hw = .25f;
    int bx0 = c->w, by0 = c->h, bx1 = -1, by1 = -1;
    for (int k = 0; k < c->ns; k++) {
        int a = c->sub[k], b = k + 1 < c->ns ? c->sub[k + 1] : c->np;
        for (int i = a; i + 1 < b; i++) stroke_seg(c, c->pt[i * 2], c->pt[i * 2 + 1], c->pt[i * 2 + 2], c->pt[i * 2 + 3], hw, &bx0, &by0, &bx1, &by1);
        if (c->closed[k] && b - a > 1) stroke_seg(c, c->pt[(b - 1) * 2], c->pt[(b - 1) * 2 + 1], c->pt[a * 2], c->pt[a * 2 + 1], hw, &bx0, &by0, &bx1, &by1);
        else if (b - a == 1) stroke_seg(c, c->pt[a * 2], c->pt[a * 2 + 1], c->pt[a * 2], c->pt[a * 2 + 1], hw, &bx0, &by0, &bx1, &by1);
    }
    for (int y = by0; y <= by1; y++) for (int x = bx0; x <= bx1; x++) {
        int i = y * c->w + x; uint8_t m = c->mask[i];
        if (m) { blend(c, i, s->sr, s->sg, s->sb, s->sa, m / 255.f); c->mask[i] = 0; }
    }
}

/* Even-odd polygon fill, four sub-scanlines per pixel row, exact horizontal coverage. */
static void fill_polys(C2D *c, const float *pt, const int *sub, int ns, int np) {
    State *s = &c->st;
    float miny = 1e9f, maxy = -1e9f;
    for (int i = 0; i < np; i++) { if (pt[i * 2 + 1] < miny) miny = pt[i * 2 + 1]; if (pt[i * 2 + 1] > maxy) maxy = pt[i * 2 + 1]; }
    int y0 = (int)floorf(miny), y1 = (int)ceilf(maxy); if (y0 < 0) y0 = 0; if (y1 >= c->h) y1 = c->h - 1;
    float *acc = calloc(c->w + 2, sizeof(float)); float *xs = malloc(sizeof(float) * (np + 2));
    for (int y = y0; y <= y1; y++) {
        int any = 0;
        for (int sidx = 0; sidx < 4; sidx++) {
            float yy = y + (sidx + .5f) / 4; int n = 0;
            for (int k = 0; k < ns; k++) {
                int a = sub[k], b = k + 1 < ns ? sub[k + 1] : np;
                for (int i = a; i < b; i++) {
                    int j = i + 1 < b ? i + 1 : a;
                    float ax = pt[i * 2], ay = pt[i * 2 + 1], bx = pt[j * 2], by = pt[j * 2 + 1];
                    if ((ay <= yy && by > yy) || (by <= yy && ay > yy)) xs[n++] = ax + (yy - ay) / (by - ay) * (bx - ax);
                }
            }
            for (int i = 1; i < n; i++) { float v = xs[i]; int j = i - 1; while (j >= 0 && xs[j] > v) { xs[j + 1] = xs[j]; j--; } xs[j + 1] = v; }
            for (int i = 0; i + 1 < n; i += 2) {
                float xa = xs[i], xb = xs[i + 1]; if (xb <= 0 || xa >= c->w) continue; if (xa < 0) xa = 0; if (xb > c->w) xb = (float)c->w;
                int ia = (int)floorf(xa), ib = (int)floorf(xb); any = 1;
                if (ia == ib) acc[ia] += (xb - xa) * .25f;
                else { acc[ia] += (ia + 1 - xa) * .25f; acc[ib] += (xb - ib) * .25f; for (int x = ia + 1; x < ib; x++) acc[x] += .25f; }
            }
        }
        if (any) for (int x = 0; x < c->w; x++) { if (acc[x] > 0) { blend(c, y * c->w + x, s->fr, s->fg, s->fb, s->fa, acc[x] > 1 ? 1 : acc[x]); acc[x] = 0; } }
    }
    free(acc); free(xs);
}

static Mat mul(Mat p, Mat q) {   /* apply q first, then p */
    Mat r = { p.a * q.a + p.c * q.b, p.b * q.a + p.d * q.b, p.a * q.c + p.c * q.d, p.b * q.c + p.d * q.d, p.a * q.e + p.c * q.f + p.e, p.b * q.e + p.d * q.f + p.f };
    return r;
}

void c2d_op(int id, int op, double a, double b, double cc, double d, double e, double f) {
    if (id < 0 || id >= ncv) return;
    C2D *c = &cv[id]; State *s = &c->st;
    switch (op) {
    case C2D_BEGIN: c->np = c->ns = 0; c->have = 0; break;
    case C2D_MOVE: { float x, y; tr(&s->m, a, b, &x, &y); move_to(c, x, y); } break;
    case C2D_LINE: { float x, y; tr(&s->m, a, b, &x, &y); line_to(c, x, y); } break;
    case C2D_CLOSE: if (c->ns) { c->closed[c->ns - 1] = 1; int st = c->sub[c->ns - 1]; c->cx = c->pt[st * 2]; c->cy = c->pt[st * 2 + 1]; } break;
    case C2D_ARC: arc(c, a, b, cc, d, e, (int)f); break;
    case C2D_QUAD: quad(c, a, b, cc, d); break;
    case C2D_STROKE: do_stroke(c); break;
    case C2D_FILL: fill_polys(c, c->pt, c->sub, c->ns, c->np); break;
    case C2D_FILLRECT: {
        float p[8]; tr(&s->m, a, b, &p[0], &p[1]); tr(&s->m, a + cc, b, &p[2], &p[3]); tr(&s->m, a + cc, b + d, &p[4], &p[5]); tr(&s->m, a, b + d, &p[6], &p[7]);
        int sub0 = 0;
        if (s->comp == 0 && s->fa >= 1 && p[0] <= 0 && p[1] <= 0 && p[4] >= c->w && p[5] >= c->h) {   /* covers everything, opaque: a plain clear */
            for (size_t i = 0; i < (size_t)c->w * c->h; i++) { c->px[i * 4] = (uint8_t)s->fr; c->px[i * 4 + 1] = (uint8_t)s->fg; c->px[i * 4 + 2] = (uint8_t)s->fb; c->px[i * 4 + 3] = 255; }
        } else fill_polys(c, p, &sub0, 1, 4);
    } break;
    case C2D_STROKESTYLE: s->sr = (float)a; s->sg = (float)b; s->sb = (float)cc; s->sa = (float)d; break;
    case C2D_FILLSTYLE: s->fr = (float)a; s->fg = (float)b; s->fb = (float)cc; s->fa = (float)d; break;
    case C2D_LINEWIDTH: s->lw = (float)a; break;
    case C2D_COMP: s->comp = (int)a; break;
    case C2D_SETTRANSFORM: s->m.a = (float)a; s->m.b = (float)b; s->m.c = (float)cc; s->m.d = (float)d; s->m.e = (float)e; s->m.f = (float)f; break;
    case C2D_SAVE: if (c->sp < 8) c->stack[c->sp++] = *s; break;
    case C2D_RESTORE: if (c->sp > 0) *s = c->stack[--c->sp]; break;
    case C2D_TRANSLATE: { Mat t = { 1, 0, 0, 1, (float)a, (float)b }; s->m = mul(s->m, t); } break;
    case C2D_SCALE: { Mat t = { (float)a, 0, 0, (float)b, 0, 0 }; s->m = mul(s->m, t); } break;
    }
}
