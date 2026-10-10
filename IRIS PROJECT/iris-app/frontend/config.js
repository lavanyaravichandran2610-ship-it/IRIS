/* Where the IRIS backend lives.
   - Website served by the backend itself (the normal setup): leave apiBase empty.
   - Website hosted somewhere else (Netlify, GitHub Pages): put the backend address here, for example
       window.IRIS_CONFIG = { apiBase: "https://iris-api.onrender.com" };
     and add the website's address to CORS_ORIGINS in the backend settings.
   - No backend at all: leave it empty. The site then runs as a demo and stores accounts in the browser only. */
window.IRIS_CONFIG = { apiBase: "" };
