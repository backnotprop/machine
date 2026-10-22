// Write a scratch page that shows given SVG files at 1200 px and 80 px, on dark and light.
// Usage: node docs/brand/logo-src/preview.mjs out.html file.svg [file.svg ...]
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const [out, ...files] = process.argv.slice(2);
const row = (f) => `<section><div class="big"><img src="file://${resolve(f)}" width="1200"></div><div class="small"><img src="file://${resolve(f)}" width="80"><span>${f.split('/').pop()}</span><img src="file://${resolve(f)}" width="160"><img src="file://${resolve(f)}" width="320"></div></section>`;
writeFileSync(out, `<!doctype html><html><body style="margin:0;background:#08080a;color:#888;font:12px monospace">
<style>section{padding:24px 40px;border-bottom:1px solid #222}.small{display:flex;gap:24px;align-items:center;margin-top:16px}.light{background:#ecebe6}</style>
${files.map(row).join('')}</body></html>`);
