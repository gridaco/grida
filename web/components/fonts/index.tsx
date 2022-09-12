import FontFaceObserver from "fontfaceobserver";

const Fonts = () => {
  const link = document.createElement("link");
  link.href =
    "https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100;0,300;0,400;0,500;0,700;0,900;1,100;1,300;1,400;1,500;1,700;1,900&";
  link.rel = "stylesheet";

  document.head.appendChild(link);

  const fontFaceObserver = new FontFaceObserver("Roboto");

  fontFaceObserver.load().then(() => {
    document.documentElement.classList.add("fonts-loaded");
  });
};

export default Fonts;
