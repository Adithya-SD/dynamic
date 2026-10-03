in vec2 v;out vec4 o;uniform sampler2D uSrc;uniform float uScale;
void main(){o=texture(uSrc,v)*uScale;}
