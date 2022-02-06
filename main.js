// A simple proof-of-concept Deno HTTP server that parallelises requests for JavaScript modules.

// This is achieved by resolving the module graph for each requested resource
// using Deno graph (https://github.com/denoland/deno_graph).
// The result is converted into a `link` header (https://developer.mozilla.org/en-US/docs/Web/HTML/Link_types/modulepreload).

// For example, if 'a.js' imports 'b.js' and 'b.js' imports 'c.js' (and so on..),
// a request for 'a.js' will yield the following `link` header:
// <http://domain/b.js>; rel="modulepreload", <http://domain/c.js>; rel="modulepreload", <http://domain/d.js>; rel="modulepreload"
// In turn, the requests for module a's dependencies are made together.

// A potential optimisation can be made by caching the result of `createGraph`.

import { createGraph } from "https://deno.land/x/deno_graph@0.22.0/mod.ts";
import { Application } from "https://deno.land/x/oak@v10.2.0/mod.ts";
import { extname } from "https://deno.land/std@0.123.0/path/mod.ts";

const STATIC_ROOT = `${Deno.cwd()}/packages`;

const app = new Application();

app.use(async (context, next) => {
  if (context.request.method === "GET") {
    context.response.headers.set("access-control-allow-origin", "*");

    try {
      await context.send({ root: STATIC_ROOT });
    } catch {
      return next();
    }

    const url = context.request.url;

    if (extname(url.pathname) === ".js") {
      const packagePathUri = `file://${STATIC_ROOT}`;
      const graph = await createGraph(`${packagePathUri}${url.pathname}`);

      const { modules } = graph.toJSON();
      const response = [];

      for (const { specifier } of modules) {
        const path = specifier.replace(packagePathUri, "");
        if (path !== url.pathname) {
          response.push(`<${url.origin}${path}>; rel="modulepreload"`);
        }
      }

      if (response.length > 0) {
        context.response.headers.set("link", response.join(", "));
      }
    }
  }
});

app.listen({ port: 8000 });
