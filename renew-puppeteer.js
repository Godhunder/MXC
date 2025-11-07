const puppeteer = require("puppeteer");

function timeToMs(time) {
  const parts = time.split(":").map(Number);
  let seconds = 0;

  if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2]; // h:m:s
  else if (parts.length === 2) seconds = parts[0] * 60 + parts[1]; // m:s

  return seconds * 1000;
}

async function start() {
  const email = process.env.EMAIL;
  const password = process.env.PASSWORD;

  while (true) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto("https://yourwebsite.com/login", { waitUntil: "networkidle2" });

    await page.type("#email", email);
    await page.type("#password", password);
    await page.click("#login-button");
    await page.waitForNavigation();

    await page.goto("https://yourwebsite.com/dashboard", { waitUntil: "networkidle2" });

    // Get timer text
    const timerSelector = "#renew-timer"; // ✅ change to correct selector
    let timer = await page.$eval(timerSelector, el => el.innerText.trim());

    console.log("⏳ Current Timer:", timer);

    // Convert timer to ms and wait
    const waitTime = timeToMs(timer);

    console.log(`⌛ Waiting ${timer} ...`);
    await page.waitForTimeout(waitTime + 3000); // wait + small buffer

    // Wait for button to be clickable
    const renewBtn = "button#renew"; // ✅ change selector after screenshot
    await page.waitForSelector(renewBtn, { visible: true });

    console.log("✅ Timer ended, clicking renew...");
    await page.click(renewBtn);

    // Small delay so the action completes before loop restarts
    await page.waitForTimeout(5000);

    await browser.close();
    console.log("🔁 Renewal done! Restarting cycle...");
  }
}

start();
