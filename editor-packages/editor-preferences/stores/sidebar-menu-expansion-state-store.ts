const key = (route: string) => "sidebar-menu-expansion-state:" + route;

const expansioncache = {
  get: (route: string): boolean => {
    const value = localStorage.getItem(key(route));
    return value ? JSON.parse(value) : false;
  },
  set: (route: string, value: boolean) => {
    localStorage.setItem(key(route), JSON.stringify(value));
  },
};

export default expansioncache;
