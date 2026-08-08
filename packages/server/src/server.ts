import { createApp } from "./app.js";

const port = 3000;
// Loopback-only per architecture.md §11.2 — never expose to other hosts.
const host = "127.0.0.1";

createApp().listen(port, host, () => {
  console.log(`Server listening on http://${host}:${port}`);
});
