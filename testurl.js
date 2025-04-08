const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// 要抓取的网页 URL 数组
const urls = ['https://www.google.com', 'https://www.baidu.com', 'https://www.163.com', 'https://www.fidelity.com.tw'];
const MAX_WORKERS = 6;
// 代理服务器地址和端口，这里需要替换为实际的代理信息
const PROXY_SERVER = 'http://your-proxy-server:port';

if (isMainThread) {
    // 主线程逻辑
    const numWorkers = Math.min(MAX_WORKERS, urls.length);
    const urlChunks = [];
    for (let i = 0; i < numWorkers; i++) {
        urlChunks.push([]);
    }
    for (let i = 0; i < urls.length; i++) {
        urlChunks[i % numWorkers].push(urls[i]);
    }

    urlChunks.forEach((chunk) => {
        const worker = new Worker(__filename, { workerData: chunk });
        worker.on('message', (message) => {
            console.log(message);
        });
        worker.on('error', (error) => {
            console.error(`Worker 出错: ${error.message}`);
        });
        worker.on('exit', (code) => {
            if (code !== 0) {
                console.error(`Worker 意外退出，退出码: ${code}`);
            }
        });
    });
} else {
    // 工作线程逻辑
    const workerUrls = workerData;
    (async () => {
        try {
            const browser = await puppeteer.launch({
                args: [`--proxy-server=${PROXY_SERVER}`],
            });
            for (const url of workerUrls) {
                const page = await browser.newPage();
                await page.setExtraHTTPHeaders({
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
                });
                await page.goto(url, {
                    waitUntil: 'networkidle2',
                });
                const content = await page.content();
                const $ = cheerio.load(content);
                const h1 = $('table');
                const sanitizedUrl = url.replace(/[<>:"/\\|?*]/g, '_');
                const fileName = `${sanitizedUrl}.html`;
                const filePath = path.join('./html', fileName);
                fs.writeFile(filePath, content, 'utf8', (err) => {
                    if (err) {
                        parentPort.postMessage(`写入文件时出错: ${err.message}`);
                    } else {
                        parentPort.postMessage(`内容已成功保存到 ${fileName}`);
                    }
                });
                await page.close();
            }
            await browser.close();
        } catch (error) {
            parentPort.postMessage(`请求发生错误: ${error.message}`);
        }
    })();
}
