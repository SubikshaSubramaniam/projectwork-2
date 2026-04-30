import axios from "axios";
export const API = axios.create({
  baseURL: "http://localhost:8000/ehr",
});
API.interceptors.request.use((config) => {
  const hospital = localStorage.getItem("hospital");
  if (hospital) {
    config.headers["hospital"] = hospital;
  }
  return config;
});