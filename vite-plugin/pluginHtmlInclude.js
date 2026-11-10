import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

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
        async transformIndexHtml(html) {
            const resolveIncludes = async (currentHtml, processFiles = new Set()) => {

                // 1. Xử lý thẻ tự đóng: <include src="..." />
                const includeRegex = /<include\s+([^>]*?)\s*\/>/g;
                currentHtml = await replaceAsync(currentHtml, includeRegex, async (match, attrStr) => {
                    const attrs = await _parseAttributes(attrStr);
                    return await _processInclude(attrs, null, processFiles, resolveIncludes);
                });

                // 2. Xử lý thẻ có nội dung slot: <include src="...">...</include>
                const includeSlotRegex = /<include\s+([^>]*?)\s*>([\s\S]*?)<\/include>/g;
                currentHtml = await replaceAsync(currentHtml, includeSlotRegex, async (match, attrStr, innerContent) => {
                    const attrs = await _parseAttributes(attrStr);
                    return await _processInclude(attrs, innerContent, processFiles, resolveIncludes);
                });

                return currentHtml;
            };

            return await resolveIncludes(html);
        }
    }
}

async function replaceAsync(str, regex, asyncFn) {
    const promises = [];
    str.replace(regex, (match, ...args) => {
        promises.push(asyncFn(match, ...args));
        return match;
    });
    const results = await Promise.all(promises);
    return str.replace(regex, () => results.shift());
}

async function _parseAttributes(attrString) {
    const attrs = {};
    const attrRegex = /([a-zA-Z0-9_-]+)\s*=\s*(["'])([\s\S]*?)\2/g;
    let match;
    const matches = [];

    while ((match = attrRegex.exec(attrString)) !== null) {
        matches.push({ key: match[1], value: match[3] });
    }

    for (const m of matches) {
        const { key, value } = m;

        if (key === 'data') {
            const dataObj = _parseDataObject(value);
            Object.assign(attrs, dataObj);
        }
        else if (key === 'data-json') {
            try {
                let jsonObj;
                if (value.trim().startsWith('{') || value.trim().startsWith('[')) {
                    jsonObj = JSON.parse(value);
                } else {
                    const jsonPath = path.resolve(process.cwd(), '.' + value);
                    if (fs.existsSync(jsonPath)) {
                        jsonObj = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
                    }
                }
                if (jsonObj) {
                    if (Array.isArray(jsonObj)) {
                        attrs.items = jsonObj;
                    } else {
                        Object.assign(attrs, jsonObj);
                    }
                }
            } catch (e) {
                console.warn(`[html-include] Lỗi parse data-json:`, e);
            }
        }
        else if (key === 'data-file') {
            try {
                const filePath = path.resolve(process.cwd(), '.' + value);
                if (fs.existsSync(filePath)) {
                    if (filePath.endsWith('.json')) {
                        const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                        if (Array.isArray(fileData)) {
                            attrs.items = fileData;
                        } else {
                            Object.assign(attrs, fileData);
                        }
                    } else {
                        const fileUrl = pathToFileURL(filePath).href;
                        const mod = await import(fileUrl + `?t=${Date.now()}`);
                        const fileData = mod.default?.default || mod.default || mod.module?.exports || mod;
                        if (Array.isArray(fileData)) {
                            attrs.items = fileData;
                        } else {
                            Object.assign(attrs, fileData);
                        }
                    }
                }
            } catch (e) {
                console.error(`[html-include] Lỗi đọc file data-file ${value}:`, e);
            }
        }
        else {
            attrs[key] = value;
        }
    }
    return attrs;
}

function _parseDataObject(dataStr) {
    const result = {};
    if (!dataStr) return result;
    const pairs = dataStr.split(';');
    for (const pair of pairs) {
        const parts = pair.split(':');
        if (parts.length >= 2) {
            const k = parts[0].trim();
            const v = parts.slice(1).join(':').trim();
            if (k) result[k] = v;
        }
    }
    return result;
}

function _targetContent(srcPath, absolutePath, processedFiles) {
    if (!fs.existsSync(absolutePath)) {
        console.warn(`[html-include] Không tìm thấy file: ${absolutePath}`);
        return `<!-- [Error]: Không tìm thấy file ${srcPath} -->`;
    }
    if (processedFiles.has(absolutePath)) {
        console.warn(`[html-include] Phát hiện include vòng lặp: ${absolutePath}`);
        return `<!-- [Error]: Circular include detected for ${srcPath} -->`;
    }
    return fs.readFileSync(absolutePath, 'utf-8');
}

function _replaceAttributes(content, attrs) {
    if (!content) return '';
    let updatedContent = content;
    for (const [key, value] of Object.entries(attrs)) {
        if (key === 'src' || typeof value === 'object') continue;
        const attrVarRegex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
        updatedContent = updatedContent.replace(attrVarRegex, value);
    }
    return updatedContent;
}
/**
 * 💡 Hàm kiểm tra giá trị truthy an toàn (hỗ trợ cả chuỗi "true", boolean true, số khác 0)
 */
function _isTruthy(val) {
    if (val === undefined || val === null) return false;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') {
        const lower = val.trim().toLowerCase();
        if (lower === 'false' || lower === '0' || lower === '') return false;
        if (lower === 'true') return true;
    }
    return Boolean(val);
}

/**
 * 💡 TÍNH NĂNG MỚI: Xử lý điều kiện hiển thị {{#if variable}} ... {{endif}}
 */
function _processConditionals(content, scopeData) {
    if (!content) return '';

    const ifRegex = /{{\s*#if\s+([a-zA-Z0-9_-]+)\s*}}([\s\S]*?){{\s*endif\s*}}/gi;

    return content.replace(ifRegex, (match, propName, blockContent) => {
        const val = scopeData[propName];
        const isTrue = _isTruthy(val);

        // 🔍 DEBUG 2: Kiểm tra xem điều kiện có nhận đúng biến không
        // console.log(`[DEBUG IF] Biến kiểm tra: "${propName}" | Giá trị thực tế:`, val, `| Kiểu dữ liệu:`, typeof val, `| Kết quả isTruthy:`, isTrue);

        if (isTrue) {
            return _processConditionals(blockContent, scopeData);
        }
        return '';
    });
}

function _processForeach(content, scopeData) {
    if (!content) return '';

    const foreachRegex = /{{\s*foreach\s+([a-zA-Z0-9_-]+)\s*}}([\s\S]*?){{\s*endforeach\s*}}/gi;

    let previousContent;
    do {
        previousContent = content;
        content = content.replace(foreachRegex, (match, propName, template) => {
            let targetData = scopeData[propName];
            if (!targetData) return '';

            let entries = [];
            if (Array.isArray(targetData)) {
                entries = targetData.map((item, index) => ({ key: index, value: item }));
            } else if (typeof targetData === 'object' && targetData !== null) {
                entries = Object.entries(targetData).map(([k, v]) => ({ key: k, value: v }));
            } else {
                return '';
            }

            return entries.map(({ key, value }) => {
                let itemHtml = template;

                itemHtml = itemHtml.replace(/{{\s*key\s*}}/gi, key !== undefined ? key : '');

                if (typeof value === 'object' && value !== null) {
                    for (const [subK, subV] of Object.entries(value)) {
                        const propRegex = new RegExp(`{{\\s*${subK}\\s*}}`, 'gi');
                        itemHtml = itemHtml.replace(propRegex, subV !== undefined ? subV : '');
                    }
                    itemHtml = itemHtml.replace(/{{\s*(?:value|this)\s*}}/gi, JSON.stringify(value));
                } else {
                    const cleanVal = value !== undefined ? String(value) : '';
                    itemHtml = itemHtml.replace(/{{\s*(?:value|this)\s*}}/gi, cleanVal);
                }

                const childScope = { ...scopeData, key, value };
                if (typeof value === 'object' && value !== null) {
                    Object.assign(childScope, value);
                }

                // Hỗ trợ cả điều kiện bên trong vòng lặp
                itemHtml = _processConditionals(itemHtml, childScope);
                itemHtml = _processForeach(itemHtml, childScope);

                return itemHtml;
            }).join('');
        });
    } while (content !== previousContent);

    return content;
}

async function _processInclude(arrAttrs, innerContent, processedFiles, resolveIncludesFn) {
    if (!arrAttrs.src) return '';

    const srcPath = arrAttrs.src;
    const absolutePath = path.resolve(process.cwd(), '.' + srcPath);

    let targetContent = _targetContent(srcPath, absolutePath, processedFiles);

    if (targetContent.startsWith('<!-- [Error]')) {
        return targetContent;
    }

    // 🔍 DEBUG 1: Xem toàn bộ các thuộc tính (attrs) đã được parse thành công từ data-json hay chưa
    // console.log(`[DEBUG INCLUDE] Đang xử lý file: ${srcPath}`, "với các attrs:", arrAttrs);

    // 💡 THỨ TỰ CHUẨN: Thay thế biến trước -> Rồi mới check điều kiện và vòng lặp
    targetContent = _replaceAttributes(targetContent, arrAttrs);
    targetContent = _processConditionals(targetContent, arrAttrs);
    targetContent = _processForeach(targetContent, arrAttrs);

    const newProcessedFiles = new Set(processedFiles);
    newProcessedFiles.add(absolutePath);

    if (innerContent !== undefined && innerContent !== null && innerContent.trim() !== '') {
        const slotRegex = /{{\s*slot\s*}}/gi;

        let processedInnerContent = _replaceAttributes(innerContent, arrAttrs);
        processedInnerContent = _processConditionals(processedInnerContent, arrAttrs);
        processedInnerContent = _processForeach(processedInnerContent, arrAttrs);
        processedInnerContent = await resolveIncludesFn(processedInnerContent, newProcessedFiles);

        targetContent = targetContent.replace(slotRegex, processedInnerContent);
    } else {
        targetContent = targetContent.replace(/{{\s*slot\s*}}/gi, '');
    }

    return await resolveIncludesFn(targetContent, newProcessedFiles);
}