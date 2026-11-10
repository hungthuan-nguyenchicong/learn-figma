import fs from 'fs';
import path from 'path';

export function pluginHtmlInclude() {
    return {
        name: 'html-include-recursive-transform',

        // Đưa ctx trở lại vào đây để lấy quyền truy cập vào Vite Dev Server
        transformIndexHtml(html, ctx) {

            const resolveIncludes = (currentHtml, processedFiles = new Set()) => {
                // Regex thông minh: 
                // Nhóm 1: Bắt đường dẫn src="..."
                // Nhóm 2: Bắt nội dung bên trong (innerContent/slot) nếu là thẻ bọc layout
                const includeRegex = /<include\s+[^>]*src=["']([^"']+)["'][^>]*(?:\/>|>([\s\S]*?)<\/include>)/g;

                return currentHtml.replace(includeRegex, (match, srcPath, innerContent) => {
                    try {
                        const absolutePath = path.resolve(process.cwd(), '.' + srcPath);

                        // ==========================================
                        // CỨU CÁNH CHO HMR: Đăng ký file với Vite Watcher
                        // ==========================================
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

                        // Nếu có nội dung bọc (dùng slot), tiến hành bơm vào thẻ <slot>
                        if (innerContent && innerContent.trim() !== '') {
                            const slotRegex = /<slot\s*[^>]*>(?:[\s\S]*?<\/slot>)?|<slot\s*\/?>/g;
                            targetContent = targetContent.replace(slotRegex, innerContent);
                        }

                        const newProcessedFiles = new Set(processedFiles);
                        newProcessedFiles.add(absolutePath);

                        // Đệ quy tiếp tục xử lý nếu file đó lại include các file khác
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