function showWindow(windowId) {
    const windows = document.querySelectorAll('.float-window');
    windows.forEach(window => {
        window.classList.remove('active');
    });
    document.getElementById(windowId).classList.add('active');
}

// 默认展示第一个模块
window.onload = () => {
    showWindow('intro');
};

