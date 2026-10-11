#pragma once
#include <stdint.h>

/* A minimal Canvas 2D for the sacred-geometry patterns (web/src/56_geo.js draws them with lines, arcs, curves and light that adds).
   Software rasteriser, RGBA8, no text and no images. Ops are numbered the same way in web/watch/prelude.js. */
enum {
    C2D_BEGIN, C2D_MOVE, C2D_LINE, C2D_CLOSE, C2D_ARC, C2D_QUAD, C2D_STROKE, C2D_FILL, C2D_FILLRECT, C2D_STROKESTYLE, C2D_FILLSTYLE,
    C2D_LINEWIDTH, C2D_COMP, C2D_SETTRANSFORM, C2D_SAVE, C2D_RESTORE, C2D_TRANSLATE, C2D_SCALE
};

int c2d_new(int w, int h);
void c2d_size(int id, int w, int h);
void c2d_op(int id, int op, double a, double b, double c, double d, double e, double f);
/* Pixels of canvas `id` (row 0 is the top row); returns 0 if there is no such canvas. */
int c2d_get(int id, int *w, int *h, uint8_t **px);
