precision SIMP float;
in highp vec2 v,vL,vR,vT,vB;out vec4 o;uniform sampler2D uP,uVel;
void main(){o=vec4(texture(uVel,v).xy-vec2(texture(uP,vR).x-texture(uP,vL).x,texture(uP,vT).x-texture(uP,vB).x),0.,1.);}
