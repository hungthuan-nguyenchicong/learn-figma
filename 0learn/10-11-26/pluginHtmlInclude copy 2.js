import fs from 'fs';
import path from 'path';

export function pluginHtmlInclude() {
    return {
        name: 'html-include-recursive-transform',

        transformIndexHtml(html, ctx) {
            const parseAttributes = (attrString) => {
                const attrs = {};
                const attrRegex = /([a-zA-Z0-9_-]+)=["']([^"']+)["']/g;
                let match;
                while ((match = attrRegex.exec(attrString)) !== null) {
                    attrs[match[1]] = match[2];
                }
                return attrs;
            };

            const resolveIncludes = (currentHtml, processedFiles = new Set()) => {
                // Regex thông minh: Bắt cả thẻ tự đóng ( /> ) lẫn thẻ bọc có nội dung ( ... </include> )
                const includeRegex = /<include\s+([^>]+?)(?:\/>|>([\s\S]*?)<\/include>)/g;

                return currentHtml.replace(includeRegex, (match, attrString, innerContent) => {
                    const attrs = parseAttributes(attrString);
                    const srcPath = attrs.src;

                    if (!srcPath) return match;

                    try {
                        const absolutePath = path.join(process.cwd(), srcPath);

                        if (ctx && ctx.server) {
                            ctx.server.watcher.add(absolutePath);
                        }

                        if (!fs.existsSync(absolutePath)) {
                            console.warn(`[html-include] Không tìm thấy file: ${absolutePath}`);
                            return `<!-- [Error]: Không tìm thấy file ${srcPath} -->`;
                        }

                        if (processedFiles.has(absolutePath)) {
                            console.warn(`[html-include] Phát hiện include vòng lặp: ${absolutePath}`);
                            return `<!-- [Error]: Circular include detected for ${srcPath} -->`;
                        }

                        let targetContent = fs.readFileSync(absolutePath, 'utf-8');

                        // NẾU LÀ THẺ BỌC (Có nội dung bên trong / Slot): Bơm innerContent vào thẻ <slot />
                        if (innerContent && innerContent.trim() !== '') {
                            // Bắt trọn vẹn mọi biến thể của thẻ slot: từ tự đóng, thẻ đơn cho đến cặp thẻ đóng mở <slot></slot>
                            const slotRegex = /<slot\s*[^>]*>(?:[\s\S]*?<\/slot>)?|<slot\s*\/?>/g;
                            targetContent = targetContent.replace(slotRegex, innerContent);
                        }

                        const newProcessedFiles = new Set(processedFiles);
                        newProcessedFiles.add(absolutePath);

                        // Tiếp tục đệ quy xử lý các thẻ include bên trong file vừa gọi (ví dụ: layout gọi navbar/footer)
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