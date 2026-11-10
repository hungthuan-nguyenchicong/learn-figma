import { defineConfig } from 'vite';
import { pluginHtmlInclude } from './vite-plugin/pluginHtmlInclude.js';
export default defineConfig({
    plugins: [
        pluginHtmlInclude() // 2. Đưa plugin vào mảng plugins
    ],
})