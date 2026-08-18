/**
 * 日志与错误脱敏器（AC-13 / 架构 §8 三条硬规则）。
 * 纯函数集合，无副作用——host 侧所有 logger 输出与错误消息上抛前过这里。
 */
/** 掩码规则（QA 契约 §7.2-3）：长度 <=8 全掩（短值全掩防泄露）；>8 保留前 4 字符 + '****'。 */
export declare function maskSecret(secret: string): string;
/** 已知 secret 值在文本中的全部出现替换为各自掩码（架构 §8 规则二：token 响应只记 errcode）。 */
export declare function redactText(text: string, secrets: readonly string[]): string;
/** 深遍历对象/数组，敏感键的值替换为 '[redacted]'。纯函数：返回新结构，原对象不动。 */
export declare function redactKeys<T>(value: T): T;
/** provider 错误消息截断（架构 §8 规则三：截断 500 字符并剥离 header 回显由调用方配合）。 */
export declare function truncateMessage(message: string, max?: number): string;
