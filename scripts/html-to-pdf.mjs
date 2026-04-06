import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(__dirname, '..', 'docs', 'INVESTOR_PITCH.html');
const pdfPath = path.resolve(__dirname, '..', 'docs', 'INVESTOR_PITCH.pdf');

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();

// Load the HTML file
await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, {
  waitUntil: 'networkidle0',
  timeout: 30000,
});

// Wait for fonts to load
await page.evaluateHandle('document.fonts.ready');

// Generate PDF
await page.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  margin: { top: '0', right: '0', bottom: '0', left: '0' },
  preferCSSPageSize: false,
});

console.log(`PDF saved to ${pdfPath}`);
await browser.close();
