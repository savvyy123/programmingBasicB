#ifdef GL_ES
precision mediump float;
precision mediump int;
#endif

uniform sampler2D u_tex;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_strength;
uniform float u_speed;
uniform float u_fade;     // 縁のフェード幅（UV単位 0〜0.5）
uniform float u_fadeNoise; // 縁の滲みをノイズで揺らす量

varying vec2 vTexCoord;

// --- Simplex noise (Patricio Gonzalez Vivo) ---
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187,
                      0.366025403784439,
                      -0.577350269189626,
                      0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m;
  m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec2 uv = vec2(vTexCoord.x, 1.0 - vTexCoord.y);

  // 横軸(X)のみ揺らす。異なるスケール・位相のノイズ2層で規則性を消す
  float t = u_time * u_speed;
  float nx = snoise(uv * 3.0 + vec2(t, 0.0))
           + snoise(uv * 7.0 + vec2(-t * 0.7, t * 1.3)) * 0.5;

  // Y は歪ませず、X 方向だけサンプル位置をずらす
  vec2 offset = vec2(nx, 0.0) * u_strength;
  vec2 sampleUV = clamp(uv + offset, 0.0, 1.0);

  vec3 color = texture2D(u_tex, sampleUV).rgb;

  // --- 縁を黒へノイズで滲ませてフェード ---
  // 各辺までの距離（0=縁, 0.5=中心側）。最も近い辺までの距離を取る
  float distEdge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  // フェード閾値をノイズで揺らして「滲み」を出す
  float fn = snoise(uv * 6.0 + vec2(t * 0.6, -t * 0.4));
  float w = max(u_fade + fn * u_fade * u_fadeNoise, 0.0001);
  // 縁(0)〜w の範囲で 0→1 に立ち上げる（縁は黒、内側は元の色）
  float edge = smoothstep(0.0, w, distEdge);

  color *= edge; // 黒へフェード
  gl_FragColor = vec4(color, 1.0);
}
