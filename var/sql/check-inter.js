// check-inter.js ─ smoke-test Inter for fontkit, PDFKit & node-canvas
const fs          = require('fs');
const path        = require('path');
const fontkit     = require('fontkit');            // low-level parser PDFKit uses
const PDFDocument = require('pdfkit');
const { registerFont, createCanvas } = require('canvas');

// ── 1. where the ZIP was extracted ─────────────────────────────────────────
const FONT_DIR = '/usr/local/share/fonts/truetype/inter';

// helper – find the first static TTF that exists
function pickStaticTTF(candidates) {
  for (const name of candidates) {
    const p = path.join(FONT_DIR, name);
    if (fs.existsSync(p)) return p;                 // true if file is there :contentReference[oaicite:2]{index=2}
  }
  return null;
}

const REGULAR_TT = pickStaticTTF([
  'Inter-Regular.ttf',
  'InterDisplay-Regular.ttf',
  'InterRoman-Regular.ttf'
]);
const BOLD_TT    = pickStaticTTF([
  'Inter-Bold.ttf',
  'InterDisplay-Bold.ttf',
  'InterRoman-Bold.ttf'
]);

if (!REGULAR_TT || !BOLD_TT) {
  console.error('❌  Static Regular/Bold TTFs not found — did you unzip the ZIP?');
  process.exit(1);
}

console.log(`✓  Using\n    Regular → ${REGULAR_TT}\n    Bold    → ${BOLD_TT}`);

// ── 2. fontkit parse check ────────────────────────────────────────────────
[REGULAR_TT, BOLD_TT].forEach(f => {
  const font = fontkit.openSync(f);                // throws if unreadable :contentReference[oaicite:3]{index=3}
  console.log(`   [fontkit] "${font.familyName}" "${font.subfamilyName}" OK`);
});

// ── 3. PDFKit embed check ─────────────────────────────────────────────────
(async () => {
  const doc = new PDFDocument();
  doc.registerFont('Inter', REGULAR_TT);            // normal face :contentReference[oaicite:4]{index=4}
  doc.registerFont('Inter-Bold', BOLD_TT);          // bold face

  const out = fs.createWriteStream('/tmp/inter-probe.pdf');
  doc.pipe(out);
  doc.font('Inter').fontSize(12).text('Inter Regular → ✓');
  doc.moveDown();
  doc.font('Inter-Bold').fontSize(12).text('Inter Bold → ✓');
  doc.end();

  await new Promise(r => out.on('finish', r));
  console.log('   [PDFKit]  /tmp/inter-probe.pdf generated');
})();

// ── 4. node-canvas render check ───────────────────────────────────────────
registerFont(REGULAR_TT, { family: 'Inter', weight: 'normal' }); // :contentReference[oaicite:5]{index=5}
registerFont(BOLD_TT,    { family: 'Inter', weight: 'bold'    });

const canvas = createCanvas(220, 60);
const ctx    = canvas.getContext('2d');
ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 220, 60);
ctx.fillStyle = '#000';
ctx.font = '12px "Inter"';        ctx.fillText('Regular ✓', 10, 20);
ctx.font = 'bold 12px "Inter"';   ctx.fillText('Bold ✓',    10, 40);
fs.writeFileSync('/tmp/inter-probe.png', canvas.toBuffer('image/png'));
console.log('   [canvas]  /tmp/inter-probe.png generated');

console.log('\nAll checks passed – Inter parses & embeds cleanly 🎉');
