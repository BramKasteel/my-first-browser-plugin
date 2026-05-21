const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');

const rootDir = path.resolve(__dirname, '..');
const sourceFile = path.join(rootDir, 'icons', 'icon-source.svg');
const outputDir = path.join(rootDir, 'icons');
const sizes = [16, 32, 48, 128, 512];

async function main() {
  const svg = await fs.readFile(sourceFile);

  await Promise.all(
    sizes.map(async (size) => {
      const outputFile = path.join(outputDir, `icon-${size}.png`);

      await sharp(svg)
        .resize(size, size, { fit: 'contain' })
        .png()
        .toFile(outputFile);
    })
  );

  process.stdout.write(`Generated icons: ${sizes.join(', ')}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});