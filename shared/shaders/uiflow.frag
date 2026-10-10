// Interface ink: the picture of the interface, carried by the fluid underneath it. Where nothing flows it stays exactly
// as it is; where the flow runs it is pushed along and smeared out. The sheet's velocity is turned into screen pixels
// through the same space map the picture uses (derivatives of the map give the local scale and mirroring).
#include "space.glsl"
in vec2 v;out vec4 o;
uniform sampler2D uPrev,uVel;
uniform vec2 uRefTx,uUiRes;   // sheet uv per reference cell, size of this layer in pixels
uniform float uDt,uFade;   // time step of the flow, fraction of the layer that fades this frame
void main(){
  vec2 uv=spaceUV(gl_FragCoord.xy*uRes/uUiRes);
  vec2 vel=texture(uVel,uv).xy*uRefTx;   // sheet uv per second
  vec2 a=dFdx(uv),b=dFdy(uv);            // sheet uv per layer pixel
  float det=a.x*b.y-a.y*b.x;
  vec2 s=abs(det)>1e-13?vec2(b.y*vel.x-b.x*vel.y,a.x*vel.y-a.y*vel.x)/det:vec2(0.);   // layer pixels per second
  float l=length(s)*uDt;if(l>24.)s*=24./l;    // folds and seams: never jump
  o=texture(uPrev,v-s*uDt/uUiRes)*max(0.,1.-uFade);
}
