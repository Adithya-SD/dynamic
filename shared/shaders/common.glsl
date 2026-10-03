// Shared helpers. Hosts prepend: #version 300 es + highp precision for float, int, sampler2D.
const float PI=3.14159265359;
const float TAU=6.28318530718;
const float PHI=1.61803398875;

// Sine-free hash: stable on mobile GPUs where sin() of large arguments loses precision.
float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}

// Continuous reflection into [0,1]: every space folds back onto the same sheet of fluid, so nothing samples off the edge.
vec2 mirrorWrap(vec2 u){return 1.-abs(mod(u,2.)-1.);}

vec2 rot2(vec2 p,float a){float c=cos(a),s=sin(a);return vec2(c*p.x-s*p.y,s*p.x+c*p.y);}
vec2 cmul(vec2 a,vec2 b){return vec2(a.x*b.x-a.y*b.y,a.x*b.y+a.y*b.x);}
vec2 cdiv(vec2 a,vec2 b){return vec2(a.x*b.x+a.y*b.y,a.y*b.x-a.x*b.y)/max(dot(b,b),1e-12);}

vec3 hsv2rgb(vec3 c){vec3 p=abs(fract(c.xxx+vec3(0.,2./3.,1./3.))*6.-3.);return c.z*mix(vec3(1.),clamp(p-1.,0.,1.),c.y);}
vec3 hueRotate(vec3 c,float a){const vec3 k=vec3(.57735);float ca=cos(a),sa=sin(a);return c*ca+cross(k,c)*sa+k*dot(k,c)*(1.-ca);}
float luma(vec3 c){return dot(c,vec3(.299,.587,.114));}

// Value noise for organic fields and glass shimmer.
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),f.x),mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),f.x),f.y);}
