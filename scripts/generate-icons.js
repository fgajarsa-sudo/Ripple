const sharp = require('sharp');
const path = require('path');

const NAVY = '#193841';
const TEAL = '#16827d';
const CREAM = '#f6f9f7';

// lucide "waves" icon, original 24x24 viewBox, 3 stroke paths
const WAVES_PATHS = [
  'M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1',
  'M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1',
  'M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1',
];

// stroke-width is in the *pre-transform* 24-unit coordinate system — the group's scale()
// transform scales it automatically, so this should stay close to the original icon's 2.5,
// not be pre-multiplied by scale (that was the bug: it got applied twice).
function wavesGroup({ scale, stroke, strokeWidth = 2.5, cx = 512, cy = 512 }) {
  const tx = cx - 12 * scale;
  const ty = cy - 12 * scale;
  const paths = WAVES_PATHS.map(
    (d) =>
      `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />`
  ).join('\n    ');
  return `<g transform="translate(${tx} ${ty}) scale(${scale})">\n    ${paths}\n  </g>`;
}

function svg(inner, size = 1024) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${inner}</svg>`;
}

async function render(svgString, outPath, size = 1024, { flattenBackground } = {}) {
  let pipeline = sharp(Buffer.from(svgString)).resize(size, size);
  if (flattenBackground) {
    // App Store review (not just TestFlight processing) rejects icons with an alpha
    // channel, even fully-opaque ones — .flatten() strips it, unlike a solid background
    // rect alone, which still leaves the PNG's alpha channel present structurally.
    pipeline = pipeline.flatten({ background: flattenBackground });
  }
  await pipeline.png().toFile(outPath);
  console.log('wrote', outPath);
}

async function main() {
  const assets = path.join(__dirname, '..', 'assets');

  // Main app icon (iOS + general): navy bg, teal circle, white waves — mirrors the in-app header lockup.
  await render(
    svg(`
      <rect width="1024" height="1024" fill="${NAVY}" />
      <circle cx="512" cy="512" r="400" fill="${TEAL}" />
      ${wavesGroup({ scale: 20, stroke: CREAM })}
    `),
    path.join(assets, 'icon.png'),
    1024,
    { flattenBackground: NAVY }
  );

  // Android adaptive icon background: solid navy, full bleed (launcher applies its own mask).
  await render(svg(`<rect width="1024" height="1024" fill="${NAVY}" />`), path.join(assets, 'android-icon-background.png'));

  // Android adaptive icon foreground: teal circle + waves, sized to survive launcher masking
  // (masks crop ~33% from each edge, so keep the circle well within the safe zone).
  await render(
    svg(`
      <circle cx="512" cy="512" r="290" fill="${TEAL}" />
      ${wavesGroup({ scale: 14.5, stroke: CREAM })}
    `),
    path.join(assets, 'android-icon-foreground.png')
  );

  // Android 13+ themed monochrome icon: single glyph, no background — the OS tints it.
  await render(
    svg(`${wavesGroup({ scale: 18, stroke: '#ffffff' })}`),
    path.join(assets, 'android-icon-monochrome.png')
  );

  // Favicon (web, low priority but keep consistent)
  await render(
    svg(`
      <rect width="1024" height="1024" fill="${NAVY}" />
      <circle cx="512" cy="512" r="400" fill="${TEAL}" />
      ${wavesGroup({ scale: 20, stroke: CREAM })}
    `),
    path.join(assets, 'favicon.png'),
    196
  );

  // Splash icon: transparent bg (composited over adaptiveIcon/splash backgroundColor by Expo),
  // just the teal circle + waves mark.
  await render(
    svg(`
      <circle cx="512" cy="512" r="400" fill="${TEAL}" />
      ${wavesGroup({ scale: 20, stroke: CREAM })}
    `),
    path.join(assets, 'splash-icon.png')
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
