import { describe, it, expect } from "vitest";
import { classifyFile } from "./fileKind";

describe("classifyFile", () => {
  // Each row: [mime, filename, expectedKind, expectedLabel]
  const cases: Array<[string, string, string, string]> = [
    // video
    ["video/mp4", "a.mp4", "video", "MP4"],
    ["video/webm", "a.webm", "video", "WEBM"],
    ["video/quicktime", "clip.mov", "video", "MOV"],
    ["application/octet-stream", "weird.mkv", "video", "MKV"],
    // audio
    ["audio/mpeg", "song.mp3", "audio", "MP3"],
    ["audio/flac", "song.flac", "audio", "FLAC"],
    ["application/octet-stream", "song.opus", "audio", "OPUS"],
    // image
    ["image/png", "pic.png", "image", "PNG"],
    ["image/jpeg", "pic.jpg", "image", "JPG"],
    ["image/jpeg", "pic.jpeg", "image", "JPEG"],
    ["image/gif", "pic.gif", "image", "GIF"],
    ["image/heic", "pic.heic", "image", "HEIC"],
    ["image/svg+xml", "logo.svg", "image", "SVG"],
    // document
    ["application/pdf", "doc.pdf", "document", "PDF"],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "doc.docx", "document", "DOCX"],
    ["text/plain", "notes.txt", "document", "TXT"],
    ["text/markdown", "README.md", "document", "MD"],
    ["application/epub+zip", "book.epub", "document", "EPUB"],
    // code
    ["text/javascript", "app.js", "code", "JS"],
    ["application/octet-stream", "app.ts", "code", "TS"],
    ["text/x-python", "main.py", "code", "PY"],
    ["application/octet-stream", "main.rs", "code", "RS"],
    ["text/html", "page.html", "code", "HTML"],
    ["application/octet-stream", "style.css", "code", "CSS"],
    ["application/octet-stream", "deploy.sh", "code", "SH"],
    ["application/octet-stream", "config.yaml", "code", "YAML"],
    // archive
    ["application/zip", "bundle.zip", "archive", "ZIP"],
    ["application/x-7z-compressed", "bundle.7z", "archive", "7Z"],
    ["application/gzip", "bundle.tar.gz", "archive", "GZ"],
    ["application/x-rar-compressed", "bundle.rar", "archive", "RAR"],
    // executable
    ["application/x-msdownload", "install.exe", "executable", "EXE"],
    ["application/vnd.microsoft.portable-executable", "install.exe", "executable", "EXE"],
    ["application/octet-stream", "install.msi", "executable", "MSI"],
    ["application/vnd.android.package-archive", "app.apk", "executable", "APK"],
    ["application/octet-stream", "package.deb", "executable", "DEB"],
    // disk-image
    ["application/x-iso9660-image", "ubuntu.iso", "disk-image", "ISO"],
    ["application/octet-stream", "ubuntu.iso", "disk-image", "ISO"],
    ["application/x-apple-diskimage", "app.dmg", "disk-image", "DMG"],
    ["application/octet-stream", "disk.img", "disk-image", "IMG"],
    // font
    ["font/ttf", "Inter.ttf", "font", "TTF"],
    ["application/octet-stream", "Inter.woff2", "font", "WOFF2"],
    ["application/octet-stream", "Inter.otf", "font", "OTF"],
    // data
    ["application/json", "data.json", "data", "JSON"],
    ["text/csv", "data.csv", "data", "CSV"],
    ["application/xml", "data.xml", "data", "XML"],
    ["application/octet-stream", "log.ndjson", "data", "NDJSON"],
    // other / fallbacks
    ["application/octet-stream", "binary", "other", "BIN"],
    ["application/octet-stream", "", "other", "FILE"],
    ["application/x-weird-thing", "noext", "other", "WEIRD"],
    ["APPLICATION/X-WEIRD-THING", "NOEXT", "other", "WEIRD"],
  ];

  it.each(cases)("classifies %s / %s → %s (%s)", (mime, filename, expectedKind, expectedLabel) => {
    const { kind, label } = classifyFile(mime, filename);
    expect(kind).toBe(expectedKind);
    expect(label).toBe(expectedLabel);
  });

  it("label is always uppercase ASCII", () => {
    const { label } = classifyFile("video/mp4", "A.MP4");
    expect(label).toBe("MP4");
  });

  it("label never exceeds 5 chars when derived from MIME (no extension)", () => {
    const { label } = classifyFile("application/x-really-long-subtype", "nameless");
    expect(label.length).toBeLessThanOrEqual(5);
  });

  it("extension on filename wins over MIME when they disagree", () => {
    // MIME says video but extension says zip — trust extension
    const { kind, label } = classifyFile("video/mp4", "oops.zip");
    expect(kind).toBe("archive");
    expect(label).toBe("ZIP");
  });
});
