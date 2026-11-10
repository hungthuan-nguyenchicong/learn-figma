import fs from 'fs';
import path from 'path';

export function pluginHtmlInclude() {
    return {
        name: 'html-include-recursive-transform',
        transformIndexHtml(html, ctx) {
            // Hàm xử lý đệ quy chèn file
            const resolveIncludes = (currentHtml, currentFileDir, processedFiles = new Set()) => {
                const includeRegex = /<include\s+src=["']([^"']+)["']\s*\/?>/g;

                // Dùng .replace với callback bất đồng bộ/đồng bộ kết hợp vòng lặp
                // Ở đây ta dùng replace kết hợp đệ quy trực tiếp trên chuỗi
                return currentHtml.replace(includeRegex, (match, srcPath) => {
                    try {
                        // Chuẩn hóa đường dẫn file cần chèn
                        // Giả sử đường dẫn bắt đầu từ thư mục gốc dự án (ví dụ: /include/text.html)
                        const absolutePath = path.resolve(process.cwd(), '.' + srcPath);

                        // Hoặc nếu muốn đường dẫn tính tương đối theo file gọi nó:
                        // const absolutePath = path.resolve(currentFileDir, srcPath);

                        if (!fs.existsSync(absolutePath)) {
                            console.warn(`[html-include] Không tìm thấy file: ${absolutePath}`);
                            return `<!-- [Error]: Không tìm thấy file ${srcPath} -->`;
                        }

                        // Chống lỗi lặp vô hạn (infinite loop) nếu file A include file B và file B lại include lại file A
                        if (processedFiles.has(absolutePath)) {
                            console.warn(`[html-include] Phát hiện include vòng lặp (circular dependency): ${absolutePath}`);
                            return `<!-- [Error]: Circular include detected for ${srcPath} -->`;
                        }

                        // Đọc nội dung file con
                        const includedContent = fs.readFileSync(absolutePath, 'utf-8');

                        // Đánh dấu file này đã được xử lý trong nhánh hiện tại
                        const newProcessedFiles = new Set(processedFiles);
                        newProcessedFiles.add(absolutePath);

                        // [ĐỆ QUY Ở ĐÂY]: Gọi lại chính hàm này để quét tiếp các thẻ <include> nằm bên trong file con vừa đọc
                        const subFileDir = path.dirname(absolutePath);
                        return resolveIncludes(includedContent, subFileDir, newProcessedFiles);

                    } catch (error) {
                        console.error(`[html-include] Lỗi xử lý file ${srcPath}:`, error);
                        return match;
                    }
                });
            };

            // Bắt đầu chạy đệ quy từ file gốc HTML
            const rootDir = path.dirname(ctx.filename);
            return resolveIncludes(html, rootDir);
        }
    };
}