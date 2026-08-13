import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  
  await page.goto('http://localhost:5173/admin', { waitUntil: 'networkidle0' });
  
  // We need to set upload date
  await page.type('input[type="date"]', '06012026'); // Depends on locale, might be YYYY-MM-DD in value
  await page.$eval('input[type="date"]', el => el.value = '2026-06-01');
  
  // Create dummy CSV files and attach them
  const dummyCSV = 'ProductName,Category,Items viewed,Items added to cart,Items purchased,Gross item revenue,Total users\nTest,Cat,10,5,2,100,1';
  
  import { writeFileSync } from 'fs';
  writeFileSync('dummy.csv', dummyCSV);
  
  const fileInputs = await page.$$('input[type="file"]');
  await fileInputs[0].uploadFile('dummy.csv'); // Web
  await fileInputs[1].uploadFile('dummy.csv'); // App
  await fileInputs[2].uploadFile('dummy.csv'); // FIS Web
  await fileInputs[3].uploadFile('dummy.csv'); // FIS App
  
  // Click process
  await page.click('.process-btn');
  
  // Wait for result
  await page.waitForSelector('.status-banner');
  const result = await page.$eval('.status-banner span', el => el.textContent);
  console.log("RESULT:", result);
  
  // also wait a bit for any logs
  await new Promise(r => setTimeout(r, 1000));
  
  await browser.close();
})();
