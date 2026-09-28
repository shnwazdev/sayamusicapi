import type { ApiContext } from "../http";
import { applyLimit, encodedPath, fetchJson, page, requiredParam, requiredQuery, yes } from "../http";

const ARCHIVE_BASE = "https://archive.org";

const fields = [
  "identifier",
  "title",
  "creator",
  "date",
  "year",
  "mediatype",
  "collection",
  "downloads",
  "licenseurl",
  "publicdate",
  "description",
  "format"
];

const playableFormats = [
  "VBR MP3",
  "MP3",
  "Ogg Vorbis",
  "Flac",
  "MPEG4",
  "h.264",
  "512Kb MPEG4"
];

function archiveIdentifier(c: ApiContext) {
  const identifier =
    c.req.param("identifier") ||
    c.req.query("identifier") ||
    c.req.query("id") ||
    c.req.param("id");
  if (!identifier) {
    return requiredParam(c, "identifier");
  }
  return identifier;
}

export async function archiveAdvanced(c: ApiContext, query?: string) {
  const url = new URL("/advancedsearch.php", ARCHIVE_BASE);
  url.searchParams.set("q", query || requiredQuery(c));
  applyLimit(c, url, "rows");
  url.searchParams.set("page", `${page(c)}`);
  url.searchParams.set("output", "json");
  url.searchParams.set("sort[]", c.req.query("sort") || "downloads desc");
  for (const field of fields) {
    url.searchParams.append("fl[]", field);
  }
  return fetchJson(c, url, { cf: { cacheTtl: 3600, cacheEverything: true } });
}

export async function archiveSearch(c: ApiContext, mode: "audio" | "music" | "live") {
  const q = c.req.query("q")?.trim();
  const term = q ? `(${q}) AND ` : "";
  const filters = {
    audio: "mediatype:audio",
    music: "mediatype:audio AND (collection:opensource_audio OR collection:audio_music)",
    live: "mediatype:audio AND (collection:etree OR collection:Live_Music_Archive)"
  };
  return archiveAdvanced(c, `${term}${filters[mode]}`);
}

export async function archiveMetadata(c: ApiContext, identifier = archiveIdentifier(c)) {
  const url = new URL(`/metadata/${encodedPath(identifier)}`, ARCHIVE_BASE);
  return fetchJson(c, url, { cf: { cacheTtl: 3600, cacheEverything: true } });
}

export function archiveFileUrl(identifier: string, file: string) {
  return new URL(`/download/${encodedPath(identifier)}/${encodedPath(file)}`, ARCHIVE_BASE);
}

export async function archiveFiles(c: ApiContext) {
  const data = await archiveMetadata(c);
  const files = getArchiveFiles(data);
  return files.map((file) => ({
    ...file,
    url: archiveFileUrl(archiveIdentifier(c), file.name).toString()
  }));
}

export async function archivePlayable(c: ApiContext) {
  const identifier = archiveIdentifier(c);
  const data = await archiveMetadata(c, identifier);
  const requested = c.req.query("file");
  const files = getArchiveFiles(data);
  const selected =
    (requested && files.find((file) => file.name === requested)) ||
    files.find((file) => playableFormats.includes(file.format || "")) ||
    files.find((file) => /\.(mp3|m4a|ogg|flac|mp4)$/i.test(file.name));

  if (!selected) {
    return {
      identifier,
      streamUrl: null,
      message: "No playable file was found in this Internet Archive item."
    };
  }

  const url = archiveFileUrl(identifier, selected.name).toString();
  return {
    identifier,
    file: selected.name,
    format: selected.format,
    size: selected.size,
    streamUrl: url,
    downloadUrl: url,
    licenseUrl: getArchiveLicense(data),
    canRedirect: yes(c, "redirect")
  };
}

export function getArchiveFiles(data: unknown): Array<Record<string, any>> {
  if (
    data &&
    typeof data === "object" &&
    "files" in data &&
    Array.isArray((data as { files: unknown }).files)
  ) {
    return (data as { files: Array<Record<string, any>> }).files.filter((file) => file.name);
  }
  return [];
}

function getArchiveLicense(data: unknown) {
  if (data && typeof data === "object" && "metadata" in data) {
    const metadata = (data as { metadata: Record<string, unknown> }).metadata;
    return metadata.licenseurl || metadata.rights || null;
  }
  return null;
}
