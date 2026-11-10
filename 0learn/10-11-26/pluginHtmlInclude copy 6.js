import fs from 'fs';
import path from 'path';

export function pluginHtmlInclude() {
    return {
        name: 'html-include-recursive-transform',

        configureServer(server) {
            server.watcher.on('change', (file) => {
                if (file.endsWith('.html')) {
                    server.ws.send({
                        type: 'full-reload',
                        path: '*'
                    });
                }
            });
        },

        transformIndexHtml(html) {
            const resolveIncludes = (currentHtml, processedFiles = new Set()) => {
                // Regex bắt toàn bộ thẻ include và lấy ra toàn bộ chuỗi attributes bên trong
                const includeRegex = /<include\s+([^>]*)\s*(?:\/>|>([\s\S]*?)<\/include>)/g;

                return currentHtml.replace(includeRegex, (match, attrsStr, innerContent) => {
                    try {
                        // 1. Lấy giá trị src="..."
                        const srcMatch = attrsStr.match(/src=["']([^"']+)["']/);
                        if (!srcMatch) return match;
                        const srcPath = srcMatch[1];

                        const absolutePath = path.resolve(process.cwd(), '.' + srcPath);

                        if (!fs.existsSync(absolutePath)) {
                            console.warn(`[html-include] Không tìm thấy file: ${absolutePath}`);
                            return `<!-- [Error]: Không tìm thấy file ${srcPath} -->`;
                        }

                        if (processedFiles.has(absolutePath)) {
                            console.warn(`[html-include] Phát hiện include vòng lặp: ${absolutePath}`);
                            return `<!-- [Error]: Circular include detected for ${srcPath} -->`;
                        }

                        // Đọc nội dung file template gốc
                        let targetContent = fs.readFileSync(absolutePath, 'utf-8');

                        // Xử lý Slot nếu có
                        if (innerContent && innerContent.trim() !== '') {
                            const slotRegex = /<slot\s*[^>]*>(?:[\s\S]*?<\/slot>)?|<slot\s*\/?>/g;
                            targetContent = targetContent.replace(slotRegex, innerContent);
                        }

                        const newProcessedFiles = new Set(processedFiles);
                        newProcessedFiles.add(absolutePath);

                        // 2. KIỂM TRA NẾU CÓ THUỘC TÍNH data='[...]'
                        // Hỗ trợ cả dấu nháy đơn hoặc nháy kép cho thuộc tính data
                        const dataMatch = attrsStr.match(/data=['"]([\s\S]*?)['"](\s|$)/);

                        if (dataMatch) {
                            // Parse chuỗi JSON truyền vào thành Array
                            // Thay thế &quot; hoặc các ký tự đặc biệt nếu có
                            let rawJson = dataMatch[1].replace(/&quot;/g, '"');
                            let dataArray = JSON.parse(rawJson);

                            if (!Array.isArray(dataArray)) {
                                console.warn(`[html-include] Thuộc tính data phải là một JSON Array: ${srcPath}`);
                                return resolveIncludes(targetContent, newProcessedFiles);
                            }

                            // Lặp qua từng item trong mảng và thay thế biến {{key}}
                            let compiledHTML = '';
                            dataArray.forEach((item) => {
                                let itemContent = targetContent;
                                Object.keys(item).forEach((key) => {
                                    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
                                    itemContent = itemContent.replace(regex, item[key]);
                                });
                                // Đệ quy tiếp cho từng item (phòng hờ card con lại include file khác)
                                compiledHTML += resolveIncludes(itemContent, newProcessedFiles);
                            });

                            return compiledHTML;
                        }

                        // 3. Trường hợp include đơn thông thường (không có data loop)
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