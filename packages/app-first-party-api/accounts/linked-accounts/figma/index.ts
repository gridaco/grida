import Axios from "axios";

const _host =
  process.env.NODE_ENV === "development"
    ? "http://localhost:9002"
    : "https://accounts.grida.co";

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
