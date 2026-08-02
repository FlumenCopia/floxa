/**
 * Reusable client-side image compression helper for FLOXA uploads.
 * Resizes large JPEG/PNG/WebP images to max 1600px width/height and compresses JPEGs/WebPs at 0.82 quality.
 * Preserves transparency for PNGs, skips non-raster or small files (<500KB & <=1600px), and preserves file objects.
 */
export async function compressImageBeforeUpload(file) {
  if (!file || !(file instanceof File)) {
    return file;
  }

  const supportedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  const fileType = (file.type || "").toLowerCase();

  if (!supportedTypes.includes(fileType)) {
    return file;
  }

  const MAX_DIMENSION = 1600;
  const SIZE_THRESHOLD_BYTES = 500 * 1024; // 500 KB

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;

      if (!width || !height) {
        resolve(file);
        return;
      }

      const isOverMaxDimension = width > MAX_DIMENSION || height > MAX_DIMENSION;
      const isOverSizeThreshold = file.size > SIZE_THRESHOLD_BYTES;

      // If dimensions are within 1600px and file size is under 500 KB, keep original
      if (!isOverMaxDimension && !isOverSizeThreshold) {
        resolve(file);
        return;
      }

      let newWidth = width;
      let newHeight = height;

      if (isOverMaxDimension) {
        const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
        newWidth = Math.round(width * scale);
        newHeight = Math.round(height * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = newWidth;
      canvas.height = newHeight;

      const ctx = canvas.getContext("2d");

      if (!ctx) {
        resolve(file);
        return;
      }

      const isPng = fileType === "image/png";
      const outputType = isPng ? "image/png" : fileType === "image/webp" ? "image/webp" : "image/jpeg";
      const quality = isPng ? undefined : 0.82;

      if (outputType === "image/jpeg") {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, newWidth, newHeight);
      } else {
        ctx.clearRect(0, 0, newWidth, newHeight);
      }

      ctx.drawImage(img, 0, 0, newWidth, newHeight);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }

          // If compression resulted in a larger size, keep the original file
          if (blob.size >= file.size && !isOverMaxDimension) {
            resolve(file);
            return;
          }

          const compressedFile = new File([blob], file.name, {
            type: outputType,
            lastModified: Date.now(),
          });

          resolve(compressedFile);
        },
        outputType,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}
