import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};
const port = Number(process.env.PORT ?? 8080);

createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }
  const requestedPath = decodedPath === "/" ? "/index.html" : decodedPath;
  const file = resolve(root, `.${requestedPath}`);
  if (file !== root && !file.startsWith(`${root}${sep}`)) {
    response.writeHead(400).end("Bad request");
    return;
  }

  try {
    const info = await stat(file);
    if (!info.isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(file)] ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache",
    });
    createReadStream(file).pipe(response);
  } catch (error) {
    if (error?.code === "ENOENT") {
      response.writeHead(404).end("Not found");
      return;
    }
    console.error("Unable to serve request:", error);
    response.writeHead(500).end("Internal server error");
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`Patanjali Sutra Atlas listening on 0.0.0.0:${port}`);
});
