import { describe, it, expect } from "vitest";
import { loader as rootIndex } from "../app/routes/_index";
import { loader as appIndex } from "../app/routes/app._index";

const PARAMS = "shop=aswin-test-store.myshopify.com&host=YWJjMTIz&embedded=1&id_token=tok";

type Loader = (args: { request: Request; params: object; context: object }) => unknown;

const call = async (loader: Loader, url: string) => {
  try {
    const r = await loader({ request: new Request(url), params: {}, context: {} });
    return r as Response;
  } catch (e) {
    return e as Response; // _index throws its redirect
  }
};

describe("embedded entry preserves shop/host", () => {
  it("/ -> /app keeps params", async () => {
    const r = await call(rootIndex, `https://x.trycloudflare.com/?${PARAMS}`);
    expect(r.status).toBe(302);
    const loc = r.headers.get("location")!;
    expect(loc.startsWith("/app?")).toBe(true);
    expect(new URL(loc, "https://x").searchParams.get("shop")).toBe("aswin-test-store.myshopify.com");
    expect(new URL(loc, "https://x").searchParams.get("host")).toBe("YWJjMTIz");
  });

  it("/app -> /app/orders keeps params (the App Bridge bug)", async () => {
    const r = await call(appIndex, `https://x.trycloudflare.com/app?${PARAMS}`);
    expect(r.status).toBe(302);
    const loc = r.headers.get("location")!;
    expect(loc.startsWith("/app/orders?")).toBe(true);
    const sp = new URL(loc, "https://x").searchParams;
    expect(sp.get("shop")).toBe("aswin-test-store.myshopify.com");
    expect(sp.get("host")).toBe("YWJjMTIz");
  });

  it("/ without shop renders the landing page", async () => {
    const r = await call(rootIndex, "https://x.trycloudflare.com/");
    expect(r).toBeNull();
  });
});
