// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages 项目站：https://jerryjiao.github.io/dsh-wewrite/
// base 是项目站子路径（用户名仓库页）；若日后绑自定义域名，去掉 base 即可。
export default defineConfig({
  site: 'https://jerryjiao.github.io',
  base: '/dsh-wewrite/',
});
