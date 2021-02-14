const buttonNav = document.getElementsByClassName("file-navigation-options");
const fileHeaders = document.getElementsByClassName("file-header d-flex flex-md-items-center flex-items-start");

const DEFAULT_BG_COLOR = "#fafbfc";
const DEFAULT_TEXT_COLOR = "#24292e";
const DEFAULT_OPEN_IN_NEW_PAGE_CONFIG = true;

const KEY_BUTTON_BG_STYLE = "styles.button.bg-color";
const KEY_BUTTON_TEXT_STYLE = "styles.button.text-color";
const KEY_CONFIG_OPEN_IN_NEW_PAGE = "config.open-in-new-page";

const GIST_BUTTON_NAV_AVAILABLE = buttonNav[0] != null;

if (GIST_BUTTON_NAV_AVAILABLE) {
    // Load saved options
    chrome.storage.sync.get([KEY_BUTTON_BG_STYLE, KEY_BUTTON_TEXT_STYLE, KEY_CONFIG_OPEN_IN_NEW_PAGE], function(obj) {
        let backgroundColor = DEFAULT_BG_COLOR;
        let textColor = DEFAULT_TEXT_COLOR;
        let openInNewPage = DEFAULT_OPEN_IN_NEW_PAGE_CONFIG;
        try {
            // use custom options if only available
            if (obj.backgroundColor) { backgroundColor = obj.backgroundColor; }
            if (obj.textColor) { textColor = obj.textColor; }
            if (obj.openInNewPage) { openInNewPage = obj.openInNewPage; }
        } catch (_) {}


        // Create the gist.github.surf button
        let btn = document.createElement("a");
        btn.innerHTML = "🏄‍♂️ &nbsp Surf";
        btn.classList = "btn ml-2 d-none d-md-block";
        btn.href = window.location.href.replace("https://gist.github.com/", "https://gist.github.surf/");

        // use customized options
        if (openInNewPage) {
            btn.target = "_blank";
        }
        if (backgroundColor.startsWith("#")) {
            backgroundColor = `#${backgroundColor}`;
        }
        if (textColor.startsWith("#")) {
            textColor = `#${textColor}`;
        }
        btn.style.backgroundColor = backgroundColor;
        btn.style.color = textColor;

        // insert the button in the github button group navigation
        buttonNav[0].appendChild(btn);

    });
}

const GIST_BUTTON_HEADER_AVAILBLE = fileHeaders[0] != null;

if (GIST_BUTTON_HEADER_AVAILBLE) {

    chrome.storage.sync.get([KEY_BUTTON_BG_STYLE, KEY_BUTTON_TEXT_STYLE, KEY_CONFIG_OPEN_IN_NEW_PAGE], function(obj) {
        let backgroundColor = DEFAULT_BG_COLOR;
        let textColor = DEFAULT_TEXT_COLOR;
        let openInNewPage = DEFAULT_OPEN_IN_NEW_PAGE_CONFIG;
        try {
            // use custom options if only available
            if (obj.backgroundColor) { backgroundColor = obj.backgroundColor; }
            if (obj.textColor) { textColor = obj.textColor; }
            if (obj.openInNewPage) { openInNewPage = obj.openInNewPage; }
        } catch (_) {}




        // insert the button in the github button group navigation
        // Create the gist.github.surf button
        for (let idx = 0; idx < fileHeaders.length; idx++) {
            let buttonWrapper = document.createElement("div");
            buttonWrapper.className = "file-actions flex-order-2 pt-0 ml-2";

            let btn = document.createElement("a");
            btn.innerHTML = "🏄‍♂️ &nbsp Run";
            btn.classList = "btn btn-sm";
            btn.href = window.location.href.replace("https://gist.github.com/", "https://gist.github.surf/");

            // use customized options
            if (openInNewPage) {
                btn.target = "_blank";
            }
            if (backgroundColor.startsWith("#")) {
                backgroundColor = `#${backgroundColor}`;
            }
            if (textColor.startsWith("#")) {
                textColor = `#${textColor}`;
            }
            btn.style.backgroundColor = backgroundColor;
            btn.style.color = textColor;

            buttonWrapper.appendChild(btn);

            fileHeaders[idx].appendChild(buttonWrapper);
        }

    });
}