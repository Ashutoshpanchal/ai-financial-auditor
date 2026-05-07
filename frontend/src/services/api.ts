/// <reference types="vite/client" />
import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:8000",
  withCredentials: true, // send httpOnly cookie with every request
});

// Redirect to login on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && window.location.pathname !== "/") {
      window.location.href = "/";
    }
    return Promise.reject(err);
  }
);
