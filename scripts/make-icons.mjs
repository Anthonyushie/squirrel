// Renders public/icon.svg to the PNG sizes the web app manifest and iOS need.
// Run: node scripts/make-icons.mjs
import sharp from 'sharp';

for (const size of [192, 512]) {
	await sharp('public/icon.svg', { density: 384 }).resize(size, size).png().toFile(`public/icon-${size}.png`);
	console.log(`public/icon-${size}.png`);
}
