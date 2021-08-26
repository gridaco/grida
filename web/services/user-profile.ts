import Axios from "axios";

const secure_axios = Axios.create({
  baseURL: "https://accounts.services.grida.co",
  withCredentials: true,
});

export async function getUserProfile() {
  try {
    const resp = await secure_axios.get(`profile`);
    return resp.data;
  } catch (error) {
    console.log("Error Profile ", error);
    throw error;
  }
}
