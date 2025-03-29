const fs = require('fs');
const path = require('path');

function compareJsonFiles(file1, file2) {
    const baseReport = JSON.parse(fs.readFileSync(file1, 'utf8'));
    const newReport = JSON.parse(fs.readFileSync(file2, 'utf8'));
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
            a11yItems += `<tr class="${item[2] ? 'change' : ''}"><th>${itemKey}</th><td>${item[0]}</td><td>${item[1]}</td></tr>`;
        });

        page += table + `<tbody>${score}${a11yItems}<tbody></table>`;
    });

    let reportFrame = `<div class="tabcontent"><button style="display:block; position:fixed; z-index:2; right:1.5rem; top: 1.25rem;" onclick='document.querySelector(".tabcontent").classList.toggle("show");'>close</button><iframe src="" style="width: 100%; height: calc(100%); border: none;"></iframe></div>`;
    let script = `<script> function openReport(tabName) { let frame = document.querySelector(".tabcontent iframe"); frame.setAttribute('src', tabName); document.querySelector(".tabcontent").classList.toggle("show");} </script>`;
    let style = `<style>body{ background: #ebebeb; margin: 0; display: flex; flex-direction: column; row-gap: 3rem; width: 100vw; height: 100vh; overflow: auto; padding: 2rem; table{ width: calc(100% - 4rem); border: 0.5px solid #ccc; border-collapse: collapse; border-spacing: 0; th, td{ padding: 0.5rem 1rem;} thead{ th{ background-color: #f2f2f2; color: #141414; border-bottom: 0.5px solid #ccc; text-align: left; text-align: center; &:first-child{ text-align: left;}}} tbody{ th{ text-align: left !important;} tr{ th, td{ border-bottom: 0.5px solid #ccc; text-align: center; background-color: #fff;}} tr:last-child{ th, td{ border-bottom: none;}} tr.change{ th{ color: red;} td:last-child{ color: red; font-weight: bold;}}}}}  .tabcontent{display:none; position:fixed; top:1rem; left: 1rem; width: calc(100vw - 2rem); height: calc(100vh - 2rem); &.show{display:block;}}</style>`;
    let html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Document</title> ${style} ${script}</head><body>${page} ${reportFrame}</body></html>`;
    return html;
}

function main(folderPath) {
    fs.readdir(folderPath, (err, files) => {
        if (err) {
            console.error('读取文件夹时出错:', err);
            return;
        }

        const jsonFiles = files
            .sort()
            .filter((file) => path.extname(file) === '.json')
            .map((file) => path.join(folderPath, file));
        if (jsonFiles.length < 2) {
            console.log('文件夹中至少需要两个 JSON 文件。');
            return;
        }

        const [file1, file2] = jsonFiles;
        const changes = compareJsonFiles(file1, file2);
        const htmlTable = generateHtmlTable(changes);

        fs.writeFile('A11y-compare-report.html', htmlTable, 'utf8', (err) => {
            if (err) {
                console.error('写入 HTML 文件时出错:', err);
                return;
            }
        });
    });
}

const folderPath = './json-report/';
main(folderPath);
