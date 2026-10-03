// Instanced brush stamps: one small quad per stamp instead of a full-screen pass per stamp.
layout(location=0) in vec4 aPos;   // x, y (sheet uv), velocity variance, ink variance
layout(location=1) in vec4 aForce; // vx, vy, seed, strength
layout(location=2) in vec4 aColor; // rgb, unused
uniform int uMode;      // 0 velocity, 1 ink
uniform float uAspect;  // sheet width / height
out vec2 vD;out float vRad,vSeed;out vec4 vVal;
void main(){
  vec2 c[6]=vec2[6](vec2(-1,-1),vec2(1,-1),vec2(-1,1),vec2(-1,1),vec2(1,-1),vec2(1,1));
  float rad=max(uMode==0?aPos.z:aPos.w,1e-7),e=2.9*sqrt(rad);
  vec2 k=c[gl_VertexID];
  vD=k*e;vRad=rad;vSeed=aForce.z;
  vVal=uMode==0?vec4(aForce.xy,0.,0.):vec4(aColor.rgb,0.);
  gl_Position=vec4((aPos.xy+vec2(k.x*e/uAspect,k.y*e))*2.-1.,0.,1.);
}
