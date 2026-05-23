export function generateBadgeSvg(tokenId: number): string {
  const idStr = `#${tokenId}`;
  const hue = (tokenId * 47) % 360;
  const accentH = (270 + hue) % 360;
  const accentH2 = (accentH + 40) % 360;

  return `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0d0719"/>
      <stop offset="50%" stop-color="#1e0b36"/>
      <stop offset="100%" stop-color="#0a0f1e"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="38%" r="55%">
      <stop offset="0%" stop-color="hsl(${accentH},80%,55%)" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="hsl(${accentH},80%,55%)" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="hsl(${accentH},70%,50%)" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="hsl(${accentH},60%,35%)" stop-opacity="0.15"/>
    </linearGradient>
    <linearGradient id="borderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="hsl(${accentH},80%,60%)"/>
      <stop offset="100%" stop-color="hsl(${accentH2},70%,50%)"/>
    </linearGradient>
    <filter id="softGlow">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <rect width="512" height="512" fill="url(#bg)" rx="52"/>
  <rect width="512" height="512" fill="url(#glow)" rx="52"/>
  <rect x="2" y="2" width="508" height="508" fill="none" stroke="url(#borderGrad)" stroke-width="2.5" rx="50" opacity="0.55"/>
  <rect x="10" y="10" width="492" height="492" fill="none" stroke="hsl(${accentH},60%,60%)" stroke-width="0.75" rx="44" opacity="0.2"/>

  <path d="M256 95 L368 148 L368 272 Q368 362 256 420 Q144 362 144 272 L144 148 Z"
        fill="url(#shieldGrad)"
        stroke="hsl(${accentH},70%,60%)"
        stroke-width="1.5"
        stroke-opacity="0.5"/>
  <path d="M256 118 L350 163 L350 272 Q350 346 256 396 Q162 346 162 272 L162 163 Z"
        fill="none"
        stroke="hsl(${accentH},80%,75%)"
        stroke-width="0.75"
        stroke-opacity="0.25"/>

  <path d="M212 268 L242 298 L306 234"
        fill="none"
        stroke="hsl(${accentH},85%,72%)"
        stroke-width="10"
        stroke-linecap="round"
        stroke-linejoin="round"
        filter="url(#softGlow)"/>

  <text x="256" y="72"
        text-anchor="middle"
        font-family="'Arial Black', 'Arial Bold', Arial, sans-serif"
        font-size="36"
        font-weight="900"
        letter-spacing="12"
        fill="white"
        opacity="0.95">KIUT</text>

  <text x="256" y="458"
        text-anchor="middle"
        font-family="'Courier New', 'Courier', monospace"
        font-size="38"
        font-weight="700"
        fill="hsl(${accentH},85%,72%)"
        filter="url(#softGlow)">${idStr}</text>

  <text x="256" y="490"
        text-anchor="middle"
        font-family="Arial, sans-serif"
        font-size="11"
        letter-spacing="3.5"
        fill="white"
        opacity="0.35">VERIFIED HUMAN · INKONCHAIN</text>

  <circle cx="32" cy="32" r="2.5" fill="hsl(${accentH},70%,60%)" opacity="0.4"/>
  <circle cx="480" cy="32" r="2.5" fill="hsl(${accentH},70%,60%)" opacity="0.4"/>
  <circle cx="32" cy="480" r="2.5" fill="hsl(${accentH},70%,60%)" opacity="0.4"/>
  <circle cx="480" cy="480" r="2.5" fill="hsl(${accentH},70%,60%)" opacity="0.4"/>
</svg>`;
}
