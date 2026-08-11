/* 네이티브 앱 아이콘과 스플래시를 만든다.
 *
 * 웹 아이콘과 같은 그림(돌탑)을 각 플랫폼이 요구하는 크기로 뽑는다.
 * Chromium으로 SVG를 렌더해 PNG로 저장하므로 별도 이미지 도구가 필요 없다.
 *
 *   node scripts/make-native-assets.js
 */

const { launchBrowser } = require("../test/browser");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const BG = "#26241f"; // 아이콘 배경 (짙은 잉크)
const SPLASH_BG = "#f7f6f3"; // 실행 화면 배경 (앱 배경과 같게)
const SPLASH_BG_NIGHT = "#161513"; // 어두운 테마에서 흰 화면이 번쩍이지 않도록

/* 돌탑 그림 — 웹 아이콘과 같은 규칙(두께·광원·그림자) */
function cairnArt(shiftY) {
  const stones = [
    { cy: 700, rx: 260, ry: 88 },
    { cy: 540, rx: 205, ry: 74 },
    { cy: 400, rx: 155, ry: 60 },
  ];
  const piece = (s, i) => {
    const t = s.ry * 0.66;
    const tilt = i % 2 === 0 ? -1.8 : 1.8;
    const cx = 500 + (i % 2 === 0 ? -8 : 8);
    return `<g transform="rotate(${tilt} ${cx} ${s.cy})">
      <ellipse cx="${cx + s.rx * 0.09}" cy="${s.cy + t + s.ry * 0.42}" rx="${s.rx * 0.95}" ry="${s.ry * 0.52}"
        fill="rgba(52,44,33,0.34)" filter="url(#b)"/>
      <ellipse cx="${cx}" cy="${s.cy + t}" rx="${s.rx}" ry="${s.ry}" fill="url(#side)"/>
      <ellipse cx="${cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}" fill="url(#top)"/>
      <ellipse cx="${cx - s.rx * 0.26}" cy="${s.cy - s.ry * 0.32}" rx="${s.rx * 0.28}" ry="${s.ry * 0.24}"
        fill="rgba(255,252,244,0.28)"/>
    </g>`;
  };
  return `<g transform="translate(0 ${shiftY})">
    <ellipse cx="516" cy="806" rx="300" ry="34" fill="rgba(74,64,48,0.18)" filter="url(#gb)"/>
    ${stones.map(piece).join("\n")}
  </g>`;
}

const DEFS = `<defs>
  <radialGradient id="side" cx="33%" cy="20%" r="92%">
    <stop offset="0%" stop-color="#ded8cc"/><stop offset="34%" stop-color="#bdb4a2"/>
    <stop offset="72%" stop-color="#8f8674"/><stop offset="100%" stop-color="#655d4e"/>
  </radialGradient>
  <radialGradient id="top" cx="32%" cy="24%" r="86%">
    <stop offset="0%" stop-color="#e3ddd1"/><stop offset="46%" stop-color="#c7bfae"/>
    <stop offset="100%" stop-color="#a19885"/>
  </radialGradient>
  <filter id="b" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="9"/></filter>
  <filter id="gb" x="-60%" y="-120%" width="220%" height="340%"><feGaussianBlur stdDeviation="16"/></filter>
</defs>`;

function iconSVG(size, inset, bg) {
  const scale = 1 - inset * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1000 1000">
    ${DEFS}<rect width="1000" height="1000" fill="${bg}"/>
    <g transform="translate(${1000 * inset} ${1000 * inset}) scale(${scale})">${cairnArt(-95)}</g>
  </svg>`;
}

/* 안드로이드 적응형 아이콘의 앞면 — 배경은 따로 깔리므로 투명 */
function foregroundSVG(size) {
  const inset = 0.26; // 안전 영역(가운데 66%) 안으로
  const scale = 1 - inset * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1000 1000">
    ${DEFS}<g transform="translate(${1000 * inset} ${1000 * inset}) scale(${scale})">${cairnArt(-95)}</g>
  </svg>`;
}

/* 실행 화면 — 가운데 돌탑 하나 */
function splashSVG(w, h, bg = SPLASH_BG) {
  const s = Math.min(w, h) * 0.34;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    ${DEFS}<rect width="${w}" height="${h}" fill="${bg}"/>
    <g transform="translate(${w / 2 - s / 2} ${h / 2 - s / 2}) scale(${s / 1000})">${cairnArt(-60)}</g>
  </svg>`;
}

const ANDROID_ICONS = [
  ["mipmap-mdpi", 48],
  ["mipmap-hdpi", 72],
  ["mipmap-xhdpi", 96],
  ["mipmap-xxhdpi", 144],
  ["mipmap-xxxhdpi", 192],
];

const ANDROID_SPLASH = [
  ["drawable-port-mdpi", 320, 480],
  ["drawable-port-hdpi", 480, 800],
  ["drawable-port-xhdpi", 720, 1280],
  ["drawable-port-xxhdpi", 960, 1600],
  ["drawable-port-xxxhdpi", 1280, 1920],
  ["drawable-land-mdpi", 480, 320],
  ["drawable-land-hdpi", 800, 480],
  ["drawable-land-xhdpi", 1280, 720],
  ["drawable-land-xxhdpi", 1600, 960],
  ["drawable-land-xxxhdpi", 1920, 1280],
  ["drawable", 480, 800],
];

(async () => {
  const browser = await launchBrowser();

  const shoot = async (svg, w, h, outPath, transparent) => {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.setContent(`<style>html,body{margin:0;padding:0}</style>${svg}`, { waitUntil: "load" });
    await page.waitForTimeout(60);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await page.screenshot({ path: outPath, omitBackground: !!transparent });
    await page.close();
  };

  let made = 0;

  // ── 안드로이드
  const androidRes = path.join(ROOT, "android/app/src/main/res");
  if (fs.existsSync(androidRes)) {
    for (const [dir, size] of ANDROID_ICONS) {
      await shoot(iconSVG(size, 0.1, BG), size, size, path.join(androidRes, dir, "ic_launcher.png"));
      await shoot(iconSVG(size, 0.1, BG), size, size, path.join(androidRes, dir, "ic_launcher_round.png"));
      // 적응형 아이콘 앞면은 배경 없이
      await shoot(
        foregroundSVG(size * 2),
        size * 2,
        size * 2,
        path.join(androidRes, dir, "ic_launcher_foreground.png"),
        true
      );
      made += 3;
    }
    // 적응형 아이콘 배경색
    const valuesDir = path.join(androidRes, "values");
    fs.mkdirSync(valuesDir, { recursive: true });
    fs.writeFileSync(
      path.join(valuesDir, "ic_launcher_background.xml"),
      `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`
    );

    for (const [dir, w, h] of ANDROID_SPLASH) {
      await shoot(splashSVG(w, h), w, h, path.join(androidRes, dir, "splash.png"));
      // 어두운 테마용 — 안드로이드가 -night 한정자를 보고 알아서 골라 쓴다
      // (한정자 순서: 방향 → night → 밀도)
      const nightDir = dir === "drawable" ? "drawable-night" : dir.replace(/-(mdpi|hdpi|xhdpi|xxhdpi|xxxhdpi)$/, "-night-$1");
      await shoot(splashSVG(w, h, SPLASH_BG_NIGHT), w, h, path.join(androidRes, nightDir, "splash.png"));
      made += 2;
    }
    console.log("안드로이드 아이콘·스플래시 완료");
  } else {
    console.log("안드로이드 프로젝트가 없어 건너뜁니다 (npx cap add android)");
  }

  // ── iOS
  const iosIconDir = path.join(ROOT, "ios/App/App/Assets.xcassets/AppIcon.appiconset");
  if (fs.existsSync(iosIconDir)) {
    // Xcode 14+ 는 1024 한 장이면 나머지를 알아서 만든다
    await shoot(iconSVG(1024, 0.1, BG), 1024, 1024, path.join(iosIconDir, "AppIcon-512@2x.png"));
    made += 1;

    const iosSplashDir = path.join(ROOT, "ios/App/App/Assets.xcassets/Splash.imageset");
    for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
      await shoot(splashSVG(2732, 2732), 2732, 2732, path.join(iosSplashDir, name));
      made += 1;
    }
    console.log("iOS 아이콘·스플래시 완료");
  } else {
    console.log("iOS 프로젝트가 없어 건너뜁니다 (npx cap add ios)");
  }

  await browser.close();
  console.log(`이미지 ${made}장 생성`);
})();
