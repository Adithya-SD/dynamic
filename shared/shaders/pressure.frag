precision SIMP float;
in highp vec2 v,vL,vR,vT,vB;out vec4 o;uniform sampler2D uP,uDiv;
void main(){o=vec4((texture(uP,vL).x+texture(uP,vR).x+texture(uP,vB).x+texture(uP,vT).x-texture(uDiv,v).x)*.25,0.,0.,1.);}
