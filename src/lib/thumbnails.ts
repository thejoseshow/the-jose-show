import Replicate from "replicate";

let _replicate: Replicate | null = null;
function getReplicate() {
  if (!_replicate) _replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
  return _replicate;
}

/**
 * Generate a YouTube thumbnail using Flux via Replicate.
 * Returns the image as a Buffer.
 */
export async function generateThumbnail(prompt: string): Promise<Buffer> {
  const replicate = getReplicate();

  const output = await replicate.run("black-forest-labs/flux-schnell", {
    input: {
      prompt: `YouTube thumbnail, ${prompt}, bold text overlay, high contrast, 16:9 aspect ratio, professional quality, eye-catching colors`,
      num_outputs: 1,
      aspect_ratio: "16:9",
      output_format: "png",
      output_quality: 90,
    },
  });

  // Replicate returns URLs or ReadableStream depending on the model
  const results = output as unknown[];
  if (!results || results.length === 0) {
    throw new Error("Flux returned no output");
  }

  const result = results[0];

  // Handle URL string response
  if (typeof result === "string") {
    const res = await fetch(result);
    return Buffer.from(await res.arrayBuffer());
  }

  // Handle ReadableStream response
  if (result instanceof ReadableStream) {
    const reader = result.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  }

  throw new Error(`Unexpected Flux output type: ${typeof result}`);
}
