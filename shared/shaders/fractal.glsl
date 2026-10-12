// Fractal layer (web/src/57_fractal.js): escape-time fractals computed per pixel, so they can be zoomed for ever. Drawn by fractal.frag into
// a sheet-sized texture that compose.frag samples like the ink, so every space, the ball and the canvas modes carry it along.
// A pixel at q (short-side units, centre 0) looks at the fractal plane at uFrB.xy + q * m, where m is a complex multiplier
// (its size is the zoom, its angle the roll). The Mandelbrot set is exactly self-similar round a Misiurewicz point: scaled by the
// multiplier of the point's cycle (and turned by its angle) it looks the same again, so the camera loops between one scale and
// that scale divided by |lambda| and the zoom never ends and never loses precision. Other fractals loop by dissolving between a
// layer and the same layer K times larger (uFrC.z = K).
//   uFrA  type (1 Mandelbrot, 2 Julia, 3 Burning Ship, 4 Tricorn, 5 Multibrot 3), brightness, colour period in iterations, pixel size
//   uFrB  centre xy, Julia c xy
//   uFrC  multiplier m (re, im), K (0 = exact loop), loop position 0..1 (for the dissolve)
//   uFrD  iterations, colour phase, glow width, unused
uniform vec4 uFrA,uFrB,uFrC,uFrD,uFrE;   // uFrE: the loop multiplier lambda (xy) and where in the loop the fade into the next loop starts
uniform vec2 uFrAsp,uFrCtr;   // the same short-side units as the pattern layer, and where its centre is on the sheet
uniform vec3 uFrCols[3];
// Returns (smooth escape count, distance to the edge in pixels); count < 0 means the point never escaped. The distance estimate
// 0.5 |z| ln|z| / |dz/dc| needs the derivative of the orbit: a complex number for the analytic maps, a 2x2 matrix for the Burning
// Ship and the Tricorn, which are not analytic.
vec2 frIter(vec2 c0,float type,float pxs){
  vec2 z=vec2(0.),c=c0;
  int cap=int(uFrD.x);
  float B=1e3,n=-1.,dn=1.,deg=2.;
  if(type<2.5||type>4.5){
    vec2 dz=vec2(0.);
    if(type>1.5&&type<2.5){z=c0;c=uFrB.zw;dz=vec2(1.,0.);}
    if(type>4.5)deg=3.;
    for(int i=0;i<cap;i++){
      if(type<1.5){dz=2.*cmul(z,dz)+vec2(1.,0.);z=cmul(z,z)+c;}
      else if(type<2.5){dz=2.*cmul(z,dz);z=cmul(z,z)+c;}
      else{dz=3.*cmul(cmul(z,z),dz)+vec2(1.,0.);z=cmul(cmul(z,z),z)+c;}
      if(dot(z,z)>B){n=float(i);break;}
    }
    dn=length(dz);
  }else{
    mat2 D=mat2(0.);
    for(int i=0;i<cap;i++){
      vec2 s=sign(z),w=abs(z);
      mat2 M=type<3.5?mat2(2.*w.x*s.x,2.*w.y*s.x,-2.*w.y*s.y,2.*w.x*s.y):mat2(2.*z.x,-2.*z.y,-2.*z.y,-2.*z.x);   // Jacobian of one step
      D=M*D+mat2(1.);
      z=type<3.5?vec2(w.x*w.x-w.y*w.y,2.*w.x*w.y)+c:vec2(z.x*z.x-z.y*z.y,-2.*z.x*z.y)+c;
      if(dot(z,z)>B){n=float(i);break;}
    }
    dn=sqrt(dot(D[0],D[0])+dot(D[1],D[1]))*.7071;
  }
  if(n<0.)return vec2(-1.,0.);
  float r=length(z),lr=log(r),mu=n+1.-log(lr)/log(deg);   // smooth escape count
  return vec2(mu,.5*r*lr/max(dn,1e-30)/pxs);
}
vec3 frColour(vec2 r){
  if(r.x<0.)return vec3(0.);
  // Colour and light come from the distance to the edge, in pixels: the same at every scale, so the zoom loop shows no seam.
  float d=r.y,g=log2(1.+d),band=.5+.5*cos(TAU*g*.9);
  band=mix(band,.5,clamp(fwidth(g)*1.5,0.,1.));
  float k=(exp(-d*.5)*1.1+exp(-d*uFrD.z*2.)*.55+.5/(1.+d*uFrD.z*8.))*(.65+.35*band);
  vec3 w=.5+.5*cos(TAU*(g*.22+uFrD.y+vec3(0.,.333,.667)));
  vec3 pal=(uFrCols[0]*w.x+uFrCols[1]*w.y+uFrCols[2]*w.z)/(w.x+w.y+w.z+1e-3);
  return pal*k*.7;
}
vec3 frLayer(vec2 q,float s){
  vec2 c0=uFrB.xy+cmul(q,uFrC.xy)*s;
  return frColour(frIter(c0,uFrA.x,uFrA.w*s));
}
vec3 fractalAt(vec2 q){
  if(uFrC.z<=1.){
    // Exact loop. The self-similarity is only exact in the limit, so over the last part of each loop the picture fades into the same
    // picture one loop further out (its first frame), which makes the seam vanish whatever the residual.
    vec3 a=frLayer(q,1.);
    float k=smoothstep(uFrE.z,1.,uFrC.w);
    if(k<=0.)return a;
    vec2 o=cmul(cmul(q,uFrC.xy),uFrE.xy);
    return mix(a,frColour(frIter(uFrB.xy+o,uFrA.x,uFrA.w*length(uFrE.xy))),k);
  }
  float f=uFrC.w,K=uFrC.z,k=smoothstep(0.,1.,f);
  return mix(frLayer(q,pow(K,-f)),frLayer(q,pow(K,1.-f)),k);   // the layer K times larger fades in as the near one fades out
}
