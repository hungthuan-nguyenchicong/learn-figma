import fs from 'fs';
import path from 'path';

export function pluginHtmlInclude() {
    return {
        name: 'html-include-recursive-transform',
        transformIndexHtml(html) {

            const resolveIncludes = (currentHtml, processedFiles = new Set()) => {
                // Regex thông minh: 
                // Nhóm 1: Bắt trực tiếp đường dẫn trong src="..."
                // Nhóm 2: Bắt nội dung bên trong (innerContent/slot) nếu là thẻ bọc
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

                        let targetContent = fs.readFileSync(absolutePath, 'utf-8');

                        // Nếu có thẻ bọc (có nội dung con truyền vào), tiến hành bơm vào <slot>
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