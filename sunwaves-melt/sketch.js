// 70s Melt - Custom Color Palette
// Original structure preserved, colors remapped

let meltShader;

const vertShader = `
attribute vec3 aPosition;
void main() {
  vec4 positionVec4 = vec4(aPosition, 1.0);
  positionVec4.xy = positionVec4.xy * 2.0 - 1.0;
  gl_Position = positionVec4;
}
`;

const fragShader = `
#ifdef GL_ES
precision mediump float;
#endif

uniform vec2 iResolution;
uniform float iTime;

float cosRange(float amt, float range, float minimum) {
    return (((1.0 + cos(radians(amt))) * 0.5) * range) + minimum;
}

// Your color palette
vec3 blue = vec3(0.545, 0.784, 0.867);      // #8bc8dd
vec3 orange = vec3(0.898, 0.573, 0.102);    // #e5921a
vec3 yellow = vec3(0.886, 0.694, 0.106);    // #e2b11b
vec3 red = vec3(0.847, 0.333, 0.208);       // #d85535
vec3 darkBlue = vec3(0.133, 0.153, 0.208);  // #222735

void main()
{
    const int zoom = 40;
    const float brightness = 0.975;
    float time = iTime * 1.25;
    vec2 uv = gl_FragCoord.xy / iResolution.xy;
    vec2 p  = (2.0*gl_FragCoord.xy-iResolution.xy)/max(iResolution.x,iResolution.y);
    float ct = cosRange(time*5.0, 3.0, 1.1);
    float xBoost = cosRange(time*0.2, 5.0, 5.0);
    float yBoost = cosRange(time*0.1, 10.0, 5.0);
    float fScale = cosRange(time * 15.5, 1.25, 0.5);

    for(int i=1;i<zoom;i++) {
        float _i = float(i);
        vec2 newp=p;
        newp.x+=0.25/_i*sin(_i*p.y+time*cos(ct)*0.5/20.0+0.005*_i)*fScale+xBoost;
        newp.y+=0.25/_i*sin(_i*p.x+time*ct*0.3/40.0+0.03*float(i+15))*fScale+yBoost;
        p=newp;
    }

    // Original color calculation (keep the math, remap the output)
    float r = 0.5*sin(3.0*p.x)+0.5;
    float g = 0.5*sin(3.0*p.y)+0.5;
    float b = 0.5*sin(p.x+p.y)+0.5;

    // Use these as blend factors between your colors
    vec3 col = darkBlue;
    col = mix(col, blue, r);
    col = mix(col, orange, g * 0.8);
    col = mix(col, yellow, b * 0.6);
    col = mix(col, red, (1.0 - r) * g * 0.7);

    col *= brightness;

    // NO vignette - full bleed to edges
    gl_FragColor = vec4(col, 1.0);
}
`;

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  pixelDensity(1);
  noStroke();

  meltShader = createShader(vertShader, fragShader);
}

function draw() {
  shader(meltShader);
  meltShader.setUniform('iResolution', [width, height]);
  meltShader.setUniform('iTime', millis() / 1000.0);
  rect(0, 0, width, height);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
