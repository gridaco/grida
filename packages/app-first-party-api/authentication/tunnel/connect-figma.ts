import { _is_internal_dev, __internal_dev_hosts } from "../../internal-dev";

export function makeurl__connect_figma(): string {
  const _host = _is_internal_dev()
    ? // if internal dev mode, return localhost environment for calling account services
      __internal_dev_hosts.__INTERNAL_DEV_ACCOUNTS_WEB_HOST
    : "https://accounts.grida.co";
  const url = `${_host}/tunnel?command=connect-figma`;
  return url;
}
