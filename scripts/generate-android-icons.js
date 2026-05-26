// Generate Android launcher icons from a source square logo.
// Writes legacy (ic_launcher.png, ic_launcher_round.png) and adaptive
// foreground (ic_launcher_foreground.png) PNGs into the SFS-Care
// android/app/src/main/res/mipmap-{density}/ folders.
//
// Adaptive icon background stays a flat #FFFFFF defined in values/.

const path = require('path');
const fs   = require('fs');
const sharp = require('sharp');

const SOURCE = path.resolve(__dirname, '..', 'assets', 'images', 'logo.jpg');
const ANDROID_RES = 'C:/Users/ANANDO POHTAM/OneDrive/Desktop/SFS-Care/android/app/src/main/res';

// Density multipliers
const DENSITIES = {
  'mdpi':    1,
  'hdpi':    1.5,
  'xhdpi':   2,
  'xxhdpi':  3,
  'xxxhdpi': 4,
};

// Legacy launcher icon base size (48dp). Final = 48 * density.
const LEGACY_BASE   = 48;
// Adaptive icon foreground canvas (108dp). Final = 108 * density.
const ADAPTIVE_BASE = 108;
// Logo should fit within the 66dp safe zone (61% of 108dp).
const SAFE_RATIO    = 0.61;

async function makeRoundMask(size) {
  const r = Math.floor(size / 2);
  const svg = `<svg width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/></svg>`;
  return Buffer.from(svg);
}

async function generateForDensity(density, mult) {
  const dir = path.join(ANDROID_RES, `mipmap-${density}`);
  if (!fs.existsSync(dir)) throw new Error(`Missing folder: ${dir}`);

  const legacySize    = Math.round(LEGACY_BASE   * mult);
  const adaptiveSize  = Math.round(ADAPTIVE_BASE * mult);
  const logoFgSize    = Math.round(adaptiveSize  * SAFE_RATIO);

  // 1) ic_launcher.png — logo on a white square, fills the icon
  await sharp(SOURCE)
    .resize(legacySize, legacySize, { fit: 'cover' })
    .flatten({ background: '#FFFFFF' })
    .png()
    .toFile(path.join(dir, 'ic_launcher.png'));

  // 2) ic_launcher_round.png — same logo, masked to circle
  const roundMask = await makeRoundMask(legacySize);
  await sharp(SOURCE)
    .resize(legacySize, legacySize, { fit: 'cover' })
    .flatten({ background: '#FFFFFF' })
    .composite([{ input: roundMask, blend: 'dest-in' }])
    .png()
    .toFile(path.join(dir, 'ic_launcher_round.png'));

  // 3) ic_launcher_foreground.png — logo at ~60% on transparent canvas
  //    (background color comes from values/ic_launcher_background.xml)
  const logoOnly = await sharp(SOURCE)
    .resize(logoFgSize, logoFgSize, { fit: 'cover' })
    .flatten({ background: '#FFFFFF' })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: adaptiveSize,
      height: adaptiveSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: logoOnly, gravity: 'center' }])
    .png()
    .toFile(path.join(dir, 'ic_launcher_foreground.png'));

  console.log(`  ${density.padEnd(8)} → ic_launcher(${legacySize}px) round(${legacySize}px) foreground(${adaptiveSize}px, logo ${logoFgSize}px)`);
}

(async () => {
  if (!fs.existsSync(SOURCE)) {
    console.error('Source logo not found:', SOURCE);
    process.exit(1);
  }
  console.log('Generating Android launcher icons from', SOURCE);
  for (const [d, mult] of Object.entries(DENSITIES)) {
    await generateForDensity(d, mult);
  }
  console.log('Done.');
})().catch((e) => {
  console.error('Icon generation failed:', e.message);
  process.exit(1);
});
