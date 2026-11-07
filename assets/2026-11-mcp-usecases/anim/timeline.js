// 撮影スクリプトが window.seek(ms) でフレームごとに時刻を指定する
const D = window.DURATION;

function el(sel) {
  return typeof sel === "string" ? document.querySelector(sel) : sel;
}

// frames: [[ms, {css}], ...]。最初と最後の状態を前後に延ばす
function tl(sel, frames, easing = "ease-in-out") {
  const kf = [{ offset: 0, ...frames[0][1] }];
  for (const [ms, props] of frames) {
    kf.push({ offset: ms / D, easing, ...props });
  }
  kf.push({ offset: 1, ...frames[frames.length - 1][1] });
  el(sel).animate(kf, { duration: D, fill: "both" }).pause();
}

// 下から浮かび上がって表示し、hideAt があればフェードアウトする
function show(sel, at, hideAt) {
  const frames = [
    [at, { opacity: 0, transform: "translateY(8px)" }],
    [at + 350, { opacity: 1, transform: "translateY(0)" }],
  ];
  if (hideAt) frames.push([hideAt, { opacity: 1, transform: "translateY(0)" }], [hideAt + 300, { opacity: 0, transform: "translateY(0)" }]);
  tl(sel, frames);
}

// from/to は [x, y]。移動の前後は見えない
function move(sel, start, end, from, to) {
  const t = (x, y, s = 1) => `translate(${x}px, ${y}px) scale(${s})`;
  tl(sel, [
    [start - 200, { opacity: 0, transform: t(...from, 0.6) }],
    [start, { opacity: 1, transform: t(...from) }],
    [end, { opacity: 1, transform: t(...to) }],
    [end + 250, { opacity: 0, transform: t(...to, 0.6) }],
  ]);
}

// 左から右へ文字が現れる
function type(sel, start, dur) {
  tl(sel, [[start, { clipPath: "inset(0 100% 0 0)" }], [start + dur, { clipPath: "inset(0 0% 0 0)" }]], "linear");
}

// 線の上を点線が流れ、通信中であることを示す
function flow(sel, start, end, reverse = false) {
  const len = (end - start) / 12;
  tl(sel, [
    [start - 150, { opacity: 0.25, strokeDashoffset: 0 }],
    [start, { opacity: 1, strokeDashoffset: 0 }],
    [end, { opacity: 1, strokeDashoffset: reverse ? len : -len }],
    [end + 200, { opacity: 0.25, strokeDashoffset: reverse ? len : -len }],
  ], "linear");
}

// 上部の手順の丸を光らせる
function step(i, at, until, color) {
  const on = { background: color, borderColor: color, color: "#0b1020" };
  const off = { background: "transparent", borderColor: "#26324f", color: "#94a3b8" };
  const frames = [[at, off], [at + 200, on]];
  if (until) frames.push([until, on], [until + 200, { background: "transparent", borderColor: color, color }]);
  tl(`#d${i}`, frames);
}

window.seek = (ms) => {
  for (const a of document.getAnimations()) a.currentTime = ms;
};
