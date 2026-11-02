declare const JSZip: { loadAsync(file: Blob): Promise<{ file(name: string): { async(type: "string"): Promise<string>; _data?: { uncompressedSize?: number } } | null }> };
export default JSZip;
