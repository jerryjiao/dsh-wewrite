# wechat-relay — 微信 API 反向代理参考配置

本文是 dsh-wewrite 的微信出口代理（ADR-007）参考实现文档：只给配置示例，不含代码。
适用场景：你的机器出口 IP 不在公众号 IP 白名单（errcode 40164），且出口 IP 不固定（家宽/办公网），
无法直接加白。解法是在一台有固定公网 IP 的服务器上反向代理 `api.weixin.qq.com`，
把这台服务器的 IP 加进白名单一次即可，dsh-wewrite 侧只改一个配置项。

原理：dsh-wewrite 的微信出口是唯一的 `apiBaseUrl` 配置缝（设置页「微信 API 地址」）。
配成 relay 地址后，全部微信调用（token / uploadimg / material / draft）统一走 relay，无直连混合路径。

## 前提

- 一台有固定公网 IP 的服务器（任意 1 核 512M 的 VPS 都够用；微信 API 调用量远低于这个水位）。
- 该服务器能访问 `api.weixin.qq.com`（443 出网）。
- dsh-wewrite v0.1.0 对 relay 的要求：透明转发，不改写 query string 与请求体
  （微信凭据 appid/secret 在 query/body 里，任何改写都会破坏调用）。

## 方案一：Caddy（推荐，一行配置）

Caddyfile：

```
wx.example.com {
    reverse_proxy api.weixin.qq.com
}
```

（`wx.example.com` 换成你的域名，证书 Caddy 自动签发。无域名也可用 `reverse_proxy api.weixin.qq.com` 裸 IP + 自签，不推荐。）

然后：

1. 把服务器公网 IP 加进公众号后台 IP 白名单（步骤见下节）。
2. dsh-wewrite 设置页「微信 API 地址」填 `https://wx.example.com`（不带尾斜线，路径自动拼接）。
3. 点「连接测试」，通过即生效。

## 方案二：Nginx

```nginx
server {
    listen 443 ssl;
    server_name wx.example.com;
    ssl_certificate     /etc/letsencrypt/live/wx.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/wx.example.com/privkey.pem;

    location / {
        proxy_pass https://api.weixin.qq.com;
        proxy_set_header Host api.weixin.qq.com;
        proxy_ssl_server_name on;
        proxy_read_timeout 60s;
        client_max_body_size 12m;   # 封面/正文图上传（微信单图上限 10MB，留余量）
    }
}
```

## 服务器 IP 加白名单步骤

1. 登录 [微信公众平台](https://mp.weixin.qq.com/)（管理员账号）。
2. 左侧「设置与开发」→「基本配置」→「公众号开发信息」→「IP 白名单」→「修改」。
3. 填入 relay 服务器的公网 IP（多个用换行分隔），扫码确认。
4. 回到 dsh-wewrite 设置页点「连接测试」。返回 40164 说明白名单未生效（IP 填错/未保存），按诊断提示核对。

## 可选：bearer 鉴权（限制谁能用你的 relay）

公网 relay 会被扫到，建议至少加一层访问限制。两种形态：

**形态 A：path secret（dsh-wewrite v0.1.0 兼容，推荐）**

在 base URL 里藏一段随机路径。Caddy 示例：

```
wx.example.com {
    handle_path /kX9mP2qR8vT4wN6z/* {
        reverse_proxy api.weixin.qq.com
    }
    respond 404
}
```

dsh-wewrite 设置页「微信 API 地址」填 `https://wx.example.com/kX9mP2qR8vT4wN6z`
（`resolveApiBaseUrl` 支持带路径前缀的 base URL，拼接 `/cgi-bin/...` 后整体命中 handle_path）。
路径段用 `openssl rand -hex 16` 生成，不要用示例值。

**形态 B：Authorization: Bearer 校验**

Caddy 示例（要求请求带 `Authorization: Bearer <token>`，否则 401）：

```
wx.example.com {
    @auth not header Authorization "Bearer kX9mP2qR8vT4wN6z"
    respond @auth 401
    reverse_proxy api.weixin.qq.com
}
```

兼容性说明：dsh-wewrite v0.1.0 的出口是纯地址替换，**不附加 Authorization 头**。
形态 B 适用于你自己还有其他脚本/工具要复用同一个 relay 的场景；只用 dsh-wewrite 的话请选形态 A，
否则所有请求会被 relay 以 401 拒绝（表现为连接测试 NETWORK 类失败）。

## 运维要点

- relay 无状态、不落盘，可以随时销毁重建；唯一的「配置」就是白名单里的服务器 IP。
- 服务器换 IP 后记得同步改公众号白名单，否则 40164 复现。
- 不想自建、也无法固定出口 IP：此路不通是微信侧约束（白名单只认 IP），dsh-wewrite
  不提供也不销售代理服务；可退回「主题写作 + 本地渲染」，把推送步骤留到有白名单条件时再做。
