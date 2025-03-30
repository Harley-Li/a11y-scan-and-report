import lighthouse from 'lighthouse';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const chromeLauncher = require('chrome-launcher');
import fs from 'fs/promises';
import path from 'path';
import { json } from 'stream/consumers';

// scan url list
const urls = ['https://www.baidu.com', 'https://www.google.com/'];

//#region ------------------------- lighthouse config and execute -------------------------------------
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
//#endregion ------------------------- lighthouse config and execute --------------------------------------------------

//#region ------------------------- building reports --------------------------------------------------
// HTML single report
const buildHtmlReport = async (url, report, htmlFolder) => {
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

const htmlReportsIntegration = async () => {
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
    await fs.writeFile(`./reports/${new Date().getFullYear() + '-' + (new Date().getMonth() + 1) + '-' + new Date().getDate()}.html`, mainHtml);
    console.log('HTML report integrate successfully');
};

const buildCsvReport = async (jsonData) => {
    const headers = [''];
    const urlKeys = Object.keys(jsonData);
    headers.push(...urlKeys);

    const rows = [];
    rows.push(headers.join(','));

    // Total issues per url
    const totalIssuesRow = ['Total Issues'];
    urlKeys.forEach((key) => {
        totalIssuesRow.push(jsonData[key].totalIssues);
    });
    rows.push(totalIssuesRow.join(','));

    // List all issue types for each URL
    const allTitles = new Set();
    urlKeys.forEach((key) => {
        Object.keys(jsonData[key].items).forEach((title) => {
            allTitles.add(title);
        });
    });

    // Adding rows for each issue Type
    allTitles.forEach((title) => {
        const row = [title];
        urlKeys.forEach((key) => {
            row.push(jsonData[key].items[title] ? jsonData[key].items[title].count : 0);
        });
        rows.push(row.join(','));
    });

    await fs.writeFile(`./reports/${new Date().getFullYear() + '-' + (new Date().getMonth() + 1) + '-' + new Date().getDate()}.csv`, rows.join('\n'));
    console.log('CSV report generated successfully');
};

const buildJsonReport = async (results, jsonFolder) => {
    const jsonContent = JSON.stringify(results, null, 2);
    const jsonName = `${new Date().getFullYear() + '-' + (new Date().getMonth() + 1) + '-' + new Date().getDate()}.json`;
    const jsonPath = path.join(jsonFolder, jsonName);
    await fs.writeFile(jsonPath, jsonContent);
    console.log('Json report generated successfully');
};

const createReportFolder = async () => {
    try {
        await fs.rm(htmlFolder, { recursive: true, force: true });
        await fs.mkdir(jsonFolder, { recursive: true });
        await fs.mkdir(htmlFolder, { recursive: true });
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log(`${htmlFolder} not exists`);
        }

        if (err.code !== 'EEXIST') {
            console.error('make dir:', err);
            return;
        }
    }
};

//#endregion ------------------------- building reports --------------------------------------------------

//#region ------------------------- compare reports ---------------------------------------------------
function escapeHtml(unsafe) {
    return unsafe.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
async function compareJsonFiles(file1, file2) {
    try {
        const baseReport = JSON.parse(await fs.readFile(file1, 'utf8'));
        const newReport = JSON.parse(await fs.readFile(file2, 'utf8'));
        const changes = {};

        Object.keys(baseReport).forEach((key) => {
            if (baseReport[key].totalIssues !== newReport[key].totalIssues) {
                let basedItems = baseReport[key].items;
                let combinedItems = {};

                Object.keys(basedItems).forEach((itemKey) => {
                    combinedItems[itemKey] = [
                        baseReport[key].items[itemKey].count,
                        newReport[key].items[itemKey] ? newReport[key].items[itemKey].count : 0,
                        baseReport[key].items[itemKey].count !== (newReport[key].items[itemKey] ? newReport[key].items[itemKey].count : 0) ? true : false,
                    ];
                });

                changes[`${key}`] = {
                    link: baseReport[key].htmlReport,
                    score: [baseReport[key].totalIssues, newReport[key].totalIssues],
                    items: combinedItems,
                };
            }
        });

        return changes;
    } catch (error) {
        console.error('比较 JSON 文件时出错:', error);
        throw error;
    }
}

function generateHtmlTable(changes) {
    let page = '';

    // build table to show changes
    Object.keys(changes).forEach((key) => {
        let table = `<table tablespacing="0" cellspacing="0"><thead><tr><th id="${changes[key].link}" onclick="openReport('${changes[key].link}')">${key}</th><th style="width: 72px;">Before fix</th><th style="width: 72px;">After fix</th></tr></thead>`;
        let score = `<tr><th>A11y score</th><td>${changes[key].score[0]}</td><td>${changes[key].score[1]}</td></tr>`;
        let a11yItems = '';

        Object.keys(changes[key].items).map((itemKey) => {
            let item = changes[key].items[itemKey];
            a11yItems += `<tr class="${item[2] ? 'change' : ''}"><th>${escapeHtml(itemKey)}</th><td>${item[0]}</td><td>${item[1]}</td></tr>`;
        });

        page += table + `<tbody>${a11yItems}<tbody></table>`;
    });

    let reportFrame = `<div class="tabcontent"><button style="display:block; position:fixed; z-index:2; right:1.5rem; top: 1.25rem;" onclick='document.querySelector(".tabcontent").classList.toggle("show");'>close</button><iframe src="" style="width: 100%; height: calc(100%); border: none;"></iframe></div>`;
    let script = `<script> function openReport(tabName) { let frame = document.querySelector(".tabcontent iframe"); frame.setAttribute('src', tabName); document.querySelector(".tabcontent").classList.toggle("show");} </script>`;
    let style = `<style>body{ background: #ebebeb; margin: 0; display: flex; flex-direction: column; row-gap: 3rem; width: 100vw; height: 100vh; overflow: auto; padding: 2rem; table{ width: calc(100% - 4rem); border: 0.5px solid #ccc; border-collapse: collapse; border-spacing: 0; th, td{ padding: 0.5rem 1rem;} thead{ th{ background-color: #f2f2f2; color: #141414; border-bottom: 0.5px solid #ccc; text-align: left; text-align: center; &:first-child{ text-align: left;}}} tbody{ th{ text-align: left !important; font-weight:400;} tr{ th, td{ border-bottom: 0.5px solid #ccc; text-align: center; background-color: #fff;}} tr:last-child{ th, td{ border-bottom: none;}} tr.change{ th{ color: red;} td:last-child{ color: red; font-weight: bold;}}}}}  .tabcontent{display:none; position:fixed; top:1rem; left: 1rem; width: calc(100vw - 2rem); height: calc(100vh - 2rem); &.show{display:block;}}</style>`;
    let html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Document</title> ${style} ${script}</head><body>${page} ${reportFrame}</body></html>`;
    return html;
}
//#endregion ---------------------- compare reports ---------------------------------------------------

//#region ------------------------- exports -----------------------------------------------------------
const buildReport = async () => {
    createReportFolder();

    // go through every url for a11y scan
    for (const url of urls) {
        totalIssues = 0;
        const result = await runLighthouse(url);

        // build the link in json report
        const htmlReportName = `${url.replace('https://', '').replace('.html', '').replaceAll('/', '').replaceAll('.', '-')}.html`;
        const htmlReporsPath = path.join(htmlFolder, htmlReportName);

        // generate report content
        allResults[url.replace('https://', '').replaceAll('/', '').replaceAll('.', '-')] = {
            url: result.url,
            accessibilityScore: result.accessibilityScore,
            totalIssues: result.totalIssues,
            items: result.items,
            htmlReport: htmlReporsPath,
        };

        // build html report details
        buildHtmlReport(url, result.htmlReport, htmlFolder);
    }

    buildJsonReport(allResults, jsonFolder);

    htmlReportsIntegration();

    buildCsvReport(allResults);
};

const compareReports = async () => {
    try {
        const files = await fs.readdir(jsonFolder);
        const jsonFiles = files
            .sort()
            .filter((file) => path.extname(file) === '.json')
            .map((file) => path.join(jsonFolder, file));
        if (jsonFiles.length < 2) {
            console.log('require two report files to compare');
            return;
        }

        const [file1, file2] = jsonFiles;
        const changes = await compareJsonFiles(file1, file2);
        const htmlTable = generateHtmlTable(changes);

        await fs.writeFile('./reports/compared-report.html', htmlTable, 'utf8');
    } catch (error) {
        console.error(error);
    }
};
//#endregion ---------------------- exports -----------------------------------------------------------

//#region ------------------------- comman ------------------------------------------------------------
let totalIssues = 0;
let htmlReportList = [];
const allResults = {};
const jsonFolder = path.join(process.cwd(), 'reports/json-report');
const htmlFolder = path.join(process.cwd(), 'reports/html-report');

const funcMap = {
    buildReport,
    compareReports,
};

// get the method name from command line and run the method
const funcName = process.argv[2];
if (funcName && funcMap[funcName]) {
    funcMap[funcName]();
}
//#endregion ---------------------- comman ------------------------------------------------------------
