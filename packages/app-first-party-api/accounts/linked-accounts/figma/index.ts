import Axios from "axios";
import { _is_internal_dev, __internal_dev_hosts } from "../../../internal-dev";

const _host = _is_internal_dev()
  ? //// if internal dev mode, return localhost environment for calling account services
    __internal_dev_hosts.__INTERNAL_DEV_ACCOUNTS_SERVICES_HOST
  : "https://accounts.services.grida.co";

const restclient = Axios.create({
  baseURL: `${_host}/linked-accounts/figma`,
  withCredentials: true, // authentication using secure cookie
});

export async function getPrimaryLinkedFigmaAccount() {
  return (await restclient.get("/primary")).data;
}

export async function getLinkedFigmaAccounts() {
  return (await restclient.get("/")).data;
}

export async function hasLinkedFigmaAccount() {
  try {
    const r = await getPrimaryLinkedFigmaAccount();
    if (r !== undefined) {
      return true;
    }
  } catch (_) {}
  return false;
}
