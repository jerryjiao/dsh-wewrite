/**
 * 定时任务存取（service 拆分，单文件 <=300 行纪律）：
 * save（归一化 + revision++ + 投影计算）/ delete / toggle / runNow。
 * publishTarget 恒 'draft'（AC-10：类型层不可达群发）。
 */
import type { RunParams, ScheduleViewModel } from '../shared/contract';
import type { ScheduleRecord } from './domain';
import type { DomainTables } from './store';
export interface ScheduleStoreDeps {
    readonly tables: DomainTables;
    readonly serialize: <T>(operation: () => Promise<T>) => Promise<T>;
    readonly nowIso: () => string;
    readonly startRun: (schedule: ScheduleRecord) => {
        runId: string;
    };
}
export interface SaveScheduleInput {
    readonly id?: string;
    readonly name: string;
    readonly rrule: string;
    readonly timeZone: string;
    readonly params: RunParams;
    readonly enabled: boolean;
}
export declare class ScheduleStore {
    private readonly deps;
    constructor(deps: ScheduleStoreDeps);
    save(input: SaveScheduleInput): Promise<ScheduleViewModel>;
    delete(id: string): Promise<{
        deleted: boolean;
    }>;
    toggle(id: string, enabled: boolean): Promise<ScheduleViewModel>;
    runNow(id: string): {
        runId: string;
    };
}
