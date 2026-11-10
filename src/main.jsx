import React from 'react';
import ReactDOM from 'react-dom/client';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';

function App() {
    return (
        <div>
            <Header />
            <main className="container">
                <h1>Nội dung đang dev với HMR cực mượt!</h1>
            </main>
            <Footer />
        </div>
    );
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);