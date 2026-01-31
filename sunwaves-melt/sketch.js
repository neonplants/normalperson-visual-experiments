// 70s Melt - Interactive Touch Version
// Touch to ripple, drag to push the liquid

let meltShader;

// Touch tracking
let touches = []; // Array of {x, y, time, active}
const MAX_TOUCHES = 5;
const RIPPLE_DURATION = 2.0; // seconds

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

// Touch uniforms - up to 5 simultaneous touches
uniform vec2 uTouch0;
uniform vec2 uTouch1;
uniform vec2 uTouch2;
uniform vec2 uTouch3;
uniform vec2 uTouch4;
uniform float uTouchTime0;
uniform float uTouchTime1;
uniform float uTouchTime2;
uniform float uTouchTime3;
uniform float uTouchTime4;
uniform float uTouchActive0;
uniform float uTouchActive1;
uniform float uTouchActive2;
uniform float uTouchActive3;
uniform float uTouchActive4;

// Drag velocity for displacement
uniform vec2 uDragVel;

float cosRange(float amt, float range, float minimum) {
    return (((1.0 + cos(radians(amt))) * 0.5) * range) + minimum;
}

// Ripple function - expanding ring with decay (subtle)
float ripple(vec2 p, vec2 center, float time, float active) {
    if (active < 0.5) return 0.0;

    float dist = length(p - center);
    float rippleSpeed = 0.8;
    float rippleWidth = 0.15;
    float rippleRadius = time * rippleSpeed;

    // Ring shape
    float ring = smoothstep(rippleWidth, 0.0, abs(dist - rippleRadius));

    // Fade out over time
    float fade = max(0.0, 1.0 - time * 0.5);

    // Subtle strength
    float strength = active > 0.5 ? 0.3 : 0.2;

    return ring * fade * strength;
}

// Displacement - pushes the liquid OUTWARD from touch point (subtle)
vec2 displacement(vec2 p, vec2 center, float time, float active, vec2 dragVel) {
    if (active < 0.5 && time > 2.0) return vec2(0.0);

    float dist = length(p - center);
    float radius = 0.4;

    // Falloff from touch point
    float falloff = smoothstep(radius, 0.0, dist);

    // Pull UVs TOWARD center = pattern appears to push OUTWARD
    vec2 toCenter = normalize(center - p + vec2(0.001));

    // Subtle push
    float strength = active > 0.5 ? 0.2 : 0.08 * max(0.0, 1.0 - time * 0.5);

    // Drag velocity
    vec2 dragInfluence = active > 0.5 ? -dragVel * 0.4 : vec2(0.0);

    return (toCenter * strength + dragInfluence) * falloff;
}

// Vortex - rotates the pattern around touch point like stirring
vec2 vortex(vec2 p, vec2 center, float time, float active) {
    if (active < 0.5 && time > 2.0) return p;

    float dist = length(p - center);
    float radius = 0.6;
    float falloff = smoothstep(radius, 0.0, dist);

    // Rotation amount - stronger when active, fades after release
    float rotStrength = active > 0.5 ? 0.8 : 0.4 * max(0.0, 1.0 - time * 0.4);
    float angle = falloff * rotStrength;

    // Rotate p around center
    vec2 offset = p - center;
    float cosA = cos(angle);
    float sinA = sin(angle);
    vec2 rotated = vec2(
        offset.x * cosA - offset.y * sinA,
        offset.x * sinA + offset.y * cosA
    );

    return center + rotated;
}

// Color injection - pulls other palette colors into touch area (subtle)
vec3 colorInject(vec2 p, vec2 center, float time, float active, vec3 blue, vec3 orange, vec3 yellow, vec3 red) {
    if (active < 0.5 && time > 2.0) return vec3(0.0);

    float dist = length(p - center);
    float radius = 0.5;
    float falloff = smoothstep(radius, 0.0, dist);

    // Cycle through palette colors based on angle + time
    float angle = atan(p.y - center.y, p.x - center.x);
    float cycle = angle + time * 1.5;

    // Four-way blend between palette colors
    float t = fract(cycle / 6.28318 * 4.0);
    vec3 injectedColor;
    if (t < 0.25) {
        injectedColor = mix(blue, orange, t * 4.0);
    } else if (t < 0.5) {
        injectedColor = mix(orange, yellow, (t - 0.25) * 4.0);
    } else if (t < 0.75) {
        injectedColor = mix(yellow, red, (t - 0.5) * 4.0);
    } else {
        injectedColor = mix(red, blue, (t - 0.75) * 4.0);
    }

    // Subtle strength
    float strength = active > 0.5 ? 0.6 : 0.3 * max(0.0, 1.0 - time * 0.4);

    return injectedColor * falloff * strength;
}

// Returns blend amount for color injection
float colorInjectAmount(vec2 p, vec2 center, float time, float active) {
    if (active < 0.5 && time > 2.0) return 0.0;

    float dist = length(p - center);
    float radius = 0.5;
    float falloff = smoothstep(radius, 0.0, dist);

    float strength = active > 0.5 ? 0.7 : 0.4 * max(0.0, 1.0 - time * 0.4);
    return falloff * strength;
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

    // Apply touch displacement to p before the melt calculation
    vec2 totalDisp = vec2(0.0);
    totalDisp += displacement(p, uTouch0, uTouchTime0, uTouchActive0, uDragVel);
    totalDisp += displacement(p, uTouch1, uTouchTime1, uTouchActive1, uDragVel);
    totalDisp += displacement(p, uTouch2, uTouchTime2, uTouchActive2, uDragVel);
    totalDisp += displacement(p, uTouch3, uTouchTime3, uTouchActive3, uDragVel);
    totalDisp += displacement(p, uTouch4, uTouchTime4, uTouchActive4, uDragVel);

    // Apply displacement
    p += totalDisp;

    // Apply vortex rotation around touch points (stirring effect)
    p = vortex(p, uTouch0, uTouchTime0, uTouchActive0 + (uTouchTime0 < 2.0 ? 1.0 : 0.0));
    p = vortex(p, uTouch1, uTouchTime1, uTouchActive1 + (uTouchTime1 < 2.0 ? 1.0 : 0.0));
    p = vortex(p, uTouch2, uTouchTime2, uTouchActive2 + (uTouchTime2 < 2.0 ? 1.0 : 0.0));
    p = vortex(p, uTouch3, uTouchTime3, uTouchActive3 + (uTouchTime3 < 2.0 ? 1.0 : 0.0));
    p = vortex(p, uTouch4, uTouchTime4, uTouchActive4 + (uTouchTime4 < 2.0 ? 1.0 : 0.0));

    // Calculate ripple distortion (subtle)
    float rippleDistort = 0.0;
    rippleDistort += ripple(p, uTouch0, uTouchTime0, uTouchActive0 + (uTouchTime0 < 2.0 ? 1.0 : 0.0));
    rippleDistort += ripple(p, uTouch1, uTouchTime1, uTouchActive1 + (uTouchTime1 < 2.0 ? 1.0 : 0.0));
    rippleDistort += ripple(p, uTouch2, uTouchTime2, uTouchActive2 + (uTouchTime2 < 2.0 ? 1.0 : 0.0));
    rippleDistort += ripple(p, uTouch3, uTouchTime3, uTouchActive3 + (uTouchTime3 < 2.0 ? 1.0 : 0.0));
    rippleDistort += ripple(p, uTouch4, uTouchTime4, uTouchActive4 + (uTouchTime4 < 2.0 ? 1.0 : 0.0));

    float ct = cosRange(time*5.0, 3.0, 1.1);
    float xBoost = cosRange(time*0.2, 5.0, 5.0);
    float yBoost = cosRange(time*0.1, 10.0, 5.0);
    float fScale = cosRange(time * 15.5, 1.25, 0.5);

    for(int i=1;i<zoom;i++) {
        float _i = float(i);
        vec2 newp=p;
        // Subtle ripple effect on the melt
        float rippleMod = 1.0 + rippleDistort * 1.5;
        newp.x+=0.25/_i*sin(_i*p.y+time*cos(ct)*0.5/20.0+0.005*_i)*fScale*rippleMod+xBoost;
        newp.y+=0.25/_i*sin(_i*p.x+time*ct*0.3/40.0+0.03*float(i+15))*fScale*rippleMod+yBoost;
        p=newp;
    }

    // Original color calculation
    float r = 0.5*sin(3.0*p.x)+0.5;
    float g = 0.5*sin(3.0*p.y)+0.5;
    float b = 0.5*sin(p.x+p.y)+0.5;

    // Use these as blend factors between your colors
    vec3 col = darkBlue;
    col = mix(col, blue, r);
    col = mix(col, orange, g * 0.8);
    col = mix(col, yellow, b * 0.6);
    col = mix(col, red, (1.0 - r) * g * 0.7);

    // Inject palette colors near touch points
    vec3 inject = vec3(0.0);
    float injectAmt = 0.0;

    inject += colorInject(p, uTouch0, uTouchTime0, uTouchActive0 + (uTouchTime0 < 2.0 ? 1.0 : 0.0), blue, orange, yellow, red);
    injectAmt += colorInjectAmount(p, uTouch0, uTouchTime0, uTouchActive0 + (uTouchTime0 < 2.0 ? 1.0 : 0.0));

    inject += colorInject(p, uTouch1, uTouchTime1, uTouchActive1 + (uTouchTime1 < 2.0 ? 1.0 : 0.0), blue, orange, yellow, red);
    injectAmt += colorInjectAmount(p, uTouch1, uTouchTime1, uTouchActive1 + (uTouchTime1 < 2.0 ? 1.0 : 0.0));

    inject += colorInject(p, uTouch2, uTouchTime2, uTouchActive2 + (uTouchTime2 < 2.0 ? 1.0 : 0.0), blue, orange, yellow, red);
    injectAmt += colorInjectAmount(p, uTouch2, uTouchTime2, uTouchActive2 + (uTouchTime2 < 2.0 ? 1.0 : 0.0));

    inject += colorInject(p, uTouch3, uTouchTime3, uTouchActive3 + (uTouchTime3 < 2.0 ? 1.0 : 0.0), blue, orange, yellow, red);
    injectAmt += colorInjectAmount(p, uTouch3, uTouchTime3, uTouchActive3 + (uTouchTime3 < 2.0 ? 1.0 : 0.0));

    inject += colorInject(p, uTouch4, uTouchTime4, uTouchActive4 + (uTouchTime4 < 2.0 ? 1.0 : 0.0), blue, orange, yellow, red);
    injectAmt += colorInjectAmount(p, uTouch4, uTouchTime4, uTouchActive4 + (uTouchTime4 < 2.0 ? 1.0 : 0.0));

    // Mix injected colors into the base
    col = mix(col, inject / max(injectAmt, 0.01), min(injectAmt, 1.0));

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

  // Initialize touch slots
  for (let i = 0; i < MAX_TOUCHES; i++) {
    touches[i] = { x: 0, y: 0, time: 99.0, active: false };
  }
}

// Convert screen coords to shader coords (-1 to 1, aspect corrected)
function screenToShader(sx, sy) {
  let aspect = width / height;
  let x = (sx / width) * 2.0 - 1.0;
  let y = -((sy / height) * 2.0 - 1.0); // Flip Y
  if (aspect > 1.0) {
    y /= aspect;
  } else {
    x *= aspect;
  }
  return { x, y };
}

// Find an available touch slot or the oldest one
function findTouchSlot() {
  // First, find an inactive slot
  for (let i = 0; i < MAX_TOUCHES; i++) {
    if (!touches[i].active && touches[i].time > RIPPLE_DURATION) {
      return i;
    }
  }
  // Otherwise, find the oldest
  let oldest = 0;
  for (let i = 1; i < MAX_TOUCHES; i++) {
    if (touches[i].time > touches[oldest].time) {
      oldest = i;
    }
  }
  return oldest;
}

// Track drag velocity
let lastMouseX = 0;
let lastMouseY = 0;
let dragVelX = 0;
let dragVelY = 0;

function draw() {
  // Update touch times
  let dt = deltaTime / 1000.0;
  for (let i = 0; i < MAX_TOUCHES; i++) {
    touches[i].time += dt;
  }

  // Decay drag velocity
  dragVelX *= 0.9;
  dragVelY *= 0.9;

  // Update drag velocity when mouse/touch is active
  if (mouseIsPressed || (window.touchIsActive)) {
    dragVelX = (mouseX - lastMouseX) / width * 2.0;
    dragVelY = -(mouseY - lastMouseY) / height * 2.0;
  }
  lastMouseX = mouseX;
  lastMouseY = mouseY;

  shader(meltShader);
  meltShader.setUniform('iResolution', [width, height]);
  meltShader.setUniform('iTime', millis() / 1000.0);

  // Set touch uniforms
  for (let i = 0; i < MAX_TOUCHES; i++) {
    meltShader.setUniform(`uTouch${i}`, [touches[i].x, touches[i].y]);
    meltShader.setUniform(`uTouchTime${i}`, touches[i].time);
    meltShader.setUniform(`uTouchActive${i}`, touches[i].active ? 1.0 : 0.0);
  }

  meltShader.setUniform('uDragVel', [dragVelX, dragVelY]);

  rect(0, 0, width, height);
}

// Mouse handlers (works for single touch too)
function mousePressed() {
  let slot = findTouchSlot();
  let pos = screenToShader(mouseX, mouseY);
  touches[slot] = { x: pos.x, y: pos.y, time: 0, active: true };
  return false; // Prevent default
}

function mouseDragged() {
  // Update the most recent active touch
  for (let i = 0; i < MAX_TOUCHES; i++) {
    if (touches[i].active) {
      let pos = screenToShader(mouseX, mouseY);
      touches[i].x = pos.x;
      touches[i].y = pos.y;
      break;
    }
  }
  return false;
}

function mouseReleased() {
  // Deactivate all mouse-based touches
  for (let i = 0; i < MAX_TOUCHES; i++) {
    if (touches[i].active) {
      touches[i].active = false;
      touches[i].time = 0; // Reset time for ripple fadeout
    }
  }
  return false;
}

// Multi-touch handlers
function touchStarted() {
  window.touchIsActive = true;
  for (let t of window.touches || []) {
    let slot = findTouchSlot();
    let pos = screenToShader(t.x, t.y);
    touches[slot] = { x: pos.x, y: pos.y, time: 0, active: true, touchId: t.id };
  }
  return false;
}

function touchMoved() {
  for (let t of window.touches || []) {
    // Find matching touch by ID or position
    for (let i = 0; i < MAX_TOUCHES; i++) {
      if (touches[i].active && touches[i].touchId === t.id) {
        let pos = screenToShader(t.x, t.y);
        touches[i].x = pos.x;
        touches[i].y = pos.y;
        break;
      }
    }
  }
  return false;
}

function touchEnded() {
  window.touchIsActive = (window.touches || []).length > 0;
  // Find touches that are no longer in the active list
  let activeIds = (window.touches || []).map(t => t.id);
  for (let i = 0; i < MAX_TOUCHES; i++) {
    if (touches[i].active && !activeIds.includes(touches[i].touchId)) {
      touches[i].active = false;
      touches[i].time = 0;
    }
  }
  return false;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
