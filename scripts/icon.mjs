import { chromium } from "playwright";
import fs from "node:fs";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 256, height: 256 } });
  await page.setContent(
    '<style>body{margin:0}</style><svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" rx="56" fill="#182a22"/><path d="M65 64h132v34H99v32h76v34H99v34H65z" fill="#c3e6b7"/><circle cx="184" cy="183" r="17" fill="#719e7c"/></svg>',
  );
  const png = await page.screenshot({
    path: "public/icon.png",
    omitBackground: true,
  });
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  fs.writeFileSync("public/icon.ico", Buffer.concat([header, png]));
} finally {
  await browser.close();
}
