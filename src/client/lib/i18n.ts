/**
 * WeWrite 词典（zh 为主、en 结构预留——Spec §10 i18n 口径）。
 *
 * 注册到 ctx.locale.register('wewrite', …)；面板内长文案为 DESIGN.md §9 写死的
 * 真实中文产品文案（真源在页面层，不进词典）；词典只收导航/通用动作/连接态
 * 这类跨页复用短语。bind() 拿到的 t 缺键时回退 zh 原文。
 */

export const LOCALE_NAMESPACE = 'wewrite';

export const zh = {
  'tab.home': '写作台',
  'tab.hotspots': '选题中心',
  'tab.articles': '文章库',
  'tab.schedule': '定时任务',
  'tab.settings': '设置',
  'panel.label': '写作台',
  'action.startWriting': '开始写作',
  'action.writeThis': '写这个',
  'action.bookmark': '收藏',
  'action.refresh': '刷新',
  'action.retry': '重试',
  'action.save': '保存',
  'action.cancel': '取消',
  'action.edit': '编辑',
  'action.delete': '删除',
  'action.confirm': '确认',
  'action.pushDraft': '推草稿箱',
  'action.pushing': '推送中…',
  'action.back': '返回',
  'action.testConnection': '测试连接',
  'action.testing': '测试中…',
  'action.goSettings': '去设置',
  'action.goSettingsProxy': '去设置代理',
  'state.connected': '已连接',
  'state.disconnected': '未配置',
  'state.loading': '加载中…',
  'state.saved': '已保存',
  'state.saveFailed': '保存失败',
  'toast.pushed': '已进草稿箱',
  'toast.generateDone': '生成完成',
  'toast.generateCancelled': '已取消生成',
  'empty.action.hotspots': '去选题中心',
  'empty.action.wechat': '配置公众号',
} as const;

export type WewriteLocaleKey = keyof typeof zh;

export const en: Record<WewriteLocaleKey, string> = {
  'tab.home': 'Workbench',
  'tab.hotspots': 'Topics',
  'tab.articles': 'Articles',
  'tab.schedule': 'Schedule',
  'tab.settings': 'Settings',
  'panel.label': 'Workbench',
  'action.startWriting': 'Start writing',
  'action.writeThis': 'Write this',
  'action.bookmark': 'Bookmark',
  'action.refresh': 'Refresh',
  'action.retry': 'Retry',
  'action.save': 'Save',
  'action.cancel': 'Cancel',
  'action.edit': 'Edit',
  'action.delete': 'Delete',
  'action.confirm': 'Confirm',
  'action.pushDraft': 'Push to drafts',
  'action.pushing': 'Pushing…',
  'action.back': 'Back',
  'action.testConnection': 'Test connection',
  'action.testing': 'Testing…',
  'action.goSettings': 'Open settings',
  'action.goSettingsProxy': 'Open proxy settings',
  'state.connected': 'Connected',
  'state.disconnected': 'Not configured',
  'state.loading': 'Loading…',
  'state.saved': 'Saved',
  'state.saveFailed': 'Save failed',
  'toast.pushed': 'Pushed to drafts',
  'toast.generateDone': 'Generation finished',
  'toast.generateCancelled': 'Generation cancelled',
  'empty.action.hotspots': 'Go to topics',
  'empty.action.wechat': 'Configure account',
};
