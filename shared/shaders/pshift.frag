// The same slide for particle positions (they travel with the ink).
in vec2 v;out vec4 o;uniform sampler2D uSrc;uniform vec2 uShift;
void main(){vec4 s=texture(uSrc,v);s.xy-=uShift;o=s;}
