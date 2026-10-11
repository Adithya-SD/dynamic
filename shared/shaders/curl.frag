// SIMP is mediump on the watch (half precision, as the reference does for its simulation passes) and highp elsewhere.
precision SIMP float;
in highp vec2 v,vL,vR,vT,vB;out vec4 o;uniform sampler2D uVel;uniform float uScale;
void main(){o=vec4(.5*uScale*(texture(uVel,vR).y-texture(uVel,vL).y-texture(uVel,vT).x+texture(uVel,vB).x),0.,0.,1.);}
