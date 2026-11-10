import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export function pluginHtmlInclude() {
    return {
        name: 'html-include-recursive-transform',

        configureServer(server) {
            server.watcher.on('change', (file) => {
                if (file.endsWith('.html') || file.endsWith('.js') || file.endsWith('.json')) {
                    server.ws.send({
                        type: 'full-reload',
                        path: '*'
                    });
                }
            });
        },

        transformIndexHtml(html) {
            const parseAttributes = (attrString) => {
                const attrs = {};
                // Regex này quét từng cặp `ten_thuoc_tinh="gia_tri"` hoặc `ten_thuoc_tinh='gia_tri'`
                // Nó nhận diện toàn bộ nội dung bên trong cặp dấu nháy cho đến tận dấu nháy đóng tương ứng cuối cùng
                const attrRegex = /([a-zA-Z0-9_-]+)\s*=\s*(["'])([\s\S]*?)\2/g;

                let match;
                while ((match = attrRegex.exec(attrString)) !== null) {
                    const key = match[1];
                    const value = match[3];
                    attrs[key] = value;
                }
                console.log(attrs);
                return attrs;
            };


            // Hàm helper dùng chung để render mảng dữ liệu vào nội dung template
            const renderArrayData = (targetContent, dataArray, newProcessedFiles, resolveIncludesFunc) => {
                let compiledHTML = '';
                dataArray.forEach((item) => {
                    let itemContent = targetContent;

                    // 1. Thay thế các biến đơn (title, subtitle, oldPrice, newPrice, themeClass...)
                    Object.keys(item).forEach((key) => {
                        if (!Array.isArray(item[key])) {
                            const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
                            itemContent = itemContent.replace(regex, item[key] || '');
                        }
                    });

                    // 2. Xử lý vòng lặp động: {{#each <tên_key>}} ... {{/each}}
                    // Regex này sẽ tự động bắt tên mảng (ví dụ: features, items, galleries...)
                    // const eachRegex = /\{\{foreach\s+([a-zA-Z0-9_-]+)\}\}([\s\S]*?)\{\{\s*endforeach\s*\}\}/g;
                    const eachRegex = /\{\{\s*(?:#each|foreach)\s+([a-zA-Z0-9_-]+)\s*\}\}([\s\S]*?)\{\{\s*(?:\/each|endforeach)\s*\}\}/g;
                    itemContent = itemContent.replace(eachRegex, (match, arrayKey, templateRow) => {
                        const subArray = item[arrayKey];
                        if (Array.isArray(subArray)) {
                            return subArray.map(subItem => {
                                // Nếu phần tử trong mảng là object (ví dụ: {name: '...', link: '...'})
                                if (typeof subItem === 'object' && subItem !== null) {
                                    let rowContent = templateRow;
                                    Object.keys(subItem).forEach(subKey => {
                                        const subRegex = new RegExp(`{{\\s*${subKey}\\s*}}`, 'g');
                                        rowContent = rowContent.replace(subRegex, subItem[subKey] || '');
                                    });
                                    return rowContent;
                                }
                                // Nếu phần tử là chuỗi đơn thuần (dạng mảng string như features cũ)
                                else {
                                    return templateRow.replace(/{{\s*this\s*}}/, subItem);
                                }
                            }).join('');
                        }
                        return '';
                    });

                    // Đệ quy tiếp cho từng item card
                    compiledHTML += resolveIncludesFunc(itemContent, newProcessedFiles);
                });
                return compiledHTML;
            };

            const resolveIncludes = (currentHtml, processedFiles = new Set()) => {
                const includeRegex = /<include\s+([^>]*)\s*(?:\/>|>([\s\S]*?)<\/include>)/g;

                return currentHtml.replace(includeRegex, (match, attrsStr, innerContent) => {
                    try {
                        // Sử dụng hàm parseAttributes để bóc tách toàn bộ thuộc tính gọn gàng
                        const attrs = parseAttributes(attrsStr);
                        const srcPath = attrs.src;

                        if (!srcPath) return match;

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
                            const slotRegex = /{{\s*slot\s*}}/g;
                            targetContent = targetContent.replace(slotRegex, innerContent);
                        }

                        const newProcessedFiles = new Set(processedFiles);
                        newProcessedFiles.add(absolutePath);

                        // --- 1. XỬ LÝ QUA data-file (Đọc từ file JavaScript) ---
                        if (attrs['data-file']) {
                            const filePath = path.resolve(process.cwd(), '.' + attrs['data-file']);
                            if (fs.existsSync(filePath)) {
                                delete require.cache[require.resolve(filePath)];
                                const importedData = require(filePath);

                                // Lấy mảng bên trong (hoặc tự động tìm mảng đầu tiên nằm trong object export)
                                let dataArray = importedData.default || importedData;
                                if (!Array.isArray(dataArray) && typeof dataArray === 'object') {
                                    // Tự động bóc key đầu tiên chứa mảng (ví dụ: pricingList)
                                    const firstKey = Object.keys(dataArray)[0];
                                    if (firstKey) {
                                        dataArray = dataArray[firstKey];
                                    }
                                }

                                // console.log("Dữ liệu sau khi trích xuất mảng:", dataArray);

                                if (Array.isArray(dataArray)) {
                                    return renderArrayData(targetContent, dataArray, newProcessedFiles, resolveIncludes);
                                }
                            }
                        }

                        // --- 2. XỬ LÝ QUA data-json (Đọc từ file JSON rời) ---
                        if (attrs['data-json']) {
                            const filePath = path.resolve(process.cwd(), '.' + attrs['data-json']);
                            if (fs.existsSync(filePath)) {
                                const rawJson = fs.readFileSync(filePath, 'utf-8');
                                const dataArray = JSON.parse(rawJson);

                                if (Array.isArray(dataArray)) {
                                    return renderArrayData(targetContent, dataArray, newProcessedFiles, resolveIncludes);
                                }
                            }
                        }

                        // --- 3. XỬ LÝ QUA data='[...]' (Inline JSON như code cũ của bạn) ---
                        // --- XỬ LÝ QUA DATA TRỰC TIẾP (Hỗ trợ cả JSON chuẩn lẫn Object nháy đơn kiểu JS) ---
                        if (attrs.data) {
                            try {
                                let rawDataStr = attrs.data.replace(/&quot;/g, '"');
                                let dataArray = null;

                                try {
                                    // Thử parse theo chuẩn JSON thông thường trước
                                    dataArray = JSON.parse(rawDataStr);
                                } catch (jsonErr) {
                                    // Nếu lỗi (do dùng nháy đơn hoặc thiếu nháy ở key), 
                                    // ta dùng mẹo chuyển đổi object kiểu JS sang JSON chuẩn:
                                    // 1. Chuyển đổi nháy đơn thành nháy kép
                                    // 2. Tự động thêm nháy kép cho các key chưa được bọc
                                    let fixedStr = rawDataStr
                                        .replace(/'/g, '"') // Đổi tất cả nháy đơn thành nháy kép
                                        .replace(/([{,]\s*)([a-zA-Z0-9_-]+)\s*:/g, '$1"$2":'); // Bọc nháy cho key nếu quên

                                    dataArray = JSON.parse(fixedStr);
                                }

                                if (Array.isArray(dataArray)) {
                                    return renderArrayData(targetContent, dataArray, newProcessedFiles, resolveIncludes);
                                }
                            } catch (e) {
                                console.error(`[html-include] Lỗi phân tích thuộc tính data:`, e.message);
                            }
                        }

                        // --- 4. TRƯỜNG HỢP INCLUDE ĐƠN THÔNG THƯỜNG ---
                        return resolveIncludes(targetContent, newProcessedFiles);

                    } catch (error) {
                        console.error(`[html-include] Lỗi xử lý thẻ include:`, error);
                        return match;
                    }
                });
            };

            return resolveIncludes(html);
        }
    };
}