document.addEventListener('DOMContentLoaded', () => {
    console.log(1);
    const btn = document.getElementById('test');
    if (btn) {
        btn.addEventListener('click', () => {
            console.log(2);
        });
    }
});