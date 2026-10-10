// Keeps a copy of the last frame (picture plus bloom) so a change can dissolve into the next one.
in vec2 v;out vec4 o;uniform sampler2D uImg,uBloom;uniform float uAmt;
void main(){o=vec4(texture(uImg,v).rgb+texture(uBloom,v).rgb*uAmt,1.);}
