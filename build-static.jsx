import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
// import Header from './Header.jsx';
import fs from 'fs';
import path from 'path';

// Import các React component của bạn bình thường
import Header from './src/components/Header.jsx';
import Footer from './src/components/Footer.jsx';

// Định nghĩa một layout tổng hợp bằng JSX
function HtmlTemplate({ title, children }) {
    return (
        <html lang="vi">
            <head>
                <meta charSet="UTF-8" />
                <title>{title}</title>
                {/* Nhúng file CSS đã được Vite biên dịch */}
                <link rel="stylesheet" href="/assets/css/main.css" />
            </head>
            <body>
                <Header />
                <div className="main-content">
                    {children}
                </div>
                <Footer />
            </body>
        </html>
    );
}

// Hàm thực thi render ra file HTML tĩnh
function build() {
    const htmlContent = '<!DOCTYPE html>\n' + renderToStaticMarkup(
        <HtmlTemplate title="Trang chủ tích hợp Backend">
            <h1>Nội dung này viết bằng React Component nhưng xuất ra HTML thuần!</h1>
        </HtmlTemplate>
    );

    // Xuất thẳng file html vào thư mục dist hoặc thẳng vào thư mục views của backend (ví dụ Laravel resources/views)
    const outputPath = path.resolve(process.cwd(), 'dist/index.html');
    fs.writeFileSync(outputPath, htmlContent);
    console.log(' Đã build thành công file HTML thuần từ React!');
}

build();