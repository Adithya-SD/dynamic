// Infinite canvas: slide the whole sheet so the camera is centred again. What slides in from the far side is empty.
in vec2 v;out vec4 o;uniform sampler2D uSrc;uniform vec2 uShift;
void main(){vec2 p=v+uShift;o=(p.x<0.||p.x>1.||p.y<0.||p.y>1.)?vec4(0.):texture(uSrc,p);}
