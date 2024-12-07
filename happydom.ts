import { GlobalRegistrator } from "@happy-dom/global-registrator";

// workaround for a bug with bun + happy-dom: https://github.com/oven-sh/bun/issues/8774
import HTTP, { request as HTTPRequest } from "node:http";
import HTTPS, { request as HTTPSRequest } from "node:https";

type RequestParams = Parameters<typeof HTTPRequest>;

HTTP.request = (...args: unknown[]) => {
  return Object.assign(HTTPRequest(...(args as RequestParams)), {
    end() {},
  });
};

HTTPS.request = (...args: unknown[]) => {
  return Object.assign(HTTPSRequest(...(args as RequestParams)), {
    end() {},
  });
};
// end workaround

GlobalRegistrator.register();
