// 对自有模拟器 APK 执行匿名在线安装；先通过 ADB 转发 WebView 调试端口。
import { chromium } from '../../.engine-build/browser-deps/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const browser=await chromium.connectOverCDP('http://127.0.0.1:9223');
try {
 const page=browser.contexts()[0].pages()[0];const requests=[];
 page.on('request',r=>{if(r.url().includes('/engine-releases/'))requests.push(r.url())});
 await page.getByLabel('未登录，打开登录与设置菜单').click();
 await page.getByRole('button',{name:'设置',exact:true}).click();
 for(const name of ['标准象棋引擎','揭棋引擎']){
  await page.getByRole('button',{name,exact:true}).click();
  await page.getByRole('button',{name:'下载并启用',exact:true}).click();
  try {await page.getByText('WASM 引擎已安装并启用，文件保存在当前设备。',{exact:true}).waitFor({timeout:180000});console.log(name+' GitHub 在线安装通过');}
  catch(e){console.log((await page.locator('body').innerText()).slice(-1600));throw e}
 }
 if(requests.length<2||requests.some(u=>!u.startsWith('https://simlym.github.io/qidao/engine-releases/')))throw new Error('下载来源异常');
 writeFileSync(process.argv[2] || '.engine-build/android-public-download-test.json',JSON.stringify({status:'passed',platform:'Android 17 / WebView 149 模拟器 x86_64',anonymous:true,requests},null,2));
}finally{await browser.close()}
