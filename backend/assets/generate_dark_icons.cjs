const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const assetsDir = path.resolve(__dirname);

async function generate() {
  // 1. FLOXA Mint 'F' Folded Ribbon Logo (transparent 64x64)
  const floxaMintFSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none">
      <path d="M16 12C16 10.8954 16.8954 10 18 10H46C47.1046 10 48 10.8954 48 12V22C48 23.1046 47.1046 24 46 24H28V32H40C41.1046 32 42 32.8954 42 34V42C42 43.1046 41.1046 44 40 44H28V52C28 53.1046 27.1046 54 26 54H18C16.8954 54 16 53.1046 16 52V12Z" fill="url(#mint_grad)" />
      <path d="M16 12C16 10.8954 16.8954 10 18 10H34L26 24H16V12Z" fill="#a7f3d0" />
      <path d="M16 32H34L26 44H16V32Z" fill="#34d399" opacity="0.9" />
      <defs>
        <linearGradient id="mint_grad" x1="16" y1="10" x2="48" y2="54" gradientUnits="userSpaceOnUse">
          <stop stop-color="#4dffa0"/>
          <stop offset="1" stop-color="#059669"/>
        </linearGradient>
      </defs>
    </svg>
  `);

  // 2. Dark Emerald Header Curved Wave Transition (600x70)
  const waveSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="70" viewBox="0 0 600 70" fill="none">
      <rect width="600" height="70" fill="#040906"/>
      <path d="M0,0 Q180,60 300,60 Q420,60 600,0 L600,70 L0,70 Z" fill="#050c08"/>
      <path d="M0,8 Q180,68 300,68 Q420,68 600,8" stroke="url(#line_grad1)" stroke-width="2" fill="none" opacity="0.7"/>
      <path d="M-40,20 Q160,76 300,76 Q440,76 640,20" stroke="url(#line_grad2)" stroke-width="1.5" fill="none" opacity="0.45"/>
      <defs>
        <linearGradient id="line_grad1" x1="0" y1="0" x2="600" y2="0" gradientUnits="userSpaceOnUse">
          <stop stop-color="#040906" stop-opacity="0"/>
          <stop offset="0.3" stop-color="#4dffa0"/>
          <stop offset="0.5" stop-color="#a7f3d0"/>
          <stop offset="0.7" stop-color="#4dffa0"/>
          <stop offset="1" stop-color="#040906" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="line_grad2" x1="0" y1="0" x2="600" y2="0" gradientUnits="userSpaceOnUse">
          <stop stop-color="#040906" stop-opacity="0"/>
          <stop offset="0.5" stop-color="#10b981"/>
          <stop offset="1" stop-color="#040906" stop-opacity="0"/>
        </linearGradient>
      </defs>
    </svg>
  `);

  // 3. Center Circular Glowing Laptop/Workspace Badge (128x128)
  const badgeSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" fill="none">
      <circle cx="64" cy="64" r="56" stroke="rgba(77, 255, 160, 0.22)" stroke-width="8"/>
      <circle cx="64" cy="64" r="50" stroke="#4dffa0" stroke-width="2.5" fill="#05120a"/>
      <g transform="translate(40, 42)">
        <rect x="5" y="4" width="38" height="25" rx="3" stroke="#4dffa0" stroke-width="2" fill="#030805"/>
        <path d="M1 31C1 29.8954 1.89543 29 3 29H45C46.1046 29 47 29.8954 47 31C47 32.5 45.5 33 44 33H4C2.5 33 1 32.5 1 31Z" fill="#4dffa0"/>
        <rect x="20" y="29" width="8" height="1.5" rx="0.75" fill="#05120a"/>
        <path d="M21 11H28V14H24V16H27.5V19H24V23H21V11Z" fill="#4dffa0"/>
      </g>
    </svg>
  `);

  // 4. Folder Icon (32x32)
  const folderSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path d="M4 8C4 6.89543 4.89543 6 6 6H12L15 9H26C27.1046 9 28 9.89543 28 11V23C28 24.1046 27.1046 25 26 25H6C4.89543 25 4 24.1046 4 23V8Z" stroke="#4dffa0" stroke-width="2" stroke-linejoin="round"/>
    </svg>
  `);

  // 5. Building / Company Icon (32x32)
  const buildingSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect x="6" y="6" width="20" height="20" rx="2" stroke="#4dffa0" stroke-width="2"/>
      <rect x="10" y="10" width="3" height="3" fill="#4dffa0"/>
      <rect x="19" y="10" width="3" height="3" fill="#4dffa0"/>
      <rect x="10" y="16" width="3" height="3" fill="#4dffa0"/>
      <rect x="19" y="16" width="3" height="3" fill="#4dffa0"/>
      <rect x="14" y="20" width="4" height="6" fill="#4dffa0"/>
    </svg>
  `);

  // 6. Rupee / Currency Icon (32x32)
  const rupeeSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="12" fill="#4dffa0"/>
      <path d="M12 11H20M12 14.5H20M12 11H15.5C17.5 11 18.5 12 18.5 13.5C18.5 15.5 17 16.5 15 16.5H12L18.5 22" stroke="#04120a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `);

  // 7. Pie Split Icon (32x32)
  const splitSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path d="M16 4C9.37258 4 4 9.37258 4 16C4 22.6274 9.37258 28 16 28C22.6274 28 28 22.6274 28 16H16V4Z" fill="#4dffa0"/>
      <path d="M18 4.2V14H27.8C26.8 8.6 22.8 4.8 18 4.2Z" stroke="#4dffa0" stroke-width="2" stroke-linejoin="round"/>
    </svg>
  `);

  // 8. Headset Support Icon (36x36)
  const headsetSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36" fill="none">
      <path d="M7 18C7 11.9249 11.9249 7 18 7C24.0751 7 29 11.9249 29 18V24C29 25.6569 27.6569 27 26 27H24V19H27V18C27 13.0294 22.9706 9 18 9C13.0294 9 9 13.0294 9 18V19H12V27H10C8.34315 27 7 25.6569 7 24V18Z" stroke="#4dffa0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M24 27V29C24 30.1046 23.1046 31 22 31H18" stroke="#4dffa0" stroke-width="2" stroke-linecap="round"/>
      <circle cx="17" cy="31" r="1.5" fill="#4dffa0"/>
    </svg>
  `);

  await sharp(floxaMintFSvg).png().toFile(path.join(assetsDir, 'floxa-mint-f.png'));
  await sharp(waveSvg).png().toFile(path.join(assetsDir, 'header-wave-green.png'));
  await sharp(badgeSvg).png().toFile(path.join(assetsDir, 'workspace-badge.png'));
  await sharp(folderSvg).png().toFile(path.join(assetsDir, 'icon-folder.png'));
  await sharp(buildingSvg).png().toFile(path.join(assetsDir, 'icon-building.png'));
  await sharp(rupeeSvg).png().toFile(path.join(assetsDir, 'icon-rupee.png'));
  await sharp(splitSvg).png().toFile(path.join(assetsDir, 'icon-split.png'));
  await sharp(headsetSvg).png().toFile(path.join(assetsDir, 'icon-headset.png'));

  console.log('Successfully generated all dark-emerald mockup assets!');
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});
