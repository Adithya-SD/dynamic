// UI dissolution: each 4px tile of the rendered interface becomes ink and flow at the sheet position the
// space maps it to, so the panel visibly melts into the same symmetry the fluid shows.
#include "space.glsl"
uniform sampler2D uMask;
uniform vec2 uCss;      // CSS-pixel viewport
uniform float uCols,uProgress,uPrev,uPointSize,uKind;
out vec4 vVal;
void main(){
  vec2 tile=vec2(float(gl_VertexID%int(uCols)),floor(float(gl_VertexID)/uCols));
  vec2 css=(tile+.5)*4.,mu=css/uCss;
  float t=.72*mu.y+.28*hash12(floor(mu*vec2(240.,135.)));
  vec4 c=textureLod(uMask,mu,0.);
  bool on=t<=uProgress&&t>uPrev&&c.a>.005&&mu.x<=1.&&mu.y<=1.;
  vec2 fc=vec2(mu.x,1.-mu.y)*uRes;
  vec2 uv=spaceUV(fc);
  vVal=uKind<.5?vec4(vec2(sin(mu.y*71.),cos(mu.x*63.))*c.a*90.,0.,0.):vec4(c.rgb*c.a*.65,0.);
  gl_Position=on?vec4(uv*2.-1.,0.,1.):vec4(2.,2.,0.,1.);
  gl_PointSize=uPointSize;
}
