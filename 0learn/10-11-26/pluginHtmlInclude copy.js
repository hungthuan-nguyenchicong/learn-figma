import fs from 'fs';
import path from 'path';

export function pluginHtmlInclude() {
    return {
        name: 'html-include-recursive-transform',
        // Bỏ ctx đi vì không dùng tới nữa
        transformIndexHtml(html) {

            const resolveIncludes = (currentHtml, processedFiles = new Set()) => {
                const includeRegex = /<include\s+src=["']([^"']+)["']\s*\/?>/g;

                return currentHtml.replace(includeRegex, (match, srcPath) => {
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

                        const includedContent = fs.readFileSync(absolutePath, 'utf-8');

                        const newProcessedFiles = new Set(processedFiles);
                        newProcessedFiles.add(absolutePath);

                        return resolveIncludes(includedContent, newProcessedFiles);

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