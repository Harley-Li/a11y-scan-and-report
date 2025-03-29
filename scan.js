import lighthouse from 'lighthouse';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const chromeLauncher = require('chrome-launcher');
import fs from 'fs/promises';
import path from 'path';

// scan url list
const urls = ['https://www.baidu.com', 'https://www.google.com/'];

// Lighthouse configuration, focus on accessibility and best practices, and set to desktop devices
const config = {
    extends: 'lighthouse:default',
    settings: {
        onlyCategories: ['accessibility'],
        formFactor: 'desktop',
        screenEmulation: {
            mobile: false,
            width: 1920,
            height: 1080,
            deviceScaleFactor: 1,
            disabled: false,
        },
        mode: 'navigation', // could be "snapshot"
    },
};

const calcSum = (reportDetail) => {
    const realItems = reportDetail.items;
    let countIssues = 0;

    for (let i = 0; i < realItems.length; i++) {
        if (realItems[i].subItems) {
            countIssues += realItems[i].subItems.items.length;
        } else {
            countIssues += 1;
        }
    }

    totalIssues += countIssues;
    return countIssues;
};

async function runLighthouse(url) {
    const chrome = await chromeLauncher.launch({
        chromeFlags: ['--headless', '--window-size=1920,1080'],
    });

    const options = {
        logLevel: 'info',
        output: ['json', 'html'],
        port: chrome.port,
    };

    try {
        // Lighthouse scan
        const runnerResult = await lighthouse(url, options, config);

        //#region filter raw test result for json report
        const failedAudits = {};
        const categories = ['accessibility']; // can add more categories like seo, performance, best practice , etc.
        categories.forEach((category) => {
            const categoryAudits = runnerResult.lhr.categories[category].auditRefs;
            failedAudits[category] = {};
            categoryAudits.forEach((auditRef) => {
                const audit = runnerResult.lhr.audits[auditRef.id];
                if (!audit.score && audit.scoreDisplayMode === 'binary') {
                    failedAudits[category][audit.title] = {
                        count: calcSum(audit.details),
                    };
                }
            });
        });
        //#endregion

        return {
            url,
            accessibilityScore: runnerResult.lhr.categories.accessibility.score * 100,
            totalIssues,
            items: failedAudits.accessibility,
            htmlReport: runnerResult.report[1],
        };
    } catch (error) {
        console.error(`scan ${url} issue:`, error);
    } finally {
        await chrome.kill();
    }
}

// HTML single report
const buildSingleHtmlReport = async (url, report, htmlFolder) => {
    // add style
    const styledHtmlReport = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Lighthouse A11Y Scan Results - ${url}</title><style>body{ font-family: Arial, sans-serif; margin: 20px;} </style></head><body>${report} </body></html>`;
    const fileName = `${url.replace('https://', '').replace('.html', '').replaceAll('/', '').replaceAll('.', '-')}.html`;
    // write file to html-report folder
    const filePath = path.join(htmlFolder, fileName);
    htmlReportList.push({
        url,
        filePath,
    });
    await fs.writeFile(filePath, styledHtmlReport);
};

async function generateMultiTabReport() {
    const tabFiles = [];

    for (const report of htmlReportList) {
        tabFiles.push({ url: report.url, fileName: report.filePath });
    }

    let options = '';
    let panels = '';

    // add tab buttons for every page
    for (const { url, fileName } of tabFiles) {
        const tabId = url.replace(/[^a-zA-Z0-9]/g, '_');
        options += `<option class="tablinks" value='${tabId}' >${url}</option>`;
    }
    let dropdownHtml = `<select onchange="openTab(event, this.value)">${options}</select>`;

    // add iframe for every page result
    for (const { url, fileName } of tabFiles) {
        const tabId = url.replace(/[^a-zA-Z0-9]/g, '_');
        panels += `
        <div id="${tabId}" class="tabcontent">
            <iframe src="${fileName}" style="width: 100%; height: 100%; border: none;"></iframe>
        </div>`;
    }

    let script = `<script>document.querySelector(".tabcontent").setAttribute('style', 'display:block')</script>`;

    // html main report file
    let mainHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Lighthouse A11Y Scan Results - Multiple URLs</title><style>.tab{ overflow: hidden; border: 1px solid #ccc; background-color: #f1f1f1;} .tab button{ background-color: inherit; float: left; border: none; outline: none; cursor: pointer; padding: 14px 16px; transition: 0.3s;} .tab button:hover{ background-color: #ddd;} .tab button.active{ background-color: #ccc;} .tabcontent{ display: none; padding: 6px 12px; border: 1px solid #ccc; border-top: none; height: calc(100vh - 5rem);} </style><script>function openTab(evt, tabName){ var i, tabcontent, tablinks; tabcontent=document.getElementsByClassName("tabcontent"); for (i=0; i < tabcontent.length; i++){ tabcontent[i].style.display="none";} tablinks=document.getElementsByClassName("tablinks"); for (i=0; i < tablinks.length; i++){ tablinks[i].className=tablinks[i].className.replace(" active", "");} document.getElementById(tabName).style.display="block"; evt.currentTarget.className +=" active";} </script></head><body>${dropdownHtml} ${panels} ${script}</body></html>`;

    // main report file
    await fs.writeFile('a11y-report.html', mainHtml);
}

async function scanUrls() {
    //#region report folder generate
    const jsonFolder = path.join(process.cwd(), 'json-report');
    const htmlFolder = path.join(process.cwd(), 'html-report');
    try {
        await fs.rm(htmlFolder, { recursive: true, force: true });
        await fs.mkdir(jsonFolder, { recursive: true });
        await fs.mkdir(htmlFolder, { recursive: true });
    } catch (err) {
        if (err.code === 'ENOENT') {
            // if htmlreport folder not exists, create it
            console.log(`${htmlFolder} not exists`);
        }

        if (err.code !== 'EEXIST') {
            console.error('make dir:', err);
            return;
        }
    }
    //#endregion

    // go through every url for a11y testing
    const allResults = {};
    for (const url of urls) {
        totalIssues = 0;
        const result = await runLighthouse(url);

        // build the link in json report
        const fileName = `${url.replace('https://', '').replace('.html', '').replaceAll('/', '').replaceAll('.', '-')}.html`;
        // write file to html-report folder
        const filePath = path.join(htmlFolder, fileName);

        // build json report
        allResults[url.replace('https://', '').replaceAll('/', '').replaceAll('.', '-')] = {
            url: result.url,
            accessibilityScore: result.accessibilityScore,
            totalIssues: result.totalIssues,
            items: result.items,
            htmlReport: filePath,
        };

        // build html report
        buildSingleHtmlReport(url, result.htmlReport, htmlFolder);
    }

    //#region ----------------------------------  JSON Result start ----------------------------------------
    const jsonContent = JSON.stringify(allResults, null, 2);
    const jsonName = `${new Date().getFullYear() + '-' + (new Date().getMonth() + 1) + '-' + new Date().getDate()}.json`;
    const jsonPath = path.join(jsonFolder, jsonName);
    await fs.writeFile(jsonPath, jsonContent);
    //#endregion ----------------------------------  JSON Result end ----------------------------------------

    generateMultiTabReport();
}

let totalIssues = 0;
let htmlReportList = [];
scanUrls();
