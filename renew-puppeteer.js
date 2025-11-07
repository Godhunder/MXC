// renew-puppeteer.js
require('dotenv').config();
const fs = require('fs').promises;
const puppeteer = require('puppeteer');

const LOGIN_URL = process.env.LOGIN_URL;
const DASHBOARD_URL = process.env.DASHBOARD_URL;
const USERNAME = process.env.USERNAME;
const PASSWORD = process.env.PASSWORD;
const EMAIL_SELECTOR = process.env.EMAIL_SELECTOR || 'input[name="email"]';
const PASSWORD_SELECTOR = process.env.PASSWORD_SELECTOR || 'input[name="password"]';
const LOGIN_BUTTON_SELECTOR = process.env.LOGIN_BUTTON_SELECTOR || 'button[type="submit"]';
const RENEW_BUTTON_SELECTOR = process.env.RENEW_BUTTON_SELECTOR || 'button.purple-renew';
const CONFIRM_BUTTON_SELECTOR = process.env.CONFIRM_BUTTON_SELECTOR || 'button.confirm-yes';
const REMAINING_SELECTOR = process.env.REMAINING_SELECTOR || '.time-remaining';
const COOKIE_FILE = process.env.COOKIE_FILE || './cookies.json';
const HEADLESS = process.env.HEADLESS !== 'false';
const RENEW_THRESHOLD_MINUTES = parseInt(process.env.RENEW_THRESHOLD_MINUTES || '50', 10);

function parseTimeRemaining(text) {
  // Try multiple formats: "16:52:00", "16h 52m", "16 hours 52 minutes", "16:52"
  if (!text || typeof text !== 'string') return null;
  text = text.trim();

  // Format hh:mm:ss or hh:mm
  const hm = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (hm) {
    const hours = parseInt(hm[1], 10);
    const mins = parseInt(hm[2], 10);
    return hours * 60 + mins;
  }

  // Format "16h 52m" or "16 h 52 m"
  const hmatch = text.match(/(\d{1,3})\s*h/);
  const mmatch = text.match(/(\d{1,3})\s*m/);
  if (hmatch || mmatch) {
    const hours = hmatch ? parseInt(hmatch[1], 10) : 0;
    const mins = mmatch ? parseInt(mmatch[1], 10) : 0;
    return hours * 60 + mins;
  }

  // Format e.g. "16 hours"
  const hoursOnly = text.match(/(\d{1,3})\s*hour/);
  if (hoursOnly) return parseInt(hoursOnly[1], 10) * 60;
  return null;
}

async function loadCookies(page) {
  try {
    const content = await fs.readFile(COOKIE_FILE, 'utf8');
    const cookies = JSON.parse(content);
    await page.setCookie(...cookies);
    console.log('Loaded cookies from', COOKIE_FILE);
    return true;
  } catch (e) {
    // no cookie file
    return false;
  }
}

async function saveCookies(page) {
  const cookies = await page.cookies();
  await fs.writeFile(COOKIE_FILE, JSON.stringify(cookies, null, 2));
  console.log('Saved cookies to', COOKIE_FILE);
}

(async () => {
  if (!LOGIN_URL || !DASHBOARD_URL || !USERNAME || !PASSWORD) {
    console.error('Set LOGIN_URL, DASHBOARD_URL, USERNAME, PASSWORD in .env');
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: HEADLESS,
    args: ['--no-sandbox','--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  try {
    // Try restore session cookies
    const hadCookies = await loadCookies(page);

    // If had cookies, navigate to dashboard and check if still logged in
    if (hadCookies) {
      await page.goto(DASHBOARD_URL, { waitUntil: 'networkidle2' });
      // Detect logged-out state by looking for login fields or missing renew button
      const loggedOut = await page.$(LOGIN_BUTTON_SELECTOR);
      if (loggedOut) {
        console.log('Saved cookies did not authenticate — will login again.');
      } else {
        console.log('Session restored by cookies.');
      }
    }

    // If no cookies or cookies invalid -> login flow
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2' });
    // If login page has email input -> perform login
    const emailEl = await page.$(EMAIL_SELECTOR);
    if (emailEl) {
      console.log('Logging in with provided credentials...');
      await page.type(EMAIL_SELECTOR, USERNAME, { delay: 50 });
      await page.type(PASSWORD_SELECTOR, PASSWORD, { delay: 50 });
      await Promise.all([
        page.click(LOGIN_BUTTON_SELECTOR),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(()=>null)
      ]);
      // Save cookies after login
      await saveCookies(page);
    } else {
      console.log('No login form found — maybe already logged in');
    }

    // Go to dashboard page
    await page.goto(DASHBOARD_URL, { waitUntil: 'networkidle2' });

    // Read remaining time
    let remainingText = null;
    try {
      await page.waitForSelector(REMAINING_SELECTOR, { timeout: 5000 });
      remainingText = await page.$eval(REMAINING_SELECTOR, el => el.innerText.trim());
      console.log('Remaining element text:', remainingText);
    } catch (e) {
      console.warn('Could not find remaining time element:', REMAINING_SELECTOR);
    }

    const minsLeft = parseTimeRemaining(remainingText);
    if (minsLeft === null) {
      console.warn('Could not parse remaining time; proceeding to renew to be safe.');
    } else {
      console.log(`Time remaining (minutes): ${minsLeft}`);
      if (minsLeft > RENEW_THRESHOLD_MINUTES) {
        console.log(`Remaining > threshold (${RENEW_THRESHOLD_MINUTES} min). No renew needed.`);
        await browser.close();
        process.exit(0);
      }
    }

    // Click renew button
    await page.waitForSelector(RENEW_BUTTON_SELECTOR, { timeout: 10000 });
    await page.click(RENEW_BUTTON_SELECTOR);
    console.log('Clicked renew button');

    // Handle confirmation modal if present
    try {
      await page.waitForSelector(CONFIRM_BUTTON_SELECTOR, { timeout: 3000 });
      await page.click(CONFIRM_BUTTON_SELECTOR);
      console.log('Clicked confirm button');
    } catch (e) {
      // no confirm button
    }

    // Optional: save cookies again
    await saveCookies(page);

    // Wait briefly for any toast/message and log it
    await page.waitForTimeout(2000);
    const toast = await page.evaluate(() => {
      const t = document.querySelector('.toast, .alert, .notification, .toast-message');
      return t ? t.innerText.trim() : null;
    });
    if (toast) console.log('Notification:', toast);

    console.log('Renew finished successfully (or attempted).');
  } catch (err) {
    console.error('Automation error:', err);
  } finally {
    await browser.close();
  }
})();
