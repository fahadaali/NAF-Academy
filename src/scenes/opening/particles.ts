/* جسيمات المشهد الافتتاحي — WebGL2 مع بديل Canvas2D.
   أربع حالات لكل جسيم: غبار ← سطور نص ← سُلّم ← علامة الأكاديمية.
   الموضع في كل إطار دالة في تقدّم التمرير p وزمن الخمول t، لا حالة متراكمة —
   فالتمرير للأمام والخلف يعطي الصورة نفسها دائماً. */
import { EMBLEM } from '@/components/Emblem'
import { clamp01, smooth } from '@/motion/tokens'

export const WINDOWS = {
  write: [0.06, 0.3],
  stitch: [0.34, 0.58],
  gather: [0.62, 0.86],
} as const

type Layout = { w: number; h: number }

export type Field = {
  n: number
  dust: Float32Array
  lines: Float32Array
  ladder: Float32Array
  emblem: Float32Array
  seed: Float32Array // [delay, swirl, size, alpha]
  out: Float32Array // [x, y, size, alpha] للرسم
}

const rand = (() => {
  let s = 0x9e3779b9
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 1e6) / 1e6
  }
})()

export function makeField(n: number): Field {
  const seed = new Float32Array(n * 4)
  for (let i = 0; i < n; i++) {
    seed[i * 4] = rand() * 0.38
    seed[i * 4 + 1] = (rand() - 0.5) * 2
    seed[i * 4 + 2] = 0.8 + rand() * 1.4
    seed[i * 4 + 3] = 0.35 + rand() * 0.65
  }
  return {
    n,
    dust: new Float32Array(n * 2),
    lines: new Float32Array(n * 2),
    ladder: new Float32Array(n * 2),
    emblem: new Float32Array(n * 2),
    seed,
    out: new Float32Array(n * 4),
  }
}

/** يعيد حساب الأهداف عند تغيّر المقاس */
/** mask: نقاط شعار مرفوع (أزواج 0–1 داخل مربع) — بدونها تُرسم العلامة الافتراضية بهندستها */
export function layoutField(f: Field, { w, h }: Layout, mask?: Float32Array | null) {
  const { n } = f
  const cx = w / 2
  const cy = h / 2

  /* غبار يملأ الشاشة */
  for (let i = 0; i < n; i++) {
    f.dust[i * 2] = rand() * w
    f.dust[i * 2 + 1] = rand() * h
  }

  /* سطور نص من اليمين لليسار، بكلمات متقطّعة */
  const W = Math.min(w * 0.78, 760)
  const rows = 7
  const gap = Math.min(h * 0.06, 46)
  const top = cy - (gap * (rows - 1)) / 2
  const lens = [1, 0.92, 0.97, 0.7, 0.95, 0.88, 0.46]
  const segs: { x0: number; x1: number; y: number }[] = []
  for (let r = 0; r < rows; r++) {
    const right = cx + W / 2
    const len = W * lens[r]
    let x = right
    const end = right - len
    while (x > end) {
      const wl = Math.min(x - end, 26 + rand() * 70)
      segs.push({ x0: x, x1: x - wl, y: top + r * gap })
      x -= wl + 10 + rand() * 8
    }
  }
  const total = segs.reduce((a, s) => a + (s.x0 - s.x1), 0)
  for (let i = 0; i < n; i++) {
    let d = rand() * total
    let s = segs[0]
    for (const sg of segs) {
      const l = sg.x0 - sg.x1
      if (d <= l) { s = sg; break }
      d -= l
    }
    f.lines[i * 2] = s.x0 - d
    f.lines[i * 2 + 1] = s.y + (rand() - 0.5) * 5
  }

  /* سُلّم من ثلاث درجات — الأعلى في نهاية اتجاه القراءة (اليسار) */
  const LW = Math.min(w * 0.66, 640)
  const LH = LW * 0.52
  const right = cx + LW / 2
  const bottom = cy + LH / 2
  const stepW = LW / 3
  for (let i = 0; i < n; i++) {
    const k = i % 3
    const sh = (LH * (k + 1)) / 3
    const x0 = right - (k + 1) * stepW + 6
    const edge = rand() < 0.55
    let x: number, y: number
    if (edge) {
      const t = rand() * (2 * (stepW - 12) + 2 * sh)
      if (t < stepW - 12) { x = x0 + t; y = bottom - sh }
      else if (t < stepW - 12 + sh) { x = x0 + stepW - 12; y = bottom - sh + (t - (stepW - 12)) }
      else if (t < 2 * (stepW - 12) + sh) { x = x0 + (t - (stepW - 12) - sh); y = bottom }
      else { x = x0; y = bottom - (t - 2 * (stepW - 12) - sh) }
    } else {
      x = x0 + rand() * (stepW - 12)
      y = bottom - rand() * sh
    }
    f.ladder[i * 2] = x
    f.ladder[i * 2 + 1] = y
  }

  /* العلامة: الكتاب المفتوح بالهندسة نفسها لمكوّن Emblem — مركزه البصري في وسط المشهد */
  const S = Math.min(w, h) * 0.5
  const u = S / 100
  const ox = cx - EMBLEM.center.x * u
  const oy = cy - EMBLEM.center.y * u
  if (mask && mask.length >= 2) {
    const m = mask.length / 2
    for (let i = 0; i < n; i++) {
      const j = Math.floor(rand() * m)
      f.emblem[i * 2] = cx - S / 2 + (mask[j * 2] + (rand() - 0.5) * 0.008) * S
      f.emblem[i * 2 + 1] = cy - S / 2 + (mask[j * 2 + 1] + (rand() - 0.5) * 0.008) * S
    }
    return
  }
  const { edge, fold, line } = EMBLEM.curves
  const bez = (c: readonly (readonly number[])[], t: number, k: 0 | 1) => {
    const v = 1 - t
    return v * v * v * c[0][k] + 3 * v * v * t * c[1][k] + 3 * v * t * t * c[2][k] + t * t * t * c[3][k]
  }
  for (let i = 0; i < n; i++) {
    const r = rand()
    const t = rand()
    let x: number, y: number
    if (r < 0.7) {
      /* داخل الصفحة: بين حافتها العليا وطيّها السفلي */
      const s2 = rand()
      x = bez(edge, t, 0) + (bez(fold, t, 0) - bez(edge, t, 0)) * s2
      y = bez(edge, t, 1) + (bez(fold, t, 1) - bez(edge, t, 1)) * s2
    } else if (r < 0.9) {
      x = bez(line, t, 0) + (rand() - 0.5) * 1.6
      y = bez(line, t, 1) + (rand() - 0.5) * 1.6
    } else {
      /* المعيّن: نصف قطره 9 حول (50، 30) */
      const a = rand() * 2 - 1, q = rand() * 2 - 1
      x = 50 + (a + q) * 4.5
      y = 30 + (a - q) * 4.5
    }
    /* المعيّن على المحور؛ ونصف الصفحات والخطوط مرآة للصفحة اليسرى */
    if (r < 0.9 && rand() < 0.5) x = 100 - x
    f.emblem[i * 2] = ox + x * u
    f.emblem[i * 2 + 1] = oy + y * u
  }
}

export type Pointer = { x: number; y: number; on: number }

/** يحسب مواضع الإطار في f.out */
export function stepField(f: Field, p: number, t: number, ptr: Pointer, dpr: number) {
  const { n, dust, lines, ladder, emblem, seed, out } = f
  const wW = clamp01((p - WINDOWS.write[0]) / (WINDOWS.write[1] - WINDOWS.write[0]))
  const wS = clamp01((p - WINDOWS.stitch[0]) / (WINDOWS.stitch[1] - WINDOWS.stitch[0]))
  const wG = clamp01((p - WINDOWS.gather[0]) / (WINDOWS.gather[1] - WINDOWS.gather[0]))
  const settle = 1 - wW * 0.85
  const glow = wG
  const R = 110
  for (let i = 0; i < n; i++) {
    const j = i * 2
    const delay = seed[i * 4]
    const sw = seed[i * 4 + 1]
    const stag = (w: number) => smooth(clamp01((w - delay) / (1 - 0.38)))
    const a = stag(wW)
    const b = stag(wS)
    const c = stag(wG)

    /* غبار يتنفّس ببطء */
    const dx = dust[j] + Math.sin(t * 0.00031 + i) * 14 * settle
    const dy = dust[j + 1] + Math.cos(t * 0.00027 + i * 1.7) * 12 * settle - ((t * 0.006 + i * 3) % 40) * settle * 0.2

    let x = dx + (lines[j] - dx) * a
    let y = dy + (lines[j + 1] - dy) * a
    x += (ladder[j] - x) * b
    y += (ladder[j + 1] - y) * b
    x += (emblem[j] - x) * c
    y += (emblem[j + 1] - y) * c

    /* انحناء أثناء الانتقال: لا يسير الجسيم في خط مستقيم */
    const mid = Math.sin(a * Math.PI) + Math.sin(b * Math.PI) + Math.sin(c * Math.PI)
    x += sw * mid * 38
    y += Math.cos(sw * 3) * mid * 22

    /* رعشة حيّة خفيفة بعد الاستقرار */
    x += Math.sin(t * 0.0012 + i * 0.7) * 0.6
    y += Math.cos(t * 0.0011 + i * 0.9) * 0.6

    /* المؤشر يزيح الجسيمات بلطف */
    if (ptr.on > 0) {
      const ex = x - ptr.x
      const ey = y - ptr.y
      const d2 = ex * ex + ey * ey
      if (d2 < R * R) {
        const d = Math.sqrt(d2) || 1
        const k = (1 - d / R) ** 2 * 26 * ptr.on
        x += (ex / d) * k
        y += (ey / d) * k
      }
    }

    const o = i * 4
    out[o] = x * dpr
    out[o + 1] = y * dpr
    out[o + 2] = seed[i * 4 + 2] * (1.5 + a * 0.6 * (1 - b) + glow * 0.9) * dpr
    out[o + 3] = Math.min(1, seed[i * 4 + 3] * (0.6 + a * 0.45 * (1 - c) + glow * 0.3))
  }
}

/* ───────── الرسم ───────── */

export type Renderer = {
  draw: (f: Field, w: number, h: number) => void
  resize: (w: number, h: number) => void
  /** يعيد قراءة اللون من الرموز (بعد تبديل الوضع) */
  recolor: () => void
  kind: 'webgl2' | '2d'
}

const VS = `#version 300 es
in vec2 a_pos; in float a_size; in float a_alpha;
uniform vec2 u_res; uniform float u_boost;
out float v_alpha;
void main(){
  vec2 clip = (a_pos / u_res) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = a_size * u_boost;
  v_alpha = a_alpha;
}`
const FS = `#version 300 es
precision mediump float;
in float v_alpha; uniform vec3 u_color; uniform vec3 u_glow; out vec4 o;
void main(){
  /* حبّة متوهجة: نواة صلبة بلون الجسيم + هالة ناعمة بلون التوهّج — تتوهّج على الرقّ كما على الليل */
  float d = length(gl_PointCoord - 0.5);
  float core = smoothstep(0.2, 0.04, d);
  float halo = smoothstep(0.5, 0.12, d) * 0.45;
  float a = clamp(core + halo, 0.0, 1.0) * v_alpha;
  vec3 c = mix(u_glow, u_color, core / max(core + halo, 0.0001));
  o = vec4(c * a, a);
}`

/** ألوان الجسيمات من رموز الهوية: النواة --scene-particle والهالة --scene-glow، ومضاعف الحجم --scene-particle-boost — لا قيمة لون في الشيفرة */
const boostOf = (el: Element) => { const v = parseFloat(getComputedStyle(el).getPropertyValue('--scene-particle-boost')); return Number.isFinite(v) && v > 0 ? v : 1 }
function particleColor(el: Element, token = '--scene-particle'): [number, number, number] {
  const hex = getComputedStyle(el).getPropertyValue(token).trim().replace('#', '')
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
  const n = parseInt(full, 16)
  return Number.isFinite(n) && full.length === 6 ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [224, 188, 110]
}

export function makeRenderer(canvas: HTMLCanvasElement): Renderer | null {
  let [cr, cg, cb] = particleColor(canvas)
  let [hr, hg, hb] = particleColor(canvas, '--scene-glow')
  let boost = boostOf(canvas)
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false, alpha: true })
  if (gl) {
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null
    }
    const vs = sh(gl.VERTEX_SHADER, VS)
    const fs = sh(gl.FRAGMENT_SHADER, FS)
    if (vs && fs) {
      const prog = gl.createProgram()!
      gl.attachShader(prog, vs)
      gl.attachShader(prog, fs)
      gl.linkProgram(prog)
      if (gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        gl.useProgram(prog)
        const buf = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, buf)
        const stride = 16
        const attr = (name: string, size: number, off: number) => {
          const loc = gl.getAttribLocation(prog, name)
          gl.enableVertexAttribArray(loc)
          gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off)
        }
        attr('a_pos', 2, 0)
        attr('a_size', 1, 8)
        attr('a_alpha', 1, 12)
        const uRes = gl.getUniformLocation(prog, 'u_res')
        const uColor = gl.getUniformLocation(prog, 'u_color')
        const uGlow = gl.getUniformLocation(prog, 'u_glow')
        const uBoost = gl.getUniformLocation(prog, 'u_boost')
        const paint = () => {
          gl.uniform3f(uColor, cr / 255, cg / 255, cb / 255)
          gl.uniform3f(uGlow, hr / 255, hg / 255, hb / 255)
          gl.uniform1f(uBoost, boost)
        }
        paint()
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
        return {
          kind: 'webgl2',
          recolor: () => {
            ;[cr, cg, cb] = particleColor(canvas)
            ;[hr, hg, hb] = particleColor(canvas, '--scene-glow')
            boost = boostOf(canvas)
            paint()
          },
          resize: (w, h) => {
            gl.viewport(0, 0, w, h)
            gl.uniform2f(uRes, w, h)
          },
          draw: (f) => {
            gl.clearColor(0, 0, 0, 0)
            gl.clear(gl.COLOR_BUFFER_BIT)
            gl.bufferData(gl.ARRAY_BUFFER, f.out, gl.DYNAMIC_DRAW)
            gl.drawArrays(gl.POINTS, 0, f.n)
          },
        }
      }
    }
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  return {
    kind: '2d',
    resize: () => {},
    recolor: () => { [cr, cg, cb] = particleColor(canvas) },
    draw: (f, w, h) => {
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = `rgb(${cr} ${cg} ${cb})`
      for (let i = 0; i < f.n; i++) {
        const o = i * 4
        const s = f.out[o + 2]
        ctx.globalAlpha = f.out[o + 3]
        ctx.fillRect(f.out[o] - s / 2, f.out[o + 1] - s / 2, s, s)
      }
      ctx.globalAlpha = 1
    },
  }
}
