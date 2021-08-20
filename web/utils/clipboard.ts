export const writeToClipboard = (text: string) => {
  const tempElement = document.createElement('input');
  tempElement.value = text;
  document.body.appendChild(tempElement);

  tempElement.select();
  document.execCommand('copy');
  document.body.removeChild(tempElement);
};
