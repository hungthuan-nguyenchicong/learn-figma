import fs from 'fs';
import path from 'path';

export function pluginHtmlInclude() {
    return {
        name: 'html-include-recursive-transform',
        // Hook này do Vite tự động gọi khi build hoặc chạy dev server
        transformIndexHtml(html, ctx) {

            // --- HÀM 1: HÀM ĐỆ QUY XỬ LÝ CHÈN FILE ---
            const resolveIncludes = (currentHtml, currentFileDir, processedFiles = new Set()) => {

                // Regex dùng để quét tìm tất cả các thẻ dạng: <include src="/duong/dan.html" />
                const includeRegex = /<include\s+src=["']([^"']+)["']\s*\/?>/g;

                // currentHtml.replace() sẽ tìm tất cả các khớp với regex và chạy hàm callback bên dưới cho từng thẻ tìm thấy
                return currentHtml.replace(includeRegex, (match, srcPath) => {
                    try {
                        // BƯỚC A: Xác định đường dẫn tuyệt đối của file cần nhúng
                        // process.cwd() là thư mục gốc của project (nơi chứa package.json)
                        const absolutePath = path.resolve(process.cwd(), '.' + srcPath);

                        // BƯỚC B: Kiểm tra xem file có tồn tại thực tế trên ổ cứng không
                        if (!fs.existsSync(absolutePath)) {
                            console.warn(`[html-include] Không tìm thấy file: ${absolutePath}`);
                            return `<!-- [Error]: Không tìm thấy file ${srcPath} -->`;
                        }

                        // BƯỚC C: Kiểm tra chống lặp vô hạn (Dùng Set ở đây)
                        if (processedFiles.has(absolutePath)) {
                            console.warn(`[html-include] Phát hiện include vòng lặp: ${absolutePath}`);
                            return `<!-- [Error]: Circular include detected for ${srcPath} -->`;
                        }

                        // BƯỚC D: Đọc nội dung file con dưới dạng chuỗi UTF-8
                        const includedContent = fs.readFileSync(absolutePath, 'utf-8');

                        // BƯỚC E: Cập nhật danh sách file đã đi qua cho nhánh hiện tại
                        const newProcessedFiles = new Set(processedFiles);
                        newProcessedFiles.add(absolutePath);

                        // BƯỚC F: ĐỆ QUY - Gọi lại chính hàm resolveIncludes để quét tiếp
                        // Nếu trong file con vừa đọc lại chứa thẻ <include> khác, nó sẽ lặp lại quy trình từ BƯỚC A
                        const subFileDir = path.dirname(absolutePath);
                        return resolveIncludes(includedContent, subFileDir, newProcessedFiles);

                    } catch (error) {
                        console.error(`[html-include] Lỗi xử lý file ${srcPath}:`, error);
                        return match; // Nếu lỗi thì giữ nguyên thẻ include gốc
                    }
                });
            };

            // --- BẮT ĐẦU CHẠY ---
            // Lấy thư mục chứa file HTML gốc đang được build
            const rootDir = path.dirname(ctx.filename);
            // Kích hoạt hàm đệ quy và trả về chuỗi HTML hoàn chỉnh cuối cùng cho Vite
            return resolveIncludes(html, rootDir);
        }
    };
}