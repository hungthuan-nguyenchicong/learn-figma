import fs from 'fs';
import path from 'path';

export function pluginHtmlInclude() {
    return {
        name: 'html-include-recursive-transform',

        transformIndexHtml(html) {
            const resolveIncludes = (currentHtml, processFiles = new Set()) => {

                // 1. Xử lý thẻ tự đóng: <include src="..." />
                const includeRegex = /<include\s+([^>]*?)\s*\/>/g;
                let contentHtml = currentHtml.replace(includeRegex, (match, attrStr) => {
                    const attrs = _parseAttributes(attrStr);
                    return _processInclude(attrs, null, processFiles, resolveIncludes);
                });

                // 2. Xử lý thẻ có nội dung slot: <include src="...">...</include>
                const includeSlotRegex = /<include\s+([^>]*?)\s*>([\s\S]*?)<\/include>/g;
                contentHtml = contentHtml.replace(includeSlotRegex, (match, attrStr, innerContent) => {
                    const attrs = _parseAttributes(attrStr);
                    return _processInclude(attrs, innerContent, processFiles, resolveIncludes);
                });

                return contentHtml;
            };

            return resolveIncludes(html);
        }
    }
}

function _parseAttributes(attrString) {
    const attrs = {};
    const attrRegex = /([a-zA-Z0_-]+)\s*=\s*(["'])([\s\S]*?)\2/g;
    let match;
    while ((match = attrRegex.exec(attrString)) !== null) {
        const key = match[1];
        const value = match[3];
        attrs[key] = value;
    }
    return attrs;
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

/**
 * 💡 HÀM HELPER: Thay thế các biến thuộc tính ({{ key }}) vào trong nội dung HTML
 * Giúp tái sử dụng ở cả file con lẫn phần slot mà không bị lặp code.
 */
function _replaceAttributes(content, attrs) {
    if (!content) return '';
    let updatedContent = content;

    for (const [key, value] of Object.entries(attrs)) {
        if (key === 'src') continue;
        const attrVarRegex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
        updatedContent = updatedContent.replace(attrVarRegex, value);
    }

    return updatedContent;
}

/**
 * HÀM XỬ LÝ CHUNG
 */
function _processInclude(arrAttrs, innerContent, processedFiles, resolveIncludesFn) {
    if (!arrAttrs.src) return '';

    const srcPath = arrAttrs.src;
    const absolutePath = path.resolve(process.cwd(), '.' + srcPath);

    // 1. Đọc nội dung file con
    let targetContent = _targetContent(srcPath, absolutePath, processedFiles);

    if (targetContent.startsWith('<!-- [Error]')) {
        return targetContent;
    }

    // Áp dụng thay thế thuộc tính cho file con (VD: {{ className }}, {{ title }} trong file con)
    targetContent = _replaceAttributes(targetContent, arrAttrs);

    const newProcessedFiles = new Set(processedFiles);
    newProcessedFiles.add(absolutePath);

    // 2. Xử lý Slot (Nếu có)
    if (innerContent !== undefined && innerContent !== null && innerContent.trim() !== '') {
        const slotRegex = /{{\s*slot\s*}}/gi;

        // 💡 Áp dụng thay thế thuộc tính cho CHÍNH NỘI DUNG SLOT 
        // (Giúp bên trong slot truyền vào cũng xài được các thuộc tính như className, title,...)
        let processedInnerContent = _replaceAttributes(innerContent, arrAttrs);

        // Đệ quy để xử lý các thẻ <include> ẩn bên trong slot
        processedInnerContent = resolveIncludesFn(processedInnerContent, newProcessedFiles);

        // Bơm vào vị trí {{ slot }} của file con
        targetContent = targetContent.replace(slotRegex, processedInnerContent);
    } else {
        targetContent = targetContent.replace(/{{\s*slot\s*}}/gi, '');
    }

    // 3. Đệ quy quét tiếp các thẻ include bên trong file con
    return resolveIncludesFn(targetContent, newProcessedFiles);
}