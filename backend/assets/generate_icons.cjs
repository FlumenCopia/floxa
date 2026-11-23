const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const assetsDir = path.resolve(__dirname);

async function generate() {
  // 1. FLOXA 'F' Folded Ribbon Logo (transparent 64x64)
  const floxaFLogoSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none">
      <path d="M16 12C16 10.8954 16.8954 10 18 10H46C47.1046 10 48 10.8954 48 12V22C48 23.1046 47.1046 24 46 24H28V32H40C41.1046 32 42 32.8954 42 34V42C42 43.1046 41.1046 44 40 44H28V52C28 53.1046 27.1046 54 26 54H18C16.8954 54 16 53.1046 16 52V12Z" fill="url(#paint0_linear)" />
      <path d="M16 12C16 10.8954 16.8954 10 18 10H34L26 24H16V12Z" fill="url(#paint1_linear)" />
      <path d="M16 32H34L26 44H16V32Z" fill="url(#paint2_linear)" opacity="0.8" />
      <defs>
        <linearGradient id="paint0_linear" x1="16" y1="10" x2="48" y2="54" gradientUnits="userSpaceOnUse">
          <stop stop-color="#38bdf8"/>
          <stop offset="1" stop-color="#2563eb"/>
        </linearGradient>
        <linearGradient id="paint1_linear" x1="16" y1="10" x2="34" y2="24" gradientUnits="userSpaceOnUse">
          <stop stop-color="#60a5fa"/>
          <stop offset="1" stop-color="#3b82f6"/>
        </linearGradient>
        <linearGradient id="paint2_linear" x1="16" y1="32" x2="34" y2="44" gradientUnits="userSpaceOnUse">
          <stop stop-color="#38bdf8"/>
          <stop offset="1" stop-color="#1d4ed8"/>
        </linearGradient>
      </defs>
    </svg>
  `);

  // 2. Center Circular Floating Badge (128x128) - with glowing soft-blue backdrop & centered emblem
  const badgeSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" fill="none">
      <circle cx="64" cy="64" r="58" fill="#eef2ff" stroke="#ffffff" stroke-width="6"/>
      <circle cx="64" cy="64" r="52" fill="url(#badge_grad)"/>
      <g transform="translate(36, 36) scale(0.875)">
        <path d="M14 10C14 8.89543 14.8954 8 16 8H48C49.1046 8 50 8.89543 50 10V22C50 23.1046 49.1046 24 48 24H28V32H42C43.1046 32 44 32.8954 44 34V42C44 43.1046 43.1046 44 42 44H28V54C28 55.1046 27.1046 56 26 56H16C14.8954 56 14 55.1046 14 54V10Z" fill="url(#f_grad)"/>
        <path d="M14 10C14 8.89543 14.8954 8 16 8H36L26 24H14V10Z" fill="#60a5fa"/>
        <path d="M14 32H36L26 44H14V32Z" fill="#38bdf8"/>
      </g>
      <defs>
        <linearGradient id="badge_grad" x1="64" y1="12" x2="64" y2="116" gradientUnits="userSpaceOnUse">
          <stop stop-color="#f0f5ff"/>
          <stop offset="1" stop-color="#e0e7ff"/>
        </linearGradient>
        <linearGradient id="f_grad" x1="14" y1="8" x2="50" y2="56" gradientUnits="userSpaceOnUse">
          <stop stop-color="#38bdf8"/>
          <stop offset="1" stop-color="#2563eb"/>
        </linearGradient>
      </defs>
    </svg>
  `);

  // 3. Phone Icon (64x64, perfectly centered)
  const phoneSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none">
      <path d="M22.5 14C23.3 14 24.1 14.5 24.5 15.3L27.5 21.8C27.9 22.7 27.6 23.7 26.9 24.3L23.8 26.8C25.6 30.8 28.9 34.1 32.9 35.9L35.4 32.8C36 32.1 37 31.8 37.9 32.2L44.4 35.2C45.2 35.6 45.7 36.4 45.7 37.2V42.5C45.7 44.4 44.1 46 42.2 46C26.6 46 14 33.4 14 17.8C14 15.9 15.6 14.3 17.5 14.3L22.5 14Z" fill="#2563eb"/>
    </svg>
  `);

  // 4. White Header Wave with Curved Transition (width 600, height 40)
  const waveSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="40" viewBox="0 0 600 40" fill="none">
      <rect width="600" height="40" fill="#0b1329"/>
      <path d="M0,40 Q300,-15 600,40 L600,40 L0,40 Z" fill="#ffffff"/>
    </svg>
  `);

  await sharp(floxaFLogoSvg).png().toFile(path.join(assetsDir, 'floxa-f-logo.png'));
  await sharp(badgeSvg).png().toFile(path.join(assetsDir, 'floxa-badge.png'));
  await sharp(phoneSvg).png().toFile(path.join(assetsDir, 'phone-icon.png'));
  await sharp(waveSvg).png().toFile(path.join(assetsDir, 'header-wave.png'));

  console.log('Generated all email assets successfully');
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});
