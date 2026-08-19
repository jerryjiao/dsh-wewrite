#!/usr/bin/env node
/**
 * 架构图渲染（2026-08-19，替换 codex 文生图）。
 * playwright 加载 architecture.html，按 #mod-wechat 实测坐标定位出网箭头与
 * 公众号草稿箱外部位（避免手工目测），再以 2x 截 #canvas 出 PNG。
 * 用法：node tools/diagram/render.mjs（playwright 取 workspace 根 node_modules）
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT = join(ROOT, 'assets', 'diagram', 'architecture.png');
mkdirSync(dirname(OUT), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1700, height: 1400 },
  deviceScaleFactor: 2,
});
await page.goto('file://' + join(HERE, 'architecture.html'));
await page.waitForTimeout(300);

// 出网箭头：wechat 行高度、从插件卡右缘起（穿边界留白区，不压 providers 卡）到公众号位左缘
await page.evaluate(() => {
  const stage = document.querySelector('.stage');
  const wechat = document.querySelector('#mod-wechat');
  const plugin = document.querySelector('.plugin');
  const box = document.querySelector('#egress-box');
  const line = document.querySelector('#egress-line');
  const stageBox = stage.getBoundingClientRect();
  const w = wechat.getBoundingClientRect();
  const y = w.top + w.height / 2 - stageBox.top;

  box.style.top = `${Math.round(y - box.offsetHeight / 2)}px`;
  const boxRect = box.getBoundingClientRect();
  const lineLeft = plugin.getBoundingClientRect().right - stageBox.left;
  line.style.top = `${Math.round(y)}px`;
  line.style.left = `${Math.round(lineLeft)}px`;
  line.style.width = `${Math.round(boxRect.left - stageBox.left - lineLeft - 2)}px`;
});

const canvas = page.locator('#canvas');
await canvas.screenshot({ path: OUT });
const box = await canvas.boundingBox();
console.log(`rendered ${OUT} (${box.width * 2}x${box.height * 2} @2x)`);
await browser.close();
