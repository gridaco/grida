import Axios from "axios";

// FIXME: add constants in @based-sdk
const axios = Axios.create({
  baseURL: "https://accounts.services.grida.co",
  // baseURL: __HOSTS.G11N_SERVICE_HOST,
});

export async function getUserProfile() {
  try {
    const resp = await axios.get(`profile`);
    return resp.data;
  } catch (error) {
    console.log("Error Profile ", error);
    throw error;
  }
}
