/**
 * shared 入口：npm exports["./shared"] 指向 lib/shared.js（源码即本文件）。
 * 聚合双端契约面，host 与 client 均从此处或子路径导入。
 */

export * from './contract';
export * from './image-provider-ids';
export * from './view-models';
