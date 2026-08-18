/**
 * 即梦（火山方舟上的 SeedEdit/即梦系列）。双凭据形态（access_key_id+secret_key）在
 * ResolvedProviderConfig.extra 携带；单一 Bearer 为主鉴权面。
 */
export declare function createJimengProvider(fetchImpl?: typeof fetch): import("./types").ImageProvider;
