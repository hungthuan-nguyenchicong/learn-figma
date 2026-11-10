import fs from 'fs';
import path from 'path';

export function pluginHtmlInclude() {
    return {
        name: 'html-include-transform',
        transformIndexHtml(html, ctx) {
            // 1. Regex bắt thẻ <include src="..." />
            // Dùng non-greedy capture (.*?) để lấy đường dẫn bên trong dấu ngoặc kép hoặc nháy đơn
            const includeRegex = /<include\s+src=["']([^"']+)["']\s*\/?>/g;

            // 2. Thay thế bất đồng bộ hoặc đồng bộ (ở đây dùng replace đồng bộ với fs.readFileSync)
            // ctx.filename chứa đường dẫn tuyệt đối của file HTML hiện tại đang được compile
            const currentDir = path.dirname(ctx.filename);

            const resultHtml = html.replace(includeRegex, (match, srcPath) => {
                try {
                    // Xử lý đường dẫn file cần include (ví dụ: /include/text.html)
                    // Giả sử bạn muốn tính từ thư mục gốc dự án hoặc từ thư mục chứa file HTML hiện tại
                    // Ở đây mình tính dựa trên thư mục gốc của project (process.cwd()) hoặc thư mục public/src

                    // Cách 1: Tính đường dẫn tuyệt đối từ root dự án
                    const absolutePath = path.resolve(process.cwd(), '.' + srcPath);

                    // Hoặc Cách 2: Nếu srcPath là đường dẫn tương đối so với file html hiện tại:
                    // const absolutePath = path.resolve(currentDir, srcPath);

                    // Đọc nội dung file cần chèn
                    if (fs.existsSync(absolutePath)) {
                        const includedContent = fs.readFileSync(absolutePath, 'utf-8');
                        return includedContent;
                    } else {
                        console.warn(`[html-include] Không tìm thấy file: ${absolutePath}`);
                        return `<!-- [Error]: Không tìm thấy file ${srcPath} -->`;
                    }
                } catch (error) {
                    console.error(`[html-include] Lỗi đọc file ${srcPath}:`, error);
                    return match; // Giữ nguyên nếu lỗi
                }
            });

            return resultHtml;
        }

    };
}