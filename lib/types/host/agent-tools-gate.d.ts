/**
 * Agent 工具总开关闸门（AC-M1-12：设置页开关=真闸门，单一真源）。
 * 修的验收缝隙：config/get 投影的 settings.agentToolsEnabled（用户设置）与工具注册实际
 * 读的插件 config 层 patch 值是两个不同步的旋钮——修法是全部消费面（注册闸门、
 * agent/created 挂载、config/get 投影、热回收）统一走本闸门：
 *   enabled = 用户显式设置过（state.agentToolsTouched）? settings.agentToolsEnabled : 插件 config 默认
 * 存量说明：touched 是新字段（default false）——旧版该开关不控制任何行为且设置页未暴露
 * UI，历史写入无从形成「已关闭」依赖，按「从未修改」回落新默认（spec：默认值翻转只
 * 影响新安装与从未修改过该设置的用户）。显式写路径见 service.setConfig。
 */
export interface AgentToolsGate {
    /** 闸门真值：显式设置优先，缺省回落插件 config 默认。 */
    enabled(): boolean;
    /** 注册器订阅闸门翻转（true→false 触发热回收；false→true 触发重挂载）。 */
    subscribe(listener: (enabled: boolean) => void): () => void;
    /** settings 写路径翻转闸门后通知订阅者（单订阅者异常不阻断其余）。 */
    notify(enabled: boolean): void;
}
export interface AgentToolsGateSource {
    /** 用户是否显式设置过 agentToolsEnabled（GlobalState.agentToolsTouched，随 state 持久化）。 */
    touched(): boolean;
    /** 用户显式值（SettingsRecord.agentToolsEnabled）。 */
    explicit(): boolean;
    /** 插件 config 默认（cordis.patch.yml 的 agentToolsEnabled，apply 时注入，运行期不变）。 */
    readonly configDefault: boolean;
}
export declare function createAgentToolsGate(source: AgentToolsGateSource): AgentToolsGate;
