function renderKatex() {
    renderMathInElement(document.body, {
        delimiters: [
            { left: "$", right: "$", display: true },
            { left: "$$", right: "$$", display: true },
            { left: "\\(", right: "\\)", display: false },
            { left: "\\[", right: "\\]", display: true }
        ]
    });
}
window.onload = renderKatex();