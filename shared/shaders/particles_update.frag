// Particle state: xy on the sheet, life 1..0, seed. Stored as 32-bit float so slow drift never rounds to zero.
in vec2 v;out vec4 o;
uniform sampler2D uState,uVel;
uniform vec2 uRefTx;
uniform vec4 uEmit;   // x, y, active, spread
uniform float uDt,uSpeed,uLife,uTime,uWrap;
void main(){
  vec4 s=texture(uState,v);
  s.xy+=texture(uVel,s.xy).xy*uRefTx*uDt*uSpeed;
  s.z-=uDt/uLife*(.5+hash12(v*913.+s.w*71.));
  if(uWrap>.5)s.xy=fract(s.xy);
  if(s.z<=0.||s.x<0.||s.x>1.||s.y<0.||s.y>1.){
    float t=fract(uTime*.6180339);
    vec2 p=vec2(hash12(v*731.+t*97.),hash12(v*977.+t*131.));
    if(uEmit.z>.5&&hash12(v*313.+t*53.)<.6)p=uEmit.xy+(vec2(hash12(v*419.+t*37.),hash12(v*541.+t*29.))-.5)*uEmit.w;
    s=vec4(clamp(p,0.,1.),1.,hash12(v*571.+t*17.));
  }
  o=s;
}
