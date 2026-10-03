// Body forces and living fields. Each field peaks near 1 so one strength slider fits all.
// 1 Torus: cross-section of a vortex ring, rising through the centre and returning outside.
// 2 Vortex: galactic swirl with a gentle inward pull.
// 3 Golden spiral: flow along the logarithmic spiral that grows by phi every quarter turn.
// 4 Poles: source and sink at golden composition points, field lines twisted like a magnetic flux.
// 5 Breath: divergence-free curl noise, slow and organic.
in vec2 v;out vec4 o;
uniform sampler2D uVel,uDye;
uniform vec2 uG,uAspect;
uniform vec4 uPoles;
uniform float uBuoy,uDt,uFieldStr,uFieldScale,uTime;
uniform int uField;

vec2 field(vec2 p){
  if(uField==1){
    float R=.22*(1.+.08*sin(uTime*.5));
    vec2 a=p+vec2(R,0.),b=p-vec2(R,0.);
    vec2 f=vec2(-a.y,a.x)/(dot(a,a)+.01)-vec2(-b.y,b.x)/(dot(b,b)+.01);
    return f*.13*exp(-dot(p,p)*1.2);
  }
  if(uField==2){float r2=dot(p,p);return(vec2(-p.y,p.x)-p*.25)*exp(-r2*3.)*3.;}
  if(uField==3){
    float r=max(length(p),1e-3),pitch=atan(2.*log(PHI)/PI);
    vec2 t=vec2(-p.y,p.x)/r,n=-p/r;
    return(cos(pitch)*t+sin(pitch)*n)*smoothstep(0.,.08,r)*exp(-r*r*1.5)*1.5;
  }
  if(uField==4){
    vec2 a=p-uPoles.xy,b=p-uPoles.zw,f=a/(dot(a,a)+.02)-b/(dot(b,b)+.02);
    return(f+.6*vec2(-f.y,f.x))*.25;
  }
  if(uField==5){
    const float e=.01;vec2 s=p*3.;float t=uTime*.15;
    float n0=vnoise(s+t)+.5*vnoise(s*2.-t),nx=vnoise(s+vec2(e,0.)+t)+.5*vnoise((s+vec2(e,0.))*2.-t),ny=vnoise(s+vec2(0.,e)+t)+.5*vnoise((s+vec2(0.,e))*2.-t);
    return vec2(ny-n0,-(nx-n0))/e*.35;
  }
  return vec2(0.);
}
void main(){
  vec2 u=texture(uVel,v).xy;
  vec3 d=texture(uDye,v).rgb;
  vec2 f=uG+vec2(0.,(d.r+d.g+d.b)*.33*uBuoy);
  if(uField>0)f+=field((v-.5)*uAspect/uFieldScale)*uFieldStr;
  o=vec4(u+f*uDt,0.,1.);
}
