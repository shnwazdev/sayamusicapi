import { describe, expect, it, vi } from "vitest";
import app from "../src/index";
import { endpointCount, endpoints } from "../src/endpoints";
import { applyLimit, requestedLimit } from "../src/http";

describe("SayaMusicAPI", () => {
  it("publishes more than 300 endpoints", () => {
    expect(endpointCount).toBeGreaterThanOrEqual(300);
    expect(endpoints.length).toBe(endpointCount);
  });

  it("responds to health checks", async () => {
    const response = await app.request("/health");
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.data.endpointCount).toBe(endpointCount);
  });

  it("does not add a default API-side limit", () => {
    const withoutLimit = {
      req: {
        query: () => undefined
      }
    };
    const withLimit = {
      req: {
        query: (key: string) => (key === "limit" ? "9999" : undefined)
      }
    };
    const url = new URL("https://example.com/search");

    expect(requestedLimit(withoutLimit as any)).toBeUndefined();
    applyLimit(withoutLimit as any, url);
    expect(url.searchParams.has("limit")).toBe(false);
    expect(requestedLimit(withLimit as any)).toBe("9999");
    applyLimit(withLimit as any, url);
    expect(url.searchParams.get("limit")).toBe("9999");
  });

  it("builds Audius v1 URLs and does not add default paging", async () => {
    const originalFetch = globalThis.fetch;
    const seenUrls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      seenUrls.push(input instanceof URL ? input.toString() : input.toString());
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }) as any;

    try {
      await app.request("/v1/audius/search/tracks?q=believer");
      await app.request("/v1/audius/search/tracks?q=believer&limit=9999");
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(seenUrls[0]).toBe("https://api.audius.co/v1/tracks/search?query=believer");
    expect(seenUrls[1]).toBe(
      "https://api.audius.co/v1/tracks/search?query=believer&limit=9999"
    );
  });

  it("serves the landing page and docs page", async () => {
    const landing = await app.request("/");
    expect(landing.status).toBe(200);
    expect(landing.headers.get("content-type")).toContain("text/html");
    const landingHtml = await landing.text();
    expect(landingHtml).toContain("SayaMusicAPI");
    expect(landingHtml).not.toContain("Try a search");
    expect(landingHtml).not.toContain("header-motion");
    expect(landingHtml).toContain('<a href="/docs">Docs</a>');
    expect(landingHtml).not.toContain('<a href="/docs#quickstart">Quickstart</a>');
    expect(landingHtml).not.toContain('<a href="/docs#examples">Examples</a>');
    expect(landingHtml).not.toContain('<a href="/docs#deploy">Deploy</a>');
    expect(landingHtml).not.toContain('<a class="button primary" href="/docs">Open docs</a>');
    expect(landingHtml).not.toContain('<a class="button" href="/docs#deploy">Cloudflare deploy</a>');
    expect(landingHtml).not.toContain("hero-chips");
    expect(landingHtml).not.toContain("Deezer tracks");
    expect(landingHtml).not.toContain("Radio streams");

    const docs = await app.request("/docs");
    expect(docs.status).toBe(200);
    const docsHtml = await docs.text();
    expect(docsHtml).toContain("Scalar.createApiReference");
    expect(docsHtml).toContain('"layout": "modern"');
    expect(docsHtml).toContain('"darkMode": false');
    expect(docsHtml).toContain('"theme": "default"');
    expect(docsHtml).toContain('"url": "/swagger"');
    expect(docsHtml).toContain("https://cdn.jsdelivr.net/npm/@scalar/api-reference");
    expect(docsHtml).not.toContain("AUDIUS_API_KEY");
    expect(docsHtml).not.toContain("wrangler secret put");
    expect(docsHtml).not.toContain("route-flow");
    expect(docsHtml).not.toContain("providerRail");
    expect(docsHtml).not.toContain('class="docs-tab-board"');
    expect(docsHtml).not.toContain('class="doc-tab-card"');
    expect(docsHtml).not.toContain('class="doc-tabs"');

    const css = await app.request("/site.css");
    const cssText = await css.text();
    expect(cssText).not.toMatch(/glow|box-shadow|drop-shadow|text-shadow|filter:/i);
    expect(cssText).toContain("@keyframes");
    expect(cssText).toContain(".docs-page *");
    expect(cssText).not.toContain(".doc-tabs");
    expect(cssText).not.toContain(".provider-tab:nth-child");
  });

  it("serves the endpoint registry", async () => {
    const response = await app.request("/v1/endpoints");
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.count).toBe(endpointCount);
    expect(body.data.some((item: any) => item.path === "/v1/apple/search/songs")).toBe(true);
    expect(body.data.some((item: any) => item.path === "/swagger")).toBe(true);
    expect(body.data.some((item: any) => item.path === "/v1/jiosaavn/search/songs")).toBe(true);
    expect(body.data.some((item: any) => item.path === "/v1/gaana/search/songs")).toBe(true);
    expect(body.data.some((item: any) => item.path === "/v1/deezer/search/tracks")).toBe(true);
    expect(body.data.some((item: any) => item.path === "/v1/openverse/search/audio")).toBe(true);
  });

  it("validates required search query params", async () => {
    const response = await app.request("/v1/apple/search/songs");
    expect(response.status).toBe(400);
    const body = (await response.json()) as any;
    expect(body.ok).toBe(false);
    expect(body.error.message).toContain("Missing required query parameter");
  });

  it("serves alive and diagnostics routes", async () => {
    const alive = await app.request("/alive");
    expect(alive.status).toBe(200);
    const aliveBody = (await alive.json()) as any;
    expect(aliveBody.data.endpointCount).toBe(endpointCount);

    const diagnostics = await app.request("/v1/diagnostics/routes");
    expect(diagnostics.status).toBe(200);
    const diagnosticsBody = (await diagnostics.json()) as any;
    expect(diagnosticsBody.data.endpointCount).toBe(endpointCount);
    expect(diagnosticsBody.data.providers.deezer).toBeGreaterThan(0);
  });

  it("keeps unknown paths alive with endpoint suggestions", async () => {
    const response = await app.request("/v1/not-real");
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.error).toBeUndefined();
    expect(body.data.endpointAlive).toBe(true);
    expect(body.data.routeMatched).toBe(false);
    expect(body.data.endpointCount).toBe(endpointCount);
    expect(body.data.endpoints).toBe("/v1/endpoints");
    expect(body.data.message).not.toContain("not in the documented route registry");
  });

  it("keeps external file and image routes alive as JSON by default", async () => {
    const routes = [
      "/v1/cover-art/release/59211ea4-ffd2-4ad9-9a4e-941d3148024a/front",
      "/v1/cover-art/release/59211ea4-ffd2-4ad9-9a4e-941d3148024a/back",
      "/v1/cover-art/release/59211ea4-ffd2-4ad9-9a4e-941d3148024a/file/cover.jpg",
      "/v1/cover-art/release-group/59211ea4-ffd2-4ad9-9a4e-941d3148024a/front",
      "/v1/cover-art/release-group/59211ea4-ffd2-4ad9-9a4e-941d3148024a/front/250",
      "/v1/archive/items/opensource_audio/file/opensource_audio_meta.xml"
    ];

    for (const route of routes) {
      const response = await app.request(route);
      expect(response.status).toBe(200);
      const body = (await response.json()) as any;
      expect(body.ok).toBe(true);
      expect(body.data.endpointAlive).toBe(true);
      expect(body.data.redirect).toContain("redirect=true");
    }
  });

  it("routes new providers instead of falling through to 404", async () => {
    const smokePaths = [
      "/v1/jiosaavn/search/songs",
      "/v1/jiosavan/search/songs",
      "/v1/gaana/search/songs",
      "/v1/deezer/search/tracks",
      "/v1/openverse/search/audio",
      "/v1/wikidata/search/items",
      "/v1/listenbrainz/metadata/lookup",
      "/v1/odesli/links",
      "/v1/web/deezer/search/tracks",
      "/v1/web/jiosaavn/search/tracks",
      "/v1/web/gaana/search/tracks",
      "/v1/web/spotify/search/tracks"
    ];

    for (const path of smokePaths) {
      const response = await app.request(path);
      expect(response.status).not.toBe(404);
    }
  });

  it("resolves Odesli smart links freely without paid API key", async () => {
    const response = await app.request(
      "/v1/odesli/links?url=https%3A%2F%2Fopen.spotify.com%2Ftrack%2F4cOdK2wGLETKBW3PvgPWqT"
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.data.source).toBe("odesli");
    expect(body.data.freeAndUnlimited).toBe(true);
    expect(body.data.songlinkUrl).toContain("https://song.link/");
    expect(body.data.linksByPlatform.spotify.url).toContain("spotify.com");
    expect(body.data.linksByPlatform.appleMusic.url).toContain("apple.com");
    expect(body.data.linksByPlatform.youtubeMusic.url).toContain("youtube.com");
  });

  it("handles ListenBrainz metadata lookup with free MusicBrainz fallback", async () => {
    const response = await app.request(
      "/v1/listenbrainz/metadata/lookup?recording_name=believer"
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.data.source).toBe("listenbrainz");
    expect(body.data.freeAndUnlimited).toBe(true);
    expect(Array.isArray(body.data.recordings)).toBe(true);
    expect(body.data.recordings.length).toBeGreaterThan(0);
  });

  it("handles ListenBrainz artist popularity with free MusicBrainz browse fallback", async () => {
    const response = await app.request(
      "/v1/listenbrainz/popularity/a74b1b7f-71a5-4011-9441-d0b5e4122711/recordings"
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.data.source).toBe("listenbrainz");
    expect(body.data.freeAndUnlimited).toBe(true);
  });

  it("resolves provider URL freely via /v1/resolve", async () => {
    const response = await app.request(
      "/v1/resolve?url=https%3A%2F%2Fopen.spotify.com%2Ftrack%2F4cOdK2wGLETKBW3PvgPWqT"
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.data.freeAndUnlimited).toBe(true);
    expect(body.data.songlinkUrl).toBeDefined();
  });

  it("supports id alias for identifier in archive media stream", async () => {
    const response = await app.request(
      "/v1/media/stream?source=archive&id=opensource_audio"
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.data.identifier).toBe("opensource_audio");
  });
});
