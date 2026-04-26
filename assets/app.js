(function () {
  const fileInput = document.getElementById("fileInput");
  const dropZone = document.getElementById("dropZone");
  const targetKbInput = document.getElementById("targetKb");
  const widthInput = document.getElementById("widthInput");
  const heightInput = document.getElementById("heightInput");
  const compressBtn = document.getElementById("compressBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const statusEl = document.getElementById("status");

  const beforePreview = document.getElementById("beforePreview");
  const afterPreview = document.getElementById("afterPreview");
  const beforeInfo = document.getElementById("beforeInfo");
  const afterInfo = document.getElementById("afterInfo");

  const presets = document.querySelectorAll(".preset-btn");
  const quickActionButtons = document.querySelectorAll(".quick-actions button");

  let selectedFile = null;
  let compressedBlobUrl = "";

  const defaultKb = Number(document.body.dataset.defaultKb || "0");
  if (defaultKb > 0 && !targetKbInput.value) {
    targetKbInput.value = String(defaultKb);
  }

  function humanSize(bytes) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  function clearPreview(container, text) {
    container.innerHTML = "";
    container.textContent = text;
  }

  function setImagePreview(container, url, altText) {
    container.innerHTML = "";
    const img = document.createElement("img");
    img.src = url;
    img.alt = altText;
    container.appendChild(img);
  }

  function readImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function canvasToBlob(canvas, quality) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
    });
  }

  async function compressToApproxSize(img, targetBytes, requestedWidth, requestedHeight) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const originalW = img.naturalWidth || img.width;
    const originalH = img.naturalHeight || img.height;

    let outW = requestedWidth || 0;
    let outH = requestedHeight || 0;

    if (!outW && !outH) {
      outW = originalW;
      outH = originalH;
    } else if (outW && !outH) {
      outH = Math.round((originalH / originalW) * outW);
    } else if (!outW && outH) {
      outW = Math.round((originalW / originalH) * outH);
    }

    outW = Math.max(1, outW);
    outH = Math.max(1, outH);

    let bestBlob = null;
    let bestDiff = Number.POSITIVE_INFINITY;
    let bestW = outW;
    let bestH = outH;

    let currentW = outW;
    let currentH = outH;

    for (let scaleRound = 0; scaleRound < 8; scaleRound += 1) {
      canvas.width = currentW;
      canvas.height = currentH;
      ctx.clearRect(0, 0, currentW, currentH);
      ctx.drawImage(img, 0, 0, currentW, currentH);

      for (let q = 0.92; q >= 0.06; q -= 0.04) {
        const blob = await canvasToBlob(canvas, q);
        if (!blob) {
          continue;
        }

        const diff = Math.abs(blob.size - targetBytes);
        if (diff < bestDiff) {
          bestBlob = blob;
          bestDiff = diff;
          bestW = currentW;
          bestH = currentH;
        }

        if (blob.size <= targetBytes && blob.size >= targetBytes * 0.85) {
          return { blob, width: currentW, height: currentH };
        }
      }

      currentW = Math.max(80, Math.round(currentW * 0.9));
      currentH = Math.max(80, Math.round(currentH * 0.9));
    }

    return { blob: bestBlob, width: bestW, height: bestH };
  }

  function assignFile(file) {
    if (!file) {
      return;
    }

    if (!/^image\/(jpeg|png)$/i.test(file.type)) {
      statusEl.textContent = "Please upload only JPG or PNG images.";
      return;
    }

    selectedFile = file;
    statusEl.textContent = "Image selected. Set target KB and click Compress Image.";
    beforeInfo.textContent = `Type: ${file.type.replace("image/", "").toUpperCase()} | Size Before: ${humanSize(file.size)}`;

    const fileUrl = URL.createObjectURL(file);
    setImagePreview(beforePreview, fileUrl, "Original image preview");
    clearPreview(afterPreview, "Compressed image preview");
    afterInfo.textContent = "After compression, file size and preview appear here";

    downloadBtn.style.display = "none";
    downloadBtn.removeAttribute("href");
  }

  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    assignFile(file);
  });

  if (dropZone) {
    dropZone.addEventListener("click", () => fileInput.click());

    ["dragenter", "dragover"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        dropZone.classList.add("dragover");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        dropZone.classList.remove("dragover");
      });
    });

    dropZone.addEventListener("drop", (event) => {
      const droppedFile = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      assignFile(droppedFile);
    });
  }

  presets.forEach((btn) => {
    btn.addEventListener("click", () => {
      targetKbInput.value = btn.dataset.kb;
    });
  });

  quickActionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const size = button.getAttribute("data-size");
      const input = document.querySelector("#targetKb") || document.querySelector("#targetSize");
      if (input) {
        input.value = size;
        input.focus();
      }
    });
  });

  compressBtn.addEventListener("click", async () => {
    if (!selectedFile) {
      statusEl.textContent = "Upload or drop an image first.";
      return;
    }

    const targetKb = Number(targetKbInput.value);
    if (!targetKb || targetKb <= 0) {
      statusEl.textContent = "Enter a valid target size in KB.";
      return;
    }

    const requestedWidth = Number(widthInput.value) || 0;
    const requestedHeight = Number(heightInput.value) || 0;
    const targetBytes = targetKb * 1024;

    statusEl.textContent = "Compressing in browser using Canvas API...";
    compressBtn.disabled = true;

    try {
      const img = await readImage(selectedFile);
      const result = await compressToApproxSize(img, targetBytes, requestedWidth, requestedHeight);

      if (!result.blob) {
        statusEl.textContent = "Compression failed for this file. Try another image.";
        return;
      }

      if (compressedBlobUrl) {
        URL.revokeObjectURL(compressedBlobUrl);
      }

      compressedBlobUrl = URL.createObjectURL(result.blob);
      setImagePreview(afterPreview, compressedBlobUrl, "Compressed image preview");
      afterInfo.textContent = `Size After: ${humanSize(result.blob.size)} | Dimensions: ${result.width} x ${result.height}`;

      downloadBtn.href = compressedBlobUrl;
      downloadBtn.style.display = "inline-flex";

      const reduced = ((1 - result.blob.size / selectedFile.size) * 100).toFixed(1);
      statusEl.textContent = `Done. Reduced by ${reduced}% with target near ${targetKb}KB.`;
    } catch (error) {
      statusEl.textContent = "Something went wrong while compressing the image.";
    } finally {
      compressBtn.disabled = false;
    }
  });
})();
