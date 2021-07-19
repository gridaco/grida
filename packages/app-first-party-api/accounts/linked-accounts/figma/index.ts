import Axios from "axios"

const restclient = Axios.create({
  baseURL: "https://accounts.grida.co/linked-accounts/figma"
});

export async function getPrimaryLinkedFigmaAccount () {
  return await restclient.get("/primary");
}

export async function getLinkedFigmaAccounts () {
    return await restclient.get("/");
}

export async function hasLinkedFigmaAccount () {
    try{

        const r = await getPrimaryLinkedFigmaAccount();
        if (r !== undefined) {
            return true;
        }
    }catch(_){}
    return false
}