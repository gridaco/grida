export function debounce<T extends Function>(
  func: T,
  wait: number = 50,
  immediate?: boolean
) {
  var timeout;
  return function () {
    // @ts-ignore
    var context = this,
      args = arguments;
    var later = function () {
      if (!immediate) func.apply(context, args);
    };
    var callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
}
