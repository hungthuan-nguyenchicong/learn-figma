import fs from 'fs';
import path from 'path';

export function pluginHtmlInclude() {
    return {
        name: 'html-include-recursive-transform',

        // 1. Lắng nghe sự kiện file thay đổi ở mức độ Server của Vite
        configureServer(server) {
            server.watcher.on('change', (file) => {
                // Nếu file thay đổi nằm trong dự án (hoặc bạn có thể lọc đuôi .html)
                if (file.endsWith('.html')) {
                    // Gửi tín hiệu ép trình duyệt F5 (Full Reload) ngay lập tức
                    server.ws.send({
                        type: 'full-reload',
                        path: '*'
                    });
                }
            });
        },

        transformIndexHtml(html) {
            const resolveIncludes = (currentHtml, processedFiles = new Set()) => {
                const includeRegex = /<include\s+[^>]*src=["']([^"']+)["'][^>]*(?:\/>|>([\s\S]*?)<\/include>)/g;

                return currentHtml.replace(includeRegex, (match, srcPath, innerContent) => {
                    try {
                        const absolutePath = path.resolve(process.cwd(), '.' + srcPath);

                        if (!fs.existsSync(absolutePath)) {
                            console.warn(`[html-include] Không tìm thấy file: ${absolutePath}`);
                            return `<!-- [Error]: Không tìm thấy file ${srcPath} -->`;
                        }

                        if (processedFiles.has(absolutePath)) {
                            console.warn(`[html-include] Phát hiện include vòng lặp: ${absolutePath}`);
                            return `<!-- [Error]: Circular include detected for ${srcPath} -->`;
                        }

                        // Đọc nội dung file
                        let targetContent = fs.readFileSync(absolutePath, 'utf-8');

                        // Xử lý bơm nội dung (Slot) nếu là thẻ bọc
                        if (innerContent && innerContent.trim() !== '') {
                            const slotRegex = /<slot\s*[^>]*>(?:[\s\S]*?<\/slot>)?|<slot\s*\/?>/g;
                            targetContent = targetContent.replace(slotRegex, innerContent);
                        }

                        const newProcessedFiles = new Set(processedFiles);
                        newProcessedFiles.add(absolutePath);

                        return resolveIncludes(targetContent, newProcessedFiles);

                    } catch (error) {
                        console.error(`[html-include] Lỗi xử lý file ${srcPath}:`, error);
                        return match;
                    }
                });
            };

            return resolveIncludes(html);
        }
    };
}