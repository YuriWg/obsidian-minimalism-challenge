document.addEventListener('DOMContentLoaded', async () => {
    // 加载源代码文件
    const loadSourceCode = async (file) => {
        const response = await fetch(`dist/${file}`);
        return await response.text();
    };

    // 切换代码标签
    const tabs = document.querySelectorAll('.tab-btn');
    const codeDisplay = document.getElementById('codeDisplay');

    tabs.forEach(tab => {
        tab.addEventListener('click', async () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const file = tab.dataset.file === 'main' ? 'main.js' : 'manifest.json';
            const code = await loadSourceCode(file);
            codeDisplay.textContent = code;
        });
    });

    // 初始加载 main.js
    const mainCode = await loadSourceCode('main.js');
    codeDisplay.textContent = mainCode;
});