import { validateLogoUpload, sanitizeSvg, MAX_LOGO_BYTES, MAX_LOGO_DIMENSION } from "@/lib/padel/logo";

/** PNG 1×1 transparente válido (IHDR width=1, height=1). */
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function pngBytesFromBase64(b64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

/** Construye bytes PNG con IHDR de dimensiones arbitrarias (CRC no validado). */
function makePngBytes(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(33));
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes[11] = 13; // chunk length = 13
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  bytes[16] = (width >> 24) & 0xff;
  bytes[17] = (width >> 16) & 0xff;
  bytes[18] = (width >> 8) & 0xff;
  bytes[19] = width & 0xff;
  bytes[20] = (height >> 24) & 0xff;
  bytes[21] = (height >> 16) & 0xff;
  bytes[22] = (height >> 8) & 0xff;
  bytes[23] = height & 0xff;
  bytes[24] = 8; // bit depth
  bytes[25] = 6; // color type RGBA
  return bytes;
}

describe("validateLogoUpload — MIME y tamaño", () => {
  it("rechaza MIME no permitido", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "logo.jpg", { type: "image/jpeg" });
    const result = await validateLogoUpload(file);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Formato no permitido/);
  });

  it("rechaza archivos > 2MB", async () => {
    const file = new File([new Uint8Array(MAX_LOGO_BYTES + 1)], "big.png", { type: "image/png" });
    const result = await validateLogoUpload(file);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/2MB/);
  });
});

describe("validateLogoUpload — PNG", () => {
  it("acepta PNG válido y devuelve data-URL image/png", async () => {
    const file = new File([pngBytesFromBase64(TINY_PNG_BASE64)], "logo.png", { type: "image/png" });
    const result = await validateLogoUpload(file);
    expect(result.valid).toBe(true);
    expect(result.dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("rechaza PNG sin firma real (MIME spoofed)", async () => {
    const file = new File([new TextEncoder().encode("no es un png")], "fake.png", { type: "image/png" });
    const result = await validateLogoUpload(file);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/PNG válido/);
  });

  it("rechaza PNG con dimensiones > 1024×1024", async () => {
    const file = new File([makePngBytes(2000, 2000)], "wide.png", { type: "image/png" });
    const result = await validateLogoUpload(file);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(new RegExp(`${MAX_LOGO_DIMENSION}×${MAX_LOGO_DIMENSION}`));
  });

  it("acepta PNG exactamente en el límite de dimensiones", async () => {
    const file = new File([makePngBytes(1024, 1024)], "limit.png", { type: "image/png" });
    const result = await validateLogoUpload(file);
    expect(result.valid).toBe(true);
  });
});

describe("validateLogoUpload — SVG", () => {
  it("acepta SVG limpio y devuelve data-URL image/svg+xml", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>';
    const file = new File([svg], "logo.svg", { type: "image/svg+xml" });
    const result = await validateLogoUpload(file);
    expect(result.valid).toBe(true);
    expect(result.dataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it("sanitiza script embebido en el SVG", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="10" height="10"/></svg>';
    const file = new File([svg], "evil.svg", { type: "image/svg+xml" });
    const result = await validateLogoUpload(file);
    expect(result.valid).toBe(true);
    expect(result.dataUrl).not.toContain("script");
    expect(result.dataUrl).not.toContain("alert");
  });

  it("rechaza SVG con dimensiones > 1024×1024", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="2000"><rect/></svg>';
    const file = new File([svg], "wide.svg", { type: "image/svg+xml" });
    const result = await validateLogoUpload(file);
    expect(result.valid).toBe(false);
  });
});

describe("sanitizeSvg", () => {
  it("elimina event handlers on*", () => {
    const out = sanitizeSvg('<svg onload="alert(1)"><rect onclick="x()"/></svg>');
    expect(out).not.toContain("onload");
    expect(out).not.toContain("onclick");
  });

  it("elimina javascript: en href y xlink:href", () => {
    const out = sanitizeSvg('<svg><a href="javascript:alert(1)">x</a><use xlink:href="javascript:x()"/></svg>');
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("xlink:href");
  });

  it("elimina foreignObject, style, iframe y tags animados", () => {
    const out = sanitizeSvg(
      '<svg><foreignObject><iframe src="https://evil.com"/></foreignObject><style>body{display:none}</style><animate attributeName="x" from="0" to="100"/></svg>'
    );
    expect(out).not.toContain("foreignObject");
    expect(out).not.toContain("iframe");
    expect(out).not.toContain("style");
    expect(out).not.toContain("animate");
  });

  it("preserva SVG legítimo", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#16a34a"/></svg>';
    const out = sanitizeSvg(svg);
    expect(out).toContain("<rect");
    expect(out).toContain("fill");
  });
});