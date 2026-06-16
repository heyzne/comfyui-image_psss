import os
import io
import urllib.request
import folder_paths
import torch


def _load_image_from_path(image_path):
    from PIL import Image
    import numpy as np
    img = Image.open(image_path)
    img = img.convert("RGB")
    return torch.from_numpy(np.array(img).astype(np.float32) / 255.0).unsqueeze(0)


def _load_image_from_url(url):
    from PIL import Image
    import numpy as np
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read()
    img = Image.open(io.BytesIO(data)).convert("RGB")
    return torch.from_numpy(np.array(img).astype(np.float32) / 255.0).unsqueeze(0)


def _empty():
    return torch.zeros((1, 1, 1, 3), dtype=torch.float32)


class MultiImageLoader:
    OUTPUT_COUNT = 5

    @classmethod
    def INPUT_TYPES(cls):
        inp = folder_paths.get_input_directory()
        files = sorted(f for f in os.listdir(inp) if os.path.isfile(os.path.join(inp, f)))
        opts = ["(none)"] + files
        required = {}
        for i in range(1, cls.OUTPUT_COUNT + 1):
            required[f"image_{i}"] = (opts, {"image_upload": True})
            required[f"url_{i}"] = ("STRING", {
                "default": "",
                "multiline": False,
                "placeholder": "or paste http(s):// URL here",
            })
        return {"required": required}

    RETURN_TYPES = tuple(["IMAGE"] * OUTPUT_COUNT)
    RETURN_NAMES = tuple([f"image_{i}" for i in range(1, OUTPUT_COUNT + 1)])
    FUNCTION = "load_images"
    CATEGORY = "image"

    def load_images(self, **kwargs):
        results = []
        for i in range(1, self.OUTPUT_COUNT + 1):
            # 优先使用 URL
            url = str(kwargs.get(f"url_{i}", "") or "").strip()
            fname = str(kwargs.get(f"image_{i}", "") or "").strip()

            val = None
            if url and url.startswith(("http://", "https://", "data:image")):
                try:
                    val = _load_image_from_url(url)
                except Exception as e:
                    print(f"[MultiImage] URL err {i}: {e}")
            elif fname and fname != "(none)" and fname.strip() != "":
                try:
                    p = folder_paths.get_annotated_filepath(fname)
                    val = _load_image_from_path(p)
                except Exception as e:
                    print(f"[MultiImage] File err {i}: {e}")

            results.append(val if val is not None else _empty())
        return tuple(results)

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True


class MultiImageLoaderEx(MultiImageLoader):
    OUTPUT_COUNT = 10

    @classmethod
    def INPUT_TYPES(cls):
        inp = folder_paths.get_input_directory()
        files = sorted(f for f in os.listdir(inp) if os.path.isfile(os.path.join(inp, f)))
        opts = ["(none)"] + files
        required = {}
        for i in range(1, cls.OUTPUT_COUNT + 1):
            required[f"image_{i}"] = (opts, {"image_upload": True})
            required[f"url_{i}"] = ("STRING", {"default": "", "multiline": False})
        return {"required": required}

    RETURN_TYPES = tuple(["IMAGE"] * OUTPUT_COUNT)
    RETURN_NAMES = tuple([f"image_{i}" for i in range(1, OUTPUT_COUNT + 1)])


NODE_CLASS_MAPPINGS = {
    "MultiImageLoader": MultiImageLoader,
    "MultiImageLoaderEx": MultiImageLoaderEx,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "MultiImageLoader": "Load Image (Multi Output)",
    "MultiImageLoaderEx": "Load Image (Multi 10)",
}
